"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { auth, ApiError } from "@/lib/api";
import {
  AuthShell,
  Field,
  primaryBtn,
  AuthLink,
  PasswordField,
} from "@/components/auth-shell";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthShell title="Invalid reset link" subtitle="This link is missing its token.">
        <div className="animate-stagger-in flex flex-col items-center gap-3 py-2 text-center">
          <XCircle className="h-8 w-8 text-signal-error" />
          <p className="text-sm text-signal-error">
            This password reset link looks incomplete. Request a new one below.
          </p>
        </div>
        <p className="mt-4 text-center text-sm text-console-400">
          <AuthLink href="/forgot-password">Request a new link</AuthLink>
        </p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Every device has been signed out for your security.">
        <div className="animate-stagger-in flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="h-8 w-8 text-signal-success" />
          <p className="text-sm text-console-200">Sign in with your new password to continue.</p>
        </div>
        <p className="mt-4 text-center text-sm text-console-400">
          <AuthLink href="/login">Go to sign in</AuthLink>
        </p>
      </AuthShell>
    );
  }

  const passwordError = !passwordTouched
    ? undefined
    : password === ""
      ? "Password is required."
      : password.length < 8
        ? "At least 8 characters."
        : undefined;
  const confirmError = !confirmTouched
    ? undefined
    : confirm === ""
      ? "Please confirm your password."
      : confirm !== password
        ? "Passwords don't match."
        : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordTouched(true);
    setConfirmTouched(true);
    if (password.length < 8 || password !== confirm) return;
    setSubmitting(true);
    try {
      await auth.confirmPasswordReset(token as string, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        toast.error("This reset link has expired", {
          description: "Reset links are only valid for an hour. Request a fresh one.",
          action: { label: "Request new link", onClick: () => router.push("/forgot-password") },
        });
      } else {
        toast.error("Couldn't reset your password", {
          description: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Pick something you haven't used here before.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field
          label="New password"
          hint={passwordError ? undefined : "At least 8 characters."}
          error={passwordError}
          errorId="reset-password-error"
        >
          <PasswordField
            required
            minLength={8}
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setPasswordTouched(true)}
            aria-invalid={!!passwordError}
            aria-describedby={passwordError ? "reset-password-error" : undefined}
            hasError={!!passwordError}
          />
        </Field>
        <Field label="Confirm password" error={confirmError} errorId="reset-confirm-error">
          <PasswordField
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setConfirmTouched(true)}
            aria-invalid={!!confirmError}
            aria-describedby={confirmError ? "reset-confirm-error" : undefined}
            hasError={!!confirmError}
          />
        </Field>
        <button type="submit" disabled={submitting} className={primaryBtn}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
