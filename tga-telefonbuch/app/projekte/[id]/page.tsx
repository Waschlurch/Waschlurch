"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Mail,
  MapPin,
  Phone,
  Smartphone,
  StickyNote,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  EmptyState,
  SectionTitle,
} from "@/components/ui";
import { useCompanyMap, useContactMap, useStore } from "@/lib/store";
import type { ProjectStatus } from "@/lib/types";
import { fullName, fullPhone, telHref } from "@/lib/utils";

const STATUS_TONE: Record<ProjectStatus, "brand" | "amber" | "green" | "slate"> = {
  Planung: "brand",
  Ausschreibung: "amber",
  Ausführung: "green",
  Abgeschlossen: "slate",
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { projects, ready } = useStore();
  const contacts = useContactMap();
  const companies = useCompanyMap();

  const project = projects.find((p) => p.id === id);

  if (!ready) return <div className="card h-72 animate-pulse" />;

  if (!project) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Projekt nicht gefunden"
        action={<Button onClick={() => router.push("/projekte")}>Zur Projektliste</Button>}
      />
    );
  }

  const lead = contacts.get(project.lead);

  return (
    <div className="space-y-5">
      <div className="hidden sm:block">
        <Breadcrumb
          items={[
            { label: "Projekte", href: "/projekte" },
            { label: `${project.number} – ${project.name}` },
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

      {/* Kopfbereich */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tabular-nums text-ink-500">
              Projekt {project.number}
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
              {project.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={STATUS_TONE[project.status]}>{project.status}</Badge>
              <Badge tone="slate">
                <MapPin className="h-3 w-3" />
                {project.city}
              </Badge>
              <Badge tone="slate">
                <Users className="h-3 w-3" />
                {project.roles.length} Beteiligte
              </Badge>
            </div>
          </div>
          {lead ? (
            <Link
              href={`/kontakte/${lead.id}`}
              className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 transition-colors hover:bg-slate-50"
            >
              <Avatar name={fullName(lead)} size="sm" />
              <span className="min-w-0">
                <span className="block text-[11px] text-ink-400">Projektleitung</span>
                <span className="block truncate text-xs font-medium text-ink-900">
                  {fullName(lead)}
                </span>
              </span>
            </Link>
          ) : null}
        </div>

        {project.notes ? (
          <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink-700">
            <StickyNote className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5 text-ink-400" />
            {project.notes}
          </p>
        ) : null}
      </section>

      {/* Projektbeteiligte */}
      <section>
        <SectionTitle title="Projektkontakte" icon={Users} />
        <div className="grid gap-3 sm:grid-cols-2">
          {project.roles.map((role, i) => {
            const contact = role.contactId ? contacts.get(role.contactId) : undefined;
            const company = role.companyId ? companies.get(role.companyId) : undefined;
            const landline = contact ? fullPhone(contact) : (company?.phone ?? "");
            const href = contact
              ? `/kontakte/${contact.id}`
              : company
                ? `/firmen/${company.id}`
                : "#";

            return (
              <div key={i} className="card card-hover relative p-4">
                <Link
                  href={href}
                  className="absolute inset-0 z-0 rounded-[14px]"
                  aria-label={`${role.role} öffnen`}
                />
                <p className="pointer-events-none relative z-10 text-[11px] font-semibold uppercase tracking-wider text-brand-600">
                  {role.role}
                </p>

                <div className="pointer-events-none relative z-10 mt-2 flex items-start gap-3">
                  {contact ? (
                    <Avatar name={fullName(contact)} size="md" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink-500">
                      <Building2 className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {contact ? fullName(contact) : (company?.name ?? "Offen")}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {contact
                        ? [company?.name, contact.position].filter(Boolean).join(" · ")
                        : (company?.trade ?? "Noch nicht besetzt")}
                    </p>
                  </div>
                </div>

                <div className="relative z-10 mt-3 flex items-center gap-1.5 border-t border-line pt-3">
                  <span className="min-w-0 flex-1 truncate text-xs tabular-nums text-ink-500">
                    {landline || "–"}
                  </span>
                  {landline ? (
                    <a
                      href={telHref(landline)}
                      title="Anrufen"
                      aria-label="Anrufen"
                      className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  ) : null}
                  {contact?.mobile ? (
                    <a
                      href={telHref(contact.mobile)}
                      title="Mobil anrufen"
                      aria-label="Mobil anrufen"
                      className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-slate-100 hover:text-ink-700"
                    >
                      <Smartphone className="h-4 w-4" />
                    </a>
                  ) : null}
                  {(contact?.email ?? company?.email) ? (
                    <a
                      href={`mailto:${contact?.email ?? company?.email}`}
                      title="E-Mail schreiben"
                      aria-label="E-Mail schreiben"
                      className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-slate-100 hover:text-ink-700"
                    >
                      <Mail className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
