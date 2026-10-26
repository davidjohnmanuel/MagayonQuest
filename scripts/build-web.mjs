// Copies the static site into www/, which Capacitor bundles into the Android app.
// The website on Vercel is served straight from the repo root; this only feeds the APK.
import { cpSync, mkdirSync, rmSync } from "node:fs";

const FILES = ["index.html", "config.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];

rmSync("www", { recursive: true, force: true });
mkdirSync("www");
for (const f of FILES) cpSync(f, `www/${f}`);
console.log(`Copied ${FILES.length} files to www/`);
