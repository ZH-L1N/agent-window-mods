# tools

Helper scripts kept with the mods, run with `python3 -I` from anywhere.

- `pixgrid.py`: decodes a PNG without PIL, samples a pixel-art grid (the
  Claude Mascot Pack uses a 46 x 46 grid with a 7.3 px margin on a 1020 px
  canvas; pass `count=46`), snaps colours to a flat palette and renders
  half-block previews.
- `gen_mascots.py`: writes the palette and pose table in
  `agents/hooks/mascots.ts` from a grids JSON produced with `pixgrid.grid`.


