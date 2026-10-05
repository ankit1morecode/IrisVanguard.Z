"""Hard safety rules every transmission must pass."""
import math

from .config import Config
from .types import GateResult, Neighbour, NodeView


def contact_window_s(node: NodeView, cand: Neighbour, cfg: Config) -> float:
    """Seconds until the candidate drifts out of range, from both boxes' GPS position and velocity.

    Range is extrapolated from the current SNR with a log-distance model.
    """
    dx, dy = cand.pos[0] - node.pos[0], cand.pos[1] - node.pos[1]
    d = math.hypot(dx, dy)
    spare_db = cand.snr_db - cfg.snr_limit_db - cfg.link_margin_db
    if spare_db < 0:
        return 0.0
    d_max = max(d, 1.0) * 10 ** (spare_db / (10 * cfg.path_loss_exp))
    vx, vy = cand.vel[0] - node.vel[0], cand.vel[1] - node.vel[1]
    a = vx * vx + vy * vy
    if a < 1e-9:
        return math.inf
    b = 2 * (dx * vx + dy * vy)
    c = d * d - d_max * d_max
    disc = b * b - 4 * a * c
    if disc < 0:
        return 0.0
    return max((-b + math.sqrt(disc)) / (2 * a), 0.0)


def check_gates(node: NodeView, cand: Neighbour, toa_s: float, cfg: Config, own_msg: bool = False) -> GateResult:
    failed = []
    energy_j = cfg.tx_power_w * toa_s

    # 1. Energy: keep the owner's 72 h SOS reserve, unless the box is dying anyway.
    if not node.evacuating and node.battery_j - energy_j < cfg.reserve_j:
        failed.append("energy")
    if node.battery_j - energy_j < 0:
        if "energy" not in failed:
            failed.append("energy")

    # 2. Airtime: never exceed the legal allowance; relaying may not touch the owner's slice.
    limit = cfg.airtime_allowance_s - (0.0 if own_msg else cfg.owner_airtime_s)
    if node.airtime_used_s + toa_s > limit:
        failed.append("airtime")

    # 3. Link: the copy must actually get through.
    if cand.snr_db < cfg.snr_limit_db + cfg.link_margin_db:
        failed.append("link")

    # 4. Contact: the neighbour must stay in range long enough to receive it.
    if contact_window_s(node, cand, cfg) < cfg.min_contact_factor * toa_s:
        failed.append("contact")

    return GateResult(ok=not failed, failed=tuple(failed))
