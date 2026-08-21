"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  Eye,
  FileSpreadsheet,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { ContactForm, emptyContact } from "@/components/ContactForm";
import { CompanyForm, emptyCompany } from "@/components/CompanyForm";
import { Modal } from "@/components/Modal";
import {
  Avatar,
  Badge,
  Button,
  CategoryBadge,
  EmptyState,
  Field,
  Input,
  cx,
  useToast,
} from "@/components/ui";
import { CSV_TEMPLATE, csvToContacts } from "@/lib/csv";
import { useCategoryMap, useStore } from "@/lib/store";
import type { Category, Company, Contact } from "@/lib/types";
import { formatAddress, fullName, fullPhone, matchesContact, sortContacts } from "@/lib/utils";

type Tab = "kontakte" | "firmen" | "kategorien" | "import" | "rechte";

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "kontakte", label: "Kontakte", icon: Users },
  { id: "firmen", label: "Firmen", icon: Building2 },
  { id: "kategorien", label: "Kategorien", icon: Tag },
  { id: "import", label: "Import", icon: FileSpreadsheet },
  { id: "rechte", label: "Berechtigungen", icon: ShieldCheck },
];

export default function AdminPage() {
  const { role } = useStore();
  const [tab, setTab] = useState<Tab>("kontakte");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            Administration
          </h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Kontakte, Firmen, Kategorien und Import verwalten.
          </p>
        </div>
        <Badge tone={role === "admin" ? "green" : "amber"}>
          {role === "admin" ? (
            <>
              <ShieldCheck className="h-3 w-3" /> Administrator
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" /> Nur Leserechte
            </>
          )}
        </Badge>
      </header>

      {role !== "admin" ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold">Sie sind als normaler Mitarbeiter angemeldet.</p>
            <p className="mt-0.5">
              Kontakte können angesehen, aber nicht geändert werden. Die Rolle lässt sich
              im Reiter „Berechtigungen“ zum Ausprobieren umschalten.
            </p>
          </div>
        </div>
      ) : null}

      {/* Reiter */}
      <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cx(
                "focus-ring -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-500 hover:text-ink-900",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "kontakte" ? <ContactAdmin /> : null}
      {tab === "firmen" ? <CompanyAdmin /> : null}
      {tab === "kategorien" ? <CategoryAdmin /> : null}
      {tab === "import" ? <ImportAdmin /> : null}
      {tab === "rechte" ? <RightsAdmin /> : null}
    </div>
  );
}

// ── Kontakte ──────────────────────────────────────────────────────────

