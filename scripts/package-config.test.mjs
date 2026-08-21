import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const ciWorkflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const releaseWorkflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

test('cross-platform package metadata uses electron-builder 26 schema locations', () => {
  assert.equal(packageJson.desktopName, 'pc-recap.desktop');
  assert.equal(packageJson.build.electronDist, undefined, 'electron-builder must select a runtime for each target architecture');
  assert.deepEqual(packageJson.build.electronLanguages, ['en-US']);
  assert.equal(packageJson.build.linux.desktopName, undefined);
  assert.equal(packageJson.build.linux.syncDesktopName, true);
  assert.equal(packageJson.build.linux.executableName, 'pc-recap');
  assert.equal(packageJson.build.linux.maintainer, 'PC Recap <TheAgencyMGE@users.noreply.github.com>');
  assert.equal(packageJson.build.linux.vendor, 'PC Recap');
  assert.equal(packageJson.build.appImage.artifactName, 'PC-Recap-${version}-linux-x64.AppImage');
  assert.equal(packageJson.build.deb.artifactName, 'PC-Recap-${version}-linux-x64.deb');
  assert.deepEqual(packageJson.build.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.deepEqual(packageJson.build.mac.target, [{ target: 'dmg', arch: ['x64', 'arm64'] }]);
  assert.deepEqual(packageJson.build.linux.target, [
    { target: 'AppImage', arch: ['x64'] },
    { target: 'deb', arch: ['x64'] },
  ]);
  assert.equal(packageJson.build.win.icon, 'build/icon.ico');
  assert.equal(packageJson.build.mac.icon, 'build/icon.png');
  assert.equal(packageJson.build.linux.icon, 'build/icon.png');
});

test('CI package commands never trigger electron-builder implicit publishing', () => {
  assert.match(packageJson.scripts['package:win'], /--publish never$/);
  assert.match(packageJson.scripts['package:mac'], /--publish never$/);
  assert.match(packageJson.scripts['package:linux'], /--publish never$/);
});

test('CI retains unsigned macOS test installers without publishing a release', () => {
  assert.match(ciWorkflow, /name: Upload unsigned macOS test installers/);
  assert.match(ciWorkflow, /if: matrix\.command == 'package:mac'/);
  assert.match(ciWorkflow, /release\/\*\.dmg/);
  assert.match(ciWorkflow, /retention-days: 7/);
});

test('tag releases build and publish every supported desktop package', () => {
  assert.match(releaseWorkflow, /command: package:win/);
  assert.match(releaseWorkflow, /command: package:mac/);
  assert.match(releaseWorkflow, /command: package:linux/);
  assert.match(releaseWorkflow, /run: npm run \$\{\{ matrix\.command \}\}/);
  assert.match(releaseWorkflow, /release\/\*\.exe/);
  assert.match(releaseWorkflow, /release\/\*\.dmg/);
  assert.match(releaseWorkflow, /release\/\*\.AppImage/);
  assert.match(releaseWorkflow, /release\/\*\.deb/);
  assert.match(releaseWorkflow, /release:verify-all/);
});

test('prebuilt package icons are valid binary assets', async () => {
  const png = await readFile(new URL('../build/icon.png', import.meta.url));
  const ico = await readFile(new URL('../build/icon.ico', import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0]);
  assert.ok(png.length > 1_000);
  assert.ok(ico.length > 1_000);
});
