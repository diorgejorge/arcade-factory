const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5199';
const ok = (n, v, x = '') => console.log(v ? 'PASS' : 'FAIL', n, x);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?manual');
  await page.waitForFunction(() => window.__world && window.__advance);
  await page.evaluate(() => window.__advance(16));
  ok('sem seletor de versão no começo', (await page.locator('.versions').count()) === 0);
  // sem saldo: botão desabilitado
  await page.waitForTimeout(400);
  await page.keyboard.press('t'); await page.waitForTimeout(500);
  const card = page.locator('#tree .node[data-node="mk2"]');
  ok('nó Mk2 mostra custo em pontos e não é pesquisável sem Montagem', /30\.000 pontos/.test(await card.innerText()) && (await card.locator('button').count()) === 0, (await card.innerText()).replace(/\n/g, ' | '));
  await page.evaluate(() => { const g = window.__game; g.score = 1e6; g.research('smelting'); g.research('assembly'); g.score = 30600; });
  await page.waitForTimeout(500);
  await card.locator('button').click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  const st = await page.evaluate(() => ({ tier: window.__game.machineTier, score: window.__game.score, mk: window.__state.mk }));
  ok('pesquisa pela interface gasta pontos e libera Mk2', st.tier === 2 && st.score === 600 && st.mk === 2, JSON.stringify(st));
  ok('seletor Mk1/Mk2 aparece na barra', (await page.locator('.versions button').count()) === 2, await page.locator('.versions').innerText());
  // constrói Mk2 por clique e depois Mk1
  const screen = await page.evaluate(() => { const out = {}; for (let sy = 75; sy < 580; sy += 2) for (let sx = 232; sx < 830; sx += 2) { const { tile } = window.__world.pick(sx, sy); const k = tile.x + ',' + tile.y; if (!out[k]) out[k] = [sx, sy]; } return out; });
  const sites = await page.evaluate((visible) => {
    const g = window.__game, { width, height, tiles, zones } = g.terrain; const out = [];
    const seen = (x, y) => [0, 1].every((a) => [0, 1].every((b) => visible.includes((x + a) + ',' + (y + b))));
    for (let y = 2; y < height - 4 && out.length < 2; y++) for (let x = 2; x < width - 6 && out.length < 2; x++) {
      if (seen(x, y) && [0, 1].every((a) => [0, 1].every((b) => tiles[(y + b) * width + x + a] === 1 && zones[(y + b) * width + x + a] === 0)) && (out.length === 0 || Math.abs(out[0].x - x) > 3 || Math.abs(out[0].y - y) > 3)) out.push({ x, y });
    }
    return out;
  }, Object.keys(screen));
  const at = (p) => screen[`${p.x},${p.y}`];
  console.log('sítios', JSON.stringify(sites));
  await page.keyboard.press('1');
  await page.mouse.click(...at(sites[0]));
  await page.locator('.versions button', { hasText: 'Mk1' }).click();
  await page.mouse.click(...at(sites[1]));
  await page.keyboard.press('q');
  const mks = await page.evaluate((s) => s.map((p) => window.__game.entityAt(p.x, p.y)?.mk), sites);
  ok('construiu Mk2 e Mk1 conforme o seletor', mks[0] === 2 && mks[1] === 1, JSON.stringify(mks));
  await page.mouse.click(...at(sites[0]));
  await page.waitForTimeout(400);
  ok('painel da máquina mostra a versão', /Mk2: \+10%/.test(await page.locator('#side').innerText()));
  await page.evaluate(() => window.__advance(16));
  await page.screenshot({ path: process.argv[2] });
  ok('sem erros no console', errors.length === 0, errors.join('|'));
  await browser.close();
})();
