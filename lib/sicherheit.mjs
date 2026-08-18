/* ══════════════════════════════════════════════════════════════
   SICHERHEIT – Anmeldeprüfung, Aktionstokens, Ratenbegrenzung
   ══════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';
import { holen, setzen, anlegen, nurNeu, loeschen, jetztIso } from './firestore.mjs';
import { ROLLE_ADMIN, istBekannteRolle, darfSammlung } from './rollen.mjs';

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

async function tokenAuswerten(idToken){
  if(!idToken || typeof idToken !== 'string') return { ok:false, grund:'Kein Anmeldetoken übermittelt.' };

  const teile = idToken.split('.');
  if(teile.length !== 3) return { ok:false, grund:'Anmeldetoken hat ein unerwartetes Format.' };

  let kopf, inhalt;
  try {
    kopf   = JSON.parse(base64urlZuPuffer(teile[0]).toString('utf8'));
    inhalt = JSON.parse(base64urlZuPuffer(teile[1]).toString('utf8'));
  } catch(_){ return { ok:false, grund:'Anmeldetoken ist nicht lesbar.' }; }

  /* Das Verfahren wird ausdrücklich geprüft, obwohl unten fest mit
     RSA-SHA256 verifiziert wird. Ein Token mit `alg: none` oder
     `alg: HS256` scheitert dort ohnehin – aber eine ausdrückliche
     Ablehnung ist klarer als eine, die sich aus einem Seiteneffekt
     ergibt, und sie überlebt einen späteren Umbau. */
  if(kopf.alg !== 'RS256')
    return { ok:false, grund:'Anmeldetoken verwendet ein nicht zugelassenes Signaturverfahren.' };

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
  /* ⚠️ Erst auf Vorhandensein prüfen, dann vergleichen.
     `undefined <= jetzt` ergibt FALSE – ein Token ohne `exp` hätte
     die Ablaufprüfung anstandslos passiert. Dasselbe gilt für
     `iat`: Ein Token aus der Zukunft ist ebenfalls ungültig. */
  if(typeof inhalt.exp !== 'number')
    return { ok:false, grund:'Dem Anmeldetoken fehlt das Ablaufdatum.' };
  if(inhalt.exp <= jetzt)
    return { ok:false, grund:'Die Anmeldung ist abgelaufen. Bitte neu anmelden.' };
  if(typeof inhalt.iat === 'number' && inhalt.iat > jetzt + 300)
    return { ok:false, grund:'Das Anmeldetoken trägt ein Ausstellungsdatum in der Zukunft.' };
  if(!inhalt.user_id && !inhalt.sub)
    return { ok:false, grund:'Dem Anmeldetoken fehlt die Benutzerkennung.' };
  if(inhalt.aud !== PROJEKT) return { ok:false, grund:'Das Anmeldetoken gehört zu einem anderen Projekt.' };
  if(inhalt.iss !== 'https://securetoken.google.com/' + PROJEKT)
    return { ok:false, grund:'Das Anmeldetoken hat einen falschen Aussteller.' };

  /* Bis hierher ist bewiesen, WER anfragt – aber noch nicht, was er
     darf. Das entscheidet `pruefeAnmeldung`. */
  return {
    ok: true,
    email: String(inhalt.email || '').toLowerCase(),
    uid: inhalt.user_id || inhalt.sub,
  };
}

/* ── Wer ist es, und welche Rolle hat er? ─────────────────────
   Ergänzt am 14.08.2026 für den Akquise-Zugang.

   Reihenfolge ist wichtig: Erst Verwalter, dann Rolle. Ein
   Verwalter bleibt Verwalter, auch wenn zu seiner Kennung
   versehentlich ein Rolleneintrag existiert – sonst könnte ein
   falsch gesetztes Feld in `benutzer` Daniel aus seinem eigenen
   Dashboard aussperren.

   Dieselbe Prüfung wie in den Firestore-Regeln: die Adresse
   beziehungsweise ein ausdrücklicher Eintrag, nicht bloß
   „irgendwie angemeldet". Sonst käme jeder an die Daten, der sich
   selbst ein Firebase-Konto anlegt. */
