/* Mahlzeiten & Timing: aus einzelnen Ernährungseinträgen mit Uhrzeit (z. B. YAZIO über Apple Health)
   werden Mahlzeiten. Dazu: Eiweiß pro Mahlzeit, Pre-/Post-Workout, Abstand der letzten Mahlzeit zum Schlaf,
   Essensfenster, Mikronährstoffe gegen Richtwerte. Läuft im Browser und auf dem Server. */

import { tagPlus, tagesListe, mittel, r1, ausrichten } from './rechnen.mjs';

const fmtCache = new Map();
/** ISO-Zeit → { tag: 'YYYY-MM-DD', min: Minuten seit Mitternacht } in der Zeitzone. */
export function lokal(iso, zone = 'Europe/Berlin'){
  if(!fmtCache.has(zone)) fmtCache.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const p = Object.fromEntries(fmtCache.get(zone).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { tag: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}
export const uhr = min => min == null ? '–' : `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(Math.round(((min % 60) + 60) % 60)).padStart(2, '0')}`;

const FELD = { dietary_energy: 'kcal', protein: 'eiweiss', carbohydrates: 'kh', total_fat: 'fett', dietary_caffeine: 'koffein', sodium: 'natrium', dietary_water: 'wasser' };
const LUECKE = 75;       // min ohne Eintrag → neue Mahlzeit
const PRE = 180, POST = 120; // Fenster vor Trainingsbeginn / nach Trainingsende

/** Richtwerte für Kraftsportler (pro Tag). kgFaktor: × Körpergewicht. */
export const RICHTWERTE = [
  { metrik: 'fiber', titel: 'Ballaststoffe', einheit: 'g', min: 30 },
  { metrik: 'dietary_water', titel: 'Wasser (getrackt)', einheit: 'ml', kg: 35 },
  { metrik: 'potassium', titel: 'Kalium', einheit: 'mg', min: 4000 },
  { metrik: 'magnesium', titel: 'Magnesium', einheit: 'mg', min: 400 },
  { metrik: 'calcium', titel: 'Calcium', einheit: 'mg', min: 1000 },
  { metrik: 'iron', titel: 'Eisen', einheit: 'mg', min: 10 },
  { metrik: 'vitamin_d', titel: 'Vitamin D', einheit: 'µg', min: 20 },
  { metrik: 'sodium', titel: 'Natrium', einheit: 'mg', min: 1500, max: 5000 },
  { metrik: 'dietary_sugar', titel: 'Zucker', einheit: 'g', anteilMax: 0.1, kcalProG: 4 },
  { metrik: 'saturated_fat', titel: 'Gesättigte Fette', einheit: 'g', anteilMax: 0.1, kcalProG: 9 },
];

/** Einträge → Mahlzeiten je Tag. Tageswerte ohne Uhrzeit (00:00) werden ignoriert. */
export function mahlzeitenAus(eintraege, zone){
  const proTag = new Map();
  for(const e of eintraege || []){
    const f = FELD[e.m]; if(!f) continue;
    const l = lokal(e.z, zone); if(l.min === 0) continue; // Tagessummen ohne Uhrzeit
    (proTag.get(l.tag) || proTag.set(l.tag, []).get(l.tag)).push({ f, min: l.min, w: e.w });
  }
  const aus = new Map();
  for(const [tag, liste] of proTag){
    liste.sort((a, b) => a.min - b.min);
    const mahl = [];
    for(const e of liste){
      let m = mahl.at(-1);
      if(!m || e.min - m.ende > LUECKE){ m = { tag, start: e.min, ende: e.min, kcal: 0, eiweiss: 0, kh: 0, fett: 0, koffein: 0, natrium: 0, wasser: 0 }; mahl.push(m); }
      m[e.f] += e.w; m.ende = e.min;
    }
    // reine Wasser-/Koffein-Einträge sind keine Mahlzeit
    aus.set(tag, mahl.filter(m => m.kcal >= 50).map(m => ({ ...m, kcal: Math.round(m.kcal), eiweiss: Math.round(m.eiweiss), kh: Math.round(m.kh), fett: Math.round(m.fett) })));
  }
  return aus;
}

/**
 * Auswertung über ein Fenster.
 * basis: { eintraege, schlaf, workouts, reihen, zone }, gewichtKg für g/kg-Werte.
 */
export function mahlzeitenAnalyse(basis, fenster, { gewichtKg = null, zone = basis.zone || 'Europe/Berlin' } = {}){
  const alle = mahlzeitenAus(basis.eintraege, zone);
  const tage = tagesListe(fenster.von, fenster.bis);
  const schlafStart = new Map((basis.schlaf || []).filter(n => n.start).map(n => { const l = lokal(n.start, zone); return [n.nacht, l.tag === n.nacht ? l.min + 1440 : l.min]; }));
  const kraft = new Map();
  for(const w of basis.workouts || []){
    if(!/kraft|strength|functional|push|pull|leg|bein|ober|unter|upper|lower|brust|chest|back|rücken|schulter|arm/i.test(w.art) || !w.start) continue;
    const s = lokal(w.start, zone), e = w.ende ? lokal(w.ende, zone) : { min: s.min + (w.dauer_min || 60) };
    (kraft.get(s.tag) || kraft.set(s.tag, []).get(s.tag)).push({ start: s.min, ende: e.min < s.min ? e.min + 1440 : e.min, art: w.art });
  }
  const tagesDaten = tage.map(t => {
    const m = alle.get(t) || [];
    const k = kraft.get(t) || [];
    // Schlaf der folgenden Nacht (Nacht zählt zum Aufwachtag)
    const sl = schlafStart.get(tagPlus(t, 1));
    const letzte = m.at(-1);
    const abstand = letzte && sl != null ? sl - letzte.ende : null;
    const pre = k.length ? m.filter(x => x.ende <= k[0].start && x.ende >= k[0].start - PRE) : [];
    const post = k.length ? m.filter(x => x.start >= k.at(-1).ende && x.start <= k.at(-1).ende + POST) : [];
    return { tag: t, mahlzeiten: m, training: k, schlaf_start: sl ?? null,
      erste: m[0]?.start ?? null, letzte: letzte?.ende ?? null, fenster_h: m.length > 1 ? r1((letzte.ende - m[0].start) / 60, 1) : null,
      abstand_schlaf_min: abstand != null && abstand > -120 && abstand < 900 ? abstand : null,
      abend_kcal: m.filter(x => x.start >= 19 * 60).reduce((s, x) => s + x.kcal, 0) || (m.length ? 0 : null),
      pre_kh: k.length && m.length ? pre.reduce((s, x) => s + x.kh, 0) : null, pre_eiweiss: k.length && m.length ? pre.reduce((s, x) => s + x.eiweiss, 0) : null,
      post_eiweiss: k.length && m.length ? post.reduce((s, x) => s + x.eiweiss, 0) : null, post_kh: k.length && m.length ? post.reduce((s, x) => s + x.kh, 0) : null };
  });
  const mitM = tagesDaten.filter(d => d.mahlzeiten.length);
  const alleM = mitM.flatMap(d => d.mahlzeiten);
  const trainTage = mitM.filter(d => d.training.length);
  const zielEiweissMahlzeit = gewichtKg ? Math.max(30, Math.round(gewichtKg * 0.4 / 5) * 5) : 40;

  // Mikronährstoffe gegen Richtwerte (Tage mit Einträgen)
  const R = ausrichten(basis.reihen || {}, tage), kcal = R.dietary_energy;
  const mikro = RICHTWERTE.map(rw => {
    const werte = R[rw.metrik].map((v, i) => kcal[i] != null ? v : null).filter(v => v != null);
    if(werte.length < 3) return null;
    const m = mittel(werte);
    let ziel = rw.min ?? null, maxW = rw.max ?? null, status;
    if(rw.kg && gewichtKg) ziel = Math.round(rw.kg * gewichtKg / 100) * 100;
    if(rw.anteilMax){ maxW = Math.round(mittel(kcal.filter(v => v != null)) * rw.anteilMax / rw.kcalProG); }
    status = maxW != null && m > maxW ? 'zu_viel' : ziel != null && m < ziel * 0.85 ? 'zu_wenig' : 'ok';
    return { ...rw, mittel: r1(m, rw.metrik === 'iron' || rw.metrik === 'vitamin_d' ? 1 : 0), ziel, max: maxW, tage: werte.length, status, quote: ziel ? r1(m / ziel, 2) : maxW ? r1(m / maxW, 2) : null };
  }).filter(Boolean);

  return {
    hat_uhrzeiten: alleM.length > 0,
    tage_mit_mahlzeiten: mitM.length,
    mahlzeiten_pro_tag: r1(mittel(mitM.map(d => d.mahlzeiten.length)), 1),
    eiweiss_pro_mahlzeit: r1(mittel(alleM.map(m => m.eiweiss)), 0),
    ziel_eiweiss_mahlzeit: zielEiweissMahlzeit,
    eiweiss_mahlzeiten_pro_tag: r1(mittel(mitM.map(d => d.mahlzeiten.filter(m => m.eiweiss >= zielEiweissMahlzeit * 0.75).length)), 1),
    erste_mahlzeit: uhr(mittel(mitM.map(d => d.erste))), letzte_mahlzeit: uhr(mittel(mitM.map(d => d.letzte))),
    essensfenster_h: r1(mittel(mitM.map(d => d.fenster_h)), 1),
    abstand_schlaf_min: r1(mittel(mitM.map(d => d.abstand_schlaf_min)), 0),
    spaete_mahlzeiten: mitM.filter(d => d.abstand_schlaf_min != null && d.abstand_schlaf_min < 90).length,
    training: trainTage.length ? {
      tage: trainTage.length, pre_kh: r1(mittel(trainTage.map(d => d.pre_kh)), 0), pre_eiweiss: r1(mittel(trainTage.map(d => d.pre_eiweiss)), 0),
      post_eiweiss: r1(mittel(trainTage.map(d => d.post_eiweiss)), 0), post_kh: r1(mittel(trainTage.map(d => d.post_kh)), 0),
      ohne_pre: trainTage.filter(d => !d.pre_kh).length, ohne_post: trainTage.filter(d => !d.post_eiweiss).length,
    } : null,
    mikro,
    tage: tagesDaten.map(({ mahlzeiten, training, ...rest }) => ({ ...rest, mahlzeiten: mahlzeiten.map(({ tag, ...m }) => m), training })),
  };
}
