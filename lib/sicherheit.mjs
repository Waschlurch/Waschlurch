/* ══════════════════════════════════════════════════════════════
   SICHERHEIT – Anmeldeprüfung, Aktionstokens, Ratenbegrenzung
   ══════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';
import { holen, setzen, anlegen, nurNeu, jetztIso } from './firestore.mjs';

const PROJEKT = 'waschlurch-469d4';
const VERWALTER_MAIL = 'waschlurch@gmail.com';

/* ══════════════════════════════════════════════════════════════
   1. IST DER AUFRUFER DER VERWALTER?
   ══════════════════════════════════════════════════════════════
   Das Dashboard schickt sein Firebase-Anmeldetoken mit. Hier wird
   es geprüft – Signatur, Aussteller, Empfänger, Ablauf und
   E-Mail-Adresse.

   ⚠️ Es genügt NICHT, das Token nur zu zerlegen und die E-Mail
   auszulesen. Ein JWT ist unverschlüsselt; jeder könnte sich eins
   mit `waschlurch@gmail.com` schreiben. Erst die Signaturprüfung
   gegen Googles öffentliche Schlüssel macht es zum Nachweis. */

let schluesselSpeicher = { schluessel: null, laeuftAbUm: 0 };

async function googleSchluessel(){
  if(schluesselSpeicher.schluessel && Date.now() < schluesselSpeicher.laeuftAbUm){
    return schluesselSpeicher.schluessel;
  }
  const antwort = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if(!antwort.ok) throw new Error('Googles Signaturschlüssel sind nicht erreichbar.');
  const schluessel = await antwort.json();

  // Google nennt die Gültigkeitsdauer im Cache-Control-Kopf
  const steuerung = antwort.headers.get('cache-control') || '';
  const treffer = steuerung.match(/max-age=(\d+)/);
  const sekunden = treffer ? Number(treffer[1]) : 3600;

  schluesselSpeicher = { schluessel, laeuftAbUm: Date.now() + sekunden * 1000 };
  return schluessel;
}

function base64urlZuPuffer(s){
  return Buffer.from(String(s).replace(/-/g,'+').replace(/_/g,'/'), 'base64');
}

export async function pruefeVerwalter(idToken){
  if(!idToken || typeof idToken !== 'string') return { ok:false, grund:'Kein Anmeldetoken übermittelt.' };

  const teile = idToken.split('.');
  if(teile.length !== 3) return { ok:false, grund:'Anmeldetoken hat ein unerwartetes Format.' };

  let kopf, inhalt;
  try {
    kopf   = JSON.parse(base64urlZuPuffer(teile[0]).toString('utf8'));
    inhalt = JSON.parse(base64urlZuPuffer(teile[1]).toString('utf8'));
  } catch(_){ return { ok:false, grund:'Anmeldetoken ist nicht lesbar.' }; }

  const schluessel = await googleSchluessel();
  const zertifikat = schluessel[kopf.kid];
  if(!zertifikat) return { ok:false, grund:'Anmeldetoken wurde mit einem unbekannten Schlüssel signiert.' };

  const pruefer = crypto.createVerify('RSA-SHA256');
  pruefer.update(teile[0] + '.' + teile[1]);
  const echt = pruefer.verify(
    new crypto.X509Certificate(zertifikat).publicKey,
    base64urlZuPuffer(teile[2])
  );
  if(!echt) return { ok:false, grund:'Die Signatur des Anmeldetokens stimmt nicht.' };

  const jetzt = Math.floor(Date.now() / 1000);
  if(inhalt.exp <= jetzt)  return { ok:false, grund:'Die Anmeldung ist abgelaufen. Bitte neu anmelden.' };
  if(inhalt.aud !== PROJEKT) return { ok:false, grund:'Das Anmeldetoken gehört zu einem anderen Projekt.' };
  if(inhalt.iss !== 'https://securetoken.google.com/' + PROJEKT)
    return { ok:false, grund:'Das Anmeldetoken hat einen falschen Aussteller.' };

  /* Dieselbe Prüfung wie in den Firestore-Regeln: die Adresse, nicht
     bloß „irgendwie angemeldet". Sonst käme jeder an die Daten, der
     sich selbst ein Firebase-Konto anlegt. */
  const mail = String(inhalt.email || '').toLowerCase();
  if(mail !== VERWALTER_MAIL){
    const eintrag = await holen('admins', inhalt.user_id || inhalt.sub);
    if(!eintrag) return { ok:false, grund:'Dieses Konto ist kein Verwalter.' };
  }

  return { ok:true, email: mail, uid: inhalt.user_id || inhalt.sub };
}

/* ══════════════════════════════════════════════════════════════
   2. AKTIONSTOKENS
   ══════════════════════════════════════════════════════════════
   Der Klartext entsteht genau einmal, wandert in den Link und wird
   NIRGENDS gespeichert. In der Datenbank steht nur sein SHA-256-Hash
   als Dokument-ID.

   Folge: Wer die Datenbank liest – auch Google, auch ein
   Sicherungsband, auch ein versehentlich zu weit gefasstes
   Leserecht – kann daraus keinen gültigen Link bauen.

   Der Hash braucht kein Salz und keine Schlüsselstreckung: Das
   Token besteht aus 32 zufälligen Bytes. Es gibt nichts zu erraten,
   und eine Wörterbuchsuche gibt es hier nicht. */

const TOKEN_SAMMLUNG = 'aktions_tokens';

export function tokenHash(klartext){
  return crypto.createHash('sha256').update(String(klartext)).digest('hex');
}

