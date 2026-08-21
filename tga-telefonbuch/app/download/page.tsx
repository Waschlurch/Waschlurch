"use client";

import Link from "next/link";
import {
  Apple,
  Globe,
  Cloud,
  Monitor,
  Search,
  Share,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { Badge, LinkButton, useToast } from "@/components/ui";
import { useStore } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";

const PLATFORMS = [
  {
    id: "windows",
    icon: Monitor,
    title: "Windows herunterladen",
    subtitle: "Installer · 48 MB",
    primary: true,
  },
  {
    id: "android",
    icon: Smartphone,
    title: "Android installieren",
    subtitle: "APK · 22 MB",
    primary: false,
  },
  {
    id: "browser",
    icon: Globe,
    title: "Im Browser öffnen",
    subtitle: "Ohne Installation",
    primary: false,
    href: "/",
  },
  {
    id: "ios",
    icon: Apple,
    title: "Auf iPhone verwenden",
    subtitle: "Zum Home-Bildschirm hinzufügen",
    primary: false,
  },
];

export default function DownloadPage() {
  const { lastSync, contacts, companies, projects } = useStore();
  const toast = useToast();

  return (
    <div className="space-y-8 pb-6">
      {/* Kopfbereich */}
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-b from-brand-50 to-white px-6 py-10 text-center sm:px-10 sm:py-14">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white shadow-lg shadow-brand-600/20">
            TB
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            TGA Telefonbuch
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-500 sm:text-base">
            Das zentrale Telefonbuch unseres Ingenieurbüros.
          </p>

          <div className="mx-auto mt-7 grid max-w-2xl gap-2.5 sm:grid-cols-2">
            {PLATFORMS.map((p) => {
              const Icon = p.icon;
              if (p.href) {
                return (
                  <Link
                    key={p.id}
                    href={p.href}
                    className="focus-ring flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-ink-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {p.title}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {p.subtitle}
                      </span>
                    </span>
                  </Link>
                );
              }
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    toast("Prototyp – der Download ist noch nicht hinterlegt")
                  }
                  className={
                    p.primary
                      ? "focus-ring flex items-center gap-3 rounded-xl bg-brand-600 px-4 py-3 text-left text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700"
                      : "focus-ring flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  }
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${p.primary ? "text-white" : "text-ink-500"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium ${p.primary ? "text-white" : "text-ink-900"}`}
                    >
                      {p.title}
                    </span>
                    <span
                      className={`block truncate text-xs ${p.primary ? "text-brand-100" : "text-ink-500"}`}
                    >
                      {p.subtitle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
            <span>
              Version <strong className="font-medium text-ink-700">0.1</strong>
            </span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span>Letztes Update {formatDateTime(lastSync)}</span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <Badge tone="amber">Prototyp</Badge>
          </div>
        </div>
      </section>

      {/* Funktionen */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Was die App kann</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={Search}
            title="Eine Suche für alles"
            text="Name, Firma, Telefonnummer, E-Mail, Projekt oder Branche – ein Feld genügt."
          />
          <Feature
            icon={WifiOff}
            title="Offline verfügbar"
            text="Alle Kontakte liegen auf dem Gerät. Auch auf der Baustelle ohne Empfang."
          />
          <Feature
            icon={Cloud}
            title="Automatischer Abgleich"
            text="Sobald Internet da ist, wird mit der zentralen Datenbank synchronisiert."
          />
          <Feature
            icon={Smartphone}
            title="Einhandbedienung"
            text="Große Anruf-Schaltflächen und eine Navigation am unteren Rand."
          />
        </div>
      </section>

      {/* Installationshinweise */}
      <section className="grid gap-3 lg:grid-cols-3">
        <InstallCard
          icon={Monitor}
          title="Windows"
          steps={[
            "Installer herunterladen und starten",
            "Anmelden mit den Bürodaten",
            "Erste Synchronisierung abwarten",
          ]}
        />
        <InstallCard
          icon={Smartphone}
          title="Android"
          steps={[
            "APK herunterladen oder aus dem internen Store installieren",
            "Installation aus unbekannter Quelle bestätigen",
            "Anmelden und synchronisieren",
          ]}
        />
        <InstallCard
          icon={Apple}
          title="iPhone"
          steps={[
            "Seite in Safari öffnen",
            "Teilen-Symbol antippen",
            "„Zum Home-Bildschirm“ wählen",
          ]}
          note="Läuft als installierte Web-App, kein App Store nötig."
        />
      </section>

      {/* Datenstand */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-ink-900">Aktueller Datenbestand</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Stand der letzten Synchronisierung: {formatDateTime(lastSync)}
          </p>
        </div>
        <div className="flex gap-6">
          {[
            ["Kontakte", contacts.length],
            ["Firmen", companies.length],
            ["Projekte", projects.length],
          ].map(([label, value]) => (
            <div key={label as string} className="text-center">
              <p className="text-lg font-semibold tabular-nums text-ink-900">{value}</p>
              <p className="text-[11px] text-ink-500">{label}</p>
            </div>
          ))}
        </div>
        <LinkButton tone="primary" href="/">
          Im Browser öffnen
        </LinkButton>
      </section>

      <p className="text-center text-xs text-ink-400">
        Interne Anwendung des Ingenieurbüros Hartmann TGA GmbH · Fragen an die IT
        (Durchwahl -25)
      </p>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="card p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <p className="mt-3 text-sm font-medium text-ink-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">{text}</p>
    </div>
  );
}

function InstallCard({
  icon: Icon,
  title,
  steps,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  steps: string[];
  note?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 text-ink-500" />
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 text-xs text-ink-700">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      {note ? (
        <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-[11px] text-ink-500">
          <Share className="mt-px h-3 w-3 shrink-0" />
          {note}
        </p>
      ) : null}
    </div>
  );
}
