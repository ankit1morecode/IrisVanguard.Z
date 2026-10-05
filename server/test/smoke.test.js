// End-to-end smoke test against a running server (npm start), e.g. API=http://localhost:4000 npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const API = process.env.API || 'http://localhost:4000';

async function json(path, opts) {
  const res = await fetch(`${API}/api/v1${path}`, { headers: { 'content-type': 'application/json' }, ...opts });
  return { status: res.status, body: await res.json() };
}

test('lists scenarios and strategies', async () => {
  const { body } = await json('/scenarios');
  assert.ok(body.find((s) => s.name === 'riverside-village-flood'));
  const st = await json('/strategies');
  assert.ok(st.body.find((s) => s.id === 'ivz'));
});

test('rejects bad input', async () => {
  assert.equal((await json('/runs', { method: 'POST', body: JSON.stringify({ scenario: '../etc' }) })).status, 400);
  assert.equal((await json('/runs', { method: 'POST', body: JSON.stringify({ strategy: 'nope' }) })).status, 400);
});

test('streams frames over the websocket and accepts an inject', async () => {
  const { status, body: run } = await json('/runs', { method: 'POST', body: JSON.stringify({ scenario: 'city-quake-blackout', speed: 300 }) });
  assert.equal(status, 201);
  const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/runs/${run.runId}`);
  const seen = { init: null, frames: 0, inject: false };
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${JSON.stringify({ ...seen, init: !!seen.init })}`)), 20000);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'snapshot' && msg.init) seen.init = msg.init;
      if (msg.type === 'init') seen.init = msg;
      if (msg.type === 'frame') {
        seen.frames += 1;
        if (seen.frames === 5) ws.send(JSON.stringify({ cmd: 'inject', action: 'sos', node: 3, cls: 'P0' }));
        if (msg.events.some((e) => e.t === 'inject')) seen.inject = true;
        if (seen.inject && seen.init) { clearTimeout(timer); resolve(); }
      }
    });
    ws.on('error', reject);
  });
  ws.close();
  assert.ok(seen.init.nodes.length > 100);
  await json(`/runs/${run.runId}/control`, { method: 'POST', body: JSON.stringify({ cmd: 'stop' }) });
});
