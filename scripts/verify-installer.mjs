import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const metadata = JSON.parse(await readFile(resolve('release-metadata.json'), 'utf8'));
if (process.env.RELEASE_TAG) assert.equal(process.env.RELEASE_TAG, `v${metadata.version}`, 'Git tag and release version do not match.');
const installer = resolve('release', metadata.fileName);
const file = await stat(installer);
assert.ok(file.isFile(), 'The release artifact must be a file.');
assert.ok(file.size > 1_000_000, 'The release artifact is unexpectedly small.');

const hash = createHash('sha256');
await new Promise((resolveHash, reject) => {
  const stream = createReadStream(installer);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', resolveHash);
});
const sha256 = hash.digest('hex').toUpperCase();

if (process.argv.includes('--write-checksum')) {
  await writeFile(`${installer}.sha256`, `${sha256}  ${metadata.fileName}\n`, 'ascii');
}

console.log(JSON.stringify({ fileName: metadata.fileName, sizeBytes: file.size, sha256, checksumWritten: process.argv.includes('--write-checksum') }));
