/**
 * Preview Mode Smoke Test
 * Tests: braindump loads, cosmoboard loads, preview mode JS injection
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:4173';
const OUT_DIR = path.join(
  'C:\\Users\\evren\\Documents\\GitHub\\proto_website',
  '.agents', 'skills', 'whiteboard-automated-testing-skill',
  'previous-tests', '2026-04-23-preview-mode'
);

const results = {
  braindump: 'fail',
  cosmoboard: 'fail',
  previewMode: 'fail',
};
const notes = [];

async function collectErrors(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // 400 from /api/save-board is expected
      if (!text.includes('/api/save-board')) {
        errors.push(text);
      }
    }
  });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });

  // ── Test 1: Braindump ──────────────────────────────────────────────────────
  console.log('\n[1/3] Testing braindump...');
  const bdPage = await context.newPage();
  const bdErrors = await collectErrors(bdPage);

  try {
    await bdPage.goto(`${BASE_URL}/braindump.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Clear localStorage keys and reload
    await bdPage.evaluate(() => {
      localStorage.removeItem('board:braindump');
      localStorage.removeItem('braindump-canvas');
    });
    await bdPage.reload({ waitUntil: 'networkidle', timeout: 15000 });

    // Wait for board to mount
    await bdPage.waitForSelector('.bd-item, canvas', { timeout: 10000 }).catch(() => null);

    const bdItemCount = await bdPage.locator('.bd-item').count();
    const canvasVisible = await bdPage.locator('canvas').isVisible().catch(() => false);
    console.log(`  .bd-item count: ${bdItemCount}, canvas visible: ${canvasVisible}`);

    if (bdItemCount > 0 || canvasVisible) {
      // Try switching to draw tool and drawing a stroke
      try {
        // Look for draw/pen tool button
        const drawBtn = bdPage.locator('[data-tool="draw"], [data-tool="pen"], button[title*="draw" i], button[title*="pen" i], .tool-draw, .tool-pen').first();
        const drawBtnVisible = await drawBtn.isVisible().catch(() => false);

        if (drawBtnVisible) {
          await drawBtn.click();
          console.log('  Clicked draw tool');
        } else {
          // Try keyboard shortcut 'd' or 'p'
          await bdPage.keyboard.press('d');
          console.log('  Pressed d for draw tool');
        }

        // Draw a short stroke on canvas
        const canvas = bdPage.locator('canvas').first();
        const box = await canvas.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          await bdPage.mouse.move(cx, cy);
          await bdPage.mouse.down();
          await bdPage.mouse.move(cx + 50, cy + 30);
          await bdPage.mouse.move(cx + 80, cy + 10);
          await bdPage.mouse.up();
          console.log('  Drew stroke on canvas');
        }
      } catch (e) {
        console.log('  Draw tool interaction skipped:', e.message);
        notes.push('Braindump: draw tool interaction skipped - ' + e.message);
      }

      results.braindump = 'pass';
      console.log('  PASS');
    } else {
      notes.push('Braindump: no .bd-item and no canvas found');
      console.log('  FAIL - board not mounted');
    }
  } catch (e) {
    notes.push('Braindump error: ' + e.message);
    console.log('  FAIL:', e.message);
  }

  if (bdErrors.length > 0) {
    notes.push('Braindump console errors: ' + bdErrors.join('; '));
    console.log('  Console errors:', bdErrors);
  }

  await bdPage.screenshot({ path: path.join(OUT_DIR, 'braindump-still-works.png') });
  await bdPage.close();

  // ── Test 2: Cosmoboard ─────────────────────────────────────────────────────
  console.log('\n[2/3] Testing cosmoboard...');
  const cbContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const cbPage = await cbContext.newPage();
  const cbErrors = await collectErrors(cbPage);

  try {
    await cbPage.goto(`${BASE_URL}/cosmoboard.html`, { waitUntil: 'networkidle', timeout: 15000 });

    await cbPage.waitForSelector('.bd-item', { timeout: 10000 }).catch(() => null);

    // Check board loaded and onboarding lives inside the board instead of a fixed page panel
    const boardApp = await cbPage.locator('[data-board-app="true"]').isVisible().catch(() => false);
    const itemCount = await cbPage.locator('.bd-item').count().catch(() => 0);
    const onboarding = await cbPage.evaluate(() =>
      document.body.innerText.includes('A first onboarding board inside the current site')
    );
    const fixedPanel = await cbPage.locator('.board-page-panel').isVisible().catch(() => false);

    console.log(`  board-app visible: ${boardApp}, board items: ${itemCount}, onboarding in board: ${onboarding}, fixed panel: ${fixedPanel}`);

    if (boardApp && itemCount > 0 && onboarding && !fixedPanel) {
      results.cosmoboard = 'pass';
      console.log('  PASS');
    } else {
      if (!boardApp) {
        notes.push('Cosmoboard: page loaded but board app element not found');
      }
      if (itemCount === 0) {
        notes.push('Cosmoboard: board mounted without any rendered items');
      }
      if (!onboarding) {
        notes.push('Cosmoboard: onboarding content was not found inside board items');
      }
      if (fixedPanel) {
        notes.push('Cosmoboard: fixed board-page-panel is still rendered');
      }
      console.log('  FAIL');
    }
  } catch (e) {
    notes.push('Cosmoboard error: ' + e.message);
    console.log('  FAIL:', e.message);
  }

  if (cbErrors.length > 0) {
    notes.push('Cosmoboard console errors: ' + cbErrors.join('; '));
    console.log('  Console errors:', cbErrors);
  }

  await cbPage.screenshot({ path: path.join(OUT_DIR, 'cosmoboard-still-works.png') });

  // ── Test 3: Preview Mode Injection ─────────────────────────────────────────
  console.log('\n[3/3] Testing preview mode injection...');
  const pmErrors = [];
  cbPage.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('/api/save-board')) {
        pmErrors.push(text);
      }
    }
  });

  try {
    const injectionResult = await cbPage.evaluate(async () => {
      const src = document.querySelector('[data-board-app="true"]');
      if (!src) return { error: 'No [data-board-app="true"] element found' };

      const preview = src.cloneNode(true);
      preview.dataset.boardMode = 'preview';
      preview.dataset.boardSlug = 'braindump-preview';
      preview.dataset.boardStorageKey = 'board:braindump';
      preview.dataset.boardFullHref = 'braindump.html';
      preview.removeAttribute('id');

      const pageContent = document.querySelector('.page-content');
      if (!pageContent) return { error: 'No .page-content element found' };
      pageContent.appendChild(preview);

      let mountError = null;
      try {
        if (typeof window.mountCosmoboard === 'function') {
          window.mountCosmoboard(preview);
        } else {
          mountError = 'window.mountCosmoboard is not a function (type: ' + typeof window.mountCosmoboard + ')';
        }
      } catch (e) {
        mountError = e.message;
      }

      // Give it a moment to settle
      await new Promise(r => setTimeout(r, 1500));

      return {
        previewModeAttr: preview.dataset.boardMode,
        fullHref: preview.dataset.boardFullHref,
        mountError,
        mountCosmoboardType: typeof window.mountCosmoboard,
      };
    });

    console.log('  Injection result:', JSON.stringify(injectionResult, null, 2));

    if (injectionResult.error) {
      notes.push('Preview injection: ' + injectionResult.error);
      results.previewMode = 'fail';
    } else {
      const previewModeOk = injectionResult.previewModeAttr === 'preview';
      const fullHrefOk = injectionResult.fullHref === 'braindump.html';
      const noMountError = !injectionResult.mountError;
      const noPmErrors = pmErrors.length === 0;

      console.log(`  data-board-mode="preview": ${previewModeOk}`);
      console.log(`  boardFullHref set: ${fullHrefOk}`);
      console.log(`  mountCosmoboard: ${injectionResult.mountCosmoboardType}`);
      console.log(`  mount error: ${injectionResult.mountError || 'none'}`);
      console.log(`  pm console errors: ${pmErrors.length}`);

      if (injectionResult.mountError) {
        notes.push('Preview mode: mountCosmoboard error - ' + injectionResult.mountError);
      }
      if (pmErrors.length > 0) {
        notes.push('Preview mode console errors: ' + pmErrors.join('; '));
      }

      if (previewModeOk && fullHrefOk && noMountError && noPmErrors) {
        results.previewMode = 'pass';
        console.log('  PASS');
      } else if (previewModeOk && fullHrefOk) {
        results.previewMode = 'partial';
        console.log('  PARTIAL');
      } else {
        results.previewMode = 'fail';
        console.log('  FAIL');
      }
    }
  } catch (e) {
    notes.push('Preview injection JS error: ' + e.message);
    console.log('  FAIL:', e.message);
  }

  await cbPage.screenshot({ path: path.join(OUT_DIR, 'preview-mode-injection.png') });
  await cbPage.close();
  await cbContext.close();

  await browser.close();

  // ── Write test-log.md ──────────────────────────────────────────────────────
  const log = `# Preview Mode Smoke Test
- Date: 2026-04-23
- Server: ${BASE_URL}

## Results
- braindump desktop: ${results.braindump}
- cosmoboard desktop: ${results.cosmoboard}
- preview mode injection: ${results.previewMode}

## Notes
${notes.length > 0 ? notes.map(n => '- ' + n).join('\n') : '- No issues noted'}
`;

  fs.writeFileSync(path.join(OUT_DIR, 'test-log.md'), log, 'utf8');
  console.log('\nTest log written. Results:', results);
}

run().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
