"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, Star, Users, X } from "lucide-react";
import { ContactItem } from "@/components/ContactItem";
import { EmptyState, cx } from "@/components/ui";
import { useStore } from "@/lib/store";
import { matchesContact, sortContacts } from "@/lib/utils";

export default function KontaktePage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <KontakteInner />
    </Suspense>
  );
}

function KontakteInner() {
  const { contacts, companies, projects, categories } = useStore();
  const params = useSearchParams();
  const router = useRouter();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [cat, setCat] = useState<string>(params.get("kat") ?? "alle");
  const [onlyFavorites, setOnlyFavorites] = useState(params.get("filter") === "favoriten");

  // URL-Parameter gewinnen, wenn über Seitenleiste oder Suche navigiert wird.
  useEffect(() => {
    setQ(params.get("q") ?? "");
    setCat(params.get("kat") ?? "alle");
    setOnlyFavorites(params.get("filter") === "favoriten");
  }, [params]);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const filtered = useMemo(() => {
    const idx = { companies: companyMap, projects };
    return contacts
      .filter((c) => (cat === "alle" ? true : c.category === cat))
      .filter((c) => (onlyFavorites ? c.favorite : true))
      .filter((c) => matchesContact(c, q, idx))
      .sort(sortContacts);
  }, [contacts, companyMap, projects, cat, onlyFavorites, q]);

  // Gruppierung nach Anfangsbuchstabe des Nachnamens.
  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const c of filtered) {
      const letter = (c.lastName[0] ?? "#").toUpperCase();
      const list = map.get(letter);
      if (list) list.push(c);
      else map.set(letter, [c]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
  }, [filtered]);

  const activeCategory = categories.find((c) => c.id === cat);
  const title = onlyFavorites
    ? "Favoriten"
    : (activeCategory?.labelPlural ?? "Alle Kontakte");

  function setFilter(next: { kat?: string; fav?: boolean }) {
    const kat = next.kat ?? cat;
    const fav = next.fav ?? onlyFavorites;
    const sp = new URLSearchParams();
    if (kat !== "alle") sp.set("kat", kat);
    if (fav) sp.set("filter", "favoriten");
    if (q.trim()) sp.set("q", q.trim());
    router.replace(sp.toString() ? `/kontakte?${sp}` : "/kontakte");
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {filtered.length} von {contacts.length} Kontakten
          </p>
        </div>
      </header>

      {/* Lokale Suche */}
      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-line bg-white px-3.5">
        <Search className="h-4 w-4 shrink-0 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="In dieser Liste suchen …"
          aria-label="In dieser Liste suchen"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Suche leeren"
            className="focus-ring rounded-md p-1 text-ink-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Filterleiste */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <SlidersHorizontal className="hidden h-4 w-4 shrink-0 text-ink-400 sm:block" />
        <Chip
          active={cat === "alle" && !onlyFavorites}
          onClick={() => setFilter({ kat: "alle", fav: false })}
        >
          Alle
        </Chip>
        <Chip
          active={onlyFavorites}
          onClick={() => setFilter({ fav: !onlyFavorites })}
          icon={
            <Star
              className={cx(
                "h-3.5 w-3.5",
                onlyFavorites ? "fill-amber-400 text-amber-400" : "text-ink-400",
              )}
            />
          }
        >
          Favoriten
        </Chip>
        <span className="hidden h-5 w-px shrink-0 bg-line sm:block" />
        {categories.map((c) => (
          <Chip
            key={c.id}
            active={cat === c.id}
            onClick={() => setFilter({ kat: cat === c.id ? "alle" : c.id })}
            icon={<span className={cx("h-2 w-2 rounded-full", c.dot)} />}
          >
            {c.labelPlural}
          </Chip>
        ))}
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Keine Kontakte gefunden"
          description="Passen Sie die Suche oder die Filter an."
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([letter, items]) => (
            <section key={letter}>
              <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
                {letter}
              </p>
              <div className="card divide-y divide-line overflow-hidden">
                {items.map((c) => (
                  <ContactItem key={c.id} contact={c} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-line bg-white text-ink-700 hover:bg-slate-50",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
