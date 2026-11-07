import { describe, expect, it } from "vitest";
import { hasValidHolidayModuleSelection } from "@/lib/holiday-program";

describe("holiday program application module selection", () => {
  it("allows applications when a period has no modules assigned", () => {
    expect(hasValidHolidayModuleSelection(0, 0)).toBe(true);
  });

  it("requires a module selection when modules are available", () => {
    expect(hasValidHolidayModuleSelection(2, 0)).toBe(false);
    expect(hasValidHolidayModuleSelection(2, 1)).toBe(true);
  });
});
