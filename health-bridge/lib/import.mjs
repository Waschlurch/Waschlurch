/* Eingehende Daten vom iPhone in Zeilen verwandeln.
   Unterstützt:
   1. „Health Auto Export“ (REST-API-Automation, JSON v1/v2): { data: { metrics: [...], workouts: [...] } }
   2. Apple Kurzbefehle: { metrik, werte: [...], daten: [...], enddaten?: [...], einheit?, quelle? }
      – auch mehrere als { reihen: [...] } oder als Array, englische Schlüssel (metric/values/dates) gehen ebenso.
   Schlaf kommt als Nacht (HAE, aggregiert) oder als Segmente (Kurzbefehl/HAE roh) und wird zu Nächten zusammengefasst. */

import { metrikName, umrechnen, SCHLAF } from './katalog.mjs';
import { zeitLesen, zahlLesen, lokalerTag } from './zeit.mjs';

const MAX_ZEILEN = 200_000;

const PHASE = {
  core: 'kern', kern: 'kern', asleepcore: 'kern', 'asleep core': 'kern', 'leichter schlaf': 'kern', light: 'kern',
  deep: 'tief', tief: 'tief', tiefschlaf: 'tief', asleepdeep: 'tief', 'asleep deep': 'tief',
  rem: 'rem', asleeprem: 'rem', 'asleep rem': 'rem', 'rem-schlaf': 'rem',
  awake: 'wach', wach: 'wach', 'im bett wach': 'wach',
  inbed: 'bett', 'in bed': 'bett', 'im bett': 'bett',
  asleep: 'schlaf', schlafend: 'schlaf', schlaf: 'schlaf', asleepunspecified: 'schlaf', 'asleep unspecified': 'schlaf', geschlafen: 'schlaf',
};
export const phase = roh => PHASE[String(roh || '').trim().toLowerCase().replace(/^hkcategoryvaluesleepanalysis/, '')] || null;

const zahl = v => v && typeof v === 'object' ? zahlLesen(v.qty ?? v.value) : zahlLesen(v);
const iso = d => d.toISOString();
const quelleVon = (q, standard) => String(q || standard || '').slice(0, 120);

/** Hauptfunktion: beliebige Nutzlast → { messwerte, segmente, naechte, workouts, format, verworfen } */
export function lesen(nutzlast, { quelle: standardQuelle = '' } = {}){
  const aus = { messwerte: [], segmente: [], naechte: [], workouts: [], format: 'unbekannt', verworfen: 0 };
  if(!nutzlast || typeof nutzlast !== 'object') return aus;

  const hae = nutzlast.data && (Array.isArray(nutzlast.data.metrics) || Array.isArray(nutzlast.data.workouts)) ? nutzlast.data
    : Array.isArray(nutzlast.metrics) && nutzlast.metrics.some(x => x && Array.isArray(x.data)) ? nutzlast : null;
  if(hae){
    aus.format = 'health-auto-export';
    for(const m of hae.metrics || []) haeMetrik(m, aus, standardQuelle);
    for(const w of hae.workouts || []) workout(w, aus, standardQuelle);
  } else {
    aus.format = 'kurzbefehl';
    const reihen = Array.isArray(nutzlast) ? nutzlast : Array.isArray(nutzlast.reihen) ? nutzlast.reihen
      : Array.isArray(nutzlast.series) ? nutzlast.series : [nutzlast];
    for(const r of reihen) kurzbefehl(r, aus, nutzlast.quelle || standardQuelle);
    for(const w of nutzlast.workouts || []) workout(w, aus, nutzlast.quelle || standardQuelle);
  }
  aus.naechte.push(...naechteAusSegmenten(aus.segmente));
  if(aus.messwerte.length > MAX_ZEILEN){ const e = new Error('zu_viele_zeilen'); e.status = 413; throw e; }
  aus.messwerte = eindeutig(aus.messwerte, r => r.metrik + '|' + r.zeit + '|' + r.quelle);
  aus.naechte = eindeutig(aus.naechte, r => r.nacht + '|' + r.quelle);
  aus.workouts = eindeutig(aus.workouts, r => r.id);
  return aus;
}

function eindeutig(liste, schluessel){
  const map = new Map(); for(const r of liste) map.set(schluessel(r), r); return [...map.values()];
}

