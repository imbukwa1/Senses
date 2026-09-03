import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { InlineErrorMessage } from "@/components/common/error-state";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userFacingErrorMessage } from "@/lib/api-errors";

import { ApiError } from "./api";
import { loginSchema, type LoginFormValues } from "./schemas";
import { useAuth } from "./auth-provider";

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);

    try {
      await login(values);
      onSuccess();
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(
          userFacingErrorMessage(error, {
            unauthenticated: "Invalid email or password.",
            validation: "Please check your email and password and try again.",
          }),
        );
        return;
      }

      setFormError(userFacingErrorMessage(error instanceof Error ? error : null));
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit(onSubmit)}>
      {formError ? <InlineErrorMessage message={formError} /> : null}
      <FormField label="Email" error={errors.email?.message} required>
        {({ describedBy, id, invalid }) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            placeholder="name@senseshub.com"
            {...register("email")}
          />
        )}
      </FormField>
      <FormField label="Password" error={errors.password?.message} required>
        {({ describedBy, id, invalid }) => (
          <div className="relative">
            <Input
              id={id}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="pr-11"
              {...register("password")}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
        )}
      </FormField>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          "Signing in..."
        ) : (
          <>
            <LogIn className="size-4" aria-hidden="true" />
            Sign In
          </>
        )}
      </Button>
    </form>
  );
}
