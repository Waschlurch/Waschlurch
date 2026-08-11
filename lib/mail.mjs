/* ══════════════════════════════════════════════════════════════
   E-MAIL – Versand hinter einer austauschbaren Schnittstelle
   ══════════════════════════════════════════════════════════════
   Der Rest des Systems ruft nur `versende(...)`. Welcher Dienst
   dahintersteht, entscheidet allein diese Datei. Ein Wechsel zu
   Postmark oder Brevo betrifft genau eine Funktion.

   Kein Zählpixel, kein Öffnungs- und kein Klickzähler. „Vom Kunden
   geöffnet" wird ausschließlich daran festgemacht, dass die
   Bestätigungsseite tatsächlich aufgerufen wurde – eine Messung,
   die der Kunde selbst auslöst und die ohne heimliches Nachladen
   auskommt.
   ══════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';
import { holen, nurNeu, jetztIso } from './firestore.mjs';

const ABSENDER_VORGABE = 'angebote@waschlurch.com';
const ABSENDER_NAME = 'Waschlurch';

/* ── Anbieter: Resend ─────────────────────────────────────── */
async function sendeUeberResend({ an, betreff, html, text, anhaenge }){
  const schluessel = process.env.RESEND_KEY;
  if(!schluessel) throw new Error('RESEND_KEY ist nicht gesetzt. Siehe EINRICHTUNG.md, Schritt 3.');

  const absender = process.env.ABSENDER_MAIL || ABSENDER_VORGABE;
  const koerper = {
    from: `${ABSENDER_NAME} <${absender}>`,
    to: [an],
    subject: betreff,
    html, text,
  };
  if(anhaenge && anhaenge.length){
    koerper.attachments = anhaenge.map(a => ({ filename: a.name, content: a.base64 }));
  }

  const antwort = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ 'Authorization':'Bearer ' + schluessel, 'Content-Type':'application/json' },
    body: JSON.stringify(koerper),
  });
  const daten = await antwort.json().catch(() => ({}));
  if(!antwort.ok){
    throw new Error('Postausgang lehnte ab: ' + (daten.message || ('HTTP ' + antwort.status)));
  }
  return { anbieter:'resend', kennung: daten.id || null };
}

const ANBIETER = { resend: sendeUeberResend };

/* ══════════════════════════════════════════════════════════════
   VERSAND MIT DOPPELSCHUTZ
   ══════════════════════════════════════════════════════════════
   `idempotenzSchluessel` verhindert, dass ein wiederholter Lauf
   dieselbe Mail zweimal schickt. Die Marke wird VOR dem Versand
   gesetzt, nicht danach.

   ⚠️ Die Reihenfolge ist entscheidend und bewusst so gewählt:
   Setzte man die Marke erst nach erfolgreichem Versand, könnte
   zwischen Versand und Markieren ein zweiter Lauf starten – der
   Kunde bekäme die Erinnerung doppelt. Umgekehrt ist der
   schlimmste Fall, dass eine Mail bei einem Absturz ausfällt.
   Eine fehlende Erinnerung ist ärgerlich, eine doppelte Absage an
   denselben Kunden ist peinlich. */
export async function versende({ an, betreff, html, text, anhaenge, idempotenzSchluessel, zweck, bezug }){
  if(!an || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(an)){
    throw new Error('Keine gültige Empfängeradresse.');
  }

  const marke = idempotenzSchluessel
    ? crypto.createHash('sha256').update(idempotenzSchluessel).digest('hex').slice(0, 40)
    : null;

  if(marke){
    const frisch = await nurNeu('mail_ereignisse', marke, {
      zweck: zweck || 'unbekannt',
      empfaenger_hash: crypto.createHash('sha256').update(an).digest('hex').slice(0, 16),
      bezug_typ: (bezug && bezug.typ) || null,
      bezug_id: (bezug && bezug.id) || null,
      status: 'im_versand',
      zeitpunkt: jetztIso(),
    });
    if(!frisch){
      return { uebersprungen:true, grund:'Diese Nachricht wurde bereits versendet.' };
    }
  }

  const anbieterName = process.env.MAIL_ANBIETER || 'resend';
  const senden = ANBIETER[anbieterName];
  if(!senden) throw new Error('Unbekannter Postausgang: ' + anbieterName);

  const ergebnis = await senden({ an, betreff, html, text, anhaenge });

  if(marke){
    /* Der Erfolgsvermerk darf den Versand nicht gefährden – die
       Mail ist zu diesem Zeitpunkt bereits unterwegs. */
    try {
      const { setzen } = await import('./firestore.mjs');
      await setzen('mail_ereignisse', marke, {
        status:'versendet', anbieter_kennung: ergebnis.kennung, versendet_am: jetztIso(),
      });
    } catch(err){ console.error('Versandvermerk fehlgeschlagen:', err.message); }
  }
  return { uebersprungen:false, ...ergebnis };
}

