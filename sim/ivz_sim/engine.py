"""ivz_sim: a deterministic, fixed-step digital twin. One tick = one simulated second."""
import math
from collections import deque

import numpy as np

from ivz_core import DEFAULT, Baseline, Sensors, delivery_prob, hazard, time_on_air

from .radio import Radio, resolve
from .strategies import make_strategy
from .world import World

KIND_CODE = {"household": 0, "relay": 1, "gateway": 2, "boat": 3}
CAUSE_BITS = {"submersion": 1, "water_pads": 2, "shock": 4, "tilt": 8, "heat": 16, "battery": 32}
NEEDS = ["rescue", "medical", "water", "food", "shelter"]
GW_MU = 1 / 20.0
MULE_MU = 1 / 2400.0
MU_PRIOR = 1 / 2400.0      # prior rescue-contact rate: a boat or relay link expected within ~40 min
MU_MEMORY_S = 1800.0       # a remembered route decays with this time constant
ROUTE_EVERY = 5            # ticks between route-rate updates
HOP_DISCOUNT = 0.5
BEACON_S = 60
NB_EXPIRY_S = 200
CONFIRM_TTL_S = 900
LINKS_PER_NODE = 6
LINKS_EVERY_S = 30


class Node:
    def __init__(self, idx, kind, mount, x, y, height_m, solar, battery_j):
        self.idx, self.kind, self.mount = idx, kind, mount
        self.id = {"household": "H", "relay": "R", "gateway": "G", "boat": "B"}[kind] + f"{idx:03d}"
        self.x, self.y, self.vel = x, y, (0.0, 0.0)
        self.height_m, self.solar = height_m, solar
        self.is_gateway = kind == "gateway"
        self.alive, self.death_cause, self.death_tick = True, None, None
        self.battery_j = battery_j
        self.air_log, self.airtime_used = deque(), 0.0
        self.tx_log, self.tx_energy = deque(), 0.0  # (t, energy) for the power estimate
        self.ground = 0.0
        self.baseline = Baseline()
        self.water_over = 0.0
        self.forced_sink = None                     # tick a presenter sank this box
        self.leak_at = self.death_at = None
        self.shock_g, self.tilt, self.temp, self.heat_rate = 0.0, 0.0, 30.0, 0.0
        self.burial_db = 0.0
        self.lam, self.tau, self.causes = DEFAULT.base_lam, 1 / DEFAULT.base_lam, ()
        self.evacuating, self.evac_clear_since = False, None
        self.mu = GW_MU if self.is_gateway else MU_PRIOR
        self.nbrs = {}
        self.store = {}
        self.confirmed = {}
        self.pending = []
        self.next_beacon_t = 0
        self.next_plan_t = 0
        self.last_trace, self.local_S = [], {}
        self.route, self.route_i, self.route_dir, self.speed, self.depart = None, 0, 1, 0.0, 0
        self.sensors = None

    @property
    def antenna_h(self):
        return {"indoor": self.height_m + 0.3, "floating": 0.5, "boat": 2.0}.get(self.mount, self.height_m)


class Msg:
    def __init__(self, key, origin, cls, tick, x, y, persons, needs):
        self.key, self.origin, self.cls, self.created_tick = key, origin, cls, tick
        self.x, self.y, self.persons, self.needs = x, y, persons, needs
        self.holders = {origin}
        self.delivered_tick = self.lost_tick = None
        self.copies = 0
        self.resolved_at = None


