/* /api/fotos – Form-Check-Fotos.
   GET            Liste (ohne Bilder) + letzter KI-Form-Check
   GET ?id=N      Bild (JPEG)
   POST           { tag, pose, notiz, daten: "data:image/jpeg;base64,…", breite, hoehe }
   POST ?check=1  { ids? } → KI-Form-Check (Claude sieht die Fotos und deine Körperdaten)
   DELETE ?id=N
   Zugang: x-puls-code. */
import Anthropic from '@anthropic-ai/sdk';
import { antworte, passcodeOk, koerperLesen, ratenGrenze, absender } from '../lib/guard.mjs';
import { liste, bild, speichern, loeschen, auswahlFuerCheck, letzterCheck, checkSpeichern, POSEN } from '../lib/fotos.mjs';
import { laden as einstellungenLaden } from '../lib/einstellungen.mjs';
import { bodybuilding } from '../lib/bodybuilding.mjs';
import { zeitraum } from '../lib/abfragen.mjs';
import { FORM_ANWEISUNG, FORM_SCHEMA, formKontext, formPruefen } from '../kern/ki.mjs';
import { MODEL } from './ki-coach.mjs';

export async function formCheckErstellen(client, fotos, kontextText){
  const content = [{ type: 'text', text: kontextText }];
  fotos.forEach((f, i) => { content.push({ type: 'text', text: `Bild ${i + 1}: ${f.pose}, ${f.tag}` }); content.push({ type: 'image', source: { type: 'base64', media_type: f.mime, data: f.daten.toString('base64') } }); });
  content.push({ type: 'text', text: 'Erstelle den Form-Check.' });
  const msg = await client.beta.messages.stream({
    model: MODEL, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: FORM_SCHEMA } },
    system: [{ type: 'text', text: FORM_ANWEISUNG, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  }).finalMessage();
  if(msg.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { code: 'ki_abgelehnt' });
  if(msg.stop_reason === 'max_tokens') throw Object.assign(new Error('max_tokens'), { code: 'ki_zu_lang' });
  let roh; try { roh = JSON.parse(msg.content.filter(b => b.type === 'text').map(b => b.text).join('')); } catch { throw Object.assign(new Error('kein JSON'), { code: 'ki_format' }); }
  return { check: formPruefen(roh), modell: msg.model };
}

export function erstelleHandler(clientFabrik = () => new Anthropic()){
  return async function handler(req, res){
    if(!passcodeOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Zugangscode fehlt oder ist falsch.' });
    if(!ratenGrenze('fotos:' + absender(req), 300)) return antworte(res, 429, { code: 'zu_oft', message: 'Zu viele Anfragen.' });
    const u = new URL(req.url, 'http://x'), id = u.searchParams.get('id');
    try {
      if(req.method === 'GET' && id){
        const b = await bild(id); if(!b) return antworte(res, 404, { code: 'fehlt', message: 'Foto nicht gefunden.' });
        res.statusCode = 200; res.setHeader('Content-Type', b.mime); res.setHeader('Cache-Control', 'private, max-age=86400'); return res.end(b.daten);
      }
      if(req.method === 'GET') return antworte(res, 200, { fotos: await liste(), posen: POSEN, letzter_check: await letzterCheck(), ki: !!process.env.ANTHROPIC_API_KEY || !!process.env.PULS_KI_ATTRAPPE });
      if(req.method === 'DELETE' && id){ await loeschen(id); return antworte(res, 200, { ok: true }); }
      if(req.method === 'POST' && u.searchParams.get('check')){
        if(!ratenGrenze('form:' + absender(req), 6, 60 * 60_000)) return antworte(res, 429, { code: 'zu_oft', message: 'Höchstens 6 Form-Checks pro Stunde.' });
        if(!process.env.ANTHROPIC_API_KEY && !process.env.PULS_KI_ATTRAPPE) return antworte(res, 503, { code: 'ki_fehlt', message: 'Für den KI-Form-Check fehlt ANTHROPIC_API_KEY.' });
        const k = await koerperLesen(req, 10_000).catch(() => ({}));
        const fotos = await auswahlFuerCheck(k.ids);
        if(!fotos.length) return antworte(res, 400, { code: 'keine_fotos', message: 'Lade zuerst mindestens ein Foto hoch.' });
        const e = await einstellungenLaden(); const bb = await bodybuilding(zeitraum({ tage: 28 }), e);
        const { check, modell } = await formCheckErstellen(clientFabrik(), fotos, formKontext({ profil: e.profil, phase: bb.phase.titel, fotos,
          koerper: { groesse_cm: bb.koerper.groesse_cm, gewicht_kg: bb.gewicht.aktuell_trend_kg, koerperfett_waage: bb.koerper.koerperfett_prozent, ffmi: bb.koerper.ffmi } }));
        await checkSpeichern(fotos.map(f => f.id), modell, check);
        return antworte(res, 200, { letzter_check: await letzterCheck() });
      }
      if(req.method === 'POST') return antworte(res, 200, { foto: await speichern(await koerperLesen(req, 4_300_000)) });
      return antworte(res, 405, { code: 'methode', message: 'GET, POST oder DELETE.' }, { Allow: 'GET, POST, DELETE' });
    } catch(err){
      if(err.status && err.status < 500) return antworte(res, err.status, { code: err.message, message: err.message === 'zu_gross' ? 'Foto zu groß (max. 3 MB).' : 'Ungültiges Foto.' });
      if(err instanceof Anthropic.APIError){ console.error('[fotos]', err.status, err.message); return antworte(res, 502, { code: 'ki_fehler', message: 'Claude war nicht erreichbar. Bitte später erneut versuchen.' }); }
      if(err.code?.startsWith?.('ki_')) return antworte(res, 502, { code: err.code, message: err.code === 'ki_abgelehnt' ? 'Claude hat diesen Form-Check abgelehnt.' : 'Die Antwort war unvollständig – bitte erneut versuchen.' });
      console.error('[fotos]', err);
      return antworte(res, 500, { code: 'fehler', message: 'Fotos konnten nicht verarbeitet werden.' });
    }
  };
}
export default erstelleHandler();
