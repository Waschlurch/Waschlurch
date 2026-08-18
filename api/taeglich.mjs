/* ══════════════════════════════════════════════════════════════
   /api/taeglich – der nächtliche Lauf
   ══════════════════════════════════════════════════════════════
   Von Vercel Cron um 6:00 Uhr aufgerufen. Er tut genau drei Dinge:

     1. erinnern, wenn eine Vormerkung bald endet
     2. abgelaufene Vormerkungen auf EXPIRED setzen
     3. abgelaufene verbindliche Angebote auf EXPIRED setzen

   Er vergibt KEINE Nummern, bewegt KEIN Geld, versendet KEIN
   Angebot und löscht NICHTS. Das ist der Grundsatz: Ein
   Automatismus darf aufräumen und erinnern, mehr nicht.

   Doppelschutz auf zwei Ebenen:
     · eine Laufmarke je Tag in `automatik_laeufe`
     · ein Idempotenzschlüssel je Mail in `mail_ereignisse`
   Die zweite Ebene ist die wichtigere – die Laufmarke schützt vor
   einem zweiten Start, der Mailschlüssel auch vor einem Absturz
   mitten im Lauf.
   ══════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';
import { alle, holen, aendern, anlegen, nurNeu, jetztIso } from '../lib/firestore.mjs';
import { tokenErzeugen, antworte } from '../lib/sicherheit.mjs';
import { versende } from '../lib/mail.mjs';
import { erinnerung, abgelaufen } from '../lib/vorlagen.mjs';
import { gmailEingerichtet } from '../lib/gmail.mjs';
import { synchronisiereAntworten } from '../lib/antworten.mjs';

const TAG = 86400000;

/* Tagesgenau vergleichen, nicht auf die Millisekunde. Sonst hinge
   es an der Uhrzeit des Laufs, ob eine Vormerkung als abgelaufen
   gilt – und ein Lauf um 06:00 käme zu einem anderen Ergebnis als
   einer um 06:02. */
function tageBis(isoDatum){
  if(!isoDatum) return null;
  const ziel = new Date(isoDatum); ziel.setHours(0,0,0,0);
  const heute = new Date();       heute.setHours(0,0,0,0);
  return Math.round((ziel.getTime() - heute.getTime()) / TAG);
}

