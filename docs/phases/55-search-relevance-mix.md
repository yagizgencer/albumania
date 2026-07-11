# Phase 55 — Mixed-relevance global search

The NavBar "Search albums and artists…" box used to list **every artist first,
then every album**. Now results are interleaved by relevance, like Spotify:
whatever best matches what you typed comes first, regardless of type.

## How it works

The search still calls the two existing endpoints (`/albums/search`,
`/artists/search`) in parallel — no backend change. Spotify returns each type
already ranked by its own relevance, but as two separate lists. The frontend now
merges them into one list scored on how well each result's **name matches the
query**, using Spotify's within-bucket order as the tie-break.

Match tiers (best first): exact name → prefix (`startsWith`) → contains → fuzzy
(Spotify returned it without a substring hit). Within a tier, each item keeps its
original Spotify rank; a stable sort preserves that. So typing an album's exact
title floats that album above a looser artist match, and vice-versa.

Considered but not done: adding a real popularity signal. Album search items from
Spotify carry no `popularity` (only the full album fetch does), so a true
cross-type popularity sort would need per-item enrichment (an extra API round-trip
per result) — not worth it versus the name-match heuristic, which is what users
actually perceive as relevance. Kept the two endpoints rather than building a new
combined `/search` route, so no backend/schema/test churn.

## Frontend

- `frontend/src/components/TopSearch.tsx` — replaced the artists-then-albums array
  spread with `mixByRelevance(q, artists, albums)`. Added two module-level helpers:
  `matchTier(name, q)` (exact/prefix/contains/fuzzy → 0..3) and `mixByRelevance`
  (scores both lists, stable-sorts by `tier` then Spotify `rank`, returns the
  merged `SearchHit[]`). The dropdown was already one flat `role="listbox"`, so no
  JSX/markup change was needed.
- `frontend/src/components/NavBar.test.tsx` — added a test: an exact-title album
  ranks above a looser artist match, proving results mix by relevance instead of
  artists-first.

## Verification

- `cd frontend && pnpm tsc --noEmit` — clean.
- `cd frontend && pnpm test` — 83 passed (new relevance test included).
- `cd frontend && pnpm build` — green.
- Manual: type an artist name → that artist tops the list; type an album title →
  that album tops it; partial queries interleave both types by match quality.
