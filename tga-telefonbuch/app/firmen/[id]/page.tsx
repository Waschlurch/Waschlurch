"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Copy,
  Globe,
  Mail,
  MapPin,
  Navigation,
  Phone,
  StickyNote,
  Users,
} from "lucide-react";
import { ContactItem } from "@/components/ContactItem";
import {
  Badge,
  Breadcrumb,
  Button,
  CategoryBadge,
  EmptyState,
  LinkButton,
  SectionTitle,
  useToast,
} from "@/components/ui";
import { useCategoryMap, useStore } from "@/lib/store";
import {
  copyToClipboard,
  formatAddress,
  mapsHref,
  sortContacts,
  telHref,
} from "@/lib/utils";

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { companies, contacts, projects, ready } = useStore();
  const cats = useCategoryMap();

  const company = companies.find((c) => c.id === id);

  const staff = useMemo(
    () => contacts.filter((c) => c.companyId === id).sort(sortContacts),
    [contacts, id],
  );
  const companyProjects = useMemo(
    () =>
      company
        ? projects.filter(
            (p) =>
              company.projectIds.includes(p.id) ||
              p.roles.some((r) => r.companyId === company.id),
          )
        : [],
    [projects, company],
  );

  if (!ready) return <div className="card h-72 animate-pulse" />;

  if (!company) {
    return (
      <EmptyState
        icon={Building2}
        title="Firma nicht gefunden"
        action={<Button onClick={() => router.push("/firmen")}>Zur Firmenliste</Button>}
      />
    );
  }

  const address = formatAddress(company.address);

  async function copy(value: string, label: string) {
    const ok = await copyToClipboard(value);
    toast(ok ? `${label} kopiert` : "Kopieren nicht möglich");
  }

  return (
    <div className="space-y-5">
      <div className="hidden sm:block">
        <Breadcrumb
          items={[{ label: "Firmen", href: "/firmen" }, { label: company.name }]}
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

      {/* Kopfbereich */}
      <section className="card overflow-hidden">
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-ink-500 sm:h-16 sm:w-16">
            <Building2 className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
              {company.name}
            </h1>
            <p className="mt-0.5 text-sm text-ink-700">{company.trade}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <CategoryBadge cat={cats.get(company.category)} />
              {company.address.city ? (
                <Badge tone="slate">
                  <MapPin className="h-3 w-3" />
                  {company.address.city}
                </Badge>
              ) : null}
              <Badge tone="slate">
                <Users className="h-3 w-3" />
                {staff.length} Ansprechpartner
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-slate-50 p-3">
          {company.phone ? (
            <LinkButton tone="primary" size="sm" href={telHref(company.phone)}>
              <Phone className="h-3.5 w-3.5" />
              Zentrale anrufen
            </LinkButton>
          ) : null}
          {company.email ? (
            <LinkButton size="sm" href={`mailto:${company.email}`}>
              <Mail className="h-3.5 w-3.5" />
              E-Mail
            </LinkButton>
          ) : null}
          {address ? (
            <LinkButton
              size="sm"
              href={mapsHref(company.address)}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation className="h-3.5 w-3.5" />
              Adresse öffnen
            </LinkButton>
          ) : null}
          {company.website ? (
            <LinkButton
              size="sm"
              href={`https://${company.website.replace(/^https?:\/\//, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <Globe className="h-3.5 w-3.5" />
              Website
            </LinkButton>
          ) : null}
          <Button size="sm" onClick={() => copy(company.phone, "Telefonnummer")}>
            <Copy className="h-3.5 w-3.5" />
            Nummer kopieren
          </Button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Ansprechpartner */}
        <section className="lg:col-span-2">
          <SectionTitle title="Ansprechpartner" icon={Users} />
          {staff.length === 0 ? (
            <div className="card px-4 py-6 text-center text-xs text-ink-500">
              Für diese Firma ist noch kein Ansprechpartner hinterlegt.
            </div>
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {staff.map((c) => (
                <ContactItem key={c.id} contact={c} showCategory={false} />
              ))}
            </div>
          )}

          {company.notes ? (
            <div className="mt-5">
              <SectionTitle title="Notizen" icon={StickyNote} />
              <div className="card p-4">
                <p className="text-sm leading-relaxed text-ink-700">{company.notes}</p>
              </div>
            </div>
          ) : null}
        </section>

        {/* Firmendaten + Projekte */}
        <section className="space-y-5">
          <div>
            <SectionTitle title="Firmendaten" />
            <dl className="card divide-y divide-line overflow-hidden text-sm">
              <Row label="Haupttelefon">
                {company.phone ? (
                  <a
                    href={telHref(company.phone)}
                    className="font-medium tabular-nums text-ink-900 hover:text-brand-600"
                  >
                    {company.phone}
                  </a>
                ) : (
                  "–"
                )}
              </Row>
              <Row label="Allgemeine E-Mail">
                {company.email ? (
                  <a
                    href={`mailto:${company.email}`}
                    className="font-medium break-all text-ink-900 hover:text-brand-600"
                  >
                    {company.email}
                  </a>
                ) : (
                  "–"
                )}
              </Row>
              <Row label="Website">
                {company.website ? (
                  <a
                    href={`https://${company.website.replace(/^https?:\/\//, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium break-all text-ink-900 hover:text-brand-600"
                  >
                    {company.website}
                  </a>
                ) : (
                  "–"
                )}
              </Row>
              <Row label="Adresse">
                {address ? (
                  <a
                    href={mapsHref(company.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-ink-900 hover:text-brand-600"
                  >
                    {address}
                  </a>
                ) : (
                  "–"
                )}
              </Row>
            </dl>
          </div>

          <div>
            <SectionTitle title="Zugehörige Projekte" icon={Briefcase} />
            {companyProjects.length === 0 ? (
              <div className="card px-4 py-5 text-center text-xs text-ink-500">
                Keine Projektzuordnung.
              </div>
            ) : (
              <div className="card divide-y divide-line overflow-hidden">
                {companyProjects.map((p) => {
                  const role = p.roles.find((r) => r.companyId === company.id);
                  return (
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
                          {p.number}
                          {role ? ` · ${role.role}` : ""}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-700">{children}</dd>
    </div>
  );
}
