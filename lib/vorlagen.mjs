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

import { rahmen, alsText, html, eckdaten, hinweisKasten } from './mail.mjs';

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
/* ── Tageszeit-Anrede ─────────────────────────────────────────
   Maßgeblich ist die Uhrzeit beim VERSAND, nicht beim Lesen – eine
   andere hat der Server nicht. Wer eine Mail von 8 Uhr erst abends
   öffnet, liest „Guten Morgen"; das ist bei Post üblich und fällt
   niemandem auf.

   ⚠️ Ausdrücklich in deutscher Zeit gerechnet. Vercel-Funktionen
   laufen in UTC – im Sommer wären das zwei Stunden Unterschied, und
   eine Mail um 07:30 deutscher Zeit trüge dann „Guten Morgen"
   obwohl der Server 05:30 zählt. Beim Abend wäre es umgekehrt
   falsch herum.

   Bewusst nur drei Stufen: „Guten Mittag" und „Guten Nachmittag"
   sind im deutschen Geschäftsverkehr unüblich – Letzteres ist eine
   Übersetzung aus dem Englischen. Zwischen 11 und 18 Uhr grüßt man
   mit „Guten Tag". Nachts ebenfalls: „Gute Nacht" wäre in einer
   Geschäftsmail befremdlich. */
export function tageszeitGruss(datum){
  /* ⚠️ NICHT über toLocaleString('de-DE', {hour:'2-digit'}).
     Das liefert „07 Uhr" – mit dem Wort dahinter. Number("07 Uhr")
     ist NaN, der Rückfall griff, und die Anrede lautete immer
     „Guten Tag". Die Tageszeit hätte nie funktioniert.

     formatToParts() gibt die Stunde als eigenen Bestandteil zurück,
     ohne Beiwerk und unabhängig davon, wie die Sprache das Format
     schreibt. */
  let stunde = NaN;
  try {
    const teile = new Intl.DateTimeFormat('de-DE', {
      timeZone:'Europe/Berlin', hour:'numeric', hour12:false,
    }).formatToParts(new Date(datum || Date.now()));
    const h = teile.find(t => t.type === 'hour');
    if(h) stunde = Number(h.value);
  } catch(_){ /* Rückfall unten */ }

  if(!isFinite(stunde)) return 'Guten Tag';
  if(stunde >= 5  && stunde < 11) return 'Guten Morgen';
  if(stunde >= 18 && stunde < 23) return 'Guten Abend';
  return 'Guten Tag';
}

function anrede(vk, datum){
  const gruss = tageszeitGruss(datum);
  const name = [vk.vorname, vk.nachname].filter(Boolean).join(' ').trim();
  return name ? `${gruss} ${e(name)},` : `${gruss},`;
}

/* Reintext-Fassung derselben Anrede. */
function anredeText(vk, datum){
  const name = [vk.vorname, vk.nachname].filter(Boolean).join(' ').trim();
  return tageszeitGruss(datum) + (name ? ' ' + name : '') + ',';
}

/* Leistungen für die Reintextfassung – untereinander mit
   Bindestrichen. Dieselbe Zerlegung wie in der HTML-Liste, damit
   beide Fassungen dasselbe zeigen. */
function leistungenAlsZeilen(text){
  const posten = String(text || '')
    .split(/[,;]|\bund\b/).map(s => s.trim()).filter(Boolean);
  return posten.length ? posten.map(p => '  - ' + p) : ['  - keine Angabe'];
}

