// Builds games.json from every games/<slug>/game.json file.
// Run:  node scripts/build-manifest.mjs
// Exits with an error (and a list of problems) if any game is set up wrong,
// so pull requests with a broken game fail the check before anyone merges them.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gamesDir = join(root, "games");

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REQUIRED = ["title", "author", "description", "controls"];
const MAX_DESCRIPTION = 160;

const exists = async (p) => {
  try { await stat(p); return true; } catch { return false; }
};

const problems = [];
const games = [];

const entries = await readdir(gamesDir, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const slug = entry.name;
  if (slug.startsWith("_")) continue; // _template and other helper folders

  const where = `games/${slug}`;
  const fail = (msg) => problems.push(`${where}: ${msg}`);

  if (!SLUG.test(slug)) {
    fail("folder name must be lowercase words joined by dashes, like asteroid-dodge");
  }

  const dir = join(gamesDir, slug);
  if (!(await exists(join(dir, "index.html")))) {
    fail("missing index.html (the game's start page)");
  }

  const metaPath = join(dir, "game.json");
  if (!(await exists(metaPath))) {
    fail("missing game.json (copy it from games/_template)");
    continue;
  }

  let meta;
  try {
    meta = JSON.parse(await readFile(metaPath, "utf8"));
  } catch (err) {
    fail(`game.json is not valid JSON (${err.message})`);
    continue;
  }

  for (const key of REQUIRED) {
    if (typeof meta[key] !== "string" || !meta[key].trim()) {
      fail(`game.json needs a "${key}"`);
    }
  }
  if (typeof meta.description === "string" && meta.description.length > MAX_DESCRIPTION) {
    fail(`description is ${meta.description.length} characters; keep it under ${MAX_DESCRIPTION}`);
  }
  if (meta.tags !== undefined && (!Array.isArray(meta.tags) || meta.tags.some((t) => typeof t !== "string"))) {
    fail('"tags" must be a list of words, like ["math", "physics"]');
  }
  if (meta.thumbnail && !(await exists(join(dir, meta.thumbnail)))) {
    fail(`thumbnail "${meta.thumbnail}" is listed but the file isn't in the folder`);
  }

  games.push({
    slug,
    path: `games/${slug}/index.html`,
    title: meta.title?.trim(),
    author: meta.author?.trim(),
    github: meta.github?.trim() || null,
    description: meta.description?.trim(),
    controls: meta.controls?.trim(),
    tags: (meta.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    thumbnail: meta.thumbnail ? `games/${slug}/${meta.thumbnail}` : null,
  });
}

if (problems.length) {
  console.error("Some games need fixing before they can go in the arcade:\n");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

games.sort((a, b) => a.title.localeCompare(b.title));
await writeFile(join(root, "games.json"), JSON.stringify(games, null, 2) + "\n");
console.log(`games.json written with ${games.length} game${games.length === 1 ? "" : "s"}.`);
