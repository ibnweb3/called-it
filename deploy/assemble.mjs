// Assemble the two front-end builds into one Cloudflare Pages deployment:
//
//   deploy/dist/          <- apps/web/dist        (the game, calledit-somnia.pages.dev/)
//   deploy/dist/house/    <- apps/vault-web/dist  (Housepool,  .../house)
//
// Run the two `vite build`s first (the `deploy` npm script does). vault-web must
// be built with BASE=/house/ so its assets resolve under the subpath.

import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = `${root}deploy/dist`;
const game = `${root}apps/web/dist`;
const house = `${root}apps/vault-web/dist`;

for (const [label, dir] of [["apps/web", game], ["apps/vault-web", house]]) {
  if (!existsSync(dir)) {
    console.error(`missing ${label}/dist — run its \`vite build\` first`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(game, out, { recursive: true });
mkdirSync(`${out}/house`, { recursive: true });
cpSync(house, `${out}/house`, { recursive: true });

// One _redirects at the deployment root (Cloudflare ignores nested ones).
// Static files are matched before these SPA fallbacks; the /house rule is
// listed first because it's the more specific one.
writeFileSync(
  `${out}/_redirects`,
  ["/house/*  /house/index.html  200", "/*  /index.html  200", ""].join("\n"),
);

console.log(`assembled -> deploy/dist  (game at /, Housepool at /house)`);
