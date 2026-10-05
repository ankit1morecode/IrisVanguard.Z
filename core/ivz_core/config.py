"""Tunable constants for the survival rules. Pure data, no I/O."""
from dataclasses import dataclass, field

# Demodulation SNR limits per LoRa spreading factor (Semtech datasheet values, dB).
SNR_LIMIT_DB = {7: -7.5, 8: -10.0, 9: -12.5, 10: -15.0, 11: -17.5, 12: -20.0}

CLASS_RANK = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}


@dataclass(frozen=True)
class Config:
    # Regulatory airtime: 1% duty cycle over a rolling hour (India 865-867 MHz).
    duty_cycle: float = 0.01
    window_s: float = 3600.0
    owner_airtime_frac: float = 0.2          # slice of the allowance fenced for the owner's own SOS

    # Energy: one 18650 cell (3.6 V x 3.0 Ah).
    battery_capacity_j: float = 38_880.0
    reserve_frac: float = 0.03               # owner SOS every 10 min for 72 h
    tx_power_w: float = 0.45
    idle_power_w: float = 0.015

    # Radio.
    sf: int = 9
    bw_hz: float = 125_000.0
    coding_rate: int = 1                     # 4/5
    preamble: int = 8
    link_margin_db: float = 3.0
    path_loss_exp: float = 3.5
    msg_bytes: int = 44                      # 32-byte EIO + 12-byte header
    min_contact_factor: float = 2.0          # contact window must cover 2x the time on air

    # Survival maths.
    horizon_s: float = 3600.0
    targets: dict = field(default_factory=lambda: {"P0": 0.99, "P1": 0.95, "P2": 0.90, "P3": 0.80})
    min_gain: float = 0.002
    forward_ratio: float = 1.5               # a next hop must have a clearly better gateway rate
    holder_ttl_s: float = 1800.0             # unheard holders decay with this time constant

    # Hazard model.
    base_lam: float = 1.0 / (72 * 3600)
    submersion_kpa: float = 0.5              # ~5 cm of water over the pressure sensor
    evac_tau_s: float = 300.0                # below this predicted life a box evacuates
    shock_g: float = 4.0
    tilt_deg: float = 60.0
    heat_c: float = 55.0

    @property
    def airtime_allowance_s(self) -> float:
        return self.duty_cycle * self.window_s

    @property
    def owner_airtime_s(self) -> float:
        return self.airtime_allowance_s * self.owner_airtime_frac

    @property
    def reserve_j(self) -> float:
        return self.battery_capacity_j * self.reserve_frac

    @property
    def snr_limit_db(self) -> float:
        return SNR_LIMIT_DB[self.sf]


DEFAULT = Config()