export async function tokenErzeugen({ dokumentTyp, dokumentId, dokumentVersion, kundeKey, aktionen, gueltigTage }){
  const klartext = crypto.randomBytes(32).toString('base64url');
  const hash = tokenHash(klartext);
  const laeuftAb = new Date(Date.now() + (Number(gueltigTage) || 30) * 86400000);

  await anlegen(TOKEN_SAMMLUNG, {
    dokument_typ: dokumentTyp,
    dokument_id: dokumentId,
    dokument_version: Number(dokumentVersion) || 1,
    kunde_key: kundeKey || null,
    aktionen: Array.isArray(aktionen) ? aktionen : [],
    expires_at: laeuftAb.toISOString(),
    used_at: null,
    revoked_at: null,
    versuche: 0,
    createdAt: jetztIso(),
  }, hash);

  return klartext;
}

/* Prüft ein Token, ohne es zu verbrauchen. Für die Anzeige der
   Bestätigungsseite: Der Kunde soll sehen, worum es geht, bevor er
   etwas auslöst. */
export async function tokenPruefen(klartext, gewuenschteAktion){
  if(!klartext || typeof klartext !== 'string' || klartext.length < 20){
    return { ok:false, grund:'ungueltig', text:'Dieser Link ist unvollständig.' };
  }
  const eintrag = await holen(TOKEN_SAMMLUNG, tokenHash(klartext));
  if(!eintrag) return { ok:false, grund:'unbekannt', text:'Dieser Link ist nicht (mehr) gültig.' };

  if(eintrag.revoked_at)
    return { ok:false, grund:'widerrufen', text:'Dieser Link wurde zurückgezogen. Bitte melden Sie sich bei uns.' };
  if(eintrag.used_at)
    return { ok:false, grund:'verbraucht', text:'Dieser Link wurde bereits verwendet.', eintrag };
  if(new Date(eintrag.expires_at).getTime() < Date.now())
    return { ok:false, grund:'abgelaufen', text:'Dieser Link ist abgelaufen. Gern erstellen wir Ihnen eine neue Kalkulation.' };

  if(gewuenschteAktion && !(eintrag.aktionen || []).includes(gewuenschteAktion))
    return { ok:false, grund:'nicht_erlaubt', text:'Diese Aktion ist über den Link nicht vorgesehen.' };

  return { ok:true, eintrag };
}

/* Verbraucht das Token. `nurNeu` auf eine Sperrmarke sorgt dafür,
   dass von zwei gleichzeitigen Klicks genau einer durchkommt.

   ⚠️ Nicht durch „lesen, prüfen, schreiben" ersetzen: Zwischen dem
   Lesen und dem Schreiben passt der zweite Klick hindurch, und dann
   wird dieselbe Zusage doppelt gebucht. */
export async function tokenVerbrauchen(klartext, aktion){
  const hash = tokenHash(klartext);
  const frisch = await nurNeu('token_sperren', hash, { aktion, zeitpunkt: jetztIso() });
  if(!frisch){
    return { ok:false, grund:'doppelt', text:'Diese Bestätigung wurde bereits verarbeitet.' };
  }
  await setzen(TOKEN_SAMMLUNG, hash, { used_at: jetztIso(), verwendete_aktion: aktion });
  return { ok:true };
}

export async function tokenWiderrufen(klartext){
  await setzen(TOKEN_SAMMLUNG, tokenHash(klartext), { revoked_at: jetztIso() });
}

/* ══════════════════════════════════════════════════════════════
   3. RATENBEGRENZUNG
   ══════════════════════════════════════════════════════════════
   Über Firestore, nicht im Arbeitsspeicher: Serverless-Aufrufe
   landen auf wechselnden Instanzen, ein Zähler im Speicher wäre
   nach dem nächsten Aufruf wieder null und damit wirkungslos.

   Die IP-Adresse wird gehasht gespeichert, nie im Klartext – für
   die Begrenzung genügt die Wiedererkennung. */
export async function ratenGrenze(kennung, hoechstens = 10, fensterMinuten = 10){
  const schluessel = crypto.createHash('sha256').update(String(kennung)).digest('hex').slice(0, 32);
  const jetzt = Date.now();
  const eintrag = await holen('rate_limit', schluessel);

  if(!eintrag || (jetzt - new Date(eintrag.fenster_start).getTime()) > fensterMinuten * 60000){
    await setzen('rate_limit', schluessel, { fenster_start: jetztIso(), anzahl: 1 });
    return { ok:true, verbleibend: hoechstens - 1 };
  }
  const anzahl = (Number(eintrag.anzahl) || 0) + 1;
  await setzen('rate_limit', schluessel, { anzahl });
  if(anzahl > hoechstens){
    return { ok:false, text:'Zu viele Versuche. Bitte versuchen Sie es in einigen Minuten erneut.' };
  }
  return { ok:true, verbleibend: hoechstens - anzahl };
}

/* Absenderadresse aus den Vercel-Kopfzeilen. Nur für die
   Ratenbegrenzung – sie wird nirgends gespeichert. */
export function absenderKennung(anfrage){
  const kopf = anfrage.headers || {};
  return String(kopf['x-forwarded-for'] || kopf['x-real-ip'] || 'unbekannt').split(',')[0].trim();
}

/* Antworthelfer – vereinheitlicht die Fehlerform aller Endpunkte. */
export function antworte(res, status, daten){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  /* Kein Zwischenspeichern: Diese Antworten enthalten Kundendaten
     und dürfen weder im Browser noch bei Vercel liegen bleiben. */
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(daten));
}

export async function koerperLesen(anfrage){
  if(anfrage.body && typeof anfrage.body === 'object') return anfrage.body;
  const stuecke = [];
  for await (const s of anfrage) stuecke.push(s);
  const roh = Buffer.concat(stuecke).toString('utf8');
  if(!roh) return {};
  try { return JSON.parse(roh); } catch(_){ return {}; }
}
