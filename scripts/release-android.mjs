// Builds a new Android release and publishes it through the website.
//   npm run android:release -- "Shop tab" "Study commitments"          (each argument is one line of release notes)
//   npm run android:release -- --required "Fixes sign-in"              (older apps must update before they can be used)
// It bumps versionCode/versionName in android/app/build.gradle, builds the signed APK, copies it to
// downloads/FDE-Quest.apk and writes version.json. Commit and push those to put the update live: installed apps
// compare version.json with their own versionCode when they open and offer the download.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2), required = args.includes("--required"), notes = args.filter(a => a !== "--required");
const GRADLE = "android/app/build.gradle", APK_OUT = "android/app/build/outputs/apk/release/app-release.apk", APK = "downloads/FDE-Quest.apk";

if (!existsSync("android/keystore.properties")) {
  console.error("android/keystore.properties is missing, so the APK would be unsigned and couldn't update the installed app. See README, \"Android app\".");
  process.exit(1);
}

let gradle = readFileSync(GRADLE, "utf8");
const code = Number((gradle.match(/versionCode (\d+)/) || [])[1]), name = (gradle.match(/versionName "([^"]+)"/) || [])[1];
if (!code || !name) { console.error(`Couldn't find versionCode and versionName in ${GRADLE}.`); process.exit(1); }
const [major, minor = 0] = name.split(".").map(Number), build = code + 1, version = `${major}.${minor + 1}`;
gradle = gradle.replace(/versionCode \d+/, `versionCode ${build}`).replace(/versionName "[^"]+"/, `versionName "${version}"`);
writeFileSync(GRADLE, gradle);
console.log(`Building Magayon Quest ${version} (build ${build})…`);

try {
  execSync("npm run android:apk", { stdio: "inherit" });
} catch (e) {
  writeFileSync(GRADLE, readFileSync(GRADLE, "utf8").replace(`versionCode ${build}`, `versionCode ${code}`).replace(`versionName "${version}"`, `versionName "${name}"`));
  console.error("The build failed, so the version number was put back.");
  process.exit(1);
}

mkdirSync("downloads", { recursive: true });
copyFileSync(APK_OUT, APK);
const prev = existsSync("version.json") ? JSON.parse(readFileSync("version.json", "utf8")) : {};
writeFileSync("version.json", JSON.stringify({ build, version, min: required ? build : prev.min || 0, apk: "/" + APK, notes }, null, 2) + "\n");

console.log(`\nMagayon Quest ${version} is ready in ${APK}.${required ? " Older apps will have to update." : ""}`);
console.log(`Put it live:\n  git add ${GRADLE} ${APK} version.json && git commit -m "Release Android ${version}" && git push`);
