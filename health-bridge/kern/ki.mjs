/* KI-Coach: Anweisung, Antwortformat und Datenkontext für Claude.
   Gemeinsam genutzt vom Server (Anthropic SDK) und von der Vorschau (Claude über die Artifact-Fähigkeit „sample“). */

import { bodybuilding, ausrichten, tagesListe, tagPlus, r1, tagTyp } from './rechnen.mjs';
import { uhr } from './mahlzeiten.mjs';

export const KI_ANWEISUNG = `Du bist ein erfahrener Coach für Profi-Bodybuilding mit fundiertem Wissen in Trainingswissenschaft, Sporternährung und Regeneration.
Dein Athlet will maximalen Muskelaufbau bei kontrollierter Fettzunahme (bzw. in der Diät maximalen Muskelerhalt).
Du bekommst seine Daten aus Apple Health (Ernährung aus YAZIO inklusive Mahlzeiten mit Uhrzeit, Gewicht morgens nüchtern), seine Ziele, Phasen, seinen Split und Trainingsrhythmus sowie eine statistische Vorauswertung (Wochen-Score, Vergleich zur Vorwoche, belastbare Zusammenhänge mit r und p, Trends, Ausreißer, Bereitschaft, Prognose).

So arbeitest du:
- Bewerte die Lage ehrlich und konkret. Begründe jede Aussage mit Zahlen aus den Daten.
- Priorisiere: das, was den größten Einfluss auf Muskelaufbau hat, zuerst (Energie/Kalorien und Tempo, Eiweiß, Trainingskonstanz und Frequenz pro Muskelgruppe, Schlaf, dann Rest).
- Gib umsetzbare Aktionen mit Zahl und Zeitraum („Rest-Day-Kalorien von 3.300 auf 3.050 senken, 10 Tage beobachten“), keine Allgemeinplätze.
- Nutze die gefundenen Zusammenhänge des Athleten selbst als Beleg („bei dir steigt die HRV nach 8 h Schlaf um 7 ms“).
- Beachte die Phase: im Aufbau ~0,25–0,5 % Körpergewicht pro Woche, in der Diät ~0,5–1 %.
- Bewerte das Nährstoff-Timing: Eiweiß pro Mahlzeit, Kohlenhydrate vor/nach dem Training, Abstand der letzten Mahlzeit zum Schlaf, Mikronährstoffe.
- Unterscheide Trainings- und Rest-Days. Achte auf Rest-Day-Kalorien, Beintage, Muskelgruppen-Frequenz (≈ 2× pro Woche).
- Wenn Daten fehlen oder zu dünn sind, sag es und stelle gezielte Rückfragen.
- Keine medizinischen Diagnosen. Bei auffälligen Werten (z. B. stark erhöhter Ruhepuls über Tage) zur ärztlichen Abklärung raten.
- Schreibe auf Deutsch, direkt und motivierend, wie ein Coach zu seinem Athleten (du-Form).
- FASSE DICH KURZ: Kernaussage höchstens 2 Sätze. Genau 3 Prioritäten; „warum“, „aktion“ und „messgroesse“ je höchstens ein kurzer Satz. Training und Erholung je höchstens 2 Sätze. Höchstens 3 Einträge in „gut_laeuft“, „warnsignale“ und „fragen“.
- Berücksichtige das Körperprofil (Alter, Erfahrung, Klasse, Wettkampftermin, Schwachstellen, Verletzungen), die Supplement-Routine und – falls vorhanden – den letzten Form-Check.`;

