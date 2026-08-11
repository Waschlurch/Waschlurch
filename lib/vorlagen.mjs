/* ══════════════════════════════════════════════════════════════
   E-MAIL-VORLAGEN
   ══════════════════════════════════════════════════════════════
   Jede Vorlage liefert Betreff, HTML und Reintext.

   ⚠️ Die Knöpfe in der E-Mail lösen NICHTS aus. Sie führen auf
   eine Bestätigungsseite; erst der Knopf dort wirkt. Das ist keine
   Bequemlichkeitsfrage: Virenscanner, Vorschaudienste und
   Sicherheitsgateways öffnen jeden Link in einer eingehenden Mail
   automatisch. Löste der bloße Aufruf die Aktion aus, hätte der
   Scanner des Kunden die Kalkulation abgelehnt, bevor der Kunde
   sie überhaupt gesehen hat.
   ══════════════════════════════════════════════════════════════ */

import { rahmen, alsText, html } from './mail.mjs';

const e = html.entschaerfe;
const SEITE = 'https://waschlurch.com';

/* Der Token steht im ADRESS-FRAGMENT (hinter #), nicht als
   Abfrageparameter. Fragmente werden vom Browser nie an den Server
   gesendet – damit landet das Token weder in Vercels Zugriffslisten
   noch in einem Verweis-Kopf, wenn der Kunde von der Seite
   weiterklickt. */
function aktionsLink(token, aktion){
  return `${SEITE}/aktion.html#t=${encodeURIComponent(token)}&a=${encodeURIComponent(aktion)}`;
}

function geld(cent){
  const z = Number(cent) || 0;
  return (z / 100).toLocaleString('de-DE', { style:'currency', currency:'EUR' });
}
function datum(iso){
  if(!iso) return '';
  return new Date(iso).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });
}
function anrede(vk){
  const name = [vk.vorname, vk.nachname].filter(Boolean).join(' ').trim();
  return name ? `Guten Tag ${e(name)},` : 'Guten Tag,';
}

/* Zeile für Zeile aufgebaut statt in einer Schleife über alle
   Felder – so kann kein internes Feld (Gewinn, Kosten, Marge)
   versehentlich in die Kundenmail geraten. */
function eckdaten(paare){
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
            style="margin:16px 0;border:1px solid rgba(255,255,255,0.1);border-radius:14px">
    ${paare.filter(Boolean).map(([bez, wert], i) => `
      <tr>
        <td style="padding:11px 15px;font-size:13px;color:rgba(255,255,255,0.55);
                   ${i ? 'border-top:1px solid rgba(255,255,255,0.07)' : ''}">${e(bez)}</td>
        <td style="padding:11px 15px;font-size:14px;color:#FFFFFF;text-align:right;font-weight:600;
                   ${i ? 'border-top:1px solid rgba(255,255,255,0.07)' : ''}">${e(wert)}</td>
      </tr>`).join('')}
  </table>`;
}

function hinweisKasten(text){
  return `<div style="margin:18px 0;padding:15px 17px;border-radius:14px;
    background:rgba(250,204,21,0.09);border:1px solid rgba(250,204,21,0.3);
    font-size:13.5px;line-height:1.65;color:#FDE047">${e(text)}</div>`;
}

/* ══════════════════════════════════════════════════════════════
   1. Vorabkalkulation freigegeben und versendet
   ══════════════════════════════════════════════════════════════ */
