"""Terrain, flood and earthquake models. Deliberately simple and explainable."""
import math

import numpy as np


class World:
    def __init__(self, cfg: dict, water: dict, rng: np.random.Generator):
        self.size = float(cfg["size_m"])
        self.n = int(cfg["grid"])
        self.kind = cfg.get("terrain", "river_valley")
        self.river_x = float(cfg.get("river_x", 0.4)) * self.size
        self.elev = self._terrain(rng, cfg)
        self.curve = sorted((float(t), float(l)) for t, l in water["level_m"])
        self.level = 0.0
        self.rev = 0

    # ---------- terrain ----------
    def river_centre(self, y):
        return self.river_x + 0.06 * self.size * math.sin(2 * math.pi * y / self.size)

    def _terrain(self, rng, cfg):
        n, s = self.n, self.size
        ys, xs = np.mgrid[0:n, 0:n] * (s / (n - 1))
        # Smooth value noise from a few random sine waves (deterministic per seed).
        noise = np.zeros((n, n))
        for _ in range(6):
            fx, fy = rng.uniform(0.5, 3.0, 2) * 2 * math.pi / s
            ph = rng.uniform(0, 2 * math.pi, 2)
            noise += np.sin(xs * fx + ph[0]) * np.cos(ys * fy + ph[1])
        noise *= 0.35
        if self.kind == "flat_city":
            elev = 2.0 + noise * 0.6 + 0.0004 * xs
        else:
            centre = self.river_x + 0.06 * s * np.sin(2 * np.pi * ys / s)
            dist = np.abs(xs - centre)
            elev = np.where(dist < 60, -1.5 + dist / 60, (np.maximum(dist - 60, 0) / 380) ** 1.35 * 2.2) + noise
        for hill in cfg.get("hills", []):
            hx, hy, hh, hr = hill
            elev += hh * np.exp(-((xs - hx) ** 2 + (ys - hy) ** 2) / (2 * hr ** 2))
        return elev.astype(np.float32)

    def ground(self, x, y):
        """Bilinear ground elevation at a point (metres)."""
        n, s = self.n, self.size
        gx = min(max(x / s * (n - 1), 0), n - 1.0001)
        gy = min(max(y / s * (n - 1), 0), n - 1.0001)
        i, j = int(gy), int(gx)
        fy, fx = gy - i, gx - j
        e = self.elev
        return float((e[i, j] * (1 - fx) + e[i, j + 1] * fx) * (1 - fy)
                     + (e[i + 1, j] * (1 - fx) + e[i + 1, j + 1] * fx) * fy)

    # ---------- flood ----------
    def water_level_at(self, t):
        c = self.curve
        if t <= c[0][0]:
            return c[0][1]
        for (t0, l0), (t1, l1) in zip(c, c[1:]):
            if t <= t1:
                return l0 + (l1 - l0) * (t - t0) / max(t1 - t0, 1e-9)
        return c[-1][1]

    def update(self, t):
        lvl = self.water_level_at(t)
        changed = round(lvl, 2) != round(self.level, 2)
        self.level = lvl
        if changed:
            self.rev += 1
        return changed

    def depth(self, x, y):
        """Water depth above ground at a point (0 if dry). River bed below 0 is always wet."""
        return max(self.level - self.ground(x, y), 0.0)

    def is_water(self, x, y):
        return self.depth(x, y) > 0.05

    def terrain_payload(self):
        return {"size_m": self.size, "grid": self.n,
                "elev": [round(float(v), 2) for v in self.elev.ravel()]}
