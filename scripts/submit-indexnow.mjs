import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
  const root = resolve(readArgument('--root', '.'));
  const pageUrl = new URL(readArgument('--url', 'https://pcrecap.online/'));
  const endpoint = new URL(readArgument('--endpoint', 'https://api.indexnow.org/indexnow'));
  const key = (await readFile(resolve(root, 'website/indexnow-key.txt'), 'utf8')).trim();
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error('The IndexNow key must contain 8 to 128 letters, numbers, or dashes.');
  }

  endpoint.searchParams.set('url', pageUrl.href);
  endpoint.searchParams.set('key', key);
  endpoint.searchParams.set('keyLocation', new URL('indexnow-key.txt', pageUrl).href);

  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'PC-Recap-IndexNow/1.0' },
  });
  if (response.status !== 200 && response.status !== 202) {
    const details = (await response.text()).trim();
    throw new Error(`IndexNow returned HTTP ${response.status}${details ? `: ${details}` : ''}`);
  }

  console.log(`IndexNow accepted ${pageUrl.href} with HTTP ${response.status}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