function wertZeile(aus, metrik, zeit, wert, { min = null, max = null, einheit = '', quelle = '' } = {}){
  const d = zeitLesen(zeit);
  const w = umrechnen(metrik, wert, einheit);
  if(!d || w == null){ aus.verworfen++; return; }
  aus.messwerte.push({ metrik, zeit: iso(d), wert: w, min: umrechnen(metrik, min, einheit), max: umrechnen(metrik, max, einheit), quelle });
}

function haeMetrik(m, aus, stdQ){
  if(!m || !Array.isArray(m.data)) return;
  const name = metrikName(m.name);
  const einheit = m.units || '';
  for(const p of m.data){
    if(!p || typeof p !== 'object'){ aus.verworfen++; continue; }
    const q = quelleVon(p.source, stdQ);
    if(name === SCHLAF){ haeSchlaf(p, einheit, aus, q); continue; }
    if(name === 'blood_pressure'){
      wertZeile(aus, 'blood_pressure_systolic', p.date, zahl(p.systolic), { quelle: q });
      wertZeile(aus, 'blood_pressure_diastolic', p.date, zahl(p.diastolic), { quelle: q });
      continue;
    }
    const avg = zahl(p.qty ?? p.Avg ?? p.avg);
    wertZeile(aus, name, p.date, avg, { min: zahl(p.Min ?? p.min), max: zahl(p.Max ?? p.max), einheit, quelle: q });
  }
}

function haeSchlaf(p, einheit, aus, q){
  if((p.value || p.stage) && (p.startDate || p.start)){
    segment(aus, p.value || p.stage, p.startDate || p.start, p.endDate || p.end, q); return;
  }
  const f = String(einheit).toLowerCase() === 'min' ? 1 : 60; // HAE liefert Stunden
  const h = k => { const v = zahl(p[k]); return v == null ? null : v * f; };
  const start = zeitLesen(p.sleepStart || p.inBedStart), ende = zeitLesen(p.sleepEnd || p.inBedEnd);
  const datum = zeitLesen(p.date) || ende;
  if(!datum){ aus.verworfen++; return; }
  const tief = h('deep'), kern = h('core'), rem = h('rem');
  const gesamt = h('totalSleep') ?? h('asleep') ?? ((tief ?? 0) + (kern ?? 0) + (rem ?? 0) || null);
  if(gesamt == null){ aus.verworfen++; return; }
  aus.naechte.push({
    nacht: lokalerTag(ende || datum), quelle: q,
    start: start ? iso(start) : null, ende: ende ? iso(ende) : null,
    gesamt_min: gesamt, tief_min: tief, kern_min: kern, rem_min: rem, wach_min: h('awake'), im_bett_min: h('inBed'),
  });
}

function segment(aus, phaseRoh, start, ende, q){
  const ph = phase(phaseRoh), s = zeitLesen(start), e = zeitLesen(ende);
  if(!ph || !s || !e || e <= s){ aus.verworfen++; return; }
  aus.segmente.push({ phase: ph, start: s, ende: e, quelle: q });
}

/** Segmente → Nächte. Eine Nacht gehört zum Tag des Aufwachens (Start + 12 h). */
export function naechteAusSegmenten(segmente){
  const gruppen = new Map();
  for(const s of segmente){
    const nacht = lokalerTag(new Date(s.start.getTime() + 12 * 3600e3));
    const k = nacht + '|' + s.quelle;
    if(!gruppen.has(k)) gruppen.set(k, { nacht, quelle: s.quelle, liste: [] });
    gruppen.get(k).liste.push(s);
  }
  const naechte = [];
  for(const g of gruppen.values()){
    const summe = { kern: 0, tief: 0, rem: 0, wach: 0, schlaf: 0, bett: 0 };
    const gesehen = new Set();
    let start = null, ende = null;
    for(const s of g.liste){
      const k = s.phase + s.start.getTime() + '-' + s.ende.getTime();
      if(gesehen.has(k)) continue; gesehen.add(k);
      summe[s.phase] += (s.ende - s.start) / 60000;
      if(s.phase !== 'bett' && s.phase !== 'wach'){
        if(!start || s.start < start) start = s.start;
        if(!ende || s.ende > ende) ende = s.ende;
      }
    }
    const gesamt = summe.kern + summe.tief + summe.rem + summe.schlaf;
    if(gesamt <= 0) continue;
    const phasen = summe.kern + summe.tief + summe.rem > 0;
    naechte.push({
      nacht: g.nacht, quelle: g.quelle, start: start && iso(start), ende: ende && iso(ende),
      gesamt_min: gesamt, tief_min: phasen ? summe.tief : null, kern_min: phasen ? summe.kern + summe.schlaf : null,
      rem_min: phasen ? summe.rem : null, wach_min: summe.wach, im_bett_min: summe.bett || null,
    });
  }
  return naechte;
}

