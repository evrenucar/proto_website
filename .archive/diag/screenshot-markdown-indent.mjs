import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:4173';

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage();

  try {
    // Navigate to braindump
    await page.goto(`${BASE_URL}/braindump.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Take initial screenshot
    await page.screenshot({ path: 'screenshot-01-initial.png', fullPage: false });
    console.log('Screenshot 1: Initial page');

    // Press X to open markdown panel
    await page.keyboard.press('x');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshot-02-markdown-panel.png', fullPage: false });
    console.log('Screenshot 2: Markdown panel open');

    // Fill in title and create markdown
    await page.fill('#braindump-markdown-title', 'Test Indent');
    await page.fill('#braindump-markdown-body', '# Test\n\n- Item 1\n  - Nested item\n    - Deep nested\n- Item 2');
    await page.screenshot({ path: 'screenshot-03-filled-form.png', fullPage: false });
    console.log('Screenshot 3: Form filled');

    // Click save using JavaScript evaluate to bypass viewport issues
    await page.evaluate(() => {
      document.querySelector('#braindump-markdown-save')?.click();
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshot-04-markdown-created.png', fullPage: false });
    console.log('Screenshot 4: Markdown created');

    // Click on a bullet line to edit using JavaScript
    const hasLines = await page.evaluate(() => {
      const lines = document.querySelectorAll('.bd-md-line--li');
      return lines.length > 0;
    });

    if (hasLines) {
      // Click on first bullet line
      await page.evaluate(() => {
        const line = document.querySelector('.bd-md-line--li');
        if (line) line.click();
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'screenshot-05-first-bullet-active.png', fullPage: false });
      console.log('Screenshot 5: First bullet line active (raw mode)');

      // Click on second bullet line (nested)
      await page.evaluate(() => {
        const lines = document.querySelectorAll('.bd-md-line--li');
        if (lines.length > 1) lines[1].click();
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'screenshot-06-nested-bullet-active.png', fullPage: false });
      console.log('Screenshot 6: Nested bullet line active');

      // Click away to deactivate and show rendered view
      await page.evaluate(() => {
        document.querySelector('.braindump-canvas')?.click();
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'screenshot-07-rendered-view.png', fullPage: false });
      console.log('Screenshot 7: Rendered view - check indent display');
    }

    // Test fullscreen button
    const fullscreenBtn = await page.locator('.bd-markdown-fullscreen-btn').first();
    if (await fullscreenBtn.isVisible()) {
      await fullscreenBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'screenshot-08-fullscreen.png', fullPage: false });
      console.log('Screenshot 8: Fullscreen view');

      // Close fullscreen
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    console.log('\nAll screenshots saved successfully!');

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'screenshot-error.png', fullPage: false });
  } finally {
    await browser.close();
  }
}

takeScreenshots();
