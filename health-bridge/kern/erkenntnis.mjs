/* Intelligente Analyse: findet belastbare Zusammenhänge in den eigenen Daten, bewertet die Bereitschaft
   fürs Training, prognostiziert das Gewicht, erkennt Trendwechsel und Ausreißer und priorisiert Hebel.
   Rein statistisch und nachvollziehbar – jede Aussage nennt Effekt, Stichprobe und Sicherheit. */

import { bodybuilding, ausrichten, tagesListe, tagPlus, mittel, r1, trend, steigung, tageZwischen, tagTyp, phaseAm } from './rechnen.mjs';
import { mahlzeitenAnalyse, uhr } from './mahlzeiten.mjs';

const fmt = (v, nk = 0) => v == null ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: nk, minimumFractionDigits: nk });
const vz = (v, nk = 0) => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), nk);
const sd = a => { const v = a.filter(x => x != null); if(v.length < 2) return null; const m = mittel(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
const verschieben = (a, lag) => lag > 0 ? [...Array(lag).fill(null), ...a.slice(0, -lag)] : a;

/* ── Statistik ── */
function betacf(a, b, x){
  let c = 1, d = 1 - (a + b) * x / (a + 1); d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); let h = d;
  for(let m = 1; m <= 200; m++){
    const m2 = 2 * m; let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); c = 1 + aa / c; if(Math.abs(c) < 1e-30) c = 1e-30; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); c = 1 + aa / c; if(Math.abs(c) < 1e-30) c = 1e-30;
    const del = d * c; h *= del; if(Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function lgamma(z){ const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for(const c of g) s += c / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function ibeta(x, a, b){ if(x <= 0) return 0; if(x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
/** Zweiseitiger p-Wert für t mit df Freiheitsgraden. */
export const pWert = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);

/** Pearson-Korrelation mit p-Wert über paarweise vorhandene Werte. */
export function korrelation(x, y){
  const p = x.map((v, i) => [v, y[i]]).filter(([a, b]) => a != null && b != null && Number.isFinite(a) && Number.isFinite(b));
  const n = p.length; if(n < 8) return { r: null, n, p: 1 };
  const mx = mittel(p.map(q => q[0])), my = mittel(p.map(q => q[1]));
  let sxy = 0, sxx = 0, syy = 0; for(const [a, b] of p){ sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  if(!sxx || !syy) return { r: null, n, p: 1 };
  const r = sxy / Math.sqrt(sxx * syy), t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
  return { r, n, p: pWert(t, n - 2), paare: p };
}

/** Welch-t-Test: unterscheiden sich zwei Zeiträume wirklich? */
export function welch(a, b){
  a = a.filter(v => v != null); b = b.filter(v => v != null);
  if(a.length < 5 || b.length < 5) return null;
  const ma = mittel(a), mb = mittel(b), va = sd(a) ** 2, vb = sd(b) ** 2, se = Math.sqrt(va / a.length + vb / b.length);
  if(!se) return null;
  const t = (ma - mb) / se, df = (va / a.length + vb / b.length) ** 2 / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
  return { diff: ma - mb, p: pWert(t, df), ma, mb };
}

/* ── Hypothesen: was plausibel womit zusammenhängt (Ursache am Tag t−lag, Wirkung am Tag t) ── */
const H = [
  { x: 'schlaf', y: 'hrv', lag: 0, satz: 'Mehr Schlaf → höhere HRV am Morgen', ziel: 'hoch' },
  { x: 'schlaf', y: 'rhr', lag: 0, satz: 'Mehr Schlaf → niedrigerer Ruhepuls', ziel: 'tief' },
  { x: 'tief', y: 'hrv', lag: 0, satz: 'Mehr Tiefschlaf → höhere HRV', ziel: 'hoch' },
  { x: 'koffein', y: 'schlaf', lag: 1, satz: 'Koffein am Vortag → Schlafdauer', ziel: 'hoch' },
  { x: 'koffein', y: 'tief', lag: 1, satz: 'Koffein am Vortag → Tiefschlaf', ziel: 'hoch' },
  { x: 'kraft_min', y: 'hrv', lag: 1, satz: 'Krafttraining am Vortag → HRV', ziel: 'hoch' },
  { x: 'kraft_min', y: 'rhr', lag: 1, satz: 'Krafttraining am Vortag → Ruhepuls', ziel: 'tief' },
  { x: 'cardio', y: 'schlaf', lag: 1, satz: 'Cardio am Vortag → Schlafdauer', ziel: 'hoch' },
  { x: 'schritte', y: 'schlaf', lag: 1, satz: 'Schritte am Vortag → Schlafdauer', ziel: 'hoch' },
  { x: 'schlaf', y: 'intensitaet', lag: 0, satz: 'Schlaf → Trainingsintensität (kcal/min)', ziel: 'hoch' },
  { x: 'hrv', y: 'intensitaet', lag: 0, satz: 'HRV → Trainingsintensität', ziel: 'hoch' },
  { x: 'schlaf', y: 'kcal', lag: 0, satz: 'Wenig Schlaf → mehr gegessen', ziel: 'neutral' },
  { x: 'kh', y: 'intensitaet', lag: 0, satz: 'Kohlenhydrate → Trainingsintensität', ziel: 'hoch' },
  { x: 'kh', y: 'schlaf', lag: 0, satz: 'Kohlenhydrate am Abend des Tages → Schlafdauer', ziel: 'hoch' },
  { x: 'wasser', y: 'hrv', lag: 1, satz: 'Trinkmenge am Vortag → HRV', ziel: 'hoch' },
  { x: 'bilanz7', y: 'gewicht7', lag: 0, satz: 'Energiebilanz der Woche → Gewichtsänderung', ziel: 'neutral' },
  { x: 'abstand_schlaf', y: 'schlaf', lag: 1, satz: 'Abstand letzte Mahlzeit → Schlafdauer', ziel: 'hoch' },
  { x: 'abstand_schlaf', y: 'hrv', lag: 1, satz: 'Abstand letzte Mahlzeit → HRV über Nacht', ziel: 'hoch' },
  { x: 'abend_kcal', y: 'schlaf', lag: 1, satz: 'Kalorien nach 19 Uhr → Schlafdauer', ziel: 'neutral' },
  { x: 'natrium', y: 'waage', lag: 1, satz: 'Natrium am Vortag → Wasser auf der Waage', ziel: 'neutral' },
  { x: 'kh', y: 'intensitaet', lag: 1, satz: 'Kohlenhydrate am Vortag → Trainingsintensität', ziel: 'hoch' },
  { x: 'pre_kh', y: 'intensitaet', lag: 0, satz: 'Kohlenhydrate vor dem Training → Trainingsintensität', ziel: 'hoch' },
];
const NAME = { abstand_schlaf: 'Abstand letzte Mahlzeit → Schlaf', abend_kcal: 'Kalorien nach 19 Uhr', natrium: 'Natrium', waage: 'Abweichung der Waage vom Trend', pre_kh: 'Kohlenhydrate vor dem Training', schlaf: 'Schlaf', tief: 'Tiefschlaf', hrv: 'HRV', rhr: 'Ruhepuls', koffein: 'Koffein', kraft_min: 'Krafttraining', cardio: 'Cardio', schritte: 'Schritte', intensitaet: 'Trainingsintensität', kcal: 'Kalorien', kh: 'Kohlenhydrate', wasser: 'Wasser', bilanz7: 'Wochenbilanz', gewicht7: 'Gewichtsänderung' };
const EINHEIT = { abstand_schlaf: 'min', abend_kcal: 'kcal', natrium: 'mg', waage: 'kg', pre_kh: 'g', schlaf: 'min', tief: 'min', hrv: 'ms', rhr: 'bpm', koffein: 'mg', kraft_min: 'min', cardio: 'min', schritte: '', intensitaet: 'kcal/min', kcal: 'kcal', kh: 'g', wasser: 'ml', bilanz7: 'kcal', gewicht7: 'kg' };
const NK = { intensitaet: 1, gewicht7: 2, hrv: 1, rhr: 1, waage: 2 };

/** Tagestabelle aller Merkmale über einen Zeitraum. */
export function merkmale(basis, e, protokollListe, von, bis){
  const tage = tagesListe(von, bis), R = ausrichten(basis.reihen, tage);
  const bb = bodybuilding(basis, { von, bis }, e, protokollListe), rb = bb.reihen;
  const naechte = new Map((basis.schlaf || []).map(n => [n.nacht, n]));
  const einh = rb.einheiten;
  const kraftMin = einh.map(l => l.filter(x => x.kategorie === 'kraft').reduce((s, x) => s + (x.dauer_min || 0), 0));
  const intens = einh.map(l => { const k = l.filter(x => x.kategorie === 'kraft' && x.energie_kcal && x.dauer_min >= 15); return k.length ? k.reduce((s, x) => s + x.energie_kcal, 0) / k.reduce((s, x) => s + x.dauer_min, 0) : null; });
  const bil = rb.bilanz_kcal, tr = rb.trend_kg;
  const bilanz7 = tage.map((_, i) => i >= 6 ? mittel(bil.slice(i - 6, i + 1)) : null);
  const ma = mahlzeitenAnalyse(basis, { von, bis }, { gewichtKg: bb.gewicht.aktuell_trend_kg });
  const waage = tage.map((_, i) => rb.gewicht_kg[i] != null && i > 0 && tr[i - 1] != null ? rb.gewicht_kg[i] - tr[i - 1] : null);
  const gewicht7 = tage.map((_, i) => i + 7 < tage.length && tr[i + 7] != null && tr[i] != null ? tr[i + 7] - tr[i] : null);
  return { tage, bb, ma, M: {
    abstand_schlaf: ma.tage.map(d => d.abstand_schlaf_min), abend_kcal: ma.tage.map(d => d.abend_kcal), pre_kh: ma.tage.map(d => d.pre_kh),
    natrium: R.sodium, waage, kcal_ziel: rb.kcal_ziel, eiweiss: R.protein, tagtyp: rb.tagtyp, fokus_geplant: rb.fokus_geplant,
    schlaf: tage.map(t => naechte.get(t)?.gesamt_min ?? null), tief: tage.map(t => naechte.get(t)?.tief_min ?? null),
    hrv: R.heart_rate_variability, rhr: R.resting_heart_rate, koffein: R.dietary_caffeine, wasser: R.dietary_water, kh: R.carbohydrates,
    kcal: rb.kcal, schritte: R.step_count, cardio: rb.cardio_min, kraft_min: kraftMin.map((v, i) => einh[i] ? v : null), intensitaet: intens, bilanz7, gewicht7,
  } };
}

function zusammenhaenge(M){
  const aus = [];
  for(const h of H){
    const x = verschieben(M[h.x], h.lag), y = M[h.y];
    const k = korrelation(x, y);
    if(k.r == null || k.n < 14 || Math.abs(k.r) < 0.25 || k.p > 0.05) continue;
    // Effekt anschaulich: oberes gegen unteres Drittel der Ursache
    const sortiert = [...k.paare].sort((a, b) => a[0] - b[0]), d = Math.floor(sortiert.length / 3);
    const unten = sortiert.slice(0, d), oben = sortiert.slice(-d);
    const yU = mittel(unten.map(p => p[1])), yO = mittel(oben.map(p => p[1])), xU = mittel(unten.map(p => p[0])), xO = mittel(oben.map(p => p[0]));
    const nk = NK[h.y] ?? 0, nkx = NK[h.x] ?? 0;
    const staerke = Math.abs(k.r) >= 0.5 ? 'stark' : Math.abs(k.r) >= 0.35 ? 'deutlich' : 'leicht';
    const gut = h.ziel === 'neutral' ? null : (k.r > 0) === (h.ziel === 'hoch');
    const wie = (v, key) => key === 'schlaf' || key === 'tief' ? `${Math.floor(v / 60)} h ${String(Math.round(v % 60)).padStart(2, '0')}` : `${fmt(v, NK[key] ?? 0)} ${EINHEIT[key]}`.trim();
    aus.push({ x: h.x, y: h.y, lag: h.lag, titel: h.satz, r: r1(k.r, 2), n: k.n, p: k.p < 0.001 ? '< 0,001' : fmt(k.p, 3), staerke, gut,
      text: `${h.lag ? 'Am Tag nach' : 'An Tagen mit'} viel ${NAME[h.x]} (Ø ${wie(xO, h.x)}) liegt ${NAME[h.y]} bei Ø ${wie(yO, h.y)}, ${h.lag ? 'nach' : 'bei'} wenig (Ø ${wie(xU, h.x)}) bei ${wie(yU, h.y)} – ${vz(yO - yU, nk)} ${EINHEIT[h.y]}.`,
      sicherheit: `${staerke}er Zusammenhang, r = ${fmt(k.r, 2)}, ${k.n} Tage, p ${k.p < 0.001 ? '< 0,001' : '= ' + fmt(k.p, 3)}` });
  }
  return aus.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

/** Bereitschaft heute: HRV und Ruhepuls gegen den 28-Tage-Schnitt, letzte Nacht, Belastung der letzten 3 Tage. */
function bereitschaft(M, tage, z, bb, ma, e){
  const i = tage.length - 1, basis = s => s.slice(Math.max(0, i - 28), i).filter(v => v != null);
  const teile = [];
  const zwert = (s, umkehren) => { const b = basis(s), heute = s[i] ?? s[i - 1]; if(b.length < 7 || heute == null) return null; const z = (heute - mittel(b)) / (sd(b) || 1); return umkehren ? -z : z; };
  const zH = zwert(M.hrv, false), zR = zwert(M.rhr, true);
  const sl = M.schlaf[i], zielMin = z.schlaf_ziel_h * 60;
  const last = M.kraft_min.slice(-3).reduce((s, v) => s + (v || 0), 0) + M.cardio.slice(-3).reduce((s, v) => s + (v || 0), 0) * 0.6;
  const zu01 = zz => Math.max(0, Math.min(1, 0.5 + zz / 4));
  if(zH != null) teile.push({ name: 'HRV', gewicht: 35, wert: zu01(zH), text: `${vz(zH, 1)} σ` });
  if(zR != null) teile.push({ name: 'Ruhepuls', gewicht: 25, wert: zu01(zR), text: `${vz(-zR, 1)} σ` });
  if(sl != null) teile.push({ name: 'Schlaf', gewicht: 30, wert: Math.max(0, Math.min(1, (sl - 300) / (zielMin - 300))), text: `${Math.floor(sl / 60)} h ${String(Math.round(sl % 60)).padStart(2, '0')}` });
  teile.push({ name: 'Belastung', gewicht: 10, wert: Math.max(0, Math.min(1, 1 - (last - 120) / 180)), text: `${fmt(last)} min/3 T` });
  // Ernährung gestern: Kalorien gegen Ziel und Kohlenhydrate (Glykogen) pro kg
  const kg = bb.gewicht.aktuell_trend_kg, gi = i - 1;
  if(M.kcal[gi] != null && M.kcal_ziel[gi]){
    const q = M.kcal[gi] / M.kcal_ziel[gi], khkg = M.kh[gi] != null && kg ? M.kh[gi] / kg : null;
    const w = Math.max(0, Math.min(1, 1 - Math.abs(1 - q) * 2.5)) * 0.6 + (khkg != null ? Math.min(1, khkg / 4) : 0.5) * 0.4;
    teile.push({ name: 'Ernährung', gewicht: 15, wert: w, text: `${Math.round(q * 100)} % kcal${khkg != null ? ` · ${fmt(khkg, 1)} g KH/kg` : ''}` });
  }
  if(M.abstand_schlaf[gi] != null) teile.push({ name: 'Mahlzeit', gewicht: 5, wert: Math.max(0, Math.min(1, M.abstand_schlaf[gi] / 150)), text: `${fmt(M.abstand_schlaf[gi])} min vor Schlaf` });
  const g = teile.reduce((s, t) => s + t.gewicht, 0);
  const wert = Math.round(100 * teile.reduce((s, t) => s + t.gewicht * t.wert, 0) / g);
  const stufe = wert >= 70 ? 'hoch' : wert >= 50 ? 'mittel' : 'niedrig';
  const text = stufe === 'hoch' ? 'Gut erholt – ideal für schwere Grundübungen und neue Bestleistungen.' : stufe === 'mittel' ? 'Normal belastbar – Plan durchziehen, aber nicht ans absolute Limit gehen.' : 'Erholung hat Vorrang – Volumen um ~30 % senken oder Technik/Pump statt Maximalkraft; früh schlafen.';
  // Vorbereitung auf das heutige Training (Checkliste)
  const heuteTyp = M.tagtyp[i], fokus = M.fokus_geplant[i], kgk = bb.gewicht.aktuell_trend_kg;
  const check = [];
  const add = (ok, text) => check.push({ ok, text });
  if(sl != null) add(sl >= zielMin - 30, `Schlaf ${Math.floor(sl / 60)} h ${String(Math.round(sl % 60)).padStart(2, '0')} (Ziel ${z.schlaf_ziel_h} h)`);
  if(M.kcal[i - 1] != null && M.kcal_ziel[i - 1]) add(M.kcal[i - 1] >= M.kcal_ziel[i - 1] - 200, `Gestern ${fmt(M.kcal[i - 1])} von ${fmt(M.kcal_ziel[i - 1])} kcal gegessen`);
  if(M.kh[i - 1] != null && kgk) add(M.kh[i - 1] / kgk >= 3, `Glykogen: gestern ${fmt(M.kh[i - 1])} g Kohlenhydrate (${fmt(M.kh[i - 1] / kgk, 1)} g/kg, Ziel ≥ 3)`);
  if(M.eiweiss[i - 1] != null && kgk) add(M.eiweiss[i - 1] / kgk >= z.protein_g_pro_kg * 0.9, `Eiweiß gestern ${fmt(M.eiweiss[i - 1])} g (${fmt(M.eiweiss[i - 1] / kgk, 1)} g/kg)`);
  if(M.abstand_schlaf[i - 1] != null) add(M.abstand_schlaf[i - 1] >= 90, `Letzte Mahlzeit ${fmt(M.abstand_schlaf[i - 1])} min vor dem Schlafen (≥ 90 min ideal)`);
  if(M.waage[i] != null && kgk) add(Math.abs(M.waage[i]) / kgk < 0.012, `Morgengewicht ${vz(M.waage[i], 1)} kg zum Trend${M.waage[i] < -kgk * 0.012 ? ' – eher dehydriert, früh trinken + Salz' : M.waage[i] > kgk * 0.012 ? ' – Wassereinlagerung (Salz/KH)' : ''}`);
  const heuteM = ma.tage.at(-1)?.mahlzeiten || [];
  if(heuteTyp === 'training'){
    const bisher = heuteM.reduce((s, x) => ({ kh: s.kh + x.kh, eiweiss: s.eiweiss + x.eiweiss }), { kh: 0, eiweiss: 0 });
    add(bisher.kh >= 60 || !heuteM.length ? null : false, heuteM.length ? `Heute bisher ${fmt(bisher.kh)} g KH und ${fmt(bisher.eiweiss)} g Eiweiß – vor dem Training 2–3 h vorher ~${fmt(Math.round(kgk * 1 / 10) * 10)} g KH + 40 g Eiweiß` : `Heute noch nichts getrackt – 2–3 h vor dem Training ~${fmt(Math.round(kgk * 1 / 10) * 10)} g KH + 40 g Eiweiß einplanen`);
  }
  return { wert, stufe, text, teile: teile.map(t => ({ ...t, wert: Math.round(t.wert * 100) })), basis_tage: teile.length,
    heute: { typ: heuteTyp, fokus: fokus || null }, vorbereitung: check };
}

/** Gewichtsprognose aus dem Trend der letzten 21 Tage, mit Unsicherheitsband. */
function prognose(bb){
  const tr = bb.reihen.trend_kg, n = tr.length, f = tr.slice(Math.max(0, n - 21));
  const k = steigung(f); const jetzt = tr.at(-1);
  if(k == null || jetzt == null) return null;
  const roh = bb.reihen.gewicht_kg.slice(-21).filter(v => v != null), streu = sd(roh) || 0.4;
  const punkte = [4, 8, 12].map(w => ({ wochen: w, kg: r1(jetzt + k * 7 * w, 1), band: r1(Math.min(3, streu * 0.6 + Math.abs(k) * 7 * w * 0.35), 1) }));
  const ziel = bb.gewicht.zielgewicht_kg;
  let zielDatum = null;
  if(ziel && k && Math.sign(ziel - jetzt) === Math.sign(k)) zielDatum = tagPlus(bb.reihen.tage.at(-1), Math.round((ziel - jetzt) / k));
  return { kg_pro_woche: r1(k * 7, 2), heute_kg: r1(jetzt, 1), punkte, zielgewicht_kg: ziel, ziel_datum: zielDatum };
}

/** Signifikante Veränderungen: letzte 14 Tage gegen die 14 davor. */
function trends(M){
  const defs = [['hrv', 'HRV', 'ms', 'hoch', 1], ['rhr', 'Ruhepuls', 'bpm', 'tief', 1], ['schlaf', 'Schlaf', 'min', 'hoch', 0], ['tief', 'Tiefschlaf', 'min', 'hoch', 0], ['schritte', 'Schritte', '', 'hoch', 0], ['kcal', 'Kalorien', 'kcal', 'neutral', 0], ['intensitaet', 'Trainingsintensität', 'kcal/min', 'hoch', 1]];
  const aus = [];
  for(const [k, name, e, richt, nk] of defs){
    const s = M[k], n = s.length, w = welch(s.slice(n - 14), s.slice(n - 28, n - 14));
    if(!w || w.p > 0.05) continue;
    const gut = richt === 'neutral' ? null : (w.diff > 0) === (richt === 'hoch');
    aus.push({ name, diff: r1(w.diff, nk), einheit: e, gut, p: w.p, text: `${name} ${w.diff > 0 ? 'gestiegen' : 'gesunken'}: ${vz(w.diff, nk)} ${e} (14 Tage gegen die 14 davor, p ${w.p < 0.001 ? '< 0,001' : '= ' + fmt(w.p, 3)}).` });
  }
  return aus;
}

/** Ausreißer der letzten 3 Tage gegen 28 Tage davor (|z| ≥ 2,5). */
function ausreisser(M, tage){
  const defs = [['rhr', 'Ruhepuls', 'bpm', 1], ['hrv', 'HRV', 'ms', 1], ['schlaf', 'Schlaf', 'min', 0], ['kcal', 'Kalorien', 'kcal', 0]];
  const aus = [], n = tage.length;
  for(const [k, name, e, nk] of defs){
    const b = M[k].slice(Math.max(0, n - 31), n - 3).filter(v => v != null), m = mittel(b), s = sd(b);
    if(b.length < 10 || !s) continue;
    for(let i = n - 3; i < n; i++){ const v = M[k][i]; if(v == null) continue; const z = (v - m) / s; if(Math.abs(z) >= 2.5) aus.push({ tag: tage[i], name, wert: r1(v, nk), z: r1(z, 1), text: `${name} am ${tage[i].slice(8)}.${tage[i].slice(5, 7)}.: ${fmt(v, nk)} ${e} – ${fmt(Math.abs(z), 1)} Standardabweichungen ${z > 0 ? 'über' : 'unter'} deinem Normalbereich (${fmt(m, nk)} ± ${fmt(s, nk)}).` }); }
  }
  return aus;
}

/** Hebel: wo bringt eine Änderung am meisten? Lücke × Gewicht im Wochen-Score, plus starke eigene Zusammenhänge. */
function hebel(scoreTeile, zh, z){
  const HEBEL = {
    Kalorien: 'Tagesziel je Trainings- und Rest-Day treffen – Mahlzeiten vorplanen, KH rund ums Training.',
    Eiweiß: `Jede Mahlzeit ≥ 40 g Eiweiß, ${z.protein_g_pro_kg} g/kg Tagesziel.`,
    Training: 'Geplante Trainingstage einhalten – Termine fix im Kalender.',
    Schlaf: `Feste Bettzeit, Ziel ${z.schlaf_ziel_h} h; Bildschirm 60 min vorher aus.`,
    Gewichtstempo: 'Kalorien in 100–150-kcal-Schritten anpassen und 10 Tage beobachten.',
    Aktivität: 'Schritte und Cardio auf die Rest-Days legen.',
  };
  const kandidaten = scoreTeile.map(t => ({ name: t.name, potenzial: Math.round((100 - t.wert) * t.gewicht / 100), text: HEBEL[t.name] || '' })).filter(h => h.potenzial >= 2);
  // persönliche Bestätigung aus den eigenen Daten
  for(const h of kandidaten){
    const passend = zh.find(x => (h.name === 'Schlaf' && x.x === 'schlaf' && x.gut) || (h.name === 'Kalorien' && x.x === 'kh' && x.gut));
    if(passend) h.beleg = `In deinen Daten: ${passend.titel} (r = ${fmt(passend.r, 2)}).`;
  }
  return kandidaten.sort((a, b) => b.potenzial - a.potenzial).slice(0, 3);
}

/** Gesamte intelligente Analyse für den Tag „bis“. */
export function intelligenz(basis, e, protokollListe, bis, scoreTeile = []){
  const von = tagPlus(bis, -89);
  const { tage, bb, ma, M } = merkmale(basis, e, protokollListe, von, bis);
  const zh = zusammenhaenge(M);
  return {
    zeitraum: { von, bis }, tage_mit_daten: M.hrv.filter(v => v != null).length,
    bereitschaft: bereitschaft(M, tage, e.ziele, bb, ma, e),
    prognose: prognose(bb),
    zusammenhaenge: zh,
    trends: trends(M),
    ausreisser: ausreisser(M, tage),
    hebel: hebel(scoreTeile, zh, e.ziele),
    methodik_daten: { mahlzeiten_mit_uhrzeit: ma.hat_uhrzeiten },
    methodik: 'Pearson-Korrelation mit t-Test (nur vorab festgelegte, physiologisch plausible Hypothesen; p < 0,05, |r| ≥ 0,25, ≥ 14 Tage), Welch-t-Test für Trendwechsel, z-Werte gegen 28 Tage für Ausreißer, lineare Trendprognose über 21 Tage.',
  };
}