function ContactAdmin() {
  const { contacts, companies, projects, role, deleteContact } = useStore();
  const cats = useCategoryMap();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState<Contact | null>(null);

  const canEdit = role === "admin";
  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const filtered = useMemo(
    () =>
      contacts
        .filter((c) => matchesContact(c, q, { companies: companyMap, projects }))
        .sort(sortContacts),
    [contacts, q, companyMap, projects],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-white px-3">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kontakt suchen …"
            aria-label="Kontakt suchen"
            className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <Button
          tone="primary"
          onClick={() => {
            if (!canEdit) return toast("Keine Berechtigung");
            setEditing(null);
            setFormOpen(true);
          }}
          disabled={!canEdit}
        >
          <Plus className="h-4 w-4" />
          Kontakt hinzufügen
        </Button>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden items-center gap-3 border-b border-line bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400 lg:flex">
          <span className="w-[26%]">Name</span>
          <span className="w-[24%]">Firma</span>
          <span className="w-[18%]">Kategorie</span>
          <span className="w-[18%]">Telefon</span>
          <span className="flex-1 text-right">Aktionen</span>
        </div>
        <div className="divide-y divide-line">
          {filtered.map((c) => {
            const company = c.companyId ? companyMap.get(c.companyId) : undefined;
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex w-full min-w-0 items-center gap-3 lg:w-[26%]">
                  <Avatar name={fullName(c)} size="sm" />
                  <div className="min-w-0">
                    <Link
                      href={`/kontakte/${c.id}`}
                      className="block truncate text-sm font-medium text-ink-900 hover:text-brand-600"
                    >
                      {fullName(c)}
                    </Link>
                    <p className="truncate text-xs text-ink-500">{c.position}</p>
                  </div>
                </div>
                <span className="hidden w-[24%] truncate text-xs text-ink-700 lg:block">
                  {company?.name ?? c.companyName ?? "–"}
                </span>
                <span className="hidden w-[18%] lg:block">
                  <CategoryBadge cat={cats.get(c.category)} />
                </span>
                <span className="hidden w-[18%] truncate text-xs tabular-nums text-ink-700 lg:block">
                  {fullPhone(c) || c.mobile || "–"}
                </span>
                <span className="flex flex-1 shrink-0 items-center justify-end gap-1">
                  <IconButton
                    title="Bearbeiten"
                    icon={Pencil}
                    disabled={!canEdit}
                    onClick={() => {
                      setEditing(c);
                      setFormOpen(true);
                    }}
                  />
                  <IconButton
                    title="Löschen"
                    icon={Trash2}
                    danger
                    disabled={!canEdit}
                    onClick={() => setConfirm(c)}
                  />
                </span>
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">
              Keine Kontakte gefunden.
            </p>
          ) : null}
        </div>
      </div>

      <ContactForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
      />

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Kontakt löschen"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Abbrechen</Button>
            <Button
              tone="danger"
              onClick={() => {
                if (confirm) {
                  deleteContact(confirm.id);
                  toast("Kontakt gelöscht");
                }
                setConfirm(null);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Endgültig löschen
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          Soll <strong>{confirm ? fullName(confirm) : ""}</strong> wirklich gelöscht
          werden? Der Kontakt wird beim nächsten Abgleich auch zentral entfernt.
        </p>
      </Modal>
    </div>
  );
}

// ── Firmen ────────────────────────────────────────────────────────────

function CompanyAdmin() {
  const { companies, contacts, role, deleteCompany } = useStore();
  const cats = useCategoryMap();
  const toast = useToast();
  const [editing, setEditing] = useState<Company | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState<Company | null>(null);
  const canEdit = role === "admin";

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts)
      if (c.companyId) map.set(c.companyId, (map.get(c.companyId) ?? 0) + 1);
    return map;
  }, [contacts]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          tone="primary"
          disabled={!canEdit}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Firma hinzufügen
        </Button>
      </div>

      <div className="card divide-y divide-line overflow-hidden">
        {companies.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-500">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/firmen/${c.id}`}
                className="block truncate text-sm font-medium text-ink-900 hover:text-brand-600"
              >
                {c.name}
              </Link>
              <p className="truncate text-xs text-ink-500">
                {[c.trade, formatAddress(c.address)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className="hidden shrink-0 sm:block">
              <CategoryBadge cat={cats.get(c.category)} />
            </span>
            <Badge tone="slate">
              <Users className="h-3 w-3" />
              {counts.get(c.id) ?? 0}
            </Badge>
            <span className="flex shrink-0 items-center gap-1">
              <IconButton
                title="Bearbeiten"
                icon={Pencil}
                disabled={!canEdit}
                onClick={() => {
                  setEditing(c);
                  setFormOpen(true);
                }}
              />
              <IconButton
                title="Löschen"
                icon={Trash2}
                danger
                disabled={!canEdit}
                onClick={() => setConfirm(c)}
              />
            </span>
          </div>
        ))}
      </div>

      <CompanyForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} />

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Firma löschen"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Abbrechen</Button>
            <Button
              tone="danger"
              onClick={() => {
                if (confirm) {
                  deleteCompany(confirm.id);
                  toast("Firma gelöscht");
                }
                setConfirm(null);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Endgültig löschen
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          <strong>{confirm?.name}</strong> löschen? Zugeordnete Kontakte bleiben erhalten
          und verlieren nur die Firmenzuordnung.
        </p>
      </Modal>
    </div>
  );
}

// ── Kategorien ────────────────────────────────────────────────────────

const PALETTE = [
  { color: "bg-brand-50 text-brand-700 ring-brand-100", dot: "bg-brand-500", name: "Blau" },
  { color: "bg-amber-50 text-amber-700 ring-amber-100", dot: "bg-amber-500", name: "Gelb" },
  { color: "bg-violet-50 text-violet-700 ring-violet-100", dot: "bg-violet-500", name: "Violett" },
  { color: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-500", name: "Grau" },
  { color: "bg-rose-50 text-rose-700 ring-rose-100", dot: "bg-rose-500", name: "Rot" },
  { color: "bg-teal-50 text-teal-700 ring-teal-100", dot: "bg-teal-500", name: "Türkis" },
  { color: "bg-emerald-50 text-emerald-700 ring-emerald-100", dot: "bg-emerald-500", name: "Grün" },
];

function CategoryAdmin() {
  const { categories, contacts, role, saveCategory, deleteCategory } = useStore();
  const toast = useToast();
  const canEdit = role === "admin";
  const [draft, setDraft] = useState({ label: "", labelPlural: "", palette: 0 });

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts) map.set(c.category, (map.get(c.category) ?? 0) + 1);
    return map;
  }, [contacts]);

  function add() {
    if (!canEdit) return toast("Keine Berechtigung");
    const label = draft.label.trim();
    if (!label) return;
    const p = PALETTE[draft.palette];
    const cat: Category = {
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label,
      labelPlural: draft.labelPlural.trim() || label,
      color: p.color,
      dot: p.dot,
    };
    saveCategory(cat);
    setDraft({ label: "", labelPlural: "", palette: 0 });
    toast("Kategorie angelegt");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card divide-y divide-line overflow-hidden lg:col-span-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <span className={cx("h-3 w-3 shrink-0 rounded-full", c.dot)} />
            <div className="min-w-0 flex-1">
              <input
                defaultValue={c.label}
                disabled={!canEdit}
                onBlur={(e) => {
                  const label = e.target.value.trim();
                  if (label && label !== c.label) {
                    saveCategory({ ...c, label });
                    toast("Kategorie umbenannt");
                  }
                }}
                className="w-full rounded-md bg-transparent px-1 py-0.5 text-sm font-medium text-ink-900 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:hover:bg-transparent"
              />
              <p className="px-1 text-xs text-ink-500">{c.labelPlural}</p>
            </div>
            <Badge tone="slate">{counts.get(c.id) ?? 0} Kontakte</Badge>
            <IconButton
              title="Kategorie löschen"
              icon={Trash2}
              danger
              disabled={!canEdit || (counts.get(c.id) ?? 0) > 0}
              onClick={() => {
                deleteCategory(c.id);
                toast("Kategorie gelöscht");
              }}
            />
          </div>
        ))}
      </div>

      <div className="card space-y-3 p-4">
        <h3 className="text-sm font-semibold text-ink-900">Neue Kategorie</h3>
        <Field label="Bezeichnung (Einzahl)">
          <Input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Sachverständiger"
            disabled={!canEdit}
          />
        </Field>
        <Field label="Bezeichnung (Mehrzahl)">
          <Input
            value={draft.labelPlural}
            onChange={(e) => setDraft({ ...draft, labelPlural: e.target.value })}
            placeholder="Sachverständige"
            disabled={!canEdit}
          />
        </Field>
        <Field label="Farbe">
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((p, i) => (
              <button
                key={p.name}
                type="button"
                disabled={!canEdit}
                onClick={() => setDraft({ ...draft, palette: i })}
                title={p.name}
                aria-label={p.name}
                className={cx(
                  "focus-ring flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                  draft.palette === i ? "border-brand-400" : "border-line",
                )}
              >
                <span className={cx("h-3.5 w-3.5 rounded-full", p.dot)} />
              </button>
            ))}
          </div>
        </Field>
        <Button tone="primary" onClick={add} disabled={!canEdit} className="w-full">
          <Plus className="h-4 w-4" />
          Kategorie anlegen
        </Button>
        <p className="text-[11px] text-ink-500">
          Kategorien mit zugeordneten Kontakten lassen sich nicht löschen.
        </p>
      </div>
    </div>
  );
}

