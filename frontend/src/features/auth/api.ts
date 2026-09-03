import { env } from "@/lib/env";

import type { AuthenticatedUser, LoginPayload, TokenResponse } from "./types";

const API_BASE_URL = env.apiBaseUrl.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function login(payload: LoginPayload): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getMe(token: string): Promise<AuthenticatedUser> {
  return apiRequest<AuthenticatedUser>("/me", {}, token);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const isFormData = init.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(await safeErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function safeErrorMessage(response: Response) {
  if (response.status === 401) {
    return "Invalid or expired credentials.";
  }

  if (response.status === 422) {
    return "Please check the form and try again.";
  }

  if (response.status >= 500) {
    return "The server is unavailable. Please try again shortly.";
  }

  return "The request could not be completed.";
}
