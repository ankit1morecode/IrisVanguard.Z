"""LoRa link budget, decode and collision model."""
import numpy as np

TX_DBM = 14.0
NOISE_DBM = -117.0          # -174 + 10log10(125 kHz) + 6 dB noise figure
PL0_DB = 40.0
N_LAND = 3.5
N_WATER = 3.2
CAPTURE_DB = 6.0


def height_gain_db(h):
    return 10.0 * np.log10(np.maximum(h, 0.5) / 1.5)


class Radio:
    def __init__(self, n, rng: np.random.Generator):
        sh = rng.normal(0.0, 4.0, (n, n))
        self.shadow = np.triu(sh, 1) + np.triu(sh, 1).T     # symmetric, fixed per run
        self.snr = np.full((n, n), -99.0)

    def update(self, x, y, h, wet, extra_loss):
        """Recompute the SNR matrix (dB) from positions, antenna heights and burial losses."""
        dx = x[:, None] - x[None, :]
        dy = y[:, None] - y[None, :]
        d = np.maximum(np.hypot(dx, dy), 1.0)
        over_water = wet[:, None] & wet[None, :]
        n_exp = np.where(over_water, N_WATER, N_LAND)
        hg = height_gain_db(h)
        pl = PL0_DB + 10.0 * n_exp * np.log10(d) + self.shadow - hg[:, None] - hg[None, :]
        pl += extra_loss[:, None] + extra_loss[None, :]
        snr = TX_DBM - pl - NOISE_DBM
        np.fill_diagonal(snr, -99.0)
        self.snr = snr
        return snr


def resolve(txs, snr, alive, snr_limit):
    """Decide which receivers decode which transmissions this tick.

    txs: list of dicts with src, start, toa, to (None = broadcast).
    Returns list of (tx_index, receiver, snr_db, ok, collision) for every intended receiver.
    """
    out = []
    if not txs:
        return out
    n = snr.shape[0]
    for k, tx in enumerate(txs):
        s0, e0 = tx["start"], tx["start"] + tx["toa"]
        receivers = [tx["to"]] if tx["to"] is not None else np.nonzero(alive & (snr[tx["src"]] >= snr_limit))[0]
        for r in receivers:
            r = int(r)
            if r == tx["src"] or not alive[r]:
                continue
            q = float(snr[tx["src"], r])
            ok = q >= snr_limit
            collision = False
            if ok:
                for m, other in enumerate(txs):
                    if m == k:
                        continue
                    if other["start"] < e0 and s0 < other["start"] + other["toa"]:
                        if other["src"] == r:                       # half duplex
                            ok, collision = False, True
                            break
                        if snr[other["src"], r] >= q - CAPTURE_DB:  # no capture
                            ok, collision = False, True
                            break
            if tx["to"] is not None or ok:
                out.append((k, r, q, ok, collision))
    return out
