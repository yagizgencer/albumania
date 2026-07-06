import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

// The AuthProvider makes a real /auth/refresh call on mount — stub it out.
vi.mock("./api/client", () => ({
  apiClient: {
    post: vi.fn().mockRejectedValue(new Error("no session")),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => null),
}));

describe("App", () => {
  it("shows the public landing with login + signup CTAs when unauthenticated", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByRole("heading", { name: /albumania/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /get started/i })).toBeInTheDocument();
  });
});
