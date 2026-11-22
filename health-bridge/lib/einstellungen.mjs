/* Einstellungen: Vorlage, sichtbare Kacheln und Bereiche, Ziele.
   Liegen in der Datenbank, damit iPhone, Mac und Claude dasselbe sehen. */

import { db } from './db.mjs';

export const KACHELN = {
  gewicht:       'Trendgewicht',
  rate:          'Veränderung pro Woche',
  protein_gkg:   'Eiweiß pro kg',
  bilanz:        'Energiebilanz',
  tdee:          'Verbrauch (TDEE)',
  koerperfett:   'Körperfett',
  magermasse:    'Magermasse',
  ffmi:          'FFMI',
  taille:        'Taillenumfang',
  kraft:         'Krafttraining / Woche',
  gegessen:      'Gegessen',
  schlaf:        'Schlaf',
  ruhepuls:      'Ruhepuls',
  hrv:           'HRV',
  schritte:      'Schritte',
  aktivkalorien: 'Aktivkalorien',
  vo2max:        'VO₂max',
  wasser:        'Wasser',
};

export const BEREICH_IDS = ['aufbau', 'ernaehrung', 'training', 'schlaf', 'herz', 'aktivitaet'];
export const BEREICH_TITEL = { aufbau: 'Körper & Aufbau', ernaehrung: 'Ernährung', training: 'Krafttraining', schlaf: 'Schlaf', herz: 'Herz', aktivitaet: 'Aktivität' };

export const VORLAGEN = {
  bodybuilding: { titel: 'Bodybuilding', text: 'Gewichtstrend, Energiebilanz, Eiweiß, Magermasse und Krafttraining zuerst.',
    kacheln: ['gewicht', 'rate', 'protein_gkg', 'bilanz', 'koerperfett', 'kraft', 'schlaf', 'hrv'],
    bereiche: ['aufbau', 'ernaehrung', 'training', 'schlaf', 'herz', 'aktivitaet'] },
  diaet: { titel: 'Definition', text: 'Defizit, Abnahmetempo, Taille und Erhalt der Magermasse im Blick.',
    kacheln: ['gewicht', 'rate', 'bilanz', 'protein_gkg', 'taille', 'magermasse', 'schritte', 'schlaf'],
    bereiche: ['aufbau', 'ernaehrung', 'aktivitaet', 'training', 'schlaf', 'herz'] },
  erholung: { titel: 'Erholung & Schlaf', text: 'Schlaf, HRV und Ruhepuls – wie bereit du fürs Training bist.',
    kacheln: ['schlaf', 'hrv', 'ruhepuls', 'gewicht', 'schritte'],
    bereiche: ['schlaf', 'herz', 'training', 'aufbau', 'ernaehrung', 'aktivitaet'] },
  ausdauer: { titel: 'Ausdauer', text: 'Bewegung, VO₂max und Herz.',
    kacheln: ['schritte', 'aktivkalorien', 'vo2max', 'ruhepuls', 'hrv'],
    bereiche: ['aktivitaet', 'herz', 'schlaf', 'ernaehrung', 'aufbau', 'training'] },
  kompakt: { titel: 'Kompakt', text: 'Das Wichtigste aus allen Bereichen.',
    kacheln: ['schlaf', 'ruhepuls', 'schritte', 'gewicht', 'gegessen'],
    bereiche: ['schlaf', 'herz', 'aktivitaet', 'ernaehrung', 'aufbau'] },
};

export const PHASEN = { aufbau: 'Aufbau (Bulk)', diaet: 'Diät (Cut)', erhalt: 'Erhalt', recomp: 'Rekomposition' };
/** Empfohlenes Tempo in % Körpergewicht pro Woche je Phase. */
export const PHASE_RATE = { aufbau: 0.25, diaet: -0.6, erhalt: 0, recomp: 0 };

export const STANDARD = {
  vorlage: 'bodybuilding',
  kacheln: VORLAGEN.bodybuilding.kacheln,
  bereiche: VORLAGEN.bodybuilding.bereiche,
  ziele: { phase: 'aufbau', rate_prozent_woche: null, zielgewicht_kg: null, protein_g_pro_kg: 2.0, groesse_cm: null, kcal_ziel: null, schritte_ziel: 10000, schlaf_ziel_h: 8, kraft_pro_woche: 4 },
};

const zahlIn = (v, lo, hi) => { if(v === null || v === '' || v === undefined) return null; const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

/** Säubert Eingaben vom Browser: nur bekannte Kacheln/Bereiche, Zahlen in sinnvollen Grenzen. */
export function saeubern(e = {}){
  const s = structuredClone(STANDARD);
  if(typeof e.vorlage === 'string' && (VORLAGEN[e.vorlage] || e.vorlage === 'eigene')) s.vorlage = e.vorlage;
  if(Array.isArray(e.kacheln)) s.kacheln = [...new Set(e.kacheln.filter(k => KACHELN[k]))].slice(0, 12);
  if(Array.isArray(e.bereiche)) s.bereiche = [...new Set(e.bereiche.filter(b => BEREICH_IDS.includes(b)))];
  const z = e.ziele || {};
  if(PHASEN[z.phase]) s.ziele.phase = z.phase;
  s.ziele.rate_prozent_woche = zahlIn(z.rate_prozent_woche, -1.5, 1.5);
  s.ziele.zielgewicht_kg = zahlIn(z.zielgewicht_kg, 30, 250);
  s.ziele.protein_g_pro_kg = zahlIn(z.protein_g_pro_kg, 0.5, 4) ?? STANDARD.ziele.protein_g_pro_kg;
  s.ziele.groesse_cm = zahlIn(z.groesse_cm, 120, 230);
  s.ziele.kcal_ziel = zahlIn(z.kcal_ziel, 800, 8000);
  s.ziele.schritte_ziel = zahlIn(z.schritte_ziel, 1000, 50000) ?? STANDARD.ziele.schritte_ziel;
  s.ziele.schlaf_ziel_h = zahlIn(z.schlaf_ziel_h, 4, 12) ?? STANDARD.ziele.schlaf_ziel_h;
  s.ziele.kraft_pro_woche = zahlIn(z.kraft_pro_woche, 0, 14) ?? STANDARD.ziele.kraft_pro_woche;
  return s;
}

export async function laden(){
  const { q } = await db();
  const r = (await q(`select daten from einstellungen where id = 'standard'`))[0];
  const roh = r ? (typeof r.daten === 'string' ? JSON.parse(r.daten) : r.daten) : {};
  return saeubern(roh);
}

export async function speichern(e){
  const s = saeubern(e);
  const { q } = await db();
  await q(`insert into einstellungen (id, daten, geaendert) values ('standard', $1::jsonb, now())
    on conflict (id) do update set daten = excluded.daten, geaendert = now()`, [JSON.stringify(s)]);
  return s;
}
