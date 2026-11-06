const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5199';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  await page.goto(BASE + '/?manual');
  await page.waitForFunction(() => window.__world && window.__advance);
  const vis = () => page.evaluate(() => ['#toolbar', '#side', '#hint', '#hud'].map((s) => getComputedStyle(document.querySelector(s)).display !== 'none'));
  const a = await vis(); await page.keyboard.press('h'); const b = await vis(); await page.keyboard.press('h'); const c = await vis();
  console.log('antes', a, 'depois H', b, 'H de novo', c);
  console.log(JSON.stringify(a) === '[true,true,true,true]' && JSON.stringify(b) === '[false,false,false,true]' && JSON.stringify(c) === JSON.stringify(a) ? 'PASS H oculta e mostra painéis (HUD fica)' : 'FAIL');
  await browser.close();
})();
