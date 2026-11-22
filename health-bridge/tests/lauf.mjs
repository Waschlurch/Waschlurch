/* Prüflauf: node tests/lauf.mjs  (PGlite)
   Mit echtem Postgres: DATABASE_URL=postgres://… node tests/lauf.mjs */
import { Readable } from 'node:stream';
import { lesen, phase } from '../lib/import.mjs';
import { zeitLesen, zahlLesen, lokalerTag, tagPlus } from '../lib/zeit.mjs';
import { metrikName, umrechnen } from '../lib/katalog.mjs';
import { speichern, tageswerte, schlaf, workouts, ueberblick, zeitraum, verfuegbar } from '../lib/abfragen.mjs';
import { db } from '../lib/db.mjs';
import { tokenOk, passcodeOk } from '../lib/guard.mjs';
import { WERKZEUGE, pruefe as schemaPruefe } from '../lib/mcp.mjs';
import syncHandler from '../api/sync.mjs';
import datenHandler from '../api/daten.mjs';
import mcpHandler from '../api/mcp.mjs';
import { demoNutzlast } from '../scripts/demo-daten.mjs';
import einstHandler from '../api/einstellungen.mjs';
import { saeubern, STANDARD } from '../lib/einstellungen.mjs';
import protHandler from '../api/protokoll.mjs';
import { tagTyp, phaseAm, kcalZiel, bodybuilding as bbKern, artNormal, fokusAus, muskelnAus, SPLITS } from '../kern/rechnen.mjs';
import { analyse as analyseKern, score } from '../kern/analyse.mjs';
import { trend, steigung, isoWoche, bodybuilding } from '../lib/bodybuilding.mjs';

let ok = 0, nein = 0;
const pruefe = (name, b, ist) => { if(b){ ok++; console.log('  ✓ ' + name); } else { nein++; console.log('  ✗ ' + name + (ist !== undefined ? '  → ' + JSON.stringify(ist).slice(0, 300) : '')); } };
const block = t => console.log('\n── ' + t);
process.env.PULS_TZ = 'Europe/Berlin';
process.env.PULS_TOKEN = 'tok-123';
process.env.PULS_PASSCODE = 'code';

function anfrage(koerper, { methode = 'POST', kopf = {}, url = '/' } = {}){
  const r = Readable.from(koerper == null ? [] : [Buffer.from(typeof koerper === 'string' ? koerper : JSON.stringify(koerper))]);
  r.method = methode; r.url = url; r.headers = { 'x-forwarded-for': '9.9.9.' + Math.random(), host: 'puls.test', ...kopf };
  return r;
}
function antwort(){
  const teile = [];
  return { statusCode: 0, kopf: {}, setHeader(k, v){ this.kopf[k.toLowerCase()] = v; }, end(t){ if(t) teile.push(Buffer.from(t)); },
    get text(){ return Buffer.concat(teile).toString(); }, get json(){ return JSON.parse(this.text); } };
}
async function ruf(handler, koerper, opt){ const res = antwort(); await handler(anfrage(koerper, opt), res); return res; }

block('Zeit und Zahlen');
pruefe('HAE-Datum mit Versatz', zeitLesen('2026-11-21 23:12:00 +0100').toISOString() === '2026-11-21T22:12:00.000Z');
pruefe('ISO mit Z', zeitLesen('2026-11-21T22:12:00Z').toISOString() === '2026-11-21T22:12:00.000Z');
pruefe('Deutsches Datum lokal (Winterzeit)', zeitLesen('21.11.2026, 23:12').toISOString() === '2026-11-21T22:12:00.000Z');
pruefe('Deutsches Datum lokal (Sommerzeit)', zeitLesen('01.07.2026 08:00').toISOString() === '2026-07-01T06:00:00.000Z');
pruefe('Nur Tag = lokale Mitternacht', zeitLesen('2026-11-22').toISOString() === '2026-11-21T23:00:00.000Z');
pruefe('Lokaler Tag kurz nach Mitternacht', lokalerTag(new Date('2026-11-21T23:30:00Z')) === '2026-11-22');
pruefe('Zahlen: 8.412 / 7,5 / 1.234,5 kcal / 72', zahlLesen('8.412') === 8412 && zahlLesen('7,5') === 7.5 && zahlLesen('1.234,5 kcal') === 1234.5 && zahlLesen(72) === 72 && zahlLesen('') === null);
pruefe('Tag plus über Monatsgrenze', tagPlus('2026-11-30', 1) === '2026-12-01');

