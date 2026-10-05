"""The planner: decide which message to copy to which neighbour, if any."""
from dataclasses import replace

from .config import CLASS_RANK, Config
from .gates import check_gates
from .maths import delivery_prob, gain, holder_prob, survival, time_on_air
from .types import Action, Neighbour, NodeView, PlanResult, StoredMsg, TraceEntry


def own_prob(node: NodeView, cfg: Config) -> float:
    """A box's own copy is worthless once it is evacuating."""
    if node.is_gateway:
        return 1.0
    if node.evacuating:
        return 0.0
    return delivery_prob(node.mu, node.lam, cfg.horizon_s)


def neighbour_prob(nb: Neighbour, cfg: Config) -> float:
    if nb.is_gateway:
        return 1.0
    return delivery_prob(nb.mu, nb.lam, cfg.horizon_s)


def message_survival(node: NodeView, msg: StoredMsg, nbs: dict, cfg: Config) -> float:
    ps = [own_prob(node, cfg)]
    for hid, h in msg.holders.items():
        nb = nbs.get(hid)
        ps.append(neighbour_prob(nb, cfg) if nb else holder_prob(h, cfg.horizon_s, cfg.holder_ttl_s))
    return survival(ps)


def plan(node: NodeView, neighbours: list, store: list, cfg: Config, max_sends: int = 1) -> PlanResult:
    """Copy messages until each one's survival meets its class target.

    Returns at most `max_sends` SEND actions (a LoRa radio is half duplex), plus a decision
    trace of every candidate considered and the gate that stopped it.
    """
    nbs = {n.id: n for n in neighbours}
    toa = time_on_air(cfg.msg_bytes, cfg.sf, cfg.bw_hz, cfg.coding_rate, cfg.preamble)
    energy = cfg.tx_power_w * toa

    scored = [(msg, message_survival(node, msg, nbs, cfg)) for msg in store]
    scored.sort(key=lambda ms: (CLASS_RANK.get(ms[0].cls, 9), ms[1]))

    actions, trace = [], []
    survival_by_key = {m.key: s for m, s in scored}
    airtime = node.airtime_used_s

    for msg, S in scored:
        if len(actions) >= max_sends:
            break
        if S >= cfg.targets.get(msg.cls, 0.9):
            continue                                  # target met: no flooding
        best = None
        for nb in neighbours:
            if nb.id in msg.holders:
                continue
            p_j = neighbour_prob(nb, cfg)
            g = gain(S, p_j)
            if g < cfg.min_gain:
                continue
            view = replace(node, airtime_used_s=airtime)
            gr = check_gates(view, nb, toa, cfg, own_msg=msg.own)
            density = g / toa
            trace.append(TraceEntry(msg.key, nb.id, round(density, 4), round(g, 4), gr.failed))
            if gr.ok and (best is None or density > best[0]):
                best = (density, nb, g)
        if best:
            _, nb, g = best
            actions.append(Action("SEND", msg.key, nb.id, toa, energy, S, S + g))
            airtime += toa

    return PlanResult(actions=actions, trace=trace, survival=survival_by_key)
