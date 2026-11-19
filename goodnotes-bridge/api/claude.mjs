/* POST /api/claude – Goodnotes-Seiten an Claude geben, Antwort streamen.

   Körper: { modus, frage?, dateien: [{ name, type, data(base64) }] }
   Antwort: NDJSON-Strom, eine Zeile pro Ereignis:
     { t:'text', d:'…' }                         Textstück
     { t:'done', stop, model, usage }            fertig
     { t:'error', code, message }                Fehler                */

import Anthropic from '@anthropic-ai/sdk';
import { MODEL, MODI, systemPrompt, nutzerText } from '../lib/prompts.mjs';
import { antworte, zugangOk, ratenGrenze, absender, koerperLesen } from '../lib/guard.mjs';

export const config = { maxDuration: 300 };

const ERLAUBT = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_DATEIEN = 20;

/** Prüft die Eingabe und baut die Inhaltsblöcke. Wirft {status, code}. */
export function baueInhalt({ modus, frage, dateien }){
  if(!MODI[modus]) throw Object.assign(new Error('Unbekannter Modus.'), { status: 400, code: 'modus' });
  const liste = Array.isArray(dateien) ? dateien : [];
  if(modus !== 'schreiben' && liste.length === 0)
    throw Object.assign(new Error('Bitte mindestens eine Goodnotes-Seite hinzufügen.'), { status: 400, code: 'keine_dateien' });
  if(modus === 'schreiben' && !String(frage || '').trim())
    throw Object.assign(new Error('Beschreibe kurz, welche Seite entstehen soll.'), { status: 400, code: 'kein_wunsch' });
  if(liste.length > MAX_DATEIEN)
    throw Object.assign(new Error(`Höchstens ${MAX_DATEIEN} Dateien pro Durchgang.`), { status: 400, code: 'zu_viele' });
  if(String(frage || '').length > 4000)
    throw Object.assign(new Error('Der Zusatzwunsch ist zu lang.'), { status: 400, code: 'frage_lang' });

  const bloecke = [];
  for(const d of liste){
    const type = String(d?.type || '');
    const data = String(d?.data || '');
    if(!ERLAUBT.has(type))
      throw Object.assign(new Error(`Dateityp nicht unterstützt: ${type || 'unbekannt'}`), { status: 415, code: 'typ' });
    if(!/^[A-Za-z0-9+/]+=*$/.test(data))
      throw Object.assign(new Error('Datei beschädigt.'), { status: 400, code: 'base64' });
    const source = { type: 'base64', media_type: type, data };
    bloecke.push(type === 'application/pdf'
      ? { type: 'document', source, title: String(d.name || 'Goodnotes').slice(0, 200) }
      : { type: 'image', source });
  }
  bloecke.push({ type: 'text', text: nutzerText(modus, frage) });
  return bloecke;
}

export function erstelleHandler(clientFabrik = () => new Anthropic()){
  return async function handler(req, res){
    if(req.method !== 'POST') return antworte(res, 405, { code: 'methode', message: 'Nur POST.' });
    if(!zugangOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Zugangscode fehlt oder ist falsch.' });
    if(!ratenGrenze(absender(req))) return antworte(res, 429, { code: 'rate', message: 'Zu viele Anfragen. Bitte kurz warten.' });

    let inhalt, koerper;
    try {
      koerper = await koerperLesen(req);
      inhalt = baueInhalt(koerper);
    } catch(e){
      const zuGross = e.status === 413;
      return antworte(res, e.status || 400, {
        code: e.code || (zuGross ? 'zu_gross' : 'eingabe'),
        message: zuGross ? 'Die Seiten sind zusammen zu groß. Weniger Seiten auf einmal senden.' : e.message,
      });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    const sende = obj => res.write(JSON.stringify(obj) + '\n');

    let stream;
    req.on('close', () => { if(!res.writableEnded) stream?.abort(); });

    try {
      const client = clientFabrik();
      stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: MODI[koerper.modus].effort },
        system: systemPrompt(),
        messages: [{ role: 'user', content: inhalt }],
      });
      stream.on('text', d => sende({ t: 'text', d }));
      const msg = await stream.finalMessage();
      if(msg.stop_reason === 'refusal'){
        sende({ t: 'error', code: 'refusal', message: 'Claude hat diese Anfrage abgelehnt.' });
      } else {
        sende({ t: 'done', stop: msg.stop_reason, model: msg.model, usage: msg.usage });
      }
    } catch(e){
      sende({ t: 'error', ...fehlerText(e) });
    }
    res.end();
  };
}

export function fehlerText(e){
  if(e instanceof Anthropic.AuthenticationError) return { code: 'api_key', message: 'Der Anthropic-API-Schlüssel auf dem Server fehlt oder ist ungültig.' };
  if(e instanceof Anthropic.RateLimitError) return { code: 'api_rate', message: 'Claude ist gerade ausgelastet. In einer Minute erneut versuchen.' };
  if(e instanceof Anthropic.BadRequestError) return { code: 'api_eingabe', message: 'Claude konnte die Dateien nicht lesen (zu groß oder beschädigt?).' };
  if(e instanceof Anthropic.APIUserAbortError) return { code: 'abbruch', message: 'Abgebrochen.' };
  if(e instanceof Anthropic.APIConnectionError) return { code: 'netz', message: 'Keine Verbindung zu Claude.' };
  if(e instanceof Anthropic.APIError) return { code: 'api', message: `Claude-Fehler (${e.status ?? '?'}).` };
  return { code: 'intern', message: 'Unerwarteter Fehler auf dem Server.' };
}

export default erstelleHandler();
