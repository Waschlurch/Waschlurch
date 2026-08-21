"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  Briefcase,
  Building2,
  ChevronRight,
  Clock,
  Star,
  Users,
} from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { ContactItem, ContactTile } from "@/components/ContactItem";
import { SyncCard } from "@/components/SyncStatus";
import { Badge, EmptyState, SectionTitle, cx } from "@/components/ui";
import { useStore } from "@/lib/store";
import { sortContacts } from "@/lib/utils";

export default function DashboardPage() {
  const { contacts, companies, projects, categories, recentIds, ready } = useStore();

  const favorites = useMemo(
    () => contacts.filter((c) => c.favorite).sort(sortContacts),
    [contacts],
  );

  const recent = useMemo(() => {
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 5) as typeof contacts;
  }, [recentIds, contacts]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts) map.set(c.category, (map.get(c.category) ?? 0) + 1);
    return map;
  }, [contacts]);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status !== "Abgeschlossen"),
    [projects],
  );

  return (
    <div className="space-y-6">
      {/* Suche */}
      <section className="pt-1">
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
          Wen suchen Sie?
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Name, Firma, Telefonnummer, E-Mail, Projekt oder Branche – ein Feld genügt.
        </p>
        <div className="mt-4">
          <SearchBar variant="hero" />
        </div>
      </section>

      {/* Kennzahlen */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          href="/kontakte"
          label="Kontakte"
          value={contacts.length}
          icon={Users}
          tone="brand"
        />
        <StatTile
          href="/firmen"
          label="Firmen"
          value={companies.length}
          icon={Building2}
          tone="slate"
        />
        <StatTile
          href="/projekte"
          label="Projekte"
          value={projects.length}
          icon={Briefcase}
          tone="teal"
        />
        <StatTile
          href="/kontakte?filter=favoriten"
          label="Favoriten"
          value={favorites.length}
          icon={Star}
          tone="amber"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Favoriten */}
          <section>
            <SectionTitle
              title="Favoriten"
              icon={Star}
              action={
                <Link
                  href="/kontakte?filter=favoriten"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  Alle ansehen <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {favorites.length === 0 ? (
              <EmptyState
                icon={Star}
                title="Noch keine Favoriten"
                description="Markieren Sie häufig genutzte Kontakte mit dem Stern – sie erscheinen dann hier."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {favorites.slice(0, 6).map((c) => (
                  <ContactTile key={c.id} contact={c} />
                ))}
              </div>
            )}
          </section>

          {/* Zuletzt verwendet */}
          <section>
            <SectionTitle
              title="Zuletzt verwendet"
              icon={Clock}
              action={
                <Link
                  href="/kontakte"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  Alle Kontakte <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {recent.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Noch nichts geöffnet"
                description="Zuletzt geöffnete Kontakte erscheinen hier automatisch."
              />
            ) : (
              <div className="card divide-y divide-line overflow-hidden">
                {recent.map((c) => (
                  <ContactItem key={c.id} contact={c} />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          {/* Sync-Status */}
          <section>
            <SectionTitle title="Synchronisierung" />
            {ready ? <SyncCard /> : <div className="card h-40 animate-pulse" />}
          </section>

          {/* Aktive Projekte */}
          <section>
            <SectionTitle
              title="Aktuelle Projekte"
              icon={Briefcase}
              action={
                <Link
                  href="/projekte"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  Alle <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="card divide-y divide-line overflow-hidden">
              {activeProjects.slice(0, 4).map((p) => (
                <Link
                  key={p.id}
                  href={`/projekte/${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[11px] font-semibold text-brand-700">
                    {p.number.slice(-3)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">
                      {p.name}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      {p.number} · {p.city}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Kategorien */}
      <section>
        <SectionTitle title="Nach Kategorie" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <CategoryTile
            href="/kontakte"
            label="Alle Kontakte"
            count={contacts.length}
            dot="bg-brand-500"
          />
          {categories.map((cat) => (
            <CategoryTile
              key={cat.id}
              href={`/kontakte?kat=${cat.id}`}
              label={cat.labelPlural}
              count={counts.get(cat.id) ?? 0}
              dot={cat.dot}
            />
          ))}
          <CategoryTile
            href="/firmen"
            label="Firmen"
            count={companies.length}
            dot="bg-slate-400"
          />
          <CategoryTile
            href="/projekte"
            label="Projektkontakte"
            count={projects.length}
            dot="bg-brand-400"
          />
        </div>
      </section>
    </div>
  );
}

function StatTile({
  href,
  label,
  value,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "slate" | "teal" | "amber";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    slate: "bg-slate-100 text-slate-600",
    teal: "bg-teal-50 text-teal-600",
    amber: "bg-amber-50 text-amber-600",
  } as const;
  return (
    <Link href={href} className="card card-hover flex items-center gap-3 p-3.5">
      <span
        className={cx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          tones[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-semibold tabular-nums text-ink-900">
          {value}
        </span>
        <span className="block truncate text-xs text-ink-500">{label}</span>
      </span>
    </Link>
  );
}

function CategoryTile({
  href,
  label,
  count,
  dot,
}: {
  href: string;
  label: string;
  count: number;
  dot: string;
}) {
  return (
    <Link href={href} className="card card-hover flex items-center gap-2.5 px-3.5 py-3">
      <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", dot)} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
        {label}
      </span>
      <Badge tone="slate">{count}</Badge>
    </Link>
  );
}
