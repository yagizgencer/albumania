import threading

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.album import BaselineStat

# `baseline_stats` is static seed data (a handful of rows keyed by track count),
# but it was being re-queried once per album — three times per album on the
# comparison page, so ~90 queries to read the same few rows. Load it once per
# process instead.
_baselines: dict[int, tuple[float, float]] | None = None
_baselines_lock = threading.Lock()


def get_baseline(db: Session, k: int) -> tuple[float, float] | None:
    """`(mean, std)` for albums of `k` tracks, or None if we have no baseline."""
    global _baselines
    if _baselines is None:
        with _baselines_lock:
            if _baselines is None:
                _baselines = {
                    row.k: (row.mean, row.std)
                    for row in db.scalars(select(BaselineStat))
                }
    return _baselines.get(k)


def reset_baseline_cache() -> None:
    """Drop the cached table. Used by tests, which build a fresh DB per case."""
    global _baselines
    with _baselines_lock:
        _baselines = None


def compute_ranking_loss(a: list[int], b: list[int]) -> int:
    """
    Total absolute rank-difference loss over the union of two top-5 lists.
    Songs missing from one side get virtual ranks starting at 6.
    Ported from reference/helpers.py (compute_ranking_loss_df / compute_loss inner fn).
    """
    a_ranks = {idx: rank for rank, idx in enumerate(a, start=1)}
    b_ranks = {idx: rank for rank, idx in enumerate(b, start=1)}

    union = set(a) | set(b)

    next_a = len(a) + 1
    for idx in b:
        if idx not in a_ranks:
            a_ranks[idx] = next_a
            next_a += 1

    next_b = len(b) + 1
    for idx in a:
        if idx not in b_ranks:
            b_ranks[idx] = next_b
            next_b += 1

    return sum(abs(a_ranks[idx] - b_ranks[idx]) for idx in union)


def compute_similarity_score(loss: int, mean: float, std: float) -> float | None:
    """
    Flipped Z-score: higher = more similar.
    Ported from reference/helpers.py (compute_similarity_score).
    """
    if std == 0:
        return 0.0
    return -(loss - mean) / std
