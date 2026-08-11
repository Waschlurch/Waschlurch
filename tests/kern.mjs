/* ══════════════════════════════════════════════════════════════
   PRÜFBARER KERN AUS admin.html
   ══════════════════════════════════════════════════════════════
   Holt die rechnenden Funktionen direkt aus `admin.html` heraus und
   führt sie ohne Browser und ohne Datenbank aus.

   Warum nicht einfach abschreiben: Eine zweite Kopie der
   Preisformel wäre nach der ersten Änderung falsch, und der Test
   würde weiter grün melden. Deshalb wird der echte Quelltext
   gelesen. Ändert jemand `berechneKalkulation`, ändert sich der
   Test automatisch mit – oder er bricht, was ebenfalls richtig ist.

   Aufruf:  node tests/lauf.mjs
   ══════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const QUELLE = path.join(hier, '..', 'admin.html');

const quelltext = fs.readFileSync(QUELLE, 'utf8');

/* ── Klammern zählen ──────────────────────────────────────────
   Findet das Ende eines Blocks, der bei `start` mit einer
   öffnenden Klammer beginnt. Zeichenketten, Vorlagenliterale,
   reguläre Ausdrücke und Kommentare werden übersprungen – ohne das
   würde eine geschweifte Klammer in einem Text den Zähler
   verstellen, und der Ausschnitt endete an der falschen Stelle. */
function blockEnde(text, start){
  const auf = text[start];
  const zu = auf === '{' ? '}' : auf === '[' ? ']' : ')';
  let tiefe = 0;
  let i = start;
  while(i < text.length){
    const c = text[i];
    const naechste = text[i+1];

    if(c === '/' && naechste === '/'){ i = text.indexOf('\n', i); if(i < 0) break; continue; }
    if(c === '/' && naechste === '*'){ i = text.indexOf('*/', i); if(i < 0) break; i += 2; continue; }

    if(c === '"' || c === "'" || c === '`'){
      const ende = c;
      i++;
      while(i < text.length){
        if(text[i] === '\\'){ i += 2; continue; }
        if(text[i] === ende) break;
        // Vorlagenliteral mit ${ ... } – die Klammern darin ignorieren
        if(ende === '`' && text[i] === '$' && text[i+1] === '{'){
          const innen = blockEnde(text, i+1);
          i = innen + 1; continue;
        }
        i++;
      }
      i++; continue;
    }

    if(c === auf) tiefe++;
    else if(c === zu){ tiefe--; if(tiefe === 0) return i; }
    i++;
  }
  throw new Error('Blockende nicht gefunden ab Zeichen ' + start);
}

