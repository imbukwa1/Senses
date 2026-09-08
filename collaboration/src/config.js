import dotenv from "dotenv";

dotenv.config({ path: process.env.COLLABORATION_ENV_FILE || "../Backend/.env" });
dotenv.config();

export function loadConfig(env = process.env) {
  return {
    authTokenSecret: env.AUTH_TOKEN_SECRET || "",
    databaseUrl: env.COLLABORATION_DATABASE_URL || env.DATABASE_URL || "",
    documentPort: Number(env.DOCUMENT_COLLABORATION_PORT || 1234),
    documentPath: env.DOCUMENT_COLLABORATION_PATH || "/documents",
    host: env.DOCUMENT_COLLABORATION_HOST || "127.0.0.1",
    sharedCoordinationUrl: env.SHARED_COORDINATION_URL || "",
    univerEndpoint: env.UNIVER_COLLABORATION_ENDPOINT || "",
    univerHealthUrl: env.UNIVER_COLLABORATION_HEALTH_URL || "",
  };
}

export function validateDocumentConfig(config) {
  const missing = [];
  if (!config.authTokenSecret) {
    missing.push("AUTH_TOKEN_SECRET");
  }
  if (!config.databaseUrl) {
    missing.push("DATABASE_URL or COLLABORATION_DATABASE_URL");
  }
  if (!Number.isInteger(config.documentPort) || config.documentPort <= 0) {
    missing.push("DOCUMENT_COLLABORATION_PORT");
  }
  return missing;
}

export function univerReadiness(config) {
  return {
    configured: Boolean(config.univerEndpoint),
    endpoint: config.univerEndpoint || null,
    healthUrl: config.univerHealthUrl || null,
    required: ["UNIVER_COLLABORATION_ENDPOINT", "UNIVER_COLLABORATION_HEALTH_URL"],
  };
}
