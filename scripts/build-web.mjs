// Copies the static site into www/, which Capacitor bundles into the Android app.
// Keep the Supabase runtime local so app startup does not depend on a third-party CDN.
import { cpSync, mkdirSync, rmSync } from "node:fs";

cpSync("node_modules/@supabase/supabase-js/dist/umd/supabase.js", "supabase.js");
const FILES = ["index.html", "config.js", "supabase.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];

rmSync("www", { recursive: true, force: true });
mkdirSync("www");
for (const f of FILES) cpSync(f, `www/${f}`);
console.log(`Copied ${FILES.length} files to www/`);
