import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthBadge } from "./health-badge";

describe("HealthBadge", () => {
  it.each([
    ["Active", "On track"],
    ["At Risk", "Needs attention"],
    ["Delayed", "At risk"],
    ["Completed", "Completed"],
  ] as const)("maps internal %s health to %s", (internalHealth, label) => {
    render(<HealthBadge value={internalHealth} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
