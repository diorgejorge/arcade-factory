const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5199';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?manual');
  await page.waitForFunction(() => window.__world && window.__advance);
  const info = await page.evaluate(() => {
    const g = window.__game, { width, height, tiles, zones } = g.terrain;
    const ok = (x, y) => x >= 0 && y >= 0 && x < width && y < height && tiles[y * width + x] <= 2 && zones[y * width + x] === 0;
    let site;
    for (let y = 2; y < height - 5 && !site; y++) for (let x = 1; x < width - 14 && !site; x++) {
      let free = true;
      for (let dy = -1; dy < 4; dy++) for (let dx = 0; dx < 13; dx++) free &&= ok(x + dx, y + dy);
      if (free && [0, 1].every((a) => [0, 1].every((b) => tiles[(y + b) * width + x + a] === 1))) site = { x, y };
    }
    g.score = 1e9;
    ['smelting', 'logistics', 'assembly'].forEach((t) => g.research(t));
    g.researchTier();
    g.score = 0;
    const { x, y } = site;
    const r = [
      g.place('miner', x, y, 0, 2), g.place('conveyor', x + 2, y, 0), g.place('conveyor', x + 3, y, 0),
      g.place('furnace', x + 4, y, 0, 2), g.place('conveyor', x + 6, y, 0), g.place('conveyor', x + 7, y, 0),
      g.place('assembler', x + 8, y - 1, 0, 2), g.place('hub', x + 11, y, 0),
    ];
    g.setRecipe(x + 8, y, 'gear');
    window.__world.focus(x + 6, y + 1);
    for (let i = 0; i < 3; i++) window.__world.zoom(-1);
    window.__state.selected = g.entityAt(x + 8, y);
    for (let i = 0; i < 6000; i++) window.__advance(50, false);
    window.__advance(16);
    return { site, r, score: g.score };
  });
  console.log(JSON.stringify(info));
  await page.waitForTimeout(700);
  for (let f = 0; f < 30; f++) {
    await page.evaluate(() => window.__advance(66));
    if (f % 6 === 0) await page.waitForTimeout(260); // deixa a interface (250 ms) atualizar
    await page.screenshot({ path: `${process.argv[2]}/f_${String(f).padStart(2, '0')}.png` });
  }
  console.log('erros:', errors.length ? errors : 'nenhum', 'score', await page.evaluate(() => Math.floor(window.__game.score)));
  await browser.close();
})();
