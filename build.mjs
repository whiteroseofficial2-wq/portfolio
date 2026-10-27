/* Assembles the public site into dist/ for Netlify to deploy.
 *
 * The repo also holds the function source, package files and tooling folders,
 * so deploying the repo root would publish all of that as static files.
 * Only what a visitor should be able to fetch is copied here.
 */
import fs from "node:fs";
import path from "node:path";

const OUT = "dist";
const FILES = ["index.html", "demos.html", "demos.json", ".nojekyll"];
const DIRS = ["assets"];

fs.mkdirSync(OUT, { recursive: true });
/* clear the contents rather than the folder itself: on Windows a folder that
   some process is sitting in cannot be removed, and a build must not fail
   over that. */
for (const entry of fs.readdirSync(OUT)) {
  fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
}
for (const f of FILES) {
  if (fs.existsSync(f)) fs.copyFileSync(f, path.join(OUT, f));
}
for (const d of DIRS) {
  if (fs.existsSync(d)) fs.cpSync(d, path.join(OUT, d), { recursive: true });
}

const copied = fs.readdirSync(OUT).sort();
console.log(`dist/ built with ${copied.length} entries: ${copied.join(", ")}`);
if (!copied.includes("index.html") || !copied.includes("demos.html") || !copied.includes("demos.json")) {
  console.error("dist/ is missing a required site file — deploy would be broken");
  process.exit(1);
}
