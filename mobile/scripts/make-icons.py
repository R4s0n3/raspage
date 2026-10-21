"""
The app's icons, drawn from the moodpage's own weather: an evening light over
dark water, its broken reflection running towards you. Wordless, like the
page. Colours are the evening palette (mood.js, "Drawing Water").

    python3 mobile/scripts/make-icons.py

Writes mobile/assets/: icon.png (iOS), the three Android adaptive layers,
splash-icon.png and favicon.png. Needs Pillow.
"""

import math
import os
import random

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")

NIGHT = (6, 8, 10)
DEEP = (26, 34, 36)
HAZE = (95, 101, 80)
LIGHT = (207, 200, 178)
GLOW = (217, 148, 79)

HORIZON = 0.6  # where sky becomes water, as a fraction of the height
LIGHT_X, LIGHT_Y, LIGHT_R = 0.5, 0.4, 0.105


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def add(a, b, amount):
    return tuple(min(255.0, a[i] + b[i] * amount) for i in range(3))


def sky_and_water(x, y):
    """The scene without the light: sky above the horizon, water below."""
    if y < HORIZON:
        t = y / HORIZON
        colour = mix(NIGHT, DEEP, t ** 1.4)
        # Haze gathers low over the water.
        colour = mix(colour, HAZE, 0.35 * math.exp(-((HORIZON - y) / 0.07) ** 2))
    else:
        t = (y - HORIZON) / (1 - HORIZON)
        colour = mix(DEEP, NIGHT, t ** 0.7)
        colour = mix(colour, HAZE, 0.18 * math.exp(-((y - HORIZON) / 0.04) ** 2))
    # A soft vignette, as on the page.
    d = math.hypot(x - 0.5, y - 0.5)
    return mix(colour, NIGHT, max(0.0, (d - 0.38) * 1.6))


def light(x, y, rng_rows):
    """The light and its halo above, its broken reflection below (as RGB to
    add, scaled 0..1)."""
    dx, dy = x - LIGHT_X, y - LIGHT_Y
    d = math.hypot(dx, dy)
    out = (0.0, 0.0, 0.0)
    if y < HORIZON + 0.004:
        halo = math.exp(-(d / 0.24) ** 2) * 0.55
        out = add(out, GLOW, halo / 255)
        if d < LIGHT_R:
            core = 1 - (d / LIGHT_R) ** 3
            out = add(out, mix(GLOW, LIGHT, core), (0.75 + 0.25 * core) / 255)
        else:
            edge = math.exp(-((d - LIGHT_R) / 0.012) ** 2)
            out = add(out, LIGHT, edge * 0.6 / 255)
    else:
        # The reflection: a column of glints that widens towards the viewer.
        depth = (y - HORIZON) / (1 - HORIZON)
        width = 0.03 + depth * 0.13
        across = math.exp(-(dx / width) ** 2)
        row = rng_rows[int(y * 1024) % len(rng_rows)]
        flicker = max(0.0, math.sin((x * 9 + row) * 6.0)) ** 3
        bands = 0.5 + 0.5 * math.sin(depth * 70 + row)
        glint = across * (0.25 + 0.75 * flicker * bands) * (1 - depth * 0.55)
        out = add(out, mix(GLOW, LIGHT, 0.4), glint * 0.95 / 255)
        out = add(out, GLOW, across * 0.12 * math.exp(-depth * 3) / 255)
    return out


def draw(size, scene=True, glow=True, alpha_glow=False):
    rng = random.Random(7)
    rows = [rng.uniform(0, 2 * math.pi) for _ in range(997)]
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for py in range(size):
        y = (py + 0.5) / size
        for px in range(size):
            x = (px + 0.5) / size
            base = sky_and_water(x, y) if scene else (0.0, 0.0, 0.0)
            lit = light(x, y, rows) if glow else (0.0, 0.0, 0.0)
            if alpha_glow:
                # Light alone on transparency (Android foreground, splash).
                strength = min(1.0, max(lit) * 1.15)
                colour = tuple(min(255, c / max(strength, 1e-3) * 255) for c in lit) if strength > 0 else (0, 0, 0)
                pixels[px, py] = (*[int(c) for c in colour], int(strength * 255))
            else:
                colour = tuple(min(255.0, base[i] + lit[i] * 255) for i in range(3))
                pixels[px, py] = (*[int(c) for c in colour], 255)
    return image


def save(image, name, mode="RGBA"):
    path = os.path.join(ASSETS, name)
    image.convert(mode).save(path, optimize=True)
    print("wrote", os.path.relpath(path, os.path.join(HERE, "..", "..")), image.size)


def main():
    icon = draw(1024).filter(ImageFilter.GaussianBlur(0.6))
    save(icon, "icon.png", "RGB")  # iOS icons must not be transparent
    save(icon.resize((48, 48), Image.LANCZOS), "favicon.png")

    # Android adaptive icon: the scene behind, the light in front (inside
    # the safe circle, which the 512 px layers keep by drawing at 432 px).
    background = draw(512, glow=False)
    save(background, "android-icon-background.png")
    foreground = Image.new("RGBA", (512, 512))
    foreground.paste(draw(432, scene=False, alpha_glow=True), (40, 40))
    save(foreground, "android-icon-foreground.png")

    # Monochrome (Android themed icons): the light's disc and its reflection.
    light_layer = draw(432, scene=False, alpha_glow=True)
    white = Image.new("RGBA", (432, 432), (255, 255, 255, 255))
    white.putalpha(light_layer.getchannel("A"))
    save(white, "android-icon-monochrome.png")

    # Splash: the light alone, on the night colour set in app.json.
    save(draw(1024, scene=False, alpha_glow=True), "splash-icon.png")


if __name__ == "__main__":
    main()
