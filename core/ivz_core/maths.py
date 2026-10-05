"""Survival maths and LoRa time on air."""
import math
from functools import reduce


def delivery_prob(mu: float, lam: float, T: float) -> float:
    """P(a holder reaches a gateway before it dies, within horizon T).

    Delivery and death are competing exponential clocks with rates mu and lam:
    P = mu/(mu+lam) * (1 - exp(-(mu+lam)*T)).
    """
    total = mu + lam
    if total <= 0 or mu <= 0:
        return 0.0
    return mu / total * (1.0 - math.exp(-total * T))


def survival(ps) -> float:
    """P(at least one holder delivers) = 1 - prod(1 - p)."""
    return 1.0 - reduce(lambda acc, p: acc * (1.0 - p), ps, 1.0)


def gain(S: float, p_j: float) -> float:
    """Increase in survival from adding holder j."""
    return (1.0 - S) * p_j


def holder_prob(h, T: float, ttl_s: float) -> float:
    """Delivery probability of a remote holder, discounted by how long ago we heard from it."""
    if h.is_gateway:
        return 1.0
    return delivery_prob(h.mu, h.lam, T) * math.exp(-h.age_s / ttl_s)


def time_on_air(payload_bytes: int, sf: int = 9, bw_hz: float = 125_000.0, cr: int = 1,
                preamble: int = 8, explicit_header: bool = True, crc: bool = True) -> float:
    """Semtech SX127x time-on-air formula, seconds."""
    t_sym = (2 ** sf) / bw_hz
    t_pre = (preamble + 4.25) * t_sym
    de = 1 if t_sym > 0.016 else 0                  # low data-rate optimisation
    ih = 0 if explicit_header else 1
    num = 8 * payload_bytes - 4 * sf + 28 + 16 * int(crc) - 20 * ih
    n_payload = 8 + max(math.ceil(num / (4 * (sf - 2 * de))) * (cr + 4), 0)
    return t_pre + n_payload * t_sym