block('Katalog');
pruefe('Deutsche Namen', metrikName('Schritte') === 'step_count' && metrikName('Ruhepuls') === 'resting_heart_rate' && metrikName('Schlafanalyse') === 'sleep_analysis');
pruefe('HAE-Namen bleiben', metrikName('heart_rate_variability') === 'heart_rate_variability');
pruefe('Unbekanntes → snake_case', metrikName('Neue Größe 2') === 'neue_grosse_2');
pruefe('Einheiten: kJ, lb, %', Math.round(umrechnen('active_energy', 418.4, 'kJ')) === 100 && Math.round(umrechnen('weight_body_mass', 100, 'lb') * 10) === 454 && umrechnen('blood_oxygen_saturation', 0.97, '%') === 97);
pruefe('Schlafphasen DE/EN', phase('Kern') === 'kern' && phase('Asleep Deep') === 'tief' && phase('REM') === 'rem' && phase('Im Bett') === 'bett' && phase('HKCategoryValueSleepAnalysisAwake') === 'wach');

block('Import: Health Auto Export');
const hae = lesen({ data: { metrics: [
  { name: 'step_count', units: 'count', data: [{ date: '2026-11-20 00:00:00 +0100', qty: 9000, source: 'iPhone' }, { date: '2026-11-20 00:00:00 +0100', qty: 7000, source: 'Watch' }] },
  { name: 'heart_rate', units: 'count/min', data: [{ date: '2026-11-20 00:00:00 +0100', Min: 48, Avg: 70, Max: 150, source: 'Watch' }] },
  { name: 'blood_pressure', units: 'mmHg', data: [{ date: '2026-11-20 08:00:00 +0100', systolic: 121, diastolic: 79 }] },
  { name: 'sleep_analysis', units: 'hr', data: [{ date: '2026-11-20 00:00:00 +0100', totalSleep: 7.5, deep: 1, rem: 1.5, core: 5, awake: 0.5, inBed: 8, sleepStart: '2026-11-19 23:10:00 +0100', sleepEnd: '2026-11-20 07:10:00 +0100', source: 'Watch' }] },
  { name: 'kaputt', data: [null, { date: 'nie', qty: 1 }] },
], workouts: [{ id: 'w1', name: 'Laufen', start: '2026-11-20 18:00:00 +0100', end: '2026-11-20 18:40:00 +0100', duration: 2400, activeEnergyBurned: { qty: 420, units: 'kcal' }, distance: { qty: 8, units: 'km' }, heartRate: { avg: { qty: 150 }, max: { qty: 175 } } }] } });
pruefe('Format erkannt', hae.format === 'health-auto-export');
pruefe('Messwerte inkl. Blutdruck aufgeteilt', hae.messwerte.length === 5 && hae.messwerte.some(m => m.metrik === 'blood_pressure_diastolic' && m.wert === 79), hae.messwerte);
pruefe('Min/Max übernommen', hae.messwerte.find(m => m.metrik === 'heart_rate').max === 150);
pruefe('Nacht in Minuten', hae.naechte[0].gesamt_min === 450 && hae.naechte[0].tief_min === 60 && hae.naechte[0].nacht === '2026-11-20', hae.naechte);
pruefe('Workout: Dauer in Minuten, Puls', hae.workouts[0].dauer_min === 40 && hae.workouts[0].hf_mittel === 150 && hae.workouts[0].distanz_km === 8);
pruefe('Kaputtes wird gezählt statt zu werfen', hae.verworfen === 2, hae.verworfen);

block('Import: Kurzbefehl');
const kb = lesen({ reihen: [
  { metrik: 'Schritte', werte: [1200, '3.400'], daten: ['2026-11-21T08:00:00Z', '21.11.2026, 12:00'] },
  { metric: 'resting_heart_rate', values: '55\n57', dates: '2026-11-20\n2026-11-21' },
  { metrik: 'Schlaf', werte: ['Im Bett', 'Kern', 'Tief', 'REM', 'Wach', 'Kern'], daten: ['2026-11-20T22:00:00Z', '2026-11-20T22:15:00Z', '2026-11-21T00:15:00Z', '2026-11-21T01:15:00Z', '2026-11-21T02:45:00Z', '2026-11-21T03:00:00Z'],
    enddaten: ['2026-11-21T06:00:00Z', '2026-11-21T00:15:00Z', '2026-11-21T01:15:00Z', '2026-11-21T02:45:00Z', '2026-11-21T03:00:00Z', '2026-11-21T05:45:00Z'] },
  { metrik: 'Gewicht', werte: [80], daten: [] },
] });
pruefe('Format erkannt', kb.format === 'kurzbefehl');
pruefe('Listen & Zeilenlisten gelesen', kb.messwerte.filter(m => m.metrik === 'step_count').length === 2 && kb.messwerte.filter(m => m.metrik === 'resting_heart_rate').length === 2);
pruefe('„3.400“ = 3400', kb.messwerte.some(m => m.wert === 3400));
const n = kb.naechte[0];
pruefe('Segmente → eine Nacht am Aufwachtag', kb.naechte.length === 1 && n.nacht === '2026-11-21', kb.naechte);
pruefe('Phasen summiert (Kern 120+165, Tief 60, REM 90, Wach 15)', n.kern_min === 285 && n.tief_min === 60 && n.rem_min === 90 && n.wach_min === 15 && n.gesamt_min === 435 && n.im_bett_min === 480, n);
pruefe('Ungleich lange Listen verworfen', kb.verworfen === 1);
pruefe('Einzelobjekt ohne „reihen“', lesen({ metrik: 'hrv', werte: [50], daten: ['2026-11-21'] }).messwerte[0].metrik === 'heart_rate_variability');

