"""Compatibility shim — dry-down lives in derived.py."""

from derived import (  # noqa: F401
    MIN_R_SQUARED,
    MIN_SAMPLES,
    DryDownProjection,
    DryDownResult,
    project_drydown,
)
