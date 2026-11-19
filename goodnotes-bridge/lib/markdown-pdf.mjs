/* Markdown → Goodnotes-taugliches PDF.
   Liniertes/kariertes/gepunktetes Papier, optionaler Notizrand für
   Handschrift, helle/dunkle/cremefarbene Seiten. Nur Standardschriften,
   damit die Funktion ohne Schriftdateien läuft. */

import PDFDocument from 'pdfkit';

export const FORMATE = {
  a4:     [595.28, 841.89],
  letter: [612, 792],
  ipad:   [768, 1024],
  quer:   [841.89, 595.28],
};
export const MUSTER = ['blanko', 'liniert', 'punkte', 'kariert'];
export const THEMEN = {
  hell:  { papier: '#FFFFFF', tinte: '#16161A', leise: '#6B6B76', muster: '#C9D3E6', akzent: '#3D5AFE', code: '#F2F3F7' },
  creme: { papier: '#FBF7EE', tinte: '#221E18', leise: '#7A7064', muster: '#D9CFBD', akzent: '#C2410C', code: '#F1EADB' },
  dunkel:{ papier: '#1C1C1F', tinte: '#ECECEF', leise: '#9A9AA6', muster: '#34343B', akzent: '#8AA2FF', code: '#26262B' },
};

/* ── Zeichen auf WinAnsi abbilden (Standardschriften) ─────────── */
const ERSATZ = {
  '→':'->', '←':'<-', '↔':'<->', '⇄':'<->', '⇒':'=>', '⇐':'<=', '↑':'^', '↓':'v',
  '✓':'(ok)', '✔':'(ok)', '✗':'(x)', '✘':'(x)', '☐':'[ ]', '☑':'[x]', '★':'*', '☆':'*',
  '≤':'<=', '≥':'>=', '≠':'!=', '≈':'~', '∞':'unendl.', '−':'-', '‑':'-', '‐':'-',
  '…':'...', ' ':' ', ' ':' ', ' ':' ', '​':'',
};
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
export function saeubern(s){
  let raus = '';
  for(const ch of String(s)){
    if(ERSATZ[ch] !== undefined){ raus += ERSATZ[ch]; continue; }
    const c = ch.codePointAt(0);
    if((c >= 0x20 && c <= 0x7E) || (c >= 0xA0 && c <= 0xFF) || ch === '\n' || ch === '\t' || WINANSI_EXTRA.has(ch)) raus += ch;
    else if(c > 0xFFFF) raus += ''; // Emoji u. Ä. entfallen
    else raus += '?';
  }
  return raus.replace(/\t/g, '    ');
}

/* ── Markdown in Blöcke zerlegen ─────────────────────────────── */
export function zerlege(md){
  const zeilen = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const bloecke = [];
  let absatz = [];
  const absatzEnde = () => { if(absatz.length){ bloecke.push({ typ: 'absatz', text: absatz.join(' ') }); absatz = []; } };

  for(let i = 0; i < zeilen.length; i++){
    const z = zeilen[i];
    let m;
    if(/^\s*```/.test(z)){
      absatzEnde();
      const code = [];
      while(++i < zeilen.length && !/^\s*```/.test(zeilen[i])) code.push(zeilen[i]);
      bloecke.push({ typ: 'code', text: code.join('\n') });
    } else if((m = z.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))){
      absatzEnde(); bloecke.push({ typ: 'titel', ebene: m[1].length, text: m[2] });
    } else if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(z)){
      absatzEnde(); bloecke.push({ typ: 'linie' });
    } else if(/^\s*\|.*\|\s*$/.test(z)){
      absatzEnde();
      const zeilenT = [];
      for(; i < zeilen.length && /^\s*\|.*\|\s*$/.test(zeilen[i]); i++){
        const zellen = zeilen[i].trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
        if(zellen.every(c => /^:?-{2,}:?$/.test(c))) continue;
        zeilenT.push(zellen);
      }
      i--;
      bloecke.push({ typ: 'tabelle', zeilen: zeilenT });
    } else if((m = z.match(/^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/))){
      absatzEnde();
      const tiefe = Math.min(4, Math.floor(m[1].replace(/\t/g, '    ').length / 2));
      const geordnet = /\d/.test(m[2]);
      bloecke.push({
        typ: 'punkt', tiefe, geordnet,
        nummer: geordnet ? parseInt(m[2], 10) : null,
        haken: m[3] === undefined ? null : m[3].toLowerCase() === 'x',
        text: m[4],
      });
    } else if((m = z.match(/^\s*>\s?(.*)$/))){
      absatzEnde();
      const vorher = bloecke[bloecke.length - 1];
      if(vorher && vorher.typ === 'zitat' && m[1]) vorher.text += ' ' + m[1];
      else if(m[1]) bloecke.push({ typ: 'zitat', text: m[1] });
    } else if(!z.trim()){
      absatzEnde();
    } else if(absatz.length === 0 && bloecke.length && bloecke[bloecke.length - 1].typ === 'punkt' && /^\s{2,}\S/.test(z)){
      bloecke[bloecke.length - 1].text += ' ' + z.trim(); // Fortsetzung eines Listenpunkts
    } else {
      absatz.push(z.trim());
    }
  }
  absatzEnde();
  return bloecke;
}

