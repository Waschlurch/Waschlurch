/* Coach-Analyse: diese Woche gegen letzte Woche, Wochen-Score, Warnungen und Empfehlungen.
   Ausgerichtet auf maximalen Muskelaufbau bei kontrollierter Fettzunahme. Läuft im Browser und auf dem Server. */

import { bodybuilding, ausrichten, tagesListe, tagPlus, mittel, r1, PHASEN, KCAL_PRO_KG } from './rechnen.mjs';
import { intelligenz } from './erkenntnis.mjs';

const fmt = (v, nk = 0) => v == null ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: nk, minimumFractionDigits: nk });
const vz = (v, nk = 0) => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), nk);
const hm = min => min == null ? '–' : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
const tagKurz = t => { const d = new Date(t + 'T12:00:00Z'); return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getUTCDay()] + ' ' + d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '.'; };
const SCHWERE = { kritisch: 0, warnung: 1, gut: 3, info: 2 };

function schlafImFenster(basis, f){
  const n = (basis.schlaf || []).filter(x => x.nacht >= f.von && x.nacht <= f.bis);
  return { mittel_min: r1(mittel(n.map(x => x.gesamt_min)), 0), naechte: n.length, tief_min: r1(mittel(n.map(x => x.tief_min)), 0), rem_min: r1(mittel(n.map(x => x.rem_min)), 0), liste: n };
}

function wochenwerte(basis, f, e, protokoll){
  const bb = bodybuilding(basis, f, e, protokoll);
  const R = ausrichten(basis.reihen, tagesListe(f.von, f.bis));
  const s = schlafImFenster(basis, f);
  const abw = bb.reihen.kcal.map((k, i) => k != null && bb.reihen.kcal_ziel[i] != null && !bb.reihen.cheat[i] ? Math.abs(k - bb.reihen.kcal_ziel[i]) : null);
  return { bb, schlaf: s,
    rate_pct: bb.gewicht.rate_prozent_woche, ziel_rate_pct: bb.gewicht.ziel_rate_prozent_woche,
    kcal: bb.energie.zufuhr_mittel_kcal, kcal_ziel: bb.energie.empfohlene_kcal, kcal_abw: r1(mittel(abw), 0),
    eiweiss_g: bb.eiweiss.mittel_g, eiweiss_ziel: bb.eiweiss.ziel_g, gkg: bb.eiweiss.mittel_g_pro_kg,
    kraft: bb.kraft.einheiten, kraft_geplant: bb.kraft.geplante_trainingstage, kraft_ziel: e.ziele.kraft_pro_woche,
    schritte: bb.schritte.mittel, cardio: bb.cardio.mittel_min, cheats: bb.cheat_days.length,
    hrv: r1(mittel(R.heart_rate_variability), 1), rhr: r1(mittel(R.resting_heart_rate), 1),
    rest_ueber: bb.tagtypen.rest.ueber_ziel_tage, rest_tage: bb.tagtypen.rest.geloggt,
  };
}

/** Wochen-Score 0–100 aus Ziel-Erfüllung; fehlende Bereiche zählen nicht. */
export function score(w, z){
  const teile = [];
  const add = (name, gewicht, wert) => { if(wert != null && Number.isFinite(wert)) teile.push({ name, gewicht, wert: Math.max(0, Math.min(1, wert)) }); };
  if(w.rate_pct != null) add('Gewichtstempo', 15, 1 - Math.abs(w.rate_pct - w.ziel_rate_pct) / Math.max(0.3, Math.abs(w.ziel_rate_pct) * 1.5));
  if(w.kcal_abw != null) add('Kalorien', 20, 1 - w.kcal_abw / 800);
  if(w.eiweiss_g != null && w.eiweiss_ziel) add('Eiweiß', 20, w.eiweiss_g / w.eiweiss_ziel);
  const soll = w.kraft_geplant || w.kraft_ziel; if(soll) add('Training', 20, w.kraft / soll);
  if(w.schlaf.mittel_min != null) add('Schlaf', 15, w.schlaf.mittel_min / (z.schlaf_ziel_h * 60));
  const akt = [w.schritte != null && z.schritte_ziel ? Math.min(1, w.schritte / z.schritte_ziel) : null, z.cardio_min_ziel ? Math.min(1, (w.cardio || 0) / z.cardio_min_ziel) : null].filter(v => v != null);
  if(akt.length) add('Aktivität', 10, mittel(akt));
  const g = teile.reduce((s, t) => s + t.gewicht, 0);
  return { wert: g ? Math.round(100 * teile.reduce((s, t) => s + t.gewicht * t.wert, 0) / g) : null, teile: teile.map(t => ({ ...t, wert: Math.round(t.wert * 100) })) };
}

