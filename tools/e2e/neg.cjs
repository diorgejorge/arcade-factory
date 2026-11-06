const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5199';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  await page.goto(BASE + '/?manual');
  await page.waitForFunction(() => window.__world && window.__advance);
  const read = () => page.evaluate(() => { const b = document.querySelector('#hud b'); return { text: b.textContent, neg: b.classList.contains('neg'), color: getComputedStyle(b).color }; });
  await page.evaluate(() => { window.__game.score = -250; });
  await page.waitForTimeout(500);
  console.log('negativo:', JSON.stringify(await read()));
  await page.evaluate(() => { window.__game.score = 80; });
  await page.waitForTimeout(500);
  console.log('positivo:', JSON.stringify(await read()));
  await browser.close();
})();