export function vorabkalkulation(vk, token, texte){
  const k = vk.kalkulation || {};
  const bis = new Date(Date.now() + (Number(texte.vormerkungTage) || 14) * 86400000).toISOString();

  const betragZeile = k.spanne
    ? ['Voraussichtlich', geld(k.spanne.von_cent) + ' – ' + geld(k.spanne.bis_cent)]
    : ['Gesamtbetrag', geld(vk.brutto_gesamt_cent)];

  const knoepfe = [
    { text:'Besprechungstermin vereinbaren', url: aktionsLink(token, 'termin'), haupt:true },
    { text:'14 Tage vormerken',              url: aktionsLink(token, 'vormerken') },
    { text:'Änderung anfragen',              url: aktionsLink(token, 'aenderung') },
    { text:'Angaben korrigieren',            url: aktionsLink(token, 'korrektur') },
    { text:'Kein Interesse',                 url: aktionsLink(token, 'kein_interesse') },
  ];

  const inhalt = `
    <p style="margin:0 0 14px">${anrede(vk)}</p>
    <p style="margin:0 0 14px">vielen Dank für Ihre Anfrage. Auf Grundlage Ihrer Angaben haben wir
    eine <strong>unverbindliche Vorabkalkulation</strong> für Sie erstellt.</p>
    ${eckdaten([
      ['Kalkulation', vk.nummer],
      ['Leistungen', vk.leistungen_text || '–'],
      k.arbeitsstunden ? ['Geschätzter Aufwand', k.arbeitsstunden.toFixed(1).replace('.',',') + ' Stunden'] : null,
      betragZeile,
      ['Vorgemerkt bis', datum(bis)],
    ])}
    ${hinweisKasten(texte.unverbindlich)}
    ${vk.datenabgleich ? `<p style="margin:0 0 14px;font-size:13px;color:rgba(255,255,255,0.55)">${e(texte.abgleich)}</p>` : ''}
    ${(vk.einstufung && vk.einstufung.besichtigung_noetig)
      ? `<p style="margin:0 0 14px">Wegen des Umfangs beziehungsweise der örtlichen Gegebenheiten
         sehen wir vor einem verbindlichen Angebot eine kurze Besichtigung vor.</p>` : ''}
    <p style="margin:18px 0 8px;font-weight:600;color:#FFFFFF">Wie möchten Sie weitermachen?</p>
    <p style="margin:0 0 4px;font-size:13px;color:rgba(255,255,255,0.55)">
      Ein Klick öffnet zunächst nur eine Übersichtsseite. Erst dort bestätigen Sie Ihre Auswahl.</p>`;

  return {
    betreff: `Ihre unverbindliche Vorabkalkulation ${vk.nummer}`,
    html: rahmen({
      titel:'Ihre Vorabkalkulation', vorschau:`Vorabkalkulation ${vk.nummer} – unverbindlich`,
      inhalt, knoepfe,
      fussnote:'Diese Vorabkalkulation ist unverbindlich. Ein Vertrag kommt dadurch nicht zustande.',
    }),
    text: alsText({
      titel:`Ihre unverbindliche Vorabkalkulation ${vk.nummer}`,
      absaetze:[
        `Guten Tag ${[vk.vorname, vk.nachname].filter(Boolean).join(' ')},`,
        'vielen Dank für Ihre Anfrage. Auf Grundlage Ihrer Angaben haben wir eine unverbindliche Vorabkalkulation erstellt.',
        `Leistungen: ${vk.leistungen_text || '-'}`,
        k.spanne ? `Voraussichtlich: ${geld(k.spanne.von_cent)} bis ${geld(k.spanne.bis_cent)}`
                 : `Gesamtbetrag: ${geld(vk.brutto_gesamt_cent)}`,
        `Vorgemerkt bis: ${datum(bis)}`,
        texte.unverbindlich,
        'Ein Klick auf einen der folgenden Links öffnet zunächst nur eine Übersichtsseite. Erst dort bestätigen Sie Ihre Auswahl.',
      ],
      knoepfe,
      fussnote:'Diese Vorabkalkulation ist unverbindlich. Ein Vertrag kommt dadurch nicht zustande.',
    }),
  };
}

/* ══════════════════════════════════════════════════════════════
   2. Bestätigung nach einer Kundenaktion
   ══════════════════════════════════════════════════════════════ */
