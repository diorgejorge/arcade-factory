"""Steampunk top-down: sprites animados 32x32 (N frames em loop) + folha + cena em GIF."""
import math
import random
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
N = 32  # frames por loop (todas as animações fecham em N)
TAU = 2 * math.pi


def rgba(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


OUTLINE = rgba('#1a100c')
BRASS = [rgba(c) for c in ('#f8d77e', '#dba540', '#a8702a', '#6e4519')]
COPPER = [rgba(c) for c in ('#f0976a', '#cb6a3d', '#933f21', '#5c2614')]
STEEL = [rgba(c) for c in ('#cfd7e0', '#94a0ae', '#5e6877', '#38404c')]
LEATHER = [rgba(c) for c in ('#7a5842', '#4e372b', '#35251d')]
FIRE = [rgba('#fff0a0'), rgba('#ffb62e'), rgba('#f06a1c'), rgba('#a8300f')]
IRON_ORE = [rgba(c) for c in ('#c6d1dd', '#8f9cac', '#5d6878', '#3a4250')]
COPPER_ORE = [rgba(c) for c in ('#f6ad78', '#d4743f', '#9a4721', '#5e2a14')]
ROCK = [rgba(c) for c in ('#a3a9b1', '#737984', '#4c515b', '#33373e')]
GLASS = [rgba('#e2f6f2'), rgba('#86cfcf'), rgba('#42929a')]
DARK = rgba('#1e130f')
GROUND = [rgba(c) for c in ('#3f4c2c', '#47562f', '#38442a', '#33402a')]
GRASS = [rgba(c) for c in ('#6f9040', '#90b24c', '#2f3b22')]


class Canvas:
    def __init__(self, w=32, h=32):
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
        self.rect(x0, y0, x1, y1, pal[1])
        self.rect(x0, y0, x1, y0, pal[0])
        self.rect(x0, y0, x0, y1, pal[0])
        self.rect(x0, y1, x1, y1, pal[2])
        self.rect(x1, y0, x1, y1, pal[2])

    def disc(self, cx, cy, r, pal):
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                if dx * dx + dy * dy <= r * r:
                    d = (dx + dy) / (r * 1.414)
                    self.px(x, y, pal[0] if d < -0.5 else pal[3] if d > 0.82 else pal[2] if d > 0.4 else pal[1])

    def gear(self, cx, cy, r_out, r_in, teeth, pal, rot=0.0, hole=1.5):
        for y in range(int(cy - r_out) - 1, int(cy + r_out) + 2):
            for x in range(int(cx - r_out) - 1, int(cx + r_out) + 2):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                r = math.hypot(dx, dy)
                if r > r_out or r < hole:
                    continue
                if r > r_in and ((math.atan2(dy, dx) + rot) / TAU * teeth) % 1 >= 0.5:
                    continue
                d = (dx + dy) / (r_out * 1.414)
                self.px(x, y, pal[0] if d < -0.45 else pal[2] if d > 0.45 else pal[1])

    def line(self, x0, y0, x1, y1, c, thick=1):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, c)
            if thick > 1:
                self.px(x0 + 1, y0, c); self.px(x0, y0 + 1, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

    def rivets(self, pts, c=None):
        for x, y in pts:
            self.px(x, y, c or BRASS[0])

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
        return self

    def with_shadow(self, dx=2, dy=2, alpha=95):
        out = Canvas(self.w, self.h)
        for y in range(self.h):
            for x in range(self.w):
                if self.p[x, y][3] > 0:
                    out.px(x + dx, y + dy, (0, 0, 0, alpha))
        out.im.alpha_composite(self.im)
        return out


def pitch(teeth):
    return TAU / teeth


# ================= máquinas (vista de cima) =================

def base_plate(c, pal):
    c.box(1, 1, 28, 28, pal)
    c.rivets([(3, 3), (26, 3), (3, 26), (26, 26)])


def furnace(f):
    t = f / N
    c = Canvas()
    base_plate(c, STEEL)
    c.disc(14.5, 14.5, 12.5, BRASS)
    c.disc(14.5, 14.5, 10.6, COPPER)
    for k in range(8):
        a = k * TAU / 8 + 0.2
        c.px(14.5 + 11.6 * math.cos(a), 14.5 + 11.6 * math.sin(a), BRASS[0])
    # grelha com fogo
    c.rect(9, 9, 20, 20, STEEL[3])
    rng = random.Random(f // 2)
    for y in range(10, 20):
        for x in range(10, 20):
            core = 1 - math.hypot(x - 14.5, y - 14.5) / 6.5
            v = core + rng.uniform(-0.35, 0.35)
            c.px(x, y, FIRE[0] if v > 0.72 else FIRE[1] if v > 0.45 else FIRE[2] if v > 0.15 else FIRE[3])
    for x in range(9, 21, 3):
        c.rect(x, 9, x, 20, STEEL[2])
    c.rect(9, 14, 20, 14, STEEL[2])
    # chaminé
    c.disc(23, 6.5, 4.3, STEEL)
    c.disc(23, 6.5, 2.6, [DARK] * 4)
    # manômetro
    c.disc(6.5, 22.5, 3.2, BRASS)
    c.disc(6.5, 22.5, 2.2, GLASS + [GLASS[2]])
    a = -0.9 + 0.5 * math.sin(TAU * t * 2)
    c.line(6, 22, 6 + 2 * math.cos(a), 22 + 2 * math.sin(a), DARK)
    return c.outline().with_shadow()


def miner(f):
    t = f / N
    c = Canvas()
    base_plate(c, STEEL)
    c.disc(14.5, 14.5, 12, BRASS)
    c.disc(14.5, 14.5, 10, STEEL)
    # poço com broca em espiral
    for y in range(5, 25):
        for x in range(5, 25):
            dx, dy = x + 0.5 - 14.5, y + 0.5 - 14.5
            r = math.hypot(dx, dy)
            if r > 8.6:
                continue
            ang = math.atan2(dy, dx)
            rot = t * TAU / 3 * 2
            hit = any(abs((ang - (rot + k * TAU / 3 + r * 0.32) + math.pi) % TAU - math.pi) < 0.42 for k in range(3))
            c.px(x, y, STEEL[0] if hit and r < 8 else DARK if r > 8 else STEEL[2] if hit else STEEL[3])
    c.disc(14.5, 14.5, 2.6, BRASS)
    # engrenagens de canto
    c.gear(5.5, 5.5, 4.3, 3, 8, STEEL, rot=t * pitch(8) * 2)
    c.gear(23.5, 23.5, 4.3, 3, 8, STEEL, rot=-t * pitch(8) * 2 + pitch(8) / 2)
    # pistão
    c.box(21, 3, 27, 9, COPPER)
    c.rect(22, 5 + round(1.5 * math.sin(TAU * t)), 26, 6 + round(1.5 * math.sin(TAU * t)), STEEL[1])
    c.rivets([(2, 26), (6, 26)], STEEL[0])
    return c.outline().with_shadow()


def assembler(f):
    t = f / N
    c = Canvas()
    base_plate(c, BRASS)
    c.rect(4, 4, 25, 25, STEEL[3])
    c.rect(4, 4, 25, 4, STEEL[2]); c.rect(4, 4, 4, 25, STEEL[2])
    g1_rot = t * pitch(10) * 2
    c.gear(11.5, 12.5, 7.2, 5.6, 10, STEEL, rot=g1_rot)
    c.disc(11.5, 12.5, 1.8, BRASS)
    c.gear(21, 17.5, 4.6, 3.4, 6, COPPER, rot=-g1_rot * 10 / 6 + pitch(6) / 2, hole=1)
    # braço robótico
    a1 = math.radians(-50) + math.radians(28) * math.sin(TAU * t)
    a2 = a1 + math.radians(65) * math.cos(TAU * t)
    p0 = (6.5, 22.5)
    p1 = (p0[0] + 8 * math.cos(a1), p0[1] + 8 * math.sin(a1))
    p2 = (p1[0] + 7 * math.cos(a2), p1[1] + 7 * math.sin(a2))
    c.line(p0[0] + 1, p0[1] + 1, p1[0] + 1, p1[1] + 1, DARK, 2)
    c.line(p1[0] + 1, p1[1] + 1, p2[0] + 1, p2[1] + 1, DARK, 2)
    c.line(*p0, *p1, STEEL[0], 2)
    c.line(*p1, *p2, STEEL[1], 2)
    c.disc(p0[0] + 0.5, p0[1] + 0.5, 2.6, BRASS)
    c.disc(p1[0] + 0.5, p1[1] + 0.5, 1.8, BRASS)
    c.disc(p2[0] + 0.5, p2[1] + 0.5, 1.6, COPPER)
    # lâmpada piscando
    lit = (t * 2) % 1 < 0.5
    c.disc(26.5, 5.5, 1.9, [rgba('#fff3a8'), rgba('#ffd24a'), rgba('#c98a1f'), rgba('#8a5a12')] if lit else [rgba('#7a5a1a')] * 4)
    return c.outline().with_shadow()


def hub(f):
    t = f / N
    c = Canvas()
    base_plate(c, STEEL)
    c.rect(2, 2, 27, 2, BRASS[1]); c.rect(2, 27, 27, 27, BRASS[2])
    c.rect(2, 2, 2, 27, BRASS[1]); c.rect(27, 2, 27, 27, BRASS[2])
    c.disc(14.5, 14.5, 10.5, BRASS)
    c.disc(14.5, 14.5, 8.8, STEEL)
    rot = t * TAU / 4
    for k in range(4):
        a = rot + k * TAU / 4
        ex, ey = 14.5 + 6.2 * math.cos(a), 14.5 + 6.2 * math.sin(a)
        c.line(14.5, 14.5, ex, ey, BRASS[1], 2)
        c.disc(ex + 0.5, ey + 0.5, 1.5, BRASS)
    c.disc(14.5, 14.5, 2.4, BRASS)
    for x, y in ((12, 1), (12, 26), (1, 12), (26, 12)):   # bocas de entrada
        w, h = (6, 2) if y in (1, 26) else (2, 6)
        c.rect(x, y, x + w - 1, y + h - 1, DARK)
    lit = (t * 4) % 1 < 0.5
    c.disc(5.5, 5.5, 1.6, [rgba('#c8ffd8'), rgba('#5fd38d'), rgba('#2f8f4e'), rgba('#1c5b31')] if lit else [rgba('#2f6b45')] * 4)
    return c.outline().with_shadow()


def chute(direction):
    """Bico de saída (latão) na borda indicada; 0=leste,1=sul,2=oeste,3=norte."""
    c = Canvas()
    c.box(27, 12, 31, 19, BRASS)
    c.rect(30, 14, 31, 17, DARK)
    c.outline()
    return Canvas_from(c.im.rotate(-90 * direction))


def Canvas_from(img):
    out = Canvas(*img.size)
    out.im = img.copy()
    out.p = out.im.load()
    return out


def conveyor(f, direction=0):
    c = Canvas()
    for y0, pal in ((3, STEEL), (26, STEEL)):
        c.rect(0, y0, 31, y0 + 2, pal[1])
        c.rect(0, y0, 31, y0, pal[0]); c.rect(0, y0 + 2, 31, y0 + 2, pal[2])
    c.rect(0, 6, 31, 25, LEATHER[1])
    c.rect(0, 6, 31, 7, LEATHER[2]); c.rect(0, 24, 31, 25, LEATHER[2])
    off = f % 8
    for cx in range(-8 + off, 40, 8):
        for dy in range(-5, 6):
            x = cx - abs(dy)
            c.px(x, 15 + dy, LEATHER[0]); c.px(x + 1, 15 + dy, LEATHER[0])
    for x in range(3, 32, 8):
        c.px(x, 4, BRASS[0]); c.px(x, 27, BRASS[0])
    img = c.im.rotate(-90 * direction)
    out = Canvas_from(img)
    sh = Canvas(); sh.im.alpha_composite(Image.new('RGBA', (32, 32), (0, 0, 0, 0)))
    return out


# ================= itens (16x16) =================

def finish_item(c):
    return c.outline().with_shadow(1, 1, 110)


def item_ore(pal, speck=None):
    c = Canvas(16, 16)
    for x, y, r in ((5.5, 9.5, 4.2), (10.5, 10.5, 3.4), (8.5, 5.5, 3.6)):
        c.disc(x, y, r, pal)
    if speck:
        for x, y in ((6, 8), (10, 10), (8, 5)):
            c.px(x, y, speck)
    return finish_item(c)


def item_plate(pal):
    c = Canvas(16, 16)
    c.box(1, 7, 11, 12, pal)
    c.box(4, 3, 14, 8, pal)
    c.rect(5, 4, 9, 4, pal[0])
    return finish_item(c)


def item_gear():
    c = Canvas(16, 16)
    c.gear(7.5, 7.5, 6.3, 4.6, 8, STEEL, hole=1.6)
    return finish_item(c)


def item_wire():
    c = Canvas(16, 16)
    c.disc(7.5, 7.5, 6, COPPER)
    c.disc(7.5, 7.5, 4, [COPPER[2]] * 4)
    c.disc(7.5, 7.5, 2.8, COPPER)
    c.disc(7.5, 7.5, 1.2, [DARK] * 4)
    return finish_item(c)


def item_circuit():
    c = Canvas(16, 16)
    c.box(1, 5, 4, 10, BRASS)
    c.rect(5, 5, 13, 10, GLASS[1]); c.rect(5, 5, 13, 5, GLASS[0]); c.rect(5, 10, 13, 10, GLASS[2])
    c.rect(14, 6, 14, 9, GLASS[1])
    c.line(6, 8, 12, 8, FIRE[1])
    c.px(0, 6, STEEL[1]); c.px(0, 9, STEEL[1])
    return finish_item(c)


def item_motor():
    c = Canvas(16, 16)
    c.box(2, 4, 10, 12, BRASS)
    c.rect(2, 8, 10, 8, BRASS[2])
    c.rect(11, 7, 14, 8, STEEL[1])
    c.gear(5.5, 8.5, 2.8, 1.9, 6, STEEL, hole=0.7)
    return finish_item(c)


# ================= terreno =================

_cache = {}


def ground(seed, state=0):
    key = ('g', seed, state)
    if key in _cache:
        return _cache[key]
    rng = random.Random(seed)
    c = Canvas()
    for by in range(0, 32, 2):
        for bx in range(0, 32, 2):
            col = GROUND[0] if rng.random() < 0.55 else rng.choice(GROUND[1:])
            c.rect(bx, by, bx + 1, by + 1, col)
    for _ in range(rng.randint(2, 4)):                      # tufos de grama
        x, y = rng.randint(3, 28), rng.randint(4, 28)
        for dx in (-1, 0, 1):
            c.px(x + dx, y, GRASS[2]); c.px(x + dx, y - 1, GRASS[0])
        c.px(x, y - 2, GRASS[1]); c.px(x - 1, y - 2, GRASS[0])
    if rng.random() < 0.35:                                  # flor balançando
        x, y = rng.randint(4, 27), rng.randint(4, 27)
        petal = rng.choice(('#f2d35a', '#e86f8a', '#f4f1e8'))
        sway = state % 2
        c.px(x + sway, y, rgba(petal)); c.px(x + 1 + sway, y, rgba(petal)); c.px(x + sway, y + 1, rgba(petal))
        c.px(x + 1 + sway, y + 1, rgba('#e9a23a'))
    if rng.random() < 0.18:                                  # pedrinhas
        x, y = rng.randint(4, 26), rng.randint(4, 26)
        c.px(x + 1, y + 1, (0, 0, 0, 90)); c.px(x, y, ROCK[1]); c.px(x + 1, y, ROCK[0])
    if rng.random() < 0.08:                                  # cogumelo
        x, y = rng.randint(4, 26), rng.randint(4, 26)
        c.rect(x, y, x + 2, y + 1, rgba('#c0392b')); c.px(x + 1, y, rgba('#f4f1e8')); c.px(x + 1, y + 2, rgba('#e8dcc0'))
    _cache[key] = c
    return c


def ore_tile(kind, seed, f):
    state = (f // 4) % 8
    key = ('o', kind, seed, state)
    if key in _cache:
        return _cache[key]
    rng = random.Random(seed)
    pal = IRON_ORE if kind == 'iron' else COPPER_ORE
    c = Canvas(*(32, 32))
    c.im.alpha_composite(ground(seed, 0).im)
    layer = Canvas()
    lumps = []
    for gy in range(3):
        for gx in range(3):
            if rng.random() < 0.1:
                continue
            lumps.append((6 + gx * 10 + rng.randint(-2, 2), 6 + gy * 10 + rng.randint(-2, 2), rng.uniform(3.4, 4.8)))
    for x, y, r in sorted(lumps, key=lambda l: l[1]):
        layer.disc(x, y, r, pal)
        if kind == 'copper' and rng.random() < 0.7:
            layer.px(x + rng.randint(-1, 1), y + rng.randint(0, 2), rgba('#6fbf8a'))
    layer.outline()
    layer = layer.with_shadow(1, 1, 90)
    c.im.alpha_composite(layer.im)
    for i, (x, y, _) in enumerate(lumps):                    # brilho piscando
        if (state + i) % 8 == 0:
            for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                c.px(x - 1 + dx, y - 2 + dy, (255, 255, 255, 230 if (dx, dy) == (0, 0) else 140))
    _cache[key] = c
    return c


def rock_tile(seed):
    key = ('r', seed)
    if key in _cache:
        return _cache[key]
    rng = random.Random(seed)
    c = Canvas()
    c.im.alpha_composite(ground(seed, 0).im)
    layer = Canvas()
    for x, y, r in ((10, 11, 7), (22, 20, 6), (21, 8, 4)):
        layer.disc(x + rng.randint(-1, 1), y + rng.randint(-1, 1), r, ROCK)
        for _ in range(4):
            layer.px(x - r + rng.randint(1, r), y - r + rng.randint(1, r), rgba('#5f7a38'))
    layer.outline()
    c.im.alpha_composite(layer.with_shadow(2, 2, 100).im)
    _cache[key] = c
    return c


def puddle_tile(seed, f):
    c = Canvas()
    c.im.alpha_composite(ground(seed, 0).im)
    layer = Canvas()
    for y in range(32):
        for x in range(32):
            if ((x - 16) / 11) ** 2 + ((y - 16) / 8) ** 2 <= 1:
                layer.px(x, y, rgba('#3a6f86'))
    layer.rect(8, 13, 11, 13, rgba('#7fb7c9'))
    r = 2 + (f / N) * 7
    for a in range(0, 360, 6):
        x, y = 16 + r * math.cos(math.radians(a)), 16 + r * 0.7 * math.sin(math.radians(a))
        if ((x - 16) / 11) ** 2 + ((y - 16) / 8) ** 2 <= 0.85:
            layer.px(x, y, rgba('#a9d6e4'))
    c.im.alpha_composite(layer.outline().im)
    return c


# ================= efeitos globais =================

def smoke(img, gx, gy, t, puffs=4, scale=1.0):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for k in range(puffs):
        u = (t + k / puffs) % 1
        r = (1.8 + u * 5) * scale
        x = gx + u * 9 + math.sin(u * 6 + k * 2) * 2
        y = gy - u * 16 * scale
        a = int(190 * (1 - u) ** 1.4)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(232, 238, 241, a))
    img.alpha_composite(layer)


def glow(img, gx, gy, radius, t):
    flick = 0.85 + 0.15 * math.sin(TAU * t * 3) + 0.05 * math.sin(TAU * t * 7)
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    px = layer.load()
    for y in range(int(gy - radius), int(gy + radius) + 1):
        for x in range(int(gx - radius), int(gx + radius) + 1):
            d = math.hypot(x - gx, y - gy) / radius
            if d < 1 and 0 <= x < img.width and 0 <= y < img.height:
                px[x, y] = (255, 150, 40, int(70 * (1 - d) ** 2 * flick))
    img.alpha_composite(layer)


def paste(dst, src, x, y):
    dst.alpha_composite(src.im if isinstance(src, Canvas) else src, (x, y))


# ================= saídas =================

def make_sheet():
    pad, step = 6, 36
    frames = (0, 8, 16, 24)
    machines = [miner, furnace, assembler, hub]
    w = pad + max(len(frames) * step, 8 * 20 + 20)
    sheet = Image.new('RGBA', (w + 60, pad * 5 + 4 * step + 20 + 32 + 40), rgba('#2a2a22'))
    for row, fn in enumerate(machines):
        for col, f in enumerate(frames):
            tile = fn(f)
            paste(sheet, ground(row * 11 + 3), (0, 0), 0, 0) if False else None
            sheet.alpha_composite(ground(40 + row).im, (pad + col * step, pad + row * step))
            paste(sheet, tile, pad + col * step, pad + row * step)
            if fn is furnace:
                smoke(sheet, pad + col * step + 23, pad + row * step + 6, f / N, puffs=3, scale=0.8)
    # esteira (4 direções) à direita
    for d in range(4):
        sheet.alpha_composite(ground(70 + d).im, (pad + 4 * step + 8, pad + d * step))
        paste(sheet, conveyor(0, d), pad + 4 * step + 8, pad + d * step)
    y0 = pad * 2 + 4 * step
    items = [item_ore(IRON_ORE), item_ore(COPPER_ORE, rgba('#6fbf8a')), item_plate(STEEL), item_plate(COPPER), item_gear(), item_wire(), item_circuit(), item_motor()]
    for i, it in enumerate(items):
        sheet.alpha_composite(ground(80 + i).im.crop((0, 0, 16, 16)), (pad + i * 20, y0))
        paste(sheet, it, pad + i * 20, y0)
    y1 = y0 + 16 + pad
    tiles = [ground(1), ground(2), ore_tile('iron', 5, 0), ore_tile('copper', 6, 0), rock_tile(9), puddle_tile(11, 6)]
    for i, tl in enumerate(tiles):
        paste(sheet, tl, pad + i * 34, y1)
    sheet.resize((sheet.width * 6, sheet.height * 6), Image.NEAREST).save(f'{OUT}/v2_sheet.png')


def make_scene():
    cols, rows, T = 14, 7, 32
    rng = random.Random(21)
    seeds = [[rng.randint(0, 99999) for _ in range(cols)] for _ in range(rows)]
    row = 3
    iron = {(1, 2), (1, 3), (1, 4), (0, 3), (0, 4), (2, 4), (0, 2)}
    copper = {(11, 5), (12, 5), (12, 6), (13, 5), (13, 6), (11, 6), (13, 4)}
    rocks = {(10, 0), (11, 0), (12, 1), (13, 0), (0, 6)}
    puddle = {(7, 5)}
    layout = {1: ('miner', miner), 4: ('furnace', furnace), 7: ('assembler', assembler), 10: ('hub', hub)}
    belts = [2, 3, 5, 6, 8, 9]
    frames = []
    for f in range(N):
        t = f / N
        img = Image.new('RGBA', (cols * T, rows * T))
        for ty in range(rows):
            for tx in range(cols):
                s = seeds[ty][tx]
                if (tx, ty) in iron:
                    tl = ore_tile('iron', s, f)
                elif (tx, ty) in copper:
                    tl = ore_tile('copper', s, f)
                elif (tx, ty) in rocks:
                    tl = rock_tile(s)
                elif (tx, ty) in puddle:
                    tl = puddle_tile(s, f)
                else:
                    tl = ground(s, (f // 8) % 2)
                paste(img, tl, tx * T, ty * T)
        if True:
            glow(img, 4 * T + 16, row * T + 16, 46, t)
        for tx in belts:
            paste(img, conveyor(f), tx * T, row * T)
        for tx, (name, fn) in layout.items():
            paste(img, fn(f), tx * T, row * T)
            if name != 'hub':
                paste(img, chute(0), tx * T, row * T)
        # itens deslizando: 1 tile por loop, espaçados de 32px
        for seg, maker in (((2, 3), lambda: item_ore(IRON_ORE)), ((5, 6), lambda: item_plate(STEEL)), ((8, 9), lambda: item_gear())):
            x_start = seg[0] * T
            length = (seg[1] - seg[0] + 1) * T
            it = maker()
            for k in range(2):
                pos = (f * (T / N) + k * T) % length
                paste(img, it, int(x_start + pos) - 0, row * T + 8)
        smoke(img, 4 * T + 23, row * T + 6, t, puffs=5, scale=1.1)
        frames.append(img.convert('RGB'))
    return frames


def save_gif(frames, path, scale=3, duration=55):
    big = [f.resize((f.width * scale, f.height * scale), Image.NEAREST) for f in frames]
    pal = big[0].quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in big]
    q[0].save(path, save_all=True, append_images=q[1:], duration=duration, loop=0, optimize=False, disposal=1)


make_sheet()
frames = make_scene()
frames[0].resize((frames[0].width * 3, frames[0].height * 3), Image.NEAREST).save(f'{OUT}/v2_scene_frame.png')
save_gif(frames, f'{OUT}/v2_scene.gif')
