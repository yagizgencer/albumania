"""Upload static brand assets (the logo) to object storage.

Run from backend/:
    uv run python scripts/upload_brand_assets.py

Emails reference the logo by its storage public URL (see app/services/email.py
BRAND_LOGO_KEY), so it must exist in the bucket. Re-run this after changing the
logo or when setting up a new environment. Idempotent — it overwrites the key.

Requires STORAGE_BACKEND=r2 (with R2_* settings) in the environment; with the
local backend it just writes into static/ which isn't reachable by email, so
run it against the same storage your emails use (prod/staging R2).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.email import BRAND_LOGO_KEY
from app.services.storage import get_storage

# frontend/public/albumania_icon.png relative to the repo root.
_LOGO_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "albumania_icon.png"


def main() -> None:
    if not _LOGO_PATH.exists():
        raise SystemExit(f"Logo not found at {_LOGO_PATH}")
    data = _LOGO_PATH.read_bytes()
    storage = get_storage()
    url = storage.save(BRAND_LOGO_KEY, data, "image/png")
    print(f"Uploaded {_LOGO_PATH.name} ({len(data)} bytes) → {url}")


if __name__ == "__main__":
    main()
