// Check-in reminders (Vercel Cron, 7am / 12pm / 6pm Manila): one random nudge per player, picked from what's
// going on in their daily check-in deck and progress. Tapping it opens the deck on the matching card.
const { db, names, pushTo } = require("./_push");
const { manilaDay } = require("./remind");

// Keep in sync with MOODS / CI_COINS / CI_WEEK_BONUS / NOTE_DAYS in index.html.
const MOODS = [["😄", "Great"], ["🙂", "Good"], ["😐", "Okay"], ["🥰", "Loved"], ["🔥", "Motivated"], ["😴", "Tired"], ["😩", "Stressed"], ["😔", "Down"]];
const CI_COINS = 5, CI_WEEK_BONUS = 20, NOTE_DAYS = 3;

// Days in a row ending today, or yesterday when today isn't in yet.
function streak(days, today){
  const s = new Set(days || []);
  let t = Date.parse(today);
  if (!s.has(today)) t -= 864e5;
  let n = 0;
  while (s.has(new Date(t).toISOString().slice(0, 10))){ n++; t -= 864e5; }
  return n;
}
const minsOn = (d, day) => Object.values((d.time || {})[day] || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const first = name => String(name || "").trim().split(" ")[0] || "there";

// Everything that would make a good nudge for this player right now. Each slot has its own flavour.
function ideas(slot, me, mate, myName, mateName, now = Date.now()){
  const d = (me && me.data) || {}, md = (mate && mate.data) || {}, today = manilaDay(0);
  const ci = d.ci || [], log = d.log || [], goal = d.goal || 30, mins = minsOn(d, today);
  const claimed = ci.includes(today), next = streak(ci, today) + 1, pay = CI_COINS + (next % 7 === 0 ? CI_WEEK_BONUS : 0);
  const combo = streak(log, today), myMood = (d.mood || {})[today], mateMood = (md.mood || {})[today];
  const note = md.nt && now - Date.parse(md.nt.t) < NOTE_DAYS * 864e5 ? md.nt : null;
  const sentNote = !!d.nt && Date.parse(d.nt.t) >= Date.parse(today) - 8 * 3600e3; // since midnight Manila
  const deck = card => "/#daily-" + card, out = [];
  const add = (ok, title, body, url) => { if (ok) out.push({ title, body, url }); };

  if (slot === "morning"){
    add(!claimed, `☀️ Good morning, ${first(myName)}!`, `Your check-in is ready: +${pay} coins${next > 1 ? `, day ${next} in a row` : ""}.`, deck("checkin"));
    add(myMood === undefined, "How are you feeling this morning?", mate ? `Pick a mood. ${mateName} will see it in their deck.` : "Pick a mood for today.", deck("mood"));
    add(!!note, `💌 ${mateName} left you a note`, "It's sealed in today's check-in. Tap to open it.", deck("secret"));
    add(true, "A new question of the day is up", "Answer it and post it to the feed.", deck("ask"));
    add(true, "🔥 Today's motivation is in", `Goal today: ${goal} min${combo ? ` · ${combo}-day combo` : ""}. Small steps count.`, deck("motive"));
  } else if (slot === "noon"){
    add(mins === 0, "⏳ Halfway through the day", combo ? `0 of ${goal} min so far. A quick lunch session keeps your ${combo}-day combo alive.` : `0 of ${goal} min so far. Even 10 minutes over lunch counts.`, "/#today");
    add(mins > 0 && mins < goal, `${mins} of ${goal} min done`, `${goal - mins} min to go. You're on track 💪`, "/#today");
    add(mins >= goal, "🎯 Goal crushed today", `${mins} min logged. Try today's trivia just for fun.`, deck("trivia"));
    add(mateMood !== undefined && !!MOODS[mateMood], `${mateName} is feeling ${(MOODS[mateMood] || [])[0]} ${(MOODS[mateMood] || [])[1]} today`, "Send them a one-liner to brighten their afternoon.", deck("secret"));
    add(true, "🧠 Lunch-break trivia", "One quick FDE question is waiting in your check-in.", deck("trivia"));
    add(!claimed, "You haven't checked in yet", `+${pay} coins are waiting for you.`, deck("checkin"));
  } else {
    add(!log.includes(today) && combo > 0, `🔥 ${combo}-day combo on the line`, "Log a few minutes before midnight to keep it going.", "/#today");
    add(log.includes(today), "Today's recap", `${mins} min trained${myMood !== undefined && MOODS[myMood] ? ` · feeling ${MOODS[myMood][0]}` : ""}${claimed ? " · checked in ✓" : ""}. Nice work!`, deck("motive"));
    add(!!mate && !sentNote, `Leave ${mateName} a note for tomorrow 💌`, "It'll be sealed in their next check-in deck.", deck("secret"));
    add(!claimed, "Last call for check-in coins", `+${pay} coins before the day ends.`, deck("checkin"));
    add(myMood === undefined, "How was your day?", "Log your mood in today's check-in.", deck("mood"));
  }
  return out;
}

function pick(list, rnd = Math.random){
  return list.length ? list[Math.floor(rnd() * list.length)] : null;
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
  const slot = String((req.query && req.query.slot) || "");
  if (!["morning", "noon", "evening"].includes(slot)) return res.status(400).json({ error: "slot must be morning, noon or evening" });
  try {
    const [rows, nm] = await Promise.all([db("progress?select=user_id,data"), names()]);
    let sent = 0;
    for (const me of rows || []){
      const mate = (rows || []).find(r => r.user_id !== me.user_id);
      const idea = pick(ideas(slot, me, mate, nm[me.user_id], mate ? first(nm[mate.user_id] || "your partner") : "your partner"));
      if (idea) sent += await pushTo([me.user_id], { ...idea, tag: "checkin" });
    }
    return res.status(200).json({ slot, sent });
  } catch (e){
    return res.status(e.status || 500).json({ error: e.message });
  }
};
module.exports.ideas = ideas;
module.exports.streak = streak;
