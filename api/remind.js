// Daily reminder (Vercel Cron, 8pm Manila): nudges anyone who hasn't checked in today.
const { db, names, pushTo } = require("./_push");

function manilaDay(offsetDays){
  const d = new Date(Date.now() + 8 * 3600e3 - (offsetDays || 0) * 864e5);
  return d.toISOString().slice(0, 10);
}
function reminderFor(me, partner, partnerName){
  const log = (me.data && me.data.log) || [], today = manilaDay(0);
  if (log.includes(today)) return null;
  const last = log[log.length - 1];
  const quiet = last ? Math.round((Date.parse(today) - Date.parse(last)) / 864e5) : null;
  const partnerIn = partner && (partner.data && partner.data.log || []).includes(today);
  if (quiet !== null && quiet >= 3) return { title: "Coffee pact alert ☕", body: `${quiet} days quiet. Log a few minutes before you owe ${partnerName} a coffee.`, tag: "remind", url: "/#today" };
  if (partnerIn) return { title: `${partnerName} already checked in today`, body: "Don't break the co-op streak. Even 15 minutes counts ♡", tag: "remind", url: "/#today" };
  return { title: "Your daily quests are waiting", body: "Log a few minutes of training to keep your combo alive.", tag: "remind", url: "/#today" };
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
  try {
    const [rows, nm] = await Promise.all([db("progress?select=user_id,data"), names()]);
    let sent = 0;
    for (const me of rows || []){
      const partner = (rows || []).find(r => r.user_id !== me.user_id);
      const note = reminderFor(me, partner, partner ? (nm[partner.user_id] || "your partner") : "your partner");
      if (note) sent += await pushTo([me.user_id], note);
    }
    return res.status(200).json({ sent });
  } catch (e){
    return res.status(e.status || 500).json({ error: e.message });
  }
};
module.exports.reminderFor = reminderFor;
module.exports.manilaDay = manilaDay;
