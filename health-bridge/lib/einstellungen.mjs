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
  score:         'Wochen-Score',
  kcal_heute:    'Kalorien vs Ziel',
  cardio:        'Cardio / Tag',
  phase:         'Phase seit Start',
  gegessen:      'Gegessen',
  schlaf:        'Schlaf',
  ruhepuls:      'Ruhepuls',
  hrv:           'HRV',
  schritte:      'Schritte',
  aktivkalorien: 'Aktivkalorien',
  vo2max:        'VO₂max',
  wasser:        'Wasser',
};

export const BEREICH_IDS = ['analyse', 'aufbau', 'protokoll', 'ernaehrung', 'training', 'schlaf', 'herz', 'aktivitaet'];
export const BEREICH_TITEL = { analyse: 'Coach-Analyse', protokoll: 'Protokoll & Plan', aufbau: 'Körper & Aufbau', ernaehrung: 'Ernährung', training: 'Krafttraining', schlaf: 'Schlaf', herz: 'Herz', aktivitaet: 'Aktivität' };

export const VORLAGEN = {
  bodybuilding: { titel: 'Bodybuilding', text: 'Gewichtstrend, Energiebilanz, Eiweiß, Magermasse und Krafttraining zuerst.',
    kacheln: ['score', 'gewicht', 'rate', 'kcal_heute', 'protein_gkg', 'kraft', 'schlaf', 'hrv'],
    bereiche: ['analyse', 'aufbau', 'protokoll', 'ernaehrung', 'training', 'schlaf', 'herz', 'aktivitaet'] },
  diaet: { titel: 'Definition', text: 'Defizit, Abnahmetempo, Taille und Erhalt der Magermasse im Blick.',
    kacheln: ['score', 'gewicht', 'rate', 'kcal_heute', 'protein_gkg', 'cardio', 'schritte', 'taille'],
    bereiche: ['analyse', 'aufbau', 'ernaehrung', 'aktivitaet', 'protokoll', 'training', 'schlaf', 'herz'] },
  erholung: { titel: 'Erholung & Schlaf', text: 'Schlaf, HRV und Ruhepuls – wie bereit du fürs Training bist.',
    kacheln: ['schlaf', 'hrv', 'ruhepuls', 'gewicht', 'schritte'],
    bereiche: ['schlaf', 'herz', 'analyse', 'training', 'aufbau', 'ernaehrung', 'aktivitaet', 'protokoll'] },
  ausdauer: { titel: 'Ausdauer', text: 'Bewegung, VO₂max und Herz.',
    kacheln: ['schritte', 'aktivkalorien', 'vo2max', 'ruhepuls', 'hrv'],
    bereiche: ['aktivitaet', 'herz', 'schlaf', 'analyse', 'ernaehrung', 'aufbau', 'training'] },
  kompakt: { titel: 'Kompakt', text: 'Das Wichtigste aus allen Bereichen.',
    kacheln: ['schlaf', 'ruhepuls', 'schritte', 'gewicht', 'gegessen'],
    bereiche: ['analyse', 'schlaf', 'herz', 'aktivitaet', 'ernaehrung', 'aufbau'] },
};

export const PHASEN = { aufbau: 'Aufbau (Bulk)', diaet: 'Diät (Cut)', erhalt: 'Erhalt', recomp: 'Rekomposition' };
/** Empfohlenes Tempo in % Körpergewicht pro Woche je Phase. */
export const PHASE_RATE = { aufbau: 0.25, diaet: -0.6, erhalt: 0, recomp: 0 };

export const STANDARD = {
  vorlage: 'bodybuilding',
  kacheln: VORLAGEN.bodybuilding.kacheln,
  bereiche: VORLAGEN.bodybuilding.bereiche,
  ziele: { phase: 'aufbau', rate_prozent_woche: null, zielgewicht_kg: null, protein_g_pro_kg: 2.2, groesse_cm: null, kcal_ziel: null,
    kcal_training: null, kcal_rest: null, ueberschuss_kcal: null, protein_g: null, kh_g: null, fett_g: null,
    schritte_ziel: 10000, cardio_min_ziel: null, cardio_min_rest: null, schlaf_ziel_h: 8, kraft_pro_woche: 4 },
  phasen: [],
  plan: { muster: [], start: null },
};
const PHASE_IDS = ['aufbau', 'diaet', 'erhalt', 'recomp'];
const istTag = t => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t);

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
  s.ziele.kcal_training = zahlIn(z.kcal_training, 800, 9000);
  s.ziele.kcal_rest = zahlIn(z.kcal_rest, 800, 9000);
  s.ziele.ueberschuss_kcal = zahlIn(z.ueberschuss_kcal, -1500, 1500);
  s.ziele.protein_g = zahlIn(z.protein_g, 30, 500);
  s.ziele.kh_g = zahlIn(z.kh_g, 0, 1200);
  s.ziele.fett_g = zahlIn(z.fett_g, 10, 400);
  s.ziele.cardio_min_ziel = zahlIn(z.cardio_min_ziel, 0, 300);
  s.ziele.cardio_min_rest = zahlIn(z.cardio_min_rest, 0, 300);
  if(Array.isArray(e.phasen)) s.phasen = e.phasen.filter(p => p && PHASE_IDS.includes(p.phase) && istTag(p.start))
    .map(p => ({ phase: p.phase, start: p.start, notiz: String(p.notiz || '').slice(0, 200) }))
    .sort((a, b) => a.start.localeCompare(b.start)).slice(-40);
  const pl = e.plan || {};
  if(Array.isArray(pl.muster)) s.plan.muster = pl.muster.filter(x => x === 'T' || x === 'R').slice(0, 14);
  s.plan.start = istTag(pl.start) ? pl.start : null;
  if(!s.plan.start || !s.plan.muster.length) s.plan = { muster: s.plan.muster, start: s.plan.start };
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
