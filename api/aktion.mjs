/* ══════════════════════════════════════════════════════════════
   /api/aktion – Kundenaktionen prüfen und bestätigen
   ══════════════════════════════════════════════════════════════
   Zwei Betriebsarten, beide über POST:

     { schritt: 'ansehen' }     → zeigt, worum es geht. Ändert nichts
                                  Verbindliches.
     { schritt: 'bestaetigen' } → führt die Aktion aus. Verbraucht
                                  das Token.

   ⚠️ GET wird mit 405 abgewiesen. Das ist der Schutz gegen
   Linkscanner: Virenscanner, Vorschaudienste und
   Sicherheitsgateways rufen jeden Link in einer eingehenden Mail
   auf – aber sie tun das mit GET. Ein Scanner kann hier also
   nichts auslösen, selbst wenn er der Weiterleitung folgt.

   Der Token kommt aus dem Adress-Fragment der Seite und wird von
   dort per POST geschickt. Er steht damit in keiner Serverliste,
   in keinem Verweis-Kopf und in keinem Browserverlauf-Eintrag,
   der geteilt würde.
   ══════════════════════════════════════════════════════════════ */

import { holen, aendern, anlegen, jetztIso } from '../lib/firestore.mjs';
import { tokenPruefen, tokenVerbrauchen, tokenFreigeben, ratenGrenze, absenderKennung,
         antworte, koerperLesen } from '../lib/sicherheit.mjs';
import { versende } from '../lib/mail.mjs';
import { bestaetigung, meldungAnAdmin, auftragsbestaetigung } from '../lib/vorlagen.mjs';

/* Welche Aktion führt zu welchem Stand, und braucht sie eine
   Nachricht des Kunden? An einer Stelle, damit Prüfung, Anzeige und
   Ausführung nicht auseinanderlaufen. */
const AKTIONEN = {
  termin:          { status:'MEETING_BOOKED',   titel:'Besprechungstermin vereinbaren',
                     frage:'Wir melden uns mit Terminvorschlägen bei Ihnen.', textfeld:'optional' },
  vormerken:       { status:'RESERVED',         titel:'14 Tage vormerken',
                     frage:'Wir merken Ihre Kalkulation vor.', textfeld:'nein' },
  aenderung:       { status:'CHANGE_REQUESTED', titel:'Änderung anfragen',
                     frage:'Beschreiben Sie kurz, was geändert werden soll.', textfeld:'pflicht' },
  korrektur:       { status:'CHANGE_REQUESTED', titel:'Angaben korrigieren',
                     frage:'Welche Angaben stimmen nicht?', textfeld:'pflicht' },
  kein_interesse:  { status:'DECLINED',         titel:'Kein Interesse',
                     frage:'Wir schließen den Vorgang ab und melden uns nicht weiter.', textfeld:'optional' },
  neue_kalkulation:{ status:null,               titel:'Neue Kalkulation anfragen',
                     frage:'Wir erstellen Ihnen eine aktualisierte Kalkulation.', textfeld:'optional' },
  kein_kontakt:    { status:'DECLINED',         titel:'Kein weiterer Kontakt',
                     frage:'Wir nehmen zu diesem Vorgang keinen weiteren Kontakt auf.', textfeld:'nein' },
};

/* Aktionen auf ein VERBINDLICHES Angebot. `zweistufig` markiert die
   Beauftragung: Sie führt nicht direkt zur Bestätigung, sondern auf
   eine Zusammenfassungsseite, auf der alle Vertragsangaben noch
   einmal stehen. Erst ein zweiter, eindeutig beschrifteter Knopf
   schließt die Annahme ab. */
const ANGEBOT_AKTIONEN = {
  beauftragen: { status:'ACCEPTED',         titel:'Zahlungspflichtig beauftragen', zweistufig:true,
                 frage:'Sie geben damit eine verbindliche Bestellung ab.', textfeld:'nein' },
  ablehnen:    { status:'DECLINED',         titel:'Angebot ablehnen',
                 frage:'Wir schließen den Vorgang ab.', textfeld:'optional' },
  aenderung:   { status:'CHANGE_REQUESTED', titel:'Änderung anfragen',
                 frage:'Beschreiben Sie kurz, was geändert werden soll.', textfeld:'pflicht' },
  frist:       { status:null,               titel:'Mehr Bedenkzeit erbitten',
                 frage:'Wir melden uns zur Verlängerung der Frist bei Ihnen.', textfeld:'optional' },
};

/* Was der Kunde vom Angebot sehen darf. Wieder gezielt Feld für
   Feld – `positionen` enthält keine Kostenseite, aber das Dokument
   trägt daneben `kostenProEinsatz`, `gewinnGesamt` und
   `arbeitsstunden` aus der Überführung. */
