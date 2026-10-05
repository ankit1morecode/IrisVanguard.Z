import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import { config } from './config.js';
import { Scenario, db } from './db.js';

export const STRATEGIES = {
  ivz: 'IrisVanguard.Z',
  ivz_noevac: 'IVZ without evacuation',
  flooding: 'Managed flooding',
  epidemic: 'Epidemic',
  spray: 'Spray-and-Wait (L=6)',
};

function summarise(name, text) {
  const doc = YAML.parse(text) || {};
  const nodes = (doc.nodes || []).reduce((acc, n) => {
    acc[n.kind] = (acc[n.kind] || 0) + (n.kind === 'gateway' ? 1 : Number(n.count || 1));
    return acc;
  }, {});
  nodes.boat = (doc.mobile || []).length;
  return {
    name,
    title: doc.title || name,
    description: (doc.description || '').trim(),
    durationS: doc.duration_s || 7200,
    seed: doc.seed ?? 42,
    sizeM: doc.world?.size_m || 3000,
    nodes,
    nodeCount: Object.values(nodes).reduce((a, b) => a + b, 0),
    hasFlood: (doc.water?.level_m || []).some(([, l]) => l > 0),
    collapses: (doc.quake?.collapses || []).length,
    version: crypto.createHash('sha1').update(text).digest('hex').slice(0, 10),
  };
}

export function listScenarios() {
  return fs.readdirSync(config.scenarioDir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => {
      const name = f.replace(/\.yaml$/, '');
      return summarise(name, fs.readFileSync(path.join(config.scenarioDir, f), 'utf8'));
    });
}

export function scenarioExists(name) {
  return /^[a-z0-9-]+$/.test(name) && fs.existsSync(path.join(config.scenarioDir, `${name}.yaml`));
}

/** Mirror the versioned YAML files into MongoDB so runs can reference a scenario version. */
export async function syncScenarios() {
  if (!db.connected) return;
  for (const s of listScenarios()) {
    const yaml = fs.readFileSync(path.join(config.scenarioDir, `${s.name}.yaml`), 'utf8');
    await Scenario.updateOne(
      { name: s.name },
      { $set: { title: s.title, description: s.description, yaml, version: s.version, nodeCount: s.nodeCount, durationS: s.durationS } },
      { upsert: true },
    );
  }
}
