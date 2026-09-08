import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { univerReadiness } from "../src/config.js";
import { verifyAccessToken } from "../src/auth.js";
import { documentRoomName, parseDocumentRoom } from "../src/rooms.js";
import { parseDatabaseConfig } from "../src/store.js";

const SECRET = "test-collaboration-secret";

describe("SENSES token verification", () => {
  it("accepts the existing FastAPI token format", () => {
    const token = createToken("681523eb-e044-4cc2-9b96-ad005602ca4e");

    expect(verifyAccessToken(token, SECRET)).toBe("681523eb-e044-4cc2-9b96-ad005602ca4e");
  });

  it("rejects malformed, tampered, and expired tokens", () => {
    const valid = createToken("681523eb-e044-4cc2-9b96-ad005602ca4e");
    const expired = createToken("681523eb-e044-4cc2-9b96-ad005602ca4e", Math.floor(Date.now() / 1000) - 1);

    expect(() => verifyAccessToken("not-a-token", SECRET)).toThrow("Invalid or expired credentials");
    expect(() => verifyAccessToken(`${valid}x`, SECRET)).toThrow("Invalid or expired credentials");
    expect(() => verifyAccessToken(expired, SECRET)).toThrow("Invalid or expired credentials");
  });
});

describe("document room names", () => {
  it("uses explicit project-scoped document identities", () => {
    const projectId = "f7909627-b7d7-42f8-a7e7-2bc64b68fafb";
    const documentId = "6478989c-98b8-4e02-bcaf-4951e4d62be3";

    expect(documentRoomName(projectId, documentId)).toBe(`project:${projectId}:documents:${documentId}`);
    expect(parseDocumentRoom(`project:${projectId}:documents:${documentId}`)).toEqual({
      projectId,
      resourceId: documentId,
      resourceType: "document",
    });
  });

  it("rejects non-document and malformed room names", () => {
    expect(() => parseDocumentRoom("project:x:documents:y")).toThrow("Invalid document collaboration room");
    expect(() => parseDocumentRoom("project:f7909627-b7d7-42f8-a7e7-2bc64b68fafb:spreadsheets:6478989c-98b8-4e02-bcaf-4951e4d62be3")).toThrow(
      "Invalid document collaboration room",
    );
  });
});

describe("database configuration", () => {
  it("accepts existing SENSES database URLs with unescaped password characters", () => {
    expect(parseDatabaseConfig("postgresql://postgres:secret#value@localhost:5432/senses")).toMatchObject({
      user: "postgres",
      password: "secret#value",
      host: "localhost",
      port: 5432,
      database: "senses",
    });
  });
});

describe("Univer collaboration configuration", () => {
  it("requires the official service endpoint and health URL", () => {
    expect(univerReadiness({ univerEndpoint: "", univerHealthUrl: "" })).toEqual({
      configured: false,
      endpoint: null,
      healthUrl: null,
      required: ["UNIVER_COLLABORATION_ENDPOINT", "UNIVER_COLLABORATION_HEALTH_URL"],
    });

    expect(univerReadiness({ univerEndpoint: "https://univer.example.com", univerHealthUrl: "https://univer.example.com/health" })).toMatchObject({
      configured: true,
      endpoint: "https://univer.example.com",
      healthUrl: "https://univer.example.com/health",
    });
  });
});

function createToken(userId, exp = Math.floor(Date.now() / 1000) + 3600) {
  const payload = JSON.stringify({ sub: userId, email: "user@example.com", exp });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}
