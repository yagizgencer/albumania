import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrendingBox } from "./TrendingBox";
import type { TrendingPeriod } from "../api/home";

interface Row {
  rank: number;
  id: string;
  label: string;
}

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ rank: i + 1, id: `r${i}`, label: `Item ${i + 1}` }));
}

function renderBox(fetchItems: (p: TrendingPeriod) => Promise<Row[]>) {
  render(
    <MemoryRouter>
      <TrendingBox
        title="Trending Test"
        fetchItems={fetchItems}
        keyOf={(r) => r.id}
        renderRow={(r) => <span>{r.label}</span>}
      />
    </MemoryRouter>
  );
}

describe("TrendingBox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders all rows inside the compact scroll list (no show-all button)", async () => {
    const fetchItems = vi.fn().mockResolvedValue(makeRows(8));
    renderBox(fetchItems);

    expect(await screen.findByText("Item 1")).toBeInTheDocument();
    // All rows are present in the DOM; the box just scrolls internally.
    expect(screen.getByText("Item 8")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show all/i })).not.toBeInTheDocument();
  });

  it("re-fetches with the selected period", async () => {
    const fetchItems = vi.fn().mockResolvedValue(makeRows(3));
    renderBox(fetchItems);
    await screen.findByText("Item 1");
    expect(fetchItems).toHaveBeenCalledWith("all"); // default

    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    await waitFor(() => expect(fetchItems).toHaveBeenCalledWith("week"));
  });
});
