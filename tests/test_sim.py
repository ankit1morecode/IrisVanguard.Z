import hashlib
import json

import pytest

from ivz_sim import STRATEGIES, Sim, list_scenarios, load_scenario


def run_hash(strategy, ticks=600, scenario="cutoff-hamlet-boat"):
    sim = Sim(load_scenario(scenario), strategy)
    h = hashlib.sha256()
    for _ in range(ticks):
        sim.step()
        if sim.t % 10 == 0:
            h.update(json.dumps(sim.frame(), sort_keys=True).encode())
    return h.hexdigest(), sim.summary()


@pytest.mark.parametrize("strategy", ["ivz", "flooding"])
def test_determinism(strategy):
    a, sa = run_hash(strategy)
    b, sb = run_hash(strategy)
    assert a == b and sa == sb


def test_all_scenarios_load():
    names = list_scenarios()
    assert {"riverside-village-flood", "city-quake-blackout", "cutoff-hamlet-boat"} <= set(names)
    for n in names:
        sim = Sim(load_scenario(n), "ivz")
        assert sim.n > 10 and any(x.is_gateway for x in sim.nodes)


@pytest.mark.parametrize("strategy", sorted(STRATEGIES))
def test_airtime_never_exceeds_legal_allowance(strategy):
    sim = Sim(load_scenario("city-quake-blackout"), strategy)
    allow = sim.cfg.airtime_allowance_s
    for _ in range(900):
        sim.step()
        assert max(n.airtime_used for n in sim.nodes) <= allow + 1e-6


def test_sink_inject_triggers_evacuation():
    sim = Sim(load_scenario("riverside-village-flood"), "ivz")
    for _ in range(200):
        sim.step()
    node = next(n for n in sim.nodes if n.kind == "household" and n.mount == "indoor" and n.alive)
    sim.inject({"action": "sink", "node": node.idx})
    seen = []
    for _ in range(200):
        sim.step()
        seen += [e for e in sim.events if e["t"] == "node.evacuate" and e["node"] == node.idx]
        sim.events = []
    assert seen and seen[0]["on"] and "submersion" in seen[0]["causes"]


def test_ivz_uses_less_airtime_than_flooding():
    out = {}
    for st in ("ivz", "flooding"):
        sim = Sim(load_scenario("city-quake-blackout"), st)
        for _ in range(1800):
            sim.step()
        out[st] = sim.summary()
    assert out["ivz"]["relay_airtime_s"] < out["flooding"]["relay_airtime_s"] / 3
    assert out["ivz"]["delivered"] >= out["flooding"]["delivered"]
