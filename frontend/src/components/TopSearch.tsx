import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchAlbums, type AlbumSearchResult } from "../api/albums";
import { searchArtists, type ArtistSearchResult } from "../api/artists";
import styles from "./TopSearch.module.css";

type Filter = "all" | "albums" | "artists";

type SearchHit =
  | { kind: "album"; album: AlbumSearchResult }
  | { kind: "artist"; artist: ArtistSearchResult };

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "albums", label: "Albums" },
  { value: "artists", label: "Artists" },
];

/**
 * How strongly a result's name matches the typed query — a lower number is a
 * better match. Spotify returns each type (artists, albums) already ranked by
 * its own relevance, but the two lists arrive separately; scoring on the name
 * lets us interleave them into one Spotify-like "most relevant first" list
 * instead of always showing every artist before every album.
 */
function matchTier(name: string, q: string): number {
  const n = name.trim().toLowerCase();
  if (n === q) return 0; // exact
  if (n.startsWith(q)) return 1; // prefix
  if (n.includes(q)) return 2; // contains
  return 3; // fuzzy / Spotify thought it relevant even without a substring hit
}

/**
 * Merge Spotify's separately-ranked artist + album lists into one relevance-
 * ordered list. Primary key: how well the name matches the query; tie-break:
 * each item's original position in its Spotify bucket (that bucket's own
 * relevance rank). A stable sort keeps that ordering within a tier.
 */
function mixByRelevance(
  q: string,
  artists: ArtistSearchResult[],
  albums: AlbumSearchResult[],
): SearchHit[] {
  const query = q.trim().toLowerCase();
  const scored = [
    ...artists.map((artist, rank) => ({
      hit: { kind: "artist" as const, artist },
      tier: matchTier(artist.name, query),
      rank,
    })),
    ...albums.map((album, rank) => ({
      hit: { kind: "album" as const, album },
      tier: matchTier(album.title, query),
      rank,
    })),
  ];
  scored.sort((a, b) => a.tier - b.tier || a.rank - b.rank);
  return scored.map((s) => s.hit);
}

export function TopSearch() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (!q) {
      setHits([]);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const wantAlbums = filter === "all" || filter === "albums";
        const wantArtists = filter === "all" || filter === "artists";
        const [albums, artists] = await Promise.all([
          wantAlbums ? searchAlbums(q) : Promise.resolve([]),
          wantArtists ? searchArtists(q) : Promise.resolve([]),
        ]);
        setHits(mixByRelevance(q, artists, albums));
      } catch {
        setError("Search failed. Please try again.");
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filter]);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function goTo(path: string) {
    setOpen(false);
    setQuery("");
    setHits([]);
    navigate(path);
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <input
        className={styles.input}
        type="search"
        placeholder="Search albums and artists…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        aria-label="Search albums and artists"
      />

      {showDropdown && (
        <div className={styles.panel}>
          <div className={styles.chips} role="tablist" aria-label="Search filter">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                className={`${styles.chip} ${filter === f.value ? styles.chipActive : ""}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading && <p className={styles.status}>Searching…</p>}
          {error && <p className={styles.error}>{error}</p>}
          {!loading && !error && hits.length === 0 && (
            <p className={styles.status}>No results.</p>
          )}

          {hits.length > 0 && (
            <ul className={styles.list} role="listbox">
              {hits.map((hit) =>
                hit.kind === "album" ? (
                  <li
                    key={`album-${hit.album.spotify_id}`}
                    className={styles.item}
                    role="option"
                    aria-selected={false}
                    tabIndex={0}
                    onClick={() => goTo(`/albums/${hit.album.spotify_id}`)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && goTo(`/albums/${hit.album.spotify_id}`)
                    }
                  >
                    {hit.album.album_art_url && (
                      <img
                        className={styles.art}
                        src={hit.album.album_art_url}
                        alt=""
                        width={40}
                        height={40}
                      />
                    )}
                    <span className={styles.info}>
                      <span className={styles.title}>{hit.album.title}</span>
                      <span className={styles.sub}>{hit.album.artist}</span>
                    </span>
                    <span className={styles.tag}>Album</span>
                  </li>
                ) : (
                  <li
                    key={`artist-${hit.artist.spotify_id}`}
                    className={styles.item}
                    role="option"
                    aria-selected={false}
                    tabIndex={0}
                    onClick={() => goTo(`/artists/${hit.artist.spotify_id}`)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && goTo(`/artists/${hit.artist.spotify_id}`)
                    }
                  >
                    {hit.artist.image_url && (
                      <img
                        className={`${styles.art} ${styles.artRound}`}
                        src={hit.artist.image_url}
                        alt=""
                        width={40}
                        height={40}
                      />
                    )}
                    <span className={styles.info}>
                      <span className={styles.title}>{hit.artist.name}</span>
                    </span>
                    <span className={styles.tag}>Artist</span>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
