import mongoose from 'mongoose';
import { config } from './config.js';

const { Schema } = mongoose;

const ScenarioSchema = new Schema({
  name: { type: String, unique: true, index: true },
  title: String,
  description: String,
  yaml: String,
  version: String,
  nodeCount: Number,
  durationS: Number,
}, { timestamps: true });

const RunSchema = new Schema({
  runId: { type: String, unique: true, index: true },
  groupId: { type: String, index: true },
  scenario: String,
  strategy: String,
  strategyLabel: String,
  seed: Number,
  speed: Number,
  status: { type: String, enum: ['starting', 'running', 'paused', 'ended', 'failed'], default: 'starting' },
  startedAt: Date,
  endedAt: Date,
  durationS: Number,
  lastTick: Number,
  frameCount: Number,
  summary: Schema.Types.Mixed,
  initPayload: Schema.Types.Mixed,
}, { timestamps: true });

// The event log is the source of truth; frames are compact snapshots plus the events since the last one.
const FrameSchema = new Schema({
  runId: { type: String, index: true },
  i: Number,
  tick: Number,
  data: Schema.Types.Mixed,
});
FrameSchema.index({ runId: 1, i: 1 }, { unique: true });

const EventSchema = new Schema({
  runId: String,
  tick: Number,
  t: String,
  key: String,
  node: Number,
  payload: Schema.Types.Mixed,
});
EventSchema.index({ runId: 1, key: 1, tick: 1 });
EventSchema.index({ runId: 1, node: 1, tick: 1 });

export const Scenario = mongoose.model('Scenario', ScenarioSchema);
export const Run = mongoose.model('Run', RunSchema);
export const Frame = mongoose.model('Frame', FrameSchema);
export const Event = mongoose.model('Event', EventSchema);

export const db = { connected: false };

export async function connectDb() {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
    db.connected = true;
    console.log(`[db] connected to ${config.mongoUri}`);
  } catch (err) {
    db.connected = false;
    console.warn(`[db] MongoDB unavailable (${err.message}); running with in-memory history only`);
  }
  mongoose.connection.on('disconnected', () => { db.connected = false; });
  mongoose.connection.on('connected', () => { db.connected = true; });
}
