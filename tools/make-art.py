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
CX = HOME / "Complex/docs"

# (spil, filnavn, kilde, bredde)
JOBS = [
    ("white-dust", "hero",   WD / "maps/niseko_spawn.jpg",        1920),
    ("white-dust", "s1",     WD / "maps/bureau_terrasse.jpg",     1280),
    ("white-dust", "s2",     WD / "maps/niseko_canal.jpg",        1280),
    ("white-dust", "s3",     WD / "maps/bureau_atrium.jpg",       1280),
    ("white-dust", "s4",     WD / "maps/fattoria_mid.jpg",        1280),
    ("white-dust", "s5",     WD / "shots/v21_runde_vundet.jpg",   1280),
    ("complex",    "hero",   CX / "m2/m2_hero_t2.0.png",          1920),
    ("complex",    "s1",     CX / "m1/m1_cam1.png",               1280),
    ("complex",    "s2",     CX / "m3/m3_hit_effects.png",        1280),
    ("complex",    "s3",     CX / "m3/m3_point.png",              1280),
    ("complex",    "s4",     CX / "m1/m1_cam0.png",               1280),
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