/** JSON-Schema der Antwort (für strukturierte Ausgabe; alle Felder Pflicht). */
export const KI_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['kernaussage', 'gesamturteil', 'prioritaeten', 'ernaehrung', 'training', 'erholung', 'gut_laeuft', 'warnsignale', 'fragen'],
  properties: {
    kernaussage: { type: 'string', description: '2–3 Sätze: Wo steht der Athlet, was ist der wichtigste nächste Schritt?' },
    gesamturteil: { type: 'string', enum: ['sehr gut', 'gut', 'gemischt', 'schwach'] },
    prioritaeten: { type: 'array', description: '3–5 Punkte, wichtigster zuerst', items: { type: 'object', additionalProperties: false,
      required: ['titel', 'dringlichkeit', 'warum', 'aktion', 'messgroesse'],
      properties: { titel: { type: 'string' }, dringlichkeit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
        warum: { type: 'string', description: 'Begründung mit Zahlen aus den Daten' }, aktion: { type: 'string', description: 'Konkrete Handlung mit Zahl und Zeitraum' },
        messgroesse: { type: 'string', description: 'Woran der Erfolg in 1–2 Wochen messbar ist' } } } },
    ernaehrung: { type: 'object', additionalProperties: false,
      required: ['kcal_trainingstag', 'kcal_restday', 'eiweiss_g', 'kohlenhydrate_g_training', 'kohlenhydrate_g_rest', 'fett_g', 'begruendung'],
      properties: { kcal_trainingstag: { type: 'integer' }, kcal_restday: { type: 'integer' }, eiweiss_g: { type: 'integer' },
        kohlenhydrate_g_training: { type: 'integer' }, kohlenhydrate_g_rest: { type: 'integer' }, fett_g: { type: 'integer' }, begruendung: { type: 'string' } } },
    training: { type: 'string', description: 'Empfehlung zu Split, Frequenz, Volumen, Cardio' },
    erholung: { type: 'string', description: 'Schlaf, Stress, Deload – mit Bezug auf HRV/Ruhepuls/Bereitschaft' },
    gut_laeuft: { type: 'array', items: { type: 'string' } },
    warnsignale: { type: 'array', items: { type: 'string' } },
    fragen: { type: 'array', description: 'Gezielte Rückfragen, die die nächste Analyse verbessern', items: { type: 'string' } },
  },
};

/** Beispiel im Prompt für Aufrufe ohne erzwungenes Schema (Vorschau). */
export const KI_FORMAT_HINWEIS = `Antworte ausschließlich mit einem JSON-Objekt genau dieser Form (alle Felder Pflicht, Zahlen als ganze Zahlen):
{"kernaussage": "…", "gesamturteil": "sehr gut|gut|gemischt|schwach",
 "prioritaeten": [{"titel": "…", "dringlichkeit": "hoch|mittel|niedrig", "warum": "…", "aktion": "…", "messgroesse": "…"}],
 "ernaehrung": {"kcal_trainingstag": 0, "kcal_restday": 0, "eiweiss_g": 0, "kohlenhydrate_g_training": 0, "kohlenhydrate_g_rest": 0, "fett_g": 0, "begruendung": "…"},
 "training": "…", "erholung": "…", "gut_laeuft": ["…"], "warnsignale": ["…"], "fragen": ["…"]}`;

/** Kompakter Datenkontext (≈ 8–15 KB) aus Rohbasis, Einstellungen, Protokoll und fertiger Analyse. */
/** Einnahme-Treue pro Supplement über 14 Tage (nur Tage mit Eintrag zählen). */
export function supplementTreue(e, protokoll, bis){
  const von = tagPlus(bis, -13), tage = protokoll.filter(p => p.tag >= von && p.tag <= bis && Array.isArray(p.supplements));
  if(!tage.length || !e.supplements?.length) return undefined;
  const pm = new Map(protokoll.map(p => [p.tag, p]));
  const faellig = (x, t) => { const typ = tagTyp(t.tag, e.plan, pm) ?? 'training'; return x.tage === 'taeglich' || x.tage === typ; };
  return { tage_erfasst: tage.length, pro_supplement: Object.fromEntries(e.supplements.map(x => { const f = tage.filter(t => faellig(x, t)); return [x.name, `${f.filter(t => t.supplements.includes(x.name)).length} von ${f.length} fälligen Tagen`]; })) };
}

