import express from 'express';
import { Event, Frame, Run, db } from './db.js';
import { runs } from './runs.js';
import { STRATEGIES, listScenarios, scenarioExists } from './scenarios.js';

export const api = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseRunBody(body) {
  const scenario = String(body.scenario || 'riverside-village-flood');
  if (!scenarioExists(scenario)) throw Object.assign(new Error(`unknown scenario "${scenario}"`), { status: 400 });
  const seed = body.seed === undefined || body.seed === null || body.seed === '' ? null : Number.parseInt(body.seed, 10);
  if (seed !== null && !Number.isFinite(seed)) throw Object.assign(new Error('seed must be an integer'), { status: 400 });
  const speed = Math.min(Math.max(Number(body.speed) || 60, 1), 3600);
  return { scenario, seed, speed };
}

function checkStrategy(s) {
  if (!STRATEGIES[s]) throw Object.assign(new Error(`unknown strategy "${s}"`), { status: 400 });
  return s;
}

api.get('/health', (req, res) => {
  res.json({ ok: true, db: db.connected, liveRuns: runs.list().filter((r) => r.status === 'running').length });
});

api.get('/scenarios', (req, res) => res.json(listScenarios()));

api.get('/strategies', (req, res) => res.json(Object.entries(STRATEGIES).map(([id, label]) => ({ id, label }))));

api.post('/runs', wrap(async (req, res) => {
  const opts = parseRunBody(req.body || {});
  const strategy = checkStrategy(String(req.body?.strategy || 'ivz'));
  const run = runs.start({ ...opts, strategy });
  res.status(201).json(run.meta());
}));

api.post('/runs/compare', wrap(async (req, res) => {
  const opts = parseRunBody(req.body || {});
  const list = Array.isArray(req.body?.strategies) && req.body.strategies.length ? req.body.strategies : ['ivz', 'flooding'];
  if (list.length < 2 || list.length > 4) throw Object.assign(new Error('compare takes 2 to 4 strategies'), { status: 400 });
  list.forEach(checkStrategy);
  const { groupId, runs: started } = runs.startGroup({ ...opts, strategies: list, seed: opts.seed ?? 42 });
  res.status(201).json({ groupId, runs: started.map((r) => r.meta()) });
}));

api.get('/runs', wrap(async (req, res) => {
  const live = runs.list();
  const liveIds = new Set(live.map((r) => r.runId));
  let stored = [];
  if (db.connected) {
    stored = await Run.find({}, { initPayload: 0 }).sort({ startedAt: -1 }).limit(100).lean();
  }
  const merged = [...live, ...stored.filter((r) => !liveIds.has(r.runId)).map((r) => ({ ...r, live: false }))]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  res.json(merged);
}));

api.get('/groups/:groupId', wrap(async (req, res) => {
  const ids = runs.groups.get(req.params.groupId);
  if (ids) return res.json({ groupId: req.params.groupId, runs: ids.map((id) => runs.get(id)?.meta()).filter(Boolean) });
  if (!db.connected) return res.status(404).json({ error: 'group not found' });
  const stored = await Run.find({ groupId: req.params.groupId }, { initPayload: 0 }).sort({ startedAt: 1 }).lean();
  if (!stored.length) return res.status(404).json({ error: 'group not found' });
  res.json({ groupId: req.params.groupId, runs: stored });
}));

api.get('/runs/:id', wrap(async (req, res) => {
  const live = runs.get(req.params.id);
  if (live) return res.json(live.meta());
  if (!db.connected) return res.status(404).json({ error: 'run not found' });
  const r = await Run.findOne({ runId: req.params.id }, { initPayload: 0 }).lean();
  if (!r) return res.status(404).json({ error: 'run not found' });
  res.json({ ...r, live: false });
}));

api.get('/runs/:id/init', wrap(async (req, res) => {
  const live = runs.get(req.params.id);
  if (live?.init) return res.json(live.init);
  if (!db.connected) return res.status(404).json({ error: 'run not found' });
  const r = await Run.findOne({ runId: req.params.id }, { initPayload: 1 }).lean();
  if (!r?.initPayload) return res.status(404).json({ error: 'run not found' });
  res.json(r.initPayload);
}));

