import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = resolve('scripts/prepare-promotion.mjs');

test('prepares version-correct website metadata, post copy, and a Netlify archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pc-recap-promotion-'));

  try {
    const files = {
      'package.json': JSON.stringify({ version: '2.3.4' }),
      'release-metadata.json': JSON.stringify({
        version: '2.3.4',
        fileName: 'PC-Recap-2.3.4-Setup.exe',
        downloadUrl: 'https://github.com/TheAgencyMGE/pc-recap/releases/download/v2.3.4/PC-Recap-2.3.4-Setup.exe',
        checksumUrl: 'https://github.com/TheAgencyMGE/pc-recap/releases/download/v2.3.4/PC-Recap-2.3.4-Setup.exe.sha256',
        platforms: {
          windows: { downloadUrl: 'https://example.test/windows-2.3.4.exe' },
          macArm64: { downloadUrl: 'https://example.test/mac-arm64-2.3.4.dmg' },
          macX64: { downloadUrl: 'https://example.test/mac-x64-2.3.4.dmg' },
          linuxAppImage: { downloadUrl: 'https://example.test/linux-2.3.4.AppImage' },
          linuxDeb: { downloadUrl: 'https://example.test/linux-2.3.4.deb' },
        },
      }),
      'website/index.html': `<!doctype html>
        <script type="application/ld+json">{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "softwareVersion": "1.0.1",
          "downloadUrl": "https://github.com/TheAgencyMGE/pc-recap/releases/download/v1.0.1/PC-Recap-1.0.1-Setup.exe",
          "releaseNotes": "https://github.com/TheAgencyMGE/pc-recap/releases/tag/v1.0.1"
        }</script>
        <a href="https://github.com/TheAgencyMGE/pc-recap/releases/download/v1.0.1/PC-Recap-1.0.1-Setup.exe">Download</a>
        <a href="https://github.com/TheAgencyMGE/pc-recap/releases/download/v1.0.1/PC-Recap-1.0.1-Setup.exe.sha256">Checksum</a>
        <a data-platform="windows" href="https://example.test/old-windows.exe">Windows</a>
        <a data-platform="mac-arm64" href="https://example.test/old-arm.dmg">Mac ARM</a>
        <a data-platform="mac-x64" href="https://example.test/old-x64.dmg">Mac Intel</a>
        <a data-platform="linux-appimage" href="https://example.test/old.AppImage">AppImage</a>
        <a data-platform="linux-deb" href="https://example.test/old.deb">deb</a>
        <p class="overline">PC Recap 1.0.1 Beta</p>
        <span class="release-line">v1.0.1 beta · x64</span>`,
      'website/sitemap.xml': '<urlset><url><loc>https://pcrecap.online/</loc><lastmod>2026-08-09</lastmod></url></urlset>',
      'website/robots.txt': 'User-agent: *\nAllow: /',
    };

    for (const [relativePath, contents] of Object.entries(files)) {
      const absolutePath = join(root, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }

    const result = spawnSync(process.execPath, [script, '--root', root, '--date', '2026-08-14'], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const repeatedResult = spawnSync(process.execPath, [script, '--root', root, '--date', '2026-08-14'], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    });
    assert.equal(repeatedResult.status, 0, repeatedResult.stderr || repeatedResult.stdout);

    const html = await readFile(join(root, 'website/index.html'), 'utf8');
    assert.match(html, /"softwareVersion": "2\.3\.4"/);
    assert.match(html, /releases\/download\/v2\.3\.4\/PC-Recap-2\.3\.4-Setup\.exe/);
    assert.match(html, /releases\/tag\/v2\.3\.4/);
    assert.match(html, /PC Recap 2\.3\.4 Beta/);
    assert.doesNotMatch(html, /PC Recap 1\.0\.1 Beta/);
    assert.match(html, /v2\.3\.4 beta/);
    assert.match(html, /data-platform="mac-arm64" href="https:\/\/example\.test\/mac-arm64-2\.3\.4\.dmg"/);
    assert.match(html, /data-platform="linux-appimage" href="https:\/\/example\.test\/linux-2\.3\.4\.AppImage"/);

    const sitemap = await readFile(join(root, 'website/sitemap.xml'), 'utf8');
    assert.match(sitemap, /<lastmod>2026-08-14<\/lastmod>/);


    const archive = await stat(join(root, 'artifacts/pc-recap-netlify.zip'));
    assert.ok(archive.size > 0);
    const archiveContents = await readFile(join(root, 'artifacts/pc-recap-netlify.zip'));
    assert.equal(archiveContents.readUInt32LE(0), 0x04034b50);
    assert.ok(archiveContents.includes(Buffer.from('index.html')));
    assert.ok(archiveContents.includes(Buffer.from('robots.txt')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses to package mismatched package and release versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pc-recap-promotion-mismatch-'));

  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '2.3.4' }));
    await writeFile(join(root, 'release-metadata.json'), JSON.stringify({ version: '2.3.3' }));

    const result = spawnSync(process.execPath, [script, '--root', root, '--date', '2026-08-14'], {
      cwd: resolve('.'),
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not match release metadata version/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
