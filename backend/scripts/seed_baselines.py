"""Compute baseline stats via Monte Carlo simulation and seed the BaselineStat table.

Run from backend/:
    uv run python scripts/seed_baselines.py

Runs 1_000_000 trials for each album size k in [5, 25] and saves mean/std to DB.
This takes a few minutes; progress is printed per k.
"""
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.session import Base, SessionLocal, engine
from app.models.album import BaselineStat

Base.metadata.create_all(engine)

TOP_N = 5
NUM_TRIALS = 1_000_000
SEED = 42
K_RANGE = range(5, 26)


def simulate(k: int) -> tuple[float, float]:
    rng = random.Random(SEED)
    song_ids = list(range(k))
    losses: list[int] = []

    for _ in range(NUM_TRIALS):
        y_list = rng.sample(song_ids, TOP_N)
        t_list = rng.sample(song_ids, TOP_N)

        y_ranks = {idx: rank for rank, idx in enumerate(y_list, start=1)}
        t_ranks = {idx: rank for rank, idx in enumerate(t_list, start=1)}

        union_songs = list(set(y_list) | set(t_list))

        missing_in_y = [idx for idx in t_list if idx not in y_ranks]
        missing_in_t = [idx for idx in y_list if idx not in t_ranks]

        next_rank_y = TOP_N + 1
        for idx in missing_in_y:
            y_ranks[idx] = next_rank_y
            next_rank_y += 1

        next_rank_t = TOP_N + 1
        for idx in missing_in_t:
            t_ranks[idx] = next_rank_t
            next_rank_t += 1

        loss = sum(abs(y_ranks[idx] - t_ranks[idx]) for idx in union_songs)
        losses.append(loss)

    mean = statistics.mean(losses)
    std = statistics.stdev(losses)
    return mean, std


def seed() -> None:
    with SessionLocal() as db:
        for k in K_RANGE:
            print(f"Simulating k={k}...", flush=True)
            mean, std = simulate(k)
            existing = db.get(BaselineStat, k)
            if existing:
                existing.mean = mean
                existing.std = std
            else:
                db.add(BaselineStat(k=k, mean=mean, std=std))
        db.commit()
        count = db.query(BaselineStat).count()
    print(f"Done. {count} baseline stat rows in DB.")


if __name__ == "__main__":
    seed()
