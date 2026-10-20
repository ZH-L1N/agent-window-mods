"""Write hooks/mascots.ts data block for the agents mod from grids.json.

Usage: python3 -I gen_mascots.py <grids.json> <out.ts-fragment>
Prints the PALETTE and POSES table only; mascots.ts carries the code.
"""
import json
import sys

POSES = [
    'repairing-with-tools',
    'writing-software-code',
    'building-colorful-blocks',
    'debugging-system-bugs',
    'reading-data-document',
    'thinking-in-code',
    'artboard-25cla',
    'with-success-checkmark',
    'confusion-spiral-pixel',
    'sleeping-soundly',
]
ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

grids = json.load(open(sys.argv[1]))
palette = []
for name in POSES:
    for row in grids[name]['cells']:
        for c in row:
            if c and c.lower() not in palette:
                palette.append(c.lower())
assert len(palette) <= len(ALPHABET)

out = []
out.append('/** Every colour the poses use, as 0xRRGGBB; a row character indexes it (0-9, a-z, A-Z). */')
out.append('export const PALETTE: readonly number[] = [')
for i in range(0, len(palette), 8):
    out.append('  ' + ', '.join('0x' + c[1:] for c in palette[i:i + 8]) + ',')
out.append(']')
out.append('')
out.append("/** Each pose's pixel rows, top to bottom: '.' is empty, any other character a PALETTE index. */")
out.append('export const POSES = {')
for name in POSES:
    g = grids[name]
    out.append(f"  '{name}': [")
    for row in g['cells']:
        s = ''.join('.' if not c else ALPHABET[palette.index(c.lower())] for c in row)
        assert len(s) == g['w']
        out.append(f"    '{s}',")
    out.append('  ],')
out.append('} as const')
open(sys.argv[2], 'w').write('\n'.join(out) + '\n')
print(len(palette), 'colours')
