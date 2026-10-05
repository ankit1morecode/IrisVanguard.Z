"""Pluggable node agents, so the same scenario runs under any forwarding strategy."""
from ivz_core import HolderInfo, Neighbour, NodeView, StoredMsg, plan

HOP_LIMIT = 3
SPRAY_L = 6


class Strategy:
    name = "base"
    label = "Base"
    evacuation = False

    def __init__(self, sim):
        self.sim = sim

    def on_created(self, node, key, t):
        pass

    def decide(self, node, t):
        return []

    def on_receive(self, node, sender, tx, t):
        node.store.setdefault(tx["key"], {"cls": self.sim.msgs[tx["key"]].cls, "own": False, "holders": {}})

    def on_ack(self, sender, receiver, tx, t):
        pass

    # helpers shared by the baselines -------------------------------------------------
    def legal_airtime_ok(self, node, toa):
        return node.airtime_used + toa <= self.sim.cfg.airtime_allowance_s and node.battery_j > toa * 0.5

    def fresh_neighbours(self, node, t):
        lim = self.sim.cfg.snr_limit_db
        return [(i, nb) for i, nb in node.nbrs.items() if nb["snr"] >= lim and self.sim.nodes[i].alive]

    def gateway_first(self, node, t):
        for i, nb in self.fresh_neighbours(node, t):
            if nb["gw"]:
                for key in node.store:
                    return [self.sim.make_tx(node, i, "copy", key)]
        return None


class IrisVanguard(Strategy):
    name = "ivz"
    label = "IrisVanguard.Z"
    evacuation = True

    def on_created(self, node, key, t):
        node.next_plan_t = t

    def neighbour_views(self, node, t):
        out = []
        for i, nb in node.nbrs.items():
            age = t - nb["t"]
            px, py = nb["pos"][0] + nb["vel"][0] * age, nb["pos"][1] + nb["vel"][1] * age
            out.append(Neighbour(id=str(i), lam=nb["lam"], mu=nb["mu"], snr_db=nb["snr"],
                                 pos=(px, py), vel=nb["vel"], is_gateway=nb["gw"]))
        return out

    def decide(self, node, t):
        if node.is_gateway or not node.store or not node.nbrs or t < node.next_plan_t:
            return []
        view = NodeView(id=str(node.idx), lam=node.lam, mu=node.mu, battery_j=node.battery_j,
                        airtime_used_s=node.airtime_used,
                        evacuating=node.evacuating and self.evacuation,
                        pos=(node.x, node.y), vel=node.vel)
        store = []
        for key, e in node.store.items():
            holders = {str(h): HolderInfo(lam=v[0], mu=v[1], age_s=t - v[2], is_gateway=v[3])
                       for h, v in e["holders"].items()}
            store.append(StoredMsg(key=key, cls=e["cls"], own=e["own"], holders=holders))
        res = plan(view, self.neighbour_views(node, t), store, self.sim.cfg)
        node.last_trace = res.trace
        node.local_S = res.survival
        if not res.actions:
            node.next_plan_t = t + (1 if node.evacuating else 5)
            return []
        a = res.actions[0]
        tx = self.sim.make_tx(node, int(a.to), "copy", a.key)
        tx["S"] = [round(a.s_before, 3), round(a.s_after, 3)]
        tx["mode"] = a.kind.lower()
        return [tx]

    def on_receive(self, node, sender, tx, t):
        key = tx["key"]
        src = sender.store.get(key, {"holders": {}, "cls": self.sim.msgs[key].cls})
        e = node.store.setdefault(key, {"cls": src["cls"], "own": False, "holders": {}})
        for h, v in src["holders"].items():
            if h != node.idx:
                e["holders"].setdefault(h, list(v))
        e["holders"][sender.idx] = [sender.lam, sender.mu, t, sender.is_gateway]
        node.next_plan_t = t

    def on_ack(self, sender, receiver, tx, t):
        e = sender.store.get(tx["key"])
        if e is not None:
            e["holders"][receiver.idx] = [receiver.lam, receiver.mu, t, receiver.is_gateway]
        sender.next_plan_t = t


class IrisVanguardNoEvac(IrisVanguard):
    name = "ivz_noevac"
    label = "IVZ without evacuation"
    evacuation = False


class ManagedFlooding(Strategy):
    """Rebroadcast every new message once, up to a hop limit (like common LoRa meshes)."""
    name = "flooding"
    label = "Managed flooding"

    def on_created(self, node, key, t):
        node.pending.append((t, key, 0))

    def decide(self, node, t):
        due = [p for p in node.pending if p[0] <= t]
        if not due:
            return []
        p = due[0]
        node.pending.remove(p)
        tx = self.sim.make_tx(node, None, "bcast", p[1])
        if not self.legal_airtime_ok(node, tx["toa"]):
            return []
        tx["hop"] = p[2]
        return [tx]

    def on_receive(self, node, sender, tx, t):
        if tx["key"] in node.store:
            return
        super().on_receive(node, sender, tx, t)
        if tx["hop"] + 1 < HOP_LIMIT and not node.is_gateway:
            node.pending.append((t + int(self.sim.rng_agent.integers(1, 6)), tx["key"], tx["hop"] + 1))


class Epidemic(Strategy):
    """Classic DTN epidemic routing: give every neighbour every message it lacks."""
    name = "epidemic"
    label = "Epidemic"

    def decide(self, node, t):
        if node.is_gateway or not node.store:
            return []
        tx = self.gateway_first(node, t)
        if tx is None:
            tx = []
            for i, nb in self.fresh_neighbours(node, t):
                other = self.sim.nodes[i]
                if other.is_gateway:
                    continue
                missing = [k for k in node.store if k not in other.store and k not in other.confirmed]
                if missing:
                    tx = [self.sim.make_tx(node, i, "copy", missing[0])]
                    break
        if tx and not self.legal_airtime_ok(node, tx[0]["toa"]):
            return []
        return tx


class SprayAndWait(Strategy):
    """Binary spray-and-wait with L copies, then wait for direct delivery."""
    name = "spray"
    label = "Spray-and-Wait (L=6)"

    def on_created(self, node, key, t):
        node.store[key]["tokens"] = SPRAY_L

    def decide(self, node, t):
        if node.is_gateway or not node.store:
            return []
        tx = self.gateway_first(node, t)
        if tx is None:
            tx = []
            for key, e in node.store.items():
                if e.get("tokens", 1) <= 1:
                    continue
                for i, nb in self.fresh_neighbours(node, t):
                    other = self.sim.nodes[i]
                    if not other.is_gateway and key not in other.store:
                        tx = [self.sim.make_tx(node, i, "copy", key)]
                        break
                if tx:
                    break
        if tx and not self.legal_airtime_ok(node, tx[0]["toa"]):
            return []
        return tx

    def on_receive(self, node, sender, tx, t):
        super().on_receive(node, sender, tx, t)
        e = sender.store.get(tx["key"], {})
        node.store[tx["key"]]["tokens"] = max(e.get("tokens", 1) // 2, 1)

    def on_ack(self, sender, receiver, tx, t):
        e = sender.store.get(tx["key"])
        if e:
            e["tokens"] = e.get("tokens", 1) - max(e.get("tokens", 1) // 2, 1)


STRATEGIES = {s.name: s for s in [IrisVanguard, IrisVanguardNoEvac, ManagedFlooding, Epidemic, SprayAndWait]}


def make_strategy(name, sim):
    return STRATEGIES[name](sim)
