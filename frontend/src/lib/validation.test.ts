import { describe, expect, it } from "vitest";
import { usernameError, emailError } from "./validation";

describe("usernameError", () => {
  it("accepts valid usernames (letters, digits, . and _)", () => {
    expect(usernameError("alice")).toBeNull();
    expect(usernameError("a.b_c1")).toBeNull();
    expect(usernameError("a".repeat(20))).toBeNull();
  });

  it("returns null for empty input (no nagging before typing)", () => {
    expect(usernameError("")).toBeNull();
  });

  it("rejects too short / too long", () => {
    expect(usernameError("abc")).toMatch(/at least 5/);
    expect(usernameError("a".repeat(21))).toMatch(/under 20/);
  });

  it("rejects spaces and symbols", () => {
    expect(usernameError("has space")).toMatch(/letters, numbers/);
    expect(usernameError("bad!name")).toMatch(/letters, numbers/);
    expect(usernameError("at@sign")).toMatch(/letters, numbers/);
  });
});

describe("emailError", () => {
  it("accepts a normal email", () => {
    expect(emailError("a@b.com")).toBeNull();
  });

  it("rejects malformed emails", () => {
    expect(emailError("notanemail")).toMatch(/valid email/);
    expect(emailError("no@domain")).toMatch(/valid email/);
    expect(emailError("with space@x.com")).toMatch(/valid email/);
  });
});
