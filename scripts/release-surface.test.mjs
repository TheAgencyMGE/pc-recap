import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const releaseFacingFiles = [
  'README.md',
  'SUPPORT.md',
  'docs/INSTALL.md',
  'docs/releases/1.2.0.md',
  'release-metadata.json',
  'website/index.html',
  'website/manifest.webmanifest',
];

test('every current release surface identifies version 1.2.0 without promoting 1.1', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const metadata = JSON.parse(await readFile('release-metadata.json', 'utf8'));
  assert.equal(packageJson.version, '1.2.0');
  assert.equal(metadata.version, packageJson.version);

  for (const path of releaseFacingFiles) {
    const contents = await readFile(path, 'utf8');
    assert.doesNotMatch(contents, /(?:latest|current|download|version|release)[^\n]{0,80}(?:v?1\.1(?:\.0)?)/i, `${path} promotes stale 1.1 information`);
  }
});

test('the website keeps the approved cover-shelf design while describing 1.2', async () => {
  const html = await readFile('website/index.html', 'utf8');
  const css = await readFile('website/styles.css', 'utf8');

  assert.match(html, /class="[^"]*\btoday-cover\b[^"]*"/);
  assert.match(html, /class="[^"]*\brecap-shelf\b[^"]*"/);
  assert.match(html, /class="[^"]*\bstory__scenes\b[^"]*"/);
  assert.match(html, /PC Recap 1\.2\.0 Beta/);
  assert.match(html, /Tracking Health/i);
  assert.match(html, /Windows[^<]*macOS[^<]*Linux/i);
  assert.doesNotMatch(html, /data-scroll-story|mixtape-stage/);
  assert.match(css, /\.today-cover\s*\{/);
  assert.doesNotMatch(css, /\.scroll-story\s*\{/);
});