block('Datenbank ' + (process.env.DATABASE_URL ? '(Postgres)' : '(PGlite)'));
const { q } = await db();
await q('truncate messwerte, schlaf_naechte, workouts, syncs, einstellungen, protokoll');
const g1 = await speichern(hae);
pruefe('Gespeichert', g1.messwerte === 5 && g1.naechte === 1 && g1.workouts === 1, g1);
const g2 = await speichern(hae);
pruefe('Zweimal senden = idempotent', (await q('select count(*)::int as n from messwerte'))[0].n == 5);
const tw = await tageswerte(['step_count', 'heart_rate'], { von: '2026-11-19', bis: '2026-11-21' });
pruefe('Summen: stärkste Quelle statt Doppelzählung', tw.step_count?.[0]?.wert === 9000 && tw.step_count[0].tag === '2026-11-20', tw);
pruefe('Mittel mit Spanne', tw.heart_rate[0].wert === 70 && tw.heart_rate[0].min === 48 && tw.heart_rate[0].max === 150);
await speichern(lesen({ metrik: 'Gewicht', werte: [81, 80.2], daten: ['2026-11-20T06:00:00Z', '2026-11-20T19:00:00Z'] }));
const gw = await tageswerte(['weight_body_mass'], { von: '2026-11-20', bis: '2026-11-20' });
pruefe('Gewicht = letzter Wert des Tages', gw.weight_body_mass[0].wert === 80.2, gw);
await speichern(kb);
const sl = await schlaf({ von: '2026-11-19', bis: '2026-11-21' });
pruefe('Schlafnächte gelesen', sl.length === 2 && sl[1].gesamt_min === 435, sl);
pruefe('Workouts gelesen', (await workouts({ von: '2026-11-20', bis: '2026-11-20' }))[0]?.art === 'Laufen');
const vf = await verfuegbar();
pruefe('Verfügbare Daten', vf.metriken.some(m => m.metrik === 'step_count' && m.erster_tag) && vf.schlaf.naechte === 2);
await speichern(lesen(demoNutzlast(40)));
const u = await ueberblick(7);
pruefe('Überblick mit allen Bereichen', ['schlaf', 'herz', 'aktivitaet', 'ernaehrung', 'koerper'].every(b => u.bereiche[b]), Object.keys(u.bereiche));
pruefe('Veränderung berechnet', typeof u.bereiche.herz.resting_heart_rate.veraenderung_prozent === 'number');
pruefe('Zeitraum begrenzt', (() => { const z = zeitraum({ von: '2000-01-01', bis: '2026-11-20' }, 14, 400); return z.von === tagPlus('2026-11-20', -399); })());

block('Zugang');
const req = (kopf, url = '/') => ({ headers: kopf, url });
pruefe('Bearer-Token', tokenOk(req({ authorization: 'Bearer tok-123' })));
pruefe('Token in URL', tokenOk(req({}, '/api/mcp?key=tok-123')));
pruefe('Falsches Token abgelehnt', !tokenOk(req({ authorization: 'Bearer x' })) && !tokenOk(req({})));
pruefe('Passcode', passcodeOk(req({ 'x-puls-code': 'code' })) && !passcodeOk(req({ 'x-puls-code': 'nein' })));
pruefe('Ohne Werte in Produktion gesperrt', !tokenOk(req({}), { VERCEL: '1' }) && !passcodeOk(req({}), { NODE_ENV: 'production' }));

block('API');
let r = await ruf(syncHandler, { metrik: 'Schritte', werte: [500], daten: ['2026-11-22T10:00:00Z'] }, { url: '/api/sync?key=tok-123' });
pruefe('Sync 200', r.statusCode === 200 && r.json.messwerte === 1, r.text);
r = await ruf(syncHandler, {}, { url: '/api/sync' });
pruefe('Sync ohne Token 401', r.statusCode === 401);
r = await ruf(syncHandler, '{kaputt', { kopf: { authorization: 'Bearer tok-123' } });
pruefe('Sync kaputtes JSON 400', r.statusCode === 400);
r = await ruf(syncHandler, null, { methode: 'GET', kopf: { authorization: 'Bearer tok-123' } });
pruefe('Sync GET 405', r.statusCode === 405);
r = await ruf(datenHandler, null, { methode: 'GET', url: '/api/daten?tage=7&verbindung=1', kopf: { 'x-puls-code': 'code' } });
pruefe('Daten 200: Rohbasis mit Vorlauf, Meta, Protokoll', r.statusCode === 200 && r.json.basis.reihen.step_count && r.json.tage_geladen === 7 && r.json.basis.von <= tagPlus(r.json.heute, -41) && r.json.meta.vorlagen.bodybuilding && Array.isArray(r.json.protokoll), r.text.slice(0, 200));
pruefe('Verbindungsadressen', r.json.verbindung.mcp === 'https://puls.test/mcp/tok-123' && r.json.verbindung.sync.endsWith('/api/sync?key=tok-123'));
r = await ruf(datenHandler, null, { methode: 'GET', url: '/api/daten' });
pruefe('Daten ohne Code 401', r.statusCode === 401);

