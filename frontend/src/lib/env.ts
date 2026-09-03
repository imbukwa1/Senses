const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const env = {
  apiBaseUrl: apiBaseUrl && apiBaseUrl.trim().length > 0 ? apiBaseUrl : "http://localhost:8000",
} as const;
