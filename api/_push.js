// Shared helpers for push notifications (files starting with _ are not routes on Vercel).
// Environment variables (Vercel -> Project -> Settings -> Environment Variables):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)
//   WEBHOOK_SECRET (for /api/notify), CRON_SECRET (optional, for /api/remind)
//   FCM_SERVICE_ACCOUNT (optional: the Firebase service-account JSON, for the Android app)
const crypto = require("crypto");
const webpush = require("web-push");

function cfg(){
  const e = process.env;
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"].filter(k => !e[k]);
  if (missing.length) throw Object.assign(new Error("Missing environment variables: " + missing.join(", ")), { status: 503 });
  webpush.setVapidDetails(e.VAPID_SUBJECT || "mailto:admin@example.com", e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
  return { url: e.SUPABASE_URL.replace(/\/$/, ""), service: e.SUPABASE_SERVICE_ROLE_KEY, anon: e.SUPABASE_ANON_KEY || "" };
}

// Supabase REST as the server (bypasses row-level security; never expose this key to the browser).
async function db(path, opts = {}){
  const c = cfg();
  const r = await fetch(`${c.url}/rest/v1/${path}`, {
    method: opts.method || "GET",
    headers: { apikey: c.service, authorization: `Bearer ${c.service}`, "content-type": "application/json", ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!r.ok) throw Object.assign(new Error(`Supabase ${r.status}`), { status: 502 });
  return r.status === 204 ? null : r.json();
}

async function names(){
  const rows = await db("profiles?select=id,display_name");
  return Object.fromEntries((rows || []).map(p => [p.id, p.display_name || ""]));
}

// Android app devices get pushes through Firebase Cloud Messaging (HTTP v1).
let fcmAuth = null;
function fcmAccount(){
  try { return JSON.parse(process.env.FCM_SERVICE_ACCOUNT || "null"); } catch (e){ return null; }
}
async function fcmAccessToken(acc){
  if (fcmAuth && fcmAuth.exp > Date.now() + 60000) return fcmAuth.token;
  const now = Math.floor(Date.now() / 1000), part = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = part({ alg: "RS256", typ: "JWT" }) + "." + part({ iss: acc.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const assertion = unsigned + "." + crypto.createSign("RSA-SHA256").update(unsigned).sign(acc.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  if (!r.ok) throw new Error(`FCM auth ${r.status}`);
  const j = await r.json();
  fcmAuth = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return fcmAuth.token;
}
async function sendFcm(token, payload){
  const acc = fcmAccount();
  if (!acc) throw new Error("FCM_SERVICE_ACCOUNT is not set");
  const data = { url: String(payload.url || "/"), tag: String(payload.tag || "fde"), always: payload.always ? "1" : "", title: payload.title || "FDE Quest", body: payload.body || "" };
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await fcmAccessToken(acc)}`, "content-type": "application/json" },
    body: JSON.stringify({ message: {
      token,
      notification: { title: data.title, body: data.body },
      data,
      android: { priority: "high", ttl: "21600s", notification: { tag: data.tag, color: "#E3A400", icon: "ic_stat_notify", channel_id: "fde" } }
    } })
  });
  // 404 UNREGISTERED: the app was uninstalled or the token rotated.
  if (!r.ok) throw Object.assign(new Error(`FCM ${r.status}`), { statusCode: r.status });
}

// Send one payload to every saved device of the given users. Expired devices are removed.
async function pushTo(userIds, payload){
  if (!userIds.length) return 0;
  const subs = await db(`push_subs?select=endpoint,sub,user_id&user_id=in.(${userIds.map(encodeURIComponent).join(",")})`);
  let sent = 0;
  await Promise.all((subs || []).map(async s => {
    try {
      if (s.sub && s.sub.fcm) await sendFcm(s.sub.fcm, payload);
      else await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 60 * 60 * 6 });
      sent++;
    }
    catch (err){
      if (err && (err.statusCode === 404 || err.statusCode === 410)){
        await db(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" }).catch(() => {});
      }
    }
  }));
  return sent;
}

// Who is this browser user? Verifies their Supabase session token.
async function userFromToken(auth){
  const c = cfg();
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${c.url}/auth/v1/user`, { headers: { apikey: c.anon || c.service, authorization: auth } });
  if (!r.ok) return null;
  return r.json();
}

function readBody(req){
  let b = req.body || {};
  if (typeof b === "string"){ try { b = JSON.parse(b); } catch (e){ b = {}; } }
  return b;
}

module.exports = { cfg, db, names, pushTo, userFromToken, readBody, webpush };
