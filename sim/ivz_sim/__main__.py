"""Run worker. Streams JSON lines on stdout; reads control commands as JSON lines on stdin.

    python -m ivz_sim --scenario riverside-village-flood --strategy ivz --speed 60
    python -m ivz_sim --scenario riverside-village-flood --headless --summary
"""
import argparse
import json
import queue
import sys
import threading
import time

from .engine import Sim
from .scenario import list_scenarios, load_scenario
from .strategies import STRATEGIES


def out(obj, stream=sys.stdout):
    stream.write(json.dumps(obj, separators=(",", ":")) + "\n")
    stream.flush()


def stdin_reader(q):
    for line in sys.stdin:
        line = line.strip()
        if line:
            try:
                q.put(json.loads(line))
            except json.JSONDecodeError:
                pass


def main(argv=None):
    ap = argparse.ArgumentParser(prog="ivz_sim")
    ap.add_argument("--scenario", default="riverside-village-flood")
    ap.add_argument("--strategy", default="ivz", choices=sorted(STRATEGIES))
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--speed", type=float, default=60.0, help="simulated seconds per wall second")
    ap.add_argument("--run-id", default="local")
    ap.add_argument("--headless", action="store_true", help="run as fast as possible, no pacing")
    ap.add_argument("--summary", action="store_true", help="print only the final summary")
    ap.add_argument("--duration", type=int, default=None)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--paused", action="store_true", help="start paused")
    args = ap.parse_args(argv)

    if args.list:
        out({"scenarios": list_scenarios(), "strategies": {k: v.label for k, v in STRATEGIES.items()}})
        return

    sc = load_scenario(args.scenario)
    if args.duration:
        sc["duration_s"] = args.duration
    sim = Sim(sc, args.strategy, seed=args.seed, run_id=args.run_id)

    if args.headless:
        while sim.t < sim.duration:
            sim.step()
            if not args.summary and sim.t % 10 == 0:
                out(sim.frame())
        out({"type": "ended", "run": sim.run_id, "summary": sim.summary()})
        return

    cmds = queue.Queue()
    threading.Thread(target=stdin_reader, args=(cmds,), daemon=True).start()
    out(sim.init_payload())
    out(sim.frame())

    speed, paused = args.speed, args.paused
    wall0, tick0 = time.perf_counter(), sim.t
    while sim.t < sim.duration:
        while not cmds.empty():
            c = cmds.get()
            kind = c.get("cmd")
            if kind == "pause":
                paused = True
            elif kind == "play":
                paused = False
            elif kind == "speed":
                speed = max(1.0, min(float(c.get("x", 60)), 3600.0))
            elif kind == "focus":
                sim.focus = c.get("node")
            elif kind == "inject":
                sim.inject(c)
            elif kind == "stop":
                out({"type": "ended", "run": sim.run_id, "summary": sim.summary(), "stopped": True})
                return
            wall0, tick0 = time.perf_counter(), sim.t
            if kind in ("focus", "inject"):
                out(sim.frame())
        if paused:
            time.sleep(0.05)
            wall0, tick0 = time.perf_counter(), sim.t
            continue
        frame_every = max(1, int(round(speed / 10)))
        for _ in range(frame_every):
            if sim.t >= sim.duration:
                break
            sim.step()
        out(sim.frame())
        ahead = (sim.t - tick0) / speed - (time.perf_counter() - wall0)
        if ahead > 0:
            time.sleep(ahead)
    out({"type": "ended", "run": sim.run_id, "summary": sim.summary()})


if __name__ == "__main__":
    main()
