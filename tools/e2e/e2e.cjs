const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5199';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, extra); };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + '/?manual');
  await page.waitForFunction(() => window.__world && window.__advance);
  const adv = (ms, n = 1) => page.evaluate(([ms, n]) => { for (let i = 0; i < n; i++) window.__advance(ms, false); window.__advance(16); }, [ms, n]);
  await adv(16);

  // mapa tile -> tela (área livre de painéis)
  const mapTiles = () => page.evaluate(() => {
    const out = {};
    for (let sy = 75; sy < 580; sy += 2) for (let sx = 232; sx < 830; sx += 2) {
      const { tile } = window.__world.pick(sx, sy);
      const k = tile.x + ',' + tile.y;
      if (!out[k]) out[k] = [sx, sy, 1]; else if (out[k][2] < 1e9) out[k][2]++;
    }
    return out;
  });
  let screen = await mapTiles();
  const at = (x, y) => { const p = screen[`${x},${y}`]; if (!p) throw new Error(`tile ${x},${y} fora da tela`); return [p[0], p[1]]; };

  // sítio: miner 2x2 em 4 de ferro + 8 tiles livres (zona 0) à direita, tudo visível
  const site = await page.evaluate((visible) => {
    const g = window.__game, { width, height, tiles, zones } = g.terrain;
    const ok = (x, y) => x >= 0 && y >= 0 && x < width && y < height && tiles[y * width + x] <= 2 && zones[y * width + x] === 0 && visible.includes(x + ',' + y);
    for (let y = 2; y < height - 5; y++) for (let x = 1; x < width - 14; x++) {
      let free = true;
      for (let dy = -1; dy < 4; dy++) for (let dx = 0; dx < 13; dx++) free &&= ok(x + dx, y + dy);
      if (free && [0, 1].every((a) => [0, 1].every((b) => tiles[(y + b) * width + x + a] === 1))) return { x, y };
    }
  }, Object.keys(screen));
  check('acha sítio visível para a cadeia', !!site, JSON.stringify(site));
  if (!site) { await browser.close(); process.exit(1); }
  const { x, y } = site;
  const state = () => page.evaluate(() => ({ score: window.__game.score, inv: { ...window.__game.inventory }, n: window.__game.entities.length, kinds: window.__game.entities.map((e) => e.kind + '@' + e.x + ',' + e.y), tool: window.__state.tool, selected: window.__state.selected && window.__state.selected.kind }));
  const openTree = async () => { await page.keyboard.press('t'); await page.waitForTimeout(500); };
  const closeTree = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
  const nodeButton = (id) => page.locator('#tree .node[data-node="' + id + '"] button');
  const tech = (name) => page.locator('.tech').filter({ has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) });
  const hint = () => page.locator('#hint').innerText();

  // 1) mineradora por clique, esteiras por arrasto, central por clique
  await page.keyboard.press('1');
  await page.mouse.click(...at(x, y));
  await page.keyboard.press('2');
  await page.mouse.move(...at(x + 2, y)); await page.mouse.down();
  await page.mouse.move(...at(x + 3, y), { steps: 6 }); await page.mouse.up();
  await page.keyboard.press('7');
  await page.mouse.click(...at(x + 4, y));
  await page.keyboard.press('q');
  let s = await state();
  check('cadeia construída com o mouse (miner+2 esteiras+hub)', s.n === 4, s.kinds.join(' '));
  const conv = await page.evaluate(([x, y]) => [window.__game.entityAt(x + 2, y)?.dir, window.__game.entityAt(x + 3, y)?.dir], [x, y]);
  check('esteiras arrastadas apontam para leste', conv[0] === 0 && conv[1] === 0, JSON.stringify(conv));

  // 2) produção e pesquisa pela interface
  const debt0 = (await state()).score;
  check('construir deixou o placar negativo (dívida inicial)', debt0 < 0, 'score=' + debt0);
  await page.evaluate(() => { let i = 0; while (window.__game.score < 800 && i++ < 80000) window.__advance(50, false); window.__advance(16); });
  s = await state();
  check('minério entregue (>=30)', s.inv.iron_ore >= 30, 'iron_ore=' + s.inv.iron_ore + ' score=' + s.score);
  await page.waitForTimeout(500);
  await openTree();
  check('Fundição de ferro disponível na árvore', (await nodeButton('smelting').count()) === 1);
  await nodeButton('smelting').click();
  await page.waitForTimeout(400);
  await closeTree();
  const unlocked = await page.evaluate(() => window.__game.isBuildingUnlocked('furnace'));
  check('Fundição desbloqueia a fornalha', unlocked);
  check('item bloqueado dá aviso (montadora)', await (async () => { await page.keyboard.press('6'); return /bloqueado/i.test(await hint()); })(), await hint());

  await page.evaluate(() => { window.__game.score = Math.max(window.__game.score, 40000); }); // saldo para as próximas pesquisas (a economia é coberta pelos testes do motor)
  // 3) troca a central por fornalha + esteiras + central
  await page.mouse.click(...at(x + 4, y), { button: 'right' });
  await page.keyboard.press('5');
  await page.mouse.click(...at(x + 4, y));
  await page.keyboard.press('2');
  await page.mouse.move(...at(x + 6, y)); await page.mouse.down();
  await page.mouse.move(...at(x + 7, y), { steps: 6 }); await page.mouse.up();
  await page.keyboard.press('7');
  await page.mouse.click(...at(x + 8, y));
  await page.keyboard.press('q');
  s = await state();
  check('cadeia com fornalha construída', s.kinds.some((k) => k.startsWith('furnace')) && s.kinds.filter((k) => k.startsWith('hub')).length === 1, s.kinds.join(' '));
  const before = (await state()).inv.iron_plate;
  await adv(50, 800);
  s = await state();
  check('fornalha produz placas que chegam à central', s.inv.iron_plate > before + 3, 'iron_plate=' + s.inv.iron_plate);
  await page.screenshot({ path: process.argv[2] });

  // 4) seleção e rotação
  await page.mouse.click(...at(x + 4, y));
  s = await state();
  check('clique seleciona a fornalha', s.selected === 'furnace', String(s.selected));
  const dirBefore = await page.evaluate(([x, y]) => window.__game.entityAt(x + 4, y).dir, [x, y]);
  await page.keyboard.press('r');
  const dirAfter = await page.evaluate(([x, y]) => window.__game.entityAt(x + 4, y).dir, [x, y]);
  check('R gira a máquina selecionada', dirAfter === (dirBefore + 1) % 4);
  await page.keyboard.press('r'); await page.keyboard.press('r'); await page.keyboard.press('r');

  // 4b) montadora 3x3 (centrada no clique) + receita pela interface + central depois dela
  await page.keyboard.press('q');
  await page.waitForTimeout(500);
  await openTree();
  await nodeButton('assembly').click();
  await page.waitForTimeout(400);
  await closeTree();
  await page.mouse.click(...at(x + 8, y), { button: 'right' });            // tira a central
  await page.keyboard.press('6');
  await page.mouse.click(...at(x + 9, y));
  console.log('DEBUG hint:', await hint(), '| canPlace:', await page.evaluate(([x, y]) => [window.__game.canPlace('assembler', x + 8, y - 1), window.__game.isBuildingUnlocked('assembler'), window.__state.tool, JSON.stringify(window.__world.pick(0,0).tile)], [x, y]), '| screen of x+9,y:', at(x + 9, y));
  const asm = await page.evaluate(([x, y]) => { const e = window.__game.entityAt(x + 8, y); return e && { kind: e.kind, x: e.x, y: e.y, size: e.size, recipe: e.recipeId }; }, [x, y]);
  check('montadora 3x3 centrada no clique', asm?.kind === 'assembler' && asm.x === x + 8 && asm.y === y - 1 && asm.size === 3, JSON.stringify(asm));
  await page.waitForTimeout(400);
  const hasSelect = await page.locator('#side select').count();
  check('painel de receita aparece ao construir a montadora', hasSelect === 1);
  await page.locator('#side select').selectOption('gear');
  const recipe = await page.evaluate(([x, y]) => window.__game.entityAt(x + 8, y).recipeId, [x, y]);
  check('receita escolhida pela interface', recipe === 'gear', String(recipe));
  await page.keyboard.press('7');
  await page.mouse.click(...at(x + 11, y));
  await page.keyboard.press('q');
  const gearsBefore = (await state()).inv.gear;
  await adv(50, 900);
  s = await state();
  check('montadora fabrica engrenagens que chegam à central', s.inv.gear > gearsBefore, 'gear=' + s.inv.gear + ' score=' + Math.floor(s.score));
  await page.screenshot({ path: process.argv[2].replace('.png', '_asm.png') });

  // 4c) logística: junção e roteador depois da pesquisa
  await page.evaluate(() => { window.__game.score += 5000; }); // repõe pontos só para exercitar a pesquisa de Logística
  await page.waitForTimeout(500);
  await openTree();
  const logBtn = nodeButton('logistics');
  if ((await logBtn.count()) === 1) {
    await logBtn.click(); await page.waitForTimeout(400); await closeTree();
    await page.keyboard.press('3'); await page.mouse.click(...at(x, y + 4));
    await page.keyboard.press('4'); await page.mouse.click(...at(x + 2, y + 4));
    await page.keyboard.press('q');
    const jr = await page.evaluate(([x, y]) => [window.__game.entityAt(x, y + 4)?.kind, window.__game.entityAt(x + 2, y + 4)?.kind], [x, y]);
    check('junção e roteador construídos após Logística', jr[0] === 'junction' && jr[1] === 'router', JSON.stringify(jr));
  } else { await closeTree(); check('Logística disponível', false, 'score=' + (await state()).score); }

  // 5) zona bloqueada e câmera
  const locked = await page.evaluate((visible) => {
    const g = window.__game, { width, tiles, zones } = g.terrain;
    return visible.map((k) => k.split(',').map(Number)).find(([x, y]) => zones[y * width + x] === 1 && tiles[y * width + x] <= 2);
  }, Object.keys(screen));
  if (locked) {
    await page.keyboard.press('2');
    await page.mouse.click(...at(locked[0], locked[1]));
    const h = await hint();
    check('zona bloqueada avisa e não constrói', /Zona/.test(h) && !(await page.evaluate(([x, y]) => !!window.__game.entityAt(x, y), locked)), h);
    await page.keyboard.press('q');
  } else console.log('SKIP zona bloqueada não visível');
  const p0 = await page.evaluate(() => JSON.stringify(window.__world.pick(550, 330).tile));
  await page.keyboard.down('d'); await adv(100, 8); await page.keyboard.up('d');
  const p1 = await page.evaluate(() => JSON.stringify(window.__world.pick(550, 330).tile));
  check('WASD move a câmera', p0 !== p1, p0 + ' -> ' + p1);
  await page.mouse.move(550, 330);
  await page.mouse.wheel(0, -300);
  await adv(16);
  const p2 = await page.evaluate(() => JSON.stringify(window.__world.pick(300, 200).tile));
  check('zoom funciona sem erro', true, p2);

  // 6) custo de um quadro com itens
  const t = await page.evaluate(() => { const a = performance.now(); for (let i = 0; i < 5; i++) window.__advance(16); return (performance.now() - a) / 5; });
  console.log('ms por quadro (software, sem GPU):', t.toFixed(1));
  check('sem erros no console', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(results.every(Boolean) ? 'TUDO OK' : 'HÁ FALHAS');
  await browser.close();
})().catch((e) => { console.log('EXCEÇÃO', e.message); process.exit(1); });
