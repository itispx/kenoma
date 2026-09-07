"use client";

import { useState } from "react";
import { notFound } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";

// Unlinked bench for the select vocabulary. Nothing in the product uses the
// grouped, multiple, or searchable variants yet, so this is where they stay
// exercisable — and it never reaches a user.

type Option = { value: string; label: string };

const states: Option[] = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "imported", label: "Imported" },
];

const permissionGroups = [
  { value: "Documents", items: ["docs:import", "docs:edit", "docs:export"] },
  {
    value: "Review",
    items: ["docs:submit_review", "docs:review", "docs:approve"],
  },
  { value: "Administration", items: ["docs:manage_comments", "docs:manage"] },
];

const reviewers: Option[] = [
  { value: "ana", label: "Ana Ferreira" },
  { value: "bruno", label: "Bruno Costa" },
  { value: "carla", label: "Carla Nunes" },
  { value: "diego", label: "Diego Alves" },
  { value: "elena", label: "Elena Marques" },
  { value: "felipe", label: "Felipe Rocha" },
  { value: "gabriela", label: "Gabriela Pinto" },
  { value: "henrique", label: "Henrique Dias" },
];

const projectGroups = [
  { value: "Active", items: [reviewers[0], reviewers[1], reviewers[2]] },
  { value: "Archived", items: [reviewers[3], reviewers[4]] },
];

function Bench({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel p-gutter-lg">
      <h2 className="text-sm font-semibold text-console-50">{title}</h2>
      <p className="mt-1 mb-4 text-xs text-console-400">{note}</p>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

export default function SelectBenchPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SelectBench />;
}

function SelectBench() {
  const [single, setSingle] = useState<string | null>(null);
  const [dense, setDense] = useState<string>("draft");
  const [grouped, setGrouped] = useState<string | null>(null);
  const [many, setMany] = useState<string[]>([]);
  const [reviewer, setReviewer] = useState<Option | null>(null);
  const [team, setTeam] = useState<Option[]>([]);
  const [scoped, setScoped] = useState<Option | null>(null);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-console-50">
        Select bench
      </h1>
      <p className="mb-6 text-sm text-console-400">
        Development only. Every variant of the select vocabulary, including the
        ones no screen uses yet.
      </p>

      <div className="flex flex-col gap-4">
        <Bench
          title="Single"
          note="Placeholder, then a value. The md density belongs in forms."
        >
          <Select items={states} value={single} onValueChange={setSingle}>
            <SelectLabel className="mb-1 block">Revision state</SelectLabel>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select a state" />
            </SelectTrigger>
            <SelectContent>
              {states.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            items={states}
            value={dense}
            onValueChange={(v) => setDense(v ?? "draft")}
          >
            <SelectLabel className="mb-1 block">Dense (table rows)</SelectLabel>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {states.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Bench>

        <Bench
          title="States"
          note="Disabled, invalid, and a disabled option inside the popup."
        >
          <Select items={states} defaultValue="draft" disabled>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {states.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-col gap-1">
            <Select items={states}>
              <SelectTrigger aria-invalid className="w-56">
                <SelectValue placeholder="Select a state" />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem
                    key={s.value}
                    value={s.value}
                    disabled={s.value === "approved"}
                  >
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span role="alert" className="text-xs text-signal-error">
              Pick a state before saving.
            </span>
          </div>
        </Bench>

        <Bench
          title="Grouped"
          note="Section headings inside the popup, plus a separator."
        >
          <Select
            items={permissionGroups}
            value={grouped}
            onValueChange={setGrouped}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a permission" />
            </SelectTrigger>
            <SelectContent>
              {permissionGroups.map((group, index) => (
                <SelectGroup key={group.value}>
                  {index > 0 && <SelectSeparator />}
                  <SelectGroupLabel>{group.value}</SelectGroupLabel>
                  {group.items.map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Bench>

        <Bench
          title="Multiple"
          note="The trigger summarises rather than listing; checks mark the set."
        >
          <Select multiple items={states} value={many} onValueChange={setMany}>
            <SelectTrigger className="w-64">
              <SelectValue>
                {(value: string[]) =>
                  value.length === 0
                    ? "No states selected"
                    : value.length === 1
                      ? states.find((s) => s.value === value[0])?.label
                      : `${value.length} states selected`
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {states.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Bench>

        <Bench
          title="Searchable"
          note="Type to filter. Clear resets, the caret opens the full list."
        >
          <Combobox
            items={reviewers}
            value={reviewer}
            onValueChange={setReviewer}
          >
            <ComboboxInputGroup className="w-72">
              <ComboboxInput placeholder="Search reviewers" />
              <div className="ml-auto flex items-center gap-0.5">
                <ComboboxClear aria-label="Clear reviewer" />
                <ComboboxTrigger aria-label="Open reviewer list" />
              </div>
            </ComboboxInputGroup>
            <ComboboxContent>
              <ComboboxEmpty>No reviewer by that name.</ComboboxEmpty>
              <ComboboxList>
                {(item: Option) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Bench>

        <Bench
          title="Searchable, grouped"
          note="Filtering keeps the headings that still have matches."
        >
          <Combobox
            items={projectGroups}
            value={scoped}
            onValueChange={setScoped}
          >
            <ComboboxInputGroup className="w-72">
              <ComboboxInput placeholder="Search projects" />
              <div className="ml-auto flex items-center gap-0.5">
                <ComboboxClear aria-label="Clear project" />
                <ComboboxTrigger aria-label="Open project list" />
              </div>
            </ComboboxInputGroup>
            <ComboboxContent>
              <ComboboxEmpty>No project by that name.</ComboboxEmpty>
              <ComboboxList>
                {(group: { value: string; items: Option[] }) => (
                  <ComboboxGroup key={group.value} items={group.items}>
                    <ComboboxGroupLabel>{group.value}</ComboboxGroupLabel>
                    <ComboboxCollection>
                      {(item: Option) => (
                        <ComboboxItem key={item.value} value={item}>
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxCollection>
                  </ComboboxGroup>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Bench>

        <Bench
          title="Searchable, multiple"
          note="Chips carry the selection; backspace and the × both remove."
        >
          <Combobox
            multiple
            items={reviewers}
            value={team}
            onValueChange={setTeam}
          >
            <ComboboxInputGroup className="w-96">
              <ComboboxChips>
                <ComboboxValue>
                  {(value: Option[]) => (
                    <>
                      {value.map((person) => (
                        <ComboboxChip
                          key={person.value}
                          aria-label={person.label}
                        >
                          {person.label}
                          <ComboboxChipRemove
                            aria-label={`Remove ${person.label}`}
                          />
                        </ComboboxChip>
                      ))}
                      <ComboboxInput
                        placeholder={value.length > 0 ? "" : "Add reviewers"}
                      />
                    </>
                  )}
                </ComboboxValue>
              </ComboboxChips>
            </ComboboxInputGroup>
            <ComboboxContent>
              <ComboboxEmpty>No reviewer by that name.</ComboboxEmpty>
              <ComboboxList>
                {(item: Option) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Bench>
      </div>
    </div>
  );
}
