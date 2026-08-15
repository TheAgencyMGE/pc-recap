const assert = require('node:assert/strict');
const { mkdir, rm, writeFile } = require('node:fs/promises');
const { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = process.env.PC_RECAP_SMOKE_ROOT;
if (!root || process.env.PC_RECAP_VISUAL_SMOKE !== '1') throw new Error('Visual smoke must run through scripts/visual-smoke.mjs.');
const artifactDirectory = resolve(root, 'artifacts', 'visual-smoke');
mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(resolve(artifactDirectory, 'stage-log.jsonl'), '');
writeFileSync(resolve(artifactDirectory, 'stage.json'), JSON.stringify({ stage: 'helper-loaded', electron: process.versions.electron ?? null }));
const isolatedProfile = mkdtempSync(resolve(tmpdir(), 'pc-recap-visual-smoke-'));

app.disableHardwareAcceleration();
app.setPath('userData', isolatedProfile);
app.whenReady().then(async () => {
  writeFileSync(resolve(artifactDirectory, 'stage.json'), JSON.stringify({ stage: 'electron-ready', electron: process.versions.electron ?? null }));
  await mkdir(artifactDirectory, { recursive: true });
  const window = new BrowserWindow({
    x: -32_000, y: -32_000, width: 1440, height: 920, minWidth: 980, minHeight: 680, show: false, backgroundColor: '#F6F6F1',
    webPreferences: {
      preload: resolve(root, 'scripts', 'visual-smoke-preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
    },
  });
  window.on('closed', () => writeStage('window-closed'));
  window.webContents.on('render-process-gone', (_event, details) => writeStage('renderer-gone', details));
  window.webContents.on('unresponsive', () => writeStage('renderer-unresponsive'));
  try {
    await window.loadFile(resolve(root, 'dist', 'renderer', 'index.html'));
    window.showInactive();
    writeStage('renderer-loaded');
    await waitFor(window, `[aria-label="Search"]`);
    writeStage('shell-ready');
    await waitFor(window, '.today-feature .collection-cover');
    writeStage('home-ready');
    await delay(750);
    window.webContents.invalidate();
    await delay(100);
    writeStage('animation-settled');
    const layout = await window.webContents.executeJavaScript(`(() => {
      const symbols = [...document.querySelectorAll('.collection-cover__symbol')];
      const isVisible = (element) => {
        if (!element) return false;
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return bounds.width > 0 && bounds.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0.95;
      };
      const contained = symbols.every((symbol) => {
        const child = symbol.getBoundingClientRect();
        const parent = symbol.closest('.collection-cover').getBoundingClientRect();
        return child.left >= parent.left && child.right <= parent.right && child.top >= parent.top && child.bottom <= parent.bottom;
      });
      return {
        searchButtonCount: document.querySelectorAll('[aria-label="Search"]').length,
        symbolsContained: contained,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        todayCoverVisible: isVisible(document.querySelector('.today-feature .collection-cover')),
        firstShelfCoverVisible: isVisible(document.querySelector('.cover-shelf__track .collection-cover')),
      };
    })()`);
    assert.equal(layout.searchButtonCount, 1);
    assert.equal(layout.symbolsContained, true);
    assert.equal(layout.horizontalOverflow, false);
    assert.equal(layout.todayCoverVisible, true);
    assert.equal(layout.firstShelfCoverVisible, true);
    await save(window, 'home-default.png');
    window.setSize(980, 680);
    await delay(250);
    const minimumImage = await save(window, 'home-minimum.png');
    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Search"]').click()`);
    await waitForVisible(window, `[role="dialog"][aria-label="Search PC Recap"]`);
    await delay(250);
    window.webContents.invalidate();
    await delay(75);
    const searchImage = await save(window, 'search-overlay.png');
    assert.notDeepEqual(searchImage, minimumImage, 'Search overlay screenshot must differ from the home screenshot.');
    const report = { ...layout, searchDialogVisible: true, isolatedProfile: true, screenshots: ['home-default.png', 'home-minimum.png', 'search-overlay.png'] };
    await writeFile(resolve(artifactDirectory, 'report.json'), JSON.stringify(report, null, 2));
    writeStage('complete');
  } finally {
    window.destroy();
    await rm(isolatedProfile, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  writeFileSync(resolve(artifactDirectory, 'stage.json'), JSON.stringify({ stage: 'failed', error: error?.stack ?? String(error) }));
  console.error(error);
  app.exit(1);
});

async function save(window, name) {
  const image = await window.webContents.capturePage();
  const buffer = image.toPNG();
  await writeFile(resolve(artifactDirectory, name), buffer);
  return buffer;
}

async function waitFor(window, selector) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await window.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${selector}`);
}

async function waitForVisible(window, selector) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const visible = await window.webContents.executeJavaScript(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > .95;
    })()`);
    if (visible) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for visible ${selector}`);
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function writeStage(stage, details) {
  const record = { stage, details, electron: process.versions.electron ?? null };
  writeFileSync(resolve(artifactDirectory, 'stage.json'), JSON.stringify(record));
  appendFileSync(resolve(artifactDirectory, 'stage-log.jsonl'), `${JSON.stringify(record)}\n`);
}
