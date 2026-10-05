import { WebSocketServer } from 'ws';
import { runs } from './runs.js';

/**
 * One WebSocket per run at /ws/runs/:id.
 * Server -> client: snapshot (on join), init, frame, ended, error.
 * Client -> server: play, pause, speed {x}, focus {node}, inject {...}, stop.
 */
export function attachWebSockets(server) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: { threshold: 1024 } });

  server.on('upgrade', (req, socket, head) => {
    const m = req.url && req.url.match(/^\/ws\/runs\/([\w-]+)/);
    if (!m) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, m[1]));
  });

  wss.on('connection', (ws, runId) => {
    const run = runs.get(runId);
    if (!run) {
      ws.send(JSON.stringify({ type: 'error', error: 'run not found or no longer live' }));
      ws.close();
      return;
    }
    const send = (msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
    // Late joiners get the static world plus recent frames so the timeline is populated at once.
    send({ type: 'snapshot', run: run.meta(), init: run.init, frames: run.frames.slice(-300) });
    const onMsg = (msg) => send(msg);
    run.on('message', onMsg);

    ws.on('message', (raw) => {
      let cmd;
      try { cmd = JSON.parse(raw.toString()); } catch { return; }
      if (cmd && typeof cmd.cmd === 'string') runs.control(runId, cmd);
    });
    ws.on('close', () => run.off('message', onMsg));
  });
  return wss;
}
