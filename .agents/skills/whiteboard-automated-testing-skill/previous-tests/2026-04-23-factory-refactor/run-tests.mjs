// Factory Refactor Smoke Test
// Tests mountCosmoboard factory pattern for braindump.html and cosmoboard.html
// Run: node run-tests.mjs (from the test folder) or via npx playwright

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://127.0.0.1:4173';

const results = {
  braindumpDesktopLoad: null,
  cosmoboardDesktopLoad: null,
  consoleErrors: null,
  twoBoardInjectionTest: null,
  notes: []
};

const allConsoleErrors = [];

async function runTests() {
  const browser = await chromium.launch({ headless: true });

  // ─── TEST 1: Braindump desktop ───────────────────────────────────────────
  console.log('\n[1/3] Testing braindump.html (desktop 1440x960)...');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const pageErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        pageErrors.push(text);
        allConsoleErrors.push({ page: 'braindump', msg: text });
      }
    });
    page.on('pageerror', err => {
      pageErrors.push(err.message);
      allConsoleErrors.push({ page: 'braindump', msg: err.message });
    });

    await page.goto(`${BASE_URL}/braindump.html`, { waitUntil: 'domcontentloaded' });

    // Clear localStorage keys
    await page.evaluate(() => {
      localStorage.removeItem('board:braindump');
      localStorage.removeItem('braindump-canvas');
    });

    // Reload and wait for network idle
    await page.reload({ waitUntil: 'networkidle' });

    // Verify: data-board-app count
    const boardAppCount = await page.evaluate(() =>
      document.querySelectorAll('[data-board-app="true"]').length
    );
    console.log(`  data-board-app count: ${boardAppCount} (expected 1)`);

    // Verify: mountCosmoboard accessible on window
    const hasMountFn = await page.evaluate(() => typeof window.mountCosmoboard === 'function');
    console.log(`  window.mountCosmoboard is function: ${hasMountFn}`);
    // Note: braindump.js is a plain script (not ES module), so mountCosmoboard IS window.mountCosmoboard

    // Verify: board loaded (bd-item elements or canvas visible)
    await page.waitForTimeout(1500); // let board render
    const bdItemCount = await page.evaluate(() =>
      document.querySelectorAll('.bd-item').length
    );
    const canvasVisible = await page.evaluate(() => {
      const canvas = document.querySelector('[data-board-role="canvas"]') || document.querySelector('#braindump-canvas');
      return canvas ? window.getComputedStyle(canvas).display !== 'none' : false;
    });
    console.log(`  .bd-item count: ${bdItemCount}, canvas visible: ${canvasVisible}`);

    // Click select tool and verify aria-pressed
    const selectToolBtn = await page.$('[data-tool="select"]');
    let selectAriaPressed = null;
    if (selectToolBtn) {
      await selectToolBtn.click();
      await page.waitForTimeout(200);
      selectAriaPressed = await page.evaluate(() => {
        const btn = document.querySelector('[data-tool="select"]');
        return btn ? btn.getAttribute('aria-pressed') : null;
      });
      console.log(`  select tool aria-pressed after click: ${selectAriaPressed}`);
    } else {
      console.log('  select tool button not found (may use different selector)');
    }

    // Click pan tool
    const panToolBtn = await page.$('[data-tool="pan"]');
    if (panToolBtn) {
      await panToolBtn.click();
      await page.waitForTimeout(200);
      const panAriaPressed = await page.evaluate(() => {
        const btn = document.querySelector('[data-tool="pan"]');
        return btn ? btn.getAttribute('aria-pressed') : null;
      });
      console.log(`  pan tool aria-pressed after click: ${panAriaPressed}`);
    } else {
      console.log('  pan tool button not found');
    }

    // Click draw tool
    const drawToolBtn = await page.$('[data-tool="draw"]');
    if (drawToolBtn) {
      await drawToolBtn.click();
      await page.waitForTimeout(200);
      const drawAriaPressed = await page.evaluate(() => {
        const btn = document.querySelector('[data-tool="draw"]');
        return btn ? btn.getAttribute('aria-pressed') : null;
      });
      console.log(`  draw tool aria-pressed after click: ${drawAriaPressed}`);
    } else {
      console.log('  draw tool button not found');
    }

    // Pan: drag from center
    const viewportCenter = { x: 720, y: 480 };
    const canvasTransformBefore = await page.evaluate(() => {
      const canvas = document.querySelector('[data-board-role="canvas"]') || document.querySelector('#braindump-canvas');
      return canvas ? canvas.style.transform : null;
    });
    await page.mouse.move(viewportCenter.x, viewportCenter.y);
    await page.mouse.down();
    await page.mouse.move(viewportCenter.x + 100, viewportCenter.y + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const canvasTransformAfter = await page.evaluate(() => {
      const canvas = document.querySelector('[data-board-role="canvas"]') || document.querySelector('#braindump-canvas');
      return canvas ? canvas.style.transform : null;
    });
    const transformChanged = canvasTransformBefore !== canvasTransformAfter;
    console.log(`  canvas transform before: ${canvasTransformBefore}`);
    console.log(`  canvas transform after:  ${canvasTransformAfter}`);
    console.log(`  transform changed: ${transformChanged}`);

    // Screenshot
    const screenshotPath = join(__dirname, 'braindump-factory-desktop.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  screenshot saved: braindump-factory-desktop.png`);

    // Evaluate errors (400 from /api/save-board is expected/OK)
    const unexpectedErrors = pageErrors.filter(e => !e.includes('400') && !e.includes('save-board'));
    console.log(`  console errors (non-400): ${unexpectedErrors.length}`);
    if (unexpectedErrors.length > 0) {
      console.log('  unexpected errors:', unexpectedErrors);
    }

    const boardLoaded = bdItemCount > 0 || canvasVisible;
    results.braindumpDesktopLoad = boardAppCount === 1 && boardLoaded ? 'pass' : 'fail';
    results.consoleErrors = unexpectedErrors.length === 0 ? 'pass' : 'fail';

    results.notes.push(`braindump: boardAppCount=${boardAppCount}, hasMountFn=${hasMountFn}, bdItems=${bdItemCount}, canvasVisible=${canvasVisible}, transformChanged=${transformChanged}`);
    results.notes.push(`braindump: unexpectedErrors=${unexpectedErrors.length}`);
    if (unexpectedErrors.length > 0) results.notes.push(`braindump errors: ${unexpectedErrors.join('; ')}`);

    await context.close();
  }

  // ─── TEST 2: Cosmoboard desktop ─────────────────────────────────────────
  console.log('\n[2/3] Testing cosmoboard.html (desktop 1440x960)...');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const pageErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        pageErrors.push(text);
        allConsoleErrors.push({ page: 'cosmoboard', msg: text });
      }
    });
    page.on('pageerror', err => {
      pageErrors.push(err.message);
      allConsoleErrors.push({ page: 'cosmoboard', msg: err.message });
    });

    await page.goto(`${BASE_URL}/cosmoboard.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify board loaded
    const boardAppCount = await page.evaluate(() =>
      document.querySelectorAll('[data-board-app="true"]').length
    );
    const bdItemCount = await page.evaluate(() =>
      document.querySelectorAll('.bd-item').length
    );
    const canvasVisible = await page.evaluate(() => {
      const canvas = document.querySelector('[data-board-role="canvas"]') || document.querySelector('#braindump-canvas');
      return canvas ? window.getComputedStyle(canvas).display !== 'none' : false;
    });

    // Check onboarding panel
    const onboardingVisible = await page.evaluate(() => {
      // Try several likely selectors for the onboarding panel
      const selectors = [
        '[data-board-ui="onboarding"]',
        '[data-board-ui="onboarding-panel"]',
        '.bd-onboarding',
        '.cosmoboard-onboarding',
        '[data-cosmoboard-onboarding]',
        '#cosmoboard-onboarding',
        '.onboarding-panel'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return { found: true, selector: sel, visible: window.getComputedStyle(el).display !== 'none' };
      }
      return { found: false };
    });
    console.log(`  boardAppCount: ${boardAppCount}, bdItems: ${bdItemCount}, canvasVisible: ${canvasVisible}`);
    console.log(`  onboarding panel: ${JSON.stringify(onboardingVisible)}`);

    const screenshotPath = join(__dirname, 'cosmoboard-factory-desktop.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  screenshot saved: cosmoboard-factory-desktop.png`);

    const unexpectedErrors = pageErrors.filter(e => !e.includes('400') && !e.includes('save-board'));
    console.log(`  console errors (non-400): ${unexpectedErrors.length}`);
    if (unexpectedErrors.length > 0) {
      console.log('  unexpected errors:', unexpectedErrors);
    }

    const boardLoaded = bdItemCount > 0 || canvasVisible;
    results.cosmoboardDesktopLoad = boardAppCount === 1 && boardLoaded ? 'pass' : 'fail';
    // Merge console errors result (use worst case)
    if (unexpectedErrors.length > 0) results.consoleErrors = 'fail';

    results.notes.push(`cosmoboard: boardAppCount=${boardAppCount}, bdItems=${bdItemCount}, canvasVisible=${canvasVisible}`);
    results.notes.push(`cosmoboard: onboarding=${JSON.stringify(onboardingVisible)}`);
    results.notes.push(`cosmoboard: unexpectedErrors=${unexpectedErrors.length}`);
    if (unexpectedErrors.length > 0) results.notes.push(`cosmoboard errors: ${unexpectedErrors.join('; ')}`);

    await context.close();
  }

  // ─── TEST 3: Two boards on one page ─────────────────────────────────────
  console.log('\n[3/3] Testing two-board injection on braindump.html...');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const pageErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        pageErrors.push(text);
      }
    });
    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    await page.goto(`${BASE_URL}/braindump.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Check if mountCosmoboard is on window
    const hasMountFn = await page.evaluate(() => typeof window.mountCosmoboard === 'function');
    console.log(`  window.mountCosmoboard available: ${hasMountFn}`);

    if (!hasMountFn) {
      results.twoBoardInjectionTest = 'not-run';
      results.notes.push('two-board test: mountCosmoboard not exposed on window (module scope), skipped injection');
    } else {
      // Inject second board
      const injectionResult = await page.evaluate(() => {
        try {
          const firstBoard = document.querySelector('[data-board-app="true"]');
          if (!firstBoard) return { ok: false, reason: 'no first board found' };
          const secondBoard = firstBoard.cloneNode(true);
          secondBoard.id = 'braindump-viewport-2';
          secondBoard.dataset.boardSlug = 'braindump-2';
          secondBoard.dataset.boardStorageKey = 'board:braindump-2';
          const pageContent = document.querySelector('.page-content');
          if (!pageContent) return { ok: false, reason: 'no .page-content found' };
          pageContent.appendChild(secondBoard);
          window.mountCosmoboard(secondBoard);
          return { ok: true };
        } catch (e) {
          return { ok: false, reason: e.message };
        }
      });
      console.log(`  injection result: ${JSON.stringify(injectionResult)}`);

      await page.waitForTimeout(1000);

      // _mountedBoardCount is module-level, NOT on window unless explicitly set
      // braindump.js is a plain script (not ES module), so _mountedBoardCount IS accessible via window
      const mountedCount = await page.evaluate(() => {
        // Try window access (plain script)
        if (typeof window._mountedBoardCount !== 'undefined') return window._mountedBoardCount;
        return null;
      });
      console.log(`  _mountedBoardCount on window: ${mountedCount}`);

      const boardCount = await page.evaluate(() =>
        document.querySelectorAll('[data-board-app="true"]').length
      );
      console.log(`  total [data-board-app="true"] elements: ${boardCount}`);

      const screenshotPath = join(__dirname, 'two-boards-page.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  screenshot saved: two-boards-page.png`);

      const injectionErrors = pageErrors.filter(e => !e.includes('400') && !e.includes('save-board'));
      console.log(`  injection console errors: ${injectionErrors.length}`);
      if (injectionErrors.length > 0) console.log('  errors:', injectionErrors);

      if (injectionResult.ok && injectionErrors.length === 0) {
        results.twoBoardInjectionTest = 'pass';
      } else if (!injectionResult.ok) {
        results.twoBoardInjectionTest = 'fail';
      } else {
        results.twoBoardInjectionTest = 'fail';
      }

      results.notes.push(`two-board: injection=${JSON.stringify(injectionResult)}, boardCount=${boardCount}, _mountedBoardCount=${mountedCount}`);
      results.notes.push(`two-board: injectionErrors=${injectionErrors.length}`);
      if (injectionErrors.length > 0) results.notes.push(`two-board errors: ${injectionErrors.join('; ')}`);
    }

    await context.close();
  }

  await browser.close();

  // ─── Print summary ───────────────────────────────────────────────────────
  console.log('\n===== RESULTS =====');
  console.log(`braindump desktop load: ${results.braindumpDesktopLoad}`);
  console.log(`cosmoboard desktop load: ${results.cosmoboardDesktopLoad}`);
  console.log(`console errors (beyond expected 400s): ${results.consoleErrors}`);
  console.log(`two-board injection test: ${results.twoBoardInjectionTest}`);
  console.log('\nNotes:');
  results.notes.forEach(n => console.log(`  - ${n}`));

  // Export results for the test-log writer
  writeFileSync(join(__dirname, '_results.json'), JSON.stringify(results, null, 2));
  console.log('\nResults written to _results.json');
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
