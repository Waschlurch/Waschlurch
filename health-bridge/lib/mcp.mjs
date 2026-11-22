/* MCP-Server (Streamable HTTP, zustandslos, JSON-Antworten).
   Claude (claude.ai „Benutzerdefinierter Connector“, Claude Desktop, Claude Code) ruft hierüber die Gesundheitsdaten ab. */

import { KATALOG, BEREICHE, SCHLAF, metrikName } from './katalog.mjs';
import { tageswerte, schlaf, workouts, rohwerte, verfuegbar, ueberblick, zeitraum } from './abfragen.mjs';
import { ZONE } from './zeit.mjs';
import { bodybuilding, coach } from './bodybuilding.mjs';
import { laden as protokollLaden } from './protokoll.mjs';
import { tagTyp, phaseAm, tagesListe, PHASEN as PHASEN_KURZ } from '../kern/rechnen.mjs';
import { lokalerTag } from './zeit.mjs';
import { laden as einstellungenLaden } from './einstellungen.mjs';

export const PROTOKOLLE = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER = { name: 'puls-apple-health', title: 'Puls · Apple Health', version: '1.0.0' };

const ANWEISUNG = `Puls stellt die Apple-Health-Daten des Nutzers bereit, die das iPhone regelmäßig synchronisiert.
Beginne mit „gesundheit_ueberblick“ für ein Gesamtbild; für Training, Aufbau, Diät, Gewicht und Körperzusammensetzung nimm „bodybuilding_analyse“, für Bewertungen und Empfehlungen „coach_analyse“, für Phasen, Trainings-/Rest-Days und Cheat Days „protokoll_und_plan“; vertiefe dann mit „schlaf_naechte“, „tageswerte“, „ernaehrung“, „workouts“ oder „rohwerte“.
„verfuegbare_daten“ zeigt, welche Werte es gibt und wie weit sie zurückreichen. Datumsangaben sind lokale Tage (YYYY-MM-DD), beide Grenzen inklusive.
Schlafnächte zählen zum Tag des Aufwachens. Antworte auf Deutsch, nenne Zahlen mit Einheit, und weise darauf hin, dass du keine ärztliche Diagnose stellst.`;

const datum = beschreibung => ({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: beschreibung });
const ZEIT = {
  von: datum('Erster Tag (YYYY-MM-DD). Ohne Angabe: abhängig von „tage“.'),
  bis: datum('Letzter Tag (YYYY-MM-DD), inklusive. Ohne Angabe: heute.'),
  tage: { type: 'integer', minimum: 1, maximum: 400, description: 'Anzahl der letzten Tage, falls „von“ fehlt.' },
};
const nurLesen = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const ERNAEHRUNG = Object.keys(KATALOG).filter(k => KATALOG[k].bereich === 'ernaehrung');

