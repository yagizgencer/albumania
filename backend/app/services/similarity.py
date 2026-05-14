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
