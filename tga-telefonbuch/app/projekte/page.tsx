"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Briefcase, ChevronRight, MapPin, Search, Users, X } from "lucide-react";
import { Badge, EmptyState, cx } from "@/components/ui";
import { useContactMap, useStore } from "@/lib/store";
import type { ProjectStatus } from "@/lib/types";
import { fullName, matchesProject } from "@/lib/utils";

const STATUS_TONE: Record<ProjectStatus, "brand" | "amber" | "green" | "slate"> = {
  Planung: "brand",
  Ausschreibung: "amber",
  Ausführung: "green",
  Abgeschlossen: "slate",
};

const STATUS_FILTERS: Array<ProjectStatus | "alle"> = [
  "alle",
  "Planung",
  "Ausschreibung",
  "Ausführung",
  "Abgeschlossen",
];

export default function ProjektePage() {
  const { projects } = useStore();
  const contacts = useContactMap();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "alle">("alle");

  const filtered = useMemo(
    () =>
      projects
        .filter((p) => (status === "alle" ? true : p.status === status))
        .filter((p) => matchesProject(p, q))
        .sort((a, b) => b.number.localeCompare(a.number)),
    [projects, status, q],
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Projekte</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          {filtered.length} von {projects.length} Projekten
        </p>
      </header>

      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-line bg-white px-3.5">
        <Search className="h-4 w-4 shrink-0 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Projektnummer, Name oder Ort …"
          aria-label="Projekte durchsuchen"
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
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cx(
              "focus-ring inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors",
              status === s
                ? "border-brand-200 bg-brand-50 text-brand-700"
                : "border-line bg-white text-ink-700 hover:bg-slate-50",
            )}
          >
            {s === "alle" ? "Alle" : s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Briefcase} title="Keine Projekte gefunden" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((p) => {
            const lead = contacts.get(p.lead);
            return (
              <Link
                key={p.id}
                href={`/projekte/${p.id}`}
                className="card card-hover flex flex-col p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Briefcase className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium tabular-nums text-ink-500">
                      Projekt {p.number}
                    </p>
                    <p className="truncate text-sm font-semibold text-ink-900">{p.name}</p>
                  </div>
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                </div>

                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-ink-500">
                  {p.notes}
                </p>

                <div className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-ink-400" />
                    {p.city}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-ink-400" />
                    {p.roles.length} Beteiligte
                  </span>
                  <span className="flex-1" />
                  {lead ? (
                    <span className="truncate">PL: {fullName(lead)}</span>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
