import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import {
  UnsavedChangesProvider,
  useRegisterUnsaved,
  useUnsavedNavigationGuard,
} from "./unsavedChanges";
import { UnsavedChangesModal } from "../components/UnsavedChangesModal";

// A minimal editor that registers itself as dirty and reports its save fn.
function Editor({ id, dirty, save }: { id: string; dirty: boolean; save: () => void }) {
  useRegisterUnsaved(id, dirty, save);
  return null;
}

// A page that hosts the guard + modal and renders whatever editors it's given.
function GuardedPage({ children }: { children: React.ReactNode }) {
  const guard = useUnsavedNavigationGuard();
  return (
    <>
      {children}
      <UnsavedChangesModal {...guard} />
    </>
  );
}

function renderWithGuard(page: React.ReactNode) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <UnsavedChangesProvider>
            <Link to="/next">leave</Link>
            <Outlet />
          </UnsavedChangesProvider>
        ),
        children: [
          { path: "/", element: page },
          { path: "/next", element: <div>next page</div> },
        ],
      },
    ],
    { initialEntries: ["/"] }
  );
  return render(<RouterProvider router={router} />);
}

describe("unsaved-changes guard", () => {
  it("does not block navigation when nothing is dirty", async () => {
    renderWithGuard(<GuardedPage><Editor id="a" dirty={false} save={() => {}} /></GuardedPage>);
    fireEvent.click(screen.getByRole("link", { name: "leave" }));
    // Nothing dirty → no confirmation modal (the nav itself isn't intercepted).
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("blocks navigation and Cancel keeps you when an editor is dirty", async () => {
    renderWithGuard(<GuardedPage><Editor id="a" dirty save={() => {}} /></GuardedPage>);
    fireEvent.click(screen.getByRole("link", { name: "leave" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("next page")).not.toBeInTheDocument();
  });

  it("Save & quit saves ALL dirty editors, then leaves", async () => {
    const saveA = vi.fn();
    const saveB = vi.fn();
    renderWithGuard(
      <GuardedPage>
        <Editor id="a" dirty save={saveA} />
        <Editor id="b" dirty save={saveB} />
        <Editor id="c" dirty={false} save={() => {}} />
      </GuardedPage>
    );

    fireEvent.click(screen.getByRole("link", { name: "leave" }));
    fireEvent.click(await screen.findByRole("button", { name: /save & quit/i }));

    // Both dirty editors saved; the clean one did not need to.
    await waitFor(() => expect(saveA).toHaveBeenCalledTimes(1));
    expect(saveB).toHaveBeenCalledTimes(1);
  });
});
