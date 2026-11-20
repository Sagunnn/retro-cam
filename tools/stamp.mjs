// Adds a content hash to the CSS/JS URLs in index.html (styles.css?v=…, app.js?v=…),
// so a CDN in front of the site (Cloudflare) can never serve an old copy after a deploy.
// Run before committing a change to styles.css or app.js:
//   node tools/stamp.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (f) => createHash('sha256').update(readFileSync(join(root, f))).digest('hex').slice(0, 10);
const page = join(root, 'index.html');
let html = readFileSync(page, 'utf8');
for (const f of ['styles.css', 'app.js']) {
  const re = new RegExp(`(["'])${f.replace('.', '\\.')}(\\?v=[\\w-]*)?\\1`, 'g');
  html = html.replace(re, `$1${f}?v=${hash(f)}$1`);
}
writeFileSync(page, html);
console.log('stamped', html.match(/(styles\.css|app\.js)\?v=\w+/g).join(', '));
