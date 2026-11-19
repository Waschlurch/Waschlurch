/* Prüflauf: node tests/lauf.mjs */
import { Readable } from 'node:stream';
import { erstelleHandler, pruefeVerlauf, fehlerText } from '../api/chat.mjs';
import pdfHandler, { dateiname } from '../api/pdf.mjs';
import { zerlege, inline, saeubern, pdfBuffer } from '../lib/markdown-pdf.mjs';
import { zugangOk, ratenGrenze } from '../lib/guard.mjs';
import { MODI, MODEL, nutzerText, systemPrompt } from '../lib/prompts.mjs';
import { WERKZEUGE, SEITEN_PRO_AUFRUF } from '../lib/werkzeuge.mjs';
import { attrappe, BEISPIEL } from './attrappe.mjs';
import Anthropic from '@anthropic-ai/sdk';

let ok = 0, nein = 0;
const pruefe = (name, b, ist) => { if(b){ ok++; console.log('  ✓ ' + name); } else { nein++; console.log('  ✗ ' + name + (ist !== undefined ? '  → ' + JSON.stringify(ist).slice(0, 200) : '')); } };
const block = t => console.log('\n── ' + t);

function anfrage(koerper, { methode = 'POST', code = 'geheim', ip = '1.1.1.' + Math.random() } = {}){
  const r = Readable.from([Buffer.from(typeof koerper === 'string' ? koerper : JSON.stringify(koerper))]);
  r.method = methode; r.headers = { 'x-bridge-code': code, 'x-forwarded-for': ip };
  r.on ??= () => {};
  return r;
}
function antwort(){
  const teile = [];
  return { statusCode: 0, kopf: {}, writableEnded: false,
    setHeader(k, v){ this.kopf[k.toLowerCase()] = v; },
    write(t){ teile.push(Buffer.from(t)); },
    end(t){ if(t) teile.push(Buffer.from(t)); this.writableEnded = true; },
    get body(){ return Buffer.concat(teile); },
    get json(){ return JSON.parse(this.body.toString()); },
    get zeilen(){ return this.body.toString().trim().split('\n').filter(Boolean).map(z => JSON.parse(z)); } };
}
const nutzer = text => [{ role: 'user', content: [{ type: 'text', text }] }];
process.env.BRIDGE_PASSCODE = 'geheim';

block('Werkzeuge');
pruefe('Drei Werkzeuge', WERKZEUGE.length === 3);
pruefe('Namen', WERKZEUGE.map(w => w.name).join() === 'ordner_auflisten,notizen_suchen,notiz_lesen');
pruefe('Schemata sind streng und vollständig', WERKZEUGE.every(w =>
  w.strict === true && w.input_schema.additionalProperties === false
  && Object.keys(w.input_schema.properties).every(p => w.input_schema.required.includes(p))
  && w.description.length > 60));
pruefe('Seitengrenze wird beschrieben', WERKZEUGE[2].description.includes(String(SEITEN_PRO_AUFRUF)));

block('Anweisungen');
pruefe('Systemanweisung nennt die Werkzeuge', WERKZEUGE.every(w => systemPrompt().includes(w.name)));
pruefe('Systemanweisung bleibt konstant (Caching)', systemPrompt() === systemPrompt());
pruefe('Alle Modi vollständig', Object.values(MODI).every(m => m.anweisung && m.titel && m.kurz && ['low','medium','high','xhigh','max'].includes(m.effort)));
const t1 = nutzerText('zusammenfassen', 'kurz halten', [{ pfad: 'Bio/Zellen.pdf', seiten: 12 }]);
pruefe('Auswahl steht in der Anweisung', t1.includes('Bio/Zellen.pdf') && t1.includes('12 Seiten') && t1.includes('kurz halten'));
pruefe('Ohne Auswahl darf Claude selbst suchen', nutzerText('fragen', 'Wo steht X?').includes('Sieh dich in der Bibliothek um'));

