import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

test('personal homepage contains useful actions, without retired content or placeholders', async () => {
  const html = await read('index.html');
  assert.match(html, /Hey, I&#39;m|Hey, I'm/);
  assert.match(html, /mailto:evrenucr@gmail.com/);
  assert.match(html, /id="contact"/);
  assert.equal((html.match(/href="https:\/\/design\.evrenucar\.com\/"/g) || []).length, 4);
  assert.match(html, /photography.html/);
  assert.doesNotMatch(html, /braindump|cosmoboard|Coming soon|Category|page-bottom-ticker|Selected projects/i);
});

test('cleared projects stay out of public pages and sitemap after build', async () => {
  const html = await read('projects.html');
  assert.doesNotMatch(html, /Eurocrate|Cyberdeck|content-card|Coming soon|none/);
  const sitemap = await read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(urls.sort(), ['https://evrenucar.com/', 'https://evrenucar.com/photography.html', 'https://evrenucar.com/projects.html'].sort());
});

test('Pages excludes preserved board content and retired routes', async () => {
  const config = await read('_config.yml');
  for (const item of ['content/boards', 'content/apps', 'content/entities', 'content/base-data', 'src', 'markdown', 'cosmoboard.html', 'cosmoboard-landing.html', 'braindump.html', 'onboarding.html', 'open-quests.html', 'cool-bookmarks.html', 'things_i_do.html', 'JavaScript/braindump.js']) {
    assert.ok(config.split('\n').includes(`  - ${item}`), `Missing publishing exclusion: ${item}`);
  }
});
