#!/usr/bin/env python3
"""
Seed script: imports 36 albums from album_ranking.ipynb and publishes ratings
for Tugba and/or Yağız via the live API, then back-fills the correct completed_at
dates directly in the database.

Usage (run from backend/):
    uv run python scripts/seed_ratings.py \
        --base-url https://albumania.onrender.com \
        --database-url "postgresql://user:pass@host/db?sslmode=require" \
        --tugba-email you@example.com --tugba-password yourpass \
        [--yagiz-email y@example.com --yagiz-password hispass]

Prerequisites:
  - Both accounts must already be registered on the app.
  - Run DELETE FROM song_notes; DELETE FROM ratings; in Neon first if re-seeding.
"""
import argparse
import sys
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import create_engine, text

RANKINGS = [
    {"album": "Even in Arcadia", "spotify_id": "1lS7FeRcSUuIGqyg99UGpj", "date": "29.05.2025", "Yagiz": [1, 3, 0, 8, 5], "Tugba": [1, 3, 7, 0, 5], "yagiz_score": 7.5, "tugba_score": 7.4},
    {"album": "The New Abnormal", "spotify_id": "2xkZV2Hl1Omi8rk2D7t5lN", "date": "31.05.2025", "Yagiz": [0, 8, 6, 2, 1], "Tugba": [8, 1, 0, 2, 6], "yagiz_score": 7.2, "tugba_score": 9.5},
    {"album": "BODIES", "spotify_id": "5bJeb7bvHrxNvZ6UskCoqm", "date": "11.06.2025", "Yagiz": [1, 2, 10, 9, 5], "Tugba": [10, 2, 3, 5, 1], "yagiz_score": 9.6, "tugba_score": 9.3},
    {"album": "Skinty Fia", "spotify_id": "0aVN6rMKthfuAdDXn8RTXf", "date": "12.06.2025", "Yagiz": [8, 5, 0, 7, 3], "Tugba": [8, 3, 5, 1, 4], "yagiz_score": 8.1, "tugba_score": 8.7},
    {"album": "Radiant Dark", "spotify_id": "2qGyywbFxucSBkPMPgfQ2w", "date": "18.06.2025", "Yagiz": [5, 2, 9, 1, 0], "Tugba": [2, 4, 9, 5, 1], "yagiz_score": 8.0, "tugba_score": 6.6},
    {"album": "Boxer", "spotify_id": "2pG7mDkQhia2OyGE6fbkmJ", "date": "24.06.2025", "Yagiz": [1, 5, 0, 6, 9], "Tugba": [1, 6, 0, 11, 5], "yagiz_score": 6.5, "tugba_score": 7.0},
    {"album": "Take Me Back To Eden", "spotify_id": "1gjugH97doz3HktiEjx2vY", "date": "25.06.2025", "Yagiz": [7, 10, 9, 4, 0], "Tugba": [10, 7, 9, 0, 2], "yagiz_score": 8.1, "tugba_score": 7.5},
    {"album": "Origin of Symmetry", "spotify_id": "1Dh27pjT3IEdiRG9Se5uQn", "date": "02.07.2025", "Yagiz": [4, 0, 11, 9, 5], "Tugba": [4, 1, 5, 0, 2], "yagiz_score": 6.7, "tugba_score": 7.2},
    {"album": "Fatalism", "spotify_id": "6yMmUKkAfVoHJT71ZpoBi5", "date": "06.07.2025", "Yagiz": [5, 1, 7, 0, 4], "Tugba": [7, 4, 3, 0, 1], "yagiz_score": 9.1, "tugba_score": 8.1},
    {"album": "Disintegration", "spotify_id": "6DZNOsLXIU2zOQfQDwDpIS", "date": "09.07.2025", "Yagiz": [5, 3, 6, 1, 9], "Tugba": [3, 9, 5, 1, 4], "yagiz_score": 7.1, "tugba_score": 8.3},
    {"album": "The Silver Scream", "spotify_id": "3DVjLNjzyZBVc8eZcJoulz", "date": "13.07.2025", "Yagiz": [2, 12, 6, 7, 0], "Tugba": [5, 2, 12, 0, 11], "yagiz_score": 9.2, "tugba_score": 9.0},
    {"album": "(What's the Story) Morning Glory?", "spotify_id": "6Srtm8a14PDdrpRUdvUdEO", "date": "23.07.2025", "Yagiz": [11, 3, 2, 9, 1], "Tugba": [11, 3, 2, 9, 6], "yagiz_score": 7.5, "tugba_score": 8.8},
    {"album": "Stargazer", "spotify_id": "6xKM5VYZoDt0H0mPu2Blru", "date": "29.07.2025", "Yagiz": [10, 6, 9, 1, 8], "Tugba": [1, 4, 5, 7, 2], "yagiz_score": 8.3, "tugba_score": 8.4},
    {"album": "Humbug", "spotify_id": "5IEoiwkThhRmSMBANhpxl2", "date": "10.08.2025", "Yagiz": [1, 8, 2, 9, 0], "Tugba": [1, 8, 3, 7, 0], "yagiz_score": 7.3, "tugba_score": 8.6},
    {"album": "People Watching", "spotify_id": "1PRvYCv9h0rlR4AP54yOnN", "date": "17.08.2025", "Yagiz": [3, 1, 6, 8, 13], "Tugba": [4, 3, 7, 0, 13], "yagiz_score": 8.3, "tugba_score": 7.6},
    {"album": "X&Y", "spotify_id": "4E7bV0pzG0LciBSWTszra6", "date": "24.08.2025", "Yagiz": [9, 1, 0, 6, 3], "Tugba": [3, 6, 4, 5, 0], "yagiz_score": 7.8, "tugba_score": 9.4},
    {"album": "Tsunami Sea", "spotify_id": "79sg58t1vRpcxudpP9uPtg", "date": "31.08.2025", "Yagiz": [6, 9, 8, 5, 2], "Tugba": [6, 2, 8, 9, 5], "yagiz_score": 9.0, "tugba_score": 8.1},
    {"album": "Songs for the Deaf", "spotify_id": "4w3NeXtywU398NYW4903rY", "date": "07.09.2025", "Yagiz": [1, 3, 4, 11, 7], "Tugba": [7, 4, 1, 13, 9], "yagiz_score": 7.6, "tugba_score": 8.5},
    {"album": "Hit It!", "spotify_id": "7jcC7erlgmd9QbhooPY4bt", "date": "14.09.2025", "Yagiz": [5, 10, 1, 6, 0], "Tugba": [10, 1, 2, 8, 0], "yagiz_score": 8.2, "tugba_score": 6.8},
    {"album": "The Human Fear", "spotify_id": "7LbR1L8thzNldHceu3tj1a", "date": "21.09.2025", "Yagiz": [5, 8, 4, 3, 10], "Tugba": [5, 0, 4, 8, 6], "yagiz_score": 7.0, "tugba_score": 8.2},
    {"album": "Melancholy", "spotify_id": "5IgHVlikizQFBPieV1uk8v", "date": "28.09.2025", "Yagiz": [9, 4, 1, 7, 6], "Tugba": [0, 4, 9, 1, 2], "yagiz_score": 8.6, "tugba_score": 7.8},
    {"album": "The Queen is Dead", "spotify_id": "5Y0p2XCgRRIjna91aQE8q7", "date": "05.10.2025", "Yagiz": [3, 8, 5, 2, 1], "Tugba": [8, 3, 5, 2, 1], "yagiz_score": 6.8, "tugba_score": 8.0},
    {"album": "Remedy Lane", "spotify_id": "5wdXBbdGH90qfKoWBErbdw", "date": "12.10.2025", "Yagiz": [3, 5, 12, 6, 4], "Tugba": [6, 5, 7, 1, 12], "yagiz_score": 8.6, "tugba_score": 8.5},
    {"album": "Lotus", "spotify_id": "16v3Ule2sTTWT37VKUsH6F", "date": "26.10.2025", "Yagiz": [4, 5, 1, 7, 8], "Tugba": [3, 1, 4, 5, 7], "yagiz_score": 8.0, "tugba_score": 7.9},
    {"album": "Woe", "spotify_id": "6X8cqvrWfIjRf09pfcLECo", "date": "02.11.2025", "Yagiz": [5, 2, 1, 6, 3], "Tugba": [5, 2, 1, 4, 6], "yagiz_score": 8.8, "tugba_score": 7.1},
    {"album": "Dünya Yalan Söylüyor", "spotify_id": "0QbpgPjg5eOU5ltJ05r4V7", "date": "09.11.2025", "Yagiz": [9, 2, 1, 3, 4], "Tugba": [3, 9, 2, 1, 5], "yagiz_score": 9.2, "tugba_score": 9.2},
    {"album": "In Contact", "spotify_id": "76ffWagOEq3L48KPzK1zIj", "date": "16.11.2025", "Yagiz": [9, 0, 4, 8, 10], "Tugba": [9, 0, 4, 6, 8], "yagiz_score": 8.9, "tugba_score": 8.6},
    {"album": "Without You I'm Nothing", "spotify_id": "4wxoPjHSYFYurNyKaEiZNT", "date": "30.11.2025", "Yagiz": [4, 7, 6, 1, 10], "Tugba": [4, 7, 0, 2, 6], "yagiz_score": 6.3, "tugba_score": 6.8},
    {"album": "Blood Covenant", "spotify_id": "07I7OdOJ8FvUch5y06hd2G", "date": "07.12.2025", "Yagiz": [9, 5, 0, 4, 3], "Tugba": [6, 3, 1, 0, 4], "yagiz_score": 7.9, "tugba_score": 7.7},
    {"album": "Turn on the Blind Lights", "spotify_id": "4sW8Eql2e2kdRP1A1R1clG", "date": "14.12.2025", "Yagiz": [9, 1, 6, 7, 2], "Tugba": [1, 10, 7, 3, 2], "yagiz_score": 6.6, "tugba_score": 8.5},
    {"album": "Keep it Quiet", "spotify_id": "7lP4sm3rKuo3nspTKSFO2T", "date": "21.12.2025", "Yagiz": [1, 2, 4, 8, 5], "Tugba": [1, 6, 3, 9, 5], "yagiz_score": 8.4, "tugba_score": 8.4},
    {"album": "Modern Primitive", "spotify_id": "2Mys40rXrG4GNkRDeJMZ88", "date": "28.12.2025", "Yagiz": [3, 0, 8, 4, 2], "Tugba": [3, 5, 4, 0, 8], "yagiz_score": 7.4, "tugba_score": 7.8},
    {"album": "Periphery II", "spotify_id": "6JfrPc1Vt7PHVd6B4dreQ7", "date": "04.01.2026", "Yagiz": [6, 1, 5, 0, 13], "Tugba": [5, 1, 6, 12, 9], "yagiz_score": 8.0, "tugba_score": 8.1},
    {"album": "Magma", "spotify_id": "7D7V6M05UIOTjLdqbwRX0w", "date": "11.01.2026", "Yagiz": [1, 5, 3, 7, 8], "Tugba": [3, 1, 5, 7, 2], "yagiz_score": 8.1, "tugba_score": 8.0},
    {"album": "The Purpose of the Moon", "spotify_id": "0HF4KKnrZvPb6a2kQuL4Um", "date": "17.02.2026", "Yagiz": [2, 7, 1, 10, 4], "Tugba": [7, 2, 1, 0, 4], "yagiz_score": 7.0, "tugba_score": 6.7},
    {"album": "Design Your Universe", "spotify_id": "4vqXD8pLD66LZm7p4Y7K05", "date": "22.02.2026", "Yagiz": [2, 12, 5, 4, 8], "Tugba": [2, 8, 4, 3, 12], "yagiz_score": 8.4, "tugba_score": 8.7},
    {"album": "I Guess It Was Nowhere", "spotify_id": "5ZKqJvhlH4v2pqO99lMiVY", "date": "27.02.2026", "Yagiz": [11, 8, 5, 7, 2], "Tugba": [8, 9, 11, 5, 6], "yagiz_score": 9.6, "tugba_score": 9.2},
    {"album": "I Let It In and It Took Everything", "spotify_id": "6nUUV3haj8ug8okTmOyIU2", "date": "07.03.2026", "Yagiz": [13, 7, 8, 11, 5], "Tugba": [13, 8, 7, 11, 3], "yagiz_score": 9.1, "tugba_score": 9.1},
    {"album": "silence outlives the earth", "spotify_id": "78YcVZNpzM357BBvAOKS6H", "date": "08.03.2026", "Yagiz": [5, 7, 2, 6, 3], "Tugba": [5, 7, 6, 2, 3], "yagiz_score": 9.3, "tugba_score": 9.3},
    {"album": "My Head Is an Animal", "spotify_id": "4p9dVvZDaZliSjTCbFRhJy", "date": "04.04.2026", "Yagiz": [5, 1, 7, 0, 2], "Tugba": [5, 1, 0, 7, 2], "yagiz_score": 6.7, "tugba_score": 7.8},
]


