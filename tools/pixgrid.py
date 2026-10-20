"""Decode a PNG without PIL, find its pixel-art grid, snap cells to a flat palette, render half-blocks.

Usage: python3 -I pixgrid.py <png> [cell_px]   prints the half-block rendering and the grid size.
Import: grid(path, cell=None) -> (cell, cells) where cells is rows of (r,g,b) or None; half(cells) -> ANSI lines.
"""
import zlib, struct, sys, os
from collections import Counter


def decode_png(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path
    pos = 8; idat = b''; plte = None; trns = None
    while pos < len(d):
        n, = struct.unpack('>I', d[pos:pos+4]); t = d[pos+4:pos+8]; body = d[pos+8:pos+8+n]; pos += 12 + n
        if t == b'IHDR': w, h, bd, ct, _, _, il = struct.unpack('>IIBBBBB', body)
        elif t == b'PLTE': plte = body
        elif t == b'tRNS': trns = body
        elif t == b'IDAT': idat += body
    assert bd == 8 and il == 0, (path, bd, il)
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    stride = w * ch; out = []; prev = bytearray(stride); p = 0
    for y in range(h):
        f = raw[p]; p += 1; line = bytearray(raw[p:p+stride]); p += stride
        for i in range(stride):
            a = line[i-ch] if i >= ch else 0; b = prev[i]; c = prev[i-ch] if i >= ch else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if pa <= pb and pa <= pc else b if pb <= pc else c
                line[i] = (line[i] + pr) & 255
        out.append(bytes(line)); prev = line
    px = []
    for y in range(h):
        row = []
        for x in range(w):
            if ct == 6: r, g, b, a = out[y][x*4:x*4+4]
            elif ct == 2: r, g, b = out[y][x*3:x*3+3]; a = 255
            elif ct == 3:
                i = out[y][x]; r, g, b = plte[i*3:i*3+3]; a = trns[i] if trns and i < len(trns) else 255
            elif ct == 4: v, a = out[y][x*2:x*2+2]; r = g = b = v
            else: v = out[y][x]; r = g = b = v; a = 255
            row.append((r, g, b, a))
        px.append(row)
    return w, h, px


def near(c, pal):
    return min(pal, key=lambda p: sum((p[i]-c[i])**2 for i in range(3)))


def is_bg(c):
    r, g, b, a = c
    return a < 40


def detect_cell(w, h, px):
    """Pixel-art cell size: the smallest common run length of one colour along rows and columns."""
    runs = Counter()
    for y in range(0, h, max(1, h // 40)):
        last = None; n = 0
        for x in range(w):
            key = None if is_bg(px[y][x]) else px[y][x][:3]
            if key == last: n += 1
            else:
                if last is not None and n >= 2: runs[n] += 1
                last = key; n = 1
        if last is not None and n >= 2: runs[n] += 1
    if not runs: return 1
    # the cell is the gcd-like smallest run that most runs are multiples of
    common = [k for k, v in runs.most_common(12)]
    best = min(common)
    for cand in sorted(common):
        if sum(v for k, v in runs.items() if k % cand == 0) >= 0.8 * sum(runs.values()):
            best = cand; break
    return best


def grid(path, cell=None, snap=40, origin=None, count=None):
    """cells on the art grid. Pack files: 1020 px canvas, 46 x 46 cells of ~21.85 px starting at ~7.3 px.
    With count given, cell = (w - 2*origin) / count and each cell is sampled at its centre pixel."""
    w, h, px = decode_png(path)
    if count is not None:
        if origin is None: origin = 7.3 * w / 1020
        cell = (w - 2 * origin) / count
        gw = gh = count
    else:
        if cell is None: cell = detect_cell(w, h, px)
        origin = 0.0
        gw, gh = round(w / cell), round(h / cell)
    cells = []
    for gy in range(gh):
        row = []
        for gx in range(gw):
            cx = min(w - 1, int(origin + (gx + 0.5) * cell)); cy = min(h - 1, int(origin + (gy + 0.5) * cell))
            # majority of a small 3x3 patch at the centre, so an anti-aliased edge cannot flip a cell
            cnt = Counter()
            for y in range(max(0, cy - 1), min(h, cy + 2)):
                for x in range(max(0, cx - 1), min(w, cx + 2)):
                    c = px[y][x]
                    cnt['bg' if is_bg(c) else (c[0], c[1], c[2])] += 1
            k, _ = cnt.most_common(1)[0]
            row.append(None if k == 'bg' else k)
        cells.append(row)
    cnt = Counter(c for r in cells for c in r if c)
    pal = []
    for c, n in cnt.most_common():
        if not any(sum((c[i]-p[i])**2 for i in range(3)) < snap*snap for p in pal): pal.append(c)
    cells = [[None if c is None else near(c, pal) for c in r] for r in cells]
    ys = [y for y, r in enumerate(cells) if any(r)]; xs = [x for r in cells for x, c in enumerate(r) if c]
    if not ys: return cell, []
    cells = [r[min(xs):max(xs)+1] for r in cells[min(ys):max(ys)+1]]
    return cell, cells


E = '\x1b['
def fg(c): return f'{E}38;2;{c[0]};{c[1]};{c[2]}m'
def bgc(c): return f'{E}48;2;{c[0]};{c[1]};{c[2]}m'


def half(cells):
    out = []
    if not cells: return out
    W = max(len(r) for r in cells)
    rows = [list(r) + [None] * (W - len(r)) for r in cells]
    if len(rows) % 2: rows.append([None] * W)
    for y in range(0, len(rows), 2):
        line = ''
        for x in range(W):
            t = rows[y][x]; b = rows[y+1][x]
            if t is None and b is None: line += ' '
            elif b is None: line += fg(t) + '▀' + f'{E}0m'
            elif t is None: line += fg(b) + '▄' + f'{E}0m'
            else: line += fg(t) + bgc(b) + '▀' + f'{E}0m'
        out.append(line)
    return out


if __name__ == '__main__':
    path = sys.argv[1]; cell = float(sys.argv[2]) if len(sys.argv) > 2 else None
    cell, cells = grid(path, cell)
    rows = half(cells)
    print(f'{os.path.basename(path)}: cell {cell}px, {len(cells[0]) if cells else 0}x{len(cells)} px, {len(rows)} rows')
    for r in rows: print('  ' + r)
