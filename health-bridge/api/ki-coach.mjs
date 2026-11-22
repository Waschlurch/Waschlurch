/* GET  /api/ki-coach – letzter KI-Bericht.
   POST /api/ki-coach – neuen Bericht erstellen: Claude bewertet alle Daten wie ein Bodybuilding-Coach.
   Zugang: x-puls-code. Benötigt ANTHROPIC_API_KEY. */

import Anthropic from '@anthropic-ai/sdk';
import { antworte, passcodeOk, ratenGrenze, absender } from '../lib/guard.mjs';
import { db } from '../lib/db.mjs';
import { basisLaden } from '../lib/abfragen.mjs';
import { laden as protokollLaden } from '../lib/protokoll.mjs';
import { laden as einstellungenLaden } from '../lib/einstellungen.mjs';
import { basisBereich } from '../lib/bodybuilding.mjs';
import { analyse } from '../kern/analyse.mjs';
import { KI_ANWEISUNG, KI_SCHEMA, kiKontext, kiAufgabe, kiPruefen } from '../kern/ki.mjs';
import { lokalerTag } from '../lib/zeit.mjs';

export const MODEL = 'claude-opus-5-5';

async function letzter(){
  const { q } = await db();
  const r = (await q('select tag::text as tag, erstellt, modell, inhalt from ki_berichte order by id desc limit 1'))[0];
  return r ? { tag: r.tag, erstellt: new Date(r.erstellt).toISOString(), modell: r.modell, bericht: typeof r.inhalt === 'string' ? JSON.parse(r.inhalt) : r.inhalt } : null;
}

/** Ein Aufruf an Claude: strukturierte Ausgabe, Fallback bei Ablehnung, Systemanweisung im Cache. */
export async function berichtErstellen(client, kontext){
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: KI_SCHEMA } },
    system: [{ type: 'text', text: KI_ANWEISUNG, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: kiAufgabe(kontext) }],
  });
  const msg = await stream.finalMessage();
  if(msg.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { code: 'ki_abgelehnt' });
  if(msg.stop_reason === 'max_tokens') throw Object.assign(new Error('max_tokens'), { code: 'ki_zu_lang' });
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let roh; try { roh = JSON.parse(text); } catch { throw Object.assign(new Error('kein JSON'), { code: 'ki_format' }); }
  return { bericht: kiPruefen(roh), modell: msg.model };
}

export function erstelleHandler(clientFabrik = () => new Anthropic()){
  return async function handler(req, res){
    if(!['GET', 'POST'].includes(req.method)) return antworte(res, 405, { code: 'methode', message: 'Nur GET oder POST.' }, { Allow: 'GET, POST' });
    if(!passcodeOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Zugangscode fehlt oder ist falsch.' });
    try {
      if(req.method === 'GET') return antworte(res, 200, { letzter: await letzter(), verfuegbar: !!process.env.ANTHROPIC_API_KEY || !!process.env.PULS_KI_ATTRAPPE });
      if(!ratenGrenze('ki:' + absender(req), 8, 60 * 60_000)) return antworte(res, 429, { code: 'zu_oft', message: 'Höchstens 8 KI-Analysen pro Stunde.' });
      if(!process.env.ANTHROPIC_API_KEY && !process.env.PULS_KI_ATTRAPPE) return antworte(res, 503, { code: 'ki_fehlt', message: 'Für den KI-Coach fehlt ANTHROPIC_API_KEY in den Umgebungsvariablen.' });
      const bis = lokalerTag(new Date());
      const e = await einstellungenLaden();
      const b = basisBereich({ von: bis, bis }, e);
      const [basis, prot] = await Promise.all([basisLaden(b), protokollLaden(b)]);
      const an = analyse(basis, e, prot, bis);
      const { bericht, modell } = await berichtErstellen(clientFabrik(), kiKontext({ basis, einstellungen: e, protokoll: prot, analyse: an, bis }));
      const { q } = await db();
      await q('insert into ki_berichte (tag, modell, inhalt) values ($1::date, $2, $3::jsonb)', [bis, modell, JSON.stringify(bericht)]);
      return antworte(res, 200, { letzter: { tag: bis, erstellt: new Date().toISOString(), modell, bericht } });
    } catch(err){
      if(err instanceof Anthropic.AuthenticationError) return antworte(res, 503, { code: 'ki_schluessel', message: 'Der Anthropic-API-Schlüssel ist ungültig.' });
      if(err instanceof Anthropic.RateLimitError) return antworte(res, 429, { code: 'ki_limit', message: 'Claude ist gerade ausgelastet – bitte in einer Minute erneut versuchen.' });
      if(err instanceof Anthropic.APIError) { console.error('[ki-coach]', err.status, err.message); return antworte(res, 502, { code: 'ki_fehler', message: 'Claude war nicht erreichbar. Bitte später erneut versuchen.' }); }
      const text = { ki_abgelehnt: 'Claude hat diese Analyse abgelehnt.', ki_zu_lang: 'Die Antwort war zu lang – bitte erneut versuchen.', ki_format: 'Die Antwort hatte ein unerwartetes Format – bitte erneut versuchen.' }[err.code];
      if(text) return antworte(res, 502, { code: err.code, message: text });
      console.error('[ki-coach]', err);
      return antworte(res, 500, { code: 'fehler', message: 'Die KI-Analyse konnte nicht erstellt werden.' });
    }
  };
}

export default erstelleHandler();
