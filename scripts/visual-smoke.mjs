import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
export const viewportMatrix = [
  { width: 980, height: 680 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
export const artifactNames = ['home-default.png', 'home-minimum.png', 'search-overlay.png', 'on-this-day.png', 'yearly-system.png'];

export function resolveSmokePaths(root = resolve(currentDirectory, '..')) {
  return {
    root,
    artifactDirectory: resolve(root, 'artifacts', 'visual-smoke'),
    helper: resolve(root, 'scripts', 'visual-smoke-electron.cjs'),
    renderer: resolve(root, 'dist', 'renderer', 'index.html'),
  };
}

export function buildSmokeCommand(root = resolve(currentDirectory, '..')) {
  const require = createRequire(import.meta.url);
  const electron = require('electron');
  const paths = resolveSmokePaths(root);
  return { executable: electron, args: [paths.helper], paths };
}

export async function runVisualSmoke(root = resolve(currentDirectory, '..')) {
  const command = buildSmokeCommand(root);
  await mkdir(command.paths.artifactDirectory, { recursive: true });
  await rm(resolve(command.paths.artifactDirectory, 'report.json'), { force: true });
  const environment = { ...process.env, PC_RECAP_SMOKE_ROOT: root, PC_RECAP_VISUAL_SMOKE: '1' };
  environment.PC_RECAP_SMOKE_VIEWPORTS = JSON.stringify(viewportMatrix);
  delete environment.ELECTRON_RUN_AS_NODE;
  await new Promise((resolveRun, reject) => {
    const child = spawn(command.executable, command.args, { cwd: root, env: environment, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolveRun() : reject(new Error(`Visual smoke exited with code ${code ?? 'unknown'}.`)));
  });
  const report = await waitForReport(resolve(command.paths.artifactDirectory, 'report.json'));
  assert.equal(report.searchButtonCount, 1);
  assert.equal(report.symbolsContained, true);
  assert.equal(report.horizontalOverflow, false);
  assert.equal(report.todayCoverVisible, true);
  assert.equal(report.firstShelfCoverVisible, true);
  assert.equal(report.searchDialogVisible, true);
  assert.equal(report.viewports.length, viewportMatrix.length);
  for (const viewport of report.viewports) {
    assert.equal(viewport.horizontalOverflow, false, `Horizontal overflow at ${viewport.width}x${viewport.height}`);
    assert.equal(viewport.symbolsContained, true, `Cover symbol escaped at ${viewport.width}x${viewport.height}`);
    assert.equal(viewport.todayCoverVisible, true, `Today cover hidden at ${viewport.width}x${viewport.height}`);
  }
  assert.equal(report.onThisDay.iconContained, true);
  assert.equal(report.onThisDay.yearClearOfCard, true);
  assert.equal(report.onThisDay.nestedHorizontalOverflow, false);
  assert.equal(report.yearlySystem.contentContained, true);
  for (const name of artifactNames) assert.ok(report.screenshots.includes(name), `Missing ${name}`);
  return report;
}

export async function waitForReport(path, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error(`Visual smoke did not write ${path} before the timeout.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await runVisualSmoke();
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
