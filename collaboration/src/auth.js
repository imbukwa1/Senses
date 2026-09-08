import { createHmac, timingSafeEqual } from "node:crypto";

function base64urlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function signPayload(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function verifyAccessToken(token, secret, now = new Date()) {
  if (!token || !secret) {
    throw new Error("Invalid or expired credentials");
  }

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    throw new Error("Invalid or expired credentials");
  }

  const expected = signPayload(encodedPayload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error("Invalid or expired credentials");
  }

  const payload = JSON.parse(base64urlDecode(encodedPayload).toString("utf8"));
  const expiresAt = Number(payload.exp) * 1000;
  if (!payload.sub || !Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new Error("Invalid or expired credentials");
  }

  return String(payload.sub);
}
