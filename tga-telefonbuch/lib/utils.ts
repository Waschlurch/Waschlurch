import type { Company, Contact, Project } from "./types";

export function fullName(c: Contact): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stabile, dezente Avatarfarbe aus dem Namen. */
const AVATAR_COLORS = [
  "bg-brand-100 text-brand-700",
  "bg-teal-100 text-teal-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-slate-200 text-slate-700",
];

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function digits(s: string): string {
  return s.replace(/[^\d+]/g, "");
}

/** Festnetz inklusive Durchwahl als wählbare Nummer. */
export function fullPhone(c: Pick<Contact, "phone" | "extension">): string {
  if (!c.phone) return "";
  if (!c.extension) return c.phone;
  return `${c.phone} ${c.extension}`;
}

export function telHref(number: string): string {
  return `tel:${digits(number).replace(/^0/, "+49").replace(/\s/g, "")}`;
}

export function whatsappHref(mobile: string): string {
  const d = digits(mobile).replace(/^\+/, "");
  const intl = d.startsWith("49") ? d : d.replace(/^0/, "49");
  return `https://wa.me/${intl}`;
}

export function mapsHref(a: { street: string; zip: string; city: string }): string {
  const q = encodeURIComponent(`${a.street}, ${a.zip} ${a.city}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function formatAddress(a: { street: string; zip: string; city: string }): string {
  if (!a.street && !a.city) return "";
  return `${a.street}, ${a.zip} ${a.city}`.replace(/^, /, "");
}

const DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string): string {
  try {
    return DATE_FMT.format(new Date(iso)).replace(",", ",");
  } catch {
    return iso;
  }
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return `vor ${d} Tag${d === 1 ? "" : "en"}`;
}

// ── Suche ─────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

export interface SearchIndexes {
  companies: Map<string, Company>;
  projects: Project[];
}

/**
 * Sucht über Name, Firma, Telefonnummer, E-Mail, Projekt und Branche.
 * Mehrere Begriffe werden UND-verknüpft.
 */
export function matchesContact(
  contact: Contact,
  query: string,
  idx: SearchIndexes,
): boolean {
  const q = norm(query).trim();
  if (!q) return true;

  const company = contact.companyId ? idx.companies.get(contact.companyId) : undefined;
  const projects = idx.projects.filter((p) => contact.projectIds.includes(p.id));

  const haystack = norm(
    [
      fullName(contact),
      contact.position,
      contact.department,
      company?.name ?? contact.companyName ?? "",
      company?.trade ?? "",
      contact.email,
      contact.address.city,
      contact.address.street,
      contact.address.zip,
      contact.notes,
      ...projects.map((p) => `${p.number} ${p.name} ${p.city}`),
    ].join(" "),
  );

  const phoneHay = digits(`${contact.phone}${contact.extension}${contact.mobile}`);

  return q.split(/\s+/).every((term) => {
    if (haystack.includes(term)) return true;
    const d = digits(term);
    return d.length >= 3 && phoneHay.includes(d);
  });
}

export function matchesCompany(company: Company, query: string, projects: Project[]): boolean {
  const q = norm(query).trim();
  if (!q) return true;
  const own = projects.filter((p) => company.projectIds.includes(p.id));
  const haystack = norm(
    [
      company.name,
      company.trade,
      company.email,
      company.website,
      company.address.city,
      company.address.street,
      company.address.zip,
      company.notes,
      ...own.map((p) => `${p.number} ${p.name}`),
    ].join(" "),
  );
  const phoneHay = digits(company.phone);
  return q.split(/\s+/).every((term) => {
    if (haystack.includes(term)) return true;
    const d = digits(term);
    return d.length >= 3 && phoneHay.includes(d);
  });
}

export function matchesProject(project: Project, query: string): boolean {
  const q = norm(query).trim();
  if (!q) return true;
  const haystack = norm(
    [project.number, project.name, project.city, project.status, project.notes].join(" "),
  );
  return q.split(/\s+/).every((t) => haystack.includes(t));
}

export function sortContacts(a: Contact, b: Contact): number {
  return (
    a.lastName.localeCompare(b.lastName, "de") ||
    a.firstName.localeCompare(b.firstName, "de")
  );
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback für Browser ohne Clipboard-API bzw. unsicheren Kontext.
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function slugId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