export function analyse(basis, e, protokollListe = [], bis){
  const z = e.ziele;
  const A = { von: tagPlus(bis, -6), bis }, B = { von: tagPlus(bis, -13), bis: tagPlus(bis, -7) };
  const a = wochenwerte(basis, A, e, protokollListe), b = wochenwerte(basis, B, e, protokollListe);
  const sa = score(a, z), sb = score(b, z);
  const bb = a.bb, phase = bb.phase.schluessel, aufbau = phase === 'aufbau', diaet = phase === 'diaet';
  const E = [];
  const add = (ton, bereich, titel, text) => E.push({ ton, bereich, titel, text });

  // ── Vergleich Woche gegen Woche
  const nah = (x, ziel) => x == null || ziel == null ? null : Math.abs(x - ziel);
  const zeile = (titel, va, vb, einheit, besser, nk = 0) => ({ titel, diese: va, letzte: vb, einheit, nk, besser: va == null || vb == null ? null : besser });
  const vergleich = [
    zeile('Gewichtstempo', a.rate_pct, b.rate_pct, '% / Woche', nah(a.rate_pct, a.ziel_rate_pct) < nah(b.rate_pct, b.ziel_rate_pct) - 0.03 ? true : nah(a.rate_pct, a.ziel_rate_pct) > nah(b.rate_pct, b.ziel_rate_pct) + 0.03 ? false : null, 2),
    zeile('Kalorien Ø', a.kcal, b.kcal, 'kcal', a.kcal_abw != null && b.kcal_abw != null ? (a.kcal_abw < b.kcal_abw - 40 ? true : a.kcal_abw > b.kcal_abw + 40 ? false : null) : null),
    zeile('Eiweiß Ø', a.eiweiss_g, b.eiweiss_g, 'g', a.eiweiss_g > b.eiweiss_g + 5 && b.eiweiss_g < (a.eiweiss_ziel || Infinity) ? true : a.eiweiss_g < b.eiweiss_g - 5 && a.eiweiss_g < (a.eiweiss_ziel || 0) ? false : null),
    (() => { const qa = a.kraft / (a.kraft_geplant || a.kraft_ziel || 1), qb = b.kraft / (b.kraft_geplant || b.kraft_ziel || 1);
      return zeile('Krafteinheiten', a.kraft, b.kraft, a.kraft_geplant ? `von ${a.kraft_geplant} geplant` : '', qa > qb + 0.05 ? true : qa < qb - 0.05 ? false : null); })(),
    zeile('Schlaf Ø', a.schlaf.mittel_min, b.schlaf.mittel_min, 'min', a.schlaf.mittel_min > b.schlaf.mittel_min + 10 ? true : a.schlaf.mittel_min < b.schlaf.mittel_min - 10 ? false : null),
    zeile('HRV Ø', a.hrv, b.hrv, 'ms', a.hrv > b.hrv * 1.03 ? true : a.hrv < b.hrv * 0.97 ? false : null, 1),
    zeile('Ruhepuls Ø', a.rhr, b.rhr, 'bpm', a.rhr < b.rhr - 0.7 ? true : a.rhr > b.rhr + 0.7 ? false : null, 1),
    zeile('Schritte Ø', a.schritte, b.schritte, '', a.schritte > b.schritte * 1.05 ? true : a.schritte < b.schritte * 0.95 ? false : null),
    zeile('Cardio Ø', a.cardio, b.cardio, 'min / Tag', a.cardio > b.cardio + 3 ? true : a.cardio < b.cardio - 3 ? false : null),
    zeile('Cheat Days', a.cheats, b.cheats, '', a.cheats < b.cheats ? true : a.cheats > b.cheats ? false : null),
  ];
  const plus = vergleich.filter(v => v.besser === true).length, minus = vergleich.filter(v => v.besser === false).length;
  const diff = sa.wert != null && sb.wert != null ? sa.wert - sb.wert : null;
  const urteil = diff == null ? 'offen' : diff >= 4 ? 'besser' : diff <= -4 ? 'schlechter' : 'gleich';

  // ── Gewicht & Tempo
  const g = bb.gewicht;
  if(g.messungen_14_tage < 6) add('info', 'aufbau', 'Öfter wiegen', `Nur ${g.messungen_14_tage} Messungen in 14 Tagen. Wiege dich täglich morgens nüchtern nach dem Toilettengang – erst dann ist der Trend verlässlich.`);
  else if(g.rate_prozent_woche != null){
    const r = g.rate_prozent_woche, ziel = g.ziel_rate_prozent_woche, deltaKcal = Math.round(Math.abs(r - ziel) / 100 * g.aktuell_trend_kg * KCAL_PRO_KG / 7 / 10) * 10;
    if(aufbau && r > Math.max(ziel * 1.6, ziel + 0.15)) add('warnung', 'aufbau', 'Du nimmst zu schnell zu', `${vz(r, 2)} % pro Woche bei Ziel ${vz(ziel, 2)} %. Oberhalb von ~0,5 % kommt überwiegend Fett dazu, nicht mehr Muskel. Senke die Zufuhr um etwa ${fmt(deltaKcal)} kcal pro Tag – am besten an den Rest-Days.`);
    else if(aufbau && r < ziel * 0.5) add('warnung', 'aufbau', 'Zu wenig Überschuss für maximalen Aufbau', `${vz(r, 2)} % pro Woche bei Ziel ${vz(ziel, 2)} %. Für maximale Hypertrophie fehlen dir rund ${fmt(deltaKcal)} kcal pro Tag – vorzugsweise als Kohlenhydrate rund ums Training.`);
    else if(diaet && r < -1.0) add('kritisch', 'aufbau', 'Diät zu aggressiv', `${vz(r, 2)} % pro Woche. Über 1 % pro Woche steigt das Risiko, Muskulatur zu verlieren. Erhöhe um etwa ${fmt(deltaKcal)} kcal oder reduziere Cardio.`);
    else if(diaet && r > ziel * 0.5) add('warnung', 'aufbau', 'Diät stockt', `${vz(r, 2)} % pro Woche bei Ziel ${vz(ziel, 2)} %. Senke um rund ${fmt(deltaKcal)} kcal pro Tag oder ergänze täglich ~${fmt(Math.round(deltaKcal / 8))} min Cardio.`);
    else if(g.im_plan) add('gut', 'aufbau', 'Tempo im Plan', `${vz(r, 2)} % pro Woche (${vz(g.rate_kg_woche, 2)} kg) – genau im Zielkorridor für ${PHASEN[phase] || phase}.`);
  }
  if(aufbau && bb.koerper.taille_veraenderung_cm != null && bb.koerper.taille_veraenderung_cm > 1.5 && g.rate_prozent_woche != null && g.rate_prozent_woche > 0.4)
    add('warnung', 'aufbau', 'Taille wächst schnell', `Taille ${vz(bb.koerper.taille_veraenderung_cm, 1)} cm im Zeitraum – zusammen mit dem hohen Tempo ein Zeichen für zu viel Fettzunahme.`);

  // ── Kalorien nach Tagtyp
  const rest = a.bb.tagtypen.rest, tr = a.bb.tagtypen.training;
  if(rest.ueber_ziel_tage >= 1) add(rest.ueber_ziel_tage >= 2 ? 'warnung' : 'info', 'ernaehrung', 'Rest-Days über Ziel', `An ${rest.ueber_ziel_tage} von ${rest.geloggt} Rest-Days im Schnitt ${vz(rest.ueber_ziel_mittel_kcal)} kcal über dem Ziel von ${fmt(rest.kcal_ziel_mittel)} kcal. Ohne Krafttraining fehlt der Reiz – überschüssige Energie geht eher ins Fett. Kohlenhydrate an Rest-Days reduzieren, Eiweiß halten.`);
  if(tr.geloggt >= 2 && tr.kcal_ziel_mittel && tr.kcal_mittel < tr.kcal_ziel_mittel - 250) add('warnung', 'ernaehrung', 'Trainingstage zu knapp', `An Trainingstagen Ø ${fmt(tr.kcal_mittel)} kcal bei Ziel ${fmt(tr.kcal_ziel_mittel)}. Gerade hier brauchst du die Energie für Leistung und Regeneration.`);
  const ohneCheat = a.bb.reihen.kcal.map((k, i) => k != null && !a.bb.reihen.cheat[i] && a.bb.reihen.kcal_ziel[i] != null ? k - a.bb.reihen.kcal_ziel[i] : null).filter(v => v != null);
  const kDiff = mittel(ohneCheat);
  if(kDiff != null && ohneCheat.length >= 3){
    if(kDiff < -200) add(aufbau ? 'warnung' : 'info', 'ernaehrung', 'Unter deinem Kalorienziel', `Ohne Cheat Days im Schnitt ${vz(kDiff)} kcal pro Tag unter Ziel.${aufbau ? ' Im Aufbau verschenkst du damit Muskelwachstum – Kohlenhydrate vor und nach dem Training erhöhen.' : ''}`);
    else if(kDiff > 200) add(diaet ? 'warnung' : 'info', 'ernaehrung', 'Über deinem Kalorienziel', `Ohne Cheat Days im Schnitt ${vz(kDiff)} kcal pro Tag über Ziel.`);
    else add('gut', 'ernaehrung', 'Kalorien im Ziel', `Im Schnitt ${vz(kDiff)} kcal vom Tagesziel entfernt.`);
  }
  if(a.bb.energie.tage_geloggt < 5) add('info', 'ernaehrung', 'Ernährung lückenhaft', `Nur ${a.bb.energie.tage_geloggt} von 7 Tagen geloggt. Für eine genaue TDEE-Berechnung möglichst jeden Tag vollständig tracken.`);

  // ── Eiweiß
  if(a.eiweiss_g != null && a.eiweiss_ziel){
    const q = a.eiweiss_g / a.eiweiss_ziel;
    if(q < 0.9) add('warnung', 'ernaehrung', 'Eiweiß unter Ziel', `Ø ${fmt(a.eiweiss_g)} g bei Ziel ${fmt(a.eiweiss_ziel)} g (${fmt(a.gkg, 2)} g/kg). Es fehlen ~${fmt(a.eiweiss_ziel - a.eiweiss_g)} g pro Tag – z. B. eine zusätzliche Mahlzeit mit 40 g Eiweiß.`);
    else add('gut', 'ernaehrung', 'Eiweiß sitzt', `Ø ${fmt(a.eiweiss_g)} g (${fmt(a.gkg, 2)} g/kg) – Ziel an ${bb.eiweiss.tage_ziel_erreicht} von ${bb.eiweiss.tage_geloggt} Tagen erreicht.`);
  }

  // ── Training
  if(a.kraft_geplant){
    const fehl = a.kraft_geplant - a.bb.kraft.davon_trainiert;
    if(fehl >= 1) add(fehl >= 2 ? 'warnung' : 'info', 'training', 'Trainingstage ausgelassen', `${a.bb.kraft.davon_trainiert} von ${a.kraft_geplant} geplanten Trainingstagen mit Krafttraining. Konstanz ist der größte Hebel für Hypertrophie.`);
    else add('gut', 'training', 'Plan voll erfüllt', `Alle ${a.kraft_geplant} geplanten Trainingstage absolviert.`);
  } else if(a.kraft_ziel && a.kraft < a.kraft_ziel) add('info', 'training', 'Weniger Einheiten als geplant', `${a.kraft} von ${a.kraft_ziel} Krafteinheiten diese Woche. Tipp: Trainingsrhythmus unter „Ansicht & Ziele“ eintragen, dann prüfe ich Tag für Tag.`);

  // ── Schlaf & Erholung
  const zielMin = z.schlaf_ziel_h * 60;
  if(a.schlaf.mittel_min != null){
    const kurz = a.schlaf.liste.filter(n => n.gesamt_min < 420).length;
    if(a.schlaf.mittel_min < zielMin - 30) add(a.schlaf.mittel_min < 390 ? 'kritisch' : 'warnung', 'schlaf', 'Mehr schlafen', `Ø ${hm(a.schlaf.mittel_min)} bei Ziel ${hm(zielMin)}; ${kurz} ${kurz === 1 ? 'Nacht' : 'Nächte'} unter 7 Stunden. Schlaf ist für Muskelaufbau ein harter Faktor (Testosteron, Wachstumshormon, Regeneration). Ziel: ${fmt(Math.round((zielMin - a.schlaf.mittel_min) / 5) * 5)} min früher ins Bett.`);
    else add('gut', 'schlaf', 'Schlaf im Ziel', `Ø ${hm(a.schlaf.mittel_min)} pro Nacht${a.schlaf.tief_min ? `, davon ${hm(a.schlaf.tief_min)} Tiefschlaf` : ''}.`);
  }
  const R35 = ausrichten(basis.reihen, tagesListe(tagPlus(bis, -34), bis));
  const hrv7 = mittel(R35.heart_rate_variability.slice(-7)), hrvBasis = mittel(R35.heart_rate_variability.slice(0, -7));
  const rhr7 = mittel(R35.resting_heart_rate.slice(-7)), rhrBasis = mittel(R35.resting_heart_rate.slice(0, -7));
  if(hrv7 != null && hrvBasis && rhr7 != null && rhrBasis){
    const hrvAbw = (hrv7 - hrvBasis) / hrvBasis * 100, rhrAbw = rhr7 - rhrBasis;
    if(hrvAbw < -10 && rhrAbw > 2) add('kritisch', 'herz', 'Erholung eingeschränkt', `HRV ${vz(hrvAbw)} % und Ruhepuls ${vz(rhrAbw, 1)} bpm gegenüber deinem 4-Wochen-Schnitt. Anzeichen für Übertraining oder zu wenig Schlaf – plane einen Deload oder einen zusätzlichen Rest-Day.`);
    else if(hrvAbw < -8 || rhrAbw > 3) add('warnung', 'herz', 'Erholung beobachten', `HRV ${vz(hrvAbw)} %, Ruhepuls ${vz(rhrAbw, 1)} bpm gegenüber dem 4-Wochen-Schnitt.`);
    else if(hrvAbw > 5 && rhrAbw <= 0) add('gut', 'herz', 'Gut erholt', `HRV ${vz(hrvAbw)} % über deinem Schnitt, Ruhepuls stabil – gute Basis für schwere Einheiten.`);
  }

  // ── Aktivität
  if(a.schritte != null && z.schritte_ziel && a.schritte < z.schritte_ziel * 0.85) add('info', 'aktivitaet', 'Mehr Schritte', `Ø ${fmt(a.schritte)} bei Ziel ${fmt(z.schritte_ziel)}. Schritte verbessern Nährstoffaufteilung und Regeneration – ohne die Kraft zu kosten.`);
  if(z.cardio_min_ziel && (a.cardio || 0) < z.cardio_min_ziel * 0.8) add('info', 'aktivitaet', 'Cardio unter Ziel', `Ø ${fmt(a.cardio)} min pro Tag bei Ziel ${fmt(z.cardio_min_ziel)} min.${z.cardio_min_rest ? ` An Rest-Days Ø ${fmt(rest.cardio_mittel_min)} min (Ziel ${fmt(z.cardio_min_rest)}).` : ''}`);
  else if(z.cardio_min_ziel) add('gut', 'aktivitaet', 'Cardio im Ziel', `Ø ${fmt(a.cardio)} min pro Tag.`);

  // ── Split, Muskelgruppen, Trainingsarten (14 Tage)
  const b14 = bodybuilding(basis, { von: tagPlus(bis, -13), bis }, e, protokollListe), T = b14.training;
  if(T.split){
    const selten = T.muskeln.filter(m => m.im_split && m.pro_woche < 1.5);
    if(selten.length) add(aufbau ? 'warnung' : 'info', 'training', 'Muskelgruppen zu selten trainiert', `${selten.map(m => `${m.muskel} ${fmt(m.pro_woche, 1)}×`).join(', ')} pro Woche (letzte 14 Tage). Für maximale Hypertrophie jede Muskelgruppe etwa 2× pro Woche reizen – Split oder Rhythmus anpassen.`);
    const lange = T.muskeln.filter(m => m.im_split && m.tage_seit != null && m.tage_seit >= 8).sort((x, y) => y.tage_seit - x.tage_seit);
    const nie = T.muskeln.filter(m => m.im_split && m.tage_seit == null);
    if(lange.length) add('warnung', 'training', `${lange[0].muskel} seit ${lange[0].tage_seit} Tagen nicht trainiert`, `${lange.map(m => `${m.muskel} (${m.tage_seit} T)`).join(', ')}. Der nächste geplante Split-Tag sollte sie abdecken.`);
    if(nie.length && b14.kraft.einheiten >= 3) add('info', 'training', 'Nicht zugeordnete Muskelgruppen', `${nie.map(m => m.muskel).join(', ')} tauchen in den letzten Wochen in keiner erkannten Einheit auf. Benenne Workouts nach deinem Split (z. B. „Push“) oder trage den Fokus im Protokoll ein.`);
    if(T.abweichungen.length >= 2) add('info', 'training', 'Split-Reihenfolge weicht ab', `${T.abweichungen.length}× anders trainiert als geplant, z. B. ${tagKurz(T.abweichungen.at(-1).tag)}: ${T.abweichungen.at(-1).gemacht} statt ${T.abweichungen.at(-1).geplant}.`);
    const fehlend = T.split_tage.filter(d => d.absolviert === 0);
    if(fehlend.length && b14.kraft.einheiten >= 3) add('warnung', 'training', `${fehlend.map(d => d.name).join(', ')} fehlt`, `In 14 Tagen keine Einheit ${fehlend.map(d => `„${d.name}“`).join(' oder ')} erkannt.`);
    if(!selten.length && !lange.length && !fehlend.length && b14.kraft.einheiten >= 3) add('gut', 'training', 'Split im Takt', `${T.split_tage.map(d => `${d.name} ${fmt(d.pro_woche, 1)}×`).join(', ')} pro Woche – jede Muskelgruppe im Schnitt ${fmt(mittel(T.muskeln.filter(m => m.im_split).map(m => m.pro_woche)), 1)}× wöchentlich.`);
    const beinTage = T.split_tage.filter(d => d.muskeln.includes('Quadrizeps')), andere = T.split_tage.filter(d => !d.muskeln.includes('Quadrizeps'));
    const kB = mittel(beinTage.map(d => d.kcal_mittel)), kA = mittel(andere.map(d => d.kcal_mittel));
    if(kB != null && kA != null && kB < kA - 200) add('info', 'ernaehrung', 'Beintage unterversorgt', `An Beintagen isst du Ø ${fmt(kA - kB)} kcal weniger als an anderen Trainingstagen – dabei verbrauchen sie am meisten. Kohlenhydrate dort anheben.`);
  } else if(b14.kraft.einheiten >= 2) add('info', 'training', 'Split eintragen', 'Lege unter „Ansicht & Ziele“ deinen Split fest (z. B. Push/Pull/Beine). Dann prüfe ich Frequenz pro Muskelgruppe, Lücken und Reihenfolge.');
  const cardioW = T.cardio_minuten_woche;
  if(aufbau && cardioW > 240) add('info', 'aktivitaet', 'Viel Cardio im Aufbau', `${fmt(cardioW)} min Cardio pro Woche (${T.arten.filter(a => a.kategorie === 'cardio').slice(0, 3).map(a => `${a.art} ${fmt(a.minuten)} min`).join(', ')}). Bei ~7 kcal pro Minute sind das grob ${fmt(Math.round(cardioW / 10) * 10)} kcal pro Tag – im Aufbau mitessen, sonst schrumpft der Überschuss.`);
  if(diaet && cardioW < 60 && z.cardio_min_ziel) add('info', 'aktivitaet', 'Wenig Cardio in der Diät', `${fmt(cardioW)} min pro Woche. Stairmaster, Rad oder Schwimmen an Rest-Days helfen, das Defizit ohne weitere Kalorienkürzung zu halten.`);
  const I = T.intensitaet;
  if(I?.n_lang >= 3 && I?.n_kurz >= 3 && I.lang && I.kurz && I.lang > I.kurz * 1.06) add('info', 'schlaf', 'Muster: Nach gutem Schlaf trainierst du härter', `Nach Nächten nahe deinem Schlafziel verbrennst du im Krafttraining ${fmt((I.lang / I.kurz - 1) * 100)} % mehr kcal pro Minute als nach kurzen Nächten.`);

  // ── Muster der letzten 4 Wochen
  const f28 = { von: tagPlus(bis, -27), bis };
  const R28 = ausrichten(basis.reihen, tagesListe(f28.von, bis));
  const t28 = tagesListe(f28.von, bis);
  const naechte = new Map((basis.schlaf || []).map(n => [n.nacht, n.gesamt_min]));
  // Schlaf → HRV am Morgen
  const paare = t28.map((t, i) => [naechte.get(t), R28.heart_rate_variability[i]]).filter(([s, h]) => s != null && h != null);
  const lang = paare.filter(([s]) => s >= zielMin - 15).map(p => p[1]), kurzH = paare.filter(([s]) => s < zielMin - 45).map(p => p[1]);
  if(lang.length >= 3 && kurzH.length >= 3){ const d = (mittel(lang) - mittel(kurzH)) / mittel(kurzH) * 100; if(d > 5) add('info', 'schlaf', 'Muster: Schlaf hebt deine HRV', `Nach Nächten nahe deinem Schlafziel liegt deine HRV im Schnitt ${fmt(d)} % höher als nach kurzen Nächten.`); }
  // Koffein → Schlaf
  const paareK = t28.slice(0, -1).map((t, i) => [R28.dietary_caffeine[i], naechte.get(t28[i + 1])]).filter(([k, s]) => k != null && s != null);
  const viel = paareK.filter(([k]) => k > 300).map(p => p[1]), wenig = paareK.filter(([k]) => k <= 150).map(p => p[1]);
  if(viel.length >= 3 && wenig.length >= 3){ const d = mittel(wenig) - mittel(viel); if(d > 15) add('info', 'schlaf', 'Muster: Koffein kostet Schlaf', `Nach Tagen mit über 300 mg Koffein schläfst du im Schnitt ${fmt(d)} min kürzer.`); }
  // Cheat Days → Waage
  const tage35 = tagesListe(tagPlus(bis, -34), bis), Rc = ausrichten(basis.reihen, tage35);
  const protokoll = new Map(protokollListe.map(p => [p.tag, p]));
  const sprung = tage35.slice(1, -1).map((t, i) => protokoll.get(t)?.cheat && Rc.weight_body_mass[i + 2] != null && Rc.weight_body_mass[i] != null ? Rc.weight_body_mass[i + 2] - Rc.weight_body_mass[i] : null).filter(v => v != null);
  if(a.cheats) add(a.cheats > 1 && !diaet ? 'warnung' : 'info', 'ernaehrung', `${a.cheats} Cheat Day${a.cheats > 1 ? 's' : ''} diese Woche`, `${bb.cheat_days.filter(t => t >= A.von).map(tagKurz).join(', ')}${sprung.length ? ` Die Waage springt danach im Schnitt ${vz(mittel(sprung), 1)} kg – überwiegend Wasser und Glykogen, das sich in 2–3 Tagen normalisiert.` : ''}`);

  E.sort((x, y) => SCHWERE[x.ton] - SCHWERE[y.ton]);
  return {
    zeitraum: A, vergleich_mit: B, phase: bb.phase,
    woche: { score: sa, score_vorher: sb, urteil, besser: plus, schlechter: minus, vergleich },
    erkenntnisse: E,
    intelligenz: intelligenz(basis, e, protokollListe, bis, sa.teile),
    training: { split_tage: T.split_tage, muskeln: T.muskeln, arten: T.arten, abweichungen: T.abweichungen, cardio_minuten_woche: T.cardio_minuten_woche },
  };
}
