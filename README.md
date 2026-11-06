# Arcade Factory

Jogo de fábrica estilo Factorio, em pixel art, com temporadas semanais: o mapa muda para todos e o ranking reinicia.
Cada peça entregue na **Central** vale pontos proporcionais à complexidade da sua cadeia de produção.

## Rodando

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # testes do motor de simulação
npm run build   # typecheck + build de produção
```

## Como jogar

- **Botões Construções (B) e Tecnologias (T)** no topo: o catálogo mostra cada tipo de máquina com tamanho, receitas liberadas e as opções por versão Mk (desempenho, preço de construir e de remover); a árvore desenha as tecnologias e as versões Mk como grafo, com setas dos requisitos (verde = requisito cumprido) e permite pesquisar clicando no nó. Esc fecha as telas.
- **1–7**: escolhe a construção (Mineradora, Esteira, Junção, Roteador, Fornalha, Montadora, Central). **R** gira. **Q/Esc** cancela.
- **Botão esquerdo** constrói (arrastar com a esteira desenha o caminho) ou seleciona a máquina; **direito** remove; **WASD/setas** ou **botão do meio** movem a câmera; **roda** dá zoom. Não há pausa nem aceleração: o relógio é o mesmo para todos na temporada.
- Mineradoras só funcionam sobre minério e rendem **por tile de minério** sob elas (2x2: de 1 a 4). Máquinas despejam o que produzem em qualquer célula da borda para onde estão viradas.
- Tamanhos: mineradora 2x2, fornalha 2x2, montadora 3x3, central 2x2; esteira, junção e roteador 1x1. Espaço é o recurso escasso.
- **Junção** cruza duas esteiras (cada item segue em linha reta). **Roteador** reparte itens em revezamento entre as saídas.
- **Versões Mk:** a pesquisa *Máquinas Mk2, Mk3...* custa **pontos do placar** (2000, 5000, 12500...) e libera versões de mineradora, fornalha e montadora com **+10% de desempenho por versão** (Mk4 = +30%). Ao construir, escolha a versão na barra; máquinas já construídas não sobem de versão sozinhas.
- A ilha tem 4 zonas. Só a central está liberada no início; as pesquisas **Expansão I–III** liberam as de fora.
- Itens entregues na Central viram pontos. **Toda pesquisa custa pontos do placar** e exige uma tecnologia anterior (a árvore mostra o pré-requisito de cada uma); elas desbloqueiam máquinas, receitas e expansões da ilha.
- Clique numa montadora para escolher a receita.
- **Construir custa pontos** (preço na barra; versões Mk mais altas custam mais: +50% do preço base por versão). **Remover custa o dobro de construir** (só com clique direito, sem arrastar). O **placar pode ficar negativo**: ele é o resultado líquido (produção − construção − remoção − pesquisa). Pesquisar exige saldo: placar maior ou igual ao custo.

## Árvore de pesquisa

Todas custam **pontos do placar** e exigem **todos** os requisitos (✓/✗ no cartão). `mkN` = máquinas já na versão N.

```
Fundição de ferro ─┬─ Fundição de cobre ──────┐
                   ├─ Logística ──┬───────────┼─ Eletrônica ─┐          (Fiação + Logística)
                   └─ Montagem ───┴─ Fiação ──┘              │
 Expansão I      = Montagem + Logística                      │
 Expansão II     = Expansão I + Eletrônica                   │
 Robótica        = Eletrônica + Expansão I + Mk2   (3)       │
 Expansão III    = Expansão II + Robótica
 Overclock       = Robótica + Expansão II
 Fiação          = Montagem + Fundição de cobre
 Versões das máquinas: Mk2 ← Montagem · Mk3 ← Eletrônica · Mk4 ← Robótica + Expansão II (+ Mk3) · Mk5+ ← Overclock
```

## Pontuação

`valor = soma(ingredientes) / unidades produzidas × 2`. Minério = 1, placa = 2, engrenagem = 8, circuito = 16, motor = 64.

## Arquitetura

- `src/engine/` — simulação pura e determinística (sem DOM), 20 ticks/s; ilha 40x30 gerada por seed, com zonas expansíveis. Mesma seed + mesmos comandos = mesmo resultado, para o servidor poder validar o ranking rodando o mesmo código.
- `src/client3d/` — renderizador voxel (Three.js): ilha gerada do terreno do motor (`world3d.ts`) e modelos animados das máquinas (`models.ts`). Cada máquina é escalada ao tamanho da sua área.
- `src/client/` — entrada do mouse/teclado e interface (barra de construção, pesquisa, estoque).
- `prototypes/voxel/` — cena de demonstração isolada.

## Próximos passos

Backend (contas, seed da temporada, simulação autoritativa e ranking), salvar/carregar fábrica, mais itens e pesquisas, balanceamento para 1 semana de jogo.
