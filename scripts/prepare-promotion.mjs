import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createZipFromDirectory } from './zip-directory.mjs';

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function replaceRequired(source, pattern, replacement, label) {
  if (!source.match(pattern)) {
    throw new Error(`Could not update ${label}. The website template may have changed.`);
  }
  return source.replace(pattern, replacement);
}

async function main() {
  const root = resolve(readArgument('--root', '.'));
  const date = readArgument('--date', new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date: ${date}. Expected YYYY-MM-DD.`);
  }

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const metadata = JSON.parse(await readFile(resolve(root, 'release-metadata.json'), 'utf8'));
  if (packageJson.version !== metadata.version) {
    throw new Error(`Package version ${packageJson.version} does not match release metadata version ${metadata.version}.`);
  }
  if (!metadata.platforms || !metadata.platforms.windows || !metadata.platforms.macArm64 || !metadata.platforms.macX64 || !metadata.platforms.linuxAppImage || !metadata.platforms.linuxDeb) {
    throw new Error('Release metadata must list every supported platform artifact.');
  }

  const websiteDirectory = resolve(root, 'website');
  const htmlPath = resolve(websiteDirectory, 'index.html');
  const sitemapPath = resolve(websiteDirectory, 'sitemap.xml');
  const headersPath = resolve(websiteDirectory, '_headers');
  let html = await readFile(htmlPath, 'utf8');

  html = replaceRequired(
    html,
    /"softwareVersion":\s*"[^"]+"/,
    `"softwareVersion": "${metadata.version}"`,
    'structured release version',
  );
  html = replaceRequired(
    html,
    /https:\/\/github\.com\/TheAgencyMGE\/pc-recap\/releases\/download\/v[^/"']+\/PC-Recap-[^/"']+-Setup\.exe\.sha256/g,
    metadata.checksumUrl,
    'checksum links',
  );
  html = replaceRequired(
    html,
    /https:\/\/github\.com\/TheAgencyMGE\/pc-recap\/releases\/download\/v[^/"']+\/PC-Recap-[^/"']+-Setup\.exe/g,
    metadata.downloadUrl,
    'installer links',
  );
  html = replaceRequired(
    html,
    /https:\/\/github\.com\/TheAgencyMGE\/pc-recap\/releases\/tag\/v[^/"']+/g,
    `https://github.com/TheAgencyMGE/pc-recap/releases/tag/v${metadata.version}`,
    'release notes links',
  );
  for (const [platform, artifact] of [
    ['windows', metadata.platforms.windows],
    ['mac-arm64', metadata.platforms.macArm64],
    ['mac-x64', metadata.platforms.macX64],
    ['linux-appimage', metadata.platforms.linuxAppImage],
    ['linux-deb', metadata.platforms.linuxDeb],
  ]) {
    html = replaceRequired(
      html,
      new RegExp(`(<a\\b[^>]*data-platform="${platform}"[^>]*href=")[^"]+("[^>]*>)`, 'g'),
      `$1${artifact.downloadUrl}$2`,
      `${platform} download links`,
    );
  }
  html = html.replace(
    /v\d+\.\d+\.\d+ beta(?: · x64)?/,
    `v${metadata.version} beta`,
  );
  html = replaceRequired(
    html,
    /PC Recap \d+\.\d+\.\d+ Beta/g,
    `PC Recap ${metadata.version} Beta`,
    'visible download-panel version',
  );
  await writeFile(htmlPath, html);

  let sitemap = await readFile(sitemapPath, 'utf8');
  sitemap = replaceRequired(sitemap, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/, `<lastmod>${date}</lastmod>`, 'sitemap date');
  await writeFile(sitemapPath, sitemap);

  try {
    let headers = await readFile(headersPath, 'utf8');
    const structuredData = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
    if (!structuredData) throw new Error('Could not find SoftwareApplication structured data.');
    const hash = createHash('sha256').update(structuredData).digest('base64');
    headers = replaceRequired(headers, /'sha256-[^']+'/, `'sha256-${hash}'`, 'structured-data content security hash');
    await writeFile(headersPath, headers);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const artifactsDirectory = resolve(root, 'artifacts');
  await mkdir(artifactsDirectory, { recursive: true });

  const archivePath = resolve(artifactsDirectory, 'pc-recap-netlify.zip');
  await rm(archivePath, { force: true });
  await createZipFromDirectory(websiteDirectory, archivePath);

  console.log(`Prepared PC Recap ${metadata.version} promotion assets.`);
  console.log(`Website archive: ${archivePath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