export function kiKontext({ basis, einstellungen: e, protokoll = [], analyse, bis, formcheck = null }){
  const von = tagPlus(bis, -27);
  const bb = bodybuilding(basis, { von, bis }, e, protokoll);
  const t14 = tagesListe(tagPlus(bis, -13), bis), R = ausrichten(basis.reihen, t14);
  const naechte = new Map((basis.schlaf || []).map(n => [n.nacht, n]));
  const i0 = bb.reihen.tage.indexOf(t14[0]);
  const tage = t14.map((t, k) => { const i = i0 + k, n = naechte.get(t);
    return { tag: t, typ: bb.reihen.tagtyp[i], fokus: bb.reihen.fokus[i] || undefined, cheat: bb.reihen.cheat[i] || undefined,
      kcal: bb.reihen.kcal[i], kcal_ziel: bb.reihen.kcal_ziel[i], eiweiss_g: R.protein[k], kh_g: R.carbohydrates[k], fett_g: R.total_fat[k],
      gewicht: bb.reihen.gewicht_kg[i], trend: bb.reihen.trend_kg[i], schlaf_min: n?.gesamt_min, tief_min: n?.tief_min,
      hrv: R.heart_rate_variability[k], ruhepuls: R.resting_heart_rate[k], schritte: R.step_count[k], cardio_min: bb.reihen.cardio_min[i] || undefined,
      einheiten: bb.reihen.einheiten[i].map(x => `${x.art}${x.titel && x.titel !== x.art ? ` (${x.titel})` : ''} ${x.dauer_min} min`).join(', ') || undefined,
      notiz: protokoll.find(p => p.tag === t)?.notiz || undefined };
  });
  const I = analyse.intelligenz || {};
  const kontext = {
    heute: bis, phase: bb.phase, ziele: e.ziele, rhythmus: e.plan, split: e.split?.tage,
    koerperprofil: { ...e.profil, alter: e.profil?.geburtsjahr ? Number(bis.slice(0, 4)) - e.profil.geburtsjahr : undefined, groesse_cm: bb.koerper.groesse_cm,
      gewicht_trend_kg: bb.gewicht.aktuell_trend_kg, koerperfett_prozent: bb.koerper.koerperfett_prozent, magermasse_kg: bb.koerper.magermasse_kg, ffmi: bb.koerper.ffmi, taille_cm: bb.koerper.taille_cm,
      wochen_bis_wettkampf: e.profil?.wettkampf_datum ? Math.round((new Date(e.profil.wettkampf_datum) - new Date(bis)) / 6048e5) : undefined },
    supplements: e.supplements, supplement_einnahme_14_tage: supplementTreue(e, protokoll, bis),
    letzter_formcheck: formcheck || undefined,
    wochen_score: { diese: analyse.woche.score, vorwoche: analyse.woche.score_vorher.wert, urteil: analyse.woche.urteil, vergleich: analyse.woche.vergleich.map(v => ({ titel: v.titel, diese: v.diese, letzte: v.letzte, besser: v.besser })) },
    regel_erkenntnisse: analyse.erkenntnisse.map(x => `[${x.ton}] ${x.titel}: ${x.text}`),
    statistik: { bereitschaft_heute: I.bereitschaft, prognose: I.prognose, zusammenhaenge: (I.zusammenhaenge || []).map(z => `${z.titel}: ${z.text} (${z.sicherheit})`),
      trends: (I.trends || []).map(t => t.text), ausreisser: (I.ausreisser || []).map(a => a.text), hebel: I.hebel },
    letzte_28_tage: { gewicht: bb.gewicht, energie: bb.energie, makros: bb.makros, eiweiss: bb.eiweiss, tagtypen: bb.tagtypen, cardio: bb.cardio, schritte: bb.schritte,
      koerper: bb.koerper, kraft: { einheiten: bb.kraft.einheiten, pro_woche: bb.kraft.pro_woche_mittel, geplant: bb.kraft.geplante_trainingstage, trainiert: bb.kraft.davon_trainiert },
      split_tage: bb.training.split_tage.map(({ name, absolviert, geplant, dauer_mittel_min, kcal_mittel, letzte }) => ({ name, absolviert, geplant, dauer_mittel_min, kcal_mittel, letzte })),
      muskeln: bb.training.muskeln.map(({ muskel, pro_woche, tage_seit }) => ({ muskel, pro_woche, tage_seit })), trainingsarten: bb.training.arten.map(({ art, minuten, einheiten }) => ({ art, minuten, einheiten })),
      cheat_days: bb.cheat_days },
    letzte_14_tage: tage,
    mahlzeiten_14_tage: analyse.mahlzeiten ? (({ tage: mt, ...rest }) => ({ ...rest,
      letzte_7_tage: mt.slice(-7).map(d => ({ tag: d.tag, training: d.training.map(x => `${uhr(x.start)}–${uhr(x.ende)}`).join(', ') || undefined, schlaf_ab: d.schlaf_start != null ? uhr(d.schlaf_start) : undefined,
        mahlzeiten: d.mahlzeiten.map(x => `${uhr(x.start)} ${x.kcal} kcal E${x.eiweiss} K${x.kh} F${x.fett}`) })) }))(analyse.mahlzeiten) : undefined,
  };
  return JSON.stringify(kontext, (k, v) => typeof v === 'number' ? r1(v, 2) : v);
}

