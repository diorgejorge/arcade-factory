const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5199';
const ok = (n, v, x = '') => console.log(v ? 'PASS' : 'FAIL', n, x);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1300, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + '/?manual');
  await page.waitForFunction(() => window.__world && window.__advance);
  await page.evaluate(() => window.__advance(16));
  await page.waitForTimeout(400);
  const visible = (sel) => page.locator(sel).isVisible();
  const state = () => page.evaluate(() => ({ tool: window.__state.tool, mk: window.__state.mk, tier: window.__game.machineTier, score: window.__game.score }));

  // 1) botões no HUD
  ok('botões Construções e Tecnologias no HUD', (await page.locator('#hud button').allInnerTexts()).join('|').includes('Construções') && (await page.locator('#hud button').allInnerTexts()).join('|').includes('Tecnologias'));
  ok('telas começam fechadas', !(await visible('#tree')) && !(await visible('#catalog')));

  // 2) árvore: nós e setas
  await page.locator('#hud button', { hasText: 'Tecnologias' }).click();
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => ({ nodes: document.querySelectorAll('#tree .node').length, edges: document.querySelectorAll('#tree svg path.edge').length }));
  const expected = await page.evaluate(async () => { const m = await import('/src/engine/data.ts'); return { nodes: m.TECH_GRAPH.length, edges: m.TECH_GRAPH.reduce((s, n) => s + n.requires.length, 0) }; });
  ok('árvore desenha todos os nós', info.nodes === expected.nodes, `${info.nodes}/${expected.nodes}`);
  ok('árvore desenha uma seta por requisito', info.edges === expected.edges, `${info.edges}/${expected.edges}`);
  const cls = (id) => page.locator(`#tree .node[data-node="${id}"]`).getAttribute('class');
  ok('estado inicial: raiz sem pontos, demais bloqueados', /poor/.test(await cls('smelting')) && /locked/.test(await cls('logistics')) && /locked/.test(await cls('robotics')));
  await page.screenshot({ path: process.argv[2] + '_tree0.png' });

  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
  await page.locator('#catalog .catalog-nav button', { hasText: 'Roteador' }).click();
  await page.waitForTimeout(200);
  const lockedText = await page.locator('#catalog .catalog-detail').innerText();
  ok('roteador bloqueado aponta a tecnologia que o libera', /Bloqueada/.test(lockedText) && /Logística/.test(lockedText) && (await page.locator('#catalog table.opts button').first().isDisabled()));
  await page.locator('#catalog .catalog-detail button', { hasText: 'Abrir árvore' }).first().click();
  await page.waitForTimeout(300);
  ok('Abrir árvore troca de tela', (await visible('#tree')) && !(await visible('#catalog')));
  // 3) pesquisar clicando no nó e ver a seta acender
  await page.evaluate(() => { window.__game.score = 1200; });
  await page.waitForTimeout(500);
  ok('raiz fica disponível com saldo', /ready/.test(await cls('smelting')));
  await page.locator('#tree .node[data-node="smelting"] button').click();
  await page.waitForTimeout(500);
  ok('nó pesquisado fica verde e filhos sem saldo mostram "faltam pontos"', /done/.test(await cls('smelting')) && /poor/.test(await cls('logistics')), await cls('logistics'));
  const edgeOk = await page.locator('#tree path.edge[data-from="smelting"][data-to="logistics"]').getAttribute('class');
  ok('seta do requisito cumprido acende', /ok/.test(edgeOk), edgeOk);
  ok('pontos gastos na pesquisa', (await state()).score === 400, String((await state()).score));
  for (const id of ['logistics', 'assembly']) { await page.evaluate(() => { window.__game.score += 5000; }); await page.waitForTimeout(450); await page.locator(`#tree .node[data-node="${id}"] button`).click(); await page.waitForTimeout(300); }
  await page.evaluate(() => { window.__game.score = 33000; });
  await page.waitForTimeout(450);
  await page.locator('#tree .node[data-node="mk2"] button').click();
  await page.waitForTimeout(400);
  const afterMk = await state();
  ok('nó Mk2 pesquisa a versão (gasta 30000) e seleciona Mk2', afterMk.tier === 2 && afterMk.score === 3000 && afterMk.mk === 2, JSON.stringify(afterMk));
  await page.screenshot({ path: process.argv[2] + '_tree1.png' });
  await page.keyboard.press('Escape');
  ok('Esc fecha a árvore', !(await visible('#tree')));

  // 4) catálogo por tecla B
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
  ok('B abre o catálogo', await visible('#catalog'));
  await page.locator('#catalog .catalog-nav button', { hasText: 'Mineradora' }).click();
  await page.waitForTimeout(200);
  const rows = await page.locator('#catalog table.opts tbody tr').allInnerTexts();
  ok('mineradora lista Mk1 e Mk2 com preços', rows.length === 2 && /Mk1/.test(rows[0]) && /−360/.test(rows[0]) && /Mk2/.test(rows[1]) && /−540/.test(rows[1]) && /\+10%/.test(rows[1]), rows.map((r) => r.replace(/\s+/g, ' ')).join(' || '));
  await page.locator('#catalog .catalog-nav button', { hasText: 'Montadora' }).click();
  await page.waitForTimeout(200);
  ok('montadora mostra tamanho 3×3 e receita de engrenagem', /3×3/.test(await page.locator('#catalog .catalog-detail').innerText()) && /Engrenagem/.test(await page.locator('#catalog .catalog-detail').innerText()));
  await page.keyboard.press('t');
  await page.waitForTimeout(250);
  ok('T com o catálogo aberto troca para a árvore', (await visible('#tree')) && !(await visible('#catalog')));
  await page.keyboard.press('t');
  ok('T de novo fecha a árvore', !(await visible('#tree')));
  await page.locator('#hud button', { hasText: 'Construções' }).click();
  await page.locator('#catalog .catalog-nav button', { hasText: 'Mineradora' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: process.argv[2] + '_catalog.png' });
  await page.locator('#catalog table.opts tbody tr').nth(1).locator('button').click();
  await page.waitForTimeout(200);
  const picked = await state();
  ok('escolher Mk2 no catálogo seleciona a ferramenta e fecha a tela', picked.tool === 'miner' && picked.mk === 2 && !(await visible('#catalog')), JSON.stringify(picked));
  ok('sem erros no console', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
