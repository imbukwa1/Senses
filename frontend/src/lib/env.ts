const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const normalizedApiBaseUrl = apiBaseUrl?.trim().replace(/\/+$/, "");

if (!normalizedApiBaseUrl && import.meta.env.PROD) {
  throw new Error("VITE_API_BASE_URL is required for production builds.");
}

export const env = {
  apiBaseUrl: normalizedApiBaseUrl || (import.meta.env.DEV ? "http://localhost:8000" : ""),
} as const;