block('MCP');
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const mcp = (k, url = '/api/mcp?key=tok-123') => ruf(mcpHandler, k, { url });
r = await mcp(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }));
pruefe('initialize', r.statusCode === 200 && r.json.result.protocolVersion === '2025-06-18' && r.json.result.capabilities.tools && r.json.result.serverInfo.name, r.text);
r = await mcp(rpc('initialize', { protocolVersion: '1999-01-01' }));
pruefe('Unbekannte Version → neueste', r.json.result.protocolVersion === '2025-11-25');
r = await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' });
pruefe('Benachrichtigung → 202 ohne Körper', r.statusCode === 202 && r.text === '');
r = await mcp(rpc('tools/list', {}));
const namen = r.json.result.tools.map(t => t.name);
pruefe('Elf Werkzeuge, nur lesend', namen.length === 11 && r.json.result.tools.every(t => t.annotations.readOnlyHint && t.inputSchema.type === 'object' && !t.run), namen);
r = await mcp(rpc('tools/call', { name: 'gesundheit_ueberblick', arguments: { tage: 7 } }));
pruefe('Überblick über MCP', !r.json.result.isError && JSON.parse(r.json.result.content[0].text).bereiche.herz, r.text.slice(0, 300));
r = await mcp(rpc('tools/call', { name: 'tageswerte', arguments: { metriken: ['Schritte', 'Ruhepuls'], tage: 5 } }));
pruefe('Tageswerte mit deutschen Namen', r.json.result.structuredContent.metriken.step_count.tage.length >= 4 && r.json.result.structuredContent.metriken.resting_heart_rate, r.text.slice(0, 300));
r = await mcp(rpc('tools/call', { name: 'schlaf_naechte', arguments: { tage: 3 } }));
pruefe('Schlaf über MCP', r.json.result.structuredContent.naechte.length >= 2);
r = await mcp(rpc('tools/call', { name: 'ernaehrung', arguments: { tage: 7 } }));
pruefe('Ernährung über MCP', r.json.result.structuredContent.tage.some(t => t.dietary_energy && t.protein));
r = await mcp(rpc('tools/call', { name: 'workouts', arguments: {} }));
pruefe('Workouts über MCP', Array.isArray(r.json.result.structuredContent.workouts));
r = await mcp(rpc('tools/call', { name: 'rohwerte', arguments: { metrik: 'Gewicht', tage: 10 } }));
pruefe('Rohwerte über MCP', r.json.result.structuredContent.werte.length > 0, r.text.slice(0, 300));
r = await mcp(rpc('tools/call', { name: 'verfuegbare_daten', arguments: {} }));
pruefe('Verfügbare Daten über MCP', r.json.result.structuredContent.metriken.length > 10);
r = await mcp(rpc('tools/call', { name: 'schlaf_naechte', arguments: { von: '21.11.2026' } }));
pruefe('Falsches Datum → isError statt Absturz', r.json.result.isError === true);
r = await mcp(rpc('tools/call', { name: 'gibtsnicht', arguments: {} }));
pruefe('Unbekanntes Werkzeug → JSON-RPC-Fehler', r.json.error.code === -32602);
r = await mcp(rpc('foo/bar', {}));
pruefe('Unbekannte Methode', r.json.error.code === -32601);
r = await mcp([rpc('ping', {}, 1), rpc('tools/list', {}, 2)]);
pruefe('Stapel', Array.isArray(r.json) && r.json.length === 2);
r = await mcp(rpc('tools/list', {}), '/api/mcp');
pruefe('Ohne Token 401', r.statusCode === 401);
r = await ruf(mcpHandler, null, { methode: 'GET', url: '/api/mcp?key=tok-123' });
pruefe('GET 405', r.statusCode === 405);
pruefe('Schemaprüfung: Pflichtfeld', schemaPruefe(WERKZEUGE.find(w => w.name === 'tageswerte').inputSchema, {}) !== null);
pruefe('Schemaprüfung: Grenze', schemaPruefe(WERKZEUGE[0].inputSchema, { tage: 999 }) !== null && schemaPruefe(WERKZEUGE[0].inputSchema, { tage: 30 }) === null);

