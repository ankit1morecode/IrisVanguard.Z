"""Turn raw sensor readings into a failure rate (lam) and expected time left (tau)."""
from .config import Config
from .types import Baseline, Hazard, Sensors

KPA_PER_M = 9.81


def hazard(s: Sensors, baseline: Baseline, cfg: Config) -> Hazard:
    lam = cfg.base_lam
    causes = []

    dp = s.pressure_kpa - baseline.pressure_kpa
    if dp > cfg.submersion_kpa:
        depth_m = dp / KPA_PER_M
        lam += (1.0 + 10.0 * depth_m) / 400.0
        causes.append("submersion")

    if s.water_pads:
        lam += 1.0 / 90.0
        causes.append("water_pads")

    if s.accel_g > cfg.shock_g:
        lam += min(s.accel_g / cfg.shock_g, 4.0) / 400.0
        causes.append("shock")
    if s.tilt_deg > cfg.tilt_deg:
        lam += 1.0 / 900.0
        causes.append("tilt")

    if s.temp_c > cfg.heat_c:
        lam += (s.temp_c - cfg.heat_c) / (15.0 * 300.0)
        causes.append("heat")

    if s.power_w > 0 and s.battery_j > 0:
        lam_batt = s.power_w / s.battery_j
        lam += lam_batt
        if 1.0 / lam_batt < 6 * 3600:
            causes.append("battery")
    elif s.battery_j <= 0:
        lam += 1.0
        causes.append("battery")

    return Hazard(lam=lam, tau=1.0 / lam, causes=tuple(causes))


def is_evacuating(h: Hazard, cfg: Config) -> bool:
    return h.tau < cfg.evac_tau_s
