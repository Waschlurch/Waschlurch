"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { Company } from "@/lib/types";
import { slugId } from "@/lib/utils";
import { Modal } from "./Modal";
import { Button, Field, Input, Select, Textarea, cx, useToast } from "./ui";

export function emptyCompany(): Company {
  return {
    id: slugId("f"),
    name: "",
    category: "handwerker",
    trade: "",
    phone: "",
    email: "",
    website: "",
    address: { street: "", zip: "", city: "" },
    notes: "",
    projectIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export function CompanyForm({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: Company | null;
}) {
  const { categories, projects, saveCompany } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<Company>(initial ?? emptyCompany());
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(initial ?? emptyCompany());
      setError("");
    }
  }, [open, initial]);

  function set<K extends keyof Company>(key: K, value: Company[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    if (!draft.name.trim()) {
      setError("Der Firmenname ist erforderlich.");
      return;
    }
    saveCompany({ ...draft, updatedAt: new Date().toISOString() });
    toast(initial ? "Firma gespeichert" : "Firma angelegt");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Firma bearbeiten" : "Firma hinzufügen"}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button tone="primary" onClick={submit}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-100">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Firmenname" className="sm:col-span-2">
            <Input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Müller Gebäudetechnik GmbH"
            />
          </Field>
          <Field label="Kategorie">
            <Select value={draft.category} onChange={(e) => set("category", e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Branche / Gewerk">
            <Input
              value={draft.trade}
              onChange={(e) => set("trade", e.target.value)}
              placeholder="Heizungsbauer"
            />
          </Field>
          <Field label="Haupttelefonnummer">
            <Input
              value={draft.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="02242 123456"
              inputMode="tel"
            />
          </Field>
          <Field label="Allgemeine E-Mail">
            <Input
              type="email"
              value={draft.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="info@firma.de"
            />
          </Field>
          <Field label="Website" className="sm:col-span-2">
            <Input
              value={draft.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="www.firma.de"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr]">
          <Field label="Straße und Hausnummer">
            <Input
              value={draft.address.street}
              onChange={(e) => set("address", { ...draft.address, street: e.target.value })}
            />
          </Field>
          <Field label="PLZ">
            <Input
              value={draft.address.zip}
              onChange={(e) => set("address", { ...draft.address, zip: e.target.value })}
              inputMode="numeric"
            />
          </Field>
          <Field label="Ort">
            <Input
              value={draft.address.city}
              onChange={(e) => set("address", { ...draft.address, city: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Zugehörige Projekte">
          <div className="flex flex-wrap gap-1.5">
            {projects.map((p) => {
              const on = draft.projectIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    set(
                      "projectIds",
                      on
                        ? draft.projectIds.filter((x) => x !== p.id)
                        : [...draft.projectIds, p.id],
                    )
                  }
                  className={cx(
                    "focus-ring rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-brand-200 bg-brand-50 text-brand-700"
                      : "border-line bg-white text-ink-500 hover:bg-slate-50",
                  )}
                >
                  {p.number} · {p.name}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Notizen">
          <Textarea
            rows={3}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
