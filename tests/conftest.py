import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [os.path.join(ROOT, "core"), os.path.join(ROOT, "sim")]

from hypothesis import HealthCheck, settings  # noqa: E402

settings.register_profile("ivz", suppress_health_check=[HealthCheck.too_slow], deadline=None)
settings.load_profile("ivz")
