// Cross-platform replacement for the POSIX `cp -r` steps in the build script (QA-012):
//   cp -r .next/static .next/standalone/.next/
//   cp -r public       .next/standalone/
// `cp` does not exist on Windows, which made `npm run build` exit 1 there.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Mirrors `cp -r <src> <dstParent>`: copies src into dstParent under its own name. */
function copyInto(src, dstParent) {
  if (!existsSync(src)) {
    console.error(`[copy-standalone] missing source: ${src}`);
    process.exit(1);
  }
  mkdirSync(dstParent, { recursive: true });
  const dest = join(dstParent, basename(src));
  cpSync(src, dest, { recursive: true });
  return dest;
}

const standalone = resolve(root, '.next/standalone');
if (!existsSync(standalone)) {
  console.error('[copy-standalone] .next/standalone not found — did `next build` succeed?');
  process.exit(1);
}

const a = copyInto(resolve(root, '.next/static'), resolve(standalone, '.next'));
const b = copyInto(resolve(root, 'public'), standalone);

const size = (p) => {
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const f = join(d, e);
      if (statSync(f).isDirectory()) walk(f);
      else n++;
    }
  };
  walk(p);
  return n;
};

console.log(`[copy-standalone] ${a} (${size(a)} files)`);
console.log(`[copy-standalone] ${b} (${size(b)} files)`);
console.log('[copy-standalone] ok');
