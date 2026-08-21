"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Building2, Search, User, X } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  formatAddress,
  fullName,
  matchesCompany,
  matchesContact,
  matchesProject,
  sortContacts,
} from "@/lib/utils";
import { Avatar, cx } from "./ui";

interface Props {
  variant?: "hero" | "compact";
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Suchfeld mit Sofortergebnissen über Kontakte, Firmen und Projekte.
 * Gesucht wird in Name, Firma, Telefonnummer, E-Mail, Projekt und Branche.
 */
export function SearchBar({
  variant = "compact",
  placeholder = "Name, Firma, Telefon, E-Mail, Projekt oder Branche suchen …",
  autoFocus = false,
}: Props) {
  const { contacts, companies, projects } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const results = useMemo(() => {
    const term = q.trim();
    if (term.length < 1) return { contacts: [], companies: [], projects: [], flat: [] };
    const idx = { companies: companyMap, projects };
    const ct = contacts
      .filter((c) => matchesContact(c, term, idx))
      .sort(sortContacts)
      .slice(0, 6);
    const co = companies.filter((c) => matchesCompany(c, term, projects)).slice(0, 4);
    const pr = projects.filter((p) => matchesProject(p, term)).slice(0, 3);
    const flat = [
      ...ct.map((c) => `/kontakte/${c.id}`),
      ...co.map((c) => `/firmen/${c.id}`),
      ...pr.map((p) => `/projekte/${p.id}`),
    ];
    return { contacts: ct, companies: co, projects: pr, flat };
  }, [q, contacts, companies, projects, companyMap]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Tastaturkürzel: Strg/Cmd + K fokussiert die Suche.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!results.flat.length) {
      if (e.key === "Enter" && q.trim())
        go(`/kontakte?q=${encodeURIComponent(q.trim())}`);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.flat.length) % results.flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results.flat[active]);
    }
  }

  const hero = variant === "hero";
  const hasResults =
    results.contacts.length + results.companies.length + results.projects.length > 0;
  let rowIndex = -1;

  return (
    <div ref={boxRef} className="relative w-full">
      <div
        className={cx(
          "flex items-center gap-3 rounded-xl border bg-white transition-shadow",
          hero ? "h-14 px-4 shadow-sm sm:h-16 sm:px-5" : "h-10 px-3",
          open && q ? "border-brand-400 ring-2 ring-brand-100" : "border-line",
        )}
      >
        <Search className={cx("shrink-0 text-ink-400", hero ? "h-5 w-5" : "h-4 w-4")} />
        <input
          ref={inputRef}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Kontakte durchsuchen"
          className={cx(
            "min-w-0 flex-1 bg-transparent text-ink-900 placeholder:text-ink-400 focus:outline-none",
            hero ? "text-base sm:text-lg" : "text-sm",
          )}
        />
        {q ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            aria-label="Suche leeren"
            className="focus-ring rounded-md p-1 text-ink-400 hover:bg-slate-100 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded border border-line bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-400 sm:inline-block">
            Strg K
          </kbd>
        )}
      </div>

      {open && q.trim().length > 0 ? (
        <div className="animate-fade-up absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[26rem] overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-xl shadow-slate-900/10">
          {!hasResults ? (
            <p className="px-3 py-6 text-center text-sm text-ink-500">
              Keine Treffer für „{q}“
            </p>
          ) : (
            <>
              {results.contacts.length > 0 ? (
                <Group label="Kontakte">
                  {results.contacts.map((c) => {
                    rowIndex += 1;
                    const i = rowIndex;
                    const company = c.companyId ? companyMap.get(c.companyId) : undefined;
                    return (
                      <Row
                        key={c.id}
                        active={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(`/kontakte/${c.id}`)}
                        leading={<Avatar name={fullName(c)} size="sm" />}
                        title={fullName(c)}
                        subtitle={[company?.name ?? c.companyName, c.position]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    );
                  })}
                </Group>
              ) : null}

              {results.companies.length > 0 ? (
                <Group label="Firmen">
                  {results.companies.map((c) => {
                    rowIndex += 1;
                    const i = rowIndex;
                    return (
                      <Row
                        key={c.id}
                        active={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(`/firmen/${c.id}`)}
                        leading={
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-ink-500">
                            <Building2 className="h-4 w-4" />
                          </span>
                        }
                        title={c.name}
                        subtitle={[c.trade, formatAddress(c.address)]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    );
                  })}
                </Group>
              ) : null}

              {results.projects.length > 0 ? (
                <Group label="Projekte">
                  {results.projects.map((p) => {
                    rowIndex += 1;
                    const i = rowIndex;
                    return (
                      <Row
                        key={p.id}
                        active={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(`/projekte/${p.id}`)}
                        leading={
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                            <Briefcase className="h-4 w-4" />
                          </span>
                        }
                        title={`${p.number} – ${p.name}`}
                        subtitle={`${p.city} · ${p.status}`}
                      />
                    );
                  })}
                </Group>
              ) : null}

              <button
                type="button"
                onClick={() => go(`/kontakte?q=${encodeURIComponent(q.trim())}`)}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-brand-600 hover:bg-brand-50"
              >
                <User className="h-3.5 w-3.5" />
                Alle Kontakttreffer anzeigen
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  active,
  leading,
  title,
  subtitle,
  onClick,
  onMouseEnter,
}: {
  active: boolean;
  leading: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cx(
        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
        active ? "bg-brand-50" : "hover:bg-slate-50",
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{title}</span>
        {subtitle ? (
          <span className="block truncate text-xs text-ink-500">{subtitle}</span>
        ) : null}
      </span>
    </button>
  );
}
