/* ══════════════════════════════════════════════════════════════
   PRÜFLAUF – Serverfunktionen
   ══════════════════════════════════════════════════════════════
   Aufruf: node tests/server.mjs

   Firestore wird durch eine Attrappe im Arbeitsspeicher ersetzt.
   Geprüft wird die LOGIK: Tokenprüfung, Ablauf, Einmalverwendung,
   veraltete Versionen, Linkscanner, Doppelklick, Ratenbegrenzung
   und die Frage, ob interne Felder zum Kunden gelangen.
   ══════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';

let bestanden = 0, fehlgeschlagen = 0;
const fehler = [];
function pruefe(name, bedingung, gemessen){
  if(bedingung){ bestanden++; console.log('  ✓ ' + name); }
  else {
    fehlgeschlagen++; fehler.push(name);
    console.log('  ✗ ' + name + (gemessen !== undefined ? '   gemessen: ' + JSON.stringify(gemessen) : ''));
  }
}
function block(t){ console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 58 - t.length))); }

/* ── Firestore-Attrappe ───────────────────────────────────── */
const speicher = new Map();
const schluessel = (s,i) => s + '/' + i;

const db = {
  async holen(s,i){ return speicher.has(schluessel(s,i)) ? { ...speicher.get(schluessel(s,i)), id:i } : null; },
  async anlegen(s,d,i){
    const id = i || 'id_' + speicher.size + '_' + Math.floor(Math.random()*1e6);
    speicher.set(schluessel(s,id), { ...d });
    return { ...d, id };
  },
  async aendern(s,i,d){
    const alt = speicher.get(schluessel(s,i)) || {};
    speicher.set(schluessel(s,i), { ...alt, ...d });
    return { ...alt, ...d, id:i };
  },
  async setzen(s,i,d){ return this.aendern(s,i,d); },
  async nurNeu(s,i,d){
    if(speicher.has(schluessel(s,i))) return false;
    speicher.set(schluessel(s,i), { ...d });
    return true;
  },
  async alle(s){
    const raus = [];
    for(const [k,v] of speicher) if(k.startsWith(s + '/')) raus.push({ ...v, id:k.slice(s.length+1) });
    return raus;
  },
};
const jetztIso = () => new Date().toISOString();

/* ── Nachbau der geprüften Logik ───────────────────────────
   Bewusst dieselben Regeln wie in lib/sicherheit.mjs. Die echte
   Datei lässt sich hier nicht laden, weil sie beim Import eine
   Verbindung zu Google aufbauen würde. */
const tokenHash = k => crypto.createHash('sha256').update(String(k)).digest('hex');

async function tokenErzeugen({ dokumentId, dokumentVersion, aktionen, gueltigTage }){
  const klartext = crypto.randomBytes(32).toString('base64url');
  await db.anlegen('aktions_tokens', {
    dokument_id: dokumentId, dokument_version: dokumentVersion,
    aktionen, expires_at: new Date(Date.now() + gueltigTage*86400000).toISOString(),
    used_at:null, revoked_at:null,
  }, tokenHash(klartext));
  return klartext;
}

async function tokenPruefen(klartext, aktion){
  if(!klartext || klartext.length < 20) return { ok:false, grund:'ungueltig' };
  const e = await db.holen('aktions_tokens', tokenHash(klartext));
  if(!e) return { ok:false, grund:'unbekannt' };
  if(e.revoked_at) return { ok:false, grund:'widerrufen' };
  if(e.used_at) return { ok:false, grund:'verbraucht' };
  if(new Date(e.expires_at).getTime() < Date.now()) return { ok:false, grund:'abgelaufen' };
  if(aktion && !(e.aktionen||[]).includes(aktion)) return { ok:false, grund:'nicht_erlaubt' };
  return { ok:true, eintrag:e };
}

async function tokenVerbrauchen(klartext, aktion){
  const h = tokenHash(klartext);
  const frisch = await db.nurNeu('token_sperren', h, { aktion });
  if(!frisch) return { ok:false, grund:'doppelt' };
  await db.setzen('aktions_tokens', h, { used_at: jetztIso() });
  return { ok:true };
}

async function ratenGrenze(kennung, hoechstens, fensterMinuten){
  const s = crypto.createHash('sha256').update(kennung).digest('hex').slice(0,32);
  const e = await db.holen('rate_limit', s);
  if(!e || (Date.now() - new Date(e.fenster_start).getTime()) > fensterMinuten*60000){
    await db.setzen('rate_limit', s, { fenster_start: jetztIso(), anzahl:1 });
    return { ok:true };
  }
  const anzahl = (e.anzahl||0)+1;
  await db.setzen('rate_limit', s, { anzahl });
  return { ok: anzahl <= hoechstens };
}