block('Bodybuilding');
pruefe('Trend glättet und überbrückt Lücken', (() => { const t = trend([80, null, 82]); return t[0] === 80 && t[1] === 80 && Math.abs(t[2] - 80.2) < 1e-9; })());
pruefe('Steigung', Math.abs(steigung([1, 2, null, 4]) - 1) < 1e-9 && steigung([5]) === null);
pruefe('ISO-Woche (Jahreswechsel)', isoWoche('2026-11-22') === '2026-W47' && isoWoche('2027-01-01') === '2026-W53' && isoWoche('2026-01-01') === '2026-W01');
pruefe('Einstellungen säubern', (() => { const e = saeubern({ kacheln: ['gewicht', 'boese', 'gewicht'], bereiche: ['schlaf', 'x'], ziele: { phase: 'diaet', protein_g_pro_kg: 99, rate_prozent_woche: '-0.5', groesse_cm: 180 } });
  return e.kacheln.join() === 'gewicht' && e.bereiche.join() === 'schlaf' && e.ziele.phase === 'diaet' && e.ziele.protein_g_pro_kg === STANDARD.ziele.protein_g_pro_kg && e.ziele.rate_prozent_woche === -0.5 && e.ziele.groesse_cm === 180; })());
await q('truncate messwerte, workouts');
// 28 Tage: 80 → 81,4 kg (+0,35 kg/Woche), 3000 kcal Zufuhr, 160 g Eiweiß, 3×/Woche Kraft
const heute = lokalerTag(new Date()), reihen = { gewicht: [], kcal: [], prot: [], d: [] };
for(let i = 41; i >= 0; i--){ const t = tagPlus(heute, -i); reihen.d.push(t + 'T06:00:00Z'); reihen.gewicht.push(+(81.4 - i * 0.05).toFixed(2)); reihen.kcal.push(3000); reihen.prot.push(160); }
await speichern(lesen({ reihen: [ { metrik: 'Gewicht', werte: reihen.gewicht, daten: reihen.d }, { metrik: 'Nahrungsenergie', werte: reihen.kcal, daten: reihen.d }, { metrik: 'Protein', werte: reihen.prot, daten: reihen.d },
  { metrik: 'Körpergröße', werte: [1.8], daten: [reihen.d[0]], einheit: 'm' } ],
  workouts: [0, 2, 4, 7, 9, 11].map(i => ({ art: 'Krafttraining', start: tagPlus(heute, -i) + 'T17:00:00Z', dauer: 60 })) }));
const bb = await bodybuilding(zeitraum({ tage: 14 }), { ...structuredClone(STANDARD), ziele: { ...STANDARD.ziele, protein_g_pro_kg: 2.0, phase: 'aufbau' } });
pruefe('Tempo ≈ +0,35 kg/Woche', Math.abs(bb.gewicht.rate_kg_woche - 0.35) < 0.05, bb.gewicht);
pruefe('Adaptiver TDEE ≈ 3000 − 0,05·7700 ≈ 2615', bb.energie.tdee_methode.startsWith('adaptiv') && Math.abs(bb.energie.tdee_kcal - 2615) < 80, bb.energie);
pruefe('Empfehlung = TDEE + Zieltempo (± Tagtyp)', Math.abs(bb.energie.empfohlene_kcal - (bb.energie.tdee_kcal + bb.gewicht.ziel_rate_kg_woche * 1100)) <= 160, bb.energie);
pruefe('Eiweiß g/kg', Math.abs(bb.eiweiss.mittel_g_pro_kg - 160 / 81) < 0.08, bb.eiweiss);
pruefe('Größe aus Health (m → cm)', bb.koerper.groesse_cm === 180);
pruefe('Krafttraining gezählt', bb.kraft.einheiten >= 5 && bb.kraft.wochen.length >= 2, bb.kraft);
pruefe('Reihen so lang wie der Zeitraum', bb.reihen.tage.length === 14 && bb.reihen.trend_kg.length === 14);

block('Einstellungen-API');
r = await ruf(einstHandler, null, { methode: 'GET', kopf: { 'x-puls-code': 'code' } });
pruefe('GET liefert Standard + Vorlagen', r.statusCode === 200 && r.json.einstellungen.vorlage === 'bodybuilding' && r.json.vorlagen.erholung);
r = await ruf(einstHandler, { vorlage: 'erholung', kacheln: ['schlaf', 'hrv'], bereiche: ['schlaf', 'herz'], ziele: { phase: 'diaet', zielgewicht_kg: 78 } }, { methode: 'PUT', kopf: { 'x-puls-code': 'code' } });
pruefe('PUT speichert', r.statusCode === 200 && r.json.einstellungen.ziele.zielgewicht_kg === 78);
r = await ruf(einstHandler, null, { methode: 'GET', kopf: { 'x-puls-code': 'code' } });
pruefe('Bleibt gespeichert', r.json.einstellungen.vorlage === 'erholung' && r.json.einstellungen.bereiche.join() === 'schlaf,herz');
r = await ruf(einstHandler, {}, { methode: 'PUT' });
pruefe('Ohne Code 401', r.statusCode === 401);
r = await mcp(rpc('tools/call', { name: 'bodybuilding_analyse', arguments: { tage: 14 } }));
pruefe('MCP nutzt gespeicherte Ziele', r.json.result.structuredContent.phase.schluessel === 'diaet' && r.json.result.structuredContent.gewicht.zielgewicht_kg === 78, r.text.slice(0, 300));

