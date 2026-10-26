// Shared helpers for push notifications (files starting with _ are not routes on Vercel).
// Environment variables (Vercel -> Project -> Settings -> Environment Variables):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)
//   WEBHOOK_SECRET (for /api/notify), CRON_SECRET (optional, for /api/remind)
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

// Send one payload to every saved device of the given users. Expired devices are removed.
async function pushTo(userIds, payload){
  if (!userIds.length) return 0;
  const subs = await db(`push_subs?select=endpoint,sub,user_id&user_id=in.(${userIds.map(encodeURIComponent).join(",")})`);
  let sent = 0;
  await Promise.all((subs || []).map(async s => {
    try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 60 * 60 * 6 }); sent++; }
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