/** Nutzertext für Claude. */
export const kiAufgabe = (kontext, mitFormat = false) => `Hier sind die aktuellen Daten deines Athleten als JSON. Erstelle die Wochenanalyse.${mitFormat ? '\n\n' + KI_FORMAT_HINWEIS : ''}

<daten>
${kontext}
</daten>`;

/** Antwort prüfen und auf das erwartete Format bringen (robust gegen fehlende Felder). */
export function kiPruefen(o){
  if(!o || typeof o !== 'object' || typeof o.kernaussage !== 'string' || !Array.isArray(o.prioritaeten)) throw Object.assign(new Error('Ungültige KI-Antwort'), { code: 'ki_format' });
  const s = v => typeof v === 'string' ? v : '', l = v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : [], z = v => Number.isFinite(Number(v)) ? Math.round(Number(v)) : null;
  const er = o.ernaehrung || {};
  return { kernaussage: s(o.kernaussage), gesamturteil: ['sehr gut', 'gut', 'gemischt', 'schwach'].includes(o.gesamturteil) ? o.gesamturteil : 'gemischt',
    prioritaeten: o.prioritaeten.slice(0, 6).map(p => ({ titel: s(p?.titel), dringlichkeit: ['hoch', 'mittel', 'niedrig'].includes(p?.dringlichkeit) ? p.dringlichkeit : 'mittel', warum: s(p?.warum), aktion: s(p?.aktion), messgroesse: s(p?.messgroesse) })).filter(p => p.titel),
    ernaehrung: { kcal_trainingstag: z(er.kcal_trainingstag), kcal_restday: z(er.kcal_restday), eiweiss_g: z(er.eiweiss_g), kohlenhydrate_g_training: z(er.kohlenhydrate_g_training), kohlenhydrate_g_rest: z(er.kohlenhydrate_g_rest), fett_g: z(er.fett_g), begruendung: s(er.begruendung) },
    training: s(o.training), erholung: s(o.erholung), gut_laeuft: l(o.gut_laeuft), warnsignale: l(o.warnsignale), fragen: l(o.fragen) };
}

