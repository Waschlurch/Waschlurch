/* GET/PUT /api/einstellungen – Vorlage, Kacheln, Bereiche, Ziele. Zugang: x-puls-code. */

import { antworte, passcodeOk, koerperLesen, ratenGrenze, absender } from '../lib/guard.mjs';
import { laden, speichern, VORLAGEN, KACHELN, BEREICH_TITEL, PHASEN } from '../lib/einstellungen.mjs';

export default async function handler(req, res){
  if(!['GET', 'PUT'].includes(req.method)) return antworte(res, 405, { code: 'methode', message: 'Nur GET oder PUT.' }, { Allow: 'GET, PUT' });
  if(!ratenGrenze('einst:' + absender(req), 60)) return antworte(res, 429, { code: 'zu_oft', message: 'Zu viele Anfragen.' });
  if(!passcodeOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Zugangscode fehlt oder ist falsch.' });
  try {
    const einstellungen = req.method === 'PUT' ? await speichern(await koerperLesen(req, 50_000)) : await laden();
    return antworte(res, 200, { einstellungen, vorlagen: VORLAGEN, kacheln: KACHELN, bereiche: BEREICH_TITEL, phasen: PHASEN });
  } catch(e){
    if(e.status && e.status < 500) return antworte(res, e.status, { code: e.message, message: 'Ungültige Daten.' });
    console.error('[einstellungen]', e);
    return antworte(res, 500, { code: 'fehler', message: 'Einstellungen konnten nicht gespeichert werden.' });
  }
}
