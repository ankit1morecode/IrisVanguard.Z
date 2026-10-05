import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(ROOT, 'server', '.env'), quiet: true });

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/irisvanguard',
  python: process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
  scenarioDir: path.join(ROOT, 'scenarios'),
  clientDist: path.join(ROOT, 'client', 'dist'),
  maxLiveRuns: Number(process.env.MAX_LIVE_RUNS || 8),
  // Frames kept in memory per run for late joiners and scrubbing; Mongo holds the full log.
  memoryFrames: Number(process.env.MEMORY_FRAMES || 4000),
};
