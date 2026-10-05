import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { api } from './api.js';
import { config } from './config.js';
import { connectDb } from './db.js';
import { syncScenarios } from './scenarios.js';
import { runs } from './runs.js';
import { attachWebSockets } from './ws.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', api);

  // In production the built React app is served from the same origin.
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get(/^\/(?!api|ws).*/, (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }
  return app;
}

async function main() {
  await connectDb();
  await syncScenarios().catch((err) => console.warn(`[db] scenario sync failed: ${err.message}`));
  const server = http.createServer(createApp());
  attachWebSockets(server);
  server.listen(config.port, () => console.log(`[api] IrisVanguard.Z listening on http://localhost:${config.port}`));

  const shutdown = () => {
    for (const r of runs.runs.values()) r.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
