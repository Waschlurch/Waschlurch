/* ══════════════════════════════════════════════════════════════
   GMAIL – VERSAND ÜBER DAS AKQUISE-POSTFACH
   ══════════════════════════════════════════════════════════════
   Angelegt am 14.08.2026. Bewusst getrennt von `lib/mail.mjs`:

   `mail.mjs` verschickt Angebote über Resend, mit Anhängen, eigener
   Doppelschutz-Marke und HTML-Gestaltung. Es bleibt unangetastet –
   an ihm hängen Rechnungen und Angebote.

   Hier geht es um etwas anderes: eine schlichte Textmail aus einem
   echten Postfach, deren Antwort später wieder eingesammelt werden
   soll. Dafür braucht es die **Thread-Kennung**, die Resend nicht
   liefert. Ein gemeinsamer Baustein hätte beide Fälle verbogen.

   ⚠️ Kein Passwort. Gmail wird ausschließlich über OAuth
   angesprochen; gespeichert ist nur ein Erneuerungs-Token, und zwar
   als Umgebungsvariable bei Vercel – nie in der Datenbank, nie im
   Browser.

   Wieder ohne npm: Der Erneuerungs-Token wird gegen Googles
   Token-Endpunkt eingetauscht, dann folgt ein normaler HTTPS-Aufruf.
   Dieselbe Bauweise wie `firestore.mjs`.
   ══════════════════════════════════════════════════════════════ */

const ABSENDER_VORGABE = 'waschlurch.kunden@gmail.com';
const ABSENDER_NAME = 'Waschlurch';

export function gmailAbsender(){
  return process.env.GMAIL_ABSENDER || ABSENDER_VORGABE;
}