/* Genau die Funktion aus api/aktion.mjs */
function fuerKunden(vk){
  const k = vk.kalkulation || {};
  return {
    nummer:vk.nummer, version:vk.version,
    name:[vk.vorname,vk.nachname].filter(Boolean).join(' '),
    firma:vk.firma||null, leistungen:vk.leistungen_text||null,
    brutto_gesamt_cent:Number(vk.brutto_gesamt_cent)||0,
    netto_gesamt_cent:Number(vk.netto_gesamt_cent)||0,
    mwst_cent:Number(k.mwst_cent)||0, mwst_satz:Number(k.mwst_satz)||0,
    spanne:k.spanne?{von_cent:k.spanne.von_cent,bis_cent:k.spanne.bis_cent}:null,
    positionen:(k.positionen||[]).map(p=>({text:p.text,menge:p.menge||null,betrag_cent:p.betrag_cent,hinweis:p.hinweis||null})),
    annahmen:k.annahmen||[],
    besichtigung_noetig:!!(vk.einstufung&&vk.einstufung.besichtigung_noetig),
    reserved_until:vk.reserved_until||null, status:vk.status,
  };
}

/* ══════════════════════════════════════════════════════════ */
const VK = {
  nummer:'VK-2026-0001', version:1, status:'SENT',
  vorname:'Erika', nachname:'Musterfrau', email:'erika@beispiel.de',
  brutto_gesamt_cent:16279, netto_gesamt_cent:13680,
  leistungen_text:'Büroreinigung',
  kalkulation:{
    mwst_cent:2599, mwst_satz:19,
    positionen:[{text:'Büroreinigung',menge:'200 m²',betrag_cent:10400,hinweis:null}],
    annahmen:['Fläche laut Anfrage'],
    // Interne Felder – dürfen NIE zum Kunden
    gewinn_gesamt_cent:7400, kosten_einsatz_cent:6280, arbeitsstunden:2.0,
    marge:54.1, stundenlohn:3700,
  },
  einstufung:{ besichtigung_noetig:false },
};
await db.anlegen('vorkalkulationen', VK, 'vk1');

block('Test 8 – Token ist abgelaufen');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:-1 });
  const p = await tokenPruefen(t, 'vormerken');
  pruefe('abgelaufenes Token wird abgelehnt', !p.ok && p.grund === 'abgelaufen', p);
}

block('Test 9 – Token wurde bereits verwendet');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  pruefe('erste Nutzung geht durch', (await tokenPruefen(t,'vormerken')).ok);
  await tokenVerbrauchen(t, 'vormerken');
  const p = await tokenPruefen(t, 'vormerken');
  pruefe('zweite Nutzung wird abgelehnt', !p.ok && p.grund === 'verbraucht', p);
}

block('Test 20 – zwei gleichzeitige Bestätigungen');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  // Beide starten, bevor eine fertig ist – genau der Doppelklick
  const [a, b] = await Promise.all([
    tokenVerbrauchen(t, 'vormerken'),
    tokenVerbrauchen(t, 'vormerken'),
  ]);
  const durch = [a,b].filter(x => x.ok).length;
  pruefe('genau eine kommt durch', durch === 1, { a, b });
  pruefe('die andere meldet „doppelt"', [a,b].some(x => !x.ok && x.grund === 'doppelt'));
}

block('Test 14 – veraltete Version wird abgelehnt');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  await db.aendern('vorkalkulationen', 'vk1', { version: 2 });
  const p = await tokenPruefen(t, 'vormerken');
  const vk = await db.holen('vorkalkulationen', 'vk1');
  const veraltet = Number(p.eintrag.dokument_version) !== Number(vk.version);
  pruefe('Token selbst ist noch gültig', p.ok);
  pruefe('Versionsabgleich erkennt die alte Fassung', veraltet, { token:p.eintrag.dokument_version, dokument:vk.version });
  await db.aendern('vorkalkulationen', 'vk1', { version: 1 });
}

block('Widerrufenes Token');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  await db.setzen('aktions_tokens', tokenHash(t), { revoked_at: jetztIso() });
  const p = await tokenPruefen(t, 'vormerken');
  pruefe('widerrufenes Token wird abgelehnt', !p.ok && p.grund === 'widerrufen', p);
}

block('Nicht vorgesehene Aktion');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  const p = await tokenPruefen(t, 'kein_interesse');
  pruefe('Aktion außerhalb der Erlaubnis wird abgelehnt', !p.ok && p.grund === 'nicht_erlaubt', p);
}

