"""Scenario files: YAML, versioned with the code."""
import os

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCENARIO_DIR = os.path.join(ROOT, "scenarios")

DEFAULTS = {
    "seed": 42,
    "duration_s": 7200,
    "world": {"size_m": 3000, "grid": 64, "terrain": "river_valley"},
    "nodes": [],
    "mobile": [],
    "water": {"level_m": [[0, 0.0]]},
    "quake": {"collapses": [], "random_per_hour": 0},
    "sos": {"rate_per_hour": 40, "classes": {"P0": 0.5, "P1": 0.2, "P2": 0.2, "P3": 0.1}},
}


def load_scenario(name_or_path: str) -> dict:
    path = name_or_path
    if not os.path.exists(path):
        path = os.path.join(SCENARIO_DIR, f"{name_or_path}.yaml")
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    out = {**DEFAULTS, **data}
    out["world"] = {**DEFAULTS["world"], **data.get("world", {})}
    out["quake"] = {**DEFAULTS["quake"], **data.get("quake", {})}
    out["sos"] = {**DEFAULTS["sos"], **data.get("sos", {})}
    out.setdefault("name", os.path.splitext(os.path.basename(path))[0])
    return out


def list_scenarios() -> list:
    return sorted(f[:-5] for f in os.listdir(SCENARIO_DIR) if f.endswith(".yaml"))
