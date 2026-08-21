/**
 * Kategorien sind bewusst als freier String typisiert: Admins dürfen im
 * Prototyp eigene Kategorien anlegen und umbenennen.
 */
export type CategoryId = string;

export interface Category {
  id: CategoryId;
  label: string;
  /** Plural für Listenüberschriften */
  labelPlural: string;
  color: string; // Tailwind-Klassen für Badge
  dot: string; // Tailwind-Klasse für Farbpunkt
}

export interface Address {
  street: string;
  zip: string;
  city: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  companyId: string | null;
  /** Anzeigename der Firma, falls kein Firmendatensatz existiert */
  companyName?: string;
  position: string;
  /** Fachbereich, z. B. "Heizung / Sanitär" */
  department: string;
  category: CategoryId;
  phone: string;
  extension: string;
  mobile: string;
  email: string;
  address: Address;
  notes: string;
  favorite: boolean;
  projectIds: string[];
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  category: CategoryId;
  /** Gewerk/Branche im Klartext, z. B. "Heizungsbauer" */
  trade: string;
  phone: string;
  email: string;
  website: string;
  address: Address;
  notes: string;
  projectIds: string[];
  updatedAt: string;
}

export interface ProjectRole {
  /** Rolle im Projekt, z. B. "Heizung / Sanitär" */
  role: string;
  companyId: string | null;
  contactId: string | null;
}

export type ProjectStatus = "Ausführung" | "Planung" | "Ausschreibung" | "Abgeschlossen";

export interface Project {
  id: string;
  number: string;
  name: string;
  city: string;
  status: ProjectStatus;
  lead: string;
  notes: string;
  roles: ProjectRole[];
  updatedAt: string;
}

export type Role = "admin" | "mitarbeiter";

export interface SyncState {
  online: boolean;
  lastSync: string; // ISO
  syncing: boolean;
  pendingChanges: number;
}