export const WERKZEUGE = [
  {
    name: 'gesundheit_ueberblick', title: 'Gesundheitsüberblick',
    description: 'Gesamtbild der letzten Tage über alle Bereiche (Schlaf, Herz, Aktivität, Ernährung, Körper): Tagesmittel, letzter Wert und Veränderung in Prozent gegenüber dem gleich langen Zeitraum davor. Guter Einstieg für jede Frage.',
    inputSchema: { type: 'object', properties: { tage: { type: 'integer', minimum: 1, maximum: 180, default: 7, description: 'Länge des Zeitraums in Tagen (Standard 7).' } }, additionalProperties: false },
    run: a => ueberblick(a.tage ?? 7),
  },
  {
    name: 'bodybuilding_analyse', title: 'Bodybuilding-Auswertung',
    description: 'Auswertung für Muskelaufbau und Diät: Trendgewicht (geglättet) und Tempo in kg und % Körpergewicht pro Woche gegenüber dem Ziel der aktuellen Phase (Aufbau, Diät, Erhalt, Rekomposition), adaptiver Kalorienverbrauch (TDEE) aus Zufuhr und Gewichtstrend, Energiebilanz, empfohlene Kalorien, Eiweiß in g/kg gegenüber Ziel, Körperfett, Magermasse, FFMI, Taillenumfang sowie Krafttrainings pro Woche. Enthält auch die Tagesreihen. Ziele stammen aus den Einstellungen im Dashboard.',
    inputSchema: { type: 'object', properties: ZEIT, additionalProperties: false },
    run: async a => { const z = zeitraum(a, 28, 180); const e = await einstellungenLaden(); return { zeitraum: z, ...(await bodybuilding(z, e)) }; },
  },
  {
    name: 'coach_analyse', title: 'Coach-Analyse der Woche',
    description: 'Bewertung der letzten 7 Tage gegen die 7 Tage davor wie ein Bodybuilding-Coach: Wochen-Score (0–100) mit Teilwerten, Urteil besser/gleich/schlechter, Vergleichstabelle (Gewichtstempo, Kalorien, Eiweiß, Krafteinheiten, Schlaf, HRV, Ruhepuls, Schritte, Cardio, Cheat Days) und priorisierte Erkenntnisse mit konkreten Empfehlungen (z. B. Rest-Day-Kalorien zu hoch, zu schnelle Zunahme, zu wenig Schlaf, Erholung eingeschränkt, Muster wie Koffein → Schlaf). Nutze das für Fragen wie „War die Woche gut?“ oder „Was soll ich ändern?“.',
    inputSchema: { type: 'object', properties: { bis: datum('Letzter Tag der bewerteten Woche (YYYY-MM-DD). Ohne Angabe: heute.') }, additionalProperties: false },
    run: async a => coach(a.bis || lokalerTag(new Date()), await einstellungenLaden()),
  },
  {
    name: 'protokoll_und_plan', title: 'Phasen, Trainingsplan und Protokoll',
    description: 'Phasen mit Startdatum (Aufbau, Diät, Erhalt, Rekomposition), der Trainingsrhythmus (z. B. T,T,R = zwei Trainingstage, ein Rest-Day), der Split mit Muskelgruppen je Trainingstag, alle Ziele (Kalorien je Tagtyp, Überschuss, Makros, Schritte, Cardio, Schlaf) und das Tagesprotokoll mit Cheat Days, Ausnahmen und Notizen. Pro Tag steht, ob Trainings- oder Rest-Day ist, welche Phase gilt, welcher Split-Tag trainiert wurde bzw. geplant war und alle Einheiten (Apple Health + manuell, z. B. Schwimmen, Stairmaster).',
    inputSchema: { type: 'object', properties: ZEIT, additionalProperties: false },
    run: async a => {
      const z = zeitraum(a, 14, 120); const [e, prot] = await Promise.all([einstellungenLaden(), protokollLaden(z)]);
      const map = new Map(prot.map(p => [p.tag, p]));
      const bb = await bodybuilding(z, e), R = bb.reihen;
      return { zeitraum: z, phasen: e.phasen, plan: e.plan, split: e.split, ziele: e.ziele,
        tage: R.tage.map((t, i) => ({ tag: t, typ: R.tagtyp[i], phase: PHASEN_KURZ[R.phase[i]], fokus: R.fokus[i] || undefined, fokus_geplant: R.fokus_geplant[i] || undefined,
          einheiten: R.einheiten[i].map(x => ({ art: x.art, titel: x.titel !== x.art ? x.titel : undefined, dauer_min: x.dauer_min, quelle: x.quelle })),
          ...(map.get(t) ? { cheat: map.get(t).cheat || undefined, notiz: map.get(t).notiz || undefined } : {}) })) };
    },
  },
  {
    name: 'training_auswertung', title: 'Training: Split, Muskelgruppen, Arten',
    description: 'Trainingsauswertung: Einheiten pro Split-Tag (geplant vs. absolviert, Ø Dauer, Ø Kalorien an diesen Tagen), Frequenz pro Muskelgruppe pro Woche mit „Tage seit zuletzt“ und Ø Pause, Abweichungen von der Split-Reihenfolge, Minuten je Trainingsart (Krafttraining, Schwimmen, Stairmaster, Rad …; Apple Health + manuell) und Intensität nach langer vs. kurzer Nacht. Standard: letzte 28 Tage.',
    inputSchema: { type: 'object', properties: ZEIT, additionalProperties: false },
    run: async a => { const z = zeitraum(a, 28, 180); const e = await einstellungenLaden(); const bb = await bodybuilding(z, e); return { zeitraum: z, rhythmus: e.plan, ...bb.training, kraft: bb.kraft, cardio: bb.cardio }; },
  },
  {
    name: 'schlaf_naechte', title: 'Schlaf pro Nacht',
    description: 'Schlaf je Nacht: Einschlaf- und Aufwachzeit, Gesamtschlaf und Phasen (Tief, Kern, REM, Wach) in Minuten. Standard: letzte 14 Nächte.',
    inputSchema: { type: 'object', properties: ZEIT, additionalProperties: false },
    run: async a => { const z = zeitraum(a, 14); const n = await schlaf(z); return { zeitraum: z, zeitzone: ZONE(), naechte: n }; },
  },
  {
    name: 'tageswerte', title: 'Tageswerte',
    description: `Ein Wert pro Tag für beliebige Messgrößen. Summen (z. B. Schritte, kcal) werden pro Tag addiert, Mittelwerte (Puls, HRV) gemittelt samt Min/Max, Körperwerte (Gewicht) als letzter Wert des Tages. Bekannte Namen: ${Object.keys(KATALOG).join(', ')}. Deutsche Namen wie „Schritte“ oder „Ruhepuls“ gehen ebenfalls.`,
    inputSchema: { type: 'object', properties: { metriken: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20, description: 'Messgrößen, z. B. ["resting_heart_rate","heart_rate_variability"].' }, ...ZEIT }, required: ['metriken'], additionalProperties: false },
    run: async a => {
      const z = zeitraum(a, 30); const namen = [...new Set(a.metriken.map(metrikName))].filter(n => n !== SCHLAF);
      const daten = await tageswerte(namen, z);
      return { zeitraum: z, metriken: Object.fromEntries(namen.map(n => [n, { titel: KATALOG[n]?.titel || n, einheit: KATALOG[n]?.einheit || '', tageswert: KATALOG[n]?.agg || 'mittel', tage: daten[n] || [] }])) };
    },
  },
  {
    name: 'ernaehrung', title: 'Ernährung pro Tag',
    description: 'Geloggte Ernährung pro Tag: Energie (kcal), Eiweiß, Kohlenhydrate, Fett, Zucker, Ballaststoffe (g), Wasser (ml), Koffein und Natrium (mg). Standard: letzte 14 Tage.',
    inputSchema: { type: 'object', properties: ZEIT, additionalProperties: false },
    run: async a => {
      const z = zeitraum(a, 14); const d = await tageswerte(ERNAEHRUNG, z);
      const tage = {};
      for(const [m, liste] of Object.entries(d)) for(const e of liste) (tage[e.tag] ||= { tag: e.tag })[m] = e.wert;
      return { zeitraum: z, einheiten: Object.fromEntries(ERNAEHRUNG.map(m => [m, KATALOG[m].einheit])), tage: Object.values(tage).sort((x, y) => x.tag.localeCompare(y.tag)) };
    },
  },
  {
    name: 'workouts', title: 'Trainings',
    description: 'Trainings mit Art, Start, Dauer (min), Aktivkalorien, Distanz (km) und Herzfrequenz. Standard: letzte 30 Tage, neueste zuerst.',
    inputSchema: { type: 'object', properties: ZEIT, additionalProperties: false },
    run: async a => { const z = zeitraum(a, 30); return { zeitraum: z, workouts: await workouts(z) }; },
  },
  {
    name: 'rohwerte', title: 'Einzelmessungen',
    description: 'Einzelne Messungen einer Messgröße mit Uhrzeit, z. B. Herzfrequenz im Tagesverlauf oder jede Gewichtsmessung. Höchstens 5000 Werte.',
    inputSchema: { type: 'object', properties: { metrik: { type: 'string', description: 'Messgröße, z. B. "heart_rate".' }, ...ZEIT, limit: { type: 'integer', minimum: 1, maximum: 5000, default: 500 } }, required: ['metrik'], additionalProperties: false },
    run: async a => { const z = zeitraum(a, 1, 31); const m = metrikName(a.metrik); return { metrik: m, einheit: KATALOG[m]?.einheit || '', zeitraum: z, zeitzone: ZONE(), werte: await rohwerte(m, z, a.limit ?? 500) }; },
  },
  {
    name: 'verfuegbare_daten', title: 'Verfügbare Daten',
    description: 'Welche Messgrößen vorliegen, wie viele Messungen es gibt und von wann bis wann – plus Bereiche. Nützlich, bevor du einen Zeitraum wählst.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => ({ ...(await verfuegbar()), bereiche: BEREICHE, zeitzone: ZONE() }),
  },
];

