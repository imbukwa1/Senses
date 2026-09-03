import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getMe, login as loginRequest, ApiError } from "./api";
import { clearStoredToken, readStoredToken, storeToken } from "./token-storage";
import type { AuthenticatedUser, LoginPayload } from "./types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

type AuthContextValue = {
  user: AuthenticatedUser | null;
  token: string | null;
  status: AuthStatus;
  sessionExpired: boolean;
  authError: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ME_QUERY_KEY = ["auth", "me"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearAuthState = useCallback(
    (expired: boolean) => {
      clearStoredToken();
      setToken(null);
      setSessionExpired(expired);
      queryClient.clear();
    },
    [queryClient],
  );

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => getMe(token ?? ""),
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      clearAuthState(true);
    }
  }, [clearAuthState, meQuery.error]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const tokenResponse = await loginRequest(payload);
      await queryClient.fetchQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: () => getMe(tokenResponse.access_token),
      });

      storeToken(tokenResponse.access_token);
      setToken(tokenResponse.access_token);
      setSessionExpired(false);
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    clearAuthState(false);
  }, [clearAuthState]);

  const status: AuthStatus = useMemo(() => {
    if (!token) {
      return "unauthenticated";
    }

    if (meQuery.isLoading || meQuery.isFetching) {
      return "loading";
    }

    if (meQuery.error) {
      return "error";
    }

    return meQuery.data ? "authenticated" : "unauthenticated";
  }, [meQuery.data, meQuery.error, meQuery.isFetching, meQuery.isLoading, token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data ?? null,
      token,
      status,
      sessionExpired,
      authError: meQuery.error ? "Unable to verify your session. Please try again." : null,
      login,
      logout,
    }),
    [login, logout, meQuery.data, meQuery.error, sessionExpired, status, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