block('Rhythmus, Phasen, Kalorienziele');
const plan = { muster: ['T', 'T', 'R'], start: '2026-11-01' };
pruefe('Rhythmus T,T,R', ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map(t => tagTyp(t, plan, new Map())).join() === 'training,training,rest,training');
pruefe('Rhythmus rückwärts vor dem Start', tagTyp('2026-10-31', plan, new Map()) === 'rest' && tagTyp('2026-10-30', plan, new Map()) === 'training');
pruefe('Protokoll überschreibt Rhythmus', tagTyp('2026-11-03', plan, new Map([['2026-11-03', { tagtyp: 'training' }]])) === 'training');
pruefe('Ohne Rhythmus → null', tagTyp('2026-11-03', { muster: [] }, new Map()) === null);
const ph = [{ phase: 'diaet', start: '2026-03-01' }, { phase: 'aufbau', start: '2026-09-01' }];
pruefe('Phase am Tag', phaseAm('2026-08-31', ph).phase === 'diaet' && phaseAm('2026-09-01', ph).phase === 'aufbau' && phaseAm('2026-01-01', ph, 'erhalt').phase === 'erhalt');
const zz = { ...STANDARD.ziele };
pruefe('Kalorienziel: eigene Tagtyp-Ziele', kcalZiel('rest', { ...zz, kcal_rest: 2800, kcal_training: 3400 }, 3000, 0.2) === 2800 && kcalZiel('training', { ...zz, kcal_rest: 2800, kcal_training: 3400 }, 3000, 0.2) === 3400);
pruefe('Kalorienziel: TDEE + Überschuss ± Tagtyp', kcalZiel('training', { ...zz, ueberschuss_kcal: 300 }, 3000, 0.2) === 3450 && kcalZiel('rest', { ...zz, ueberschuss_kcal: 300 }, 3000, 0.2) === 3150);
pruefe('Kalorienziel: aus Zieltempo', kcalZiel(null, zz, 3000, 0.21) === 3231);
pruefe('Einstellungen: Phasen & Rhythmus gesäubert', (() => { const e = saeubern({ phasen: [{ phase: 'aufbau', start: '2026-09-01' }, { phase: 'quatsch', start: '2026-01-01' }, { phase: 'diaet', start: 'gestern' }], plan: { muster: ['T', 'X', 'R'], start: '2026-11-01' }, ziele: { kcal_rest: 2800, cardio_min_rest: 30 } });
  return e.phasen.length === 1 && e.plan.muster.join() === 'T,R' && e.ziele.kcal_rest === 2800 && e.ziele.cardio_min_rest === 30; })());

block('Coach-Analyse');
// 6 Wochen synthetisch: T,T,R; Rest-Days 600 kcal über Ziel; schnelle Zunahme; kurzer Schlaf
const ende = lokalerTag(new Date()), T42 = []; for(let i = 41; i >= 0; i--) T42.push(tagPlus(ende, -i));
const ptk = { muster: ['T', 'T', 'R'], start: T42[0] };
const reih = { weight_body_mass: [], dietary_energy: [], protein: [], active_energy: [], basal_energy_burned: [], step_count: [] };
T42.forEach((t, i) => { const typ = tagTyp(t, ptk, new Map());
  reih.weight_body_mass.push({ tag: t, wert: 80 + i * 0.12 }); reih.protein.push({ tag: t, wert: 120 });
  reih.dietary_energy.push({ tag: t, wert: typ === 'rest' ? 4200 : 3400 }); reih.active_energy.push({ tag: t, wert: 700 }); reih.basal_energy_burned.push({ tag: t, wert: 1900 }); reih.step_count.push({ tag: t, wert: 6000 }); });
