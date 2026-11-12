#!/usr/bin/env python3
"""Laver billederne til hjemmesiden og launcheren ud fra spillenes egne skærmbilleder.

Kør:  python3 tools/make-art.py
Kilderne ligger i spillenes mapper (~/Projekter/wd og ~/Projekter/Complex). Resultatet lægges i
site/assets/art og launcher/src/renderer/art med samme filnavne, så kataloget kan pege på begge steder.
"""
import os
from pathlib import Path
from PIL import Image

HOME = Path.home() / "Projekter"
ROOT = Path(__file__).resolve().parent.parent
OUT = [ROOT / "site/assets/art", ROOT / "launcher/src/renderer/art"]

WD = HOME / "wd/web/assets/img"
SRC = ROOT / "tools/art-src"

# (spil, filnavn, kilde, bredde)
# Billederne er filmiske, uden skærmtekst, og navnet ender på datoen de er taget (ÅÅÅÅMMDD), så launcheren altid henter de nye og ikke
# cachede gamle. Se docs/katalog-indhold.md. Ved nye billeder: læg kilderne i tools/art-src, tilføj dem her og ret art i catalog/games.json.
D = "20261112"
def set_(game, prefix):
    rows = [("hero", "wh", 1920)] + [(f"s{i}", f"w{i}", 1280) for i in range(1, 6)]
    return [(game, f"{n}-{D}", SRC / f"{prefix}-{k}.webp", w) for n, k, w in rows]

JOBS = [
    *set_("white-dust", "white-dust"),
    *set_("blindline", "blindline"),
    *set_("freefall", "freefall"),
    *set_("offside", "offside"),
    *set_("flugt", "flugt"),
]

def save(img, dest, width, quality=80):
    im = img.convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=quality, method=6)
    return dest.stat().st_size

total = 0
for game, name, src, width in JOBS:
    if not src.exists():
        continue
    img = Image.open(src)
    for out in OUT:
        total += save(img, out / game / f"{name}.webp", width)
    # lille udgave til kort og lister
    for out in OUT:
        total += save(img, out / game / f"{name}-sm.webp", 640, 74)
print(f"færdig: {len(JOBS)} billeder × 2 størrelser × {len(OUT)} steder, {total/1e6:.1f} MB i alt")
