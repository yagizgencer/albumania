import { createContext, useContext, useEffect, useState } from "react";
import { FEATURES_DEFAULT, getFeatures, type Features } from "../api/features";

/**
 * Which optional features the backend has switched on.
 *
 * Exists so a feature can be disabled server-side without the UI rendering
 * empty shells of it. Currently that means the vs-Spotify comparison, which is
 * off because Spotify's Feb 2026 changes removed track popularity — but the
 * mechanism is deliberately general, and flipping the backend setting brings
 * every surface back with no frontend change.
 */
const FeaturesContext = createContext<Features>(FEATURES_DEFAULT);

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  // Starts disabled and turns on only once the backend confirms it, so a slow
  // or failed request degrades to "hidden" rather than to a broken panel.
  const [features, setFeatures] = useState<Features>(FEATURES_DEFAULT);

  useEffect(() => {
    let cancelled = false;
    getFeatures()
      .then((f) => !cancelled && setFeatures(f))
      .catch(() => {
        /* keep the safe default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>
  );
}

export function useFeatures(): Features {
  return useContext(FeaturesContext);
}
