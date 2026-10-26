// Sends a test notification to the signed-in person's own devices.
const { userFromToken, pushTo } = require("./_push");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const user = await userFromToken(req.headers.authorization || "");
    if (!user || !user.id) return res.status(401).json({ error: "Sign in first" });
    const sent = await pushTo([user.id], { title: "FDE Quest", body: "Notifications are working. See you in the arena ⚔", tag: "test", url: "/#us", always: true });
    return res.status(200).json({ sent });
  } catch (e){
    return res.status(e.status || 500).json({ error: e.message });
  }
};