function feld(o, ...namen){ for(const n of namen) if(o[n] !== undefined) return o[n]; }

function kurzbefehl(r, aus, stdQ){
  if(!r || typeof r !== 'object') return;
  const q = quelleVon(feld(r, 'quelle', 'source'), stdQ || 'Kurzbefehl');
  const name = metrikName(feld(r, 'metrik', 'metric', 'name', 'typ', 'type'));
  if(!name){ aus.verworfen++; return; }
  const einheit = feld(r, 'einheit', 'unit', 'units') || '';
  // Einzelwerte-Liste: [{datum, wert}] oder parallele Listen werte/daten
  let werte = feld(r, 'werte', 'values', 'wert', 'value');
  let daten = feld(r, 'daten', 'dates', 'datum', 'date', 'start', 'starts', 'startdaten');
  let enden = feld(r, 'enddaten', 'ends', 'ende', 'end', 'enddates');
  const proben = feld(r, 'proben', 'samples', 'data');
  if(Array.isArray(proben)){
    werte = proben.map(p => feld(p, 'wert', 'value', 'qty', 'phase'));
    daten = proben.map(p => feld(p, 'datum', 'date', 'start', 'startDate'));
    enden = proben.map(p => feld(p, 'ende', 'end', 'endDate'));
  }
  const liste = v => Array.isArray(v) ? v : typeof v === 'string' && v.includes('\n') ? v.split('\n').map(x => x.trim()).filter(Boolean) : v == null ? [] : [v];
  werte = liste(werte); daten = liste(daten); enden = liste(enden);
  if(werte.length !== daten.length){ aus.verworfen += Math.max(werte.length, daten.length); return; }
  werte.forEach((w, i) => {
    if(name === SCHLAF) return segment(aus, w, daten[i], enden[i], q);
    wertZeile(aus, name, daten[i], zahlLesen(w), { einheit, quelle: q });
  });
}

function workout(w, aus, stdQ){
  if(!w || typeof w !== 'object') return;
  const start = zeitLesen(feld(w, 'start', 'startDate', 'beginn')), ende = zeitLesen(feld(w, 'end', 'endDate', 'ende'));
  if(!start){ aus.verworfen++; return; }
  const art = String(feld(w, 'name', 'art', 'type', 'workoutActivityType') || 'Training').slice(0, 80);
  const sek = zahl(w.duration); // HAE: Sekunden; Kurzbefehl „dauer“: Minuten
  const dauer = sek != null ? sek / 60 : zahl(w.dauer) ?? (ende ? (ende - start) / 60000 : null);
  const energieFeld = feld(w, 'activeEnergyBurned', 'activeEnergy', 'energie', 'totalEnergy');
  let energie = zahl(energieFeld);
  if(energie != null && energieFeld?.units === 'kJ') energie /= 4.184;
  const distFeld = feld(w, 'distance', 'distanz');
  let distanz = zahl(distFeld);
  if(distanz != null && distFeld?.units === 'mi') distanz *= 1.609344;
  if(distanz != null && distFeld?.units === 'm') distanz /= 1000;
  const hf = w.heartRate && typeof w.heartRate === 'object' ? w.heartRate : {};
  aus.workouts.push({
    id: String(feld(w, 'id', 'uuid') || `${art}-${start.toISOString()}`).slice(0, 120),
    art, start: iso(start), ende: ende ? iso(ende) : null, dauer_min: dauer,
    energie_kcal: energie, distanz_km: distanz,
    hf_mittel: zahl(hf.avg) ?? zahl(feld(w, 'avgHeartRate', 'hf_mittel')),
    hf_max: zahl(hf.max) ?? zahl(feld(w, 'maxHeartRate', 'hf_max')),
    quelle: quelleVon(feld(w, 'source', 'quelle'), stdQ),
  });
}
