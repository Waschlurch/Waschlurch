/* Rechenkern – läuft identisch im Browser (Dashboard, Zoom ohne Nachladen) und auf dem Server (Claude).
   Keine Datenbank, keine Node-APIs: nur Tagesreihen rein, Auswertung raus. */

export const KCAL_PRO_KG = 7700;
export const VORLAUF = 28;
export const KRAFT = /kraft|strength|functional|bodybuilding|gewicht|weight|hiit|core|crossfit|calisthenics|push|pull|beine|legs|oberkörper|upper|lower/i;
export const CARDIO = /rad|cycl|bike|spinning|stair|stepper|treppe|ellip|crosstrainer|lauf|run|walk|geh|wander|hik|row|rudern|schwimm|swim|cardio|skipping|seil/i;
export const PHASEN = { aufbau: 'Aufbau', diaet: 'Diät', erhalt: 'Erhalt', recomp: 'Rekomposition' };
export const PHASE_RATE = { aufbau: 0.25, diaet: -0.6, erhalt: 0, recomp: 0 };

/* ── Training: Arten, Muskelgruppen, Splits ── */
export const MUSKELN = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Unterarme', 'Bauch', 'Quadrizeps', 'Beinbeuger', 'Gesäß', 'Waden', 'Nacken'];
const BEINE = ['Quadrizeps', 'Beinbeuger', 'Gesäß', 'Waden'], OBEN = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps'];
export const SPLITS = {
  ppl: { titel: 'Push / Pull / Beine', tage: [{ name: 'Push', muskeln: ['Brust', 'Schultern', 'Trizeps'] }, { name: 'Pull', muskeln: ['Rücken', 'Bizeps', 'Unterarme', 'Nacken'] }, { name: 'Beine', muskeln: [...BEINE, 'Bauch'] }] },
  ou: { titel: 'Oberkörper / Unterkörper', tage: [{ name: 'Oberkörper', muskeln: [...OBEN, 'Unterarme', 'Nacken'] }, { name: 'Unterkörper', muskeln: [...BEINE, 'Bauch'] }] },
  arnold: { titel: 'Arnold-Split', tage: [{ name: 'Brust & Rücken', muskeln: ['Brust', 'Rücken', 'Nacken'] }, { name: 'Schultern & Arme', muskeln: ['Schultern', 'Bizeps', 'Trizeps', 'Unterarme'] }, { name: 'Beine', muskeln: [...BEINE, 'Bauch'] }] },
  bro: { titel: 'Bro-Split (5 Tage)', tage: [{ name: 'Brust', muskeln: ['Brust'] }, { name: 'Rücken', muskeln: ['Rücken', 'Nacken'] }, { name: 'Schultern', muskeln: ['Schultern'] }, { name: 'Arme', muskeln: ['Bizeps', 'Trizeps', 'Unterarme'] }, { name: 'Beine', muskeln: [...BEINE, 'Bauch'] }] },
  ganz: { titel: 'Ganzkörper', tage: [{ name: 'Ganzkörper', muskeln: [...OBEN, ...BEINE, 'Bauch'] }] },
};
const ARTEN_REGELN = [
  [/schwimm|swim|pool/i, 'Schwimmen', 'cardio'], [/stair|stepper|treppe/i, 'Stairmaster', 'cardio'], [/ellip|crosstrainer|cross trainer/i, 'Crosstrainer', 'cardio'],
  [/rudern|rowing|rower|ergometer/i, 'Rudern', 'cardio'], [/radfahr|rad\b|cycl|bike|spinning/i, 'Radfahren', 'cardio'], [/lauf|run|jog/i, 'Laufen', 'cardio'],
  [/hik|wander/i, 'Wandern', 'cardio'], [/walk|gehen|spazier/i, 'Gehen', 'cardio'], [/hiit|intervall/i, 'HIIT', 'cardio'], [/seil|jump rope|skipping/i, 'Seilspringen', 'cardio'],
  [/yoga|pilates/i, 'Yoga', 'mobil'], [/flex|mobil|stretch|dehn|cooldown|abkühl/i, 'Mobility', 'mobil'], [/posing/i, 'Posing', 'sonst'],
  [/kraft|strength|functional|bodybuilding|gewicht|weight|push|pull|bein|leg|ober|unter|upper|lower|brust|chest|back|rücken|schulter|shoulder|arm|core|calisthenics|crossfit|ganzkörper|full body/i, 'Krafttraining', 'kraft'],
];
export const ARTEN = ['Krafttraining', 'Schwimmen', 'Stairmaster', 'Radfahren', 'Laufen', 'Gehen', 'Crosstrainer', 'Rudern', 'HIIT', 'Wandern', 'Seilspringen', 'Yoga', 'Mobility', 'Posing', 'Sport'];
/** Workout-Name aus Apple Health (englisch oder deutsch) → { art, kategorie }. */
export function artNormal(name){
  const s = String(name || '');
  for(const [re, art, kategorie] of ARTEN_REGELN) if(re.test(s)) return { art, kategorie };
  return { art: s || 'Sport', kategorie: 'sonst' };
}
const MUSKEL_WORTE = [
  [/brust|chest|bench|bankdr/i, ['Brust']], [/(?<![a-zäöüß])r(ü|ue)cken|\bback|\blat\b|latzug|\brow/i, ['Rücken']], [/schulter|shoulder|delt/i, ['Schultern']],
  [/bizeps|biceps|curl/i, ['Bizeps']], [/trizeps|triceps|dips/i, ['Trizeps']], [/unterarm|forearm|grip/i, ['Unterarme']], [/bauch|abs\b|core/i, ['Bauch']],
  [/quad|squat|kniebeug|beinpress/i, ['Quadrizeps']], [/beinbeuger|hamstring|deadlift|kreuzheb/i, ['Beinbeuger']], [/gesäß|gesaess|glute|hip thrust/i, ['Gesäß']],
  [/wade|calf|calves/i, ['Waden']], [/nacken|trap|shrug/i, ['Nacken']],
  [/bein|leg|unterkörper|unterkoerper|lower/i, BEINE], [/oberkörper|oberkoerper|upper/i, OBEN], [/\barm/i, ['Bizeps', 'Trizeps']],
  [/push/i, ['Brust', 'Schultern', 'Trizeps']], [/pull/i, ['Rücken', 'Bizeps']], [/ganzkörper|full ?body/i, [...OBEN, ...BEINE]],
];
/** Muskelgruppen, die ein Text nennt (Workout-Name, Notiz, Split-Tag). */
export function muskelnAus(text){ const m = new Set(); for(const [re, l] of MUSKEL_WORTE) if(re.test(text || '')) l.forEach(x => m.add(x)); return [...m]; }
/** Welcher Split-Tag passt zu einem Workout-Namen? Name-Treffer schlägt Muskel-Überlappung. */
export function fokusAus(text, split){
  const tage = split?.tage || []; if(!tage.length || !text) return null;
  const t = text.toLowerCase();
  const direkt = tage.find(d => d.name && t.includes(d.name.toLowerCase())); if(direkt) return direkt.name;
  const m = muskelnAus(text); if(!m.length) return null;
  let best = null, bestWert = 0;
  // Anteil der erkannten Muskeln, die der Split-Tag abdeckt; bei Gleichstand gewinnt der spezifischere Tag
  for(const d of tage){ const n = d.muskeln.filter(x => m.includes(x)).length; const wert = n / m.length + 0.01 * n / Math.max(1, d.muskeln.length); if(wert > bestWert){ bestWert = wert; best = d.name; } }
  return bestWert >= 0.5 ? best : null;
}

