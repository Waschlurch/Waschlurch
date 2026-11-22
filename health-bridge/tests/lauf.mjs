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
await q('truncate messwerte, schlaf_naechte, workouts, syncs');
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
pruefe('Daten 200 mit 7 Tagen', r.statusCode === 200 && r.json.tage.length === 7 && r.json.reihen.step_count, r.text.slice(0, 200));
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
pruefe('Sieben Werkzeuge, nur lesend', namen.length === 7 && r.json.result.tools.every(t => t.annotations.readOnlyHint && t.inputSchema.type === 'object' && !t.run), namen);
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

console.log(`\n${ok} bestanden, ${nein} fehlgeschlagen`);
process.exit(nein ? 1 : 0);
