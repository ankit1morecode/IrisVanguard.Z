"""ivz_sim: world, physics, radio, agents and strategies around the ivz_core rule engine."""
import os
import sys

_core = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "core")
if _core not in sys.path:
    sys.path.insert(0, _core)

from .engine import Sim  # noqa: E402
from .scenario import list_scenarios, load_scenario  # noqa: E402
from .strategies import STRATEGIES  # noqa: E402

__all__ = ["Sim", "load_scenario", "list_scenarios", "STRATEGIES"]
