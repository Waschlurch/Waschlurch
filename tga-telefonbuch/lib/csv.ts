import type { Category, Company, Contact } from "./types";
import { slugId } from "./utils";

/** Minimaler CSV-Parser mit Unterstützung für Anführungszeichen und ; oder ,. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const delimiter = guessDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function guessDelimiter(text: string): string {
  const head = text.split("\n", 1)[0] ?? "";
  const semis = (head.match(/;/g) ?? []).length;
  const commas = (head.match(/,/g) ?? []).length;
  const tabs = (head.match(/\t/g) ?? []).length;
  if (tabs > semis && tabs > commas) return "\t";
  return semis >= commas ? ";" : ",";
}

const ALIASES: Record<string, string[]> = {
  firstName: ["vorname", "first name", "firstname"],
  lastName: ["nachname", "name", "last name", "lastname"],
  company: ["firma", "unternehmen", "company"],
  position: ["position", "funktion", "rolle"],
  department: ["bereich", "abteilung", "gewerk"],
  category: ["kategorie", "typ", "art"],
  phone: ["festnetz", "telefon", "telefonnummer", "tel"],
  extension: ["durchwahl", "dw"],
  mobile: ["mobil", "handy", "mobiltelefon"],
  email: ["e-mail", "email", "mail"],
  street: ["strasse", "straße", "adresse"],
  zip: ["plz", "postleitzahl"],
  city: ["ort", "stadt"],
  notes: ["notizen", "bemerkung", "hinweis"],
};

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .trim();
}

export interface ImportResult {
  contacts: Contact[];
  skipped: number;
  headers: string[];
}

/** Wandelt CSV-Zeilen in Kontakte um und legt fehlende Firmen mit an. */
export function csvToContacts(
  text: string,
  companies: Company[],
  categories: Category[],
): ImportResult & { newCompanies: Company[] } {
  const rows = parseCsv(text);
  if (rows.length < 2)
    return { contacts: [], skipped: 0, headers: rows[0] ?? [], newCompanies: [] };

  const headers = rows[0];
  const index: Record<string, number> = {};
  headers.forEach((h, i) => {
    const n = normHeader(h);
    for (const [key, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(n) && index[key] === undefined) index[key] = i;
    }
  });

  const get = (row: string[], key: string) =>
    index[key] === undefined ? "" : (row[index[key]] ?? "").trim();

  const companyByName = new Map(companies.map((c) => [c.name.toLowerCase(), c]));
  const newCompanies: Company[] = [];
  const contacts: Contact[] = [];
  let skipped = 0;

  const now = new Date().toISOString();
  const catIds = new Set(categories.map((c) => c.id));
  const catByLabel = new Map(categories.map((c) => [c.label.toLowerCase(), c.id]));

  for (const row of rows.slice(1)) {
    const firstName = get(row, "firstName");
    const lastName = get(row, "lastName");
    if (!firstName && !lastName) {
      skipped++;
      continue;
    }

    const companyName = get(row, "company");
    let companyId: string | null = null;
    if (companyName) {
      const existing =
        companyByName.get(companyName.toLowerCase()) ??
        newCompanies.find((c) => c.name.toLowerCase() === companyName.toLowerCase());
      if (existing) {
        companyId = existing.id;
      } else {
        const created: Company = {
          id: slugId("f"),
          name: companyName,
          category: "handwerker",
          trade: get(row, "department"),
          phone: get(row, "phone"),
          email: "",
          website: "",
          address: {
            street: get(row, "street"),
            zip: get(row, "zip"),
            city: get(row, "city"),
          },
          notes: "Über CSV-Import angelegt.",
          projectIds: [],
          updatedAt: now,
        };
        newCompanies.push(created);
        companyId = created.id;
      }
    }

    const rawCat = get(row, "category").toLowerCase();
    const category = catIds.has(rawCat)
      ? rawCat
      : (catByLabel.get(rawCat) ?? "handwerker");

    contacts.push({
      id: slugId("k"),
      firstName,
      lastName,
      companyId,
      companyName: companyId ? undefined : companyName || undefined,
      position: get(row, "position"),
      department: get(row, "department"),
      category,
      phone: get(row, "phone"),
      extension: get(row, "extension"),
      mobile: get(row, "mobile"),
      email: get(row, "email"),
      address: {
        street: get(row, "street"),
        zip: get(row, "zip"),
        city: get(row, "city"),
      },
      notes: get(row, "notes"),
      favorite: false,
      projectIds: [],
      updatedAt: now,
    });
  }

  return { contacts, skipped, headers, newCompanies };
}

export const CSV_TEMPLATE = `Vorname;Nachname;Firma;Position;Bereich;Kategorie;Festnetz;Durchwahl;Mobil;E-Mail;Straße;PLZ;Ort
Lars;Vogt;Vogt Kältetechnik GmbH;Projektleiter;Kälte;Handwerker;02241 556677;-12;0171 9988776;l.vogt@vogt-kaelte.de;Kölner Straße 5;53721;Siegburg
Sandra;Ritter;Ritter Ingenieure;Fachplanerin;Elektrotechnik;Fachplaner;0228 445566;-8;0176 55443322;s.ritter@ritter-ing.de;Bonner Talweg 12;53113;Bonn`;
