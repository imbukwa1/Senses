import { describe, expect, it } from "vitest";

import { ApiError } from "@/features/auth/api";

import { userFacingErrorMessage } from "./api-errors";

describe("userFacingErrorMessage", () => {
  it("maps common API statuses to safe user-facing messages", () => {
    expect(userFacingErrorMessage(new ApiError("raw detail", 400))).toBe("Please check your request and try again.");
    expect(userFacingErrorMessage(new ApiError("raw detail", 401))).toBe("Your session has expired. Please sign in again.");
    expect(userFacingErrorMessage(new ApiError("raw detail", 403))).toBe("You do not have access to this resource.");
    expect(userFacingErrorMessage(new ApiError("raw detail", 404))).toBe("The requested record could not be found.");
    expect(userFacingErrorMessage(new ApiError("raw detail", 409))).toBe("This change conflicts with existing data.");
    expect(userFacingErrorMessage(new ApiError("raw detail", 413))).toBe("The selected file is too large.");
    expect(userFacingErrorMessage(new ApiError("raw detail", 422))).toBe("Please check your request and try again.");
    expect(userFacingErrorMessage(new ApiError("raw detail", 500))).toBe("The server is unavailable. Please try again shortly.");
  });

  it("uses context-specific messages without exposing backend detail", () => {
    expect(
      userFacingErrorMessage(new ApiError("database stack trace", 403), {
        forbidden: "You do not have access to this project.",
      }),
    ).toBe("You do not have access to this project.");
  });
});
