"use client";

import Link from "next/link";
import {
  ChevronRight,
  Download,
  Eye,
  Info,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { SyncCard } from "@/components/SyncStatus";
import { Avatar, Badge, SectionTitle, cx } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function MehrPage() {
  const { role, setRole, categories, contacts } = useStore();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Mehr</h1>
        <p className="mt-0.5 text-sm text-ink-500">Einstellungen, Verwaltung und App.</p>
      </header>

      {/* Benutzer */}
      <section className="card flex items-center gap-3 p-4">
        <Avatar name="Michael Hartmann" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">Michael Hartmann</p>
          <p className="truncate text-xs text-ink-500">
            Ingenieurbüro Hartmann TGA GmbH
          </p>
        </div>
        <Badge tone={role === "admin" ? "green" : "slate"}>
          {role === "admin" ? "Administrator" : "Mitarbeiter"}
        </Badge>
      </section>

      {/* Rolle wechseln */}
      <section>
        <SectionTitle title="Rolle (Demo)" />
        <div className="card grid grid-cols-2 gap-2 p-2">
          <button
            type="button"
            onClick={() => setRole("admin")}
            className={cx(
              "focus-ring flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-medium transition-colors",
              role === "admin"
                ? "bg-brand-50 text-brand-700"
                : "text-ink-500 hover:bg-slate-50",
            )}
          >
            <ShieldCheck className="h-5 w-5" />
            Administrator
          </button>
          <button
            type="button"
            onClick={() => setRole("mitarbeiter")}
            className={cx(
              "focus-ring flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-medium transition-colors",
              role === "mitarbeiter"
                ? "bg-brand-50 text-brand-700"
                : "text-ink-500 hover:bg-slate-50",
            )}
          >
            <Eye className="h-5 w-5" />
            Mitarbeiter
          </button>
        </div>
      </section>

      {/* Synchronisierung */}
      <section>
        <SectionTitle title="Synchronisierung" />
        <SyncCard />
      </section>

      {/* Navigation */}
      <section>
        <SectionTitle title="Verwaltung" />
        <div className="card divide-y divide-line overflow-hidden">
          <MoreRow
            href="/admin"
            icon={ShieldCheck}
            title="Administration"
            subtitle="Kontakte, Firmen, Kategorien, Import"
          />
          <MoreRow
            href="/kontakte?filter=favoriten"
            icon={Star}
            title="Favoriten"
            subtitle={`${contacts.filter((c) => c.favorite).length} Kontakte`}
          />
          <MoreRow
            href="/kontakte?kat=intern"
            icon={Users}
            title="Interne Mitarbeiter"
            subtitle="Kollegen im Büro"
          />
          <MoreRow
            href="/download"
            icon={Download}
            title="App herunterladen"
            subtitle="Windows, Android, iPhone, Browser"
          />
        </div>
      </section>

      {/* Kategorien */}
      <section>
        <SectionTitle title="Kategorien" />
        <div className="card divide-y divide-line overflow-hidden">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/kontakte?kat=${c.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
            >
              <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", c.dot)} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                {c.labelPlural}
              </span>
              <span className="text-xs tabular-nums text-ink-400">
                {contacts.filter((k) => k.category === c.id).length}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="card flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
          <div className="text-xs text-ink-500">
            <p className="font-medium text-ink-900">TGA Telefonbuch – Version 0.1</p>
            <p className="mt-0.5">
              Prototyp mit Demo-Daten. Kontakte werden lokal im Gerät gespeichert und bei
              Verbindung mit der zentralen Datenbank abgeglichen.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function MoreRow({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-500">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{title}</span>
        <span className="block truncate text-xs text-ink-500">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
    </Link>
  );
}
