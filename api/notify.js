// Called by a Supabase Database Webhook every time a player's progress row changes.
// Works out what's new (chat messages, invites, battle moves) and notifies the other players.
const { db, names, pushTo, readBody } = require("./_push");

const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function whatsNew(record, old, others, senderName){
  const d = (record && record.data) || {}, od = (old && old.data) || {};
  const notes = [];
  // 1. New chat messages, quiz invites and battle challenges
  const seen = new Set((od.chat || []).map(m => m && m.id));
  const fresh = (d.chat || []).filter(m => m && m.id && !seen.has(m.id)).slice(-3);
  for (const m of fresh){
    const text = String(m.x || "");
    if (m.k === "b") notes.push({ title: `⚔ ${senderName} challenges you to battle`, body: text, tag: "battle-" + m.q, url: "/#chat" });
    else if (m.k === "q") notes.push({ title: `${senderName} sent you a quiz duel`, body: text, tag: "quiz-" + m.q, url: "/#chat" });
    else notes.push({ title: senderName, body: trim(text, 140), tag: "chat", url: "/#chat" });
  }
  // 2. Battle moves: tell the opponent it's their turn
  const bt = d.bt || {}, obt = od.bt || {};
  for (const bid of Object.keys(bt)){
    const n = (bt[bid].ans || []).length, before = ((obt[bid] || {}).ans || []).length;
    if (n <= before) continue;
    const waiting = others.some(o => o.data && o.data.bt && o.data.bt[bid] && (o.data.bt[bid].ans || []).length < n);
    if (waiting) notes.push({ title: `${senderName} made their move`, body: `Question ${n} is locked in. Your turn, 10 seconds on the clock!`, tag: "turn-" + bid, url: "/#arena" });
  }
  return notes.slice(0, 4);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!process.env.WEBHOOK_SECRET || req.headers["x-webhook-secret"] !== process.env.WEBHOOK_SECRET) return res.status(401).json({ error: "Bad webhook secret" });
  try {
    const body = readBody(req);
    if (body.table !== "progress" || !body.record) return res.status(200).json({ skipped: true });
    const sender = body.record.user_id;
    const [rows, nm] = await Promise.all([db("progress?select=user_id,data"), names()]);
    const others = (rows || []).filter(r => r.user_id !== sender);
    const notes = whatsNew(body.record, body.old_record, others, nm[sender] || "Your partner");
    let sent = 0;
    for (const n of notes) sent += await pushTo(others.map(o => o.user_id), n);
    return res.status(200).json({ notes: notes.length, sent });
  } catch (e){
    return res.status(e.status || 500).json({ error: e.message });
  }
};
module.exports.whatsNew = whatsNew;
