/* GET /api/protokoll?von&bis · PUT {tag, cheat, tagtyp, notiz} – Zugang: x-puls-code. */
import { antworte, passcodeOk, koerperLesen, ratenGrenze, absender } from '../lib/guard.mjs';
import { laden, speichern } from '../lib/protokoll.mjs';
import { zeitraum } from '../lib/abfragen.mjs';

export default async function handler(req, res){
  if(!['GET', 'PUT'].includes(req.method)) return antworte(res, 405, { code: 'methode', message: 'Nur GET oder PUT.' }, { Allow: 'GET, PUT' });
  if(!ratenGrenze('prot:' + absender(req), 120)) return antworte(res, 429, { code: 'zu_oft', message: 'Zu viele Anfragen.' });
  if(!passcodeOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Zugangscode fehlt oder ist falsch.' });
  try {
    if(req.method === 'PUT') return antworte(res, 200, { eintrag: await speichern(await koerperLesen(req, 10_000)) });
    const u = new URL(req.url, 'http://x');
    return antworte(res, 200, { eintraege: await laden(zeitraum({ von: u.searchParams.get('von'), bis: u.searchParams.get('bis') }, 90, 800)) });
  } catch(e){
    if(e.status && e.status < 500) return antworte(res, e.status, { code: 'ungueltig', message: 'Ungültiger Eintrag.' });
    console.error('[protokoll]', e);
    return antworte(res, 500, { code: 'fehler', message: 'Protokoll konnte nicht gespeichert werden.' });
  }
}
