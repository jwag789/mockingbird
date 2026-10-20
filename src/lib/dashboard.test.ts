import { describe, expect, it } from "vitest";
import { streak } from "./dashboard";

const today = new Date("2026-10-20T15:00:00Z");

describe("streak", () => {
  it("counts consecutive days ending today", () => {
    expect(streak(new Set(["2026-10-20", "2026-10-19", "2026-10-18", "2026-10-16"]), today)).toBe(3);
  });

  it("keeps yesterday's streak alive until today is over", () => {
    expect(streak(new Set(["2026-10-19", "2026-10-18"]), today)).toBe(2);
  });

  it("is zero after a missed day", () => {
    expect(streak(new Set(["2026-10-17"]), today)).toBe(0);
  });
});
