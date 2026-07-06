import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";

/**
 * An app-wide registry of "editors with unsaved changes". Any editor (a comment
 * composer, the bio form, the rating editor, …) registers a stable id, whether it's
 * dirty, and how to save itself. A page-level guard blocks navigation while
 * anything is dirty and offers Save & quit / Quit without saving / Cancel.
 *
 * "Save" saves ALL currently-dirty editors on the page — e.g. two edited comments
 * plus a new one are all posted together.
 */

interface Entry {
  dirty: boolean;
  save: () => Promise<void> | void;
}

interface Registry {
  register: (id: string, entry: Entry) => void;
  unregister: (id: string) => void;
  dirtyCount: number;
  saveAll: () => Promise<void>;
}

const UnsavedChangesContext = createContext<Registry | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const entries = useRef<Map<string, Entry>>(new Map());
  const [dirtyCount, setDirtyCount] = useState(0);

  const recount = useCallback(() => {
    let n = 0;
    for (const e of entries.current.values()) if (e.dirty) n++;
    setDirtyCount(n);
  }, []);

  const register = useCallback(
    (id: string, entry: Entry) => {
      entries.current.set(id, entry);
      recount();
    },
    [recount]
  );

  const unregister = useCallback(
    (id: string) => {
      entries.current.delete(id);
      recount();
    },
    [recount]
  );

  const saveAll = useCallback(async () => {
    // Snapshot the dirty editors' save fns, then run them all.
    const saves = [...entries.current.values()].filter((e) => e.dirty).map((e) => e.save);
    await Promise.all(saves.map((s) => s()));
  }, []);

  const value = useMemo<Registry>(
    () => ({ register, unregister, dirtyCount, saveAll }),
    [register, unregister, dirtyCount, saveAll]
  );
  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

// A no-op registry used when no provider is mounted (e.g. isolated component
// tests). Editors registering into it simply aren't guarded — they never crash.
const NOOP_REGISTRY: Registry = {
  register: () => {},
  unregister: () => {},
  dirtyCount: 0,
  saveAll: async () => {},
};

function useRegistry(): Registry {
  return useContext(UnsavedChangesContext) ?? NOOP_REGISTRY;
}

/**
 * Register an editor with the unsaved-changes registry. Pass a stable `id` (e.g.
 * from useId), the current dirtiness, and a `save` callback. The registry is kept
 * up to date and the entry is removed on unmount so a gone editor can't block.
 */
export function useRegisterUnsaved(
  id: string,
  dirty: boolean,
  save: () => Promise<void> | void
): void {
  const { register, unregister } = useRegistry();
  // Keep the latest save closure without re-registering every render.
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    register(id, { dirty, save: () => saveRef.current() });
  }, [id, dirty, register]);

  useEffect(() => {
    return () => unregister(id);
  }, [id, unregister]);
}

/** Whether any registered editor currently has unsaved changes. */
export function useHasUnsaved(): boolean {
  return useRegistry().dirtyCount > 0;
}

/**
 * Page-level navigation guard. Blocks in-app navigation (returns a react-router
 * blocker to drive the confirmation modal) and warns on tab-close/refresh while
 * anything is dirty. Also exposes `saveAll` for the modal's "Save & quit". Requires
 * a data router (see App.tsx).
 */
export function useUnsavedNavigationGuard() {
  const { dirtyCount, saveAll } = useRegistry();
  const hasUnsaved = dirtyCount > 0;

  useBeforeUnload(
    useCallback(
      (e: BeforeUnloadEvent) => {
        if (hasUnsaved) e.preventDefault();
      },
      [hasUnsaved]
    )
  );

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        hasUnsaved && currentLocation.pathname !== nextLocation.pathname,
      [hasUnsaved]
    )
  );

  return { blocker, saveAll };
}
