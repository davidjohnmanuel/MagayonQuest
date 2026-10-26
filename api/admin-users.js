function bodyOf(req){
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; }
}

async function adminContext(req){
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_EMAILS) return { error: 503, message: "Admin settings are not configured" };
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return { error: 401, message: "Sign in first" };
  const baseUrl = SUPABASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization }
  });
  if (!response.ok) return { error: 401, message: "Your session expired. Sign in again." };
  const user = await response.json();
  if (!(user.email_confirmed_at || user.confirmed_at)) return { error: 403, message: "Confirm your email first" };
  const admins = ADMIN_EMAILS.split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !admins.includes(user.email.toLowerCase())) return { error: 403, message: "Admin access required" };
  return { baseUrl, key: SUPABASE_SERVICE_ROLE_KEY, user, admins };
}

async function api(context, path, options = {}){
  return fetch(`${context.baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: context.key,
      authorization: `Bearer ${context.key}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function authUsers(context){
  const users = [];
  for (let page = 1; page <= 50; page++){
    const response = await api(context, `/auth/v1/admin/users?page=${page}&per_page=100`);
    if (!response.ok) throw new Error("Could not load Supabase users");
    const result = await response.json();
    const rows = result.users || [];
    users.push(...rows);
    if (rows.length < 100) break;
  }
  return users;
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Use GET or POST" });
  try {
    const context = await adminContext(req);
    if (context.error) return res.status(context.error).json({ error: context.message });
    const membersResponse = await api(context, "/rest/v1/members?select=email");
    if (!membersResponse.ok) return res.status(502).json({ error: "Could not load the study list" });
    const members = await membersResponse.json();

    if (req.method === "GET"){
      const users = await authUsers(context);
      const byEmail = new Map(users.filter(user => user.email).map(user => [user.email.toLowerCase(), user]));
      const emails = new Set();
      const result = members.map(member => {
        const email = String(member.email).toLowerCase();
        emails.add(email);
        const user = byEmail.get(email);
        return { email, isMember: true, hasAccount: !!user, confirmed: !!(user && user.email_confirmed_at), createdAt: user && user.created_at };
      });
      users.forEach(user => {
        const email = String(user.email || "").toLowerCase();
        if (!email || emails.has(email)) return;
        result.push({ email, isMember: false, hasAccount: true, confirmed: !!user.email_confirmed_at, createdAt: user.created_at });
      });
      return res.status(200).json({ users: result.sort((a, b) => a.email.localeCompare(b.email)) });
    }

    const body = bodyOf(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
    if (context.admins.includes(email)) return res.status(400).json({ error: "Admin accounts cannot be managed here" });
    const userList = await authUsers(context);
    const target = userList.find(user => String(user.email || "").toLowerCase() === email);
    const memberPath = `/rest/v1/members?email=eq.${encodeURIComponent(email)}`;

    if (body.action === "add"){
      const response = await api(context, "/rest/v1/members?on_conflict=email", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ email })
      });
      if (!response.ok) return res.status(502).json({ error: "Could not grant study-list access" });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "remove"){
      const response = await api(context, memberPath, { method: "DELETE" });
      if (!response.ok) return res.status(502).json({ error: "Could not remove study-list access" });
      if (target) await api(context, `/rest/v1/push_subs?user_id=eq.${encodeURIComponent(target.id)}`, { method: "DELETE" });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "delete"){
      if (target){
        const response = await api(context, `/auth/v1/admin/users/${encodeURIComponent(target.id)}`, { method: "DELETE" });
        if (!response.ok) return res.status(502).json({ error: "Could not delete the Supabase account" });
      }
      const response = await api(context, memberPath, { method: "DELETE" });
      if (!response.ok) return res.status(502).json({ error: "The account was deleted, but study-list access could not be removed" });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown admin action" });
  } catch (e){
    return res.status(502).json({ error: "Could not reach Supabase admin services" });
  }
};