export async function pruefeAnmeldung(idToken){
  const wer = await tokenAuswerten(idToken);
  if(!wer.ok) return wer;

  if(wer.email === VERWALTER_MAIL) return { ...wer, rolle: ROLLE_ADMIN };

  const adminEintrag = await holen('admins', wer.uid);
  if(adminEintrag) return { ...wer, rolle: ROLLE_ADMIN };

  const benutzer = await holen('benutzer', wer.uid);
  if(!benutzer) return { ok:false, grund:'Für dieses Konto ist kein Zugang eingerichtet.' };
  if(benutzer.aktiv !== true) return { ok:false, grund:'Dieser Zugang ist deaktiviert.' };
  if(!istBekannteRolle(benutzer.rolle))
    return { ok:false, grund:'Für dieses Konto ist keine gültige Rolle hinterlegt.' };

  return { ...wer, rolle: benutzer.rolle, name: benutzer.name || '' };
}

/* Unverändertes Verhalten für alle bestehenden Endpunkte:
   Rückgabeform und Fehlertext sind dieselben wie vorher. Wer
   Verwalter ist, entscheidet weiterhin allein die Adresse oder
   ein Eintrag unter `admins` – eine Rolle in `benutzer` kann das
   nicht ersetzen. */
export async function pruefeVerwalter(idToken){
  const wer = await pruefeAnmeldung(idToken);
  if(!wer.ok){
    // Ein eingerichteter Mitarbeiter ist kein Verwalter – das ist
    // kein Anmeldefehler, sondern fehlende Berechtigung.
    return wer;
  }
  if(wer.rolle !== ROLLE_ADMIN) return { ok:false, grund:'Dieses Konto ist kein Verwalter.' };
  return { ok:true, email: wer.email, uid: wer.uid, rolle: ROLLE_ADMIN };
}

/* Für die künftigen Akquise-Endpunkte: prüft Anmeldung UND ob die
   Rolle diese Sammlung überhaupt anfassen darf. Der Verwalter
   kommt überall durch.

   ⚠️ Ersetzt die Firestore-Regeln nicht, sondern ergänzt sie. Die
   Serverfunktionen arbeiten mit dem Dienstkonto und umgehen die
   Regeln planmäßig – hier ist die einzige Stelle, an der die
   Berechtigung dann noch geprüft wird. */
export async function pruefeZugriff(idToken, sammlung){
  const wer = await pruefeAnmeldung(idToken);
  if(!wer.ok) return wer;
  if(!darfSammlung(wer.rolle, sammlung))
    return { ok:false, grund:'Für diesen Bereich fehlt die Berechtigung.' };
  return wer;
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

  /* Der Vermerk im Token-Dokument ist Dokumentation, nicht der
     Schutz – der liegt in der Sperrmarke oben. Deshalb darf ein
     Fehler hier die Aktion NICHT abbrechen.

     Vorher lief er nach oben durch: Die Sperre war gesetzt, die
     Aktion nicht ausgeführt, und beim nächsten Versuch meldete das
     System „bereits verarbeitet". Der Kunde hätte nie mehr
     beauftragen können. */
  try {
    await setzen(TOKEN_SAMMLUNG, hash, { used_at: jetztIso(), verwendete_aktion: aktion });
  } catch(err){
    console.error('Tokenvermerk fehlgeschlagen (Aktion läuft weiter):', err.message);
  }
  return { ok:true, hash };
}

/* Gibt eine Sperre wieder frei. Wird gebraucht, wenn die Aktion
   NACH dem Verbrauchen scheitert – etwa weil die Datenbank kurz
   nicht erreichbar war.

   Ohne das bliebe der Kunde auf einem verbrauchten Token sitzen,
   obwohl nichts geschehen ist: Er sähe „bereits verarbeitet",
   während in Wahrheit weder ein Auftrag noch eine Vormerkung
   existiert. Lieber ein zweiter Versuch als ein toter Link. */
export async function tokenFreigeben(klartext){
  const hash = tokenHash(klartext);
  try {
    await loeschen('token_sperren', hash);
    await setzen(TOKEN_SAMMLUNG, hash, { used_at: null, verwendete_aktion: null });
    return true;
  } catch(err){
    console.error('Sperre konnte nicht freigegeben werden:', err.message);
    return false;
  }
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

  /* ⚠️ Eine gestörte Ratenbegrenzung darf den Dienst nicht
     blockieren. Sie steht ganz am Anfang jeder Kundenaktion –
     wirft sie, käme der Kunde nicht einmal bis zur Tokenprüfung
     und sähe einen Fehler, obwohl mit seinem Link alles stimmt.

     Deshalb im Zweifel durchlassen und protokollieren. Der Schutz
     gegen Massenzugriffe ist wichtig, aber nicht wichtiger als die
     Erreichbarkeit für den ehrlichen Kunden. */
  try {
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
  } catch(err){
    console.error('Ratenbegrenzung gestört, Zugriff wird durchgelassen:', err.message);
    return { ok:true, verbleibend: null, gestoert:true };
  }
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