/** **fett**, *kursiv*, `code`, [text](url) → Segmente */
export function inline(text){
  const segs = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let pos = 0, m;
  while((m = re.exec(text))){
    if(m.index > pos) segs.push({ text: text.slice(pos, m.index) });
    if(m[2] !== undefined){
      for(const s of inline(m[2])) segs.push({ ...s, fett: true });
    } else if(m[4] !== undefined){
      for(const s of inline(m[4])) segs.push({ ...s, kursiv: true });
    } else if(m[5] !== undefined) segs.push({ text: m[5], code: true });
    else segs.push({ text: m[6], link: m[7] });
    pos = re.lastIndex;
  }
  if(pos < text.length) segs.push({ text: text.slice(pos) });
  return segs.filter(s => s.text);
}

/* ── PDF erzeugen ────────────────────────────────────────────── */
export function erzeugePdf(markdown, opt = {}){
  const format = FORMATE[opt.format] ? opt.format : 'a4';
  const muster = MUSTER.includes(opt.muster) ? opt.muster : 'liniert';
  const thema = THEMEN[opt.thema] || THEMEN.hell;
  const rand = opt.rand !== false;
  const titel = saeubern(String(opt.titel || 'Goodnotes-Seite').slice(0, 120));
  const datum = opt.datum || new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

  const [B, H] = FORMATE[format];
  const skala = B / 595.28;
  const ZEILE = Math.round(24 * skala * 10) / 10; // Linienabstand = Schreibzeile
  const RAND_L = 56 * skala, RAND_O = 92 * skala, RAND_U = 64 * skala;
  const NOTIZ_B = rand ? Math.round(B * 0.30) : 0;
  const RAND_R = rand ? NOTIZ_B + 24 * skala : 56 * skala;
  const basis = 11 * skala;

  const doc = new PDFDocument({
    size: [B, H], margins: { top: RAND_O, bottom: RAND_U, left: RAND_L, right: RAND_R },
    bufferPages: true, autoFirstPage: false,
    info: { Title: titel, Author: 'Claude · Goodnotes Bridge', Creator: 'Goodnotes Bridge', Subject: 'Erstellt mit Claude' },
  });

  const breite = () => B - RAND_L - RAND_R;

  function papier(){
    doc.save();
    doc.rect(0, 0, B, H).fill(thema.papier);
    doc.lineWidth(0.5 * skala).strokeColor(thema.muster).fillColor(thema.muster);
    const oben = RAND_O - 6 * skala, unten = H - RAND_U + 8 * skala;
    if(muster === 'liniert'){
      for(let y = oben + ZEILE; y < unten; y += ZEILE) doc.moveTo(0, y).lineTo(B, y).stroke();
    } else if(muster === 'kariert'){
      const k = ZEILE / 2;
      doc.lineWidth(0.35 * skala).strokeOpacity(0.8);
      for(let y = oben; y < unten; y += k) doc.moveTo(0, y).lineTo(B, y).stroke();
      for(let x = 0; x < B; x += k) doc.moveTo(x, oben).lineTo(x, unten).stroke();
    } else if(muster === 'punkte'){
      const k = ZEILE / 1.2;
      for(let y = oben; y < unten; y += k) for(let x = k; x < B; x += k) doc.circle(x, y, 0.75 * skala).fill();
    }
    doc.strokeOpacity(1);
    if(rand){
      const x = B - NOTIZ_B;
      doc.lineWidth(1 * skala).strokeColor(thema.akzent).strokeOpacity(0.55)
         .moveTo(x, 0).lineTo(x, H).stroke().strokeOpacity(1);
      doc.font('Helvetica-Bold').fontSize(7 * skala).fillColor(thema.leise)
         .text('NOTIZEN', x + 14 * skala, 34 * skala, { lineBreak: false, characterSpacing: 1.6 * skala });
    }
    // Kopf
    doc.font('Helvetica-Bold').fontSize(7 * skala).fillColor(thema.akzent)
       .text('CLAUDE  ·  GOODNOTES', RAND_L, 34 * skala, { lineBreak: false, characterSpacing: 1.6 * skala });
    doc.font('Helvetica').fontSize(7.5 * skala).fillColor(thema.leise)
       .text(saeubern(datum), RAND_L, 46 * skala, { lineBreak: false });
    doc.restore();
    doc.x = RAND_L; doc.y = RAND_O;
  }
  doc.on('pageAdded', papier);
  doc.addPage();

  function schrift({ fett, kursiv, code } = {}, ueber = false){
    if(code) return 'Courier';
    if(ueber) return fett === false ? 'Times-Roman' : 'Times-Bold';
    if(fett && kursiv) return 'Helvetica-BoldOblique';
    if(fett) return 'Helvetica-Bold';
    if(kursiv) return 'Helvetica-Oblique';
    return 'Helvetica';
  }

  function schreibe(text, { x = RAND_L, w = breite(), groesse = basis, farbe = thema.tinte, ueber = false, gap = 2 * skala, fettAlles = false } = {}){
    const segs = inline(saeubern(text));
    if(!segs.length) return;
    doc.x = x;
    segs.forEach((s, i) => {
      const letzte = i === segs.length - 1;
      doc.font(schrift({ ...s, fett: s.fett || fettAlles }, ueber))
         .fontSize(s.code ? groesse * 0.92 : groesse)
         .fillColor(s.link ? thema.akzent : (s.code ? thema.akzent : farbe));
      const o = { width: w, continued: !letzte, lineGap: gap };
      if(s.link) { o.link = s.link; o.underline = true; }
      if(i === 0) doc.text(s.text, x, doc.y, o); else doc.text(s.text, o);
    });
    doc.underline = false;
  }

  function platz(noetig){
    if(doc.y + noetig > H - RAND_U) doc.addPage();
  }

  // Titel der Seite
  doc.font('Times-Bold').fontSize(26 * skala).fillColor(thema.tinte)
     .text(titel, RAND_L, RAND_O - 8 * skala, { width: breite(), lineGap: 2 });
  doc.moveDown(0.6);

  const bloecke = zerlege(markdown);
  // Erste H1 entfällt, wenn sie dem Seitentitel entspricht
  if(bloecke[0]?.typ === 'titel' && bloecke[0].ebene === 1 && saeubern(bloecke[0].text).trim() === titel.trim()) bloecke.shift();

  for(const b of bloecke){
    if(b.typ === 'titel'){
      const g = { 1: 20, 2: 16, 3: 13.5, 4: 12, 5: 11.5, 6: 11 }[b.ebene] * skala;
      platz(g * 3);
      doc.moveDown(b.ebene <= 2 ? 0.7 : 0.4);
      if(b.ebene === 2){
        doc.save().rect(RAND_L, doc.y + 3 * skala, 3 * skala, g * 0.95).fill(thema.akzent).restore();
        schreibe(b.text, { x: RAND_L + 10 * skala, w: breite() - 10 * skala, groesse: g, ueber: true });
      } else {
        schreibe(b.text, { groesse: g, ueber: b.ebene <= 2, fettAlles: b.ebene > 2 });
      }
      doc.moveDown(0.25);
    } else if(b.typ === 'absatz'){
      platz(basis * 2.4);
      schreibe(b.text);
      doc.moveDown(0.55);
    } else if(b.typ === 'punkt'){
      platz(basis * 2.4);
      const einzug = RAND_L + b.tiefe * 16 * skala;
      const marke = 16 * skala;
      const y0 = doc.y;
      doc.save();
      if(b.haken !== null){
        const k = 8.5 * skala, yk = y0 + 1.5 * skala;
        doc.lineWidth(0.9 * skala).roundedRect(einzug, yk, k, k, 1.6 * skala).stroke(thema.leise);
        if(b.haken) doc.lineWidth(1.4 * skala).strokeColor(thema.akzent)
          .moveTo(einzug + 1.8 * skala, yk + k / 2).lineTo(einzug + k / 2.4, yk + k - 2 * skala).lineTo(einzug + k - 1.5 * skala, yk + 1.6 * skala).stroke();
      } else if(b.geordnet){
        doc.font('Helvetica-Bold').fontSize(basis).fillColor(thema.akzent).text(`${b.nummer}.`, einzug, y0, { lineBreak: false });
      } else {
        doc.circle(einzug + 3 * skala, y0 + basis * 0.55, 1.9 * skala).fill(b.tiefe ? thema.leise : thema.akzent);
      }
      doc.restore();
      doc.y = y0;
      schreibe(b.text, { x: einzug + marke, w: breite() - (einzug - RAND_L) - marke,
                         farbe: b.haken ? thema.leise : thema.tinte });
      doc.moveDown(0.3);
    } else if(b.typ === 'zitat'){
      platz(basis * 2.4);
      const y0 = doc.y;
      schreibe(b.text, { x: RAND_L + 14 * skala, w: breite() - 14 * skala, farbe: thema.leise });
      doc.save().rect(RAND_L, y0, 2.5 * skala, Math.max(basis, doc.y - y0)).fill(thema.muster).restore();
      doc.moveDown(0.55);
    } else if(b.typ === 'code'){
      const text = saeubern(b.text);
      doc.font('Courier').fontSize(basis * 0.88);
      const h = doc.heightOfString(text, { width: breite() - 20 * skala }) + 16 * skala;
      platz(Math.min(h, H / 2));
      const y0 = doc.y;
      if(y0 + h <= H - RAND_U) doc.save().roundedRect(RAND_L, y0, breite(), h, 6 * skala).fill(thema.code).restore();
      doc.font('Courier').fontSize(basis * 0.88).fillColor(thema.tinte)
         .text(text, RAND_L + 10 * skala, y0 + 8 * skala, { width: breite() - 20 * skala });
      doc.y = Math.max(doc.y, y0 + h); doc.moveDown(0.6);
    } else if(b.typ === 'linie'){
      platz(20 * skala);
      doc.moveDown(0.4);
      doc.save().lineWidth(0.8 * skala).strokeColor(thema.leise).strokeOpacity(0.5)
         .moveTo(RAND_L, doc.y).lineTo(RAND_L + breite(), doc.y).stroke().restore();
      doc.moveDown(0.8);
    } else if(b.typ === 'tabelle' && b.zeilen.length){
      const spalten = Math.max(...b.zeilen.map(z => z.length));
      const sw = breite() / spalten, pad = 5 * skala, g = basis * 0.92;
      b.zeilen.forEach((zeile, zi) => {
        const font = zi === 0 ? 'Helvetica-Bold' : 'Helvetica';
        doc.font(font).fontSize(g);
        const hoehe = Math.max(...Array.from({ length: spalten }, (_, s) =>
          doc.heightOfString(saeubern((zeile[s] || '').replace(/\*\*|`/g, '')), { width: sw - 2 * pad }))) + 2 * pad;
        platz(hoehe);
        const y0 = doc.y;
        if(zi === 0) doc.save().rect(RAND_L, y0, breite(), hoehe).fill(thema.code).restore();
        for(let s = 0; s < spalten; s++){
          doc.font(font).fontSize(g).fillColor(thema.tinte)
             .text(saeubern((zeile[s] || '').replace(/\*\*|`/g, '')), RAND_L + s * sw + pad, y0 + pad, { width: sw - 2 * pad });
        }
        doc.save().lineWidth(0.5 * skala).strokeColor(thema.leise).strokeOpacity(0.4)
           .moveTo(RAND_L, y0 + hoehe).lineTo(RAND_L + breite(), y0 + hoehe).stroke().restore();
        doc.x = RAND_L; doc.y = y0 + hoehe;
      });
      doc.moveDown(0.7);
    }
  }

  // Fußzeile mit Seitenzahlen
  const { start, count } = doc.bufferedPageRange();
  for(let i = start; i < start + count; i++){
    doc.switchToPage(i);
    const alt = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5 * skala).fillColor(thema.leise)
       .text(`${i + 1} / ${count}`, RAND_L, H - 34 * skala, { width: B - RAND_L - RAND_R, align: 'right', lineBreak: false });
    doc.page.margins.bottom = alt;
  }

  return doc;
}

/** PDF als Buffer */
export function pdfBuffer(markdown, opt){
  return new Promise((ok, fehler) => {
    const doc = erzeugePdf(markdown, opt);
    const teile = [];
    doc.on('data', t => teile.push(t));
    doc.on('end', () => ok(Buffer.concat(teile)));
    doc.on('error', fehler);
    doc.end();
  });
}
