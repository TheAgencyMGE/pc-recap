import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const site = resolve('website');
const required = [
  'index.html', 'styles.css', 'site.js', '_headers', 'robots.txt', 'og.png',
  'THIRD_PARTY_NOTICES.txt', 'fonts/archivo.woff2', 'fonts/instrument-sans.woff2',
  'fonts/OFL-Archivo.txt', 'fonts/OFL-Instrument-Sans.txt',
];
const metadata = JSON.parse(await readFile(resolve('release-metadata.json'), 'utf8'));
const releaseUrl = metadata.downloadUrl;
const checksumUrl = metadata.checksumUrl;

for (const file of required) await access(resolve(site, file));

const html = await readFile(resolve(site, 'index.html'), 'utf8');
const headers = await readFile(resolve(site, '_headers'), 'utf8');
const script = await readFile(resolve(site, 'site.js'), 'utf8');
const png = await readFile(resolve(site, 'og.png'));

assert.match(html, /<main[\s>]/i, 'The page needs a semantic main element.');
assert.match(html, /<title>PC Wrapped/i, 'The page needs product-specific metadata.');
assert.match(html, /property="og:image"/i, 'The page needs a social preview image.');
assert.match(html, /property="og:image" content="og\.png"/i, 'The social preview must ship with the Netlify site.');
assert.ok(html.includes(releaseUrl), 'The primary download must use the v1.0.0 GitHub Release asset.');
assert.ok(html.includes(checksumUrl), 'The site must link to the checksum uploaded beside the installer.');
assert.doesNotMatch(html, /\b\d+[,.]?\d*\s*(hours?|minutes?|sessions?|active days?)\b/i, 'The site must not invent product activity.');
assert.match(headers, /Content-Security-Policy:/i);
assert.match(headers, /X-Content-Type-Options:\s*nosniff/i);
assert.match(headers, /Referrer-Policy:/i);
assert.match(script, /prefers-reduced-motion/);
assert.match(html, /aria-label="Download installer SHA-256 checksum"/i, 'The checksum link needs an accessible name.');
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'og.png must be a real PNG.');
const ogWidth = png.readUInt32BE(16);
const ogHeight = png.readUInt32BE(20);
assert.ok(ogWidth / ogHeight > 1.8 && ogWidth / ogHeight < 2, 'og.png must use a landscape social-card aspect ratio.');
assert.ok(html.includes(`property="og:image:width" content="${ogWidth}"`), 'Open Graph width must match og.png.');
assert.ok(html.includes(`property="og:image:height" content="${ogHeight}"`), 'Open Graph height must match og.png.');

const localReferences = [...html.matchAll(/(?:href|src)="(?!https?:|#|mailto:)([^"?]+)(?:\?[^" ]*)?"/g)].map((match) => match[1]);
for (const reference of localReferences) {
  if (!reference || reference === '/') continue;
  assert.notEqual(extname(reference), '.exe', 'The installer must not be embedded in the Netlify deploy.');
  await access(resolve(site, reference.replace(/^\.\//, '')));
}

console.log(JSON.stringify({ files: required.length, releaseUrl, checksumUrl, status: 'ok' }));
