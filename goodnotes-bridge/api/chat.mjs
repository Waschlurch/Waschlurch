/* POST /api/chat – ein Zug im Gespräch mit Claude.

   Der Server hält nichts fest. Der Browser schickt den bisherigen
   Verlauf, der Server gibt ihn an Claude weiter und streamt zurück:

     { t:'text',  d:'…' }                      Textstück
     { t:'zug',   content, stop }              vollständige Antwort
     { t:'error', code, message }

   Will Claude ein Werkzeug benutzen, endet der Zug mit stop='tool_use'.
   Die Werkzeuge führt der Browser aus (dort liegt die Bibliothek) und
   schickt das Ergebnis als neuen Zug zurück. Die Dateien selbst kommen
   damit nie vollständig auf den Server. */

import Anthropic from '@anthropic-ai/sdk';
import { MODEL, MODI, systemPrompt } from '../lib/prompts.mjs';
import { WERKZEUGE } from '../lib/werkzeuge.mjs';
import { antworte, zugangOk, ratenGrenze, absender, koerperLesen } from '../lib/guard.mjs';

export const config = { maxDuration: 60 };

const ROLLEN = new Set(['user', 'assistant']);
const BLOECKE = new Set(['text', 'image', 'document', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking', 'fallback']);
const MAX_NACHRICHTEN = 400;

/** Prüft den Verlauf, bevor er an Claude geht. Wirft {status, code}. */
export function pruefeVerlauf(messages){
  const fehler = (message, code = 'verlauf') => { throw Object.assign(new Error(message), { status: 400, code }); };
  if(!Array.isArray(messages) || !messages.length) fehler('Kein Gesprächsverlauf übergeben.');
  if(messages.length > MAX_NACHRICHTEN) fehler('Das Gespräch ist zu lang. Bitte ein neues beginnen.', 'zu_lang');
  for(const n of messages){
    if(!n || !ROLLEN.has(n.role)) fehler('Ungültige Rolle im Verlauf.');
    if(typeof n.content === 'string'){ if(!n.content) fehler('Leere Nachricht im Verlauf.'); continue; }
    if(!Array.isArray(n.content) || !n.content.length) fehler('Ungültiger Inhalt im Verlauf.');
    for(const b of n.content) if(!b || !BLOECKE.has(b.type)) fehler(`Unbekannter Block: ${b?.type}`);
  }
  if(messages.at(-1).role !== 'user') fehler('Der letzte Zug muss vom Nutzer kommen.');
  return messages;
}

export function erstelleHandler(clientFabrik = () => new Anthropic()){
  return async function handler(req, res){
    if(req.method !== 'POST') return antworte(res, 405, { code: 'methode', message: 'Nur POST.' });
    if(!zugangOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Zugangscode fehlt oder ist falsch.' });
    if(!ratenGrenze(absender(req), 60)) return antworte(res, 429, { code: 'rate', message: 'Zu viele Anfragen. Bitte kurz warten.' });

    let koerper, messages;
    try {
      koerper = await koerperLesen(req);
      messages = pruefeVerlauf(koerper.messages);
    } catch(e){
      const zuGross = e.status === 413;
      return antworte(res, e.status || 400, {
        code: e.code || (zuGross ? 'zu_gross' : 'eingabe'),
        message: zuGross ? 'Die angeforderten Seiten sind zusammen zu groß. Bitte weniger Seiten auf einmal lesen lassen.' : e.message,
      });
    }

    const effort = MODI[koerper.modus]?.effort || 'high';

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    const sende = obj => res.write(JSON.stringify(obj) + '\n');

    let stream;
    req.on('close', () => { if(!res.writableEnded) stream?.abort(); });

    try {
      stream = clientFabrik().beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort },
        system: systemPrompt(),
        tools: WERKZEUGE,
        messages,
      });
      stream.on('text', d => sende({ t: 'text', d }));
      const msg = await stream.finalMessage();
      if(msg.stop_reason === 'refusal') sende({ t: 'error', code: 'refusal', message: 'Claude hat diese Anfrage abgelehnt.' });
      else sende({ t: 'zug', content: msg.content, stop: msg.stop_reason, model: msg.model, usage: msg.usage });
    } catch(e){
      sende({ t: 'error', ...fehlerText(e) });
    }
    res.end();
  };
}

export function fehlerText(e){
  if(e instanceof Anthropic.AuthenticationError) return { code: 'api_key', message: 'Der Anthropic-API-Schlüssel auf dem Server fehlt oder ist ungültig.' };
  if(e instanceof Anthropic.RateLimitError) return { code: 'api_rate', message: 'Claude ist gerade ausgelastet. In einer Minute erneut versuchen.' };
  if(e instanceof Anthropic.BadRequestError) return { code: 'api_eingabe', message: 'Claude konnte die Anfrage nicht verarbeiten (zu viele oder zu große Seiten?).' };
  if(e instanceof Anthropic.APIUserAbortError) return { code: 'abbruch', message: 'Abgebrochen.' };
  if(e instanceof Anthropic.APIConnectionError) return { code: 'netz', message: 'Keine Verbindung zu Claude.' };
  if(e instanceof Anthropic.APIError) return { code: 'api', message: `Claude-Fehler (${e.status ?? '?'}).` };
  return { code: 'intern', message: 'Unerwarteter Fehler auf dem Server.' };
}

export default erstelleHandler();