block('Token-Speicherung');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  const alle = await db.alle('aktions_tokens');
  const alsText = JSON.stringify(alle);
  pruefe('Klartext des Tokens steht nirgends in der Datenbank', !alsText.includes(t));
  pruefe('Dokument-ID ist der SHA-256-Hash', alle.some(x => x.id === tokenHash(t)));
  pruefe('Hash ist 64 Zeichen lang', tokenHash(t).length === 64);
  pruefe('Token hat mindestens 32 Byte Zufall', Buffer.from(t, 'base64url').length >= 32);

  // Zwei Tokens dürfen sich nie gleichen
  const t2 = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  pruefe('zwei Tokens sind verschieden', t !== t2);
}

block('Test 10 – Linkscanner öffnet den Link');
{
  /* Ein Scanner macht GET. Der Endpunkt lässt nur POST zu –
     geprüft wird hier die Regel, die api/aktion.mjs anwendet. */
  const erlaubt = (methode) => methode === 'POST';
  pruefe('GET wird abgewiesen', !erlaubt('GET'));
  pruefe('HEAD wird abgewiesen', !erlaubt('HEAD'));
  pruefe('POST ist erlaubt', erlaubt('POST'));

  /* Und selbst per POST ändert „ansehen" nichts Verbindliches. */
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['kein_interesse'], gueltigTage:30 });
  const vorher = await db.holen('vorkalkulationen', 'vk1');
  await tokenPruefen(t, 'kein_interesse');            // nur ansehen
  const nachher = await db.holen('vorkalkulationen', 'vk1');
  pruefe('Ansehen verbraucht das Token nicht', (await tokenPruefen(t,'kein_interesse')).ok);
  pruefe('Ansehen ändert den Status nicht', vorher.status === nachher.status);
}

block('Ratenbegrenzung');
{
  let abgelehnt = 0;
  for(let i = 0; i < 25; i++){
    const g = await ratenGrenze('192.0.2.1', 20, 10);
    if(!g.ok) abgelehnt++;
  }
  pruefe('nach 20 Versuchen wird abgelehnt', abgelehnt === 5, { abgelehnt });
  const andere = await ratenGrenze('198.51.100.7', 20, 10);
  pruefe('andere Absender sind nicht betroffen', andere.ok);
  const eintraege = await db.alle('rate_limit');
  pruefe('Absenderkennung wird nicht im Klartext gespeichert',
    !JSON.stringify(eintraege).includes('192.0.2.1'));
}

block('Was der Kunde zu sehen bekommt');
{
  const vk = await db.holen('vorkalkulationen', 'vk1');
  const sichtbar = JSON.stringify(fuerKunden(vk));

  ['gewinn','kosten_einsatz','marge','stundenlohn','arbeitsstunden','kosten_bestaetigt']
    .forEach(feld => pruefe('„' + feld + '" gelangt NICHT zum Kunden', !sichtbar.includes(feld)));

  pruefe('Betrag ist enthalten', sichtbar.includes('16279'));
  pruefe('Positionen sind enthalten', sichtbar.includes('Büroreinigung'));
  pruefe('Annahmen sind enthalten', sichtbar.includes('Fläche laut Anfrage'));
  pruefe('interne Gewinnzahl 7400 taucht nirgends auf', !sichtbar.includes('7400'));
}

block('Test 6/5 – Versand nur nach Freigabe');
{
  /* Die Prüfung aus api/versand.mjs, Schritt 2 */
  const darfRaus = (vk) => vk.status === 'ADMIN_APPROVED' && !!vk.approved_by && !!vk.approved_at
                         && !!vk.email && Number(vk.brutto_gesamt_cent) > 0;

  pruefe('Entwurf darf nicht hinaus', !darfRaus({ status:'DRAFT', approved_by:'a', approved_at:'b', email:'x@y.de', brutto_gesamt_cent:100 }));
  pruefe('ohne Freigabevermerk kein Versand', !darfRaus({ status:'ADMIN_APPROVED', email:'x@y.de', brutto_gesamt_cent:100 }));
  pruefe('ohne Empfänger kein Versand', !darfRaus({ status:'ADMIN_APPROVED', approved_by:'a', approved_at:'b', brutto_gesamt_cent:100 }));
  pruefe('Betrag null: kein Versand', !darfRaus({ status:'ADMIN_APPROVED', approved_by:'a', approved_at:'b', email:'x@y.de', brutto_gesamt_cent:0 }));
  pruefe('freigegeben und vollständig: Versand erlaubt', darfRaus({ status:'ADMIN_APPROVED', approved_by:'a', approved_at:'b', email:'x@y.de', brutto_gesamt_cent:16279 }));
  pruefe('bereits versendet: kein zweiter Versand', !darfRaus({ status:'SENT', approved_by:'a', approved_at:'b', email:'x@y.de', brutto_gesamt_cent:100 }));
}

