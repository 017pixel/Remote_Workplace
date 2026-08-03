import { describe, expect, it } from "vitest";
import { rankEmbeddingCandidates } from "./vector-search.js";

describe("rankEmbeddingCandidates", () => {
  it("ranks valid vectors in a worker and ignores corrupt candidates", async () => {
    const ranked = await rankEmbeddingCandidates(
      [1, 0],
      [
        { id: "orthogonal", vectorJson: "[0,1]" },
        { id: "best", vectorJson: "[1,0]" },
        { id: "near", vectorJson: "[0.8,0.2]" },
        { id: "corrupt", vectorJson: "{no-json" },
        { id: "wrong-dimension", vectorJson: "[1,0,0]" },
      ],
      3,
    );
    expect(ranked).toEqual(["best", "near", "orthogonal"]);
  });
});
