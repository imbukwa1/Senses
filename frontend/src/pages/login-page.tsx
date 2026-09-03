import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { LoadingState } from "@/components/common/loading-state";
import logoUrl from "@/assets/logo.svg";
import { LoginForm } from "@/features/auth/login-form";
import { useAuth } from "@/features/auth/auth-provider";

type LoginLocationState = {
  from?: {
    pathname?: string;
  };
  reason?: "auth-required" | "expired";
};

export function LoginPage() {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LoginLocationState | null;
  const redirectTo = state?.from?.pathname && state.from.pathname !== "/login" ? state.from.pathname : "/";

  if (status === "authenticated") {
    return <Navigate replace to={redirectTo} />;
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <LoadingState label="Checking your session" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-[420px] rounded-lg border bg-surface p-7 shadow-soft sm:p-8" aria-labelledby="login-title">
        <div className="mb-7 flex flex-col items-center text-center">
          <img src={logoUrl} alt="SENSES logo" className="mb-3 size-14 object-contain" />
          <p className="text-sm font-semibold text-foreground">Senses Hub</p>
          <h1 id="login-title" className="mt-5 text-2xl font-semibold text-foreground">
            Sign in to SPMS
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Use your SENSES account to continue.</p>
        </div>
        {state?.reason === "expired" ? (
          <div className="mb-5 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm font-medium text-foreground" role="status">
            Your session expired. Sign in again to continue.
          </div>
        ) : null}
        <LoginForm onSuccess={() => navigate(redirectTo, { replace: true })} />
      </section>
    </main>
  );
}
