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

/* Größtes zulässiges Dokument im Anhang. Resend nimmt 40 MB, aber
   ein Angebots-PDF liegt bei 50 bis 200 KB. Alles darüber deutet
   auf einen Fehler hin – und ein unbegrenzter Anhang aus dem
   Browser wäre eine Einladung, den Postausgang lahmzulegen. */
export const ANHANG_GRENZE_BYTES = 8 * 1024 * 1024;

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
      /* ⚠️ Gab es die Marke schon, heißt das nicht zwangsläufig,
         dass die Mail draußen ist. Ein früherer Versuch kann beim
         Anbieter gescheitert sein.

         Vorher wurde hier pauschal „bereits versendet" gemeldet.
         Folge: Der Versand scheiterte, der Admin klickte erneut,
         bekam ein zufriedenes „ist schon raus" – und beim Kunden
         kam nie etwas an. */
      const alt = await holen('mail_ereignisse', marke);
      if(alt && alt.status === 'fehlgeschlagen'){
        // Erneuter Versuch ausdrücklich erlaubt
      } else {
        return { uebersprungen:true, grund:'Diese Nachricht wurde bereits versendet.' };
      }
    }
  }

  const anbieterName = process.env.MAIL_ANBIETER || 'resend';
  const senden = ANBIETER[anbieterName];
  if(!senden) throw new Error('Unbekannter Postausgang: ' + anbieterName);

  let ergebnis;
  try {
    ergebnis = await senden({ an, betreff, html, text, anhaenge });
  } catch(err){
    /* Fehlschlag festhalten, damit ein zweiter Versuch durchkommt.
       Der Doppelschutz bleibt für den Erfolgsfall bestehen. */
    if(marke){
      try {
        const { setzen } = await import('./firestore.mjs');
        await setzen('mail_ereignisse', marke, {
          status:'fehlgeschlagen', fehler: String(err.message).slice(0, 300),
          fehlgeschlagen_am: jetztIso(),
        });
      } catch(_){ /* Der eigentliche Fehler ist wichtiger */ }
    }
    throw err;
  }

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
   GESTALTUNG DER E-MAILS
   ══════════════════════════════════════════════════════════════
   Drei Dinge bestimmen den Aufbau:

   1. TABELLEN, kein Flexbox und kein Grid. Outlook für Windows
      rendert mit der Word-Engine und kennt beides nicht.

   2. HELL UND DUNKEL. Die Grundfassung ist hell und steht inline;
      `prefers-color-scheme: dark` schaltet auf dunkel um. Warum
      hell als Grundlage? Clients, die keinen Dunkelmodus
      unterstützen, zeigen die Grundfassung – und ein helles Layout
      ist dort die sichere Wahl. Clients, die eigenmächtig
      invertieren (Gmail-App), kommen mit hell ebenfalls besser
      zurecht als mit dunkel.

   3. EINE SPALTE, höchstens 600 px. Das ist die Breite, die auf
      jedem Handy ohne Zoom lesbar bleibt.

   ⚠️ Nachgemessen: Weißer Text auf #22C55E hat nur 2,28:1 Kontrast
   und ist damit deutlich unter der Grenze von 4,5:1. Für Knöpfe auf
   hellem Grund wird deshalb #15803D verwendet (5,02:1). Im dunklen
   Modus trägt der Knopf schwarze Schrift auf #4ADE80 (11,36:1).

   ⚠️ Kein Zählpixel, keine Öffnungs- und keine Klickmessung. Das
   ist Absicht und steht so in der Datenschutzerklärung. */

const F = {
  // Hell
  h_seite:   '#F4F4F5',
  h_karte:   '#FFFFFF',
  h_text:    '#18181B',
  h_leise:   '#52525B',
  h_linie:   '#E4E4E7',
  h_akzent:  '#15803D',
  h_knopf:   '#15803D',
  h_knopfTx: '#FFFFFF',
  h_kasten:  '#F4F4F5',
  // Dunkel
  d_seite:   '#09090B',
  d_karte:   '#131316',
  d_text:    '#FAFAFA',
  d_leise:   '#A1A1AA',
  d_linie:   '#27272A',
  d_akzent:  '#4ADE80',
  d_knopf:   '#4ADE80',
  d_knopfTx: '#0A0A0A',
  d_kasten:  '#1C1C21',
};
const SCHRIFT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SEITE_URL = 'https://waschlurch.com';

