"use client";

import { useEffect, useState } from "react";
import { Clock, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { auth, ApiError } from "@/lib/api";
import { isValidEmail } from "@/lib/validation";
import {
  AuthShell,
  Field,
  inputClass,
  inputErrorClass,
  primaryBtn,
  secondaryBtn,
  AuthLink,
} from "@/components/auth-shell";

// Seconds before another link can be requested. Guards against double-sends
// and impatient retries; it is a UX cooldown, not a real limit, since the
// endpoint itself is still unthrottled.
const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!sent || cooldown <= 0) return;
    const id = setInterval(() => setCooldown((n) => n - 1), 1000);
    return () => clearInterval(id);
  }, [sent, cooldown]);

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
        description:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setResending(true);
    try {
      await auth.requestPasswordReset(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success("New link sent", {
        description: "Use the most recent email.",
      });
    } catch (err) {
      toast.error("Couldn't send a new link", {
        description:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setResending(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="A reset link is on its way, if that account exists."
      >
        <div className="animate-stagger-in flex flex-col items-center gap-4 py-2 text-center">
          <MailCheck className="h-8 w-8 text-signal-info" />
          <p className="text-sm text-console-300">
            If an account exists for{" "}
            <span className="text-console-50">{email}</span>, we&apos;ve sent a
            link to reset the password.
          </p>
          {/* The one time-critical fact on this screen, so it gets its own
              weight instead of trailing the sentence above. Warning hue rather
              than mint: a deadline is a warning, and mint stays reserved for
              the primary action. */}
          <div className="flex items-center gap-2 rounded-lg border border-signal-warning/40 bg-signal-warning/10 px-3 py-2">
            <Clock className="h-4 w-4 shrink-0 text-signal-warning" />
            <span className="text-xs font-medium uppercase tracking-wide text-signal-warning text-glow-warning">
              Expires in 1 hour
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onResend}
            disabled={cooldown > 0 || resending}
            className={secondaryBtn}
          >
            {resending
              ? "Sending…"
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : "Send a new link"}
          </button>
          <p className="text-center text-xs text-console-400">
            Sending a new link invalidates the previous one.
          </p>
        </div>

        <p className="mt-4 text-center text-sm text-console-400">
          <AuthLink href="/login">Back to sign in</AuthLink>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to get back in."
    >
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