function angebotFuerKunden(a){
  return {
    nummer: a.nummer, version: a.version,
    name: [a.vorname, a.nachname].filter(Boolean).join(' '),
    firma: a.firma || null,
    anschrift: [a.strasse || a.adresse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    leistungen: a.leistungen_text || null,
    positionen: (a.positionen || []).map(p => ({
      text: p.text, menge: p.menge || null, betrag_cent: p.betrag_cent, hinweis: p.hinweis || null,
    })),
    netto_gesamt_cent: Number(a.netto_gesamt_cent) || 0,
    mwst_cent: Number(a.mwst_cent) || 0,
    mwst_satz: Number(a.mwst_satz) || 0,
    brutto_gesamt_cent: Number(a.brutto_gesamt_cent) || 0,
    gueltig_bis: a.gueltig_bis || null,
    zahlungsbedingungen: a.zahlungsbedingungen || null,
    ausfuehrung_zeitraum: a.ausfuehrung_zeitraum || null,
    ausgeschlossen: a.ausgeschlossen || null,
    agb_version: a.agb_version || null,
    verbraucher: a.verbraucher === true,
    anbieter: 'Waschlurch · Daniel Lurch · 53783 Eitorf',
    status: a.status,
  };
}

/* Beide Aktionstabellen zusammen – für die Auskunft „das hast du
   schon bestätigt", die den Dokumenttyp nicht mehr kennt. */
const ALLE_AKTIONEN = { ...AKTIONEN, ...ANGEBOT_AKTIONEN };

/* Was der Kunde sehen darf. Gezielt Feld für Feld – die Kalkulation
   enthält die Kostenseite (Gewinn, Marge, Stundenkosten), und eine
   Schleife über alle Felder gäbe sie heraus. */
function fuerKunden(vk){
  const k = vk.kalkulation || {};
  return {
    nummer: vk.nummer,
    version: vk.version,
    name: [vk.vorname, vk.nachname].filter(Boolean).join(' '),
    firma: vk.firma || null,
    leistungen: vk.leistungen_text || null,
    brutto_gesamt_cent: Number(vk.brutto_gesamt_cent) || 0,
    netto_gesamt_cent: Number(vk.netto_gesamt_cent) || 0,
    mwst_cent: Number(k.mwst_cent) || 0,
    mwst_satz: Number(k.mwst_satz) || 0,
    spanne: k.spanne ? { von_cent:k.spanne.von_cent, bis_cent:k.spanne.bis_cent } : null,
    positionen: (k.positionen || []).map(p => ({
      text: p.text, menge: p.menge || null, betrag_cent: p.betrag_cent, hinweis: p.hinweis || null,
    })),
    annahmen: k.annahmen || [],
    besichtigung_noetig: !!(vk.einstufung && vk.einstufung.besichtigung_noetig),
    reserved_until: vk.reserved_until || null,
    status: vk.status,
  };
}

/* Antwort für einen Link, dessen Aktion schon bestätigt wurde.
   Liest den heutigen Stand des Vorgangs und gibt genau das zurück,
   was der Kunde selbst ausgelöst hat – keine Beträge, keine
   Positionen, keine Kalkulationsdaten. */
async function bereitsBestaetigt(eintrag){
  const antwort = {
    ok: false,
    grund: 'verbraucht',
    bereits_bestaetigt: true,
    aktion: eintrag.verwendete_aktion || null,
    titel: (ALLE_AKTIONEN[eintrag.verwendete_aktion] || {}).titel || null,
    text: 'Diese Auswahl wurde bereits bestätigt.',
  };

  try {
    const sammlung = eintrag.dokument_typ === 'angebot' ? 'angebote' : 'vorkalkulationen';
    const dok = await holen(sammlung, eintrag.dokument_id);
    if(dok){
      antwort.nummer = dok.nummer || null;
      antwort.vorgemerkt_bis = dok.reserved_until || null;
      antwort.bestaetigt_am = dok.letzte_kundenaktion_am || eintrag.used_at || null;
    }
  } catch(err){
    /* Ohne die Zusatzangaben ist die Auskunft dünner, aber richtig. */
    console.error('Stand des Vorgangs nicht lesbar:', err.message);
  }
  return antwort;
}

export default async function handler(anfrage, antwort){
  if(anfrage.method !== 'POST'){
    /* Bewusst keine Fehlerseite mit Inhalt: Ein Scanner soll hier
       nichts finden, was er auswerten oder weiterverfolgen könnte. */
    antwort.setHeader('Allow', 'POST');
    return antworte(antwort, 405, { fehler:'Nur POST.' });
  }

  try {
    const koerper = await koerperLesen(anfrage);
    const { token, aktion, schritt, nachricht } = koerper;

    // ── Ratenbegrenzung ───────────────────────────────────────
    const grenze = await ratenGrenze('aktion:' + absenderKennung(anfrage), 20, 10);
    if(!grenze.ok) return antworte(antwort, 429, { fehler: grenze.text });

    /* Erst das Token prüfen, dann die Aktion: Welche Aktionen
       überhaupt zulässig sind, hängt am Dokumenttyp – und der steht
       im Token, nicht in der Anfrage des Browsers. */
    const pruefung = await tokenPruefen(token, aktion);
    if(!pruefung.ok){
      /* Ein verbrauchtes Token ist KEIN Fehler. Es heißt: Der Kunde
         hat schon bestätigt und ruft den Link ein zweites Mal auf –
         weil er den Tab offen ließ, zurückblätterte oder die Mail
         erneut öffnete. Ihm dafür eine Fehlermeldung zu zeigen,
         verunsichert ihn ohne Grund.

         Stattdessen die ruhige Auskunft, was bereits gebucht wurde.
         Verarbeitet wird nichts erneut. */
      if(pruefung.grund === 'verbraucht' && pruefung.eintrag){
        return antworte(antwort, 200, await bereitsBestaetigt(pruefung.eintrag));
      }
      return antworte(antwort, 200, { ok:false, grund: pruefung.grund, text: pruefung.text });
    }
    const eintrag = pruefung.eintrag;

    if(eintrag.dokument_typ === 'angebot'){
      /* ⚠️ `await` ist hier zwingend. Ohne es gibt die Funktion ein
         offenes Versprechen zurück, und ein Fehler daraus läuft am
         catch unten VORBEI – der Kunde sähe einen rohen 500 statt
         der abgefangenen Meldung. `return promise` und
         `return await promise` verhalten sich in einem try-Block
         unterschiedlich. */
      return await behandleAngebot(antwort, { eintrag, token, aktion, schritt, koerper });
    }

    if(!AKTIONEN[aktion]) return antworte(antwort, 400, { fehler:'Unbekannte Aktion.' });
    const regel = AKTIONEN[aktion];

    const vk = await holen('vorkalkulationen', eintrag.dokument_id);
    if(!vk) return antworte(antwort, 200, { ok:false, grund:'weg', text:'Dieser Vorgang ist nicht mehr vorhanden.' });

    /* Veraltete Fassung ablehnen: Wer noch die Mail zu Version 1
       offen hat, während Version 2 schon versendet wurde, darf
       nicht Version 1 bestätigen. */
    if(Number(eintrag.dokument_version) !== Number(vk.version)){
      return antworte(antwort, 200, { ok:false, grund:'veraltet',
        text:'Zu diesem Vorgang gibt es inzwischen eine neuere Fassung. Bitte verwenden Sie die zuletzt erhaltene E-Mail.' });
    }

    // ══════════════════════════════════════════════════════════
    //  SCHRITT 1: nur anzeigen
    // ══════════════════════════════════════════════════════════
    if(schritt !== 'bestaetigen'){
      /* `viewed_at` wird hier gesetzt – das ist der einzige Zustand,
         den das Ansehen ändert, und er ist bewusst folgenlos: Er
         verschiebt keine Frist, löst keine Mail aus und bindet
         niemanden. Nur wenn das Dokument noch unangetastet ist,
         damit ein späteres Ansehen keinen Fortschritt zurückdreht. */
      if(vk.status === 'SENT'){
        await aendern('vorkalkulationen', eintrag.dokument_id, {
          status:'VIEWED', viewed_at: jetztIso(),
        }).catch(err => console.error('viewed_at nicht gesetzt:', err.message));
      }
      return antworte(antwort, 200, {
        ok:true, schritt:'ansehen',
        aktion, titel: regel.titel, frage: regel.frage, textfeld: regel.textfeld,
        dokument: fuerKunden(vk),
      });
    }

    // ══════════════════════════════════════════════════════════
    //  SCHRITT 2: bestätigen
    // ══════════════════════════════════════════════════════════
    if(regel.textfeld === 'pflicht' && !String(nachricht || '').trim()){
      return antworte(antwort, 200, { ok:false, grund:'text_fehlt',
        text:'Bitte beschreiben Sie kurz, worum es geht.' });
    }

    /* Verbrauchen, bevor irgendetwas geschieht. Von zwei
       gleichzeitigen Klicks kommt genau einer durch. */
    const verbrauch = await tokenVerbrauchen(token, aktion);
    if(!verbrauch.ok){
      return antworte(antwort, 200, { ok:false, grund: verbrauch.grund, text: verbrauch.text });
    }

    /* Ab hier ist das Token verbraucht. Scheitert die eigentliche
       Zustandsänderung, wird die Sperre wieder freigegeben – sonst
       stünde der Kunde vor einem toten Link, obwohl nichts
       geschehen ist. Lieber ein zweiter Versuch als eine Sackgasse. */
    const statusVorher = vk.status;
    const aenderungen = {};
    let vorgemerktBis = null;

    if(regel.status) aenderungen.status = regel.status;

    if(aktion === 'vormerken'){
      const vorsortierung = await holen('einstellungen', 'vorsortierung');
      const tage = Number((vorsortierung && vorsortierung.vormerkung_tage) || 14);
      vorgemerktBis = new Date(Date.now() + tage * 86400000).toISOString();
      aenderungen.reserved_until = vorgemerktBis;
      aenderungen.reserved_at = jetztIso();
    }
    if(aktion === 'kein_kontakt') aenderungen.kein_kontakt = true;

    aenderungen.letzte_kundenaktion = aktion;
    aenderungen.letzte_kundenaktion_am = jetztIso();

    try {
      await aendern('vorkalkulationen', eintrag.dokument_id, aenderungen);
    } catch(err){
      await tokenFreigeben(token);
      console.error('Zustandsänderung fehlgeschlagen, Sperre freigegeben:', err.message);
      return antworte(antwort, 200, { ok:false, grund:'fehler',
        text:'Das hat gerade nicht geklappt – es wurde nichts geändert. Bitte versuchen Sie es in einem Moment noch einmal.' });
    }

    /* ══════════════════════════════════════════════════════════
       AB HIER IST DIE AKTION GEBUCHT
       ══════════════════════════════════════════════════════════
       Der Zustand steht dauerhaft in der Datenbank. Was jetzt noch
       folgt – Protokoll, Benachrichtigung, zwei E-Mails – ist
       Nacharbeit. Nichts davon darf dem Kunden als Fehlschlag
       erscheinen.

       Genau das war der gemeldete Fehler: `meldungAnAdmin()` warf
       bei einer bedingten null-Zeile, der Fehler lief ins äußere
       catch, und der Kunde las „Das hat nicht geklappt" – obwohl
       Status, Kundenreaktion und Bestätigungsmail längst durch
       waren. Ein einzelner fehlender try/catch in der Nacharbeit
       stellte eine erfolgreiche Buchung als Fehlschlag dar.

       Deshalb liegt ab hier ALLES in einem gemeinsamen Fangnetz,
       und die Erfolgsantwort steht außerhalb. */
    let reaktionId = null;

    try {
      const reaktion = await anlegen('kundenreaktionen', {
        aktion,
        dokument_typ:'vorkalkulation',
        dokument_id: eintrag.dokument_id,
        dokument_nummer: vk.nummer,
        dokument_version: Number(vk.version) || 1,
        kunde_key: vk.kunde_key || null,
        kunde_name: [vk.vorname, vk.nachname].filter(Boolean).join(' '),
        kunde_email: vk.email || null,
        nachricht: String(nachricht || '').slice(0, 2000) || null,
        status_vorher: statusVorher,
        status_nachher: aenderungen.status || statusVorher,
        bestaetigt: true,
        erledigt: false,
        zeitpunkt: jetztIso(),
      });
      reaktionId = reaktion.id;
    } catch(err){
      console.error('Kundenreaktion konnte nicht protokolliert werden:', err.message);
    }

    try {
      await anlegen('protokoll', {
        vorgang:'kundenaktion',
        aktion,
        dokument:'vorkalkulation', dokument_id: eintrag.dokument_id,
        nummer: vk.nummer, version: vk.version,
        status_vorher: statusVorher, status_nachher: aenderungen.status || statusVorher,
        reaktion_id: reaktionId,
        benutzer:'kunde', zeitpunkt: jetztIso(),
      });
    } catch(err){
      console.error('Protokolleintrag fehlgeschlagen:', err.message);
    }

    try {
      await anlegen('benachrichtigungen', {
        art:'kundenreaktion',
        titel: regel.titel + ' – ' + vk.nummer,
        text: [vk.vorname, vk.nachname].filter(Boolean).join(' '),
        ziel_bereich:'reaktionen', ziel_id: reaktionId,
        gelesen:false, createdAt: jetztIso(),
      });
    } catch(err){
      console.error('Benachrichtigung fehlgeschlagen:', err.message);
    }

    // ── Bestätigung an den Kunden ─────────────────────────────
    if(vk.email){
      try {
        const rechtstexte = await holen('einstellungen', 'rechtstexte').catch(() => null);
        const nachr = bestaetigung(vk, aktion, {
          bis: vorgemerktBis,
          vormerkungHinweis: (rechtstexte && rechtstexte.vormerkung_hinweis) || null,
        });
        await versende({
          an: vk.email, betreff: nachr.betreff, html: nachr.html, text: nachr.text,
          idempotenzSchluessel: `bestaetigung-${eintrag.dokument_id}-${aktion}-v${vk.version || 1}`,
          zweck:'bestaetigung', bezug:{ typ:'vorkalkulation', id: eintrag.dokument_id },
        });
      } catch(err){
        console.error('Bestätigungsmail fehlgeschlagen:', err.message);
      }
    }

    // ── Meldung an den Verwalter ──────────────────────────────
    try {
      const adminMail = process.env.ADMIN_MAIL || 'waschlurch@gmail.com';
      const meldung = meldungAnAdmin(regel.titel + ' – ' + vk.nummer, [
        ['Kunde', [vk.vorname, vk.nachname].filter(Boolean).join(' ') || '–'],
        ['Vorgang', vk.nummer],
        ['Neuer Stand', aenderungen.status || statusVorher],
        nachricht ? ['Nachricht', String(nachricht).slice(0, 300)] : null,
      ]);
      await versende({
        an: adminMail, betreff: meldung.betreff, html: meldung.html, text: meldung.text,
        idempotenzSchluessel: `admin-${reaktionId || eintrag.dokument_id}-${aktion}`,
        zweck:'adminmeldung', bezug:{ typ:'vorkalkulation', id: eintrag.dokument_id },
      });
    } catch(err){
      console.error('Meldung an den Verwalter fehlgeschlagen:', err.message);
    }

    /* Die Erfolgsantwort steht bewusst AUSSERHALB aller try-Blöcke
       oben. Sie wird gesendet, sobald der Zustand gebucht ist –
       unabhängig davon, ob Protokoll und E-Mails geklappt haben.

       Sie enthält Vorgangsnummer und Vormerkdatum, damit der Kunde
       einen Beleg vor Augen hat. Keine Positionen, keine Beträge,
       keine Kalkulationsdaten – die hat er im PDF, und hier sind
       sie überflüssig. */
    return antworte(antwort, 200, {
      ok:true, schritt:'bestaetigt', aktion,
      titel: regel.titel,
      nummer: vk.nummer,
      status_nachher: aenderungen.status || statusVorher,
      text: aktion === 'vormerken'
        ? 'Ihre Vorabkalkulation ist bis zum ' +
          new Date(vorgemerktBis).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' }) +
          ' vorgemerkt.'
        : regel.frage,
      vorgemerkt_bis: vorgemerktBis,
    });

  } catch(err){
    console.error('Kundenaktion fehlgeschlagen:', err);
    return antworte(antwort, 500, { fehler:'Da ist etwas schiefgegangen. Bitte versuchen Sie es später erneut.' });
  }
}


/* ══════════════════════════════════════════════════════════════
   VERBINDLICHES ANGEBOT – Kundenaktionen (Phase 7)
   ══════════════════════════════════════════════════════════════
   Die Beauftragung läuft über DREI Schritte:

     ansehen        → worum geht es
     zusammenfassung→ alle Vertragsangaben, Kenntnisnahmen ankreuzen
     bestaetigen    → „Zahlungspflichtig bestellen"

   Der mittlere Schritt ist die Umsetzung von § 312j Abs. 3 BGB:
   Unmittelbar vor der Bestellung müssen die wesentlichen Angaben
   noch einmal stehen, und die Schaltfläche muss eindeutig auf die
   Zahlungspflicht hinweisen. Ein einzelner Knopf in einer E-Mail
   genügt dem nicht.
   ══════════════════════════════════════════════════════════════ */
async function behandleAngebot(antwort, { eintrag, token, aktion, schritt, koerper }){
  const regel = ANGEBOT_AKTIONEN[aktion];
  if(!regel) return antworte(antwort, 400, { fehler:'Unbekannte Aktion.' });

  const a = await holen('angebote', eintrag.dokument_id);
  if(!a) return antworte(antwort, 200, { ok:false, grund:'weg', text:'Dieser Vorgang ist nicht mehr vorhanden.' });

  if(Number(eintrag.dokument_version) !== Number(a.version)){
    return antworte(antwort, 200, { ok:false, grund:'veraltet',
      text:'Zu diesem Angebot gibt es inzwischen eine neuere Fassung. Bitte verwenden Sie die zuletzt erhaltene E-Mail.' });
  }

  /* Ein bereits angenommenes Angebot lässt sich nicht erneut
     annehmen und auch nicht mehr ablehnen – es ist ein Vertrag. */
  if(a.status === 'ACCEPTED'){
    return antworte(antwort, 200, { ok:false, grund:'schon_angenommen',
      text:'Dieses Angebot haben Sie bereits beauftragt. Die Auftragsbestätigung ist unterwegs.' });
  }

  /* Abgelaufene Angebote dürfen nicht angenommen werden. Der Token
     läuft zwar mit der Gültigkeit ab, aber die Prüfung gehört
     zusätzlich hierher: Sie hängt am Dokument, nicht am Link. */
  if(aktion === 'beauftragen' && a.gueltig_bis
     && new Date(a.gueltig_bis).getTime() < Date.now()){
    return antworte(antwort, 200, { ok:false, grund:'abgelaufen',
      text:'Dieses Angebot ist am ' +
        new Date(a.gueltig_bis).toLocaleDateString('de-DE') +
        ' abgelaufen. Gern erstellen wir Ihnen ein neues.' });
  }

  const rechtstexte = await holen('einstellungen', 'rechtstexte').catch(() => null);

  // ── Schritt 1: ansehen ──────────────────────────────────────
  if(schritt !== 'bestaetigen'){
    if(a.status === 'SENT'){
      await aendern('angebote', eintrag.dokument_id, { status:'VIEWED', viewed_at: jetztIso() })
        .catch(err => console.error('viewed_at nicht gesetzt:', err.message));
    }
    return antworte(antwort, 200, {
      ok:true, schritt: regel.zweistufig ? 'zusammenfassung' : 'ansehen',
      dokument_typ:'angebot',
      aktion, titel: regel.titel, frage: regel.frage, textfeld: regel.textfeld,
      zweistufig: regel.zweistufig === true,
      dokument: angebotFuerKunden(a),
      rechtstexte: (regel.zweistufig && a.verbraucher) ? {
        widerruf: (rechtstexte && rechtstexte.widerruf_belehrung) || '',
        formular: (rechtstexte && rechtstexte.widerruf_formular) || '',
        vorzeitig: (rechtstexte && rechtstexte.vorzeitiger_beginn) || '',
      } : null,
    });
  }

  // ── Schritt 2: bestätigen ───────────────────────────────────
  if(regel.textfeld === 'pflicht' && !String(koerper.nachricht || '').trim()){
    return antworte(antwort, 200, { ok:false, grund:'text_fehlt',
      text:'Bitte beschreiben Sie kurz, worum es geht.' });
  }

  /* Bei der Beauftragung eines Verbrauchers muss die Kenntnisnahme
     ausdrücklich vorliegen. Sie wird NICHT vorangekreuzt und hier
     serverseitig geprüft – eine Checkbox, die nur im Browser
     geprüft wird, ist keine Zustimmung. */
  if(aktion === 'beauftragen'){
    if(!koerper.agb_gelesen){
      return antworte(antwort, 200, { ok:false, grund:'agb_fehlt',
        text:'Bitte bestätigen Sie, dass Sie die AGB zur Kenntnis genommen haben.' });
    }
    if(a.verbraucher && !koerper.widerruf_gelesen){
      return antworte(antwort, 200, { ok:false, grund:'widerruf_fehlt',
        text:'Bitte bestätigen Sie, dass Sie die Widerrufsbelehrung erhalten haben.' });
    }
  }

  const verbrauch = await tokenVerbrauchen(token, aktion);
  if(!verbrauch.ok){
    return antworte(antwort, 200, { ok:false, grund: verbrauch.grund, text: verbrauch.text });
  }

  const statusVorher = a.status;
  const aenderungen = {};
  if(regel.status) aenderungen.status = regel.status;
  aenderungen.letzte_kundenaktion = aktion;
  aenderungen.letzte_kundenaktion_am = jetztIso();

  let auftragId = null;

  if(aktion === 'beauftragen'){
    aenderungen.accepted_at = jetztIso();
    aenderungen.agb_gelesen = true;
    aenderungen.agb_version_akzeptiert = a.agb_version || null;
    aenderungen.widerruf_gelesen = a.verbraucher ? true : null;
    aenderungen.vorzeitiger_beginn = koerper.vorzeitiger_beginn === true;
    /* Unveränderbar festhalten: Die Fassung, die angenommen wurde. */
    aenderungen.angenommene_version = Number(a.version) || 1;
  }

  /* Scheitert die Annahme hier, wird die Sperre freigegeben. Sonst
     stünde der Kunde vor einem toten Link – und bei einer
     Beauftragung wäre das besonders misslich: Er hat bestellt, es
     ist nichts angekommen, und ein zweiter Versuch wird abgewiesen. */
  try {
    await aendern('angebote', eintrag.dokument_id, aenderungen);
  } catch(err){
    await tokenFreigeben(token);
    console.error('Annahme fehlgeschlagen, Sperre freigegeben:', err.message);
    return antworte(antwort, 200, { ok:false, grund:'fehler',
      text:'Das hat gerade nicht geklappt – es wurde nichts beauftragt. Bitte versuchen Sie es in einem Moment noch einmal.' });
  }

  /* ══════════════════════════════════════════════════════════════
     AB HIER IST DIE ANNAHME GEBUCHT
     ══════════════════════════════════════════════════════════════
     Bei `beauftragen` steht der Vertragsschluss jetzt in der
     Datenbank. Archiv, Auftrag, Protokoll und E-Mails sind
     Nacharbeit – kein Fehler darin darf dem Kunden anzeigen, seine
     Bestellung sei gescheitert. Er hat bestellt; ein zweiter
     Versuch würde am verbrauchten Token scheitern und ihn ratlos
     zurücklassen.

     Fehlt danach etwas, sieht Daniel das im Dashboard: Ein
     angenommenes Angebot ohne Auftrag steht dort mit dem Knopf
     „Auftrag daraus anlegen". */
  try {
  // ── Annahme: archivieren und Auftrag anlegen ────────────────
  if(aktion === 'beauftragen'){
    /* Der unveränderbare Nachweis des Vertragsschlusses. */
    await anlegen('dokument_versionen', {
      dokument_typ:'angebot_angenommen',
      dokument_id: eintrag.dokument_id,
      nummer: a.nummer, version: Number(a.version) || 1,
      status_beim_versand:'ACCEPTED',
      kunde_key: a.kunde_key || null,
      empfaenger: a.email || null,
      brutto_gesamt_cent: Number(a.brutto_gesamt_cent) || 0,
      netto_gesamt_cent: Number(a.netto_gesamt_cent) || 0,
      positionen: a.positionen || [],
      zahlungsbedingungen: a.zahlungsbedingungen || null,
      gueltig_bis: a.gueltig_bis || null,
      verbraucher: a.verbraucher === true,
      agb_version: a.agb_version || null,
      rechtstext_version: Number(a.rechtstext_version) || 1,
      widerruf_gelesen: a.verbraucher ? true : null,
      vorzeitiger_beginn: koerper.vorzeitiger_beginn === true,
      angenommen_am: jetztIso(),
      angenommen_durch:'kunde',
    });

    /* Auftrag anlegen. Bewusst mit Status `geplant` und OHNE
       Umsatzbuchung: Ein angenommenes Angebot ist ein Vertrag, aber
       noch kein Geldeingang. Erst `bezahlt` zählt als Einnahme –
       siehe `einnahmenGesamt()` im Dashboard. */
    if(a.kunde_key){
      const auftrag = await anlegen('auftraege', {
        kunde_key: a.kunde_key,
        kunde_name: [a.vorname, a.nachname].filter(Boolean).join(' ') || a.firma || '',
        titel: a.leistungen_text || ('Auftrag aus ' + a.nummer),
        datum: jetztIso().slice(0, 10),
        umsatz: Math.round(Number(a.brutto_gesamt_cent) || 0) / 100,
        kosten: Math.round(Number(a.kostenProEinsatz || 0) * (Number(a.multiplikator) || 1) * 100) / 100,
        gewinn: 0,
        status: 'geplant',
        notiz: 'Automatisch angelegt nach Annahme von ' + a.nummer,
        angebot_id: eintrag.dokument_id,
        angebot_nummer: a.nummer,
        createdAt: jetztIso(),
      });
      auftragId = auftrag.id;
      await aendern('angebote', eintrag.dokument_id, { auftrag_id: auftragId });
    }

    if(a.anfrage_id){
      await aendern('anfragen', a.anfrage_id, { status:'gebucht' })
        .catch(err => console.error('Anfrage nicht als gebucht markiert:', err.message));
    }
    if(a.quelle_vk_id){
      await aendern('vorkalkulationen', a.quelle_vk_id, {
        angebot_angenommen: true, angebot_angenommen_am: jetztIso(),
      }).catch(() => {});
    }
  }

  // ── Protokollieren ──────────────────────────────────────────
  const reaktion = await anlegen('kundenreaktionen', {
    aktion: aktion === 'beauftragen' ? 'angenommen' : aktion === 'ablehnen' ? 'abgelehnt' : aktion,
    dokument_typ:'angebot',
    dokument_id: eintrag.dokument_id,
    dokument_nummer: a.nummer,
    dokument_version: Number(a.version) || 1,
    kunde_key: a.kunde_key || null,
    kunde_name: [a.vorname, a.nachname].filter(Boolean).join(' '),
    kunde_email: a.email || null,
    nachricht: String(koerper.nachricht || '').slice(0, 2000) || null,
    status_vorher: statusVorher,
    status_nachher: aenderungen.status || statusVorher,
    bestaetigt: true, erledigt: false,
    auftrag_id: auftragId,
    zeitpunkt: jetztIso(),
  });

  await anlegen('protokoll', {
    vorgang: aktion === 'beauftragen' ? 'angebot_angenommen' : 'kundenaktion_angebot',
    aktion,
    dokument:'angebot', dokument_id: eintrag.dokument_id,
    nummer: a.nummer, version: a.version,
    status_vorher: statusVorher, status_nachher: aenderungen.status || statusVorher,
    brutto_cent: a.brutto_gesamt_cent,
    auftrag_id: auftragId,
    agb_version: a.agb_version || null,
    rechtstext_version: a.rechtstext_version || null,
    reaktion_id: reaktion.id,
    benutzer:'kunde', zeitpunkt: jetztIso(),
  });

  await anlegen('benachrichtigungen', {
    art: aktion === 'beauftragen' ? 'angebot_angenommen' : 'kundenreaktion',
    titel: regel.titel + ' – ' + a.nummer,
    text: [a.vorname, a.nachname].filter(Boolean).join(' ') +
          (aktion === 'beauftragen' ? ' · ' + ((Number(a.brutto_gesamt_cent)||0)/100).toFixed(2) + ' EUR' : ''),
    ziel_bereich:'angebote', ziel_id: eintrag.dokument_id,
    gelesen:false, createdAt: jetztIso(),
  }).catch(() => {});

  // ── Bestätigung an den Kunden ───────────────────────────────
  if(a.email){
    const nachricht = aktion === 'beauftragen'
      ? auftragsbestaetigung(a, jetztIso(), {
          widerruf: (rechtstexte && rechtstexte.widerruf_belehrung) || '',
          vorzeitig: (rechtstexte && rechtstexte.vorzeitiger_beginn) || '',
        })
      : bestaetigung(a, aktion === 'ablehnen' ? 'abgelehnt' : aktion, {});
    await versende({
      an: a.email, betreff: nachricht.betreff, html: nachricht.html, text: nachricht.text,
      idempotenzSchluessel: `angebot-${aktion}-${eintrag.dokument_id}-v${a.version || 1}`,
      zweck: aktion === 'beauftragen' ? 'auftragsbestaetigung' : 'bestaetigung',
      bezug:{ typ:'angebot', id: eintrag.dokument_id },
    }).catch(err => console.error('Bestätigungsmail fehlgeschlagen:', err.message));
  }

  const adminMail = process.env.ADMIN_MAIL || 'waschlurch@gmail.com';
  const meldung = meldungAnAdmin(regel.titel + ' – ' + a.nummer, [
    ['Kunde', [a.vorname, a.nachname].filter(Boolean).join(' ') || a.firma || '–'],
    ['Angebot', a.nummer + ' · Version ' + (a.version || 1)],
    ['Betrag', ((Number(a.brutto_gesamt_cent)||0)/100).toFixed(2) + ' EUR'],
    auftragId ? ['Auftrag', 'automatisch angelegt'] : null,
    koerper.nachricht ? ['Nachricht', String(koerper.nachricht).slice(0, 300)] : null,
  ]);
  await versende({
    an: adminMail, betreff: meldung.betreff, html: meldung.html, text: meldung.text,
    idempotenzSchluessel: `admin-${eintrag.dokument_id}-${aktion}-v${a.version || 1}`,
    zweck:'adminmeldung', bezug:{ typ:'angebot', id: eintrag.dokument_id },
  }).catch(err => console.error('Meldung an den Verwalter fehlgeschlagen:', err.message));

  } catch(err){
    /* Nacharbeit gescheitert – die Annahme selbst steht. */
    console.error('Nacharbeit nach der Annahme fehlgeschlagen (Buchung bleibt gültig):', err);
  }

  return antworte(antwort, 200, {
    ok:true, schritt:'bestaetigt', aktion, titel: regel.titel,
    nummer: a.nummer,
    status_nachher: aenderungen.status || statusVorher,
    text: aktion === 'beauftragen'
      ? 'Ihr Auftrag ist bei uns eingegangen. Die Auftragsbestätigung erhalten Sie gleich per E-Mail.'
      : regel.frage,
    auftrag_angelegt: !!auftragId,
  });
}