// ── Import ────────────────────────────────────────────────────────────

function ImportAdmin() {
  const { companies, categories, role, importContacts, saveCompany } = useStore();
  const toast = useToast();
  const canEdit = role === "admin";
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    return csvToContacts(text, companies, categories);
  }, [text, companies, categories]);

  function runImport() {
    if (!canEdit) return toast("Keine Berechtigung");
    if (!preview || preview.contacts.length === 0) return;
    for (const c of preview.newCompanies) saveCompany(c);
    importContacts(preview.contacts);
    toast(`${preview.contacts.length} Kontakte importiert`);
    setText("");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    e.target.value = "";
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-ink-900">CSV / Excel importieren</h3>
          <p className="mt-1 text-xs text-ink-500">
            CSV-Datei auswählen oder Zeilen aus Excel direkt in das Feld einfügen. Als
            Trennzeichen werden Semikolon, Komma und Tabulator erkannt.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv"
              onChange={onFile}
              className="hidden"
            />
            <Button onClick={() => fileRef.current?.click()} disabled={!canEdit}>
              <Upload className="h-4 w-4" />
              Datei auswählen
            </Button>
            <Button onClick={() => setText(CSV_TEMPLATE)}>
              <FileSpreadsheet className="h-4 w-4" />
              Beispiel einfügen
            </Button>
            {text ? (
              <Button onClick={() => setText("")}>
                <RotateCcw className="h-4 w-4" />
                Leeren
              </Button>
            ) : null}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            spellCheck={false}
            placeholder={"Vorname;Nachname;Firma;Position;…"}
            className="mt-3 w-full rounded-lg border border-line bg-white p-3 font-mono text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {preview ? (
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="text-xs text-ink-500">
                <strong className="text-ink-900">{preview.contacts.length}</strong>{" "}
                Kontakte erkannt
                {preview.newCompanies.length > 0
                  ? `, ${preview.newCompanies.length} neue Firma(en)`
                  : ""}
                {preview.skipped > 0 ? `, ${preview.skipped} Zeilen übersprungen` : ""}
              </div>
              <Button
                tone="primary"
                size="sm"
                onClick={runImport}
                disabled={!canEdit || preview.contacts.length === 0}
              >
                <Check className="h-3.5 w-3.5" />
                Import ausführen
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Name</th>
                    <th className="px-4 py-2 font-semibold">Firma</th>
                    <th className="px-4 py-2 font-semibold">Position</th>
                    <th className="px-4 py-2 font-semibold">Telefon</th>
                    <th className="px-4 py-2 font-semibold">E-Mail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.contacts.slice(0, 12).map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 font-medium text-ink-900">
                        {fullName(c)}
                      </td>
                      <td className="px-4 py-2 text-ink-500">
                        {preview.newCompanies.find((f) => f.id === c.companyId)?.name ??
                          companies.find((f) => f.id === c.companyId)?.name ??
                          "–"}
                      </td>
                      <td className="px-4 py-2 text-ink-500">{c.position || "–"}</td>
                      <td className="px-4 py-2 tabular-nums text-ink-500">
                        {c.phone || "–"}
                      </td>
                      <td className="px-4 py-2 text-ink-500">{c.email || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={FileSpreadsheet}
            title="Noch keine Daten"
            description="Datei auswählen oder Beispiel einfügen, um eine Vorschau zu sehen."
          />
        )}
      </div>

      <div className="card space-y-3 p-4">
        <h3 className="text-sm font-semibold text-ink-900">Erwartete Spalten</h3>
        <ul className="space-y-1 text-xs text-ink-500">
          {[
            "Vorname *",
            "Nachname *",
            "Firma",
            "Position",
            "Bereich",
            "Kategorie",
            "Festnetz",
            "Durchwahl",
            "Mobil",
            "E-Mail",
            "Straße / PLZ / Ort",
            "Notizen",
          ].map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-ink-400" />
              {s}
            </li>
          ))}
        </ul>
        <p className="border-t border-line pt-3 text-[11px] text-ink-500">
          Unbekannte Firmen werden beim Import automatisch angelegt. Die Spaltenreihenfolge
          spielt keine Rolle – erkannt wird über die Überschrift.
        </p>
      </div>
    </div>
  );
}

