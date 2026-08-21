"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Copy,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  Smartphone,
  Star,
  StickyNote,
  UserX,
} from "lucide-react";
import { ContactForm } from "@/components/ContactForm";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  CategoryBadge,
  EmptyState,
  LinkButton,
  SectionTitle,
  cx,
  useToast,
} from "@/components/ui";
import { useCategoryMap, useCompanyMap, useStore } from "@/lib/store";
import {
  copyToClipboard,
  formatAddress,
  formatDateTime,
  fullName,
  fullPhone,
  mapsHref,
  telHref,
  whatsappHref,
} from "@/lib/utils";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { contacts, projects, role, toggleFavorite, touchContact, ready } = useStore();
  const companies = useCompanyMap();
  const cats = useCategoryMap();
  const [editing, setEditing] = useState(false);

  const contact = contacts.find((c) => c.id === id);

  useEffect(() => {
    if (contact) touchContact(contact.id);
    // Nur beim ersten Öffnen des Kontakts vermerken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  const contactProjects = useMemo(
    () => (contact ? projects.filter((p) => contact.projectIds.includes(p.id)) : []),
    [projects, contact],
  );

  if (!ready) return <div className="card h-72 animate-pulse" />;

  if (!contact) {
    return (
      <EmptyState
        icon={UserX}
        title="Kontakt nicht gefunden"
        description="Der Kontakt wurde möglicherweise gelöscht."
        action={
          <Button onClick={() => router.push("/kontakte")}>Zur Kontaktliste</Button>
        }
      />
    );
  }

  const company = contact.companyId ? companies.get(contact.companyId) : undefined;
  const landline = fullPhone(contact);
  const address = formatAddress(contact.address);

  async function copy(value: string, label: string) {
    const ok = await copyToClipboard(value);
    toast(ok ? `${label} kopiert` : "Kopieren nicht möglich");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="hidden sm:block">
          <Breadcrumb
            items={[
              { label: "Kontakte", href: "/kontakte" },
              { label: fullName(contact) },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="focus-ring -ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 sm:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </button>
      </div>

      {/* Kopfbereich */}
      <section className="card overflow-hidden">
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <Avatar name={fullName(contact)} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
                {fullName(contact)}
              </h1>
              {contact.favorite ? (
                <Star className="h-4.5 w-4.5 fill-amber-400 text-amber-400" />
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-ink-700">{contact.position}</p>
            {company ? (
              <Link
                href={`/firmen/${company.id}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
              >
                <Building2 className="h-3.5 w-3.5" />
                {company.name}
              </Link>
            ) : contact.companyName ? (
              <p className="mt-1 text-sm text-ink-500">{contact.companyName}</p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <CategoryBadge cat={cats.get(contact.category)} />
              {contact.department ? (
                <Badge tone="slate">{contact.department}</Badge>
              ) : null}
            </div>
          </div>
        </div>

        {/* Aktionen – auf dem Handy groß und mit dem Daumen erreichbar */}
        <div className="grid grid-cols-2 gap-2 border-t border-line bg-slate-50 p-3 sm:grid-cols-4 sm:gap-2">
          <PrimaryAction
            href={landline ? telHref(landline) : undefined}
            icon={Phone}
            label="Anrufen"
            primary
          />
          <PrimaryAction
            href={contact.mobile ? telHref(contact.mobile) : undefined}
            icon={Smartphone}
            label="Mobil"
          />
          <PrimaryAction
            href={contact.email ? `mailto:${contact.email}` : undefined}
            icon={Mail}
            label="E-Mail"
          />
          <PrimaryAction
            href={address ? mapsHref(contact.address) : undefined}
            icon={Navigation}
            label="Navigation"
          />
        </div>

        {/* Weitere Aktionen */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
          {contact.mobile ? (
            <LinkButton
              size="sm"
              href={whatsappHref(contact.mobile)}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              WhatsApp
            </LinkButton>
          ) : null}
          <Button
            size="sm"
            onClick={() => copy(landline || contact.mobile, "Telefonnummer")}
          >
            <Copy className="h-3.5 w-3.5" />
            Nummer kopieren
          </Button>
          <Button size="sm" onClick={() => copy(contact.email, "E-Mail-Adresse")}>
            <Copy className="h-3.5 w-3.5" />
            E-Mail kopieren
          </Button>
          <Button
            size="sm"
            onClick={() => {
              toggleFavorite(contact.id);
              toast(contact.favorite ? "Favorit entfernt" : "Als Favorit gemerkt");
            }}
            className={cx(contact.favorite && "text-amber-600 ring-amber-200")}
          >
            <Star
              className={cx(
                "h-3.5 w-3.5",
                contact.favorite && "fill-amber-400 text-amber-400",
              )}
            />
            {contact.favorite ? "Favorit" : "Favorit"}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              role === "admin"
                ? setEditing(true)
                : toast("Nur Administratoren dürfen Kontakte bearbeiten")
            }
            className={cx(role !== "admin" && "opacity-60")}
          >
            <Pencil className="h-3.5 w-3.5" />
            Bearbeiten
          </Button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Kontaktdaten */}
        <section className="lg:col-span-2">
          <SectionTitle title="Kontaktdaten" />
          <div className="card divide-y divide-line overflow-hidden">
            <DataRow
              icon={Phone}
              label="Festnetz"
              value={contact.phone}
              extra={contact.extension ? `Durchwahl ${contact.extension}` : undefined}
              href={contact.phone ? telHref(landline) : undefined}
              onCopy={() => copy(landline, "Telefonnummer")}
            />
            <DataRow
              icon={Smartphone}
              label="Mobil"
              value={contact.mobile}
              href={contact.mobile ? telHref(contact.mobile) : undefined}
              onCopy={() => copy(contact.mobile, "Mobilnummer")}
            />
            <DataRow
              icon={Mail}
              label="E-Mail"
              value={contact.email}
              href={contact.email ? `mailto:${contact.email}` : undefined}
              onCopy={() => copy(contact.email, "E-Mail-Adresse")}
            />
            <DataRow
              icon={MapPin}
              label="Adresse"
              value={address}
              href={address ? mapsHref(contact.address) : undefined}
              external
              onCopy={() => copy(address, "Adresse")}
            />
          </div>

          {contact.notes ? (
            <div className="mt-4">
              <SectionTitle title="Notizen" icon={StickyNote} />
              <div className="card p-4">
                <p className="text-sm leading-relaxed text-ink-700">{contact.notes}</p>
              </div>
            </div>
          ) : null}
        </section>

        {/* Projekte / Meta */}
        <section className="space-y-5">
          <div>
            <SectionTitle title="Projekte" icon={Briefcase} />
            {contactProjects.length === 0 ? (
              <div className="card px-4 py-5 text-center text-xs text-ink-500">
                Keinem Projekt zugeordnet.
              </div>
            ) : (
              <div className="card divide-y divide-line overflow-hidden">
                {contactProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projekte/${p.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[10px] font-semibold text-brand-700">
                      {p.number.slice(-3)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {p.number} · {p.status}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {company ? (
            <div>
              <SectionTitle title="Firma" icon={Building2} />
              <Link href={`/firmen/${company.id}`} className="card card-hover block p-4">
                <p className="text-sm font-medium text-ink-900">{company.name}</p>
                <p className="mt-0.5 text-xs text-ink-500">{company.trade}</p>
                <p className="mt-2 text-xs tabular-nums text-ink-700">{company.phone}</p>
                <p className="text-xs text-ink-500">{formatAddress(company.address)}</p>
              </Link>
            </div>
          ) : null}

          <p className="px-1 text-[11px] text-ink-400">
            Zuletzt geändert {formatDateTime(contact.updatedAt)}
          </p>
        </section>
      </div>

      <ContactForm open={editing} onClose={() => setEditing(false)} initial={contact} />
    </div>
  );
}

function PrimaryAction({
  href,
  icon: Icon,
  label,
  primary = false,
}: {
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary?: boolean;
}) {
  const base =
    "flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors sm:h-14";
  if (!href) {
    return (
      <span className={cx(base, "bg-white text-slate-300 ring-1 ring-inset ring-line")}>
        <Icon className="h-5 w-5" />
        {label}
      </span>
    );
  }
  const isExternal = href.startsWith("http");
  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
      className={cx(
        base,
        "focus-ring",
        primary
          ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700"
          : "bg-white text-ink-700 ring-1 ring-inset ring-line hover:bg-slate-100",
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </a>
  );
}

function DataRow({
  icon: Icon,
  label,
  value,
  extra,
  href,
  external,
  onCopy,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  extra?: string;
  href?: string;
  external?: boolean;
  onCopy?: () => void;
}) {
  const empty = !value;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
        {empty ? (
          <p className="text-sm text-ink-400">–</p>
        ) : href ? (
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            className="block truncate text-sm font-medium text-ink-900 hover:text-brand-600 hover:underline"
          >
            {value}
          </a>
        ) : (
          <p className="truncate text-sm font-medium text-ink-900">{value}</p>
        )}
        {extra ? <p className="text-xs text-ink-500">{extra}</p> : null}
      </div>
      {!empty && onCopy ? (
        <button
          type="button"
          onClick={onCopy}
          title={`${label} kopieren`}
          aria-label={`${label} kopieren`}
          className="focus-ring shrink-0 rounded-lg p-2 text-ink-400 transition-colors hover:bg-slate-100 hover:text-ink-700"
        >
          <Copy className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
