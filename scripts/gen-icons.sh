#!/usr/bin/env sh
# One-off: render the PWA icons from public/icon*.svg. Needs Inkscape 1.x.
# The PNGs are committed; rerun only when the SVGs change.
set -e
cd "$(dirname "$0")/../public"
r() { inkscape "$1" --export-type=png --export-filename="$2" -w "$3" -h "$3" >/dev/null 2>&1; }
r icon.svg pwa-192x192.png 192
r icon.svg pwa-512x512.png 512
r icon-maskable.svg maskable-icon-512x512.png 512
# apple-touch-icon: iOS applies its own rounding, so use the full-bleed variant.
r icon-maskable.svg apple-touch-icon-180x180.png 180