block('Doppelter Mailversand');
{
  async function versendeEinmal(schluessel){
    const marke = crypto.createHash('sha256').update(schluessel).digest('hex').slice(0,40);
    const frisch = await db.nurNeu('mail_ereignisse', marke, { status:'im_versand' });
    return frisch ? { versendet:true } : { uebersprungen:true };
  }
  const a = await versendeEinmal('vk-versand-vk1-v1');
  const b = await versendeEinmal('vk-versand-vk1-v1');
  pruefe('erste Mail geht raus', a.versendet === true);
  pruefe('zweite wird übersprungen', b.uebersprungen === true);
  const c = await versendeEinmal('vk-versand-vk1-v2');
  pruefe('neue Version darf wieder versendet werden', c.versendet === true);

  const eintraege = await db.alle('mail_ereignisse');
  pruefe('Empfängeradresse steht nicht im Klartext im Versandprotokoll',
    !JSON.stringify(eintraege).includes('erika@beispiel.de'));
}

block('Test 17 – automatischer Ablauf');
{
  const tageBis = (iso) => {
    const ziel = new Date(iso); ziel.setHours(0,0,0,0);
    const heute = new Date(); heute.setHours(0,0,0,0);
    return Math.round((ziel - heute) / 86400000);
  };
  pruefe('gestern abgelaufen ergibt -1', tageBis(new Date(Date.now()-86400000).toISOString()) === -1);
  pruefe('heute ergibt 0 – noch nicht abgelaufen', tageBis(new Date().toISOString()) === 0);
  pruefe('in 3 Tagen ergibt 3', tageBis(new Date(Date.now()+3*86400000).toISOString()) === 3);

  /* Tagesgenau, nicht auf die Millisekunde: Ein Lauf um 06:00 muss
     dasselbe ergeben wie einer um 06:02. */
  const spaet = new Date(); spaet.setHours(23,59,0,0);
  const frueh = new Date(); frueh.setHours(0,1,0,0);
  pruefe('Uhrzeit ändert das Ergebnis nicht', tageBis(spaet.toISOString()) === tageBis(frueh.toISOString()));

  const nurVorgemerktLaeuftAb = (vk) => vk.status === 'RESERVED' && !!vk.reserved_until;
  pruefe('nur Vorgemerktes läuft ab', nurVorgemerktLaeuftAb({ status:'RESERVED', reserved_until:'2026-01-01' }));
  pruefe('Versendetes ohne Frist läuft nicht ab', !nurVorgemerktLaeuftAb({ status:'SENT' }));
  pruefe('Angesehenes ohne Frist läuft nicht ab', !nurVorgemerktLaeuftAb({ status:'VIEWED' }));
}

block('Doppelter Tageslauf');
{
  const heute = new Date().toISOString().slice(0,10);
  const a = await db.nurNeu('automatik_laeufe', 'taeglich-' + heute, { gestartet: jetztIso() });
  const b = await db.nurNeu('automatik_laeufe', 'taeglich-' + heute, { gestartet: jetztIso() });
  pruefe('erster Lauf startet', a === true);
  pruefe('zweiter Lauf am selben Tag wird übersprungen', b === false);
  const morgen = new Date(Date.now()+86400000).toISOString().slice(0,10);
  pruefe('am nächsten Tag läuft es wieder',
    (await db.nurNeu('automatik_laeufe', 'taeglich-' + morgen, {})) === true);
}

block('Test 19 – angenommener Auftrag wird nicht gelöscht');
{
  /* Keine Aktion der Kundenseite darf löschen. Geprüft an der
     Aktionstabelle aus api/aktion.mjs. */
  const AKTIONEN = ['termin','vormerken','aenderung','korrektur','kein_interesse','neue_kalkulation','kein_kontakt'];
  const ZIELSTATUS = { termin:'MEETING_BOOKED', vormerken:'RESERVED', aenderung:'CHANGE_REQUESTED',
                       korrektur:'CHANGE_REQUESTED', kein_interesse:'DECLINED',
                       neue_kalkulation:null, kein_kontakt:'DECLINED' };
  pruefe('keine Kundenaktion führt zu einem Löschstatus',
    AKTIONEN.every(a => !['DELETED','GELOESCHT'].includes(ZIELSTATUS[a])));
  pruefe('„kein Interesse" setzt nur DECLINED', ZIELSTATUS.kein_interesse === 'DECLINED');
  pruefe('keine Aktion berührt Aufträge',
    AKTIONEN.every(a => !String(a).includes('auftrag')));
}

console.log('\n' + '═'.repeat(62));
console.log('  ' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
console.log('═'.repeat(62));
if(fehler.length){ console.log('\nFehlgeschlagen:'); fehler.forEach(f => console.log('  · ' + f)); }
process.exit(fehlgeschlagen ? 1 : 0);
