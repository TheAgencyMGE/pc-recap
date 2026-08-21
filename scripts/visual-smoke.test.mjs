import assert from 'node:assert/strict';
import test from 'node:test';
import { basename, join } from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { artifactNames, buildSmokeCommand, resolveSmokePaths, viewportMatrix, waitForReport } from './visual-smoke.mjs';

test('visual smoke uses an Electron helper and isolated screenshot artifacts', () => {
  const paths = resolveSmokePaths('C:\\workspace\\pc-recap');
  assert.equal(basename(paths.helper), 'visual-smoke-electron.cjs');
  assert.equal(basename(paths.renderer), 'index.html');
  assert.deepEqual(artifactNames, ['home-default.png', 'home-minimum.png', 'search-overlay.png', 'on-this-day.png', 'yearly-system.png']);
  assert.deepEqual(viewportMatrix.map(({ width, height }) => `${width}x${height}`), [
    '980x680', '1024x768', '1280x720', '1366x768', '1440x900', '1920x1080',
  ]);
  const command = buildSmokeCommand(process.cwd());
  assert.ok(command.executable.toLowerCase().includes('electron'));
  assert.deepEqual(command.args, [command.paths.helper]);
});

test('visual smoke waits for the Electron report instead of racing process startup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pc-recap-smoke-test-'));
  const reportPath = join(directory, 'report.json');
  const write = new Promise((resolveWrite, rejectWrite) => setTimeout(() => {
    writeFile(reportPath, JSON.stringify({ ready: true })).then(resolveWrite, rejectWrite);
  }, 50));
  try {
    assert.deepEqual(await waitForReport(reportPath, 1_000), { ready: true });
    await write;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('visual smoke removes stale reports before starting Electron', async () => {
  const runner = await readFile(join(process.cwd(), 'scripts', 'visual-smoke.mjs'), 'utf8');
  const removeReport = runner.indexOf("await rm(resolve(command.paths.artifactDirectory, 'report.json'), { force: true })");
  const spawnElectron = runner.indexOf('const child = spawn(');
  assert.ok(removeReport >= 0, 'the runner must remove a previous report');
  assert.ok(removeReport < spawnElectron, 'the stale report must be removed before Electron starts');
});

test('visual smoke waits for the populated Today cover before its first screenshot', async () => {
  const helper = await readFile(join(process.cwd(), 'scripts', 'visual-smoke-electron.cjs'), 'utf8');
  const readyCheck = helper.indexOf("await waitFor(window, '.today-feature .collection-cover')");
  const paintHiddenWindow = helper.indexOf('window.showInactive()');
  const invalidateSurface = helper.indexOf('window.webContents.invalidate()');
  const firstCapture = helper.indexOf("await save(window, 'home-default.png')");
  assert.ok(readyCheck >= 0, 'the helper must wait for recap data to populate');
  assert.ok(readyCheck < firstCapture, 'the populated-home check must run before the first capture');
  assert.ok(paintHiddenWindow >= 0 && paintHiddenWindow < firstCapture, 'the off-screen window must be painted before capture');
  assert.ok(invalidateSurface >= 0 && invalidateSurface < firstCapture, 'the full rendering surface must be invalidated before capture');
  assert.match(helper, /assert\.equal\(layout\.todayCoverVisible, true\)/);
  assert.match(helper, /assert\.equal\(layout\.firstShelfCoverVisible, true\)/);
  assert.match(helper, /await waitForVisible\(window, `\[role="dialog"\]/);
  assert.match(helper, /assert\.notDeepEqual\(searchImage, minimumImage/);
  assert.match(helper, /\.day-echoes__card/);
  assert.match(helper, /\.recap-scene--system/);
  assert.match(helper, /viewportResults/);
});
