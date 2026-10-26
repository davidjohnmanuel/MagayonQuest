const crypto = require("node:crypto");

function issueInvite(email, key){
  const payload = Buffer.from(JSON.stringify({ email, expiresAt: Date.now() + 86400000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readInvite(token, key){
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac("sha256", key).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const invite = JSON.parse(Buffer.from(payload, "base64url").toString());
    return invite.email && invite.expiresAt > Date.now() ? invite : null;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { SIGNUP_CODE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Account creation is not configured" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const baseUrl = SUPABASE_URL.replace(/\/$/, "");
  if (body.action === "authorize") {
    if (!SIGNUP_CODE) return res.status(503).json({ error: "Account creation is not configured" });
    const code = Buffer.from(String(body.code || "").trim());
    const expected = Buffer.from(SIGNUP_CODE);
    if (code.length !== expected.length || !crypto.timingSafeEqual(code, expected)) {
      return res.status(403).json({ error: "That access code is incorrect." });
    }
    const email = String(body.email || "").trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    return res.status(200).json({ inviteToken: issueInvite(email, SUPABASE_SERVICE_ROLE_KEY) });
  }

  if (body.action !== "complete") return res.status(400).json({ error: "Invalid signup action" });
  const invite = readInvite(body.inviteToken, SUPABASE_SERVICE_ROLE_KEY);
  if (!invite) return res.status(403).json({ error: "The signup invitation expired. Enter the access code again." });
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in to finish account setup." });

  try {
    const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: auth }
    });
    if (!userResponse.ok) return res.status(401).json({ error: "Your session expired. Sign in again." });
    const user = await userResponse.json();
    if (!(user.email_confirmed_at || user.confirmed_at)) {
      return res.status(403).json({ error: "Confirm your email before joining the study list." });
    }
    if (String(user.email || "").toLowerCase() !== invite.email) {
      return res.status(403).json({ error: "This invitation belongs to a different email address." });
    }

    const response = await fetch(`${baseUrl}/rest/v1/members?on_conflict=email`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({ email: invite.email })
    });
    if (!response.ok) return res.status(502).json({ error: "Could not finish account setup. Try again." });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: "Could not reach the account service. Try again." });
  }
};