// npm run build → two copies of the app, identical except for the "copy on decode" default:
//   dist/yuza.html  — autocopy OFF by default
//   dist/dixie.html — autocopy ON by default
// (the public/ pages are copied into dist/ as before)
import { build } from 'vite';
import { rename, rm } from 'node:fs/promises';

const variants = [
  { file: 'yuza.html', autocopy: false },
  { file: 'dixie.html', autocopy: true }
];

for (const [i, v] of variants.entries()) {
  // the first build fills dist/ (public/ pages included); later ones go to a scratch folder
  const outDir = i === 0 ? 'dist' : `dist/.build-${v.file}`;
  await build({
    logLevel: 'warn',
    define: { __AUTOCOPY_DEFAULT__: JSON.stringify(v.autocopy) },
    build: { outDir, emptyOutDir: true, copyPublicDir: i === 0 }
  });
  await rename(`${outDir}/index.html`, `dist/${v.file}`);
  if (i > 0) await rm(outDir, { recursive: true, force: true });
  console.log(`dist/${v.file} — autocopy ${v.autocopy ? 'ON' : 'OFF'} by default`);
}