export const r1 = (v, nk = 1) => v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** nk) / 10 ** nk;
export const mittel = a => { const v = a.filter(x => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
export const summe = a => a.reduce((s, x) => s + (x || 0), 0);
export const tagPlus = (tag, n) => { const d = new Date(tag + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const tageZwischen = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
export const tagesListe = (von, bis) => { const t = []; for(let d = von; d <= bis; d = tagPlus(d, 1)) t.push(d); return t; };
const letzter = a => { for(let i = a.length - 1; i >= 0; i--) if(a[i] != null) return a[i]; return null; };

/** Exponentiell geglätteter Trend (α = 0,1 pro Tag) – Wasser- und Salzschwankungen fallen heraus. */
export function trend(werte, alpha = 0.1){ let t = null; return werte.map(w => { if(w != null) t = t == null ? w : t + alpha * (w - t); return t; }); }

/** Steigung pro Tag (lineare Regression über vorhandene Punkte). */
export function steigung(werte){
  const p = werte.map((y, x) => [x, y]).filter(([, y]) => y != null);
  if(p.length < 2) return null;
  const mx = mittel(p.map(q => q[0])), my = mittel(p.map(q => q[1]));
  const n = p.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0), d = p.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return d ? n / d : null;
}

export function isoWoche(tag){
  const d = new Date(tag + 'T12:00:00Z'); const wt = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wt + 3);
  const j = d.getUTCFullYear(), erster = new Date(Date.UTC(j, 0, 4));
  return `${j}-W${String(1 + Math.round(((d - erster) / 864e5 - 3 + ((erster.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
}

/** Trainings- oder Rest-Day: Eintrag im Protokoll gewinnt, sonst Rhythmus (z. B. T,T,R ab Startdatum). */
export function tagTyp(tag, plan, protokoll){
  const p = protokoll?.get?.(tag);
  if(p?.tagtyp === 'training' || p?.tagtyp === 'rest') return p.tagtyp;
  if(!plan?.muster?.length || !plan.start) return null;
  const n = plan.muster.length, i = ((tageZwischen(plan.start, tag) % n) + n) % n;
  return plan.muster[i] === 'T' ? 'training' : 'rest';
}

/** Phase an einem Tag: letzte Phase mit Start ≤ Tag; davor die erste bzw. die Standardphase. */
export function phaseAm(tag, phasen, standard = 'aufbau'){
  const liste = [...(phasen || [])].filter(p => p.start).sort((a, b) => a.start.localeCompare(b.start));
  let aktiv = null; for(const p of liste) if(p.start <= tag) aktiv = p;
  return aktiv || { phase: standard, start: null };
}

/** Tagesreihen aus { metrik: [{tag, wert}] } auf eine Tagesliste ausrichten. */
export function ausrichten(reihen, tage){
  const aus = {};
  for(const [m, liste] of Object.entries(reihen || {})){ const map = new Map(liste.map(p => [p.tag, p.wert])); aus[m] = tage.map(t => map.get(t) ?? null); }
  return new Proxy(aus, { get: (o, k) => o[k] || tage.map(() => null) });
}

/** Kalorienziel des Tages: eigenes Ziel je Tagtyp > festes Ziel > TDEE + Überschuss > TDEE + Zieltempo. */
export function kcalZiel(typ, z, tdee, zielRateKg){
  if(typ === 'training' && z.kcal_training) return z.kcal_training;
  if(typ === 'rest' && z.kcal_rest) return z.kcal_rest;
  if(z.kcal_ziel) return z.kcal_ziel;
  if(tdee == null) return null;
  const basis = z.ueberschuss_kcal != null ? tdee + z.ueberschuss_kcal : zielRateKg != null ? tdee + zielRateKg * KCAL_PRO_KG / 7 : null;
  if(basis == null) return null;
  // ohne eigene Tagtyp-Ziele: Trainingstage +150, Rest-Days −150 kcal (Kohlenhydrat-Zyklus light)
  return Math.round(basis + (typ === 'training' ? 150 : typ === 'rest' ? -150 : 0));
}

/**
 * Bodybuilding-Auswertung für ein Fenster.
 * basis: { tage, reihen: {metrik: [{tag,wert,min,max}]}, workouts: [{tag, art, dauer_min, …}], groesse }
 * e: Einstellungen (ziele, phasen, plan), protokoll: [{tag, cheat, tagtyp, notiz}]
 */
export function bodybuilding(basis, fenster, e, protokollListe = []){
  const z = e.ziele, protokoll = new Map(protokollListe.map(p => [p.tag, p]));
  const alle = tagesListe(tagPlus(fenster.von, -VORLAUF), fenster.bis);
  const R = ausrichten(basis.reihen, alle);
  const gewicht = R.weight_body_mass, fett = R.body_fat_percentage, lbmMess = R.lean_body_mass, taille = R.waist_circumference;
  const kcal = R.dietary_energy, protein = R.protein, kh = R.carbohydrates, fettG = R.total_fat, aktiv = R.active_energy, basal = R.basal_energy_burned, schritte = R.step_count;
  const tr = trend(gewicht), fettTrend = trend(fett, 0.15);
  const groesse = z.groesse_cm || basis.groesse || null;
  const lbm = alle.map((_, i) => lbmMess[i] ?? (tr[i] != null && fettTrend[i] != null ? tr[i] * (1 - fettTrend[i] / 100) : null));
  const ffmi = l => l != null && groesse ? l / (groesse / 100) ** 2 + 6.1 * (1.8 - groesse / 100) : null;
  const verbrauch = alle.map((_, i) => aktiv[i] != null && basal[i] != null ? aktiv[i] + basal[i] : null);
  const bilanz = alle.map((_, i) => kcal[i] != null && verbrauch[i] != null ? kcal[i] - verbrauch[i] : null);
  const gkg = alle.map((_, i) => protein[i] != null && tr[i] ? protein[i] / tr[i] : null);

  // Apple-Health-Workouts + manuelle Einheiten aus dem Protokoll
  const wo = [
    ...(basis.workouts || []).filter(w => w.tag >= alle[0] && w.tag <= fenster.bis).map(w => ({ ...w, titel: w.art, ...artNormal(w.art), quelle: 'apple' })),
    ...protokollListe.filter(p => p.tag >= alle[0] && p.tag <= fenster.bis).flatMap(p => (p.einheiten || []).map((x, k) => ({ id: `m-${p.tag}-${k}`, tag: p.tag, titel: x.art, ...artNormal(x.art), art: artNormal(x.art).art === 'Sport' ? x.art : artNormal(x.art).art, dauer_min: x.dauer_min, quelle: 'manuell' }))),
  ];
  const einheitenAm = new Map(), kraftAm = new Map(), cardioAm = new Map();
  for(const w of wo){
    (einheitenAm.get(w.tag) || einheitenAm.set(w.tag, []).get(w.tag)).push(w);
    if(w.kategorie === 'kraft') (kraftAm.get(w.tag) || kraftAm.set(w.tag, []).get(w.tag)).push(w);
    else if(w.kategorie === 'cardio') cardioAm.set(w.tag, (cardioAm.get(w.tag) || 0) + (w.dauer_min || 0));
  }
  const cardio = alle.map(t => cardioAm.has(t) ? Math.round(cardioAm.get(t)) : 0);
  const typen = alle.map(t => tagTyp(t, e.plan, protokoll) ?? (kraftAm.has(t) ? 'training' : 'rest'));
  // Split: tatsächlicher Fokus (Protokoll > Workout-Name > Plan) und geplanter Fokus (nächster nach dem zuletzt trainierten)
  const split = e.split?.tage?.length ? e.split : null;
  const fokus = [], geplant = [];
  let naechster = 0;
  alle.forEach((t, i) => {
    const p = protokoll.get(t), k = kraftAm.get(t);
    geplant.push(split && typen[i] === 'training' ? split.tage[naechster % split.tage.length].name : null);
    let f = p?.fokus || null;
    if(!f && k && split) f = k.map(w => fokusAus(w.titel, split)).find(Boolean) || null;
    if(!f && k) f = split ? geplant[i] : (muskelnAus(k.map(w => w.titel).join(' ')).length ? k[0].titel : null);
    fokus.push(k || p?.fokus ? f : null);
    if(split && fokus[i]){ const j = split.tage.findIndex(d => d.name === fokus[i]); if(j >= 0) naechster = j + 1; else naechster++; }
  });
  const muskelnVon = f => { const d = split?.tage.find(x => x.name === f); return d ? d.muskeln : muskelnAus(f); };
  const phasenTag = alle.map(t => phaseAm(t, e.phasen, z.phase).phase);
  const cheat = alle.map(t => !!protokoll.get(t)?.cheat);

  const ab = VORLAUF, n = alle.length, sicht = a => a.slice(ab);
  const aktuell = tr.at(-1);
  const proTag = steigung(tr.slice(Math.max(0, n - 14)));
  const rateKg = proTag != null ? proTag * 7 : null, ratePct = rateKg != null && aktuell ? rateKg / aktuell * 100 : null;

  // TDEE adaptiv (21 Tage, ≥ 10 geloggt), Cheat Days zählen mit – sie gehören zur Realität
  const tF = Math.min(21, n), st = n - tF, zuf = kcal.slice(st), gel = zuf.filter(v => v != null).length;
  const trStart = tr.slice(st).find(v => v != null);
  let tdee = null, tdeeMethode = null;
  if(gel >= 10 && trStart != null && aktuell != null){ tdee = mittel(zuf) - (aktuell - trStart) * KCAL_PRO_KG / tF; tdeeMethode = 'adaptiv'; }
  else if(mittel(verbrauch.slice(st)) != null){ tdee = mittel(verbrauch.slice(st)); tdeeMethode = 'apple'; }

  const phaseJetzt = phaseAm(fenster.bis, e.phasen, z.phase);
  const zielRatePct = z.rate_prozent_woche ?? PHASE_RATE[phaseJetzt.phase] ?? 0;
  const zielRateKg = aktuell ? aktuell * zielRatePct / 100 : null;
  const kcalZielReihe = alle.map((_, i) => kcalZiel(typen[i], z, tdee, zielRateKg));
  const proteinZiel = z.protein_g ?? (aktuell ? aktuell * z.protein_g_pro_kg : null);
  const wochenBisZiel = z.zielgewicht_kg && rateKg && Math.sign(z.zielgewicht_kg - aktuell) === Math.sign(rateKg) ? (z.zielgewicht_kg - aktuell) / rateKg : null;

  // Phase seit Start
  let seit = null;
  if(phaseJetzt.start){
    // Ø der Waage in der ersten Phasenwoche – auch wenn der Start vor dem geladenen Fenster liegt
    const fruehe = (basis.reihen?.weight_body_mass || []).filter(p => p.tag >= phaseJetzt.start && p.tag <= tagPlus(phaseJetzt.start, 6)).map(p => p.wert);
    const startGewicht = mittel(fruehe);
    seit = { start: phaseJetzt.start, tage: tageZwischen(phaseJetzt.start, fenster.bis) + 1, wochen: r1((tageZwischen(phaseJetzt.start, fenster.bis) + 1) / 7, 1),
      gewicht_start_kg: r1(startGewicht, 1), veraenderung_kg: r1(startGewicht != null && aktuell != null ? aktuell - startGewicht : null, 2) };
  }

  // Tagtypen im Fenster
  const S = { typ: sicht(typen), kcal: sicht(kcal), ziel: sicht(kcalZielReihe), cardio: sicht(cardio), cheat: sicht(cheat) };
  const typStat = typ => {
    const idx = S.typ.map((t, i) => t === typ ? i : -1).filter(i => i >= 0);
    const mit = idx.filter(i => S.kcal[i] != null);
    const ueber = mit.filter(i => S.ziel[i] != null && S.kcal[i] > S.ziel[i] + 200 && !S.cheat[i]);
    return { tage: idx.length, geloggt: mit.length, kcal_mittel: r1(mittel(mit.map(i => S.kcal[i])), 0), kcal_ziel_mittel: r1(mittel(idx.map(i => S.ziel[i])), 0),
      ueber_ziel_tage: ueber.length, ueber_ziel_mittel_kcal: r1(mittel(ueber.map(i => S.kcal[i] - S.ziel[i])), 0), cardio_mittel_min: r1(mittel(idx.map(i => S.cardio[i])), 0) };
  };

  // Krafttraining pro ISO-Woche
  const sichtTage = sicht(alle);
  const wochen = {};
  for(const t of sichtTage) wochen[isoWoche(t)] ||= { woche: isoWoche(t), einheiten: 0, minuten: 0, geplant: 0 };
  sichtTage.forEach((t, i) => { if(S.typ[i] === 'training') wochen[isoWoche(t)].geplant++; });
  const kraftListe = wo.filter(w => w.tag >= fenster.von && w.kategorie === 'kraft');
  for(const w of kraftListe){ const k = wochen[isoWoche(w.tag)]; if(k){ k.einheiten++; k.minuten += w.dauer_min || 0; } }
  const wochenListe = Object.values(wochen).map(w => ({ ...w, minuten: Math.round(w.minuten) }));
  const volle = wochenListe.length > 1 ? wochenListe.slice(0, -1) : wochenListe;
  const geplantTraining = sichtTage.filter((t, i) => S.typ[i] === 'training' && t <= fenster.bis);
  const trainiertGeplant = geplantTraining.filter(t => kraftAm.has(t)).length;

  // Training im Detail: Arten, Split-Tage, Muskelgruppen
  const woSicht = wo.filter(w => w.tag >= fenster.von);
  const artMap = new Map();
  for(const w of woSicht){ const a = artMap.get(w.art) || { art: w.art, kategorie: w.kategorie, einheiten: 0, minuten: 0, apple: 0, manuell: 0 }; a.einheiten++; a.minuten += w.dauer_min || 0; a[w.quelle]++; artMap.set(w.art, a); }
  const sichtFokus = sicht(fokus), sichtGeplant = sicht(geplant);
  const fensterTage = sichtTage.length, wochenFaktor = 7 / Math.max(7, fensterTage);
  const splitTage = (split?.tage || []).map(d => {
    const idx = sichtFokus.map((f, i) => f === d.name ? i : -1).filter(i => i >= 0);
    const dauern = idx.flatMap(i => (kraftAm.get(sichtTage[i]) || []).map(w => w.dauer_min)).filter(Boolean);
    return { name: d.name, muskeln: d.muskeln, absolviert: idx.length, geplant: sichtGeplant.filter(g => g === d.name).length, pro_woche: r1(idx.length * wochenFaktor, 1),
      dauer_mittel_min: r1(mittel(dauern), 0), kcal_mittel: r1(mittel(idx.map(i => S.kcal[i])), 0), letzte: idx.length ? sichtTage[idx.at(-1)] : null };
  });
  const muskelStat = MUSKELN.map(m => {
    const tageM = alle.filter((t, i) => fokus[i] && muskelnVon(fokus[i]).includes(m));
    const imFenster = tageM.filter(t => t >= fenster.von);
    const luecken = tageM.slice(1).map((t, i) => tageZwischen(tageM[i], t));
    return { muskel: m, einheiten: imFenster.length, pro_woche: r1(imFenster.length * wochenFaktor, 1), letzte: tageM.at(-1) || null,
      tage_seit: tageM.length ? tageZwischen(tageM.at(-1), fenster.bis) : null, pause_mittel_tage: r1(mittel(luecken), 1), im_split: !!split?.tage.some(d => d.muskeln.includes(m)) };
  }).filter(x => x.im_split || x.einheiten);
  const abweichungen = sichtTage.map((t, i) => sichtGeplant[i] && sichtFokus[i] && sichtGeplant[i] !== sichtFokus[i] ? { tag: t, geplant: sichtGeplant[i], gemacht: sichtFokus[i] } : null).filter(Boolean);
  // Intensität (kcal/min laut Apple Watch) nach langer vs. kurzer Nacht
  const naechte = new Map((basis.schlaf || []).map(n => [n.nacht, n.gesamt_min]));
  const intens = wo.filter(w => w.kategorie === 'kraft' && w.energie_kcal && w.dauer_min >= 15).map(w => ({ s: naechte.get(w.tag), i: w.energie_kcal / w.dauer_min })).filter(x => x.s != null);

  const lbmJetzt = letzter(lbm), lbmVorher = sicht(lbm).find(v => v != null);
  const sTaille = sicht(taille).filter(v => v != null);

  return {
    phase: { schluessel: phaseJetzt.phase, titel: PHASEN[phaseJetzt.phase], seit },
    ziele: z, plan: e.plan || null,
    gewicht: {
      aktuell_trend_kg: r1(aktuell, 2), letzte_messung_kg: r1(letzter(gewicht)), messungen_14_tage: gewicht.slice(-14).filter(v => v != null).length,
      rate_kg_woche: r1(rateKg, 2), rate_prozent_woche: r1(ratePct, 2), ziel_rate_prozent_woche: r1(zielRatePct, 2), ziel_rate_kg_woche: r1(zielRateKg, 2),
      im_plan: ratePct == null ? null : Math.abs(ratePct - zielRatePct) <= Math.max(0.15, Math.abs(zielRatePct) * 0.4),
      zielgewicht_kg: z.zielgewicht_kg, wochen_bis_ziel: r1(wochenBisZiel, 1),
    },
    energie: {
      tdee_kcal: r1(tdee, 0), tdee_methode: tdeeMethode === 'adaptiv' ? 'adaptiv aus Zufuhr und Gewichtstrend (21 Tage)' : tdeeMethode ? 'Apple-Health-Verbrauch (aktiv + Ruhe)' : null,
      zufuhr_mittel_kcal: r1(mittel(S.kcal), 0), verbrauch_mittel_kcal: r1(mittel(sicht(verbrauch)), 0), bilanz_mittel_kcal: r1(mittel(sicht(bilanz)), 0),
      empfohlene_kcal: r1(mittel(S.ziel), 0), ziel_training_kcal: kcalZiel('training', z, tdee, zielRateKg), ziel_rest_kcal: kcalZiel('rest', z, tdee, zielRateKg),
      tage_geloggt: S.kcal.filter(v => v != null).length,
    },
    makros: {
      eiweiss_g: r1(mittel(sicht(protein)), 0), kh_g: r1(mittel(sicht(kh)), 0), fett_g: r1(mittel(sicht(fettG)), 0),
      ziel_eiweiss_g: r1(proteinZiel, 0), ziel_kh_g: z.kh_g, ziel_fett_g: z.fett_g,
    },
    eiweiss: {
      mittel_g: r1(mittel(sicht(protein)), 0), mittel_g_pro_kg: r1(mittel(sicht(gkg)), 2), ziel_g_pro_kg: z.protein_g_pro_kg, ziel_g: r1(proteinZiel, 0),
      tage_ziel_erreicht: sicht(protein).filter(v => v != null && proteinZiel && v >= proteinZiel * 0.95).length, tage_geloggt: sicht(protein).filter(v => v != null).length,
    },
    tagtypen: { training: typStat('training'), rest: typStat('rest') },
    cardio: { mittel_min: r1(mittel(S.cardio), 0), ziel_min: z.cardio_min_ziel, ziel_rest_min: z.cardio_min_rest, tage_ziel_erreicht: S.cardio.filter((v, i) => v >= ((S.typ[i] === 'rest' && z.cardio_min_rest) || z.cardio_min_ziel || Infinity)).length },
    schritte: { mittel: r1(mittel(sicht(schritte)), 0), ziel: z.schritte_ziel, tage_ziel_erreicht: sicht(schritte).filter(v => v != null && v >= z.schritte_ziel).length },
    cheat_days: sichtTage.filter((_, i) => S.cheat[i]),
    koerper: {
      koerperfett_prozent: r1(letzter(fettTrend)), magermasse_kg: r1(lbmJetzt), magermasse_veraenderung_kg: r1(lbmJetzt != null && lbmVorher != null ? lbmJetzt - lbmVorher : null, 2),
      ffmi: r1(ffmi(lbmJetzt), 1), groesse_cm: groesse, taille_cm: r1(letzter(taille)), taille_veraenderung_cm: r1(sTaille.length > 1 ? sTaille.at(-1) - sTaille[0] : null),
    },
    kraft: {
      einheiten: kraftListe.length, minuten: Math.round(summe(kraftListe.map(w => w.dauer_min))), pro_woche_mittel: r1(mittel(volle.map(w => w.einheiten)), 1),
      ziel_pro_woche: z.kraft_pro_woche, wochen: wochenListe, geplante_trainingstage: geplantTraining.length, davon_trainiert: trainiertGeplant,
    },
    training: {
      split: split ? { tage: split.tage } : null,
      arten: [...artMap.values()].map(a => ({ ...a, minuten: Math.round(a.minuten) })).sort((a, b) => b.minuten - a.minuten),
      split_tage: splitTage, muskeln: muskelStat, abweichungen,
      cardio_minuten_woche: r1(summe(S.cardio) * wochenFaktor, 0),
      intensitaet: intens.length ? { lang: r1(mittel(intens.filter(x => x.s >= (z.schlaf_ziel_h * 60) - 15).map(x => x.i)), 2), kurz: r1(mittel(intens.filter(x => x.s < (z.schlaf_ziel_h * 60) - 45).map(x => x.i)), 2),
        n_lang: intens.filter(x => x.s >= (z.schlaf_ziel_h * 60) - 15).length, n_kurz: intens.filter(x => x.s < (z.schlaf_ziel_h * 60) - 45).length } : null,
    },
    reihen: {
      tage: sichtTage, trend_kg: sicht(tr).map(v => r1(v, 2)), gewicht_kg: sicht(gewicht), bilanz_kcal: sicht(bilanz).map(v => r1(v, 0)),
      verbrauch_kcal: sicht(verbrauch).map(v => r1(v, 0)), eiweiss_g_pro_kg: sicht(gkg).map(v => r1(v, 2)), magermasse_kg: sicht(lbm).map(v => r1(v, 1)),
      taille_cm: sicht(taille), kcal: S.kcal, kcal_ziel: S.ziel, tagtyp: S.typ, phase: sicht(phasenTag), cheat: S.cheat, cardio_min: S.cardio,
      kraft_tage: sichtTage.map(t => (kraftAm.get(t) || []).map(w => ({ art: w.titel, dauer_min: w.dauer_min }))),
      einheiten: sichtTage.map(t => (einheitenAm.get(t) || []).map(w => ({ id: w.id, art: w.art, titel: w.titel, kategorie: w.kategorie, dauer_min: r1(w.dauer_min, 0), energie_kcal: w.energie_kcal ?? null, hf_mittel: w.hf_mittel ?? null, quelle: w.quelle }))),
      fokus: sichtFokus, fokus_geplant: sichtGeplant,
    },
  };
}