block('Verlauf prüfen');
const wirft = (f, code) => { try { f(); return false; } catch(e){ return code ? e.code === code : e.status === 400; } };
pruefe('Leerer Verlauf → Fehler', wirft(() => pruefeVerlauf([])));
pruefe('Falsche Rolle → Fehler', wirft(() => pruefeVerlauf([{ role: 'system', content: 'x' }])));
pruefe('Unbekannter Block → Fehler', wirft(() => pruefeVerlauf([{ role: 'user', content: [{ type: 'video' }] }])));
pruefe('Letzter Zug muss vom Nutzer sein', wirft(() => pruefeVerlauf([...nutzer('a'), { role: 'assistant', content: [{ type: 'text', text: 'b' }] }])));
pruefe('Zu langes Gespräch → Fehler', wirft(() => pruefeVerlauf(Array(401).fill(nutzer('x')[0])), 'zu_lang'));
pruefe('Gültiger Verlauf mit Werkzeugergebnis', !!pruefeVerlauf([
  ...nutzer('a'),
  { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, { type: 'tool_use', id: 't', name: 'notiz_lesen', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AA==' } }] }] },
]));

block('Zugang & Rate');
pruefe('Richtiger Code', zugangOk({ headers: { 'x-bridge-code': 'geheim' } }));
pruefe('Falscher Code', !zugangOk({ headers: { 'x-bridge-code': 'falsch' } }));
pruefe('Ohne Code in Produktion gesperrt', !zugangOk({ headers: {} }, { VERCEL: '1' }));
pruefe('Ohne Code lokal offen', zugangOk({ headers: {} }, {}));
let durch = 0; for(let i = 0; i < 25; i++) if(ratenGrenze('test', 20, 60000, 1000 + i)) durch++;
pruefe('Ratenbegrenzung greift bei 20', durch === 20, durch);
pruefe('Fenster läuft ab', ratenGrenze('test', 20, 60000, 1000 + 60001));

block('Gesprächs-Endpunkt');
{
  const protokoll = [];
  const h = erstelleHandler(() => attrappe({ verzoegerung: 0, protokoll, zuege: [{ text: BEISPIEL }] }));
  const res = antwort(); await h(anfrage({ messages: nutzer('Fasse zusammen'), modus: 'zusammenfassen' }), res);
  const z = res.zeilen;
  pruefe('Status 200 + NDJSON', res.statusCode === 200 && res.kopf['content-type'].includes('ndjson'));
  pruefe('Text kommt vollständig an', z.filter(e => e.t === 'text').map(e => e.d).join('') === BEISPIEL);
  pruefe('Zug enthält die Blöcke', z.at(-1).t === 'zug' && z.at(-1).content[0].type === 'text' && z.at(-1).stop === 'end_turn');
  const p = protokoll[0];
  pruefe('Modell ist ' + MODEL, p.model === MODEL);
  pruefe('Werkzeuge werden mitgeschickt', p.tools === WERKZEUGE);
  pruefe('Fallbacks aktiv', p.fallbacks === 'default' && p.betas.includes('server-side-fallback-2026-07-01'));
  pruefe('Kein thinking/temperature gesendet', !('thinking' in p) && !('temperature' in p));
  pruefe('Kein erzwungenes Werkzeug (Opus 5.5)', !('tool_choice' in p));
  pruefe('Effort aus Modus', p.output_config.effort === MODI.zusammenfassen.effort);
  pruefe('Verlauf wird unverändert weitergereicht', JSON.stringify(p.messages) === JSON.stringify(nutzer('Fasse zusammen')));

  const res2 = antwort();
  await erstelleHandler(() => attrappe({ verzoegerung: 0, zuege: [{ text: 'Ich sehe nach.', werkzeuge: [{ name: 'ordner_auflisten', input: { pfad: '' } }] }] }))
    (anfrage({ messages: nutzer('Was habe ich?'), modus: 'fragen' }), res2);
  const zug = res2.zeilen.at(-1);
  pruefe('Werkzeugwunsch kommt beim Browser an', zug.stop === 'tool_use' && zug.content.some(b => b.type === 'tool_use' && b.name === 'ordner_auflisten'));

  const r401 = antwort(); await h(anfrage({ messages: nutzer('x') }, { code: 'x' }), r401);
  pruefe('Falscher Code → 401', r401.statusCode === 401);
  const r405 = antwort(); await h(anfrage({}, { methode: 'GET' }), r405);
  pruefe('GET → 405', r405.statusCode === 405);
  const rjson = antwort(); await h(anfrage('{kaputt'), rjson);
  pruefe('Kaputtes JSON → 400', rjson.statusCode === 400);
  const rgross = antwort(); await h(anfrage({ messages: nutzer('A'.repeat(4_500_000)) }), rgross);
  pruefe('Zu groß → 413 mit Hinweis', rgross.statusCode === 413 && /Seiten/.test(rgross.json.message), rgross.statusCode);

  const rref = antwort();
  await erstelleHandler(() => attrappe({ verzoegerung: 0, zuege: [{ text: '', stop: 'refusal' }] }))(anfrage({ messages: nutzer('x') }), rref);
  pruefe('Ablehnung wird gemeldet', rref.zeilen.at(-1).code === 'refusal');
  const rerr = antwort();
  await erstelleHandler(() => attrappe({ fehler: new Error('boom') }))(anfrage({ messages: nutzer('x') }), rerr);
  pruefe('Unerwarteter Fehler → error-Zeile, kein Leck', rerr.zeilen.at(-1).t === 'error' && !JSON.stringify(rerr.zeilen).includes('boom'));
  pruefe('Verbindungsfehler wird übersetzt', fehlerText(new Anthropic.APIConnectionError({ message: 'x' })).code === 'netz');
}

block('Markdown-Zerlegung');
const b = zerlege('# T\n\nText **fett**\nweiter\n\n- [ ] offen\n- [x] erledigt\n  - tief\n1. eins\n> zitat\n---\n| a | b |\n|---|---|\n| 1 | 2 |\n```\ncode\n```');
pruefe('Titel', b[0].typ === 'titel' && b[0].ebene === 1);
pruefe('Absatz verbindet Zeilen', b[1].typ === 'absatz' && b[1].text === 'Text **fett** weiter');
pruefe('Checkbox offen/erledigt', b[2].haken === false && b[3].haken === true);
pruefe('Einrückung', b[4].tiefe === 1);
pruefe('Nummerierung', b[5].geordnet && b[5].nummer === 1);
pruefe('Zitat, Linie, Tabelle, Code', ['zitat', 'linie', 'tabelle', 'code'].every((t, i) => b[6 + i].typ === t));
pruefe('Tabellen-Trennzeile entfällt', b[8].zeilen.length === 2);
const s = inline('a **b** *c* `d` [e](https://x.de)');
pruefe('Inline-Formate', s.some(x => x.fett && x.text === 'b') && s.some(x => x.kursiv) && s.some(x => x.code) && s.some(x => x.link === 'https://x.de'));
pruefe('Sonderzeichen werden abgebildet', saeubern('a → b ✓ 😀 ä€') === 'a -> b (ok)  ä€', saeubern('a → b ✓ 😀 ä€'));

block('PDF');
const pdf = await pdfBuffer(BEISPIEL + '\n' + 'Langer Absatz. '.repeat(900), { titel: 'Zellatmung – Mitschrift', muster: 'punkte', thema: 'dunkel', format: 'ipad' });
pruefe('Gültiges PDF', pdf.subarray(0, 5).toString() === '%PDF-');
pruefe('Mehrseitig', (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 2);
for(const muster of ['blanko', 'liniert', 'kariert']) for(const thema of ['hell', 'creme'])
  pruefe(`Variante ${muster}/${thema}`, (await pdfBuffer('# A\n\ntext', { muster, thema, rand: muster !== 'blanko' })).length > 800);
pruefe('Unsinnige Optionen fallen auf Standard zurück', (await pdfBuffer('x', { format: 'zz', muster: 'zz', thema: 'zz' })).length > 500);
const rp = antwort(); await pdfHandler(anfrage({ markdown: '# Hallo', titel: 'Übung: Größen/Maße' }), rp);
pruefe('PDF-Endpunkt liefert PDF', rp.statusCode === 200 && rp.kopf['content-type'] === 'application/pdf');
pruefe('Dateiname ist sicher', dateiname('Übung: Größen/Maße') === 'Uebung-Groessen-Masse.pdf', dateiname('Übung: Größen/Maße'));
const rl = antwort(); await pdfHandler(anfrage({ markdown: '  ' }), rl);
pruefe('Leeres Markdown → 400', rl.statusCode === 400);

console.log(`\n${ok} bestanden, ${nein} fehlgeschlagen`);
process.exit(nein ? 1 : 0);
