"""Plain data types shared by the rule engine, simulator and (later) firmware test vectors."""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Sensors:
    pressure_kpa: float
    water_pads: bool
    accel_g: float
    tilt_deg: float
    temp_c: float
    battery_j: float
    power_w: float


@dataclass(frozen=True)
class Baseline:
    pressure_kpa: float = 101.325


@dataclass(frozen=True)
class Hazard:
    lam: float                      # failure rate, 1/s
    tau: float                      # expected time left, s
    causes: tuple = ()


@dataclass
class NodeView:
    """What a box knows about itself when planning."""
    id: str
    lam: float
    mu: float                       # rate at which this box can reach a gateway, 1/s
    battery_j: float
    airtime_used_s: float           # in the current rolling window
    evacuating: bool = False
    pos: tuple = (0.0, 0.0)
    vel: tuple = (0.0, 0.0)
    is_gateway: bool = False


@dataclass
class Neighbour:
    """What a box learned about a neighbour from its last beacon."""
    id: str
    lam: float
    mu: float
    snr_db: float
    pos: tuple = (0.0, 0.0)
    vel: tuple = (0.0, 0.0)
    is_gateway: bool = False


@dataclass
class HolderInfo:
    lam: float
    mu: float
    age_s: float = 0.0
    is_gateway: bool = False


@dataclass
class StoredMsg:
    key: str
    cls: str
    own: bool = False               # created by this box's owner
    holders: dict = field(default_factory=dict)   # holder id -> HolderInfo (other boxes)


@dataclass(frozen=True)
class GateResult:
    ok: bool
    failed: tuple = ()


@dataclass(frozen=True)
class Action:
    kind: str                       # FORWARD | SEND
    key: str
    to: str = ""
    toa_s: float = 0.0
    energy_j: float = 0.0
    s_before: float = 0.0
    s_after: float = 0.0


@dataclass(frozen=True)
class TraceEntry:
    key: str
    to: str
    density: float
    gain: float
    failed: tuple
    kind: str = "copy"              # copy (survival) | forward (custody towards a gateway)


@dataclass
class PlanResult:
    actions: list
    trace: list
    survival: dict                  # key -> S as this box sees it
