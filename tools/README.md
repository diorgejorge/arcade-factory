# Ferramentas (fora do jogo)

Scripts de verificação, captura e arte usados no desenvolvimento. Nada aqui entra no build do jogo.

## Testes de navegador (`tools/e2e`)

Jogam o jogo de verdade (mouse e teclado) num Chromium sem GPU e conferem o resultado. Precisam do servidor de desenvolvimento
(`npm run dev -- --port 5199`) e do Playwright (`npm i -D playwright`, ou o global: `NODE_PATH=$(npm root -g)`).
Usam o relógio manual (`?manual`, só em dev), que o próprio script avança.

```bash
NODE_PATH=$(npm root -g) node tools/e2e/e2e.cjs /tmp/e2e.png     # partida completa: construir, produzir, pesquisar, montadora, logística
NODE_PATH=$(npm root -g) node tools/e2e/ui2.cjs  /tmp/ui2        # árvore em grafo e catálogo de construções
NODE_PATH=$(npm root -g) node tools/e2e/mk.cjs   /tmp/mk.png     # versões Mk pela interface
NODE_PATH=$(npm root -g) node tools/e2e/hkey.cjs                 # tecla H oculta painéis
NODE_PATH=$(npm root -g) node tools/e2e/neg.cjs                  # placar negativo fica vermelho
```

`BASE_URL` muda o endereço (padrão `http://localhost:5199`). Os valores de custo estão em `src/engine/data.ts`: se mudarem, ajuste os
números dos roteiros (saldos e preços esperados).

## Capturas (`tools/capture`)

- `preview.cjs <pasta>`: monta uma fábrica, roda 5 min de jogo e salva 30 quadros; `mkgif.py <pasta> <saida.gif>` junta em GIF.
- `treeimg.cjs <prefixo>`: imagem da árvore inteira (`_inicio.png`, `_meio.png`).

## Economia (`tools/measure-income.ts`)

Mede a renda (pts/s) das cadeias no motor real: `npx vite-node tools/measure-income.ts`. Os custos do jogo se baseiam nesses números.

## Arte (`tools/art`)

Exploração de sprites steampunk em Python/PIL (`steampunk.py` 3/4, `steam2.py` vista de cima animada). Não são usados pelo jogo,
que desenha tudo em voxel 3D; ficam como referência de estilo: `python3 tools/art/steam2.py <pasta de saída>`.