class Sim:
    def __init__(self, scenario, strategy="ivz", seed=None, cfg=DEFAULT, run_id="local"):
        self.sc, self.cfg, self.run_id = scenario, cfg, run_id
        self.seed = int(scenario.get("seed", 42) if seed is None else seed)
        self.rng_world = np.random.default_rng(self.seed)
        self.rng_radio = np.random.default_rng(self.seed + 1)
        self.rng_agent = np.random.default_rng(self.seed + 2)
        self.duration = int(scenario["duration_s"])
        self.world = World(scenario["world"], scenario["water"], self.rng_world)
        self.nodes = []
        self._place_nodes()
        self.n = len(self.nodes)
        self.radio = Radio(self.n, self.rng_radio)
        self.strategy = make_strategy(strategy, self)
        self.msgs = {}
        self.events = []
        self.t = 0
        self.focus = None
        self._links_t = -1
        self.sos_seq = {}
        self.metrics = dict(created=0, delivered=0, lost=0, copies=0, failed=0, airtime_s=0.0,
                            relay_airtime_s=0.0, energy_j=0.0, beacons=0, dead=0, evacuations=0)
        self.collapses = sorted(scenario["quake"].get("collapses", []), key=lambda c: c["t"])
        self.beacon_toa = time_on_air(20, cfg.sf)
        self.msg_toa = time_on_air(cfg.msg_bytes, cfg.sf)
        self._mu_decay = math.exp(-ROUTE_EVERY / MU_MEMORY_S)
        for n in self.nodes:
            n.ground = self.world.ground(n.x, n.y)
        self.world.update(0)
        self._update_sensors()

    # ------------------------------------------------------------------ setup
    def _rand_point(self, area, max_ground=None, min_ground=-0.2):
        x0, y0, x1, y1 = area
        for _ in range(200):
            x, y = self.rng_world.uniform(x0, x1), self.rng_world.uniform(y0, y1)
            g = self.world.ground(x, y)
            if g >= min_ground and (max_ground is None or g <= max_ground):
                return x, y
        return x, y

    def _add(self, kind, mount, x, y, height_m=1.0, solar=False):
        frac = 1.0 if kind in ("gateway", "boat") else self.rng_world.uniform(0.35, 1.0)
        node = Node(len(self.nodes), kind, mount, float(x), float(y), float(height_m), bool(solar),
                    DEFAULT.battery_capacity_j * frac)
        node.next_beacon_t = int(self.rng_world.integers(0, BEACON_S))
        self.nodes.append(node)
        return node

    def _place_nodes(self):
        size = self.world.size
        for spec in self.sc["nodes"]:
            kind = spec["kind"]
            if kind == "gateway":
                self._add("gateway", "tower", *spec["at"], spec.get("height_m", 15))
                continue
            area = spec.get("area", [0, 0, size, size])
            for _ in range(int(spec.get("count", 1))):
                x, y = self._rand_point(area, spec.get("max_ground"), spec.get("min_ground", -0.2))
                mount = spec.get("mount", "indoor")
                if mount == "mixed":
                    mount = "floating" if self.rng_world.random() < spec.get("floating_frac", 0.3) else "indoor"
                h = spec.get("height_m", 1.0 if mount == "indoor" else 0.5)
                self._add(kind, mount, x, y, h, spec.get("solar", False))
        for spec in self.sc.get("mobile", []):
            route = [tuple(map(float, p)) for p in spec["route"]]
            b = self._add("boat", "boat", *route[0], 2.0)
            b.route, b.speed, b.depart = route, float(spec.get("speed_mps", 2.0)), int(spec.get("depart_s", 0))

    # ------------------------------------------------------------------ events
    def emit(self, etype, **payload):
        payload["t"] = etype
        payload["tick"] = self.t
        self.events.append(payload)

    # ------------------------------------------------------------------ main loop
    def step(self):
        self.t += 1
        t = self.t
        if self.world.update(t):
            if self.world.rev % 5 == 0:
                self.emit("world.water", level_m=round(self.world.level, 3), rev=self.world.rev)
        self._move()
        self._world_events(t)
        self._update_sensors()
        self._update_hazards()
        self._deaths(t)
        self._energy()
        self._sos(t)
        txs = self._beacons(t)
        busy = {tx["src"] for tx in txs}
        for node in self.nodes:
            if node.alive and node.idx not in busy:
                txs.extend(self.strategy.decide(node, t))
        self._transmit(txs, t)
        self._routing(t)

    # ------------------------------------------------------------------ world
    def _move(self):
        for b in self.nodes:
            if b.route is None or not b.alive or self.t < b.depart:
                b.vel = (0.0, 0.0) if b.route is not None else b.vel
                continue
            nxt = b.route_i + b.route_dir
            if not 0 <= nxt < len(b.route):
                b.route_dir *= -1
                nxt = b.route_i + b.route_dir
            tx, ty = b.route[nxt]
            dx, dy = tx - b.x, ty - b.y
            d = math.hypot(dx, dy)
            if d <= b.speed:
                b.x, b.y, b.route_i = tx, ty, nxt
            else:
                b.x += dx / d * b.speed
                b.y += dy / d * b.speed
            b.vel = (dx / max(d, 1e-9) * b.speed, dy / max(d, 1e-9) * b.speed)
            b.ground = self.world.ground(b.x, b.y)

    def _world_events(self, t):
        while self.collapses and self.collapses[0]["t"] <= t:
            c = self.collapses.pop(0)
            self.collapse(c["at"][0], c["at"][1], c.get("radius", 120))
        rate = self.sc["quake"].get("random_per_hour", 0)
        if rate and self.rng_world.random() < rate / 3600:
            alive = [n for n in self.nodes if n.alive and n.kind == "household"]
            if alive:
                n = alive[int(self.rng_world.integers(len(alive)))]
                self.collapse(n.x, n.y, 100)

    def collapse(self, x, y, radius):
        affected = []
        for n in self.nodes:
            if not n.alive or n.kind in ("boat", "gateway") or math.hypot(n.x - x, n.y - y) > radius:
                continue
            r = self.rng_world
            n.shock_g = max(n.shock_g, r.uniform(6, 12))
            if r.random() < 0.6:
                n.tilt = r.uniform(30, 90)
            if r.random() < 0.7:
                n.burial_db = r.uniform(20, 40)
            if r.random() < 0.55:
                n.death_at = self.t + int(r.uniform(60, 900))
            if r.random() < 0.15:
                n.heat_rate = r.uniform(0.04, 0.12)
            affected.append(n.idx)
        self.emit("world.collapse", at=[round(x), round(y)], radius=radius, affected=affected)

    def _update_sensors(self):
        lvl = self.world.level
        r = self.rng_world
        for n in self.nodes:
            if not n.alive:
                continue
            depth = max(lvl - n.ground, 0.0)
            if n.mount == "indoor":
                n.water_over = depth - n.height_m
            elif n.mount == "rooftop":
                n.water_over = depth - n.height_m
            else:
                n.water_over = -1.0
            if n.forced_sink is not None:
                n.water_over = max(n.water_over, 0.002 * (self.t - n.forced_sink))
            if n.water_over > 0 and n.leak_at is None:
                n.leak_at = self.t + int(r.uniform(90, 600))
                n.death_at = min(n.death_at or 10 ** 9, n.leak_at + int(r.uniform(60, 240)))
            if n.mount == "floating" and depth > 1.0 and r.random() < 1 / (3 * 3600):
                n.shock_g = max(n.shock_g, r.uniform(5, 9))
                if r.random() < 0.3:
                    n.death_at = self.t + int(r.uniform(40, 200))
            n.shock_g *= 0.994
            n.temp += n.heat_rate
            p = n.baseline.pressure_kpa + 9.81 * max(n.water_over, 0.0) + r.normal(0, 0.03)
            n.sensors = Sensors(
                pressure_kpa=p,
                water_pads=n.leak_at is not None and self.t >= n.leak_at,
                accel_g=1.0 + n.shock_g, tilt_deg=n.tilt, temp_c=n.temp,
                battery_j=n.battery_j, power_w=self._power(n))

    def _power(self, n):
        while n.tx_log and n.tx_log[0][0] < self.t - 600:
            n.tx_energy -= n.tx_log.popleft()[1]
        return self.cfg.idle_power_w + n.tx_energy / 600 - (0.3 if n.solar else 0.0)

    def _update_hazards(self):
        for n in self.nodes:
            if not n.alive:
                continue
            if n.is_gateway or n.kind == "boat":
                n.lam, n.tau, n.causes = self.cfg.base_lam, 1 / self.cfg.base_lam, ()
                continue
            h = hazard(n.sensors, n.baseline, self.cfg)
            n.lam, n.tau, n.causes = h.lam, h.tau, h.causes
            # Hysteresis: enter below evac_tau; leave only after 120 s well clear of it.
            if not self.strategy.evacuation:
                evac = False
            elif not n.evacuating:
                evac = h.tau < self.cfg.evac_tau_s
            else:
                if h.tau < self.cfg.evac_tau_s * 3:
                    n.evac_clear_since = None
                elif n.evac_clear_since is None:
                    n.evac_clear_since = self.t
                evac = n.evac_clear_since is None or self.t - n.evac_clear_since < 120
            if evac != n.evacuating:
                n.evacuating = evac
                n.next_plan_t = self.t
                if evac:
                    self.metrics["evacuations"] += 1
                self.emit("node.evacuate", node=n.idx, on=evac, held_keys=list(n.store),
                          causes=list(h.causes), tau=round(h.tau, 1))

    def _deaths(self, t):
        for n in self.nodes:
            if not n.alive:
                continue
            cause = None
            if n.water_over > 0.35:
                cause = "submersion"
            elif n.death_at is not None and t >= n.death_at:
                cause = n.causes[0] if n.causes else "damage"
            elif n.battery_j <= 0:
                cause = "battery"
            if cause:
                self.kill(n, cause)

    def kill(self, n, cause):
        n.alive, n.death_cause, n.death_tick = False, cause, self.t
        n.evacuating = False
        self.metrics["dead"] += 1
        self.emit("node.dead", node=n.idx, cause=cause, held_keys=list(n.store))
        for key in list(n.store):
            m = self.msgs[key]
            m.holders.discard(n.idx)
            if not m.holders and m.delivered_tick is None and m.lost_tick is None:
                m.lost_tick = m.resolved_at = self.t
                self.metrics["lost"] += 1
                self.emit("msg.lost", key=key, last_holder=n.idx, cause=cause)

    def _energy(self):
        cap = self.cfg.battery_capacity_j
        for n in self.nodes:
            if not n.alive or n.is_gateway or n.kind == "boat":
                continue
            n.battery_j -= self.cfg.idle_power_w
            if n.solar:
                n.battery_j = min(n.battery_j + 0.3, cap)

    # ------------------------------------------------------------------ messages
    def _sos(self, t):
        rate = self.sc["sos"]["rate_per_hour"] / 3600
        if self.rng_world.random() < rate:
            cands = [n for n in self.nodes if n.alive and n.kind == "household"]
            if cands:
                self.create_sos(cands[int(self.rng_world.integers(len(cands)))])

    def create_sos(self, node, cls=None):
        r = self.rng_world
        if cls is None:
            classes = self.sc["sos"]["classes"]
            names = list(classes)
            probs = np.array([classes[c] for c in names], dtype=float)
            cls = names[int(r.choice(len(names), p=probs / probs.sum()))]
        seq = self.sos_seq.get(node.idx, 0) + 1
        self.sos_seq[node.idx] = seq
        key = f"{node.id}:{seq}"
        persons = int(r.integers(1, 7))
        needs = NEEDS[int(r.integers(len(NEEDS)))]
        m = Msg(key, node.idx, cls, self.t, node.x, node.y, persons, needs)
        self.msgs[key] = m
        node.store[key] = {"cls": cls, "own": True, "holders": {}}
        self.metrics["created"] += 1
        self.emit("msg.created", key=key, cls=cls, node=node.idx, at=[round(node.x), round(node.y)],
                  persons=persons, needs=needs)
        self.strategy.on_created(node, key, self.t)
        return key

    # ------------------------------------------------------------------ radio
    def make_tx(self, node, to, kind, key=None):
        toa = self.msg_toa if kind != "beacon" else self.beacon_toa
        start = float(self.rng_agent.uniform(0, max(1 - toa, 0.01)))
        return {"src": node.idx, "to": to, "kind": kind, "key": key, "toa": toa, "start": start}

    def _beacons(self, t):
        txs = []
        for n in self.nodes:
            if not n.alive or t < n.next_beacon_t:
                continue
            n.next_beacon_t = t + (30 if n.is_gateway else BEACON_S) + int(self.rng_agent.integers(-5, 6))
            confirms = [k for k, ct in n.confirmed.items() if t - ct < CONFIRM_TTL_S][-8:]
            digest = list(n.store)[:32]           # compact summary of held keys (reconciliation)
            toa = time_on_air(20 + 2 * len(confirms) + (len(digest) + 3) // 4, self.cfg.sf)
            if n.airtime_used + toa > self.cfg.airtime_allowance_s:
                continue
            tx = self.make_tx(n, None, "beacon")
            tx["toa"] = toa
            tx["confirms"] = confirms
            tx["digest"] = digest
            txs.append(tx)
        return txs

    def _account(self, n, toa):
        e = self.cfg.tx_power_w * toa
        if not (n.is_gateway or n.kind == "boat"):
            n.battery_j -= e
        n.air_log.append((self.t, toa))
        n.airtime_used += toa
        n.tx_log.append((self.t, e))
        n.tx_energy += e
        self.metrics["airtime_s"] += toa
        self.metrics["energy_j"] += e

    def _prune_airtime(self, n):
        while n.air_log and n.air_log[0][0] <= self.t - self.cfg.window_s:
            n.airtime_used -= n.air_log.popleft()[1]

    def _transmit(self, txs, t):
        for n in self.nodes:
            self._prune_airtime(n)
        if not txs:
            return
        x = np.array([n.x for n in self.nodes])
        y = np.array([n.y for n in self.nodes])
        h = np.array([n.antenna_h for n in self.nodes])
        wet = np.array([self.world.is_water(n.x, n.y) or n.mount in ("floating", "boat") for n in self.nodes])
        extra = np.array([n.burial_db + (25.0 if n.water_over > 0.2 else 0.0) for n in self.nodes])
        alive = np.array([n.alive for n in self.nodes])
        snr = self.radio.update(x, y, h, wet, extra)
        for tx in txs:
            self._account(self.nodes[tx["src"]], tx["toa"])
            if tx["kind"] == "beacon":
                self.metrics["beacons"] += 1
            else:
                self.metrics["relay_airtime_s"] += tx["toa"]
        for k, r, q, ok, coll in resolve(txs, snr, alive, self.cfg.snr_limit_db):
            tx = txs[k]
            sender, recv = self.nodes[tx["src"]], self.nodes[r]
            if tx["kind"] == "beacon":
                self._hear_beacon(recv, sender, q, tx, t)
                continue
            if tx["to"] is not None:
                self.emit("link.frame", **{"from": sender.idx, "to": r, "snr": round(q, 1), "ok": ok,
                                           "collision": coll, "key": tx["key"]})
            if not ok:
                self.metrics["failed"] += 1
                continue
            self._receive_copy(sender, recv, tx, t)

    def _hear_beacon(self, recv, sender, snr, tx, t):
        recv.nbrs[sender.idx] = {"lam": sender.lam, "mu": sender.mu, "snr": snr, "pos": (sender.x, sender.y),
                                 "vel": sender.vel, "gw": sender.is_gateway, "t": t}
        learned = []
        for key in tx.get("digest", []):
            e = recv.store.get(key)
            if e is not None and sender.idx not in e["holders"]:
                e["holders"][sender.idx] = [sender.lam, sender.mu, t, sender.is_gateway]
                learned.append(key)
            elif e is not None:
                e["holders"][sender.idx] = [sender.lam, sender.mu, t, sender.is_gateway]
        if learned and (sender.kind == "boat" or recv.kind == "boat"):
            self.emit("reconcile", a=sender.idx, b=recv.idx, keys=learned[:8])
        for key in tx.get("confirms", []):
            if key in recv.confirmed:
                continue
            recv.confirmed[key] = t
            if key in recv.store:
                del recv.store[key]
                m = self.msgs[key]
                m.holders.discard(recv.idx)
                self.emit("msg.confirm", key=key, node=recv.idx, via=sender.idx)

    def _receive_copy(self, sender, recv, tx, t):
        key = tx["key"]
        m = self.msgs[key]
        if recv.is_gateway:
            if m.delivered_tick is None:
                m.delivered_tick = m.resolved_at = t
                self.metrics["delivered"] += 1
                recv.confirmed[key] = t
                self.emit("msg.delivered", key=key, gateway=recv.idx, via=sender.idx,
                          latency_s=t - m.created_tick)
            # The gateway's acknowledgement doubles as a confirmation for the sender.
            sender.confirmed[key] = t
            sender.store.pop(key, None)
            m.holders.discard(sender.idx)
            return
        if key in recv.confirmed:
            return
        is_new = key not in recv.store
        self.strategy.on_receive(recv, sender, tx, t)
        if key in recv.store:
            m.holders.add(recv.idx)
        if is_new:
            m.copies += 1
            self.metrics["copies"] += 1
            ev = {"key": key, "from": sender.idx, "to": recv.idx, "kind": tx["kind"],
                  "evac": sender.evacuating, "toa_ms": round(tx["toa"] * 1000)}
            if "S" in tx:
                ev["S"] = tx["S"]
            if "mode" in tx:
                ev["mode"] = tx["mode"]
            self.emit("msg.copy", **ev)
        if tx["to"] is not None:
            self.strategy.on_ack(sender, recv, tx, t)

    def _routing(self, t):
        if t % ROUTE_EVERY:
            return
        lim = self.cfg.snr_limit_db + self.cfg.link_margin_db
        for n in self.nodes:
            if not n.alive:
                continue
            if any(t - nb["t"] > NB_EXPIRY_S for nb in n.nbrs.values()):
                n.nbrs = {i: nb for i, nb in n.nbrs.items() if t - nb["t"] <= NB_EXPIRY_S}
            if n.is_gateway:
                continue
            best = max((nb["mu"] * HOP_DISCOUNT for nb in n.nbrs.values() if nb["snr"] >= lim), default=0.0)
            if n.kind == "boat":
                best = max(best, MULE_MU)
            n.mu = max(best, n.mu * self._mu_decay, MU_PRIOR)

    # ------------------------------------------------------------------ views
    def true_survival(self, m):
        if m.delivered_tick is not None:
            return 1.0
        if m.lost_tick is not None:
            return 0.0
        q = 1.0
        for h in m.holders:
            n = self.nodes[h]
            p = 0.0 if n.evacuating else delivery_prob(n.mu, n.lam, self.cfg.horizon_s)
            q *= 1 - p
        return 1 - q

    def net_state(self, n):
        if not n.nbrs:
            return 3
        if n.is_gateway or n.mu >= 1e-3:
            return 0
        if n.mu > 1e-5:
            return 1
        return 2

    def init_payload(self):
        return {
            "type": "init", "run": self.run_id, "scenario": self.sc["name"],
            "title": self.sc.get("title", self.sc["name"]), "strategy": self.strategy.name,
            "strategy_label": self.strategy.label, "seed": self.seed, "duration_s": self.duration,
            "terrain": self.world.terrain_payload(), "water": {"level_m": round(self.world.level, 3)},
            "cfg": {"airtime_s": self.cfg.airtime_allowance_s, "owner_airtime_s": self.cfg.owner_airtime_s,
                    "reserve_frac": self.cfg.reserve_frac, "evac_tau_s": self.cfg.evac_tau_s,
                    "targets": self.cfg.targets},
            "nodes": [{"id": n.id, "kind": n.kind, "mount": n.mount, "h": n.height_m, "solar": n.solar}
                      for n in self.nodes],
        }

    def frame(self):
        ns = self.nodes
        cap = self.cfg.battery_capacity_j
        allow = self.cfg.airtime_allowance_s
        lvl = self.world.level
        z = []
        for n in ns:
            g = n.ground
            if n.mount in ("floating", "boat"):
                z.append(round(max(g, lvl) + 0.3, 2))
            else:
                z.append(round(g + n.height_m, 2))
        state = []
        for n in ns:
            if not n.alive:
                state.append(3)
            elif n.evacuating:
                state.append(2)
            elif n.tau < 3600:
                state.append(1)
            else:
                state.append(0)
        links = None
        if self.t - self._links_t >= LINKS_EVERY_S or self._links_t < 0:
            links = self.links()
            self._links_t = self.t
        msgs = []
        for m in self.msgs.values():
            if m.resolved_at is not None and self.t - m.resolved_at > 60:
                continue
            status = 1 if m.delivered_tick is not None else 2 if m.lost_tick is not None else 0
            msgs.append([m.key, m.cls, round(self.true_survival(m), 3), status, m.origin, sorted(m.holders)])
        fr = {
            "type": "frame", "run": self.run_id, "tick": self.t,
            "nodes": {
                "x": [round(n.x, 1) for n in ns], "y": [round(n.y, 1) for n in ns], "z": z,
                "tau": [round(min(n.tau, 1e6)) for n in ns],
                "batt": [round(max(n.battery_j, 0) / cap, 3) for n in ns],
                "air": [round(n.airtime_used / allow, 3) for n in ns],
                "state": state,
                "store": [len(n.store) for n in ns],
                "causes": [sum(CAUSE_BITS.get(c, 0) for c in n.causes) for n in ns],
                "net": [self.net_state(n) if n.alive else 3 for n in ns],
            },
            "msgs": msgs,
            "events": self.events[-400:],
            "water": {"level_m": round(lvl, 3), "rev": self.world.rev},
            "metrics": {k: (round(v, 2) if isinstance(v, float) else v) for k, v in self.metrics.items()},
        }
        if links is not None:
            fr["links"] = links
        if self.focus is not None and 0 <= self.focus < self.n:
            fr["focus"] = self.focus_payload(ns[self.focus])
        self.events = []
        return fr

    def links(self):
        """Each live box's strongest neighbours as flat [a, b, margin_db, ...] (keeps frames small)."""
        lim = self.cfg.snr_limit_db
        seen = {}
        for n in self.nodes:
            if not n.alive:
                continue
            best = sorted(((nb["snr"], i) for i, nb in n.nbrs.items() if self.nodes[i].alive), reverse=True)
            for snr, i in best[:LINKS_PER_NODE]:
                key = (min(n.idx, i), max(n.idx, i))
                seen[key] = max(seen.get(key, -99.0), snr)
        out = []
        for (a, b), snr in seen.items():
            out += [a, b, round(snr - lim, 1)]
        return out

    def focus_payload(self, n):
        s = n.sensors
        return {
            "node": n.idx, "id": n.id, "alive": n.alive, "death_cause": n.death_cause,
            "tau": round(min(n.tau, 1e6), 1), "lam": n.lam, "mu": n.mu, "causes": list(n.causes),
            "evacuating": n.evacuating, "battery_j": round(n.battery_j, 1),
            "reserve_j": self.cfg.reserve_j, "capacity_j": self.cfg.battery_capacity_j,
            "airtime_used_s": round(n.airtime_used, 2), "airtime_s": self.cfg.airtime_allowance_s,
            "owner_airtime_s": self.cfg.owner_airtime_s,
            "sensors": None if s is None else {
                "pressure_kpa": round(s.pressure_kpa, 2), "water_pads": s.water_pads,
                "accel_g": round(s.accel_g, 2), "tilt_deg": round(s.tilt_deg, 1),
                "temp_c": round(s.temp_c, 1), "water_over_m": round(n.water_over, 2)},
            "store": [[k, e["cls"], round(n.local_S.get(k, 0.0), 3)] for k, e in n.store.items()],
            "nbrs": [[i, round(nb["snr"], 1), nb["gw"]] for i, nb in n.nbrs.items()],
            "trace": [[tr.key, int(tr.to), tr.density, tr.gain, list(tr.failed), tr.kind]
                      for tr in n.last_trace[-20:]],
        }

    def summary(self):
        m = self.metrics
        delivered = [x for x in self.msgs.values() if x.delivered_tick is not None]
        lat = [x.delivered_tick - x.created_tick for x in delivered]
        p0 = [x for x in self.msgs.values() if x.cls == "P0"]
        return {
            **{k: (round(v, 2) if isinstance(v, float) else v) for k, v in m.items()},
            "strategy": self.strategy.name, "scenario": self.sc["name"], "seed": self.seed, "ticks": self.t,
            "delivery_ratio": round(len(delivered) / max(m["created"], 1), 4),
            "p0_delivery_ratio": round(sum(x.delivered_tick is not None for x in p0) / max(len(p0), 1), 4),
            "mean_latency_s": round(sum(lat) / len(lat), 1) if lat else None,
            "alive_undelivered": sum(1 for x in self.msgs.values() if x.delivered_tick is None and x.lost_tick is None),
        }

    # ------------------------------------------------------------------ live "what if"
    def inject(self, cmd):
        action = cmd.get("action")
        idx = cmd.get("node")
        node = self.nodes[idx] if isinstance(idx, int) and 0 <= idx < self.n else None
        if action == "sink" and node and node.alive:
            node.forced_sink = self.t
            self.emit("inject", action="sink", node=idx)
        elif action == "collapse":
            x, y = (node.x, node.y) if node else cmd.get("at", [0, 0])
            self.emit("inject", action="collapse", node=idx)
            self.collapse(x, y, cmd.get("radius", 150))
        elif action == "sos" and node and node.alive:
            self.emit("inject", action="sos", node=idx)
            self.create_sos(node, cmd.get("cls", "P0"))
        elif action == "kill" and node and node.alive:
            self.emit("inject", action="kill", node=idx)
            self.kill(node, "crushed")
