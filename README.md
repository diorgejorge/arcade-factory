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

- **1–7**: escolhe a construção (Mineradora, Esteira, Junção, Roteador, Fornalha, Montadora, Central). **R** gira. **Q/Esc** cancela.
- **Botão esquerdo** constrói (arrastar com a esteira desenha o caminho); **direito** remove; **WASD/setas** movem; **roda** dá zoom; **espaço** pausa.
- Mineradoras só funcionam sobre minério e rendem **por tile de minério** sob elas (2x2: de 1 a 4). Máquinas despejam o que produzem em qualquer célula da borda para onde estão viradas.
- Tamanhos: mineradora 2x2, fornalha 2x2, montadora 3x3, central 2x2; esteira, junção e roteador 1x1. Espaço é o recurso escasso.
- **Junção** cruza duas esteiras (cada item segue em linha reta). **Roteador** reparte itens em revezamento entre as saídas.
- A ilha tem 4 zonas. Só a central está liberada no início; as pesquisas **Expansão I–III** liberam as de fora.
- Itens entregues na Central viram pontos **e** estoque; o estoque paga as pesquisas (painel lateral), que desbloqueiam novas máquinas e receitas.
- Clique numa montadora para escolher a receita.

## Pontuação

`valor = soma(ingredientes) / unidades produzidas × 2`. Minério = 1, placa = 2, engrenagem = 8, circuito = 16, motor = 64.

## Arquitetura

- `src/engine/` — simulação pura e determinística (sem DOM), 20 ticks/s; ilha 40x30 gerada por seed, com zonas expansíveis. Mesma seed + mesmos comandos = mesmo resultado, para o servidor poder validar o ranking rodando o mesmo código.
- `src/client/` — cliente 2D atual (canvas), a ser substituído pelo 3D voxel.
- `src/client3d/` — modelos 3D das máquinas (Three.js), reutilizáveis pelo jogo. `prototypes/voxel/` é a cena de demonstração.

## Próximos passos

Backend (contas, seed da temporada, simulação autoritativa e ranking), salvar/carregar fábrica, mais itens e pesquisas, balanceamento para 1 semana de jogo.
