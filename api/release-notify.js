// Tells every Android phone that a new app release is out (called by .github/workflows/release-notify.yml).
// It reads the live version.json, so it can only announce what the site really serves, and it records each
// announced build in a private storage bucket, so a release is announced once however often this is called.
const { cfg, pushTo } = require("./_push");

const BUCKET = "app-releases";

async function storage(path, opts = {}){
  const c = cfg();
  return fetch(`${c.url}/storage/v1/${path}`, {
    method: opts.method || "POST",
    headers: { apikey: c.service, authorization: `Bearer ${c.service}`, "content-type": opts.type || "application/json", ...(opts.headers || {}) },
    body: opts.body
  });
}
// true the first time a build is claimed; false if it was already announced.
async function claim(build){
  await storage("bucket", { body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) }); // fails harmlessly once it exists
  const r = await storage(`object/${BUCKET}/announced-${build}`, { type: "text/plain", headers: { "x-upsert": "false" }, body: new Date().toISOString() });
  if (r.ok) return true;
  const t = await r.text();
  if (r.status === 409 || /duplicate|already exists/i.test(t)) return false;
  throw Object.assign(new Error(`Storage ${r.status}`), { status: 502 });
}

module.exports = async (req, res) => {
  try {
    const vr = await fetch(`https://${req.headers.host}/version.json`, { cache: "no-store" });
    const v = vr.ok ? await vr.json() : null, build = v && Number(v.build);
    if (!Number.isInteger(build) || build < 2) return res.status(200).json({ sent: 0, reason: "No release to announce" });
    if (req.query && req.query.build && Number(req.query.build) !== build) return res.status(409).json({ error: `The site serves build ${build}, not ${req.query.build} yet` });
    if (!(await claim(build))) return res.status(200).json({ sent: 0, build, reason: "Already announced" });
    const notes = Array.isArray(v.notes) ? v.notes.filter(n => typeof n === "string").slice(0, 3) : [];
    const sent = await pushTo("android", {
      title: v.version ? `Magayon Quest ${v.version} is out` : "A new Magayon Quest is out",
      body: notes.length ? `${notes.join(" · ")}. Tap to update.` : "Tap to update the app.",
      tag: "update", url: "/#update", always: true
    });
    return res.status(200).json({ sent, build });
  } catch (e){
    return res.status(e.status || 500).json({ error: e.message });
  }
};
