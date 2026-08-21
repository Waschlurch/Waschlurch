"use client";

import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import { cx } from "./ui";

/** Kompakte Statuspille für die Kopfzeile. */
export function SyncPill({ className }: { className?: string }) {
  const { online, syncing, lastSync, pendingChanges, sync } = useStore();

  const label = syncing
    ? "Synchronisiere …"
    : online
      ? pendingChanges > 0
        ? `${pendingChanges} Änderung${pendingChanges === 1 ? "" : "en"} offen`
        : "Kontakte synchronisiert"
      : `Letzte Sync. ${formatDateTime(lastSync)}`;

  return (
    <button
      type="button"
      onClick={sync}
      disabled={!online || syncing}
      title={online ? "Jetzt synchronisieren" : "Offline – lokale Daten werden genutzt"}
      className={cx(
        "focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        online
          ? pendingChanges > 0
            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-slate-200 bg-slate-100 text-slate-600",
        className,
      )}
    >
      {syncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : online ? (
        <Cloud className="h-3.5 w-3.5" />
      ) : (
        <CloudOff className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">
        {online ? "Online" : "Offline"} <span className="text-ink-400">·</span>{" "}
      </span>
      <span className="max-w-[13rem] truncate">{label}</span>
    </button>
  );
}

/** Ausführliche Statuskarte für Dashboard und „Mehr“. */
export function SyncCard() {
  const { online, syncing, lastSync, pendingChanges, sync, setOnline, contacts } =
    useStore();

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            online ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500",
          )}
        >
          {online ? <Cloud className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">
            {online ? "Online – Kontakte synchronisiert" : "Offline"}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {online
              ? pendingChanges > 0
                ? `${pendingChanges} lokale Änderung${pendingChanges === 1 ? "" : "en"} noch nicht übertragen.`
                : `Letzte Synchronisierung ${formatDateTime(lastSync)}`
              : `Letzte Synchronisierung ${formatDateTime(lastSync)}`}
          </p>
          <p className="mt-2 text-xs text-ink-500">
            {contacts.length} Kontakte sind lokal gespeichert und auch ohne Internet
            verfügbar.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={sync}
          disabled={!online || syncing}
          className="focus-ring inline-flex h-8 items-center gap-2 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          <RefreshCw className={cx("h-3.5 w-3.5", syncing && "animate-spin")} />
          Jetzt synchronisieren
        </button>
        <button
          type="button"
          onClick={() => setOnline(!online)}
          className="focus-ring inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-ink-500 ring-1 ring-inset ring-line transition-colors hover:bg-slate-50"
        >
          {online ? "Offline simulieren" : "Wieder online gehen"}
        </button>
      </div>
    </div>
  );
}
