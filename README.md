# IrisVanguard.Z — digital twin

A network of cheap floating LoRa boxes that keeps SOS messages alive in a disaster: a box that senses it is about to die hands its messages to a safer neighbour first. This repo is the software-first digital twin.

| Layer | Path | Tech |
|---|---|---|
| Rule engine (the invention) | `core/ivz_core` | Python, pure, unit + property tested |
| Simulator | `sim/ivz_sim` | Python + NumPy: flood/quake, LoRa link budget, collisions, energy, boats, 5 strategies |
| API + realtime | `server` | Node, Express, WebSocket, MongoDB (falls back to memory) |
| UI | `client` | React, TypeScript, Vite, Tailwind, Three.js (react-three-fiber), Zustand, Framer Motion |

## Run locally

Needs Python 3.11+, Node 20+, MongoDB on `mongodb://127.0.0.1:27017` (optional).

```bash
pip install -r requirements.txt
cd server && npm install && npm start      # http://localhost:4000
cd client && npm install && npm run dev    # http://localhost:5173
```

## Tests

```bash
python -m pytest -q tests                  # core + simulator
cd server && npm test                      # needs the server running
```

Headless run: `PYTHONPATH="core;sim" python -m ivz_sim --scenario cutoff-hamlet-boat --strategy ivz --headless --summary`
(use `core:sim` on macOS/Linux).

## Not included yet
- Hardware bridge (serial/MQTT/ESP32 firmware): stub endpoint only.
- Real maps/DEM tiles: synthetic terrain instead.
- Deployment (Railway/Vercel/Docker).