const basisS = { reihen: reih, schlaf: T42.map(t => ({ nacht: t, gesamt_min: 380, tief_min: 50 })), workouts: T42.filter(t => tagTyp(t, ptk, new Map()) === 'training').map(t => ({ tag: t, art: 'Krafttraining', dauer_min: 60 })), groesse: 180 };
const eS = { ...structuredClone(STANDARD), plan: ptk, phasen: [{ phase: 'aufbau', start: T42[0] }], ziele: { ...STANDARD.ziele, kcal_training: 3400, kcal_rest: 3600, protein_g_pro_kg: 2.2, cardio_min_rest: 30 } };
const an = analyseKern(basisS, eS, [{ tag: T42.at(-2), cheat: true, tagtyp: null, notiz: '' }], ende);
const titel = an.erkenntnisse.map(x => x.titel);
pruefe('Warnt: zu schnelle Zunahme', titel.includes('Du nimmst zu schnell zu'), titel);
pruefe('Warnt: Rest-Days über Ziel', an.erkenntnisse.some(x => x.titel === 'Rest-Days über Ziel' && x.ton === 'warnung'), titel);
pruefe('Warnt: Eiweiß unter Ziel', titel.includes('Eiweiß unter Ziel'));
pruefe('Kritisch: zu wenig Schlaf', an.erkenntnisse.some(x => x.titel === 'Mehr schlafen' && x.ton === 'kritisch'));
pruefe('Lob: Plan erfüllt', titel.includes('Plan voll erfüllt'));
pruefe('Cheat Day erkannt', titel.some(t => t.startsWith('1 Cheat Day')));
pruefe('Sortierung: Kritisches zuerst', an.erkenntnisse[0].ton === 'kritisch');
pruefe('Score und Vergleich vorhanden', an.woche.score.wert >= 0 && an.woche.score.wert <= 100 && an.woche.vergleich.length === 10 && ['besser', 'schlechter', 'gleich'].includes(an.woche.urteil));
pruefe('Score: perfekte Woche = 100', score({ rate_pct: 0.25, ziel_rate_pct: 0.25, kcal_abw: 0, eiweiss_g: 200, eiweiss_ziel: 200, kraft: 4, kraft_geplant: 4, schlaf: { mittel_min: 480 }, schritte: 10000, cardio: 30 }, { schlaf_ziel_h: 8, schritte_ziel: 10000, cardio_min_ziel: 30 }).wert === 100);
const bbS = bbKern(basisS, { von: tagPlus(ende, -13), bis: ende }, eS, []);
pruefe('Phase seit Start mit Startgewicht', bbS.phase.seit?.gewicht_start_kg != null && bbS.phase.seit.veraenderung_kg > 3, bbS.phase.seit);
pruefe('Tagtypen ausgewertet', bbS.tagtypen.rest.tage >= 4 && bbS.tagtypen.rest.ueber_ziel_tage >= 4 && bbS.tagtypen.training.kcal_mittel === 3400, bbS.tagtypen);
pruefe('Plan-Treue', bbS.kraft.geplante_trainingstage === bbS.kraft.davon_trainiert && bbS.kraft.geplante_trainingstage >= 9);

block('Training: Arten, Split, Muskeln');
pruefe('Apple-Health-Arten → deutsch', ['Traditional Strength Training', 'Pool Swim', 'Stair Climbing', 'Indoor Cycling', 'Elliptical', 'Walking', 'Rowing', 'Yoga'].map(x => artNormal(x).art).join() === 'Krafttraining,Schwimmen,Stairmaster,Radfahren,Crosstrainer,Gehen,Rudern,Yoga');
pruefe('Kategorien', artNormal('Stair Climbing').kategorie === 'cardio' && artNormal('Functional Strength Training').kategorie === 'kraft' && artNormal('Flexibility').kategorie === 'mobil');
pruefe('Split-Erkennung aus Namen', fokusAus('Hevy: Leg Day', SPLITS.ppl) === 'Beine' && fokusAus('Chest & Triceps', SPLITS.ppl) === 'Push' && fokusAus('Upper A', SPLITS.ou) === 'Oberkörper' && fokusAus('Traditional Strength Training', SPLITS.ppl) === null);
pruefe('Muskeln aus Text', muskelnAus('Bankdrücken + Curls').join() === 'Brust,Bizeps');
const T21 = []; for(let i = 20; i >= 0; i--) T21.push(tagPlus(ende, -i));
const eT = { ...structuredClone(STANDARD), plan: { muster: ['T', 'T', 'R'], start: T21[0] }, split: { vorlage: 'ppl', tage: structuredClone(SPLITS.ppl.tage) } };
// nur Push und Pull werden trainiert – Beine fehlen; Rest-Days: Stairmaster
const woT = []; let z = 0;
T21.forEach(t => { if(tagTyp(t, eT.plan, new Map()) === 'training'){ woT.push({ tag: t, art: z++ % 2 ? 'Pull' : 'Push', dauer_min: 60, energie_kcal: 400 }); } else woT.push({ tag: t, art: 'Stair Climbing', dauer_min: 30 }); });
const basisT = { reihen: {}, schlaf: [], workouts: woT, groesse: 180 };
const protT = [{ tag: T21.at(-1), cheat: false, tagtyp: null, notiz: '', fokus: null, einheiten: [{ art: 'Schwimmen', dauer_min: 25 }] }];
const bT = bbKern(basisT, { von: T21[7], bis: ende }, eT, protT);
pruefe('Fokus aus Workout-Namen', bT.reihen.fokus.filter(Boolean).every(f => f === 'Push' || f === 'Pull'));
pruefe('Beine: 0× pro Woche erkannt', bT.training.muskeln.find(m => m.muskel === 'Quadrizeps').einheiten === 0 && bT.training.muskeln.find(m => m.muskel === 'Brust').einheiten >= 3, bT.training.muskeln.slice(0, 3));
pruefe('Manuelle Einheit zählt (Schwimmen)', bT.training.arten.some(a => a.art === 'Schwimmen' && a.manuell === 1) && bT.reihen.cardio_min.at(-1) >= 25, bT.training.arten);
pruefe('Stairmaster als Cardio', bT.training.arten.some(a => a.art === 'Stairmaster' && a.kategorie === 'cardio'));
pruefe('Split-Tage-Statistik', bT.training.split_tage.find(d => d.name === 'Beine').absolviert === 0 && bT.training.split_tage.find(d => d.name === 'Push').absolviert >= 2);
const anT = analyseKern(basisT, eT, protT, ende);
const tT = anT.erkenntnisse.map(x => x.titel);
pruefe('Coach: Beine fehlen', tT.includes('Beine fehlt'), tT);
pruefe('Coach: Muskelgruppen zu selten', tT.includes('Muskelgruppen zu selten trainiert'), tT);
const protF = [{ tag: T21.at(-2), cheat: false, tagtyp: null, notiz: '', fokus: 'Beine', einheiten: [] }];
pruefe('Fokus im Protokoll überschreibt Erkennung', bbKern(basisT, { von: T21[7], bis: ende }, eT, protF).reihen.fokus.at(-2) === (tagTyp(T21.at(-2), eT.plan, new Map()) === 'training' ? 'Beine' : 'Beine'));

