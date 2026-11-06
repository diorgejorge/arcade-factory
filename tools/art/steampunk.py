"""Gera sprites pixel art steampunk (32x32 prédios, 16x16 itens) + folha e cena de exemplo."""
import math
import random
import sys
from PIL import Image

OUT = sys.argv[1]


def rgba(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


# Paleta
OUTLINE = rgba('#1d120d')
BRASS = [rgba(c) for c in ('#f6d27a', '#d9a03f', '#a8702a', '#6e4519')]   # claro -> escuro
COPPER = [rgba(c) for c in ('#e8895a', '#c4643a', '#913f22', '#5c2614')]
STEEL = [rgba(c) for c in ('#c3ccd6', '#8b96a4', '#5b6573', '#363d49')]
LEATHER = [rgba(c) for c in ('#6b4d3a', '#4a342a', '#33231c')]
FIRE = [rgba('#ffe27a'), rgba('#ff9a2a'), rgba('#d8521a')]
GLASS = [rgba('#d8f2ee'), rgba('#7fc7c9'), rgba('#3f8f96')]
STEAM = rgba('#e6edf1', 200)
DARK = rgba('#241512')


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.p = self.im.load()

    def px(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.p[x, y] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)

    def box(self, x0, y0, x1, y1, pal):
        """Caixa com luz no canto superior esquerdo e sombra no inferior direito."""
        self.rect(x0, y0, x1, y1, pal[1])
        self.rect(x0, y0, x1, y0, pal[0])
        self.rect(x0, y0, x0, y1, pal[0])
        self.rect(x0, y1, x1, y1, pal[2])
        self.rect(x1, y0, x1, y1, pal[2])

    def cylinder_v(self, x0, y0, x1, y1, pal):
        """Corpo cilíndrico (faixas verticais de luz)."""
        w = x1 - x0 + 1
        for x in range(x0, x1 + 1):
            t = (x - x0) / max(1, w - 1)
            c = pal[0] if t < 0.18 else pal[1] if t < 0.6 else pal[2] if t < 0.88 else pal[3]
            self.rect(x, y0, x, y1, c)

    def sphere(self, cx, cy, r, pal):
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5:
                    d = ((x - cx) + (y - cy)) / (r * 1.4)
                    self.px(x, y, pal[0] if d < -0.5 else pal[2] if d > 0.5 else pal[1])

    def gear(self, cx, cy, r_out, r_in, teeth, pal, hole=1.5):
        for y in range(int(cy - r_out) - 1, int(cy + r_out) + 2):
            for x in range(int(cx - r_out) - 1, int(cx + r_out) + 2):
                dx, dy = x - cx, y - cy
                r = math.hypot(dx, dy)
                if r > r_out + 0.3:
                    continue
                ang = (math.atan2(dy, dx) / (2 * math.pi)) % 1
                tooth = (ang * teeth) % 1 < 0.5
                if r > r_in + 0.3 and not tooth:
                    continue
                if r < hole:
                    continue
                d = (dx + dy) / (r_out * 1.4)
                self.px(x, y, pal[0] if d < -0.45 else pal[2] if d > 0.45 else pal[1])

    def line(self, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def outline(self):
        src = self.im.copy().load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y][3] != 0:
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < self.w and 0 <= ny < self.h and src[nx, ny][3] > 200:
                        self.p[x, y] = OUTLINE
                        break

    def rivets(self, points, light=BRASS[0]):
        for x, y in points:
            self.px(x, y, light)


# ---------------- prédios (32x32) ----------------

def furnace():
    c = Canvas(32, 32)
    c.box(3, 27, 28, 30, STEEL)                       # base
    c.cylinder_v(5, 11, 26, 27, COPPER)               # caldeira
    for y0 in (14, 23):                               # cintas de latão
        c.rect(5, y0, 26, y0 + 1, BRASS[1])
        c.rect(5, y0, 26, y0, BRASS[0])
        c.rect(5, y0 + 1, 26, y0 + 1, BRASS[2])
    c.rivets([(x, 14) for x in range(7, 26, 4)] + [(x, 23) for x in range(7, 26, 4)])
    c.rect(19, 5, 25, 11, STEEL[1])                   # chaminé
    c.rect(19, 5, 20, 11, STEEL[0])
    c.rect(24, 5, 25, 11, STEEL[2])
    c.box(18, 3, 26, 5, BRASS)
    # porta do forno
    c.rect(11, 17, 20, 25, BRASS[2])
    c.rect(12, 18, 19, 25, DARK)
    c.rect(13, 21, 18, 25, FIRE[2])
    c.rect(14, 22, 17, 25, FIRE[1])
    c.rect(15, 24, 16, 25, FIRE[0])
    c.rect(11, 17, 20, 17, BRASS[0])
    # manômetro
    c.sphere(9, 18, 3, BRASS)
    c.rect(8, 17, 10, 19, GLASS[0])
    c.line(9, 18, 10, 17, DARK)
    c.outline()
    c.px(20, 2, STEAM); c.rect(19, 1, 22, 3, STEAM); c.rect(23, 0, 25, 1, STEAM)
    return c


def miner():
    c = Canvas(32, 32)
    c.box(2, 26, 29, 30, BRASS)                       # plataforma
    c.rect(2, 26, 29, 26, BRASS[0])
    for y in range(6, 26):                            # torre treliça
        t = (y - 6) / 19
        xl, xr = int(16 - 2 - t * 7), int(16 + 2 + t * 7)
        c.rect(xl, y, xl + 1, y, STEEL[1]); c.px(xl, y, STEEL[0])
        c.rect(xr - 1, y, xr, y, STEEL[2])
    for y in (11, 17, 22):
        t = (y - 6) / 19
        c.rect(int(16 - 2 - t * 7), y, int(16 + 2 + t * 7), y, STEEL[1])
    c.rect(15, 8, 16, 27, COPPER[1])                  # haste da broca
    for y in range(9, 27, 2):
        c.px(15, y, COPPER[0]); c.px(16, y, COPPER[2])
    c.gear(16, 6, 4.5, 3.3, 8, STEEL, hole=1.2)       # engrenagem no topo
    c.px(16, 6, BRASS[0])
    c.box(21, 14, 29, 24, COPPER)                     # caixa de pistão
    c.rivets([(22, 15), (28, 15), (22, 23), (28, 23)])
    c.rect(19, 18, 21, 19, STEEL[1])
    c.rect(25, 8, 26, 14, STEEL[1])
    c.rect(24, 7, 27, 8, BRASS[1])
    for x, y in ((4, 24), (7, 25), (9, 24), (25, 25)):  # minério solto
        c.sphere(x, y, 1.7, STEEL)
    c.outline()
    c.rect(24, 3, 27, 5, STEAM); c.rect(25, 1, 27, 2, STEAM)
    return c


def assembler():
    c = Canvas(32, 32)
    c.rect(7, 4, 9, 13, STEEL[1]); c.rect(7, 4, 7, 13, STEEL[0])        # canos
    c.rect(22, 7, 24, 13, STEEL[1]); c.rect(22, 7, 22, 13, STEEL[0])
    c.box(6, 3, 10, 5, BRASS); c.box(21, 6, 25, 8, BRASS)
    c.box(3, 13, 28, 30, BRASS)                       # corpo
    c.rect(3, 13, 28, 14, BRASS[0])
    c.rect(6, 16, 25, 27, DARK)                       # janela
    c.rect(6, 16, 25, 16, COPPER[3])
    c.gear(14, 22, 6.5, 5, 10, STEEL, hole=1.5)
    c.px(14, 22, BRASS[0])
    c.gear(22, 19, 3.5, 2.5, 7, COPPER, hole=0.8)
    c.rivets([(5, 15), (26, 15), (5, 28), (26, 28)])
    c.sphere(16, 9, 3, [rgba('#fff0a8'), rgba('#ffcf5a'), rgba('#d8902a')])  # lâmpada
    c.rect(14, 12, 18, 12, BRASS[2])
    c.outline()
    return c


def hub():
    c = Canvas(32, 32)
    c.box(3, 9, 28, 30, STEEL)                        # cofre
    c.rect(3, 9, 28, 10, BRASS[1]); c.rect(3, 9, 28, 9, BRASS[0])
    c.rect(3, 28, 28, 30, BRASS[2])
    c.sphere(16, 20, 8.5, BRASS)                      # porta redonda
    c.sphere(16, 20, 6.5, STEEL)
    for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        c.line(16, 20, 16 + dx * 5, 20 + dy * 5, BRASS[1])
    c.sphere(16, 20, 2, BRASS)
    c.rivets([(5, 12), (26, 12), (5, 26), (26, 26)])
    for y in range(3, 9):                             # funil de entrada
        inset = (8 - y) * 1.2
        c.rect(int(9 + inset), y, int(22 - inset), y, BRASS[1])
        c.px(int(9 + inset), y, BRASS[0]); c.px(int(22 - inset), y, BRASS[2])
    c.rect(11, 3, 20, 4, DARK)
    for x, y in ((13, 3), (16, 4), (18, 3)):
        c.px(x, y, rgba('#ffe27a'))
    c.outline()
    return c


def conveyor():
    c = Canvas(32, 32)
    c.rect(0, 8, 31, 10, STEEL[1]); c.rect(0, 8, 31, 8, STEEL[0]); c.rect(0, 10, 31, 10, STEEL[2])
    c.rect(0, 22, 31, 24, STEEL[1]); c.rect(0, 22, 31, 22, STEEL[0]); c.rect(0, 24, 31, 24, STEEL[2])
    c.rect(0, 11, 31, 21, LEATHER[1])
    c.rect(0, 11, 31, 11, LEATHER[2]); c.rect(0, 21, 31, 21, LEATHER[2])
    for x0 in (2, 10, 18, 26):                        # setas costuradas
        for i in range(4):
            c.px(x0 + 3 - i, 12 + i + 0, LEATHER[0]); c.px(x0 + 3 - i, 20 - i, LEATHER[0])
    c.rivets([(x, 9) for x in range(3, 32, 8)] + [(x, 23) for x in range(3, 32, 8)], BRASS[0])
    c.gear(16, 27, 3.6, 2.6, 8, BRASS, hole=0.8)
    c.rect(0, 25, 31, 25, rgba('#00000055'))
    c.outline()
    return c


# ---------------- itens (16x16) ----------------

def ore(pal, speck):
    c = Canvas(16, 16)
    for x, y, r in ((6, 9, 4), (11, 10, 3), (8, 5, 3), (3, 11, 2.5)):
        c.sphere(x, y, r, pal)
    for x, y in ((6, 7), (9, 11), (4, 10), (11, 9)):
        c.px(x, y, speck)
    c.outline()
    return c


def plate(pal):
    c = Canvas(16, 16)
    c.box(2, 9, 13, 12, pal)
    c.box(3, 5, 14, 8, pal)
    c.rect(4, 5, 8, 5, pal[0])
    c.outline()
    return c


def gear_item():
    c = Canvas(16, 16)
    c.gear(8, 8, 6.3, 4.6, 8, STEEL, hole=1.6)
    c.outline()
    return c


def wire_item():
    c = Canvas(16, 16)
    c.sphere(8, 8, 5.5, COPPER)
    for y in (5, 7, 9, 11):
        c.rect(4, y, 12, y, COPPER[2])
    c.rect(7, 7, 8, 9, DARK)
    c.px(13, 12, COPPER[0]); c.px(14, 13, COPPER[0]); c.px(15, 13, COPPER[1])
    c.outline()
    return c


def circuit_item():
    """Circuito steampunk = válvula a vácuo."""
    c = Canvas(16, 16)
    c.sphere(8, 6, 4.6, [GLASS[0], GLASS[1], GLASS[2]])
    c.line(7, 4, 7, 8, FIRE[1]); c.line(9, 4, 9, 8, FIRE[1]); c.px(8, 4, FIRE[0])
    c.box(5, 10, 10, 13, BRASS)
    c.px(5, 14, STEEL[1]); c.px(7, 14, STEEL[1]); c.px(9, 14, STEEL[1])
    c.outline()
    return c


def motor_item():
    c = Canvas(16, 16)
    c.cylinder_v(2, 5, 10, 12, BRASS)
    c.rect(2, 8, 10, 8, BRASS[2])
    c.rect(11, 8, 13, 9, STEEL[1])
    c.gear(11, 4, 3.3, 2.3, 6, STEEL, hole=0.8)
    c.rect(4, 12, 9, 13, STEEL[2])
    c.outline()
    return c


# ---------------- terreno ----------------

def ground_tile(seed, ore_kind=None):
    rng = random.Random(seed)
    c = Canvas(32, 32)
    base = [rgba('#3a2f28'), rgba('#43362d'), rgba('#322823')]
    for y in range(32):
        for x in range(32):
            c.px(x, y, base[0] if rng.random() < 0.7 else rng.choice(base[1:]))
    if ore_kind:
        pal = STEEL if ore_kind == 'iron' else COPPER
        speck = STEEL[0] if ore_kind == 'iron' else rgba('#6fbf8a')
        for _ in range(7):
            x, y, r = rng.randint(4, 27), rng.randint(4, 27), rng.choice((2, 2.5, 3))
            c.sphere(x, y, r, pal)
            c.px(int(x), int(y), speck)
    return c


def paste(dst, src, x, y):
    dst.alpha_composite(src.im if isinstance(src, Canvas) else src, (x, y))


def main():
    buildings = [('miner', miner()), ('conveyor', conveyor()), ('furnace', furnace()), ('assembler', assembler()), ('hub', hub())]
    items = [ore(STEEL, STEEL[0]), ore(COPPER, rgba('#6fbf8a')), plate(STEEL), plate(COPPER), gear_item(), wire_item(), circuit_item(), motor_item()]

    # Folha de sprites
    pad, scale = 6, 8
    sheet = Image.new('RGBA', (5 * (32 + pad) + pad, 32 + pad * 3 + 16 + 32 + pad), rgba('#2a2420'))
    for i, (_, s) in enumerate(buildings):
        paste(sheet, s, pad + i * (32 + pad), pad)
    for i, s in enumerate(items):
        paste(sheet, s, pad + i * 20, pad * 2 + 32)
    for i, s in enumerate([ground_tile(1), ground_tile(2, 'iron'), ground_tile(3, 'copper')]):
        paste(sheet, s, pad + i * (32 + pad), pad * 3 + 32 + 16)
    sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST).save(f'{OUT}/steampunk_sheet.png')

    # Cena: mineradora -> esteira -> fornalha -> esteira -> central
    cols, rows, tile = 12, 5, 32
    scene = Image.new('RGBA', (cols * tile, rows * tile))
    rng = random.Random(7)
    for ty in range(rows):
        for tx in range(cols):
            ore_kind = 'iron' if (tx <= 2 and 1 <= ty <= 3) else 'copper' if (tx >= 9 and ty >= 3) else None
            paste(scene, ground_tile(rng.randint(0, 9999), ore_kind), tx * tile, ty * tile)
    row = 2
    placed = {1: miner(), 2: conveyor(), 3: conveyor(), 4: furnace(), 5: conveyor(), 6: conveyor(), 7: assembler(), 8: conveyor(), 9: hub()}
    for tx, s in placed.items():
        paste(scene, s, tx * tile, row * tile)
    for tx, it in ((2, items[0]), (3, items[0]), (5, items[2]), (6, items[2]), (8, items[4])):
        paste(scene, it, tx * tile + 8, row * tile + 8)
    scene.resize((scene.width * 4, scene.height * 4), Image.NEAREST).save(f'{OUT}/steampunk_scene.png')


main()
