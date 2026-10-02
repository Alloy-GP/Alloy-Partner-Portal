#!/usr/bin/env node
// Build a single self-contained HTML of the proposal page (v3) for one-off use:
//   npm run proposal:standalone                      → dist/proposal-standalone.html (sample data)
//   npm run proposal:standalone -- path/to/data.json → dist/<name>.html
// The JSON is { account: {company, shortName, locations}, proposal: {…engagement_proposals row fields…} }.
// Everything is inlined: React + the page, the proposal CSS, Gotham (licensed to
// Alloy), the logo, the cover mark and the match HOA logo. The data sits in a
// <script id="proposal-data" type="application/json"> block you can edit by hand.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const dataPath = resolve(process.argv[2] || join(here, 'proposal-sample.json'));
const outName = process.argv[2] ? basename(dataPath).replace(/\.json$/i, '') + '.html' : 'proposal-standalone.html';

const data = JSON.parse(readFileSync(dataPath, 'utf8'));

// 1. bundle
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '--config', join(here, 'vite.config.js')], { cwd: repo, stdio: 'inherit' });
const tmp = join(here, 'dist-tmp');
let html = readFileSync(join(tmp, 'index.html'), 'utf8');
let js = readFileSync(join(tmp, 'assets/app.js'), 'utf8');
let css = readFileSync(join(tmp, 'assets/style.css'), 'utf8');

// 2. portal asset URLs → data URIs (both in CSS and in the JS where the page references them)
const dataUri = (rel, mime) => `data:${mime};base64,${readFileSync(join(repo, 'public', rel)).toString('base64')}`;
const assets = [
  ['/fonts/Gotham-Book.woff2', 'font/woff2'], ['/fonts/Gotham-Medium.woff2', 'font/woff2'], ['/fonts/Gotham-Bold.woff2', 'font/woff2'], ['/fonts/Gotham-Black.woff2', 'font/woff2'],
  ['/assets/alloy-logo-full-color.svg', 'image/svg+xml'], ['/alloy-icon.png', 'image/png'], ['/proposal-assets/match-hoa-logo.png', 'image/png'],
];
for (const [url, mime] of assets) {
  if (!existsSync(join(repo, 'public', url))) { console.warn(`missing public asset ${url}`); continue; }
  const uri = dataUri(url, mime);
  css = css.split(url).join(uri);
  js = js.split(`"${url}"`).join(`"${uri}"`);
}

// 3. inline script + style; inject the data block
html = html.replace(/<script type="module"[^>]*src="\.\/assets\/app\.js"><\/script>/, () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/style\.css">/, () => `<style>${css}</style>`);
const json = JSON.stringify(data, null, 2).replace(/<\//g, '<\\/');
html = html.replace('<!--PROPOSAL_DATA-->', () => `<script id="proposal-data" type="application/json">\n${json}\n</script>`);
if (!html.includes('id="proposal-data"') || html.includes('./assets/')) throw new Error('inlining failed');

// 4. write
mkdirSync(join(here, 'dist'), { recursive: true });
const out = join(here, 'dist', outName);
writeFileSync(out, html);
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