def login(client: httpx.Client, base_url: str, email: str, password: str) -> str:
    r = client.post(f"{base_url}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        print(f"  Login failed: {r.status_code} {r.text}")
        sys.exit(1)
    return r.json()["access_token"]


def seed_user(client: httpx.Client, base_url: str, token: str, top5_key: str, score_key: str) -> dict[int, datetime]:
    """Publishes all ratings and returns {rating_id: completed_at} for date back-fill."""
    headers = {"Authorization": f"Bearer {token}"}
    rating_dates: dict[int, datetime] = {}

    for entry in RANKINGS:
        album_name = entry["album"]
        completed_at = datetime.strptime(entry["date"], "%d.%m.%Y").replace(tzinfo=timezone.utc)

        # Import album (idempotent)
        r = client.get(f"{base_url}/albums/{entry['spotify_id']}", headers=headers)
        if r.status_code not in (200, 201):
            print(f"  SKIP import {album_name}: {r.status_code} {r.text}")
            continue
        album_id = r.json()["id"]

        # Skip if already rated
        r = client.get(f"{base_url}/ratings/me/{album_id}", headers=headers)
        if r.status_code == 200:
            print(f"  SKIP (already rated) {album_name}")
            continue

        # Create draft
        r = client.post(f"{base_url}/ratings", json={"album_id": album_id}, headers=headers)
        if r.status_code not in (200, 201):
            print(f"  SKIP create {album_name}: {r.status_code} {r.text}")
            continue
        rating_id = r.json()["id"]

        # Patch score + top 5.
        # Notebook indices are 0-based; DB uses Spotify track_number (1-based).
        top5 = [i + 1 for i in entry[top5_key]]
        r = client.patch(
            f"{base_url}/ratings/{rating_id}",
            json={"score": entry[score_key], "top_track_indices": top5},
            headers=headers,
        )
        if r.status_code != 200:
            print(f"  SKIP patch {album_name}: {r.status_code} {r.text}")
            continue

        # Publish
        r = client.post(f"{base_url}/ratings/{rating_id}/publish", headers=headers)
        if r.status_code != 200:
            print(f"  SKIP publish {album_name}: {r.status_code} {r.text}")
            continue

        rating_dates[rating_id] = completed_at
        print(f"  OK  {album_name}  ({entry['date']})")
        time.sleep(0.4)

    return rating_dates


def backfill_dates(database_url: str, rating_dates: dict[int, datetime]) -> None:
    engine = create_engine(database_url)
    with engine.begin() as conn:
        for rating_id, completed_at in rating_dates.items():
            conn.execute(
                text("UPDATE ratings SET completed_at = :ts, started_at = :ts WHERE id = :id"),
                {"ts": completed_at, "id": rating_id},
            )
    print(f"  Back-filled dates for {len(rating_dates)} ratings.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed historical ratings from album_ranking.ipynb")
    parser.add_argument("--base-url", default="https://albumania.onrender.com")
    parser.add_argument("--database-url", required=True, help="Neon connection string")
    parser.add_argument("--tugba-email", required=True)
    parser.add_argument("--tugba-password", required=True)
    parser.add_argument("--yagiz-email", default="")
    parser.add_argument("--yagiz-password", default="")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    with httpx.Client(timeout=60) as client:
        print(f"\nSeeding Tugba's ratings...")
        tugba_token = login(client, base_url, args.tugba_email, args.tugba_password)
        tugba_dates = seed_user(client, base_url, tugba_token, "Tugba", "tugba_score")

        print(f"\nBack-filling Tugba's dates...")
        backfill_dates(args.database_url, tugba_dates)

        if args.yagiz_email and args.yagiz_password:
            print(f"\nSeeding Yağız's ratings...")
            yagiz_token = login(client, base_url, args.yagiz_email, args.yagiz_password)
            yagiz_dates = seed_user(client, base_url, yagiz_token, "Yagiz", "yagiz_score")

            print(f"\nBack-filling Yağız's dates...")
            backfill_dates(args.database_url, yagiz_dates)

    print("\nDone.")


if __name__ == "__main__":
    main()
