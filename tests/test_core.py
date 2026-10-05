import math

from hypothesis import given, settings
from hypothesis import strategies as st

from ivz_core import (DEFAULT, Baseline, HolderInfo, Neighbour, NodeView, Sensors, StoredMsg,
                      check_gates, delivery_prob, hazard, is_evacuating, plan, survival, time_on_air)

cfg = DEFAULT
TOA = time_on_air(cfg.msg_bytes, cfg.sf)


def calm_sensors(**kw):
    base = dict(pressure_kpa=101.325, water_pads=False, accel_g=1.0, tilt_deg=0.0,
                temp_c=30.0, battery_j=30_000.0, power_w=0.015)
    base.update(kw)
    return Sensors(**base)


def test_time_on_air_sf9():
    # 44-byte payload at SF9/125 kHz is about 288 ms (Semtech calculator).
    assert abs(TOA - 0.2877) < 0.001


def test_delivery_prob_limits():
    assert delivery_prob(0.0, 1e-3, 3600) == 0.0
    assert delivery_prob(1.0, 0.0, 3600) > 0.999
    assert 0 < delivery_prob(1e-3, 1e-3, 3600) < 0.5


def test_calm_box_long_life():
    h = hazard(calm_sensors(), Baseline(), cfg)
    assert h.tau > 24 * 3600 and h.causes == ()


def test_submerged_box_evacuates():
    h = hazard(calm_sensors(pressure_kpa=101.325 + 5.0, water_pads=True), Baseline(), cfg)
    assert "submersion" in h.causes and "water_pads" in h.causes
    assert is_evacuating(h, cfg)


def node(**kw):
    base = dict(id="A", lam=1e-5, mu=1e-4, battery_j=30_000.0, airtime_used_s=0.0)
    base.update(kw)
    return NodeView(**base)


def nb(i, **kw):
    base = dict(id=i, lam=1e-5, mu=1e-3, snr_db=5.0, pos=(100.0, 0.0))
    base.update(kw)
    return Neighbour(**base)


def test_plan_copies_until_target():
    store = [StoredMsg("A:1", "P0", own=True)]
    res = plan(node(mu=1e-3), [nb("B"), nb("C")], store, cfg)
    assert len(res.actions) == 1 and res.actions[0].to in {"B", "C"} and res.actions[0].kind == "SEND"


def test_forward_towards_better_route():
    store = [StoredMsg("A:1", "P3", own=True)]
    res = plan(node(mu=0.01), [nb("B", mu=0.001), nb("C", mu=0.05)], store, cfg)
    assert res.actions[0].kind == "FORWARD" and res.actions[0].to == "C"
    # once a closer holder is known the box stops forwarding
    store[0].holders["C"] = HolderInfo(lam=1e-5, mu=0.05)
    assert not plan(node(mu=0.01), [nb("B", mu=0.001)], store, cfg).actions


def test_evacuating_box_hands_off_even_with_safe_holders():
    holders = {"B": HolderInfo(lam=1e-5, mu=1e-3)}
    store = [StoredMsg("X:1", "P3", holders=holders)]
    calm = plan(node(mu=1e-3), [nb("B"), nb("C")], store, cfg)
    dying = plan(node(mu=1e-3, evacuating=True, lam=1 / 60), [nb("B"), nb("C")], store, cfg)
    assert calm.survival["X:1"] > dying.survival["X:1"]


def test_gateway_neighbour_preferred():
    store = [StoredMsg("A:1", "P0", own=True)]
    res = plan(node(), [nb("B"), nb("G", is_gateway=True, snr_db=0.0)], store, cfg)
    assert res.actions[0].to == "G"


def test_weak_link_blocked():
    store = [StoredMsg("A:1", "P0", own=True)]
    res = plan(node(), [nb("B", snr_db=-12.0)], store, cfg)
    assert not res.actions and "link" in res.trace[0].failed


# ---------- property tests ----------

probs = st.floats(min_value=0.0, max_value=1.0)
rates = st.floats(min_value=1e-7, max_value=1.0)


@given(st.lists(probs, max_size=10), probs)
def test_survival_never_decreases_when_holder_added(ps, p):
    assert survival(ps + [p]) >= survival(ps) - 1e-12


@settings(max_examples=300)
@given(used=st.floats(0, 40), batt=st.floats(0, 40_000), snr=st.floats(-25, 20),
       evac=st.booleans(), own=st.booleans())
def test_gates_respect_airtime_and_energy(used, batt, snr, evac, own):
    n = node(airtime_used_s=used, battery_j=batt, evacuating=evac)
    gr = check_gates(n, nb("B", snr_db=snr), TOA, cfg, own_msg=own)
    if gr.ok:
        assert used + TOA <= cfg.airtime_allowance_s + 1e-9
        if not own:
            assert used + TOA <= cfg.airtime_allowance_s - cfg.owner_airtime_s + 1e-9
        if not evac:
            assert batt - cfg.tx_power_w * TOA >= cfg.reserve_j
        assert batt - cfg.tx_power_w * TOA >= 0


@settings(max_examples=300)
@given(lam=rates, mu=rates, hl=st.lists(st.tuples(rates, rates), max_size=5),
       nbl=st.lists(st.tuples(rates, rates, st.floats(-20, 20)), max_size=6),
       cls=st.sampled_from(["P0", "P1", "P2", "P3"]), evac=st.booleans())
def test_no_copy_once_target_met(lam, mu, hl, nbl, cls, evac):
    holders = {f"H{i}": HolderInfo(lam=a, mu=b) for i, (a, b) in enumerate(hl)}
    store = [StoredMsg("M:1", cls, holders=holders)]
    neighbours = [nb(f"N{i}", lam=a, mu=b, snr_db=s) for i, (a, b, s) in enumerate(nbl)]
    res = plan(node(lam=lam, mu=mu, evacuating=evac), neighbours, store, cfg)
    S = res.survival["M:1"]
    if S >= cfg.targets[cls]:
        assert not [a for a in res.actions if a.kind == "SEND"]
    for a in res.actions:
        assert a.s_after > a.s_before and not math.isnan(a.s_after)
