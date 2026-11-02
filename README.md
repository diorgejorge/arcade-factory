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

- **1–5**: escolhe a construção (Mineradora, Esteira, Fornalha, Montadora, Central). **R** gira. **Q/Esc** cancela.
- **Botão esquerdo** constrói (arrastar com a esteira desenha o caminho); **direito** remove; **WASD/setas** movem; **roda** dá zoom; **espaço** pausa.
- Mineradoras só funcionam sobre minério. Máquinas despejam o que produzem na direção em que estão viradas.
- Itens entregues na Central viram pontos **e** estoque; o estoque paga as pesquisas (painel lateral), que desbloqueiam novas máquinas e receitas.
- Clique numa montadora para escolher a receita.

## Pontuação

`valor = soma(ingredientes) / unidades produzidas × 2`. Minério = 1, placa = 2, engrenagem = 8, circuito = 16, motor = 64.

## Arquitetura

- `src/engine/` — simulação pura e determinística (sem DOM), 20 ticks/s. Mesma seed + mesmos comandos = mesmo resultado, para o servidor poder validar o ranking rodando o mesmo código.
- `src/client/` — canvas, sprites desenhados por código e interface.

## Próximos passos

Backend (contas, seed da temporada, simulação autoritativa e ranking), salvar/carregar fábrica, mais itens e pesquisas, balanceamento para 1 semana de jogo.
