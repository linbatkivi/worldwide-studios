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
JOBS = [
    ("white-dust", "hero",   WD / "maps/niseko_spawn.jpg",        1920),
    ("white-dust", "s1",     WD / "maps/bureau_terrasse.jpg",     1280),
    ("white-dust", "s2",     WD / "maps/niseko_canal.jpg",        1280),
    ("white-dust", "s3",     WD / "maps/bureau_atrium.jpg",       1280),
    ("white-dust", "s4",     WD / "maps/fattoria_mid.jpg",        1280),
    ("white-dust", "s5",     WD / "shots/v21_runde_vundet.jpg",   1280),
    ("blindline",  "hero",   SRC / "blindline-hero.webp",         1920),
    ("blindline",  "s1",     SRC / "blindline-s1.webp",          1280),
    ("blindline",  "s2",     SRC / "blindline-s2.webp",          1280),
    ("blindline",  "s3",     SRC / "blindline-s3.webp",          1280),
    ("blindline",  "s4",     SRC / "blindline-s4.webp",          1280),
    # filmiske billeder taget direkte i spillet uden skærmtekst (nye navne, så launcheren henter dem fra siden uden en ny udgave)
    ("blindline",  "hero2",  SRC / "blindline-hero2.webp",       1920),
    ("blindline",  "c1",     SRC / "blindline-c1.webp",          1280),
    ("blindline",  "c2",     SRC / "blindline-c2.webp",          1280),
    ("blindline",  "c3",     SRC / "blindline-c3.webp",          1280),
    ("blindline",  "c4",     SRC / "blindline-c4.webp",          1280),
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
        print("mangler:", src); continue
    img = Image.open(src)
    for out in OUT:
        total += save(img, out / game / f"{name}.webp", width)
    # lille udgave til kort og lister
    for out in OUT:
        total += save(img, out / game / f"{name}-sm.webp", 640, 74)
print(f"færdig: {len(JOBS)} billeder × 2 størrelser × {len(OUT)} steder, {total/1e6:.1f} MB i alt")
