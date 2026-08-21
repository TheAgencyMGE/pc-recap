import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function sha256ForFile(path) {
  const hash = createHash('sha256');
  await new Promise((resolveHash, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolveHash);
  });
  return hash.digest('hex').toUpperCase();
}

export async function verifyReleaseArtifacts({
  metadata,
  releaseDirectory,
  releaseTag,
  minimumBytes = 1_000_000,
  writeChecksums = false,
}) {
  assert.match(metadata?.version ?? '', /^\d+\.\d+\.\d+$/, 'Release metadata needs a semantic version.');
  if (releaseTag) {
    assert.equal(releaseTag, `v${metadata.version}`, `Release tag ${releaseTag} does not match metadata version ${metadata.version}.`);
  }

  const artifacts = Object.values(metadata.platforms ?? {});
  assert.ok(artifacts.length > 0, 'Release metadata must list supported platform artifacts.');
  assert.equal(new Set(artifacts.map((artifact) => artifact.fileName)).size, artifacts.length, 'Release artifact names must be unique.');

  const verified = [];
  for (const artifact of artifacts) {
    const label = artifact.label || artifact.fileName || 'Unknown platform';
    assert.equal(typeof artifact.fileName, 'string', `${label} needs a release file name.`);
    const path = resolve(releaseDirectory, artifact.fileName);
    let file;
    try {
      file = await stat(path);
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`${label} release artifact is missing: ${artifact.fileName}`);
      throw error;
    }
    assert.ok(file.isFile(), `${label} release artifact must be a file.`);
    assert.ok(file.size >= minimumBytes, `${label} release artifact is unexpectedly small.`);

    const sha256 = await sha256ForFile(path);
    if (writeChecksums) {
      await writeFile(`${path}.sha256`, `${sha256}  ${artifact.fileName}\n`, 'ascii');
    }
    verified.push({ label, fileName: artifact.fileName, sizeBytes: file.size, sha256 });
  }
  return verified;
}

async function main() {
  const metadata = JSON.parse(await readFile(resolve('release-metadata.json'), 'utf8'));
  const writeChecksums = process.argv.includes('--write-checksums');
  const verified = await verifyReleaseArtifacts({
    metadata,
    releaseDirectory: resolve('release'),
    releaseTag: process.env.RELEASE_TAG,
    writeChecksums,
  });
  console.log(JSON.stringify({ version: metadata.version, artifacts: verified, checksumFilesWritten: writeChecksums }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
