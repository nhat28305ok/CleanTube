import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const entryPoint = resolve(rootDir, 'src/index.ts');
const outFile = resolve(rootDir, 'dist/cleantube.user.js');
const androidAssetFile = resolve(
  rootDir,
  'android/app/src/main/assets/cleantube.user.js',
);

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         CleanTube — YouTube Không Quảng Cáo (iPhone & Mobile)
// @namespace    https://github.com/cleantube/block-youtube
// @version      1.0.0
// @description  Xem YouTube sạch trên Safari iPhone & trình duyệt di động: chặn quảng cáo, phát nền/PiP, hẹn giờ tắt ngủ, SponsorBlock, ẩn Shorts. 100% miễn phí cho cộng đồng.
// @match        https://m.youtube.com/*
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==`;

mkdirSync(dirname(outFile), { recursive: true });

await esbuild.build({
  entryPoints: [entryPoint],
  outfile: outFile,
  bundle: true,
  format: 'iife',
  target: ['safari15', 'es2020'],
  minify: false,
  legalComments: 'none',
  banner: {
    js: USERSCRIPT_HEADER,
  },
});

mkdirSync(dirname(androidAssetFile), { recursive: true });
copyFileSync(outFile, androidAssetFile);

const stats = statSync(outFile);
const sizeKb = (stats.size / 1024).toFixed(2);
console.log(`Built ${outFile} (${sizeKb} KB)`);
console.log(`Synced Android asset -> ${androidAssetFile}`);
