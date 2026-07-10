import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfilePage } from "./ProfilePage";
import { UnsavedChangesProvider } from "../lib/unsavedChanges";
import { getUser } from "../api/users";
import { listFriendships } from "../api/friendships";

vi.mock("../api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/users")>()),
  getUser: vi.fn(),
  updateMe: vi.fn(),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
}));
vi.mock("../api/friendships", () => ({
  listFriendships: vi.fn(),
  acceptFriendship: vi.fn(),
  declineFriendship: vi.fn(),
  deleteFriendship: vi.fn(),
  sendFriendRequest: vi.fn(),
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ username: "me", refreshProfile: vi.fn() }),
}));

// Stub the two dashboards so we can assert *which* one renders (and, for the
// comparison, which source it got) without pulling in chart/table machinery.
vi.mock("./ProfileDashboardPage", () => ({
  // The "Compare with" combobox is passed down as `compareSlot` and rendered in
  // the controls box, so surface it here for the interaction test.
  ProfileDashboard: ({ compareSlot }: { compareSlot?: React.ReactNode }) => (
    <div data-testid="solo-dashboard">{compareSlot}</div>
  ),
}));
vi.mock("./FriendDashboardPage", () => ({
  FriendDashboard: ({ source }: { source: unknown }) => (
    <div data-testid="pair-dashboard">{JSON.stringify(source)}</div>
  ),
}));

const ME = {
  username: "me",
  email: "me@x.com",
  email_verified: true,
  display_name: "Me",
  description: null,
  profile_visibility: "public" as const,
  profile_picture_url: null,
  created_at: "2025-01-01T00:00:00Z",
};

function friendship(id: number, other: string) {
  return {
    id,
    user_a_username: "me",
    user_b_username: other,
    user_a_picture_url: null,
    user_b_picture_url: null,
    user_a_visibility: "public" as const,
    user_b_visibility: "public" as const,
    status: "accepted" as const,
    requested_by: "me",
    requested_by_picture_url: null,
    created_at: "",
    accepted_at: "",
  };
}

function renderProfile(username: string) {
  // Data router (createMemoryRouter) + provider: ProfilePage's unsaved-bio guard
  // uses useBlocker, which requires a data router.
  const router = createMemoryRouter(
    [{ path: "/profile/:username", element: <ProfilePage /> }],
    { initialEntries: [`/profile/${username}`] }
  );
  return render(
    <UnsavedChangesProvider>
      <RouterProvider router={router} />
    </UnsavedChangesProvider>
  );
}

describe("ProfilePage — owner 'Compare with' combobox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(getUser).mockResolvedValue(ME);
  });

  it("renders the friend comparison after picking a friend on my own profile", async () => {
    vi.mocked(listFriendships).mockResolvedValue({
      incoming: [],
      outgoing: [],
      accepted: [friendship(7, "bob")],
    });

    renderProfile("me");

    // Solo dashboard shows by default.
    expect(await screen.findByTestId("solo-dashboard")).toBeInTheDocument();

    // Open the combobox and pick bob.
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /bob/i }));

    // Now the pair dashboard renders, driven by bob's friendship id (7).
    const pair = await screen.findByTestId("pair-dashboard");
    expect(pair).toHaveTextContent(
      JSON.stringify({ kind: "friendship", friendshipId: 7 })
    );
    expect(screen.queryByTestId("solo-dashboard")).not.toBeInTheDocument();
  });

  it("keeps the solo dashboard when a stale friendship id no longer exists", async () => {
    // Persisted selection points at a friendship the user no longer has.
    sessionStorage.setItem(
      "dash:compare:me",
      JSON.stringify({ kind: "friendship", friendshipId: 999 })
    );
    vi.mocked(listFriendships).mockResolvedValue({
      incoming: [],
      outgoing: [],
      accepted: [friendship(7, "bob")],
    });

    renderProfile("me");

    // The stale id is reconciled away → solo dashboard, no pair dashboard.
    expect(await screen.findByTestId("solo-dashboard")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("pair-dashboard")).not.toBeInTheDocument()
    );
  });
});