/* ══════════════════════════════════════════════════════════════
   GESTALTUNG
   ══════════════════════════════════════════════════════════════
   Schwarz mit grünen Akzenten wie die Website, aber mit Tabellen
   statt Flexbox: Outlook rendert mit der Word-Engine und kennt
   weder Flex noch Grid. Eine Spalte, höchstens 600 px – das ist
   die Breite, die auf jedem Handy ohne Zoom lesbar bleibt. */
const GRUEN = '#22C55E';
const SCHWARZ = '#0A0A0A';

function entschaerfe(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function rahmen({ titel, vorschau, inhalt, knoepfe, fussnote }){
  const knopfHtml = (knoepfe || []).map(k => `
    <tr><td style="padding:5px 0">
      <a href="${entschaerfe(k.url)}" style="display:block;padding:15px 20px;border-radius:100px;
         background:${k.haupt ? GRUEN : 'rgba(255,255,255,0.08)'};
         color:${k.haupt ? '#FFFFFF' : '#E5E7EB'};
         border:1px solid ${k.haupt ? GRUEN : 'rgba(255,255,255,0.18)'};
         font-size:15px;font-weight:600;text-decoration:none;text-align:center;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${entschaerfe(k.text)}</a>
    </td></tr>`).join('');

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${entschaerfe(titel)}</title></head>
<body style="margin:0;padding:0;background:#F4F4F5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${entschaerfe(vorschau || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:600px;background:${SCHWARZ};border-radius:24px;overflow:hidden">
    <tr><td style="padding:28px 28px 0">
      <div style="font-size:21px;font-weight:700;color:#FFFFFF;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Waschlurch</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.55);margin-top:3px;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Reinigung und Hausmeisterservice</div>
      <div style="height:2px;background:${GRUEN};margin:16px 0 0;border-radius:2px"></div>
    </td></tr>
    <tr><td style="padding:24px 28px;color:#E5E7EB;font-size:15px;line-height:1.7;
                   font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      ${inhalt}
    </td></tr>
    ${knopfHtml ? `<tr><td style="padding:0 28px 8px"><table role="presentation" width="100%">${knopfHtml}</table></td></tr>` : ''}
    <tr><td style="padding:20px 28px 28px;border-top:1px solid rgba(255,255,255,0.08)">
      <div style="font-size:12px;line-height:1.6;color:rgba(255,255,255,0.42);
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
        ${fussnote ? entschaerfe(fussnote) + '<br><br>' : ''}
        Waschlurch · Daniel Lurch · 53783 Eitorf<br>
        <a href="https://waschlurch.com/impressum.html" style="color:rgba(255,255,255,0.55)">Impressum</a> ·
        <a href="https://waschlurch.com/datenschutz.html" style="color:rgba(255,255,255,0.55)">Datenschutz</a><br><br>
        Diese Nachricht gehört zu Ihrer Anfrage. Sie ist keine Werbung.
      </div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/* Reintext-Fassung. Nicht optional: Mailprogramme mit abgeschalteter
   HTML-Anzeige zeigen sonst eine leere Nachricht, und
   Spamfilter bewerten fehlenden Reintext negativ. */
export function alsText({ titel, absaetze, knoepfe, fussnote }){
  const zeilen = [titel, ''.padEnd(titel.length, '='), ''];
  (absaetze || []).forEach(a => { zeilen.push(a, ''); });
  (knoepfe || []).forEach(k => zeilen.push(k.text + ':', '  ' + k.url, ''));
  if(fussnote) zeilen.push('', fussnote);
  zeilen.push('', 'Waschlurch · Daniel Lurch · 53783 Eitorf',
              'https://waschlurch.com/impressum.html');
  return zeilen.join('\n');
}

export const html = { entschaerfe };
