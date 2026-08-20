import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiClient,
  refreshAccessToken,
  setAccessToken,
  setOnAuthFailure,
} from "./client";

/**
 * The refresh path is shared by every request in the app, so its concurrency
 * behaviour matters more than any single endpoint's.
 */
describe("silent refresh", () => {
  beforeEach(() => {
    setAccessToken(null);
    setOnAuthFailure(null);
    vi.restoreAllMocks();
  });

  it("collapses concurrent refreshes into a single request", async () => {
    // Pages fire several requests at once (the album page fires six). When the
    // access token has expired they all 401 together, and without a single-flight
    // guard each one independently POSTs /auth/refresh.
    let resolveRefresh: (value: unknown) => void = () => {};
    const post = vi.spyOn(apiClient, "post").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        })
    );

    const calls = [
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ];

    expect(post).toHaveBeenCalledTimes(1);

    resolveRefresh({ data: { access_token: "fresh-token" } });
    const tokens = await Promise.all(calls);

    expect(tokens).toEqual([
      "fresh-token",
      "fresh-token",
      "fresh-token",
      "fresh-token",
    ]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("allows a new refresh after the previous one settles", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { access_token: "t" } } as never);

    await refreshAccessToken();
    await refreshAccessToken();

    // The guard must clear itself, or the session could never be renewed again.
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("notifies the auth handler when the refresh fails", async () => {
    // Otherwise the app keeps rendering as logged-in against a dead session and
    // the notification poller retries a doomed refresh forever.
    vi.spyOn(apiClient, "post").mockRejectedValue(new Error("401"));
    const onFailure = vi.fn();
    setOnAuthFailure(onFailure);

    await expect(refreshAccessToken()).rejects.toThrow();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
