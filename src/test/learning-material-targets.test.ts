import { describe, expect, it } from "vitest";
import { filterMaterialsForLevel } from "@/lib/learning-materials";

describe("learning material level targeting", () => {
  const materials = [
    { id: "legacy", level_ids: null },
    { id: "level-one", level_ids: ["level-1"] },
    { id: "level-two", level_ids: ["level-2"] },
  ];

  it("shows legacy materials and only materials assigned to the selected level", () => {
    expect(filterMaterialsForLevel(materials, "level-1").map(({ id }) => id)).toEqual([
      "legacy",
      "level-one",
    ]);
  });

  it("hides level-targeted materials when the student has no selected level", () => {
    expect(filterMaterialsForLevel(materials, null).map(({ id }) => id)).toEqual(["legacy"]);
  });
});
