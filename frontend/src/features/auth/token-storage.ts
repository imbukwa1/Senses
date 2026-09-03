const AUTH_TOKEN_KEY = "senses.auth_token";

export function readStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function storeToken(token: string) {
  window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredToken() {
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
}
