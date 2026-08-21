import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyReleaseArtifacts } from './release-artifacts.mjs';

const metadata = {
  version: '1.2.0',
  platforms: {
    windows: { label: 'Windows x64', fileName: 'PC-Recap-1.2.0-Setup.exe' },
    macArm64: { label: 'macOS Apple Silicon', fileName: 'PC-Recap-1.2.0-mac-arm64.dmg' },
    macX64: { label: 'macOS Intel', fileName: 'PC-Recap-1.2.0-mac-x64.dmg' },
    linuxAppImage: { label: 'Linux AppImage x64', fileName: 'PC-Recap-1.2.0-linux-x64.AppImage' },
    linuxDeb: { label: 'Linux deb x64', fileName: 'PC-Recap-1.2.0-linux-x64.deb' },
  },
};

async function makeReleaseDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'pc-recap-release-'));
  for (const artifact of Object.values(metadata.platforms)) {
    await writeFile(join(directory, artifact.fileName), Buffer.from(`real-${artifact.fileName}`));
  }
  return directory;
}

test('verifies every platform artifact and writes portable SHA-256 files', async () => {
  const releaseDirectory = await makeReleaseDirectory();
  try {
    const verified = await verifyReleaseArtifacts({
      metadata,
      releaseDirectory,
      releaseTag: 'v1.2.0',
      minimumBytes: 1,
      writeChecksums: true,
    });

    assert.deepEqual(verified.map((artifact) => artifact.fileName), Object.values(metadata.platforms).map((artifact) => artifact.fileName));
    for (const artifact of verified) {
      assert.match(artifact.sha256, /^[A-F0-9]{64}$/);
      assert.equal(
        await readFile(join(releaseDirectory, `${artifact.fileName}.sha256`), 'ascii'),
        `${artifact.sha256}  ${artifact.fileName}\n`,
      );
    }
  } finally {
    await rm(releaseDirectory, { recursive: true, force: true });
  }
});

test('refuses to publish when a supported platform artifact is missing', async () => {
  const releaseDirectory = await makeReleaseDirectory();
  try {
    await rm(join(releaseDirectory, metadata.platforms.linuxDeb.fileName));
    await assert.rejects(
      verifyReleaseArtifacts({ metadata, releaseDirectory, releaseTag: 'v1.2.0', minimumBytes: 1 }),
      /Linux deb x64.*missing/i,
    );
  } finally {
    await rm(releaseDirectory, { recursive: true, force: true });
  }
});

test('refuses to publish a tag that does not match release metadata', async () => {
  const releaseDirectory = await makeReleaseDirectory();
  try {
    await assert.rejects(
      verifyReleaseArtifacts({ metadata, releaseDirectory, releaseTag: 'v1.2.1', minimumBytes: 1 }),
      /tag v1\.2\.1 does not match metadata version 1\.2\.0/i,
    );
  } finally {
    await rm(releaseDirectory, { recursive: true, force: true });
  }
});
