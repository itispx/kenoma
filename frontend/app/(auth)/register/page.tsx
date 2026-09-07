"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const nameError =
    nameTouched && name.trim() === "" ? "Name is required." : undefined;
  const emailError = !emailTouched
    ? undefined
    : email === ""
      ? "Email is required."
      : !isValidEmail(email)
        ? "Enter a valid email address."
        : undefined;
  const passwordError = !passwordTouched
    ? undefined
    : password === ""
      ? "Password is required."
      : password.length < 8
        ? "At least 8 characters."
        : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameTouched(true);
    setEmailTouched(true);
    setPasswordTouched(true);
    if (name.trim() === "" || !isValidEmail(email) || password.length < 8)
      return;
    setSubmitting(true);
    try {
      await register(email, password, name);
      toast.success("Welcome to Kenoma");
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("That email is already registered", {
          description:
            "Sign in instead, or reset your password if you've forgotten it.",
          action: { label: "Sign in", onClick: () => router.push("/login") },
        });
      } else {
        toast.error("Couldn't create your account", {
          description:
            err instanceof ApiError
              ? err.message
              : "Something went wrong. Please try again.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up your workspace in under a minute."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" error={nameError} errorId="register-name-error">
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? "register-name-error" : undefined}
            className={nameError ? inputErrorClass : inputClass}
          />
        </Field>
        <Field label="Email" error={emailError} errorId="register-email-error">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "register-email-error" : undefined}
            className={emailError ? inputErrorClass : inputClass}
          />
        </Field>
        <Field
          label="Password"
          hint={passwordError ? undefined : "At least 8 characters."}
          error={passwordError}
          errorId="register-password-error"
        >
          <PasswordField
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setPasswordTouched(true)}
            aria-invalid={!!passwordError}
            aria-describedby={
              passwordError ? "register-password-error" : undefined
            }
            hasError={!!passwordError}
          />
        </Field>
        <button type="submit" disabled={submitting} className={primaryBtn}>
          {submitting ? "Creating your account…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-console-400">
        Already have an account? <AuthLink href="/login">Sign in</AuthLink>
      </p>
    </AuthShell>
  );
}
