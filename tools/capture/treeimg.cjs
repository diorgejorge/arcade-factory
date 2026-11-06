const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5199';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 2500, height: 640 }, deviceScaleFactor: 1 });
  await page.goto(BASE + '/?manual');
  await page.waitForFunction(() => window.__world && window.__advance);
  const shot = async (name, setup) => {
    await page.evaluate(setup);
    await page.keyboard.press('t');
    await page.waitForTimeout(600);
    await page.locator('#tree .modal-box').screenshot({ path: `${process.argv[2]}_${name}.png` });
    await page.keyboard.press('Escape');
  };
  // 1) começo do jogo
  await shot('inicio', () => { window.__game.score = 0; });
  // 2) meio da pesquisa: alguns feitos, alguns disponíveis, alguns sem saldo
  await shot('meio', () => {
    const g = window.__game;
    g.score = 1e9;
    ['smelting', 'logistics', 'assembly', 'smelting_copper', 'wiring', 'land_1'].forEach((t) => g.research(t));
    g.researchTier();
    g.score = 70000;
  });
  await browser.close();
})();
