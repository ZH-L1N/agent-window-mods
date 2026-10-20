"""Writes the peers mod's two clips to assets/ (standard library only).

  blocked.wav  0.4 s: two low beeps (330 Hz), for a peer that is blocked.
  done.wav     0.6 s: a rising three-note chime (C5, E5, G5), for ALL DONE.

Mono, 16-bit, 22050 Hz. Each note has a short attack and a decay so it does
not click. Run from anywhere: python3 -I tools/make-sounds.py
"""

import math
import struct
import wave
from pathlib import Path

RATE = 22050
ASSETS = Path(__file__).resolve().parent.parent / "assets"


def tone(freq: float, seconds: float, volume: float, harmonics: float = 0.0) -> list[float]:
    n = int(RATE * seconds)
    attack = int(RATE * 0.008)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1.0, i / attack) if attack else 1.0
        env *= math.exp(-3.0 * t / seconds)
        s = math.sin(2 * math.pi * freq * t)
        if harmonics:
            s += harmonics * math.sin(2 * math.pi * 2 * freq * t)
        out.append(volume * env * s / (1.0 + harmonics))
    return out


def silence(seconds: float) -> list[float]:
    return [0.0] * int(RATE * seconds)


def write(name: str, samples: list[float]) -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    path = ASSETS / name
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))
    print(f"{path} {len(samples) / RATE:.2f} s")


# Two low beeps: 0.14 s on, 0.08 s gap, 0.14 s on, 0.04 s tail = 0.40 s.
write("blocked.wav", tone(330, 0.14, 0.6, 0.3) + silence(0.08) + tone(330, 0.14, 0.6, 0.3) + silence(0.04))

# Rising chime: three 0.2 s notes, C5 E5 G5 = 0.60 s.
write("done.wav", tone(523.25, 0.2, 0.5, 0.15) + tone(659.25, 0.2, 0.5, 0.15) + tone(783.99, 0.2, 0.5, 0.15))