/* Eine `function name(...)   { ... }` samt Rumpf herausschneiden. */
export function ziehFunktion(name){
  const muster = new RegExp('(?:^|\\n)\\s*(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'g');
  const t = muster.exec(quelltext);
  if(!t) throw new Error('Funktion nicht gefunden: ' + name);
  const start = quelltext.indexOf('function', t.index);
  const klammerAuf = quelltext.indexOf('(', start);
  const klammerZu = blockEnde(quelltext, klammerAuf);
  const rumpfAuf = quelltext.indexOf('{', klammerZu);
  const rumpfZu = blockEnde(quelltext, rumpfAuf);
  return quelltext.slice(start, rumpfZu + 1);
}

/* Eine `const name = { ... };` oder `const name = [ ... ];` holen. */
export function ziehKonstante(name){
  const muster = new RegExp('(?:^|\\n)\\s*const\\s+' + name + '\\s*=\\s*', 'g');
  const t = muster.exec(quelltext);
  if(!t) throw new Error('Konstante nicht gefunden: ' + name);
  const gleich = quelltext.indexOf('=', t.index);
  let i = gleich + 1;
  while(/\s/.test(quelltext[i])) i++;
  if(quelltext[i] === '{' || quelltext[i] === '['){
    const ende = blockEnde(quelltext, i);
    return 'const ' + name + ' = ' + quelltext.slice(i, ende + 1) + ';';
  }
  const zeilenEnde = quelltext.indexOf(';', i);
  return 'const ' + name + ' = ' + quelltext.slice(i, zeilenEnde) + ';';
}

/* ── Der Prüfstand ────────────────────────────────────────────
   Baut aus den echten Quelltextstücken eine ausführbare Einheit.
   Die wenigen Umgebungsteile, die im Browser aus dem DOM oder aus
   Firestore kommen, werden hier als schlichte Werte gesetzt – und
   zwar so, wie sie im Dashboard tatsächlich aussehen. */
export function baueKern(einstellungen = {}){
  const teile = [
    ziehKonstante('KALK_SERVICES_BASE'),
    ziehKonstante('KOSTEN_VORGABE'),
    ziehKonstante('VORSORTIERUNG_STANDARD'),
    ziehKonstante('PLANUNG_STANDARD'),
    ziehKonstante('PLZ_ENTFERNUNG_STANDARD'),
    ziehKonstante('EINSTUFUNG'),
    ziehKonstante('VK_STATUS'),
    ziehKonstante('ANG_STATUS'),
    ziehKonstante('ANG_STATUS_ALT'),
    ziehKonstante('KUNDENARTEN'),
    ziehKonstante('KALK_REGELVERSION'),

    ziehFunktion('zuCent'),
    ziehFunktion('ausCent'),
    ziehFunktion('euroCent'),
    ziehFunktion('prozentVonCent'),
    ziehFunktion('euro'),
    ziehFunktion('zahl'),
    ziehFunktion('vs'),
    ziehFunktion('vsListe'),
    ziehFunktion('pw'),
    ziehFunktion('angStatus'),
    ziehFunktion('statusText'),
    ziehFunktion('kundenart'),
    ziehFunktion('istVerbraucher'),
    ziehFunktion('entfernungTabelle'),
    ziehFunktion('entfernungFuer'),
    ziehFunktion('getKalkServiceRate'),
    ziehFunktion('getKostenSaetze'),
    ziehFunktion('mengenAusAnfrage'),
    ziehFunktion('berechneKalkulation'),
    ziehFunktion('einstufeAnfrage'),
    ziehFunktion('vorsortiereAnfrage'),
  ];

  const kopf = `
    "use strict";
    // Aus Firestore geladene Zustände – im Test frei setzbar
    let kalkulationData   = __kalkulation;
    let vorsortierungData = __vorsortierung;
    let planungData       = __planung;
    let vorgaben          = __vorgaben;

    // Wird sonst aus einstellungen/vorgaben gelesen
    function steuerSatzFuerBelege(){
      if(vorgaben.kleinunternehmer === true) return 0;
      const s = Number(vorgaben.mwst_satz);
      return isFinite(s) && s >= 0 ? s : 19;
    }
  `;

  const fuss = `
    return { berechneKalkulation, einstufeAnfrage, vorsortiereAnfrage,
             mengenAusAnfrage, entfernungFuer, zuCent, ausCent, euroCent,
             prozentVonCent, euro, zahl, vs, vsListe, pw, angStatus,
             statusText, kundenart, istVerbraucher,
             KALK_SERVICES_BASE, VORSORTIERUNG_STANDARD, EINSTUFUNG,
             VK_STATUS, ANG_STATUS, KALK_REGELVERSION };
  `;

  const bauer = new Function(
    '__kalkulation', '__vorsortierung', '__planung', '__vorgaben',
    kopf + '\n' + teile.join('\n\n') + '\n' + fuss
  );

  return bauer(
    einstellungen.kalkulation   || { general: {} },
    einstellungen.vorsortierung || {},
    einstellungen.planung       || {},
    einstellungen.vorgaben      || { mwst_satz: 19, kleinunternehmer: false }
  );
}
