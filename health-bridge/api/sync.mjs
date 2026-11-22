/* POST /api/sync – nimmt Daten vom iPhone an (Health Auto Export oder Kurzbefehl).
   Zugang: Authorization: Bearer <PULS_TOKEN>, Kopfzeile x-puls-token oder ?key=<PULS_TOKEN>. */

import { antworte, tokenOk, koerperLesen, ratenGrenze, absender } from '../lib/guard.mjs';
import { lesen } from '../lib/import.mjs';
import { speichern } from '../lib/abfragen.mjs';

export default async function handler(req, res){
  if(req.method !== 'POST') return antworte(res, 405, { code: 'methode', message: 'Nur POST.' }, { Allow: 'POST' });
  if(!ratenGrenze('sync:' + absender(req), 120)) return antworte(res, 429, { code: 'zu_oft', message: 'Zu viele Anfragen.' });
  if(!tokenOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Token fehlt oder ist falsch.' });
  try {
    const nutzlast = await koerperLesen(req);
    const aus = lesen(nutzlast);
    const gespeichert = await speichern(aus);
    return antworte(res, 200, { ok: true, ...gespeichert });
  } catch(e){
    if(e.status && e.status < 500) return antworte(res, e.status, { code: e.message, message: e.message === 'zu_gross' ? 'Zu groß – im Export kleinere Zeiträume oder Tageswerte wählen.' : 'Ungültige Daten.' });
    console.error('[sync]', e);
    return antworte(res, e.status || 500, { code: e.code || 'fehler', message: e.code === 'keine_datenbank' ? 'DATABASE_URL fehlt.' : 'Speichern fehlgeschlagen.' });
  }
}