const BESTAETIGUNG_TEXT = {
  vormerken: {
    betreff: 'Ihre Vorabkalkulation ist vorgemerkt',
    satz: 'wir haben Ihre Vorabkalkulation wie gewünscht vorgemerkt.',
  },
  termin: {
    betreff: 'Ihre Terminanfrage ist angekommen',
    satz: 'vielen Dank – wir melden uns kurzfristig mit Terminvorschlägen bei Ihnen.',
  },
  aenderung: {
    betreff: 'Ihr Änderungswunsch ist angekommen',
    satz: 'vielen Dank für Ihren Änderungswunsch. Wir sehen ihn uns an und melden uns.',
  },
  korrektur: {
    betreff: 'Ihre Korrektur ist angekommen',
    satz: 'vielen Dank für die korrigierten Angaben. Wir rechnen neu und melden uns.',
  },
  kein_interesse: {
    betreff: 'Rückmeldung erhalten',
    satz: 'vielen Dank für Ihre Rückmeldung. Wir werden Sie zu diesem Vorgang nicht weiter kontaktieren.',
  },
  angenommen: {
    betreff: 'Ihre Beauftragung ist eingegangen',
    satz: 'vielen Dank für Ihre Beauftragung. Die Auftragsbestätigung erhalten Sie gesondert.',
  },
  abgelehnt: {
    betreff: 'Rückmeldung erhalten',
    satz: 'vielen Dank für Ihre Rückmeldung zu unserem Angebot.',
  },
  frist: {
    betreff: 'Ihre Anfrage zur Entscheidungsfrist ist angekommen',
    satz: 'vielen Dank – wir melden uns zur Verlängerung der Frist bei Ihnen.',
  },
  widerruf: {
    betreff: 'Ihr Widerruf ist eingegangen',
    satz: 'wir bestätigen den Eingang Ihrer Erklärung. Wir prüfen den Vorgang und melden uns.',
  },
  stornierung: {
    betreff: 'Ihre Stornierungsanfrage ist eingegangen',
    satz: 'wir bestätigen den Eingang Ihrer Anfrage. Wir prüfen den Vorgang und melden uns.',
  },
};

export function bestaetigung(vk, aktion, zusatz){
  const v = BESTAETIGUNG_TEXT[aktion] || { betreff:'Rückmeldung erhalten', satz:'vielen Dank für Ihre Rückmeldung.' };

  /* Bei Widerruf und Stornierung wird ausdrücklich KEINE Aussage
     über die rechtliche Wirksamkeit getroffen. Ein automatisch
     erzeugtes „Ihr Widerruf ist wirksam" wäre eine rechtliche
     Bewertung, die kein Programm treffen darf. */
  const rechtsHinweis = (aktion === 'widerruf' || aktion === 'stornierung')
    ? hinweisKasten('Diese Nachricht bestätigt den Eingang Ihrer Erklärung, nicht deren rechtliche Wirkung. ' +
                    'Wir prüfen den Vorgang und melden uns mit einer verbindlichen Rückmeldung.')
    : '';

  const inhalt = `
    <p style="margin:0 0 14px">${anrede(vk)}</p>
    <p style="margin:0 0 14px">${e(v.satz)}</p>
    ${eckdaten([
      ['Vorgang', vk.nummer],
      zusatz && zusatz.bis ? ['Vorgemerkt bis', datum(zusatz.bis)] : null,
      ['Eingegangen am', datum(new Date().toISOString())],
    ])}
    ${aktion === 'vormerken' && zusatz && zusatz.vormerkungHinweis
      ? hinweisKasten(zusatz.vormerkungHinweis) : ''}
    ${rechtsHinweis}
    <p style="margin:14px 0 0">Bei Fragen erreichen Sie uns jederzeit unter
      <a href="mailto:waschlurch@gmail.com" style="color:#22C55E">waschlurch@gmail.com</a>.</p>`;

  return {
    betreff: v.betreff + ' – ' + vk.nummer,
    html: rahmen({ titel:v.betreff, vorschau:v.satz, inhalt, knoepfe:[] }),
    text: alsText({
      titel: v.betreff,
      absaetze:[
        `Guten Tag ${[vk.vorname, vk.nachname].filter(Boolean).join(' ')},`,
        v.satz,
        `Vorgang: ${vk.nummer}`,
        zusatz && zusatz.bis ? `Vorgemerkt bis: ${datum(zusatz.bis)}` : '',
        (aktion === 'widerruf' || aktion === 'stornierung')
          ? 'Diese Nachricht bestätigt den Eingang Ihrer Erklärung, nicht deren rechtliche Wirkung.' : '',
      ].filter(Boolean),
    }),
  };
}

/* ══════════════════════════════════════════════════════════════
   3. Erinnerung vor Ablauf
   ══════════════════════════════════════════════════════════════ */
