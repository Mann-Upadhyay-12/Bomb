// npm run build → copies of the app:
//   dist/yuza.html  — autocopy OFF by default
//   dist/dixie.html — autocopy ON by default
//   dist/bomb.html  — dixie without the heist: opens straight on the bomb app (to share the bomb solver alone)
// (the public/ pages are copied into dist/ as before)
// npm run build:bomb → only dist/bomb.html (other files in dist/ are left alone)
import { build } from 'vite';
import { rename, rm } from 'node:fs/promises';

const variants = [
  { file: 'yuza.html', autocopy: false },
  { file: 'dixie.html', autocopy: true },
  { file: 'bomb.html', autocopy: true, bombOnly: true }
];

// optional args pick variants by name, e.g. `node scripts/build-variants.mjs bomb`
const only = process.argv.slice(2).map(a => a.replace(/\.html$/, '') + '.html');
const picked = only.length ? variants.filter(v => only.includes(v.file)) : variants;
if (!picked.length) throw new Error(`no variant named ${only.join(', ')}`);

for (const [i, v] of picked.entries()) {
  // a full build: the first one fills dist/ (public/ pages included); the rest — and every
  // build when only some variants are picked — go to a scratch folder so dist/ is kept
  const fillsDist = i === 0 && !only.length;
  const outDir = fillsDist ? 'dist' : `dist/.build-${v.file}`;
  await build({
    logLevel: 'warn',
    define: { __AUTOCOPY_DEFAULT__: JSON.stringify(v.autocopy), __BOMB_ONLY__: JSON.stringify(Boolean(v.bombOnly)) },
    build: { outDir, emptyOutDir: true, copyPublicDir: fillsDist }
  });
  await rename(`${outDir}/index.html`, `dist/${v.file}`);
  if (!fillsDist) await rm(outDir, { recursive: true, force: true });
  console.log(`dist/${v.file} — autocopy ${v.autocopy ? 'ON' : 'OFF'} by default${v.bombOnly ? ', bomb app only (no heist)' : ''}`);
}
