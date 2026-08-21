import type { Category, CategoryId } from "./types";

export const CATEGORIES: Category[] = [
  {
    id: "intern",
    label: "Interner Mitarbeiter",
    labelPlural: "Interne Mitarbeiter",
    color: "bg-brand-50 text-brand-700 ring-brand-100",
    dot: "bg-brand-500",
  },
  {
    id: "handwerker",
    label: "Handwerker",
    labelPlural: "Handwerker",
    color: "bg-amber-50 text-amber-700 ring-amber-100",
    dot: "bg-amber-500",
  },
  {
    id: "hersteller",
    label: "Hersteller",
    labelPlural: "Hersteller",
    color: "bg-violet-50 text-violet-700 ring-violet-100",
    dot: "bg-violet-500",
  },
  {
    id: "behoerde",
    label: "Behörde",
    labelPlural: "Behörden",
    color: "bg-slate-100 text-slate-700 ring-slate-200",
    dot: "bg-slate-500",
  },
  {
    id: "architekt",
    label: "Architekt",
    labelPlural: "Architekten",
    color: "bg-rose-50 text-rose-700 ring-rose-100",
    dot: "bg-rose-500",
  },
  {
    id: "fachplaner",
    label: "Fachplaner",
    labelPlural: "Fachplaner",
    color: "bg-teal-50 text-teal-700 ring-teal-100",
    dot: "bg-teal-500",
  },
  {
    id: "bauherr",
    label: "Bauherr",
    labelPlural: "Bauherren",
    color: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    dot: "bg-emerald-500",
  },
];

const byId = new Map<CategoryId, Category>(CATEGORIES.map((c) => [c.id, c]));

export function category(id: CategoryId): Category {
  return byId.get(id) ?? CATEGORIES[0];
}
