import { describe, expect, it } from "vitest";
import { annotate, formatTime } from "./annotate";

const words = (text: string) => text.split(" ").map((w, i) => ({ w, s: i * 300, e: i * 300 + 250 }));
const flagged = (text: string, quotes: string[], key: "quote" | "filler" | "hedge") =>
  annotate(words(text), quotes)
    .filter((w) => w[key])
    .map((w) => w.w)
    .join(" ");

describe("annotate", () => {
  it("marks the words of a quote the scorer used, ignoring case and punctuation", () => {
    expect(flagged("So I rewrote the billing service in Go.", ["I rewrote the billing service"], "quote")).toBe(
      "I rewrote the billing service",
    );
  });

  it("ignores quotes too short to place reliably", () => {
    expect(flagged("I did it", ["did it"], "quote")).toBe("");
  });

  it("marks fillers, but not 'you know what'", () => {
    expect(flagged("Um, it was, you know, basically fine and you know what happened", [], "filler")).toBe(
      "Um, you know, basically",
    );
  });

  it("marks hedges", () => {
    expect(flagged("I think it probably worked, I'm not sure", [], "hedge")).toBe("I think probably not sure");
  });
});

describe("formatTime", () => {
  it("formats minutes and seconds", () => {
    expect(formatTime(65_400)).toBe("1:05");
    expect(formatTime(0)).toBe("0:00");
  });
});