block('Protokoll-API');
r = await ruf(protHandler, { tag: '2026-11-20', cheat: true, notiz: 'Pizza' }, { methode: 'PUT', kopf: { 'x-puls-code': 'code' } });
pruefe('Cheat Day speichern', r.statusCode === 200 && r.json.eintrag.cheat === true, r.text);
r = await ruf(protHandler, null, { methode: 'GET', url: '/api/protokoll?von=2026-11-01&bis=2026-11-30', kopf: { 'x-puls-code': 'code' } });
pruefe('Protokoll lesen', r.json.eintraege.length === 1 && r.json.eintraege[0].notiz === 'Pizza');
r = await ruf(protHandler, { tag: '2026-11-20', cheat: false }, { methode: 'PUT', kopf: { 'x-puls-code': 'code' } });
r = await ruf(protHandler, null, { methode: 'GET', url: '/api/protokoll?von=2026-11-01&bis=2026-11-30', kopf: { 'x-puls-code': 'code' } });
pruefe('Leerer Eintrag wird gelöscht', r.json.eintraege.length === 0);
r = await ruf(protHandler, { tag: 'morgen' }, { methode: 'PUT', kopf: { 'x-puls-code': 'code' } });
pruefe('Ungültiger Tag → 400', r.statusCode === 400);
r = await ruf(protHandler, { tag: '2026-11-19', fokus: 'Beine', einheiten: [{ art: 'Schwimmen', dauer_min: 30 }, { art: '', dauer_min: 5 }, { art: 'Stairmaster', dauer_min: 9999 }] }, { methode: 'PUT', kopf: { 'x-puls-code': 'code' } });
pruefe('Fokus + Einheiten gespeichert und gesäubert', r.json.eintrag.fokus === 'Beine' && r.json.eintrag.einheiten.length === 1, r.text);
r = await ruf(protHandler, null, { methode: 'GET', url: '/api/protokoll?von=2026-11-19&bis=2026-11-19', kopf: { 'x-puls-code': 'code' } });
pruefe('Einheiten aus DB gelesen', r.json.eintraege[0]?.einheiten?.[0]?.art === 'Schwimmen', r.text);
r = await ruf(protHandler, null, { methode: 'GET' });
pruefe('Ohne Code 401', r.statusCode === 401);
r = await mcp(rpc('tools/call', { name: 'coach_analyse', arguments: {} }));
pruefe('MCP coach_analyse', !r.json.result.isError && r.json.result.structuredContent.woche.vergleich.length === 10, r.text.slice(0, 300));
r = await mcp(rpc('tools/call', { name: 'training_auswertung', arguments: { tage: 14 } }));
pruefe('MCP training_auswertung', !r.json.result.isError && Array.isArray(r.json.result.structuredContent.arten) && 'muskeln' in r.json.result.structuredContent, r.text.slice(0, 300));
r = await mcp(rpc('tools/call', { name: 'protokoll_und_plan', arguments: { tage: 7 } }));
pruefe('MCP protokoll_und_plan', r.json.result.structuredContent.tage.length === 7 && 'plan' in r.json.result.structuredContent, r.text.slice(0, 300));

console.log(`\n${ok} bestanden, ${nein} fehlgeschlagen`);
process.exit(nein ? 1 : 0);
