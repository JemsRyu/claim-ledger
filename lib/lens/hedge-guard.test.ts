import { describe, it, expect } from "vitest";
import { guardHedge, hasHedgeToken } from "./hedge-guard";

describe("hasHedgeToken", () => {
  it("matches 'i think'", () => {
    expect(hasHedgeToken("Well, I think that's the case.")).toBe(true);
  });
  it("matches 'might'", () => {
    expect(hasHedgeToken("This might be the reason.")).toBe(true);
  });
  it("matches 'studies suggest' via 'suggest'", () => {
    expect(hasHedgeToken("Studies suggest that meditation helps.")).toBe(true);
  });
  it("matches 'seem' / 'seems' / 'seemed'", () => {
    expect(hasHedgeToken("It seems like a fair point.")).toBe(true);
    expect(hasHedgeToken("She seemed surprised.")).toBe(true);
  });
  it("matches 'tend to' but not 'tend' alone", () => {
    expect(hasHedgeToken("People tend to overestimate.")).toBe(true);
    expect(hasHedgeToken("They tend the garden well.")).toBe(false);
  });
  it("matches 'kind of' / 'sort of'", () => {
    expect(hasHedgeToken("It's kind of important.")).toBe(true);
    expect(hasHedgeToken("That's sort of the point.")).toBe(true);
  });
  it("does not match plain direct assertions", () => {
    expect(
      hasHedgeToken(
        "The only people who don't experience shame have no capacity for human empathy or connection.",
      ),
    ).toBe(false);
    expect(
      hasHedgeToken(
        "We are the most in-debt, obese, addicted and medicated adult cohort in U.S. history.",
      ),
    ).toBe(false);
    expect(
      hasHedgeToken("There was only one variable that separated them."),
    ).toBe(false);
  });
});

describe("guardHedge", () => {
  it("strips 'hedged' when matchedText has no hedge token", () => {
    expect(
      guardHedge(
        ["hedged"],
        "The only people who don't experience shame have no capacity for human empathy or connection.",
      ),
    ).toEqual([]);
  });

  it("keeps 'hedged' when matchedText contains a hedge token", () => {
    expect(
      guardHedge(["hedged"], "I think studies suggest meditation helps anxiety."),
    ).toEqual(["hedged"]);
  });

  it("returns flags unchanged when 'hedged' is not present", () => {
    expect(guardHedge(["unsourced", "vague-sourced"], "Some claim.")).toEqual([
      "unsourced",
      "vague-sourced",
    ]);
  });

  it("strips only 'hedged' while preserving other flags", () => {
    expect(guardHedge(["hedged", "unsourced"], "No hedge here.")).toEqual([
      "unsourced",
    ]);
  });

  it("returns the empty array unchanged", () => {
    expect(guardHedge([], "anything")).toEqual([]);
  });
});