const fehler = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Prüft Argumente grob gegen das Schema (Typen, Pflichtfelder, Muster, Grenzen). */
export function pruefe(schema, a){
  if(a == null) a = {};
  if(typeof a !== 'object' || Array.isArray(a)) return 'Argumente müssen ein Objekt sein.';
  for(const r of schema.required || []) if(a[r] === undefined) return `„${r}“ fehlt.`;
  for(const [k, v] of Object.entries(a)){
    const s = schema.properties[k];
    if(!s) return `Unbekanntes Argument „${k}“.`;
    if(s.type === 'integer' && (!Number.isInteger(v) || (s.minimum != null && v < s.minimum) || (s.maximum != null && v > s.maximum))) return `„${k}“ muss eine ganze Zahl zwischen ${s.minimum} und ${s.maximum} sein.`;
    if(s.type === 'string' && (typeof v !== 'string' || (s.pattern && !new RegExp(s.pattern).test(v)))) return `„${k}“ hat ein ungültiges Format.`;
    if(s.type === 'array' && (!Array.isArray(v) || !v.length || v.length > s.maxItems || v.some(x => typeof x !== 'string'))) return `„${k}“ muss eine Liste mit 1–${s.maxItems} Texten sein.`;
  }
  return null;
}

async function eine(nachricht){
  if(!nachricht || nachricht.jsonrpc !== '2.0' || typeof nachricht.method !== 'string') return fehler(nachricht?.id, -32600, 'Ungültige Anfrage');
  const { id, method, params = {} } = nachricht;
  const benachrichtigung = id === undefined;
  if(benachrichtigung) return null;
  switch(method){
    case 'initialize': {
      const v = PROTOKOLLE.includes(params.protocolVersion) ? params.protocolVersion : PROTOKOLLE[0];
      return { jsonrpc: '2.0', id, result: { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: ANWEISUNG } };
    }
    case 'ping': return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list': return { jsonrpc: '2.0', id, result: { tools: WERKZEUGE.map(({ run, ...w }) => ({ ...w, annotations: { title: w.title, ...nurLesen } })) } };
    case 'tools/call': {
      const w = WERKZEUGE.find(x => x.name === params.name);
      if(!w) return fehler(id, -32602, `Unbekanntes Werkzeug: ${params.name}`);
      const problem = pruefe(w.inputSchema, params.arguments);
      if(problem) return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: problem }] } };
      try {
        const daten = await w.run(params.arguments || {});
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(daten) }], structuredContent: daten } };
      } catch(e){
        console.error('[mcp]', w.name, e);
        return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: e.code === 'keine_datenbank' ? 'Die Datenbank ist nicht eingerichtet (DATABASE_URL fehlt).' : 'Die Daten konnten gerade nicht gelesen werden.' }] } };
      }
    }
    case 'resources/list': return { jsonrpc: '2.0', id, result: { resources: [] } };
    case 'prompts/list': return { jsonrpc: '2.0', id, result: { prompts: [] } };
    default: return fehler(id, -32601, `Methode nicht unterstützt: ${method}`);
  }
}

/** Verarbeitet eine Nachricht oder einen Stapel. null = keine Antwort nötig (nur Benachrichtigungen). */
export async function verarbeite(koerper){
  if(Array.isArray(koerper)){
    if(!koerper.length) return fehler(null, -32600, 'Leerer Stapel');
    const a = (await Promise.all(koerper.map(eine))).filter(Boolean);
    return a.length ? a : null;
  }
  return eine(koerper);
}
