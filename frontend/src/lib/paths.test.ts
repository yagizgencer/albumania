import { describe, expect, it } from "vitest";
import { comparePath, profilePath } from "./paths";

describe("profilePath", () => {
  it("leaves simple usernames unchanged", () => {
    expect(profilePath("alice")).toBe("/profile/alice");
  });

  it("encodes '#' so the path isn't truncated to a URL fragment", () => {
    // A raw "#" would make the browser drop everything after it, collapsing
    // the path to "/profile/" — the bug this helper fixes.
    expect(profilePath("#1interpol fan")).toBe("/profile/%231interpol%20fan");
  });

  it("encodes other unsafe characters", () => {
    expect(profilePath("a/b?c")).toBe("/profile/a%2Fb%3Fc");
  });
});

describe("comparePath", () => {
  it("builds the per-album compare route", () => {
    expect(comparePath("alice", "alb1")).toBe("/users/alice/compare/alb1");
  });

  it("encodes the username", () => {
    expect(comparePath("#1 fan", "alb1")).toBe("/users/%231%20fan/compare/alb1");
  });
});
