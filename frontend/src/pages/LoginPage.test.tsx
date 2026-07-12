import { AxiosError } from "axios";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";
import { login as loginRequest } from "../api/auth";

vi.mock("../api/auth", () => ({ login: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ login: vi.fn() }) }));

function axiosErrorWith(status: number, detail: string): AxiosError {
  return new AxiosError("Request failed", "ERR", undefined, undefined, {
    status,
    data: { detail },
    statusText: "",
    headers: {},
    config: {} as never,
  });
}

function renderPage() {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Email or username"), {
    target: { value: "me@x.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
  fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
}

describe("LoginPage error handling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the vague message on a 401 (bad credentials)", async () => {
    vi.mocked(loginRequest).mockRejectedValue(axiosErrorWith(401, "Invalid credentials"));
    renderPage();
    expect(await screen.findByText("Invalid login or password")).toBeInTheDocument();
  });

  it("surfaces the real reason on a non-401 error (server down)", async () => {
    vi.mocked(loginRequest).mockRejectedValue(
      axiosErrorWith(502, "Music service is temporarily unavailable"),
    );
    renderPage();
    expect(
      await screen.findByText("Music service is temporarily unavailable"),
    ).toBeInTheDocument();
  });
});
