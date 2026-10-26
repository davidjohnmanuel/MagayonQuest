// Renders icon.svg into the source images @capacitor/assets expects in assets/.
// Run: node scripts/make-icons.mjs && npx capacitor-assets generate --android
import sharp from "sharp";

const glyph = `<circle cx="256" cy="256" r="150" fill="none" stroke="#E3A400" stroke-width="28"/>
  <circle cx="256" cy="256" r="78" fill="none" stroke="#E3A400" stroke-width="28"/>
  <circle cx="256" cy="256" r="24" fill="#E3A400"/>
  <path d="M256 70v62M256 380v62M70 256h62M380 256h62" stroke="#EDF0F3" stroke-width="20" stroke-linecap="round"/>`;
// The glyph is 372 units wide; scale it to the share of the canvas given, centred.
const art = (size, share, bg) => {
  const k = size * share / 372, off = size / 2 - 256 * k;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ""}<g transform="translate(${off} ${off}) scale(${k})">${glyph}</g></svg>`);
};
const out = (svg, file) => sharp(svg).png().toFile(`assets/${file}`);

await Promise.all([
  out(art(1024, 0.74, "#14202B"), "icon-only.png"),
  out(art(1024, 0.56), "icon-foreground.png"),
  out(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#14202B"/></svg>`), "icon-background.png"),
  out(art(2732, 0.22, "#15122E"), "splash.png"),
  out(art(2732, 0.22, "#15122E"), "splash-dark.png")
]);
console.log("Wrote assets/");
