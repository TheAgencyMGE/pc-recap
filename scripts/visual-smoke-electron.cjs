const assert = require('node:assert/strict');
const { mkdir, rm, writeFile } = require('node:fs/promises');
const { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = process.env.PC_RECAP_SMOKE_ROOT;
if (!root || process.env.PC_RECAP_VISUAL_SMOKE !== '1') throw new Error('Visual smoke must run through scripts/visual-smoke.mjs.');
const artifactDirectory = resolve(root, 'artifacts', 'visual-smoke');
const viewportMatrix = JSON.parse(process.env.PC_RECAP_SMOKE_VIEWPORTS || '[{"width":980,"height":680},{"width":1440,"height":900}]');
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
    const viewportResults = [];
    let layout;
    let minimumImage;
    for (const viewport of viewportMatrix) {
      window.setSize(viewport.width, viewport.height);
      await delay(220);
      window.webContents.invalidate();
      await delay(80);
      layout = await inspectHome(window);
      viewportResults.push({ width: viewport.width, height: viewport.height, ...layout });
      assert.equal(layout.searchButtonCount, 1);
      assert.equal(layout.symbolsContained, true);
      assert.equal(layout.horizontalOverflow, false);
      assert.equal(layout.todayCoverVisible, true);
      assert.equal(layout.firstShelfCoverVisible, true);
      if (viewport.width === 980 && viewport.height === 680) minimumImage = await save(window, 'home-minimum.png');
      if (viewport.width === 1440 && viewport.height === 900) await save(window, 'home-default.png');
    }
    window.setSize(980, 680);
    await delay(160);
    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Search"]').click()`);
    await waitForVisible(window, `[role="dialog"][aria-label="Search PC Recap"]`);
    await delay(250);
    window.webContents.invalidate();
    await delay(75);
    const searchImage = await save(window, 'search-overlay.png');
    assert.notDeepEqual(searchImage, minimumImage, 'Search overlay screenshot must differ from the home screenshot.');

    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Open On this day"]').click()`);
    await waitForVisible(window, '.day-echoes > article');
    await delay(450);
    window.webContents.invalidate();
    await delay(80);
    const onThisDay = await window.webContents.executeJavaScript(`(() => {
      const card = document.querySelector('.day-echoes__card').getBoundingClientRect();
      const icon = document.querySelector('.day-echoes__card > svg').getBoundingClientRect();
      const year = document.querySelector('.day-echoes__year').getBoundingClientRect();
      const scroll = document.querySelector('.interior-scroll');
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        nestedHorizontalOverflow: scroll.scrollWidth > scroll.clientWidth,
        iconContained: icon.left >= card.left && icon.right <= card.right && icon.top >= card.top && icon.bottom <= card.bottom,
        yearClearOfCard: year.right <= card.left + 1,
      };
    })()`);
    assert.equal(onThisDay.horizontalOverflow, false);
    assert.equal(onThisDay.nestedHorizontalOverflow, false);
    assert.equal(onThisDay.iconContained, true);
    assert.equal(onThisDay.yearClearOfCard, true);
    await save(window, 'on-this-day.png');

    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Back home"]').click()`);
    await waitForVisible(window, '.today-feature .collection-cover');
    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Search"]').click()`);
    await waitForVisible(window, '[aria-label="Open Yearly recap"]');
    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Open Yearly recap"]').click()`);
    await waitForVisible(window, '.yearly-recap');
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.recap-scene--system'))`);
      if (ready) break;
      await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Next scene"]')?.click()`);
      await delay(520);
    }
    await waitForVisible(window, '.recap-scene--system');
    const yearlySystem = await window.webContents.executeJavaScript(`(() => {
      const scene = document.querySelector('.recap-scene--system').getBoundingClientRect();
      const facts = document.querySelector('.recap-system-facts').getBoundingClientRect();
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        contentContained: facts.left >= scene.left && facts.right <= scene.right && facts.top >= scene.top && facts.bottom <= scene.bottom,
      };
    })()`);
    assert.equal(yearlySystem.horizontalOverflow, false);
    assert.equal(yearlySystem.contentContained, true);
    await save(window, 'yearly-system.png');

    const report = { ...layout, viewports: viewportResults, onThisDay, yearlySystem, searchDialogVisible: true, isolatedProfile: true, screenshots: ['home-default.png', 'home-minimum.png', 'search-overlay.png', 'on-this-day.png', 'yearly-system.png'] };
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

async function inspectHome(window) {
  return window.webContents.executeJavaScript(`(() => {
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
}

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
