// Called by a Supabase Database Webhook every time a player's progress row changes.
// Works out what's new (chat messages, invites, battle moves) and notifies the other players.
const { db, names, pushTo, readBody } = require("./_push");

const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function whatsNew(record, old, others, senderName, activeUsers = others.map(o => o.user_id)){
  const d = (record && record.data) || {}, od = (old && old.data) || {};
  const notes = [];
  // 1. New chat messages, quiz invites and battle challenges
  const seen = new Set((od.chat || []).map(m => m && m.id));
  const fresh = (d.chat || []).filter(m => m && m.id && !seen.has(m.id)).slice(-3);
  const everyone = (d.chat || []).concat(others.flatMap(o => o.data.chat || []));
  for (const m of fresh){
    // Photo messages carry x = caption, or "📷 Photo" when there is none.
    const text = m.i && m.x !== "📷 Photo" ? "📷 " + String(m.x || "") : String(m.x || "");
    const topic = m.p && everyone.find(x => x && x.id === m.p && x.k === "t");
    if (m.k === "b") notes.push({ title: `⚔ ${senderName} challenges you to battle`, body: text, tag: "battle-" + m.q, url: "/#chat" });
    else if (m.k === "q") notes.push({ title: `${senderName} sent you a quiz duel`, body: text, tag: "quiz-" + m.q, url: "/#chat" });
    else if (m.k === "t") notes.push({ title: `📌 ${senderName} started a topic`, body: trim(text, 140), tag: "topic-" + m.id, url: "/#chat" });
    else {
      const recipients = others.map(o => o.user_id);
      const mentioned = m.k === "m" && Array.isArray(m.mentions)
        ? [...new Set(m.mentions.filter(id => typeof id === "string" && recipients.includes(id) && activeUsers.includes(id)))]
        : [];
      if (mentioned.length) notes.push({ title: `${senderName} mentioned you`, body: trim(text, 140), tag: "mention-" + m.id, url: "/#chat", recipients: mentioned });
      const unmentioned = recipients.filter(id => !mentioned.includes(id));
      if (unmentioned.length) notes.push({
        title: topic ? `${senderName} in “${trim(String(topic.x || ""), 40)}”` : senderName,
        body: trim(text, 140), tag: topic ? "topic-" + topic.id : "chat", url: "/#chat", recipients: unmentioned
      });
    }
  }
  // 2. A new reaction on someone else's message (only the latest one, so a burst of taps is one ping)
  const rx = d.rx || {}, orx = od.rx || {};
  const changed = Object.keys(rx).filter(id => rx[id] !== orx[id]).pop();
  if (changed){
    const m = others.flatMap(o => o.data.chat || []).find(x => x && x.id === changed && x.k !== "u");
    if (m) notes.push({ title: `${senderName} reacted ${rx[changed]} to your message`, body: trim(String(m.x || ""), 140), tag: "react-" + changed, url: "/#chat" });
  }
  // 3. Battle moves: tell the opponent it's their turn
  const bt = d.bt || {}, obt = od.bt || {};
  for (const bid of Object.keys(bt)){
    const n = (bt[bid].ans || []).length, before = ((obt[bid] || {}).ans || []).length;
    if (n <= before) continue;
    const waiting = others.some(o => o.data && o.data.bt && o.data.bt[bid] && (o.data.bt[bid].ans || []).length < n);
    if (waiting) notes.push({ title: `${senderName} made their move`, body: `Question ${n} is locked in. Your turn, 10 seconds on the clock!`, tag: "turn-" + bid, url: "/#arena" });
  }
  return notes.slice(0, 4);
}

// Profile posts: a new post pings everyone else; a comment or like pings the post's author.
async function feedNews(table, r){
  const nm = await names(), who = nm[r.user_id] || "Your partner";
  if (table === "posts"){
    const others = Object.keys(nm).filter(id => id !== r.user_id);
    const sent = await pushTo(others, { title: `${who} posted an update`, body: r.body ? trim(String(r.body), 140) : "📷 Shared a photo", tag: "post-" + r.id, url: "/#feed" });
    return { notes: 1, sent };
  }
  const [post] = (await db(`posts?select=user_id,body&id=eq.${encodeURIComponent(r.post_id)}`)) || [];
  if (!post || post.user_id === r.user_id) return { notes: 0, sent: 0 };
  const what = post.body ? `“${trim(String(post.body), 60)}”` : "your photo";
  const note = table === "post_comments"
    ? { title: `${who} commented on your post`, body: trim(String(r.body || ""), 140), tag: "comments-" + r.post_id, url: "/#feed" }
    : { title: `${who} liked your post`, body: what, tag: "likes-" + r.post_id, url: "/#feed" };
  return { notes: 1, sent: await pushTo([post.user_id], note) };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!process.env.WEBHOOK_SECRET || req.headers["x-webhook-secret"] !== process.env.WEBHOOK_SECRET) return res.status(401).json({ error: "Bad webhook secret" });
  try {
    const body = readBody(req);
    if (["posts", "post_comments", "post_likes"].includes(body.table) && body.type === "INSERT" && body.record) return res.status(200).json(await feedNews(body.table, body.record));
    if (body.table !== "progress" || !body.record) return res.status(200).json({ skipped: true });
    const sender = body.record.user_id;
    const [rows, nm] = await Promise.all([db("progress?select=user_id,data"), names()]);
    const progress = Object.fromEntries((rows || []).map(r => [r.user_id, r.data || {}]));
    const others = Object.keys(nm).filter(id => id !== sender).map(id => ({ user_id: id, data: progress[id] || {} }));
    const notes = whatsNew(body.record, body.old_record, others, nm[sender] || "Your partner", Object.keys(progress));
    let sent = 0;
    for (const n of notes){
      const { recipients, ...payload } = n;
      sent += await pushTo(recipients || others.map(o => o.user_id), payload);
    }
    return res.status(200).json({ notes: notes.length, sent });
  } catch (e){
    return res.status(e.status || 500).json({ error: e.message });
  }
};
module.exports.whatsNew = whatsNew;
