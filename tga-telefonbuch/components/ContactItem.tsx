"use client";

import Link from "next/link";
import { Mail, Phone, Smartphone, Star } from "lucide-react";
import { useCategoryMap, useCompanyMap, useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { fullName, fullPhone, telHref } from "@/lib/utils";
import { Avatar, CategoryBadge, cx } from "./ui";

/** Zeile in Listen – Klick öffnet die Detailseite, Schnellaktionen wählen direkt. */
export function ContactItem({
  contact,
  showCategory = true,
  dense = false,
}: {
  contact: Contact;
  showCategory?: boolean;
  dense?: boolean;
}) {
  const companies = useCompanyMap();
  const cats = useCategoryMap();
  const { toggleFavorite, touchContact } = useStore();

  const company = contact.companyId ? companies.get(contact.companyId) : undefined;
  const companyName = company?.name ?? contact.companyName ?? "";
  const landline = fullPhone(contact);

  return (
    <div className="group relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50 sm:px-4">
      <Link
        href={`/kontakte/${contact.id}`}
        onClick={() => touchContact(contact.id)}
        className="absolute inset-0 z-0"
        aria-label={`${fullName(contact)} öffnen`}
      />
      <Avatar name={fullName(contact)} size={dense ? "sm" : "md"} />

      <div className="pointer-events-none relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink-900">{fullName(contact)}</p>
          {contact.favorite ? (
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
          ) : null}
        </div>
        <p className="truncate text-xs text-ink-500">
          {[companyName, contact.position].filter(Boolean).join(" · ")}
        </p>
        {!dense ? (
          <p className="mt-0.5 truncate text-[11px] text-ink-400 sm:hidden">
            {landline || contact.mobile}
          </p>
        ) : null}
      </div>

      {showCategory ? (
        <div className="pointer-events-none relative z-10 hidden xl:block">
          <CategoryBadge cat={cats.get(contact.category)} />
        </div>
      ) : null}

      <div className="relative z-10 hidden w-40 shrink-0 flex-col items-end sm:flex xl:w-44">
        <span className="truncate text-xs tabular-nums text-ink-700">{landline}</span>
        {contact.mobile ? (
          <span className="truncate text-[11px] tabular-nums text-ink-400">
            {contact.mobile}
          </span>
        ) : null}
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        <QuickIcon
          href={landline ? telHref(landline) : undefined}
          title="Festnetz anrufen"
          icon={Phone}
          desktopOnly
        />
        <QuickIcon
          href={contact.mobile ? telHref(contact.mobile) : undefined}
          title="Mobil anrufen"
          icon={Smartphone}
        />
        <QuickIcon
          href={contact.email ? `mailto:${contact.email}` : undefined}
          title="E-Mail schreiben"
          icon={Mail}
          desktopOnly
        />
        <button
          type="button"
          onClick={() => toggleFavorite(contact.id)}
          title={contact.favorite ? "Favorit entfernen" : "Als Favorit merken"}
          aria-label={contact.favorite ? "Favorit entfernen" : "Als Favorit merken"}
          className="focus-ring hidden h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white hover:text-amber-500 sm:flex"
        >
          <Star
            className={cx(
              "h-4 w-4",
              contact.favorite && "fill-amber-400 text-amber-400",
            )}
          />
        </button>
      </div>
    </div>
  );
}

function QuickIcon({
  href,
  title,
  icon: Icon,
  desktopOnly = false,
}: {
  href?: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Auf dem Handy ausblenden, damit die Zeile mit dem Daumen bedienbar bleibt. */
  desktopOnly?: boolean;
}) {
  // Anzeige-Utility bewusst nur an einer Stelle, sonst kollidieren die Klassen.
  const display = desktopOnly ? "hidden sm:flex" : "flex";

  if (!href) {
    return (
      <span
        className={cx(
          display,
          "h-8 w-8 items-center justify-center rounded-lg text-slate-200",
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <a
      href={href}
      title={title}
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      className={cx(
        display,
        "focus-ring h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-600",
      )}
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

/** Kompakte Kachel, z. B. für Favoriten auf dem Dashboard. */
export function ContactTile({ contact }: { contact: Contact }) {
  const companies = useCompanyMap();
  const { touchContact } = useStore();
  const company = contact.companyId ? companies.get(contact.companyId) : undefined;
  const landline = fullPhone(contact);

  return (
    <div className="card card-hover relative flex items-center gap-3 p-3">
      <Link
        href={`/kontakte/${contact.id}`}
        onClick={() => touchContact(contact.id)}
        className="absolute inset-0 z-0 rounded-[14px]"
        aria-label={`${fullName(contact)} öffnen`}
      />
      <Avatar name={fullName(contact)} size="md" />
      <div className="pointer-events-none relative z-10 min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">{fullName(contact)}</p>
        <p className="truncate text-xs text-ink-500">
          {company?.name ?? contact.companyName ?? contact.department}
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 gap-1">
        {contact.mobile || landline ? (
          <a
            href={telHref(contact.mobile || landline)}
            aria-label="Anrufen"
            title="Anrufen"
            className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100"
          >
            <Phone className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
