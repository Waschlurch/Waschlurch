/* Bodybuilding-Auswertung: Trendgewicht, Tempo pro Woche, Energiebilanz, adaptiver TDEE,
   Eiweiß pro kg, Magermasse, FFMI, Krafttraining pro Woche und Kalorienempfehlung.
   Gemeinsam für Dashboard und Claude. */

import { tageswerte, workouts, tageListe } from './abfragen.mjs';
import { db } from './db.mjs';
import { tagPlus, lokalerTag } from './zeit.mjs';
import { PHASE_RATE, PHASEN } from './einstellungen.mjs';

export const KCAL_PRO_KG = 7700;
const VORLAUF = 28; // Tage vor dem Zeitraum für Trend und TDEE
const METRIKEN = ['weight_body_mass', 'body_fat_percentage', 'lean_body_mass', 'waist_circumference', 'height', 'dietary_energy', 'protein', 'active_energy', 'basal_energy_burned'];
export const KRAFT = /kraft|strength|functional|bodybuilding|gewicht|weight|hiit|core|crossfit|calisthenics/i;

const r1 = (v, nk = 1) => v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** nk) / 10 ** nk;
const mittel = a => { const v = a.filter(x => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

/** Exponentiell geglätteter Trend (α = 0,1 pro Tag) – Wiegeschwankungen durch Wasser und Salz fallen heraus. */
export function trend(werte, alpha = 0.1){
  let t = null;
  return werte.map(w => { if(w != null) t = t == null ? w : t + alpha * (w - t); return t; });
}

/** Steigung pro Tag per linearer Regression über die vorhandenen Punkte. */
export function steigung(werte){
  const p = werte.map((y, x) => [x, y]).filter(([, y]) => y != null);
  if(p.length < 2) return null;
  const mx = mittel(p.map(q => q[0])), my = mittel(p.map(q => q[1]));
  const n = p.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0), d = p.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return d ? n / d : null;
}

/** ISO-Woche „2026-W47“. */
export function isoWoche(tag){
  const d = new Date(tag + 'T12:00:00Z'); const wt = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wt + 3);
  const j = d.getUTCFullYear(), erster = new Date(Date.UTC(j, 0, 4));
  return `${j}-W${String(1 + Math.round(((d - erster) / 864e5 - 3 + ((erster.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
}

export async function bodybuilding(zeitraum, ziele){
  const lang = { von: tagPlus(zeitraum.von, -VORLAUF), bis: zeitraum.bis };
  const alle = tageListe(lang);
  const { q } = await db();
  const [tw, wo, gr] = await Promise.all([tageswerte(METRIKEN, lang), workouts(lang), q(`select wert from messwerte where metrik = 'height' order by zeit desc limit 1`)]);
  const reihe = m => { const map = new Map((tw[m] || []).map(p => [p.tag, p.wert])); return alle.map(t => map.get(t) ?? null); };
  const gewicht = reihe('weight_body_mass'), fett = reihe('body_fat_percentage'), lbmMess = reihe('lean_body_mass'), taille = reihe('waist_circumference');
  const kcal = reihe('dietary_energy'), protein = reihe('protein'), aktiv = reihe('active_energy'), basal = reihe('basal_energy_burned');
  const tr = trend(gewicht);
  const groesse = ziele.groesse_cm || (gr[0] ? Math.round(Number(gr[0].wert)) : null);
  const fettTrend = trend(fett, 0.15);

  // Magermasse: gemessen, sonst Gewicht × (1 − Körperfett)
  const lbm = alle.map((_, i) => lbmMess[i] ?? (tr[i] != null && fettTrend[i] != null && (gewicht[i] != null || fett[i] != null) ? tr[i] * (1 - fettTrend[i] / 100) : null));
  const ffmi = l => l != null && groesse ? l / (groesse / 100) ** 2 + 6.1 * (1.8 - groesse / 100) : null;

  const verbrauch = alle.map((_, i) => aktiv[i] != null && basal[i] != null ? aktiv[i] + basal[i] : null);
  const bilanz = alle.map((_, i) => kcal[i] != null && verbrauch[i] != null ? kcal[i] - verbrauch[i] : null);
  const gkg = alle.map((_, i) => protein[i] != null && tr[i] ? protein[i] / tr[i] : null);

  const ab = VORLAUF; // Index des ersten Tags im sichtbaren Zeitraum
  const sicht = a => a.slice(ab);
  const n = alle.length;

  // Tempo: Trendsteigung der letzten 14 Tage
  const fenster = tr.slice(Math.max(0, n - 14));
  const proTag = steigung(fenster);
  const aktuell = tr.at(-1);
  const rateKg = proTag != null ? proTag * 7 : null;
  const ratePct = rateKg != null && aktuell ? rateKg / aktuell * 100 : null;

  // Adaptiver TDEE: Ø Zufuhr − Gewichtsänderung × 7700 / Tage (letzte 21 Tage, mind. 10 Tage Logs)
  const tFenster = Math.min(21, n), start = n - tFenster;
  const zufuhr = kcal.slice(start), geloggt = zufuhr.filter(v => v != null).length;
  const trStart = tr.slice(start).find(v => v != null), trEnde = aktuell;
  let tdee = null, tdeeMethode = null;
  if(geloggt >= 10 && trStart != null && trEnde != null){
    tdee = mittel(zufuhr) - (trEnde - trStart) * KCAL_PRO_KG / tFenster; tdeeMethode = 'adaptiv aus Zufuhr und Gewichtstrend (21 Tage)';
  } else if(mittel(verbrauch.slice(start)) != null){ tdee = mittel(verbrauch.slice(start)); tdeeMethode = 'Apple-Health-Verbrauch (aktiv + Ruhe)'; }

  // Ziel und Empfehlung
  const zielRatePct = ziele.rate_prozent_woche ?? PHASE_RATE[ziele.phase] ?? 0;
  const zielRateKg = aktuell ? aktuell * zielRatePct / 100 : null;
  const empfohleneKcal = ziele.kcal_ziel ?? (tdee != null && zielRateKg != null ? tdee + zielRateKg * KCAL_PRO_KG / 7 : null);
  const proteinZiel = aktuell ? aktuell * ziele.protein_g_pro_kg : null;
  const wochenBisZiel = ziele.zielgewicht_kg && rateKg && Math.sign(ziele.zielgewicht_kg - aktuell) === Math.sign(rateKg) ? (ziele.zielgewicht_kg - aktuell) / rateKg : null;

  // Krafttraining pro ISO-Woche
  const kraft = wo.map(w => ({ ...w, tag: lokalerTag(new Date(w.start)) })).filter(w => KRAFT.test(w.art) && w.tag >= zeitraum.von);
  const wochen = {};
  for(const t of tageListe(zeitraum)) wochen[isoWoche(t)] ||= { woche: isoWoche(t), einheiten: 0, minuten: 0 };
  for(const w of kraft){ const k = isoWoche(w.tag); if(wochen[k]){ wochen[k].einheiten++; wochen[k].minuten += w.dauer_min || 0; } }
  const wochenListe = Object.values(wochen).map(w => ({ ...w, minuten: Math.round(w.minuten) }));
  const volleWochen = wochenListe.length > 1 ? wochenListe.slice(0, -1) : wochenListe;

  const letzterWert = a => { for(let i = a.length - 1; i >= 0; i--) if(a[i] != null) return a[i]; return null; };
  const lbmJetzt = letzterWert(lbm), lbmVorher = lbm.slice(ab).find(v => v != null);

  return {
    phase: { schluessel: ziele.phase, titel: PHASEN[ziele.phase] },
    ziele,
    gewicht: {
      aktuell_trend_kg: r1(aktuell, 2), letzte_messung_kg: r1(letzterWert(gewicht)),
      rate_kg_woche: r1(rateKg, 2), rate_prozent_woche: r1(ratePct, 2),
      ziel_rate_prozent_woche: r1(zielRatePct, 2), ziel_rate_kg_woche: r1(zielRateKg, 2),
      im_plan: ratePct == null ? null : Math.abs(ratePct - zielRatePct) <= Math.max(0.15, Math.abs(zielRatePct) * 0.4),
      zielgewicht_kg: ziele.zielgewicht_kg, wochen_bis_ziel: r1(wochenBisZiel, 1),
    },
    energie: {
      tdee_kcal: r1(tdee, 0), tdee_methode: tdeeMethode,
      zufuhr_mittel_kcal: r1(mittel(sicht(kcal)), 0), verbrauch_mittel_kcal: r1(mittel(sicht(verbrauch)), 0),
      bilanz_mittel_kcal: r1(mittel(sicht(bilanz)), 0), empfohlene_kcal: r1(empfohleneKcal, 0),
      tage_geloggt: sicht(kcal).filter(v => v != null).length,
    },
    eiweiss: {
      mittel_g: r1(mittel(sicht(protein)), 0), mittel_g_pro_kg: r1(mittel(sicht(gkg)), 2), ziel_g_pro_kg: ziele.protein_g_pro_kg, ziel_g: r1(proteinZiel, 0),
      tage_ziel_erreicht: sicht(gkg).filter(v => v != null && v >= ziele.protein_g_pro_kg * 0.95).length, tage_geloggt: sicht(gkg).filter(v => v != null).length,
    },
    koerper: {
      koerperfett_prozent: r1(letzterWert(fettTrend)), magermasse_kg: r1(lbmJetzt), magermasse_veraenderung_kg: r1(lbmJetzt != null && lbmVorher != null ? lbmJetzt - lbmVorher : null, 2),
      ffmi: r1(ffmi(lbmJetzt), 1), groesse_cm: groesse, taille_cm: r1(letzterWert(taille)),
      taille_veraenderung_cm: r1((() => { const v = sicht(taille).filter(x => x != null); return v.length > 1 ? v.at(-1) - v[0] : null; })()),
    },
    kraft: {
      einheiten: kraft.length, minuten: Math.round(kraft.reduce((s, w) => s + (w.dauer_min || 0), 0)),
      pro_woche_mittel: r1(mittel(volleWochen.map(w => w.einheiten)), 1), ziel_pro_woche: ziele.kraft_pro_woche, wochen: wochenListe,
    },
    reihen: {
      tage: sicht(alle), trend_kg: sicht(tr).map(v => r1(v, 2)), gewicht_kg: sicht(gewicht), bilanz_kcal: sicht(bilanz).map(v => r1(v, 0)),
      verbrauch_kcal: sicht(verbrauch).map(v => r1(v, 0)), eiweiss_g_pro_kg: sicht(gkg).map(v => r1(v, 2)), magermasse_kg: sicht(lbm).map(v => r1(v, 1)),
      taille_cm: sicht(taille), kraft_tage: sicht(alle).map(t => kraft.filter(w => w.tag === t).map(w => ({ art: w.art, dauer_min: w.dauer_min }))),
    },
  };
}
