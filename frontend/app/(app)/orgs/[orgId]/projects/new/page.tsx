"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { projects } from "@/lib/api";
import { useOrg } from "@/components/org-context";
import { Field, inputClass, primaryBtn } from "@/components/auth-shell";
import { PageHeading } from "@/components/page-state";

export default function NewProjectPage() {
  const org = useOrg(),
    router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await projects.create(org.id, name);
      router.push(`/projects/${p.id}`);
    } catch {
      setError("Could not create the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeading eyebrow={org.name} title="Create project" />
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
        <button className={primaryBtn} disabled={busy}>
          {busy ? "Creating…" : "Create project"}
        </button>
      </form>
    </div>
  );
}
