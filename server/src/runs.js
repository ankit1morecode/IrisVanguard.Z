import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import { EventEmitter } from 'node:events';
import { config, ROOT } from './config.js';
import { Event, Frame, Run, db } from './db.js';
import { STRATEGIES } from './scenarios.js';

// Events worth indexing for message journeys and node histories (beacons/frames stay in frames only).
const INDEXED = new Set(['msg.created', 'msg.copy', 'msg.delivered', 'msg.lost', 'msg.confirm',
  'node.evacuate', 'node.dead', 'world.collapse', 'inject', 'reconcile']);

const newId = (p) => `${p}_${crypto.randomBytes(4).toString('hex')}`;

/** One simulator worker process and everything streamed from it. */
class LiveRun extends EventEmitter {
  constructor({ scenario, strategy, seed, speed, groupId }) {
    super();
    this.id = newId('r');
    this.groupId = groupId || null;
    this.scenario = scenario;
    this.strategy = strategy;
    this.seed = seed;
    this.speed = speed;
    this.status = 'starting';
    this.init = null;
    this.frames = [];          // in-memory window for late joiners
    this.frameCount = 0;
    this.lastFrame = null;
    this.summary = null;
    this.startedAt = new Date();
    this.endedAt = null;
    this.pending = { frames: [], events: [] };
    this.stderr = '';
  }

  start({ paused = false } = {}) {
    const args = ['-m', 'ivz_sim', '--scenario', this.scenario, '--strategy', this.strategy,
      '--speed', String(this.speed), '--run-id', this.id];
    if (this.seed != null) args.push('--seed', String(this.seed));
    if (paused) args.push('--paused');
    const env = {
      ...process.env,
      PYTHONPATH: [path.join(ROOT, 'core'), path.join(ROOT, 'sim')].join(path.delimiter),
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    };
    this.proc = spawn(config.python, args, { cwd: ROOT, env, windowsHide: true });
    this.status = paused ? 'paused' : 'running';
    readline.createInterface({ input: this.proc.stdout }).on('line', (line) => this.onLine(line));
    this.proc.stderr.on('data', (d) => { this.stderr = (this.stderr + d.toString()).slice(-4000); });
    this.proc.on('error', (err) => this.fail(`could not start Python (${config.python}): ${err.message}`));
    this.proc.on('exit', (code) => {
      if (this.status !== 'ended') this.fail(`simulator exited with code ${code}: ${this.stderr.trim().split('\n').pop() || ''}`);
      this.flush();
    });
    this.flushTimer = setInterval(() => this.flush(), 1000);
    this.persistRun();
    return this;
  }

  onLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.type === 'init') {
      this.init = msg;
      this.persistRun();
      this.emit('message', msg);
    } else if (msg.type === 'frame') {
      msg.i = this.frameCount++;
      this.lastFrame = msg;
      this.frames.push(msg);
      if (this.frames.length > config.memoryFrames) this.frames.shift();
      this.pending.frames.push(msg);
      for (const e of msg.events) if (INDEXED.has(e.t)) this.pending.events.push(e);
      this.emit('message', msg);
    } else if (msg.type === 'ended') {
      this.status = 'ended';
      this.summary = msg.summary;
      this.endedAt = new Date();
      this.emit('message', msg);
      this.flush();
      this.persistRun();
    }
  }

  fail(reason) {
    if (this.status === 'ended' || this.status === 'failed') return;
    this.status = 'failed';
    this.error = reason;
    this.endedAt = new Date();
    console.error(`[run ${this.id}] ${reason}`);
    this.emit('message', { type: 'error', run: this.id, error: reason });
    this.persistRun();
  }

  send(cmd) {
    if (!this.proc || this.proc.exitCode !== null || !this.proc.stdin.writable) return false;
    if (cmd.cmd === 'pause') this.status = 'paused';
    if (cmd.cmd === 'play') this.status = 'running';
    if (cmd.cmd === 'speed') this.speed = Number(cmd.x) || this.speed;
    this.proc.stdin.write(`${JSON.stringify(cmd)}\n`);
    return true;
  }

  stop() {
    this.send({ cmd: 'stop' });
    setTimeout(() => { if (this.proc && this.proc.exitCode === null) this.proc.kill(); }, 1500);
  }

  async flush() {
    if (!db.connected) { this.pending = { frames: [], events: [] }; return; }
    const { frames, events } = this.pending;
    this.pending = { frames: [], events: [] };
    if (this.status === 'ended' || this.status === 'failed') clearInterval(this.flushTimer);
    try {
      if (frames.length) {
        await Frame.insertMany(frames.map((f) => ({ runId: this.id, i: f.i, tick: f.tick, data: f })), { ordered: false });
      }
      if (events.length) {
        await Event.insertMany(events.map((e) => ({
          runId: this.id, tick: e.tick, t: e.t, key: e.key, node: e.node ?? e.to ?? e.last_holder, payload: e,
        })), { ordered: false });
      }
      if (frames.length) await Run.updateOne({ runId: this.id }, { $set: { lastTick: this.lastFrame?.tick, frameCount: this.frameCount } });
    } catch (err) {
      console.warn(`[run ${this.id}] persist failed: ${err.message}`);
    }
  }

  async persistRun() {
    if (!db.connected) return;
    try {
      await Run.updateOne({ runId: this.id }, {
        $set: {
          groupId: this.groupId, scenario: this.scenario, strategy: this.strategy,
          strategyLabel: STRATEGIES[this.strategy], seed: this.init?.seed ?? this.seed, speed: this.speed,
          status: this.status, startedAt: this.startedAt, endedAt: this.endedAt,
          durationS: this.init?.duration_s, summary: this.summary, initPayload: this.init,
          lastTick: this.lastFrame?.tick, frameCount: this.frameCount,
        },
      }, { upsert: true });
    } catch (err) {
      console.warn(`[run ${this.id}] save failed: ${err.message}`);
    }
  }

  meta() {
    return {
      runId: this.id, groupId: this.groupId, scenario: this.scenario, strategy: this.strategy,
      strategyLabel: STRATEGIES[this.strategy], seed: this.init?.seed ?? this.seed, speed: this.speed,
      status: this.status, startedAt: this.startedAt, endedAt: this.endedAt, durationS: this.init?.duration_s,
      lastTick: this.lastFrame?.tick ?? 0, frameCount: this.frameCount, summary: this.summary, error: this.error,
      live: true,
    };
  }
}

class RunManager {
  constructor() {
    this.runs = new Map();
    this.groups = new Map();
  }

  get(id) { return this.runs.get(id); }

  evict() {
    // Keep at most maxLiveRuns processes; drop the oldest finished ones first, then the oldest live.
    const all = [...this.runs.values()].sort((a, b) => a.startedAt - b.startedAt);
    const alive = all.filter((r) => r.status !== 'ended' && r.status !== 'failed');
    while (alive.length >= config.maxLiveRuns) alive.shift().stop();
    const done = all.filter((r) => r.status === 'ended' || r.status === 'failed');
    while (done.length > 20) this.runs.delete(done.shift().id);
  }

  start(opts) {
    this.evict();
    const run = new LiveRun(opts).start({ paused: opts.paused });
    this.runs.set(run.id, run);
    return run;
  }

  startGroup({ scenario, strategies, seed, speed }) {
    const groupId = newId('g');
    // Start paused so every map begins on the same tick, then release them together.
    const runs = strategies.map((strategy) => this.start({ scenario, strategy, seed, speed, groupId, paused: true }));
    this.groups.set(groupId, runs.map((r) => r.id));
    let ready = 0;
    for (const r of runs) {
      r.once('message', () => {
        ready += 1;
        if (ready === runs.length) runs.forEach((x) => x.send({ cmd: 'play' }));
      });
    }
    return { groupId, runs };
  }

  /**
   * Apply a control command to a run, or to every run in its comparison group: the runs share
   * scenario and seed, so node indices match and a "sink this box" lands on the same box everywhere.
   */
  control(runId, cmd) {
    const run = this.runs.get(runId);
    if (!run) return false;
    const targets = run.groupId ? (this.groups.get(run.groupId) || []).map((id) => this.runs.get(id)).filter(Boolean) : [run];
    targets.forEach((r) => (cmd.cmd === 'stop' ? r.stop() : r.send(cmd)));
    return true;
  }

  list() { return [...this.runs.values()].map((r) => r.meta()); }
}

export const runs = new RunManager();
