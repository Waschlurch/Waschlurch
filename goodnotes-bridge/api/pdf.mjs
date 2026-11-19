/* POST /api/pdf – Markdown in ein Goodnotes-fertiges PDF verwandeln.
   Körper: { markdown, titel?, format?, muster?, thema?, rand? }        */

import { pdfBuffer } from '../lib/markdown-pdf.mjs';
import { antworte, zugangOk, ratenGrenze, absender, koerperLesen } from '../lib/guard.mjs';

const MAX_ZEICHEN = 300_000;

export function dateiname(titel){
  const s = String(titel || 'Goodnotes-Seite')
    .replace(/[ä]/g, 'ae').replace(/[ö]/g, 'oe').replace(/[ü]/g, 'ue')
    .replace(/[Ä]/g, 'Ae').replace(/[Ö]/g, 'Oe').replace(/[Ü]/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 80);
  return (s || 'Goodnotes-Seite') + '.pdf';
}

export default async function handler(req, res){
  if(req.method !== 'POST') return antworte(res, 405, { code: 'methode', message: 'Nur POST.' });
  if(!zugangOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Zugangscode fehlt oder ist falsch.' });
  if(!ratenGrenze('pdf:' + absender(req), 60)) return antworte(res, 429, { code: 'rate', message: 'Zu viele PDFs. Kurz warten.' });

  let k;
  try { k = await koerperLesen(req, 1_000_000); }
  catch(e){ return antworte(res, e.status || 400, { code: 'eingabe', message: 'Ungültige Anfrage.' }); }

  const md = String(k.markdown || '');
  if(!md.trim()) return antworte(res, 400, { code: 'leer', message: 'Kein Inhalt für das PDF.' });
  if(md.length > MAX_ZEICHEN) return antworte(res, 413, { code: 'zu_lang', message: 'Inhalt zu lang für ein PDF.' });

  try {
    const pdf = await pdfBuffer(md, { titel: k.titel, format: k.format, muster: k.muster, thema: k.thema, rand: k.rand });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${dateiname(k.titel)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdf);
  } catch {
    antworte(res, 500, { code: 'pdf', message: 'PDF konnte nicht erzeugt werden.' });
  }
}