function entschaerfe(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ── Eckdatentabelle ──────────────────────────────────────────
   Bezeichnung links, Wert rechts. Auf dem Handy bricht der Wert
   unter die Bezeichnung – zwei Spalten sind bei 320 px zu eng,
   sobald ein langer Firmenname darin steht. */
export function eckdaten(paare){
  const zeilen = (paare || []).filter(Boolean);
  if(!zeilen.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            class="kasten" style="margin:22px 0;background:${F.h_kasten};border-radius:14px">
    ${zeilen.map(([bez, wert, art], i) => `
      <tr>
        <td class="linie leise" style="padding:13px 18px 4px;font-family:${SCHRIFT};font-size:13px;
            line-height:1.4;color:${F.h_leise};${i ? `border-top:1px solid ${F.h_linie};` : ''}">
          ${entschaerfe(bez)}
        </td>
      </tr>
      <tr>
        <td style="padding:0 18px 13px">
          ${/* Ein dritter Eintrag 'liste' setzt den Wert als
                Aufzählung untereinander statt als Komma-Zeile. */
            art === 'liste'
            ? leistungsListe(wert)
            : `<div class="text" style="font-family:${SCHRIFT};font-size:15px;line-height:1.45;
                 font-weight:600;color:${F.h_text};word-break:break-word">${entschaerfe(wert)}</div>`}
        </td>
      </tr>`).join('')}
  </table>`;
}

/* ── Leistungsliste ───────────────────────────────────────────
   Untereinander mit Punkten statt als Komma-Aufzählung. Bei vier
   Leistungen ist eine Zeile wie „Büroreinigung, Fensterreinigung,
   Treppenhausreinigung, Grundreinigung" auf dem Handy drei Zeilen
   Fließtext, in denen nichts hervorsticht.

   Als Tabelle gebaut, nicht als <ul>: Outlook setzt Listen mit
   eigenen Abständen, die sich kaum bändigen lassen, und der
   Aufzählungspunkt sitzt dort oft an der falschen Stelle. */
export function leistungsListe(text){
  const posten = String(text || '')
    .split(/[,;]|\bund\b/).map(s => s.trim()).filter(Boolean);
  if(!posten.length) return '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="margin:4px 0 0">
    ${posten.map(p => `
      <tr>
        <td width="18" valign="top" class="akzent" style="padding:4px 0 0;font-family:${SCHRIFT};
            font-size:15px;line-height:1.5;color:${F.h_akzent}">&bull;</td>
        <td valign="top" class="text" style="padding:4px 0 0;font-family:${SCHRIFT};
            font-size:15px;line-height:1.5;font-weight:600;color:${F.h_text};
            word-break:break-word">${entschaerfe(p)}</td>
      </tr>`).join('')}
  </table>`;
}

/* ── Hinweiskasten ────────────────────────────────────────────
   Für den Unverbindlichkeitshinweis und ähnliche Pflichttexte.
   Gelb-getönt, damit er sich vom Fließtext abhebt, ohne wie eine
   Fehlermeldung auszusehen. */
export function hinweisKasten(text, art){
  const hell = art === 'gruen'
    ? { bg:'#F0FDF4', rand:'#BBF7D0', tx:'#14532D' }
    : { bg:'#FEFCE8', rand:'#FDE68A', tx:'#713F12' };
  const klasse = art === 'gruen' ? 'hinweis-gruen' : 'hinweis-gelb';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="margin:20px 0">
    <tr><td class="${klasse}" style="padding:15px 18px;border-radius:14px;
        background:${hell.bg};border:1px solid ${hell.rand};
        font-family:${SCHRIFT};font-size:13.5px;line-height:1.65;color:${hell.tx}">
      ${entschaerfe(text)}
    </td></tr>
  </table>`;
}

/* ── Knopf ────────────────────────────────────────────────────
   Kugelsicher gebaut: Die Farbe sitzt auf der Tabellenzelle, nicht
   nur auf dem Link. Outlook ignoriert `background` auf einem
   <a>-Element, aber nicht auf einem <td>. Der Link füllt die Zelle
   über Innenabstand, damit die ganze Fläche klickbar ist. */
function knopfHtml(k){
  const haupt = k.haupt === true;
  return `<tr><td style="padding:5px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center"
          class="${haupt ? 'knopf-haupt' : 'knopf-still'}"
          style="border-radius:100px;
                 background:${haupt ? F.h_knopf : F.h_karte};
                 border:1px solid ${haupt ? F.h_knopf : F.h_linie}">
        <a href="${entschaerfe(k.url)}" target="_blank"
           class="${haupt ? 'knopf-haupt-tx' : 'knopf-still-tx'}"
           style="display:block;padding:15px 22px;font-family:${SCHRIFT};
                  font-size:15px;font-weight:600;line-height:1.3;text-decoration:none;
                  color:${haupt ? F.h_knopfTx : F.h_text};border-radius:100px">
          ${entschaerfe(k.text)}
        </a>
      </td></tr>
    </table>
  </td></tr>`;
}

export function rahmen({ titel, vorschau, inhalt, knoepfe, fussnote }){
  const knopfHtmlAlle = (knoepfe || []).map(knopfHtml).join('');

  return `<!DOCTYPE html>
<html lang="de" dir="ltr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<!-- Sagt dem Programm, dass beide Modi unterstützt werden. Ohne das
     invertieren manche Clients die Farben selbst und meist schlecht. -->
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${entschaerfe(titel)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings>
  <o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }

  /* Grundlagen, die einige Clients sonst überschreiben */
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
  a { color:${F.h_akzent}; }

  /* ── Handy ──────────────────────────────────────────────────
     Unter 600 px wird der Rand schmaler und die Schrift etwas
     kleiner. Der Knopf bleibt bei 15 px – darunter wird er auf
     dem Handy unangenehm zu treffen. */
  @media only screen and (max-width:600px){
    .huelle    { width:100% !important; max-width:100% !important; }
    .aussen    { padding:12px !important; }
    .polster   { padding:22px 18px !important; }
    .kopf      { padding:22px 18px 0 !important; }
    .fuss      { padding:18px !important; }
    .titel     { font-size:21px !important; line-height:1.3 !important; }
    .fliess    { font-size:15px !important; }
    .karte     { border-radius:16px !important; }
    .logo      { height:38px !important; }
  }

  /* ── Dunkelmodus ────────────────────────────────────────────
     Greift in Apple Mail, iOS Mail, Outlook.com und Outlook für
     Mac. Gmail unterstützt es nicht und invertiert stattdessen
     selbst – deshalb ist die Grundfassung hell gehalten, damit
     dieses Invertieren zu einem brauchbaren Ergebnis führt. */
  @media (prefers-color-scheme: dark){
    .seite       { background:${F.d_seite} !important; }
    .karte       { background:${F.d_karte} !important; border-color:${F.d_linie} !important; }
    .text        { color:${F.d_text} !important; }
    .leise       { color:${F.d_leise} !important; }
    .linie       { border-color:${F.d_linie} !important; }
    .kasten      { background:${F.d_kasten} !important; }
    .trenner     { background:${F.d_linie} !important; }
    a, .akzent   { color:${F.d_akzent} !important; }

    .knopf-haupt    { background:${F.d_knopf} !important; border-color:${F.d_knopf} !important; }
    .knopf-haupt-tx { color:${F.d_knopfTx} !important; }
    .knopf-still    { background:${F.d_karte} !important; border-color:${F.d_linie} !important; }
    .knopf-still-tx { color:${F.d_text} !important; }

    .hinweis-gelb  { background:#2B2410 !important; border-color:#854D0E !important; color:#FDE68A !important; }
    .hinweis-gruen { background:#0B2818 !important; border-color:#166534 !important; color:#86EFAC !important; }

    /* Logo tauschen: das mit der schwarzen Kontur verschwindet auf
       dunklem Grund, deshalb die helle Fassung. */
    .logo-hell   { display:none !important; }
    .logo-dunkel { display:inline-block !important; max-height:none !important; overflow:visible !important; }
  }

  /* Outlook.com setzt statt der Media Query dieses Attribut. */
  [data-ogsc] .seite       { background:${F.d_seite} !important; }
  [data-ogsc] .karte       { background:${F.d_karte} !important; border-color:${F.d_linie} !important; }
  [data-ogsc] .text        { color:${F.d_text} !important; }
  [data-ogsc] .leise       { color:${F.d_leise} !important; }
  [data-ogsc] .kasten      { background:${F.d_kasten} !important; }
  [data-ogsc] .trenner     { background:${F.d_linie} !important; }
  [data-ogsc] a            { color:${F.d_akzent} !important; }
  [data-ogsc] .knopf-haupt    { background:${F.d_knopf} !important; border-color:${F.d_knopf} !important; }
  [data-ogsc] .knopf-haupt-tx { color:${F.d_knopfTx} !important; }
  [data-ogsc] .logo-hell   { display:none !important; }
  [data-ogsc] .logo-dunkel { display:inline-block !important; max-height:none !important; }
</style>
</head>
<body class="seite" style="margin:0;padding:0;width:100%;background:${F.h_seite}">

<!-- Vorschauzeile: erscheint in der Nachrichtenliste neben dem
     Betreff, in der Nachricht selbst aber nicht. Die Leerzeichen
     dahinter verhindern, dass der Client den Anfang des Fließtexts
     mit anhängt. -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">
  ${entschaerfe(vorschau || '')}
  &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       class="seite" style="background:${F.h_seite}">
<tr><td class="aussen" align="center" style="padding:28px 16px">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         class="huelle karte" style="width:600px;max-width:600px;background:${F.h_karte};
         border:1px solid ${F.h_linie};border-radius:22px;overflow:hidden">

    <!-- ── Kopf mit Logo ───────────────────────────────────── -->
    <tr><td class="kopf" style="padding:30px 32px 0">
      <!-- Logo und Schriftzug führen auf die Website. Wer in einer
           Mail auf ein Firmenlogo klickt, erwartet genau das. -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:14px;vertical-align:middle" width="74">
            <a href="${SEITE_URL}/" target="_blank" style="display:block;text-decoration:none;border:0">
              <!--[if !mso]><!-->
              <img class="logo logo-hell" src="${SEITE_URL}/logo.png?v=5"
                   alt="Waschlurch – zur Website" width="74" height="45"
                   style="display:block;width:74px;height:45px;border:0">
              <img class="logo logo-dunkel" src="${SEITE_URL}/logo-light.png?v=5"
                   alt="Waschlurch – zur Website" width="74" height="44"
                   style="display:none;width:74px;height:44px;border:0;max-height:0;overflow:hidden">
              <!--<![endif]-->
              <!--[if mso]>
              <img src="${SEITE_URL}/logo.png?v=5" alt="Waschlurch – zur Website" width="74" height="45" style="display:block;border:0">
              <![endif]-->
            </a>
          </td>
          <td style="vertical-align:middle">
            <a href="${SEITE_URL}/" target="_blank" style="text-decoration:none">
              <span class="text" style="display:block;font-family:${SCHRIFT};font-size:21px;
                   font-weight:700;line-height:1.2;color:${F.h_text}">Waschlurch</span>
              <span class="leise" style="display:block;font-family:${SCHRIFT};font-size:13px;
                   line-height:1.4;color:${F.h_leise};padding-top:3px">Reinigung und Hausmeisterservice</span>
            </a>
          </td>
        </tr>
      </table>
      <!-- Grüner Trennstrich als Tabellenzeile: Ein <hr> gestaltet
           jeder Client anders, eine gefärbte Zelle nicht. -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin-top:20px">
        <tr><td style="height:3px;line-height:3px;font-size:3px;background:${F.h_akzent};
            border-radius:3px">&nbsp;</td></tr>
      </table>
    </td></tr>

    <!-- ── Inhalt ──────────────────────────────────────────── -->
    <tr><td class="polster text fliess" style="padding:26px 32px 8px;font-family:${SCHRIFT};
        font-size:16px;line-height:1.65;color:${F.h_text}">
      ${inhalt}
    </td></tr>

    ${knopfHtmlAlle ? `<tr><td class="polster" style="padding:8px 32px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${knopfHtmlAlle}
      </table>
    </td></tr>` : ''}

    <!-- ── Fußzeile ────────────────────────────────────────── -->
    <tr><td class="fuss" style="padding:24px 32px 30px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="trenner" style="height:1px;line-height:1px;font-size:1px;
            background:${F.h_linie}">&nbsp;</td></tr>
      </table>
      <div class="leise" style="font-family:${SCHRIFT};font-size:12.5px;line-height:1.7;
           color:${F.h_leise};padding-top:18px">
        ${fussnote ? entschaerfe(fussnote) + '<br><br>' : ''}
        <strong class="text" style="color:${F.h_text}">Waschlurch</strong> &middot; Daniel Lurch<br>
        53783 Eitorf &middot; <a href="mailto:waschlurch@gmail.com"
          style="color:${F.h_akzent};text-decoration:none">waschlurch@gmail.com</a><br><br>
        <a href="${SEITE_URL}/impressum.html" style="color:${F.h_leise};text-decoration:underline">Impressum</a>
        &nbsp;&middot;&nbsp;
        <a href="${SEITE_URL}/datenschutz.html" style="color:${F.h_leise};text-decoration:underline">Datenschutz</a>
        &nbsp;&middot;&nbsp;
        <a href="${SEITE_URL}/agb.html" style="color:${F.h_leise};text-decoration:underline">AGB</a>
        <br><br>
        Diese Nachricht gehört zu Ihrer Anfrage bei uns. Sie ist keine Werbung,
        und wir messen weder das Öffnen noch das Anklicken.
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