/* Die Bausteine eckdaten() und hinweisKasten() liegen in mail.mjs.
   Dort stehen auch die Farben und die Dunkelmodus-Regeln – zwei
   Fassungen wären nach der ersten Farbänderung auseinandergelaufen. */


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
    ${/* ⚠️ Die geschätzte Arbeitszeit steht hier bewusst NICHT.
          Zusammen mit dem Betrag ergibt sie den internen
          Stundensatz: 162,79 € bei 2,0 Stunden sind 81,39 € je
          Stunde. Das ist die Kalkulationsgrundlage, und sie gehört
          Daniel, nicht auf ein Kundendokument.
          Im Dashboard bleibt die Zahl selbstverständlich sichtbar. */''}
    ${eckdaten([
      ['Kalkulation', vk.nummer],
      ['Leistungen', vk.leistungen_text || '–', 'liste'],
      betragZeile,
      ['Vorgemerkt bis', datum(bis)],
    ])}
    ${hinweisKasten(texte.unverbindlich)}
    ${vk.datenabgleich ? `<p class="leise" style="margin:0 0 14px;font-size:13px">${e(texte.abgleich)}</p>` : ''}
    ${(vk.einstufung && vk.einstufung.besichtigung_noetig)
      ? `<p style="margin:0 0 14px">Wegen des Umfangs beziehungsweise der örtlichen Gegebenheiten
         sehen wir vor einem verbindlichen Angebot eine kurze Besichtigung vor.</p>` : ''}
    <p class="text" style="margin:18px 0 8px;font-weight:600">Wie möchten Sie weitermachen?</p>
    <p class="leise" style="margin:0 0 4px;font-size:13px">
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
        anredeText(vk),
        'vielen Dank für Ihre Anfrage. Auf Grundlage Ihrer Angaben haben wir eine unverbindliche Vorabkalkulation erstellt.',
        'Leistungen:', ...leistungenAlsZeilen(vk.leistungen_text),
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
        anredeText(vk),
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
      ['Leistungen', vk.leistungen_text || '–', 'liste'],
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
        anredeText(vk),
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
    ${eckdaten([['Vorgang', vk.nummer], ['Leistungen', vk.leistungen_text || '–', 'liste']])}`;

  return {
    betreff: `Ihre Vorabkalkulation ${vk.nummer} ist abgelaufen`,
    html: rahmen({ titel:'Vorabkalkulation abgelaufen', vorschau:text.slice(0,90), inhalt, knoepfe }),
    text: alsText({
      titel:`Vorabkalkulation ${vk.nummer} abgelaufen`,
      absaetze:[anredeText(vk), text],
      knoepfe,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════
   5. Verbindliches Angebot (Stufe 2)
   ══════════════════════════════════════════════════════════════
   Der Ton wechselt hier bewusst: Bei der Vorabkalkulation steht
   „unverbindlich" im Vordergrund, hier „verbindlich" und „gültig
   bis". Der Kunde muss am Wortlaut erkennen, dass dieses Dokument
   eine andere Qualität hat. */
export function verbindlichesAngebot(a, token, texte){
  const knoepfe = [
    { text:'Zahlungspflichtig beauftragen', url: aktionsLink(token, 'beauftragen'), haupt:true },
    { text:'Änderung anfragen',             url: aktionsLink(token, 'aenderung') },
    { text:'Mehr Bedenkzeit erbitten',      url: aktionsLink(token, 'frist') },
    { text:'Angebot ablehnen',              url: aktionsLink(token, 'ablehnen') },
  ];

  /* „Wie besprochen" nur, wenn tatsächlich ein Termin stattgefunden
     hat. Wurde das Angebot ohne Besichtigung erstellt, wäre der Satz
     schlicht falsch – und ein Kunde, der sich an kein Gespräch
     erinnert, wird misstrauisch. */
  const nachTermin = a.besprechung_erfolgt === true || !!a.termin_datum;
  const einleitung = nachTermin
    ? 'wie besprochen erhalten Sie hiermit unser <strong>verbindliches Angebot</strong>.'
    : 'hiermit erhalten Sie unser <strong>verbindliches Angebot</strong> zu Ihrer Anfrage.';

  /* Die Versionsangabe erscheint NUR bei einer überarbeiteten
     Fassung. Bei Version 1 sagt „Fassung: Version 1" dem Kunden
     nichts – es wirft nur die Frage auf, wo Version 2 bleibt. */
  const versionsZeile = (Number(a.version) || 1) > 1
    ? ['Fassung', 'überarbeitete Fassung ' + a.version]
    : null;

  const inhalt = `
    <p style="margin:0 0 14px">${anrede(a)}</p>
    <p style="margin:0 0 14px">${einleitung}</p>
    ${eckdaten([
      ['Angebot', a.nummer],
      versionsZeile,
      ['Leistungen', a.leistungen_text || '–', 'liste'],
      ['Gesamtbetrag', geld(a.brutto_gesamt_cent)],
      ['Gültig bis', datum(a.gueltig_bis)],
    ])}
    ${hinweisKasten('An dieses Angebot halten wir uns bis zum ' + datum(a.gueltig_bis) + '. '
                    + (a.zahlungsbedingungen || ''), 'gruen')}
    ${a.ausfuehrung_zeitraum
      ? `<p style="margin:0 0 14px"><strong>Ausführung:</strong> ${e(a.ausfuehrung_zeitraum)}</p>` : ''}
    ${a.ausgeschlossen
      ? `<p style="margin:0 0 14px"><strong>Nicht enthalten:</strong> ${e(a.ausgeschlossen)}</p>` : ''}
    ${a.verbraucher
      ? `<p class="leise" style="margin:0 0 14px;font-size:13px">
           Als Verbraucher steht Ihnen ein Widerrufsrecht zu. Die vollständige Widerrufsbelehrung
           und das Muster-Widerrufsformular finden Sie im angehängten PDF und auf der
           Bestätigungsseite.</p>` : ''}
    <p class="text" style="margin:18px 0 8px;font-weight:600">Wie möchten Sie weitermachen?</p>
    <p class="leise" style="margin:0 0 4px;font-size:13px">
      Ein Klick öffnet zunächst nur eine Übersichtsseite. Dort sehen Sie alles noch einmal
      zusammengefasst und bestätigen erst danach.</p>`;

  return {
    betreff: `Ihr verbindliches Angebot ${a.nummer} – gültig bis ${datum(a.gueltig_bis)}`,
    html: rahmen({
      titel:'Ihr verbindliches Angebot',
      vorschau:`Angebot ${a.nummer} über ${geld(a.brutto_gesamt_cent)}`,
      inhalt, knoepfe,
      fussnote:'Dieses Angebot ist verbindlich und gültig bis ' + datum(a.gueltig_bis) + '.',
    }),
    text: alsText({
      titel:`Ihr verbindliches Angebot ${a.nummer}`,
      absaetze:[
        anredeText(a),
        'wie besprochen erhalten Sie hiermit unser verbindliches Angebot.',
        'Leistungen:', ...leistungenAlsZeilen(a.leistungen_text),
        `Gesamtbetrag: ${geld(a.brutto_gesamt_cent)}`,
        `Gültig bis: ${datum(a.gueltig_bis)}`,
        a.zahlungsbedingungen || '',
        a.verbraucher ? 'Als Verbraucher steht Ihnen ein Widerrufsrecht zu. Die Belehrung finden Sie im angehängten PDF.' : '',
        'Ein Klick auf einen der folgenden Links öffnet zunächst nur eine Übersichtsseite.',
      ].filter(Boolean),
      knoepfe,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════
   6. Auftragsbestätigung (Phase 7)
   ══════════════════════════════════════════════════════════════ */
export function auftragsbestaetigung(a, angenommenAm, texte){
  const inhalt = `
    <p style="margin:0 0 14px">${anrede(a)}</p>
    <p style="margin:0 0 14px">vielen Dank für Ihren Auftrag. Hiermit bestätigen wir die Annahme
      Ihrer Beauftragung.</p>
    ${eckdaten([
      ['Auftrag zu', a.nummer + ' · Version ' + (a.version || 1)],
      ['Leistungen', a.leistungen_text || '–', 'liste'],
      ['Gesamtbetrag', geld(a.brutto_gesamt_cent)],
      ['Angenommen am', datum(angenommenAm)],
      a.ausfuehrung_zeitraum ? ['Ausführung', a.ausfuehrung_zeitraum] : null,
    ])}
    <p style="margin:0 0 14px">${e(a.zahlungsbedingungen || '')}</p>
    <p style="margin:0 0 14px">Den Ausführungstermin stimmen wir kurzfristig mit Ihnen ab.
      Eine Rechnung erhalten Sie erst nach erbrachter Leistung.</p>
    ${a.verbraucher && texte && texte.widerruf
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:20px 0">
           <tr><td class="kasten linie leise" style="padding:16px 18px;border-radius:14px;
               background:#F4F4F5;border:1px solid #E4E4E7;
               font-size:12.5px;line-height:1.7;color:#52525B">
             <strong class="text" style="color:#18181B">Widerrufsbelehrung</strong><br>${e(texte.widerruf)}
             ${a.vorzeitiger_beginn
               ? `<br><br><strong class="text" style="color:#18181B">Ihre Erklärung zum vorzeitigen Leistungsbeginn:</strong><br>${e(texte.vorzeitig || '')}`
               : ''}
           </td></tr>
         </table>` : ''}`;

  return {
    betreff: `Auftragsbestätigung zu ${a.nummer}`,
    html: rahmen({
      titel:'Auftragsbestätigung',
      vorschau:`Ihr Auftrag über ${geld(a.brutto_gesamt_cent)} ist bestätigt`,
      inhalt, knoepfe:[],
      fussnote:'Diese Bestätigung dokumentiert den geschlossenen Vertrag.',
    }),
    text: alsText({
      titel:`Auftragsbestätigung zu ${a.nummer}`,
      absaetze:[
        anredeText(a),
        'vielen Dank für Ihren Auftrag. Hiermit bestätigen wir die Annahme Ihrer Beauftragung.',
        'Leistungen:', ...leistungenAlsZeilen(a.leistungen_text),
        `Gesamtbetrag: ${geld(a.brutto_gesamt_cent)}`,
        `Angenommen am: ${datum(angenommenAm)}`,
        a.zahlungsbedingungen || '',
        'Eine Rechnung erhalten Sie erst nach erbrachter Leistung.',
        a.verbraucher && texte && texte.widerruf ? 'Widerrufsbelehrung: ' + texte.widerruf : '',
      ].filter(Boolean),
    }),
  };
}

