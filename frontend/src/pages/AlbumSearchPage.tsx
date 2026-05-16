import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchAlbums, type AlbumSearchResult } from "../api/albums";
import styles from "./AlbumSearchPage.module.css";

export function AlbumSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AlbumSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await searchAlbums(query.trim());
        setResults(data);
      } catch {
        setError("Search failed. Please try again.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(album: AlbumSearchResult) {
    navigate(`/albums/${album.spotify_id}`);
  }

  return (
    <div className={styles.page}>
      <h1>Search Albums</h1>
      <div className={styles.searchWrapper}>
        <input
          className={styles.input}
          type="search"
          placeholder="Artist, album name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search albums"
        />
        {loading && <p className={styles.status}>Searching…</p>}
        {error && <p className={styles.error}>{error}</p>}
        {results.length > 0 && (
          <ul className={styles.dropdown} role="listbox">
            {results.map((album) => (
              <li
                key={album.spotify_id}
                className={styles.item}
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(album)}
                onKeyDown={(e) => e.key === "Enter" && handleSelect(album)}
                tabIndex={0}
              >
                {album.album_art_url && (
                  <img
                    className={styles.art}
                    src={album.album_art_url}
                    alt=""
                    width={40}
                    height={40}
                  />
                )}
                <span className={styles.info}>
                  <span className={styles.title}>{album.title}</span>
                  <span className={styles.artist}>
                    {album.artist} · {album.release_date.slice(0, 4)} ·{" "}
                    {album.total_songs} tracks
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
