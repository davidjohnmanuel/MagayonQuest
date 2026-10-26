// Vercel serverless function: generates an AI quiz with Gemini.
// Only signed-in people on the study list can use it, so your API key can't be used by strangers.
// Environment variables (Vercel -> Project -> Settings -> Environment Variables):
//   GEMINI_API_KEY     - from aistudio.google.com/apikey
//   SUPABASE_URL       - same value as in config.js
//   SUPABASE_ANON_KEY  - same value as in config.js
//   GEMINI_MODEL       - optional, defaults to gemini-3.5-flash-lite

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(204).end(); // CORS preflight from the Android app (headers in vercel.json)
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: "AI quizzes are not set up on this deployment" });
  }

  // 1. Check the caller is signed in AND on the study list.
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in first" });
  try {
    const m = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/members?select=email&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: auth }
    });
    if (!m.ok) return res.status(401).json({ error: "Your session expired. Sign in again." });
    const rows = await m.json();
    if (!Array.isArray(rows) || !rows.length) return res.status(403).json({ error: "Not on the study list" });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't check your account" });
  }

  // 2. Read the prompt the app built from the mission material.
  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const prompt = String(body.prompt || "").slice(0, 12000);
  if (prompt.length < 50) return res.status(400).json({ error: "Missing quiz prompt" });

  // 3. Ask Gemini for a JSON response and return the parsed questions.
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4000, responseMimeType: "application/json" }
      })
    });
    if (r.status === 429) return res.status(429).json({ error: "The AI free-tier quota has been reached. Try again later." });
    if (!r.ok) return res.status(502).json({ error: "The AI service didn't answer" });
    const j = await r.json();
    const text = (j.candidates || []).flatMap(c => c.content && c.content.parts || []).map(p => p.text || "").join("");
    const questions = JSON.parse(text);
    if (!Array.isArray(questions)) throw new Error("not an array");
    return res.status(200).json({ questions });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't read the generated quiz. Try again." });
  }
};
