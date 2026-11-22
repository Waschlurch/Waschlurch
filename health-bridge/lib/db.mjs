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

create table if not exists syncs (
  id     bigserial primary key,
  zeit   timestamptz not null default now(),
  format text,
  messwerte int, naechte int, workouts int, verworfen int
);
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
  } else {
    if(process.env.VERCEL) throw Object.assign(new Error('DATABASE_URL fehlt'), { status: 503, code: 'keine_datenbank' });
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite(process.env.PULS_PGLITE_DIR || undefined);
    q = async (text, params = []) => (await pg.query(text, params)).rows;
    q.exec = t => pg.exec(t);
  }
  if(q.exec) await q.exec(SCHEMA);
  else if(process.env.PULS_SCHEMA_AUTO !== '0') for(const teil of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await q(teil);
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
