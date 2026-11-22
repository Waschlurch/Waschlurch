/* Datenbank: Postgres (z. B. Supabase) über DATABASE_URL.
   Ohne DATABASE_URL läuft lokal PGlite – dieselbe SQL, im Speicher oder in PULS_PGLITE_DIR. */

export const SCHEMA = `
create table if not exists messwerte (
  metrik text not null,
  zeit   timestamptz not null,
  quelle text not null default '',
  wert   double precision not null,
  min    double precision,
  max    double precision,
  primary key (metrik, zeit, quelle)
);
create index if not exists messwerte_zeit on messwerte (zeit);

create table if not exists schlaf_naechte (
  nacht  date not null,
  quelle text not null default '',
  start  timestamptz,
  ende   timestamptz,
  gesamt_min  double precision not null,
  tief_min    double precision,
  kern_min    double precision,
  rem_min     double precision,
  wach_min    double precision,
  im_bett_min double precision,
  primary key (nacht, quelle)
);

create table if not exists workouts (
  id    text primary key,
  art   text not null,
  start timestamptz not null,
  ende  timestamptz,
  dauer_min    double precision,
  energie_kcal double precision,
  distanz_km   double precision,
  hf_mittel    double precision,
  hf_max       double precision,
  quelle text not null default ''
);
create index if not exists workouts_start on workouts (start);

create table if not exists einstellungen (
  id     text primary key,
  daten  jsonb not null,
  geaendert timestamptz not null default now()
);

create table if not exists protokoll (
  tag    date primary key,
  cheat  boolean not null default false,
  tagtyp text,
  notiz  text not null default '',
  fokus  text,
  einheiten jsonb not null default '[]'::jsonb
);
alter table protokoll add column if not exists fokus text;
alter table protokoll add column if not exists einheiten jsonb not null default '[]'::jsonb;
alter table protokoll add column if not exists supplements jsonb;

create table if not exists fotos (
  id      bigserial primary key,
  tag     date not null,
  pose    text not null,
  notiz   text not null default '',
  mime    text not null,
  breite  int, hoehe int,
  bild    bytea not null,
  erstellt timestamptz not null default now()
);

create table if not exists formchecks (
  id      bigserial primary key,
  erstellt timestamptz not null default now(),
  foto_ids jsonb not null,
  modell  text,
  inhalt  jsonb not null
);

create table if not exists ki_berichte (
  id      bigserial primary key,
  tag     date not null,
  erstellt timestamptz not null default now(),
  modell  text,
  inhalt  jsonb not null
);

create table if not exists syncs (
  id     bigserial primary key,
  zeit   timestamptz not null default now(),
  format text,
  messwerte int, naechte int, workouts int, verworfen int
);

-- Sicherheit: Supabase stellt Tabellen im Schema „public“ sonst über die öffentliche Data-API bereit.
-- Row Level Security ohne Regeln sperrt jeden Zugriff über diese API; Puls selbst verbindet sich als Eigentümer.
do $$
declare t text;
begin
  foreach t in array array['messwerte','schlaf_naechte','workouts','einstellungen','protokoll','ki_berichte','fotos','formchecks','syncs'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on messwerte, schlaf_naechte, workouts, einstellungen, protokoll, ki_berichte, fotos, formchecks, syncs from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
  end if;
end $$;
`;

let instanz = null;

export async function db(){
  if(instanz) return instanz;
  const url = process.env.DATABASE_URL;
  let q;
  if(url){
    const postgres = (await import('postgres')).default;
    const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
    q = (text, params = []) => sql.unsafe(text, params);
    q.exec = t => sql.unsafe(t).simple(); // mehrere Anweisungen inkl. DO-Block in einem Rutsch
  } else {
    if(process.env.VERCEL) throw Object.assign(new Error('DATABASE_URL fehlt'), { status: 503, code: 'keine_datenbank' });
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite(process.env.PULS_PGLITE_DIR || undefined);
    q = async (text, params = []) => (await pg.query(text, params)).rows;
    q.exec = t => pg.exec(t);
  }
  if(process.env.PULS_SCHEMA_AUTO !== '0') await q.exec(SCHEMA);
  instanz = { q };
  return instanz;
}

export function zuruecksetzen(){ instanz = null; }

/** Mehrzeiliges Upsert in Blöcken. */
export async function upsert(q, tabelle, spalten, schluessel, zeilen, block = 400){
  if(!zeilen.length) return 0;
  const update = spalten.filter(s => !schluessel.includes(s)).map(s => `${s} = excluded.${s}`).join(', ');
  for(let i = 0; i < zeilen.length; i += block){
    const teil = zeilen.slice(i, i + block);
    const params = [];
    const werte = teil.map(z => '(' + spalten.map(s => { params.push(z[s] ?? null); return '$' + params.length; }).join(',') + ')').join(',');
    await q(`insert into ${tabelle} (${spalten.join(',')}) values ${werte}
      on conflict (${schluessel.join(',')}) do ${update ? 'update set ' + update : 'nothing'}`, params);
  }
  return zeilen.length;
}