export default async function handler(anfrage, antwort){
  /* ⚠️ NICHT über den Kopf `x-vercel-cron` prüfen.
     Der ist ein EINGEHENDER Header – jeder kann ihn mitschicken.
     Eine Prüfung darauf ist kein Schutz, sondern sieht nur so aus.

     Vercel sendet bei gesetzter Umgebungsvariable `CRON_SECRET`
     automatisch `Authorization: Bearer <CRON_SECRET>`. Nur das
     zählt hier.

     Und: Fehlt das Geheimnis, wird GESPERRT statt geöffnet. Die
     vorherige Fassung ließ bei fehlender Variable jeden durch, der
     den Kopf setzte – der Job wäre öffentlich auslösbar gewesen. */
  const geheimnis = process.env.CRON_SECRET || process.env.AKTION_GEHEIMNIS;
  if(!geheimnis){
    console.error('CRON_SECRET ist nicht gesetzt – der Lauf wird abgelehnt. Siehe EINRICHTUNG.md.');
    return antworte(antwort, 503, {
      fehler:'Der nächtliche Lauf ist noch nicht eingerichtet (CRON_SECRET fehlt).',
    });
  }

  /* Zeitkonstanter Vergleich: Ein Vergleich mit === bricht beim
     ersten abweichenden Zeichen ab und verrät über die Laufzeit,
     wie viele Zeichen stimmen.

     ⚠️ Über BYTES vergleichen, nicht über Zeichen. `timingSafeEqual`
     wirft einen RangeError, wenn die Puffer unterschiedlich lang
     sind – und `'äöü'.length` ist 3, `Buffer.byteLength('äöü')`
     aber 6. Ein Aufruf mit Umlauten passender Zeichenzahl hätte
     einen unbehandelten Absturz statt einer 401 ergeben. */
  const mitgeschickt = Buffer.from(String(anfrage.headers['authorization'] || ''), 'utf8');
  const erwartet = Buffer.from('Bearer ' + geheimnis, 'utf8');
  const gleich = mitgeschickt.length === erwartet.length
    && crypto.timingSafeEqual(mitgeschickt, erwartet);
  if(!gleich){
    return antworte(antwort, 401, { fehler:'Nicht berechtigt.' });
  }

  const heute = new Date().toISOString().slice(0, 10);
  const bericht = { tag: heute, erinnert:0, abgelaufen:0, angebote_abgelaufen:0, fehler:[] };

  try {
    // ── Laufmarke: höchstens einmal pro Tag ───────────────────
    const frisch = await nurNeu('automatik_laeufe', 'taeglich-' + heute, {
      gestartet: jetztIso(), typ:'taeglich',
    });
    if(!frisch){
      return antworte(antwort, 200, { ok:true, uebersprungen:true,
        hinweis:'Der Lauf für ' + heute + ' ist bereits erfolgt.' });
    }

    const [vorsortierung, rechtstexte] = await Promise.all([
      holen('einstellungen', 'vorsortierung'),
      holen('einstellungen', 'rechtstexte'),
    ]);
    const erinnernAb = Number((vorsortierung && vorsortierung.erinnerung_tage_vorher) || 3);
    const ablaufText = (rechtstexte && rechtstexte.ablauf_text)
      || 'Ihre unverbindliche Vorabkalkulation ist am {{DATUM}} abgelaufen. Die enthaltenen Preise und '
       + 'Kapazitäten sind nicht mehr vorgemerkt. Sie können jederzeit eine aktualisierte Kalkulation '
       + 'oder einen Besprechungstermin anfragen.';

    const kalkulationen = await alle('vorkalkulationen', 300);

    for(const vk of kalkulationen){
      try {
        const offen = ['SENT','VIEWED','RESERVED'].includes(vk.status);
        if(!offen) continue;
        if(vk.kein_kontakt) continue;

        /* Nur Vorgemerktes hat eine zugesagte Frist. Versendet und
           Angesehen laufen nicht von selbst ab – dem Kunden wurde
           dafür kein Datum genannt. */
        if(vk.status !== 'RESERVED' || !vk.reserved_until) continue;

        const rest = tageBis(vk.reserved_until);
        if(rest === null) continue;

        // ── Erinnerung ────────────────────────────────────────
        if(rest === erinnernAb || rest === 1){
          if(!vk.email) continue;
          const token = await tokenErzeugen({
            dokumentTyp:'vorkalkulation', dokumentId: vk.id,
            dokumentVersion: Number(vk.version) || 1, kundeKey: vk.kunde_key,
            aktionen:['termin','aenderung','kein_interesse'], gueltigTage: rest + 14,
          });
          const nachricht = erinnerung(vk, token, rest);
          const ergebnis = await versende({
            an: vk.email, betreff: nachricht.betreff, html: nachricht.html, text: nachricht.text,
            idempotenzSchluessel: `erinnerung-${vk.id}-v${vk.version || 1}-rest${rest}`,
            zweck:'erinnerung', bezug:{ typ:'vorkalkulation', id: vk.id },
          });
          if(!ergebnis.uebersprungen){
            bericht.erinnert++;
            await anlegen('protokoll', {
              vorgang:'erinnerung_versendet', dokument:'vorkalkulation', dokument_id: vk.id,
              nummer: vk.nummer, tage_rest: rest, benutzer:'automatik', zeitpunkt: jetztIso(),
            });
          }
          continue;
        }

        // ── Ablauf ────────────────────────────────────────────
        if(rest < 0){
          await aendern('vorkalkulationen', vk.id, {
            status:'EXPIRED', expired_at: jetztIso(),
          });
          bericht.abgelaufen++;

          await anlegen('protokoll', {
            vorgang:'vk_abgelaufen', dokument:'vorkalkulation', dokument_id: vk.id,
            nummer: vk.nummer, status_vorher: vk.status, status_nachher:'EXPIRED',
            benutzer:'automatik', zeitpunkt: jetztIso(),
          });
          await anlegen('benachrichtigungen', {
            art:'vk_abgelaufen', titel:'Vorabkalkulation ' + vk.nummer + ' abgelaufen',
            text:[vk.vorname, vk.nachname].filter(Boolean).join(' '),
            ziel_bereich:'vorkalkulationen', ziel_id: vk.id,
            gelesen:false, createdAt: jetztIso(),
          }).catch(() => {});

          if(vk.email){
            const token = await tokenErzeugen({
              dokumentTyp:'vorkalkulation', dokumentId: vk.id,
              dokumentVersion: Number(vk.version) || 1, kundeKey: vk.kunde_key,
              aktionen:['neue_kalkulation','termin','kein_kontakt'], gueltigTage: 60,
            });
            const nachricht = abgelaufen(vk, token, ablaufText);
            await versende({
              an: vk.email, betreff: nachricht.betreff, html: nachricht.html, text: nachricht.text,
              idempotenzSchluessel: `ablauf-${vk.id}-v${vk.version || 1}`,
              zweck:'ablauf', bezug:{ typ:'vorkalkulation', id: vk.id },
            });
          }
        }
      } catch(err){
        console.error('Fehler bei ' + vk.nummer + ':', err.message);
        bericht.fehler.push(vk.nummer + ': ' + err.message);
      }
    }

    // ── Verbindliche Angebote ─────────────────────────────────
    /* Bestandsschutz: Die Sammlung enthält Dokumente mit alten
       deutschen Statuswerten. Beide Schreibweisen zählen als offen. */
    const angebote = await alle('angebote', 300);
    for(const a of angebote){
      try {
        const st = a.status;
        const istOffen = st === 'SENT' || st === 'VIEWED' || st === 'versendet';
        if(!istOffen) continue;
        if(!a.gueltig_bis) continue;
        if(tageBis(a.gueltig_bis) >= 0) continue;

        await aendern('angebote', a.id, { status:'EXPIRED', expired_at: jetztIso() });
        bericht.angebote_abgelaufen++;
        await anlegen('protokoll', {
          vorgang:'angebot_abgelaufen', dokument:'angebot', dokument_id: a.id,
          nummer: a.nummer, status_vorher: st, status_nachher:'EXPIRED',
          benutzer:'automatik', zeitpunkt: jetztIso(),
        });
      } catch(err){
        bericht.fehler.push('Angebot ' + (a.nummer || a.id) + ': ' + err.message);
      }
    }

    /* ── Kundenantworten aus dem Akquise-Postfach (14.08.2026) ──
       Bewusst hier und nicht als eigener Cron-Eintrag: Der Hobby-
       Tarif bei Vercel lässt genau einen Lauf je Tag zu. Ein zweiter
       Eintrag ließe sich zwar schreiben, würde dort aber nicht
       ausgeführt – und niemand merkte, dass die Antworten nur beim
       Knopfdruck kommen.

       Ein Fehler hier darf den übrigen Lauf nicht mitreißen; die
       Vormerkungen und Angebote sind wichtiger als ein Abgleich, der
       sich in der nächsten Stunde von Hand nachholen lässt. */
    if(gmailEingerichtet()){
      try {
        const antwortenBericht = await synchronisiereAntworten();
        bericht.antworten_neu = antwortenBericht.neue_antworten;
        bericht.antworten_gespraeche = antwortenBericht.gespraeche;
      } catch(err){
        bericht.fehler.push('Antwortabgleich: ' + err.message);
      }
    }

    await aendern('automatik_laeufe', 'taeglich-' + heute, {
      beendet: jetztIso(), bericht: JSON.stringify(bericht),
    }).catch(() => {});

    return antworte(antwort, 200, { ok:true, ...bericht });

  } catch(err){
    console.error('Täglicher Lauf fehlgeschlagen:', err);
    return antworte(antwort, 500, { fehler: err.message, bericht });
  }
}