/** Frames by index range, for replay and scrubbing back past the in-memory window. */
api.get('/runs/:id/frames', wrap(async (req, res) => {
  const from = Math.max(Number.parseInt(req.query.from ?? '0', 10) || 0, 0);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '500', 10) || 500, 1), 2000);
  const live = runs.get(req.params.id);
  if (live && live.frames.length && live.frames[0].i <= from) {
    return res.json(live.frames.filter((f) => f.i >= from).slice(0, limit));
  }
  if (!db.connected) return res.json(live ? live.frames.slice(0, limit) : []);
  const docs = await Frame.find({ runId: req.params.id, i: { $gte: from } }, { data: 1 }).sort({ i: 1 }).limit(limit).lean();
  res.json(docs.map((d) => d.data));
}));

/** Full journey of one message: creation, every copy, evacuations, delivery or loss. */
api.get('/runs/:id/messages/:key', wrap(async (req, res) => {
  const { id, key } = req.params;
  let events = [];
  if (db.connected) {
    const run = runs.get(id);
    if (run) await run.flush();
    events = (await Event.find({ runId: id, key }).sort({ tick: 1 }).lean()).map((e) => e.payload);
  } else {
    const run = runs.get(id);
    events = run ? run.frames.flatMap((f) => f.events).filter((e) => e.key === key) : [];
  }
  if (!events.length) return res.status(404).json({ error: 'message not found' });
  res.json({ key, events });
}));

/** Node history: sampled tau, battery and airtime from frames, plus its key events. */
api.get('/runs/:id/nodes/:node', wrap(async (req, res) => {
  const { id } = req.params;
  const node = Number.parseInt(req.params.node, 10);
  const run = runs.get(id);
  let frames = run ? run.frames : [];
  if (db.connected && (!run || frames[0]?.i > 0)) {
    frames = (await Frame.find({ runId: id }, { data: 1 }).sort({ i: 1 }).lean()).map((d) => d.data);
  }
  const step = Math.max(1, Math.floor(frames.length / 300));
  const series = frames.filter((_, i) => i % step === 0).map((f) => ({
    tick: f.tick, tau: f.nodes.tau[node], batt: f.nodes.batt[node], air: f.nodes.air[node],
    state: f.nodes.state[node], store: f.nodes.store[node],
  }));
  let events = [];
  if (db.connected) events = (await Event.find({ runId: id, node }).sort({ tick: 1 }).limit(500).lean()).map((e) => e.payload);
  res.json({ node, series, events });
}));

api.get('/runs/:id/metrics', wrap(async (req, res) => {
  const run = runs.get(req.params.id);
  let frames = run ? run.frames : [];
  if (db.connected && (!run || frames[0]?.i > 0)) {
    frames = (await Frame.find({ runId: req.params.id }, { 'data.tick': 1, 'data.metrics': 1 }).sort({ i: 1 }).lean()).map((d) => d.data);
  }
  res.json(frames.map((f) => ({ tick: f.tick, ...f.metrics })));
}));

api.post('/runs/:id/control', (req, res) => {
  const ok = runs.control(req.params.id, req.body || {});
  res.status(ok ? 200 : 404).json({ ok });
});

/** Live "what if": sink a box, collapse a building, send an SOS, kill a box. */
api.post('/runs/:id/inject', (req, res) => {
  const { action, node, cls, at, radius } = req.body || {};
  if (!['sink', 'collapse', 'sos', 'kill'].includes(action)) return res.status(400).json({ error: 'unknown action' });
  const ok = runs.control(req.params.id, { cmd: 'inject', action, node, cls, at, radius });
  res.status(ok ? 200 : 404).json({ ok });
});

api.delete('/runs/:id', wrap(async (req, res) => {
  const live = runs.get(req.params.id);
  if (live) live.stop();
  if (db.connected) {
    await Promise.all([
      Run.deleteOne({ runId: req.params.id }), Frame.deleteMany({ runId: req.params.id }), Event.deleteMany({ runId: req.params.id }),
    ]);
  }
  runs.runs.delete(req.params.id);
  res.json({ ok: true });
}));

// The hardware bridge (serial <-> MQTT gateway box) is future work; the endpoint exists so the UI can show its status.
api.get('/hardware/status', (req, res) => res.json({ connected: false, bridge: 'not configured', nodes: [] }));

api.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});