// ── Berechtigungen ────────────────────────────────────────────────────

function RightsAdmin() {
  const { role, setRole, resetDemo, contacts, companies, projects } = useStore();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-ink-900">Eigene Rolle</h3>
        <p className="mt-1 text-xs text-ink-500">
          Im Prototyp lässt sich die Rolle frei wechseln, um beide Ansichten zu prüfen.
          Später kommt sie aus der Benutzerverwaltung.
        </p>
        <div className="mt-3 space-y-2">
          <RoleOption
            active={role === "admin"}
            onClick={() => {
              setRole("admin");
              toast("Rolle: Administrator");
            }}
            icon={ShieldCheck}
            title="Administrator"
            description="Darf Kontakte, Firmen, Kategorien und Projekte anlegen, ändern und löschen."
          />
          <RoleOption
            active={role === "mitarbeiter"}
            onClick={() => {
              setRole("mitarbeiter");
              toast("Rolle: Mitarbeiter");
            }}
            icon={Eye}
            title="Mitarbeiter"
            description="Darf alle Kontakte sehen, suchen, anrufen und als Favorit merken – aber nichts ändern."
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-ink-900">Datenbestand</h3>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[
              ["Kontakte", contacts.length],
              ["Firmen", companies.length],
              ["Projekte", projects.length],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg bg-slate-50 py-3">
                <dd className="text-lg font-semibold tabular-nums text-ink-900">
                  {value}
                </dd>
                <dt className="text-[11px] text-ink-500">{label}</dt>
              </div>
            ))}
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-ink-900">Demo zurücksetzen</h3>
          <p className="mt-1 text-xs text-ink-500">
            Setzt alle lokalen Änderungen zurück und lädt die Demo-Daten neu.
          </p>
          <Button className="mt-3" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="h-4 w-4" />
            Zurücksetzen
          </Button>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Demo-Daten zurücksetzen"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Abbrechen</Button>
            <Button
              tone="danger"
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
                toast("Demo-Daten wiederhergestellt");
              }}
            >
              Zurücksetzen
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          Alle lokal gespeicherten Änderungen gehen verloren.
        </p>
      </Modal>
    </div>
  );
}

function RoleOption({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "focus-ring flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-brand-300 bg-brand-50"
          : "border-line bg-white hover:bg-slate-50",
      )}
    >
      <span
        className={cx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-brand-600 text-white" : "bg-slate-100 text-ink-500",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-900">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-500">{description}</span>
      </span>
      {active ? <Check className="h-4 w-4 shrink-0 text-brand-600" /> : null}
    </button>
  );
}

// ── Hilfsknopf ────────────────────────────────────────────────────────

function IconButton({
  title,
  icon: Icon,
  onClick,
  disabled,
  danger,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-30",
        danger
          ? "text-ink-400 hover:bg-rose-50 hover:text-rose-600"
          : "text-ink-400 hover:bg-slate-100 hover:text-ink-900",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
