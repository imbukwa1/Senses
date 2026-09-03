import { Navigate, useLocation } from "react-router-dom";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";

import { useAuth } from "./auth-provider";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { authError, sessionExpired, status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <LoadingState label="Checking your session" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <ErrorState title="Session check failed" message={authError ?? "Unable to verify your session."} />
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <Navigate
        replace
        to="/login"
        state={{
          from: location,
          reason: sessionExpired ? "expired" : "auth-required",
        }}
      />
    );
  }

  return children;
}
