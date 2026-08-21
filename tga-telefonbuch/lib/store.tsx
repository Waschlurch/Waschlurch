"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Category, Company, Contact, Project, Role } from "./types";
import { CATEGORIES } from "./categories";
import { COMPANIES, CONTACTS, INITIAL_RECENT, PROJECTS } from "./demo-data";

const STORAGE_KEY = "tga-telefonbuch:v1";

interface Persisted {
  contacts: Contact[];
  companies: Company[];
  projects: Project[];
  categories: Category[];
  recentIds: string[];
  role: Role;
  lastSync: string;
  pendingChanges: number;
}

interface StoreValue extends Persisted {
  ready: boolean;
  online: boolean;
  syncing: boolean;
  setOnline: (v: boolean) => void;
  setRole: (r: Role) => void;
  sync: () => void;
  toggleFavorite: (contactId: string) => void;
  touchContact: (contactId: string) => void;
  saveContact: (c: Contact) => void;
  deleteContact: (id: string) => void;
  saveCompany: (c: Company) => void;
  deleteCompany: (id: string) => void;
  saveProject: (p: Project) => void;
  saveCategory: (c: Category) => void;
  deleteCategory: (id: string) => void;
  importContacts: (rows: Contact[]) => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function initialState(): Persisted {
  return {
    contacts: CONTACTS,
    companies: COMPANIES,
    projects: PROJECTS,
    categories: CATEGORIES,
    recentIds: INITIAL_RECENT,
    role: "admin",
    lastSync: "2026-08-20T16:42:00.000Z",
    pendingChanges: 0,
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(initialState);
  const [ready, setReady] = useState(false);
  const [online, setOnlineRaw] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  // Laden aus dem lokalen Speicher – simuliert den Offline-Cache des Geräts.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Beschädigter Cache: still auf Demo-Daten zurückfallen.
    }
    setOnlineRaw(typeof navigator === "undefined" ? true : navigator.onLine);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Speicher voll oder blockiert – im Prototyp nicht kritisch.
    }
  }, [state, ready]);

  useEffect(() => {
    const on = () => setOnlineRaw(true);
    const off = () => setOnlineRaw(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const patch = useCallback((fn: (p: Persisted) => Partial<Persisted>) => {
    setState((prev) => ({ ...prev, ...fn(prev) }));
  }, []);

  /** Jede Änderung wandert in die Warteschlange, bis synchronisiert wurde. */
  const queue = useCallback(
    (fn: (p: Persisted) => Partial<Persisted>) => {
      setState((prev) => {
        const next = { ...prev, ...fn(prev) };
        next.pendingChanges = prev.pendingChanges + 1;
        return next;
      });
    },
    [],
  );

  const sync = useCallback(() => {
    if (!onlineRef.current || syncing) return;
    setSyncing(true);
    window.setTimeout(() => {
      setState((prev) => ({
        ...prev,
        lastSync: new Date().toISOString(),
        pendingChanges: 0,
      }));
      setSyncing(false);
    }, 1100);
  }, [syncing]);

  const setOnline = useCallback(
    (v: boolean) => {
      setOnlineRaw(v);
      if (v) {
        // Beim Zurückkommen ins Netz sofort abgleichen.
        window.setTimeout(() => {
          setSyncing(true);
          window.setTimeout(() => {
            setState((prev) => ({
              ...prev,
              lastSync: new Date().toISOString(),
              pendingChanges: 0,
            }));
            setSyncing(false);
          }, 1100);
        }, 250);
      }
    },
    [],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      ready,
      online,
      syncing,
      setOnline,
      setRole: (role) => patch(() => ({ role })),
      sync,
      toggleFavorite: (id) =>
        queue((p) => ({
          contacts: p.contacts.map((c) =>
            c.id === id ? { ...c, favorite: !c.favorite } : c,
          ),
        })),
      touchContact: (id) =>
        patch((p) => ({
          recentIds: [id, ...p.recentIds.filter((r) => r !== id)].slice(0, 12),
        })),
      saveContact: (c) =>
        queue((p) => ({
          contacts: p.contacts.some((x) => x.id === c.id)
            ? p.contacts.map((x) => (x.id === c.id ? c : x))
            : [...p.contacts, c],
        })),
      deleteContact: (id) =>
        queue((p) => ({
          contacts: p.contacts.filter((c) => c.id !== id),
          recentIds: p.recentIds.filter((r) => r !== id),
          projects: p.projects.map((pr) => ({
            ...pr,
            roles: pr.roles.map((r) =>
              r.contactId === id ? { ...r, contactId: null } : r,
            ),
          })),
        })),
      saveCompany: (c) =>
        queue((p) => ({
          companies: p.companies.some((x) => x.id === c.id)
            ? p.companies.map((x) => (x.id === c.id ? c : x))
            : [...p.companies, c],
        })),
      deleteCompany: (id) =>
        queue((p) => ({
          companies: p.companies.filter((c) => c.id !== id),
          contacts: p.contacts.map((c) =>
            c.companyId === id ? { ...c, companyId: null } : c,
          ),
        })),
      saveProject: (pr) =>
        queue((p) => ({
          projects: p.projects.some((x) => x.id === pr.id)
            ? p.projects.map((x) => (x.id === pr.id ? pr : x))
            : [...p.projects, pr],
        })),
      saveCategory: (cat) =>
        queue((p) => ({
          categories: p.categories.some((x) => x.id === cat.id)
            ? p.categories.map((x) => (x.id === cat.id ? cat : x))
            : [...p.categories, cat],
        })),
      deleteCategory: (id) =>
        queue((p) => ({ categories: p.categories.filter((c) => c.id !== id) })),
      importContacts: (rows) =>
        queue((p) => {
          const known = new Set(p.contacts.map((c) => c.id));
          return {
            contacts: [...p.contacts, ...rows.filter((r) => !known.has(r.id))],
          };
        }),
      resetDemo: () => {
        setState(initialState());
      },
    }),
    [state, ready, online, syncing, patch, queue, sync, setOnline],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore muss innerhalb von StoreProvider genutzt werden");
  return ctx;
}

// ── Abgeleitete Helfer ────────────────────────────────────────────────

export function useCompanyMap() {
  const { companies } = useStore();
  return useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
}

export function useContactMap() {
  const { contacts } = useStore();
  return useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
}

export function useCategoryMap() {
  const { categories } = useStore();
  return useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
}
