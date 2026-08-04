"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { auth, ApiError } from "@/lib/api";
import { isValidEmail } from "@/lib/validation";
import { AuthShell, Field, inputClass, inputErrorClass, primaryBtn, AuthLink } from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

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
      // The backend always responds 202 whether or not the email is
      // registered — this UI mirrors that by showing the same confirmation
      // either way, so it never reveals which emails have accounts.
      await auth.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      toast.error("Couldn't send reset link", {
        description: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="A reset link is on its way, if that account exists.">
        <div className="animate-stagger-in flex flex-col items-center gap-3 py-2 text-center">
          <MailCheck className="h-8 w-8 text-signal-info" />
          <p className="text-sm text-console-300">
            If an account exists for <span className="text-console-50">{email}</span>, we&apos;ve sent a link to
            reset the password. It expires in an hour.
          </p>
        </div>
        <p className="mt-4 text-center text-sm text-console-400">
          <AuthLink href="/login">Back to sign in</AuthLink>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to get back in.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" error={emailError} errorId="forgot-email-error">
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "forgot-email-error" : undefined}
            className={emailError ? inputErrorClass : inputClass}
          />
        </Field>
        <button type="submit" disabled={submitting} className={primaryBtn}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-4 text-sm text-console-400">
        Remembered it? <AuthLink href="/login">Sign in</AuthLink>
      </p>
    </AuthShell>
  );
}
