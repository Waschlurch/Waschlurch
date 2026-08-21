"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { slugId } from "@/lib/utils";
import { Modal } from "./Modal";
import { Button, Field, Input, Select, Textarea, cx } from "./ui";
import { useToast } from "./ui";

export function emptyContact(): Contact {
  return {
    id: slugId("k"),
    firstName: "",
    lastName: "",
    companyId: null,
    position: "",
    department: "",
    category: "handwerker",
    phone: "",
    extension: "",
    mobile: "",
    email: "",
    address: { street: "", zip: "", city: "" },
    notes: "",
    favorite: false,
    projectIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export function ContactForm({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: Contact | null;
}) {
  const { companies, projects, categories, saveContact } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<Contact>(initial ?? emptyContact());
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(initial ?? emptyContact());
      setError("");
    }
  }, [open, initial]);

  function set<K extends keyof Contact>(key: K, value: Contact[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError("Vor- und Nachname sind erforderlich.");
      return;
    }
    saveContact({ ...draft, updatedAt: new Date().toISOString() });
    toast(initial ? "Kontakt gespeichert" : "Kontakt angelegt");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Kontakt bearbeiten" : "Kontakt hinzufügen"}
      description="Änderungen werden lokal gespeichert und beim nächsten Abgleich übertragen."
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
          <Field label="Vorname">
            <Input
              value={draft.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              placeholder="Thomas"
            />
          </Field>
          <Field label="Nachname">
            <Input
              value={draft.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              placeholder="Müller"
            />
          </Field>
          <Field label="Firma">
            <Select
              value={draft.companyId ?? ""}
              onChange={(e) => set("companyId", e.target.value || null)}
            >
              <option value="">– keine Firma –</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kategorie">
            <Select
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Position">
            <Input
              value={draft.position}
              onChange={(e) => set("position", e.target.value)}
              placeholder="Projektleiter"
            />
          </Field>
          <Field label="Bereich">
            <Input
              value={draft.department}
              onChange={(e) => set("department", e.target.value)}
              placeholder="Heizung / Sanitär"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Festnetz">
            <Input
              value={draft.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="02242 123456"
              inputMode="tel"
            />
          </Field>
          <Field label="Durchwahl">
            <Input
              value={draft.extension}
              onChange={(e) => set("extension", e.target.value)}
              placeholder="-23"
            />
          </Field>
          <Field label="Mobil">
            <Input
              value={draft.mobile}
              onChange={(e) => set("mobile", e.target.value)}
              placeholder="0171 1234567"
              inputMode="tel"
            />
          </Field>
        </div>

        <Field label="E-Mail">
          <Input
            type="email"
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="t.mueller@beispiel.de"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr]">
          <Field label="Straße und Hausnummer">
            <Input
              value={draft.address.street}
              onChange={(e) =>
                set("address", { ...draft.address, street: e.target.value })
              }
              placeholder="Musterstraße 10"
            />
          </Field>
          <Field label="PLZ">
            <Input
              value={draft.address.zip}
              onChange={(e) => set("address", { ...draft.address, zip: e.target.value })}
              placeholder="53773"
              inputMode="numeric"
            />
          </Field>
          <Field label="Ort">
            <Input
              value={draft.address.city}
              onChange={(e) => set("address", { ...draft.address, city: e.target.value })}
              placeholder="Hennef"
            />
          </Field>
        </div>

        <Field label="Projekte" hint="Mehrfachauswahl mit Klick">
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
            placeholder="Erreichbarkeit, Zuständigkeiten, Hinweise …"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={draft.favorite}
            onChange={(e) => set("favorite", e.target.checked)}
            className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-400"
          />
          Als Favorit merken
        </label>
      </div>
    </Modal>
  );
}
