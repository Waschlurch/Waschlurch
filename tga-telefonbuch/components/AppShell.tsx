"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  Briefcase,
  Building2,
  Download,
  Home,
  LayoutGrid,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { SearchBar } from "./SearchBar";
import { SyncPill } from "./SyncStatus";
import { Avatar, cx } from "./ui";

const MAIN_NAV = [
  { href: "/", label: "Start", icon: Home },
  { href: "/kontakte", label: "Kontakte", icon: Users },
  { href: "/firmen", label: "Firmen", icon: Building2 },
  { href: "/projekte", label: "Projekte", icon: Briefcase },
];

const BOTTOM_NAV = [
  { href: "/", label: "Start", icon: Home },
  { href: "/kontakte", label: "Kontakte", icon: Users },
  { href: "/firmen", label: "Firmen", icon: Building2 },
  { href: "/projekte", label: "Projekte", icon: Briefcase },
  { href: "/mehr", label: "Mehr", icon: LayoutGrid },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { categories, contacts, role } = useStore();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts) map.set(c.category, (map.get(c.category) ?? 0) + 1);
    return map;
  }, [contacts]);

  const favCount = contacts.filter((c) => c.favorite).length;
  const onDashboard = pathname === "/";

  return (
    <div className="min-h-dvh">
      {/* ── Seitenleiste (Desktop) ───────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            TB
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink-900">
              TGA Telefonbuch
            </span>
            <span className="block truncate text-[11px] text-ink-500">
              Hartmann TGA GmbH
            </span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <NavLink {...item} active={isActive(pathname, item.href)} />
              </li>
            ))}
            <li>
              <NavLink
                href="/kontakte?filter=favoriten"
                label="Favoriten"
                icon={Star}
                active={false}
                count={favCount}
              />
            </li>
          </ul>

          <p className="px-3 pb-1.5 pt-6 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Kategorien
          </p>
          <ul className="space-y-0.5">
            {categories.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={`/kontakte?kat=${cat.id}`}
                  className="focus-ring group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-slate-100"
                >
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", cat.dot)} />
                  <span className="min-w-0 flex-1 truncate">{cat.labelPlural}</span>
                  <span className="text-[11px] tabular-nums text-ink-400">
                    {counts.get(cat.id) ?? 0}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="px-3 pb-1.5 pt-6 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Verwaltung
          </p>
          <ul className="space-y-0.5">
            <li>
              <NavLink
                href="/admin"
                label="Administration"
                icon={ShieldCheck}
                active={isActive(pathname, "/admin")}
              />
            </li>
            <li>
              <NavLink
                href="/download"
                label="Download / App"
                icon={Download}
                active={isActive(pathname, "/download")}
              />
            </li>
          </ul>
        </nav>

        <div className="border-t border-line p-3">
          <Link
            href="/mehr"
            className="focus-ring flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-100"
          >
            <Avatar name="Michael Hartmann" size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-ink-900">
                Michael Hartmann
              </span>
              <span className="block truncate text-[11px] text-ink-500">
                {role === "admin" ? "Administrator" : "Mitarbeiter (nur lesen)"}
              </span>
            </span>
          </Link>
        </div>
      </aside>

      {/* ── Kopfzeile ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md lg:pl-64">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              TB
            </span>
          </Link>
          {/* Auf dem Dashboard steht die große Suche bereits im Inhalt. */}
          {onDashboard ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">
                TGA Telefonbuch
              </p>
              <p className="truncate text-[11px] text-ink-500">Hartmann TGA GmbH</p>
            </div>
          ) : (
            <>
              <div className="hidden min-w-0 flex-1 md:block">
                <SearchBar />
              </div>
              <div className="min-w-0 flex-1 md:hidden">
                <p className="truncate text-sm font-semibold text-ink-900">
                  TGA Telefonbuch
                </p>
                <p className="truncate text-[11px] text-ink-500">Hartmann TGA GmbH</p>
              </div>
            </>
          )}
          <SyncPill className="shrink-0" />
        </div>
        {onDashboard ? null : (
          <div className="border-t border-line px-4 py-2 md:hidden">
            <SearchBar placeholder="Suchen: Name, Firma, Telefon, Projekt …" />
          </div>
        )}
      </header>

      {/* ── Inhalt ───────────────────────────────────────────────── */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:pb-12">
          {children}
        </div>
      </main>

      {/* ── Untere Navigation (Mobil) ────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <ul className="mx-auto flex max-w-lg">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={cx(
                    "flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors",
                    active ? "text-brand-600" : "text-ink-500",
                  )}
                >
                  <span
                    className={cx(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      active && "bg-brand-50",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  count,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-brand-50 text-brand-700"
          : "text-ink-700 hover:bg-slate-100 hover:text-ink-900",
      )}
    >
      <Icon className={cx("h-[18px] w-[18px]", active ? "text-brand-600" : "text-ink-400")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" ? (
        <span className="text-[11px] tabular-nums text-ink-400">{count}</span>
      ) : null}
    </Link>
  );
}
