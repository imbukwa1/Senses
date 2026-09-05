import { describe, expect, it } from "vitest";

import { navigationItems } from "./nav-items";

describe("primary navigation", () => {
  it("exposes exactly the MVP navigation items in order", () => {
    expect(navigationItems.map((item) => item.label)).toEqual(["Home", "Projects", "Attention", "My Work"]);
    expect(navigationItems.map((item) => item.to)).toEqual(["/", "/projects", "/attention", "/my-work"]);
  });

  it("does not expose secondary areas as top-level navigation", () => {
    expect(navigationItems.map((item) => item.label)).not.toEqual(
      expect.arrayContaining(["Phases", "Tasks", "People", "Files", "Budget", "Search", "Audit"]),
    );
  });
});
