import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";
import { updateMe } from "../api/users";

vi.mock("../api/auth", () => ({ changePassword: vi.fn(), resendVerification: vi.fn() }));
vi.mock("../api/users", () => ({ updateMe: vi.fn() }));

const refreshProfile = vi.fn();
const PROFILE = {
  username: "me",
  email: "me@x.com",
  email_verified: true,
  display_name: "Me",
  description: null,
  profile_visibility: "public" as const,
  profile_picture_url: null,
  created_at: "2024-01-01T00:00:00Z",
};
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ profile: PROFILE, refreshProfile }),
}));

function renderPage() {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateMe).mockResolvedValue({ ...PROFILE, profile_visibility: "friends" });
  });

  it("defaults to the Account tab and hides the password form", () => {
    renderPage();
    expect(screen.getByText("me@x.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change password/i })).not.toBeInTheDocument();
  });

  it("shows the password form only under the Security tab", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByRole("button", { name: /change password/i })).toBeInTheDocument();
  });

  it("saves profile visibility from the Privacy tab", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));

    // The visibility control is a custom dropdown (Select): open it, pick the option.
    fireEvent.click(screen.getByRole("button", { name: /who can see your dashboard/i }));
    fireEvent.click(screen.getByRole("button", { name: /friends only/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateMe).toHaveBeenCalledWith({ profile_visibility: "friends" });
      expect(refreshProfile).toHaveBeenCalled();
    });
  });
});
