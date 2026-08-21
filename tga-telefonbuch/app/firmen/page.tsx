"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, ChevronRight, Phone, Search, Users, X } from "lucide-react";
import { Badge, CategoryBadge, EmptyState, cx } from "@/components/ui";
import { useCategoryMap, useStore } from "@/lib/store";
import { formatAddress, matchesCompany, telHref } from "@/lib/utils";

export default function FirmenPage() {
  const { companies, contacts, projects, categories } = useStore();
  const cats = useCategoryMap();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("alle");

  const contactCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts) {
      if (c.companyId) map.set(c.companyId, (map.get(c.companyId) ?? 0) + 1);
    }
    return map;
  }, [contacts]);

  const filtered = useMemo(
    () =>
      companies
        .filter((c) => (cat === "alle" ? true : c.category === cat))
        .filter((c) => matchesCompany(c, q, projects))
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    [companies, projects, cat, q],
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Firmen</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          {filtered.length} von {companies.length} Firmen
        </p>
      </header>

      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-line bg-white px-3.5">
        <Search className="h-4 w-4 shrink-0 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Firma, Branche, Ort oder Projekt …"
          aria-label="Firmen durchsuchen"
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

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <FilterChip active={cat === "alle"} onClick={() => setCat("alle")}>
          Alle
        </FilterChip>
        {categories.map((c) => (
          <FilterChip
            key={c.id}
            active={cat === c.id}
            onClick={() => setCat(cat === c.id ? "alle" : c.id)}
            dot={c.dot}
          >
            {c.labelPlural}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Keine Firmen gefunden"
          description="Passen Sie Suche oder Filter an."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((company) => (
            <div key={company.id} className="card card-hover relative flex flex-col p-4">
              <Link
                href={`/firmen/${company.id}`}
                className="absolute inset-0 z-0 rounded-[14px]"
                aria-label={`${company.name} öffnen`}
              />
              <div className="pointer-events-none relative z-10 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink-500">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {company.name}
                  </p>
                  <p className="truncate text-xs text-ink-500">{company.trade}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
              </div>

              <div className="pointer-events-none relative z-10 mt-3 space-y-1 text-xs text-ink-500">
                <p className="truncate">{formatAddress(company.address)}</p>
              </div>

              <div className="relative z-10 mt-3 flex items-center gap-2 border-t border-line pt-3">
                <CategoryBadge cat={cats.get(company.category)} />
                <Badge tone="slate">
                  <Users className="h-3 w-3" />
                  {contactCount.get(company.id) ?? 0}
                </Badge>
                <span className="flex-1" />
                {company.phone ? (
                  <a
                    href={telHref(company.phone)}
                    aria-label={`${company.name} anrufen`}
                    title="Zentrale anrufen"
                    className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dot?: string;
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
      {dot ? <span className={cx("h-2 w-2 rounded-full", dot)} /> : null}
      {children}
    </button>
  );
}
