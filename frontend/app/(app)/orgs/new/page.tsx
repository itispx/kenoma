"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { orgs } from "@/lib/api";
import { Field, inputClass, primaryBtn } from "@/components/auth-shell";
import { PageHeading } from "@/components/page-state";
export default function NewOrgPage() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const o = await orgs.create(name);
      router.push(`/orgs/${o.id}/projects`);
    } catch {
      setError("Could not create the organization.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-lg">
      <PageHeading eyebrow="Workspace" title="Create organization" />
      <form onSubmit={submit} className="surface-panel p-gutter-lg">
        <Field label="Name" error={error}>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </Field>
        <button disabled={busy} className={primaryBtn}>
          {busy ? "Creating…" : "Create organization"}
        </button>
      </form>
    </div>
  );
}
