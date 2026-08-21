"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Check, Info } from "lucide-react";
import { avatarColor, initials } from "@/lib/utils";
import type { Category } from "@/lib/types";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ── Avatar ────────────────────────────────────────────────────────────

export function Avatar({
  name,
  size = "md",
  square = false,
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  square?: boolean;
}) {
  const sizes = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-xs",
    lg: "h-12 w-12 text-sm",
    xl: "h-16 w-16 text-lg sm:h-20 sm:w-20 sm:text-xl",
  } as const;
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center font-semibold tracking-wide",
        square ? "rounded-xl" : "rounded-full",
        sizes[size],
        avatarColor(name),
      )}
    >
      {initials(name)}
    </span>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────

export function CategoryBadge({ cat, className }: { cat?: Category; className?: string }) {
  if (!cat) return null;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        cat.color,
        className,
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", cat.dot)} />
      {cat.label}
    </span>
  );
}

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: React.ReactNode;
  tone?: "slate" | "brand" | "green" | "amber" | "rose";
  className?: string;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    brand: "bg-brand-50 text-brand-700 ring-brand-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

const buttonTones: Record<ButtonTone, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-600/20",
  secondary:
    "bg-white text-ink-700 ring-1 ring-inset ring-line hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-ink-700 hover:bg-slate-100 active:bg-slate-200",
  danger:
    "bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 active:bg-rose-100",
};

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-ring disabled:opacity-50 disabled:pointer-events-none";

export function Button({
  tone = "secondary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  size?: "sm" | "md";
}) {
  return (
    <button
      {...rest}
      className={cx(
        buttonBase,
        buttonTones[tone],
        size === "sm" ? "h-8 px-3" : "h-10 px-4",
        className,
      )}
    />
  );
}

export function LinkButton({
  tone = "secondary",
  size = "md",
  className,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  tone?: ButtonTone;
  size?: "sm" | "md";
}) {
  return (
    <a
      {...rest}
      className={cx(
        buttonBase,
        buttonTones[tone],
        size === "sm" ? "h-8 px-3" : "h-10 px-4",
        className,
      )}
    />
  );
}

// ── Formularfelder ────────────────────────────────────────────────────

const fieldBase =
  "w-full rounded-lg border border-line bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-ink-500";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-ink-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-ink-500">{hint}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldBase, "h-10", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldBase, "py-2", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldBase, "h-10 pr-8", props.className)} />;
}

// ── Karte / Abschnitt ─────────────────────────────────────────────────

export function SectionTitle({
  title,
  action,
  icon: Icon,
}: {
  title: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        {Icon ? <Icon className="h-4 w-4 text-ink-400" /> : null}
        {title}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Info,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-5 w-5 text-ink-400" />
      </span>
      <p className="text-sm font-medium text-ink-900">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Breadcrumb({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav className="mb-3 flex items-center gap-1.5 text-xs text-ink-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? <span className="text-ink-400">/</span> : null}
          {item.href ? (
            <Link href={item.href} className="hover:text-brand-600 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ── Toasts ────────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  text: string;
}

const ToastContext = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, text }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2400);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-100 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            className="animate-toast-in flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2 text-xs font-medium text-white shadow-lg"
          >
            <Check className="h-3.5 w-3.5 text-emerald-300" />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