/* ── Form-Check ── */
export const FORM_ANWEISUNG = `Du bist Bodybuilding-Coach und Wettkampf-Juror. Du bekommst Form-Check-Fotos deines Athleten (Posen mit Datum) und seine Körperdaten.
Bewerte nur Physis und Posing – sachlich, respektvoll, konkret; keine Aussagen über Gesundheit, Medikamente oder andere Personen.
Schätze den Körperfettanteil als Spanne. Nenne Stärken und Schwachstellen pro Muskelgruppe mit konkreter Trainingsempfehlung (Übung/Volumen/Frequenz).
Bewerte Symmetrie, Proportionen und Kondition. Wenn ältere Fotos dabei sind, beschreibe die Veränderung. Gib kurze Posing-Tipps.
Fasse dich kurz: Zusammenfassung höchstens 2 Sätze, höchstens 3 Stärken, höchstens 4 Schwachstellen, höchstens 3 Posing-Tipps. Deutsch, du-Form.
Wenn ein Foto für eine Bewertung ungeeignet ist (Licht, Winkel, Kleidung), sag es.`;

export const FORM_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['zusammenfassung', 'kfa_von', 'kfa_bis', 'kondition', 'staerken', 'schwachstellen', 'symmetrie', 'veraenderung', 'posing_tipps', 'fotoqualitaet'],
  properties: {
    zusammenfassung: { type: 'string' }, kfa_von: { type: 'number' }, kfa_bis: { type: 'number' },
    kondition: { type: 'string', enum: ['Off-Season', 'Aufbau', 'Definiert', 'Wettkampfnah', 'Wettkampfform'] },
    staerken: { type: 'array', items: { type: 'string' } },
    schwachstellen: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['muskelgruppe', 'beobachtung', 'empfehlung'],
      properties: { muskelgruppe: { type: 'string' }, beobachtung: { type: 'string' }, empfehlung: { type: 'string' } } } },
    symmetrie: { type: 'string' }, veraenderung: { type: 'string', description: 'Vergleich zu älteren Fotos oder leer' },
    posing_tipps: { type: 'array', items: { type: 'string' } }, fotoqualitaet: { type: 'string', description: 'Kurzer Hinweis zur Bildqualität oder leer' },
  },
};

export const FORM_FORMAT_HINWEIS = `Antworte ausschließlich mit einem JSON-Objekt genau dieser Form:
{"zusammenfassung": "…", "kfa_von": 0, "kfa_bis": 0, "kondition": "Off-Season|Aufbau|Definiert|Wettkampfnah|Wettkampfform", "staerken": ["…"],
 "schwachstellen": [{"muskelgruppe": "…", "beobachtung": "…", "empfehlung": "…"}], "symmetrie": "…", "veraenderung": "…", "posing_tipps": ["…"], "fotoqualitaet": "…"}`;

/** Text zu den Fotos: Körperdaten und welche Bilder in welcher Reihenfolge kommen. */
export function formKontext({ profil = {}, koerper = {}, phase, fotos }){
  return `Körperdaten: ${JSON.stringify({ ...profil, ...koerper, phase })}
Die Bilder folgen in dieser Reihenfolge:
${fotos.map((f, i) => `${i + 1}. ${f.pose} vom ${f.tag}${f.notiz ? ` (${f.notiz})` : ''}`).join('\n')}`;
}

export function formPruefen(o){
  if(!o || typeof o.zusammenfassung !== 'string') throw Object.assign(new Error('Ungültige Form-Check-Antwort'), { code: 'ki_format' });
  const s = v => typeof v === 'string' ? v : '', l = v => Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 5) : [], n = v => Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null;
  return { zusammenfassung: s(o.zusammenfassung), kfa_von: n(o.kfa_von), kfa_bis: n(o.kfa_bis), kondition: s(o.kondition), staerken: l(o.staerken),
    schwachstellen: (Array.isArray(o.schwachstellen) ? o.schwachstellen : []).slice(0, 6).map(x => ({ muskelgruppe: s(x?.muskelgruppe), beobachtung: s(x?.beobachtung), empfehlung: s(x?.empfehlung) })).filter(x => x.muskelgruppe),
    symmetrie: s(o.symmetrie), veraenderung: s(o.veraenderung), posing_tipps: l(o.posing_tipps), fotoqualitaet: s(o.fotoqualitaet) };
}
