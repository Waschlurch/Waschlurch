/* Prüflauf: node tests/lauf.mjs */
import { Readable } from 'node:stream';
import { erstelleHandler, baueInhalt, fehlerText } from '../api/claude.mjs';
import pdfHandler, { dateiname } from '../api/pdf.mjs';
import { zerlege, inline, saeubern, pdfBuffer } from '../lib/markdown-pdf.mjs';
import { zugangOk, ratenGrenze } from '../lib/guard.mjs';
import { MODI, MODEL } from '../lib/prompts.mjs';
import { attrappe, BEISPIEL } from './attrappe.mjs';
import Anthropic from '@anthropic-ai/sdk';

let ok = 0, nein = 0;
const pruefe = (name, b, ist) => { if(b){ ok++; console.log('  ✓ ' + name); } else { nein++; console.log('  ✗ ' + name + (ist !== undefined ? '  → ' + JSON.stringify(ist).slice(0, 200) : '')); } };
const block = t => console.log('\n── ' + t);

function anfrage(koerper, { methode = 'POST', code = 'geheim', ip = '1.1.1.' + Math.random() } = {}){
  const r = Readable.from([Buffer.from(typeof koerper === 'string' ? koerper : JSON.stringify(koerper))]);
  r.method = methode; r.headers = { 'x-bridge-code': code, 'x-forwarded-for': ip };
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
    get zeilen(){ return this.body.toString().trim().split('\n').map(z => JSON.parse(z)); } };
}
const BILD = { name: 'seite.png', type: 'image/png', data: 'iVBORw0KGgo=' };
process.env.BRIDGE_PASSCODE = 'geheim';

block('Eingabe prüfen');
pruefe('Unbekannter Modus → 400', (() => { try { baueInhalt({ modus: 'x', dateien: [BILD] }); } catch(e){ return e.status === 400; } })());
pruefe('Ohne Dateien → Fehler', (() => { try { baueInhalt({ modus: 'transkribieren', dateien: [] }); } catch(e){ return e.code === 'keine_dateien'; } })());
pruefe('Neue Seite braucht Wunsch', (() => { try { baueInhalt({ modus: 'schreiben' }); } catch(e){ return e.code === 'kein_wunsch'; } })());
pruefe('Neue Seite ohne Dateien erlaubt', baueInhalt({ modus: 'schreiben', frage: 'Lernblatt' }).length === 1);
pruefe('Falscher Typ → 415', (() => { try { baueInhalt({ modus: 'transkribieren', dateien: [{ type: 'text/html', data: 'AA==' }] }); } catch(e){ return e.status === 415; } })());
pruefe('Kaputtes Base64 → 400', (() => { try { baueInhalt({ modus: 'transkribieren', dateien: [{ type: 'image/png', data: '<script>' }] }); } catch(e){ return e.code === 'base64'; } })());
pruefe('Mehr als 20 Dateien → Fehler', (() => { try { baueInhalt({ modus: 'transkribieren', dateien: Array(21).fill(BILD) }); } catch(e){ return e.code === 'zu_viele'; } })());
const inh = baueInhalt({ modus: 'zusammenfassen', frage: 'kurz', dateien: [{ name: 'a.pdf', type: 'application/pdf', data: 'JVBERi0=' }, BILD] });
pruefe('PDF → document-Block', inh[0].type === 'document' && inh[0].source.media_type === 'application/pdf');
pruefe('Bild → image-Block', inh[1].type === 'image');
pruefe('Anweisung steht hinter den Dateien', inh[2].type === 'text' && inh[2].text.includes('kurz'));
pruefe('Alle Modi haben Anweisung und Aufwand', Object.values(MODI).every(m => m.anweisung && ['low','medium','high','xhigh','max'].includes(m.effort)));

block('Zugang & Rate');
pruefe('Richtiger Code', zugangOk({ headers: { 'x-bridge-code': 'geheim' } }));
pruefe('Falscher Code', !zugangOk({ headers: { 'x-bridge-code': 'falsch' } }));
pruefe('Ohne Code in Produktion gesperrt', !zugangOk({ headers: {} }, { VERCEL: '1' }));
pruefe('Ohne Code lokal offen', zugangOk({ headers: {} }, {}));
let durch = 0; for(let i = 0; i < 25; i++) if(ratenGrenze('test', 20, 60000, 1000 + i)) durch++;
pruefe('Ratenbegrenzung greift bei 20', durch === 20, durch);
pruefe('Fenster läuft ab', ratenGrenze('test', 20, 60000, 1000 + 60001));

block('Claude-Handler');
{
  const protokoll = [];
  const h = erstelleHandler(() => attrappe({ verzoegerung: 0, protokoll }));
  const res = antwort(); await h(anfrage({ modus: 'transkribieren', dateien: [BILD] }), res);
  const z = res.zeilen;
  pruefe('Status 200 + NDJSON', res.statusCode === 200 && res.kopf['content-type'].includes('ndjson'));
  pruefe('Text kommt vollständig an', z.filter(e => e.t === 'text').map(e => e.d).join('') === BEISPIEL);
  pruefe('Abschluss-Ereignis', z.at(-1).t === 'done' && z.at(-1).stop === 'end_turn');
  const p = protokoll[0];
  pruefe('Modell ist ' + MODEL, p.model === MODEL);
  pruefe('Fallbacks aktiv', p.fallbacks === 'default' && p.betas.includes('server-side-fallback-2026-07-01'));
  pruefe('Kein thinking/budget_tokens gesendet', !('thinking' in p) && !('temperature' in p));
  pruefe('Effort aus Modus', p.output_config.effort === MODI.transkribieren.effort);

  const r401 = antwort(); await h(anfrage({ modus: 'transkribieren', dateien: [BILD] }, { code: 'x' }), r401);
  pruefe('Falscher Code → 401', r401.statusCode === 401);
  const r405 = antwort(); await h(anfrage({}, { methode: 'GET' }), r405);
  pruefe('GET → 405', r405.statusCode === 405);
  const rjson = antwort(); await h(anfrage('{kaputt'), rjson);
  pruefe('Kaputtes JSON → 400', rjson.statusCode === 400);
  const rgross = antwort(); await h(anfrage({ modus: 'transkribieren', dateien: [{ ...BILD, data: 'A'.repeat(4_500_000) }] }), rgross);
  pruefe('Zu groß → 413', rgross.statusCode === 413, rgross.statusCode);

  const rref = antwort();
  await erstelleHandler(() => attrappe({ verzoegerung: 0, stop: 'refusal', text: '' }))(anfrage({ modus: 'fragen', frage: 'x', dateien: [BILD] }), rref);
  pruefe('Ablehnung wird gemeldet', rref.zeilen.at(-1).code === 'refusal');
  const rerr = antwort();
  await erstelleHandler(() => attrappe({ fehler: new Error('boom') }))(anfrage({ modus: 'fragen', frage: 'x', dateien: [BILD] }), rerr);
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
