import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('cross-platform package metadata uses electron-builder 26 schema locations', () => {
  assert.equal(packageJson.desktopName, 'pc-recap.desktop');
  assert.deepEqual(packageJson.build.electronLanguages, ['en-US']);
  assert.equal(packageJson.build.linux.desktopName, undefined);
  assert.equal(packageJson.build.linux.syncDesktopName, true);
  assert.equal(packageJson.build.linux.executableName, 'pc-recap');
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

test('prebuilt package icons are valid binary assets', async () => {
  const png = await readFile(new URL('../build/icon.png', import.meta.url));
  const ico = await readFile(new URL('../build/icon.ico', import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0]);
  assert.ok(png.length > 1_000);
  assert.ok(ico.length > 1_000);
});