export function erinnerung(vk, token, tageRest){
  const knoepfe = [
    { text:'Besprechungstermin vereinbaren', url: aktionsLink(token, 'termin'), haupt:true },
    { text:'Änderung anfragen',              url: aktionsLink(token, 'aenderung') },
    { text:'Kein Interesse',                 url: aktionsLink(token, 'kein_interesse') },
  ];
  const inhalt = `
    <p style="margin:0 0 14px">${anrede(vk)}</p>
    <p style="margin:0 0 14px">Ihre Vorabkalkulation <strong>${e(vk.nummer)}</strong> ist noch
      ${tageRest === 1 ? 'bis morgen' : `${tageRest} Tage`} vorgemerkt.</p>
    ${eckdaten([
      ['Leistungen', vk.leistungen_text || '–'],
      ['Betrag', geld(vk.brutto_gesamt_cent)],
      ['Vorgemerkt bis', datum(vk.reserved_until)],
    ])}
    <p style="margin:0 0 14px">Wenn Sie möchten, stimmen wir die Einzelheiten gern in einem
      kurzen Gespräch ab. Danach erhalten Sie ein verbindliches Angebot.</p>`;

  return {
    betreff: `Erinnerung: Ihre Vorabkalkulation ${vk.nummer} läuft bald ab`,
    html: rahmen({ titel:'Noch kurz vorgemerkt', vorschau:`${vk.nummer} läuft in ${tageRest} Tagen ab`, inhalt, knoepfe }),
    text: alsText({
      titel:`Erinnerung zu ${vk.nummer}`,
      absaetze:[
        `Guten Tag ${[vk.vorname, vk.nachname].filter(Boolean).join(' ')},`,
        `Ihre Vorabkalkulation ${vk.nummer} ist noch ${tageRest} Tage vorgemerkt.`,
        `Betrag: ${geld(vk.brutto_gesamt_cent)}`,
        `Vorgemerkt bis: ${datum(vk.reserved_until)}`,
      ],
      knoepfe,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════
   4. Nach Ablauf
   ══════════════════════════════════════════════════════════════ */
export function abgelaufen(vk, token, ablaufText){
  const knoepfe = [
    { text:'Neue Kalkulation anfragen',      url: aktionsLink(token, 'neue_kalkulation'), haupt:true },
    { text:'Besprechungstermin vereinbaren', url: aktionsLink(token, 'termin') },
    { text:'Kein weiterer Kontakt gewünscht',url: aktionsLink(token, 'kein_kontakt') },
  ];
  const text = String(ablaufText || '').replace('{{DATUM}}', datum(vk.reserved_until || new Date().toISOString()));

  const inhalt = `
    <p style="margin:0 0 14px">${anrede(vk)}</p>
    <p style="margin:0 0 14px">${e(text)}</p>
    ${eckdaten([['Vorgang', vk.nummer], ['Leistungen', vk.leistungen_text || '–']])}`;

  return {
    betreff: `Ihre Vorabkalkulation ${vk.nummer} ist abgelaufen`,
    html: rahmen({ titel:'Vorabkalkulation abgelaufen', vorschau:text.slice(0,90), inhalt, knoepfe }),
    text: alsText({
      titel:`Vorabkalkulation ${vk.nummer} abgelaufen`,
      absaetze:[`Guten Tag ${[vk.vorname, vk.nachname].filter(Boolean).join(' ')},`, text],
      knoepfe,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════
   5. Meldung an den Verwalter
   ══════════════════════════════════════════════════════════════ */
export function meldungAnAdmin(betreff, zeilen){
  const inhalt = `<p style="margin:0 0 14px">${e(betreff)}</p>${eckdaten(zeilen)}
    <p style="margin:14px 0 0"><a href="${SEITE}/admin.html#reaktionen" style="color:#22C55E">Im Dashboard ansehen</a></p>`;
  return {
    betreff: 'Waschlurch: ' + betreff,
    html: rahmen({ titel: betreff, vorschau: betreff, inhalt, knoepfe:[] }),
    text: alsText({ titel: betreff, absaetze: zeilen.map(([b,w]) => `${b}: ${w}`) }),
  };
}

export { aktionsLink, geld, datum };
