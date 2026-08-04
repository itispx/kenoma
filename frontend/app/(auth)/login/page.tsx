"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import { ApiError } from "@/lib/api";
import { isValidEmail } from "@/lib/validation";
import {
  AuthShell,
  Field,
  inputClass,
  inputErrorClass,
  primaryBtn,
  AuthLink,
  PasswordField,
} from "@/components/auth-shell";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const emailError = !emailTouched
    ? undefined
    : email === ""
      ? "Email is required."
      : !isValidEmail(email)
        ? "Enter a valid email address."
        : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailTouched(true);
    if (!isValidEmail(email)) return;
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(searchParams.get("next") ?? "/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error("Couldn't sign in", {
          description: "Double-check your email and password.",
          action: { label: "Reset password", onClick: () => router.push("/forgot-password") },
        });
      } else {
        toast.error("Couldn't sign in", {
          description: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" error={emailError} errorId="login-email-error">
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "login-email-error" : undefined}
            className={emailError ? inputErrorClass : inputClass}
          />
        </Field>
        <Field label="Password">
          <PasswordField
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex justify-end">
            <AuthLink href="/forgot-password">Forgot password?</AuthLink>
          </div>
        </Field>
        <button type="submit" disabled={submitting} className={primaryBtn}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-console-400">
        New here? <AuthLink href="/register">Create an account</AuthLink>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