export function gmailEingerichtet(){
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

/* Zugangstoken für die Laufzeit der Instanz merken. Serverless-
   Instanzen leben mehrere Aufrufe lang; ohne den Zwischenspeicher
   liefe je Mail ein zusätzlicher Handschlag mit Google. */
let tokenSpeicher = { wert:null, laeuftAbUm:0 };

async function zugangstoken(){
  if(tokenSpeicher.wert && Date.now() < tokenSpeicher.laeuftAbUm - 30000) return tokenSpeicher.wert;

  if(!gmailEingerichtet()){
    throw new Error('Gmail ist nicht eingerichtet. Es fehlen GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET oder GMAIL_REFRESH_TOKEN. Siehe EINRICHTUNG.md.');
  }

  const antwort = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const daten = await antwort.json().catch(() => ({}));
  if(!antwort.ok){
    /* ⚠️ `invalid_grant` heißt fast immer: Der Erneuerungs-Token
       wurde zurückgezogen oder ist abgelaufen (bei einer App im
       Testmodus nach sieben Tagen). Das ist die häufigste Störung
       und verdient einen Satz, mit dem man etwas anfangen kann. */
    if(daten.error === 'invalid_grant'){
      throw new Error('Gmail hat die Anmeldung abgelehnt (invalid_grant). Der Erneuerungs-Token ist abgelaufen oder wurde zurückgezogen – er muss neu erzeugt werden. Siehe EINRICHTUNG.md.');
    }
    throw new Error('Gmail-Anmeldung fehlgeschlagen: ' + (daten.error_description || daten.error || ('HTTP ' + antwort.status)));
  }

  tokenSpeicher = {
    wert: daten.access_token,
    laeuftAbUm: Date.now() + (Number(daten.expires_in) || 3600) * 1000,
  };
  return daten.access_token;
}

function base64url(text){
  return Buffer.from(text, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ⚠️ Zeilenumbrüche aus Kopfzeilen entfernen.

   Eine Betreffzeile mit „\r\nBcc: fremd@example.com" würde sonst zu
   einer echten weiteren Kopfzeile – die Mail ginge zusätzlich an
   einen Empfänger, den niemand eingetragen hat. Der Betreff kommt
   aus einem Eingabefeld; er ist Fremdtext. */
function kopfzeileSaeubern(text){
  return String(text || '').replace(/[\r\n]+/g, ' ').trim();
}

/* Nicht-ASCII in Kopfzeilen muss kodiert werden (RFC 2047), sonst
   werden aus Umlauten im Betreff Fragezeichen. */
function kopfzeileKodieren(text){
  const sauber = kopfzeileSaeubern(text);
  // eslint-disable-next-line no-control-regex
  if(/^[\x20-\x7E]*$/.test(sauber)) return sauber;
  return '=?UTF-8?B?' + Buffer.from(sauber, 'utf8').toString('base64') + '?=';
}

export function istEmail(wert){
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(wert || '').trim());
}

/* Baut die Rohnachricht nach RFC 2822. Öffentlich, damit der
   Prüflauf sie ohne Netzzugriff untersuchen kann. */
export function baueNachricht({ an, betreff, text, absender, inReplyTo, references }){
  const von = absender || gmailAbsender();
  const zeilen = [
    'From: ' + ABSENDER_NAME + ' <' + kopfzeileSaeubern(von) + '>',
    'To: ' + kopfzeileSaeubern(an),
    'Subject: ' + kopfzeileKodieren(betreff),
    'MIME-Version: 1.0',
  ];

  /* ⚠️ Ohne diese beiden Kopfzeilen hängt die Antwort zwar bei Gmail
     im richtigen Gespräch (dafür genügt die Thread-Kennung), landet
     beim EMPFÄNGER aber als neue, zusammenhanglose Mail.

     `In-Reply-To` und `References` tragen die RFC-Kennung der
     Nachricht, auf die geantwortet wird – das ist etwas anderes als
     die Gmail-Kennung und muss beim Einlesen mitgespeichert werden. */
  if(inReplyTo){
    zeilen.push('In-Reply-To: ' + kopfzeileSaeubern(inReplyTo));
    zeilen.push('References: ' + kopfzeileSaeubern(references || inReplyTo));
  }

  zeilen.push('Content-Type: text/plain; charset="UTF-8"');
  zeilen.push('Content-Transfer-Encoding: base64');
  const kopf = zeilen.join('\r\n');

  /* Der Textkörper geht base64-kodiert hinaus. Sonst müssten lange
     Zeilen und Umlaute einzeln behandelt werden – und genau daran
     scheitern Mails still. */
  const koerper = Buffer.from(String(text || ''), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');

  return kopf + '\r\n\r\n' + koerper;
}

/* ══════════════════════════════════════════════════════════════
   VERSAND
   ══════════════════════════════════════════════════════════════
   Gibt `{ messageId, threadId }` zurück. Die Thread-Kennung ist der
   Grund, warum hier Gmail steht und nicht Resend: An ihr hängt die
   spätere Zuordnung einer Kundenantwort zur Firma. */
export async function sendeUeberGmail({ an, betreff, text, threadId, inReplyTo, references }){
  const empfaenger = String(an || '').trim();
  if(!istEmail(empfaenger)) throw new Error('Keine gültige Empfängeradresse.');
  if(!kopfzeileSaeubern(betreff)) throw new Error('Der Betreff fehlt.');
  if(!String(text || '').trim()) throw new Error('Die Nachricht fehlt.');

  const token = await zugangstoken();
  const roh = baueNachricht({ an: empfaenger, betreff, text, inReplyTo, references });

  /* `threadId` im Rumpf hängt die Nachricht bei Gmail an das
     bestehende Gespräch. Fehlt sie, entstünde eine zweite
     Unterhaltung – und die spätere Zuordnung einer Antwort liefe
     ins Leere. */
  const nutzlast = { raw: base64url(roh) };
  if(threadId) nutzlast.threadId = String(threadId);

  const antwort = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:'POST',
    headers:{ 'Authorization':'Bearer ' + token, 'Content-Type':'application/json' },
    body: JSON.stringify(nutzlast),
  });
  const daten = await antwort.json().catch(() => ({}));

  if(!antwort.ok){
    const meldung = (daten.error && daten.error.message) || ('HTTP ' + antwort.status);
    throw new Error('Gmail hat den Versand abgelehnt: ' + meldung);
  }
  /* ⚠️ Ohne Thread-Kennung ist die Mail zwar draußen, die spätere
     Antwort aber nicht mehr zuzuordnen. Das ist kein Grund, den
     Versand als gescheitert zu melden – aber einer, es zu merken. */
  if(!daten.id || !daten.threadId){
    throw new Error('Gmail hat gesendet, aber keine Nachrichten- oder Thread-Kennung zurückgegeben.');
  }

  return { messageId: daten.id, threadId: daten.threadId, absender: gmailAbsender() };
}

/* ══════════════════════════════════════════════════════════════
   ANTWORTEN LESEN (14.08.2026)
   ══════════════════════════════════════════════════════════════
   ⚠️ Es wird NIE das Postfach durchsucht.

   Abgefragt werden ausschließlich Gespräche, die Waschlurch selbst
   begonnen hat – über die beim Versand gespeicherte Thread-Kennung.
   Damit kann eine private oder fremde Mail gar nicht erst in die
   Nähe des Dashboards kommen; das ist keine Filterung, die man
   vergessen könnte, sondern eine Eigenschaft des Vorgehens.

   Der Bereich `gmail.readonly` genügt dafür. */

function kopfWert(kopfzeilen, name){
  const treffer = (kopfzeilen || []).find(h => String(h.name).toLowerCase() === name.toLowerCase());
  return treffer ? String(treffer.value || '') : '';
}

function ausBase64url(s){
  if(!s) return '';
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/* HTML zu lesbarem Text machen – falls die Gegenseite keinen
   Klartextteil mitschickt.

   ⚠️ Das ist KEINE Sicherheitsmaßnahme, sondern Lesbarkeit. Der
   Schutz liegt darin, dass das Dashboard den Text als Text setzt
   und nie als HTML. Hier fliegen nur Skript- und Stilblöcke samt
   Inhalt heraus, damit nicht plötzlich CSS-Regeln im Nachrichtentext
   stehen. */
function htmlZuText(html){
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Den Textkörper aus der verschachtelten Teilestruktur holen.
   Klartext hat Vorrang; HTML ist der Rückfall. */
export function textAusNachricht(nutzlast){
  let klartext = '', html = '';

  (function durchsuche(teil){
    if(!teil) return;
    const art = String(teil.mimeType || '');
    const daten = teil.body && teil.body.data;
    if(daten){
      if(art === 'text/plain' && !klartext) klartext = ausBase64url(daten);
      else if(art === 'text/html' && !html)  html = ausBase64url(daten);
    }
    (teil.parts || []).forEach(durchsuche);
  })(nutzlast);

  const text = klartext || htmlZuText(html);
  /* Zitierten Verlauf abschneiden: Alles ab „Am … schrieb …" oder ab
     der ersten Zeile mit „>" ist unsere eigene Mail, die der Kunde
     mitzitiert hat. Sie noch einmal zu speichern bläht jeden
     Datensatz auf und macht die Karte unlesbar. */
  const grenze = text.search(/^\s*(>|Am .{5,60} schrieb|On .{5,60} wrote|-----\s*Urspr)/m);
  const gekuerzt = grenze > 40 ? text.slice(0, grenze) : text;
  return gekuerzt.trim().slice(0, 20000);
}

/* Eine Adresse aus „Name <adresse@example.de>" herauslösen. */
export function adresseAus(wert){
  const t = /<([^>]+)>/.exec(String(wert || ''));
  return (t ? t[1] : String(wert || '')).trim().toLowerCase();
}

/* Ein Gespräch holen. Gibt `null` zurück, wenn es das Gespräch
   nicht (mehr) gibt – etwa weil die Mail gelöscht wurde. Das ist
   kein Fehler, der den ganzen Lauf abbrechen darf. */
export async function holeGespraech(threadId){
  const token = await zugangstoken();
  const antwort = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/threads/' +
    encodeURIComponent(threadId) + '?format=full',
    { headers:{ 'Authorization':'Bearer ' + token } });

  if(antwort.status === 404) return null;
  const daten = await antwort.json().catch(() => ({}));
  if(!antwort.ok){
    const meldung = (daten.error && daten.error.message) || ('HTTP ' + antwort.status);
    throw new Error('Gmail konnte das Gespräch nicht liefern: ' + meldung);
  }
  return daten;
}

/* Aus einem Gespräch die Antworten der Gegenseite herausziehen.

   ⚠️ Alles, was von unserer eigenen Adresse kommt, fliegt raus.
   Sonst importierte der Lauf die selbst versendete Mail als
   „Kundenantwort" – und jede Firma hätte sofort nach dem Versand
   eine Antwort. */
export function antwortenAusGespraech(gespraech, eigeneAdresse){
  const eigen = adresseAus(eigeneAdresse || gmailAbsender());
  const nachrichten = (gespraech && gespraech.messages) || [];

  return nachrichten.map(m => {
    const kopf = (m.payload && m.payload.headers) || [];
    const von = kopfWert(kopf, 'From');
    return {
      gmail_message_id: m.id,
      gmail_thread_id: m.threadId,
      /* ⚠️ Die RFC-Kennung ist NICHT die Gmail-Kennung. Nur mit ihr
         landet eine spätere Antwort beim Empfänger im richtigen
         Gesprächsfaden – Gmail selbst genügt die Thread-Kennung,
         anderen Mailprogrammen nicht. */
      rfc_message_id: kopfWert(kopf, 'Message-ID'),
      absender: adresseAus(von),
      absender_name: String(von).replace(/<[^>]*>/, '').replace(/"/g, '').trim(),
      empfaenger: adresseAus(kopfWert(kopf, 'To')),
      betreff: kopfWert(kopf, 'Subject'),
      text: textAusNachricht(m.payload),
      empfangen_am: m.internalDate
        ? new Date(Number(m.internalDate)).toISOString()
        : new Date().toISOString(),
    };
  }).filter(a => a.absender && a.absender !== eigen);
}