/* ══════════════════════════════════════════════════════════════
   7. Meldung an den Verwalter
   ══════════════════════════════════════════════════════════════ */
export function meldungAnAdmin(betreff, zeilen){
  /* ⚠️ `zeilen` enthält bedingte Einträge der Form
     `bedingung ? ['Titel', wert] : null`. `eckdaten()` filtert die
     null-Werte heraus, die Reintext-Fassung tat es NICHT – und ein
     `null` im Destructuring `([b,w]) => …` wirft.

     Das war kein Schönheitsfehler: Der Absturz geschah NACH dem
     Speichern der Kundenaktion. Der Kunde bekam „Da ist etwas
     schiefgegangen", obwohl seine Vormerkung oder Beauftragung
     längst gebucht war – und versuchte es dann erneut, was am
     verbrauchten Token scheiterte. */
  const gefiltert = (zeilen || []).filter(Boolean);
  const inhalt = `<p style="margin:0 0 14px">${e(betreff)}</p>${eckdaten(gefiltert)}
    <p style="margin:14px 0 0"><a href="${SEITE}/admin.html#reaktionen" style="color:#22C55E">Im Dashboard ansehen</a></p>`;
  return {
    betreff: 'Waschlurch: ' + betreff,
    html: rahmen({ titel: betreff, vorschau: betreff, inhalt, knoepfe:[] }),
    text: alsText({ titel: betreff, absaetze: gefiltert.map(([b,w]) => `${b}: ${w}`) }),
  };
}

export { aktionsLink, geld, datum };
