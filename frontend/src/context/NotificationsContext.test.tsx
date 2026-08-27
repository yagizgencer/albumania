import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsProvider, useNotifications } from "./NotificationsContext";
import { getNotificationSummary } from "../api/notifications";

vi.mock("../api/notifications", () => ({
  getNotificationSummary: vi.fn(),
  markSeen: vi.fn(),
}));
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ username: "alice" }),
}));

const mockSummary = vi.mocked(getNotificationSummary);

function summary(bell: number) {
  return { bell, listen_invites: 0, friend_requests: bell };
}

/** Renders the counter the pages subscribe to, so a bump is observable. */
function Probe() {
  const { version, summary } = useNotifications();
  return <div data-testid="probe">{`${version}:${summary.bell}`}</div>;
}

function renderProbe() {
  return render(
    <NotificationsProvider>
      <Probe />
    </NotificationsProvider>
  );
}

function probeText() {
  return screen.getByTestId("probe").textContent;
}

/** Let the in-flight summary promise resolve and React re-render. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockSummary.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NotificationsProvider", () => {
  it("polls again while the tab is visible", async () => {
    mockSummary.mockResolvedValue(summary(0));
    renderProbe();
    await settle();
    expect(mockSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(25_000);
    });
    await settle();
    expect(mockSummary).toHaveBeenCalledTimes(2);
  });

  it("bumps version when a new notification arrives", async () => {
    mockSummary.mockResolvedValueOnce(summary(0)).mockResolvedValueOnce(summary(1));
    renderProbe();
    await settle();
    expect(probeText()).toBe("0:0");

    await act(async () => {
      vi.advanceTimersByTime(25_000);
    });
    await settle();
    expect(probeText()).toBe("1:1");
  });

  it("does not bump version when the count only drops", async () => {
    mockSummary.mockResolvedValueOnce(summary(2)).mockResolvedValueOnce(summary(1));
    renderProbe();
    await settle();
    // First load counts as an arrival: 0 → 2.
    expect(probeText()).toBe("1:2");

    await act(async () => {
      vi.advanceTimersByTime(25_000);
    });
    await settle();
    // 2 → 1 is the user dismissing things, not news. Version must hold.
    expect(probeText()).toBe("1:1");
  });

  it("does not bump version when the count is unchanged", async () => {
    mockSummary.mockResolvedValue(summary(3));
    renderProbe();
    await settle();
    expect(probeText()).toBe("1:3");

    await act(async () => {
      vi.advanceTimersByTime(25_000);
    });
    await settle();
    expect(probeText()).toBe("1:3");
  });
});
