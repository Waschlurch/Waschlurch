/* Diagramme als SVG, ohne Bibliothek. Balken, gestapelte Balken, Linie mit Spanne, Schlaffenster, Sparkline.
   Jede Spalte hat eine Trefferfläche über die ganze Höhe; Tooltip folgt Maus und Finger. */

const NS = 'http://www.w3.org/2000/svg';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export const tagKurz = (t, lang = false) => { const d = new Date(t + 'T12:00:00Z'); return lang ? `${WT[d.getUTCDay()]}, ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}` : `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`; };
const wt = t => WT[new Date(t + 'T12:00:00Z').getUTCDay()];
const istDatum = t => /^\d{4}-\d{2}-\d{2}$/.test(t);
const achsText = (t, n) => !istDatum(t) ? t : n <= 10 ? wt(t) : tagKurz(t);

function schoen(max, min = 0, schritte = 3){
  if(max === min) max = min + 1;
  const roh = (max - min) / schritte, p = 10 ** Math.floor(Math.log10(roh)), n = roh / p;
  const s = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  const lo = Math.floor(min / s) * s, hi = Math.ceil(max / s) * s;
  const ticks = []; for(let v = lo; v <= hi + s / 2; v += s) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
}

const kompakt = v => Math.abs(v) >= 10000 ? (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + 'k' : Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k' : v.toLocaleString('de-DE', { maximumFractionDigits: 1 });

function tooltipEl(wrap){
  let t = wrap.querySelector('.tt');
  if(!t){ t = document.createElement('div'); t.className = 'tt'; t.setAttribute('role', 'status'); wrap.appendChild(t); }
  return t;
}

/** Gemeinsames Gerüst: Achsen, Raster, Trefferflächen, Tooltip. */
function geruest(el, { tage, hoehe = 220, y, yFormat = kompakt, links = 40, zeichne, tooltip, label }){
  const breite = Math.max(280, el.clientWidth);
  const oben = 12, unten = 26, rechts = 8;
  const pw = breite - links - rechts, ph = hoehe - oben - unten;
  const band = pw / Math.max(1, tage.length);
  const X = i => links + band * i + band / 2;
  const Y = v => oben + ph - (v - y.lo) / (y.hi - y.lo) * ph;
  let s = `<svg xmlns="${NS}" viewBox="0 0 ${breite} ${hoehe}" width="${breite}" height="${hoehe}" role="img" aria-label="${esc(label || '')}">`;
  for(const t of y.ticks){
    s += `<line class="gl" x1="${links}" x2="${breite - rechts}" y1="${Y(t)}" y2="${Y(t)}"/>`;
    s += `<text class="ax" x="${links - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(yFormat(t))}</text>`;
  }
  const jede = Math.ceil(tage.length / Math.max(2, Math.floor(pw / 54)));
  tage.forEach((t, i) => {
    if((tage.length - 1 - i) % jede) return;
    s += `<text class="ax" x="${X(i)}" y="${hoehe - 8}" text-anchor="middle">${esc(achsText(t, tage.length))}</text>`;
  });
  s += `<g class="marks">${zeichne({ X, Y, band, ph, oben, links, breite, rechts })}</g>`;
  s += `<line class="cursor" x1="0" x2="0" y1="${oben}" y2="${oben + ph}" opacity="0"/>`;
  tage.forEach((t, i) => { s += `<rect class="hit" data-i="${i}" x="${links + band * i}" y="${oben}" width="${band}" height="${ph}"/>`; });
  s += '</svg>';
  el.innerHTML = s;
  const svg = el.querySelector('svg'), tt = tooltipEl(el), cur = svg.querySelector('.cursor');
  const zeige = i => {
    const html = tooltip(i);
    if(!html){ tt.classList.remove('an'); cur.setAttribute('opacity', 0); return; }
    tt.innerHTML = html; tt.classList.add('an');
    cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i)); cur.setAttribute('opacity', 1);
    svg.querySelectorAll('.marks [data-i]').forEach(m => m.classList.toggle('aus', +m.dataset.i !== i));
    const x = X(i) / breite * el.clientWidth, w = tt.offsetWidth;
    tt.style.left = Math.min(el.clientWidth - w, Math.max(0, x - w / 2)) + 'px';
  };
  const weg = () => { tt.classList.remove('an'); cur.setAttribute('opacity', 0); svg.querySelectorAll('.marks .aus').forEach(m => m.classList.remove('aus')); };
  svg.addEventListener('pointermove', e => { const h = e.target.closest('.hit'); if(h) zeige(+h.dataset.i); });
  svg.addEventListener('pointerleave', weg);
}

const zeile = (farbe, name, wert) => `<div class="tt-z">${farbe ? `<i style="background:${farbe}"></i>` : ''}<span>${esc(name)}</span><b>${esc(wert)}</b></div>`;
const kopf = t => `<div class="tt-k">${esc(istDatum(t) ? tagKurz(t, true) : t)}</div>`;

/** Balken: werte[i] je Tag (null = keine Daten). ziel = gestrichelte Linie. */
export function balken(el, { tage, werte, farbe, ziel, format, name, einheit = '', label }){
  const max = Math.max(ziel || 0, ...werte.filter(v => v != null), 1);
  const y = schoen(max);
  geruest(el, { tage, y, label,
    zeichne: ({ X, Y, band }) => {
      const b = Math.max(2, Math.min(22, band - 2));
      let s = werte.map((v, i) => v == null ? '' : barPfad(X(i) - b / 2, Y(v), b, Y(0) - Y(v), i, farbe)).join('');
      if(ziel) s += `<line class="ziel" x1="${X(0) - band / 2}" x2="${X(tage.length - 1) + band / 2}" y1="${Y(ziel)}" y2="${Y(ziel)}"/><text class="ziel-t" x="${X(0) - band / 2 + 4}" y="${Y(ziel) - 6}" text-anchor="start">Ziel ${kompakt(ziel)}</text>`;
      return s;
    },
    tooltip: i => werte[i] == null ? kopf(tage[i]) + '<div class="tt-leer">Keine Daten</div>' : kopf(tage[i]) + zeile(farbe, name, format(werte[i]) + (einheit ? ' ' + einheit : '')),
  });
}

/** Balken mit 4-px-Rundung oben, flach an der Grundlinie. */
function barPfad(x, y, w, h, i, farbe){
  if(h <= 0.5) return '';
  const r = Math.min(4, w / 2, h);
  return `<path data-i="${i}" fill="${farbe}" d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z"/>`;
}

/** Gestapelt: teile = [{name, farbe, werte[]}], von unten nach oben. 2-px-Fuge zwischen Segmenten. */
export function stapel(el, { tage, teile, format, label, ziel }){
  const summen = tage.map((_, i) => teile.reduce((s, t) => s + (t.werte[i] || 0), 0));
  const y = schoen(Math.max(...summen, ziel || 0, 1));
  geruest(el, { tage, y, label, yFormat: format.achse,
    zeichne: ({ X, Y, band }) => {
      const b = Math.max(3, Math.min(22, band - 2));
      let s = '';
      tage.forEach((_, i) => {
        let basis = 0;
        const vorhanden = teile.filter(t => t.werte[i] > 0);
        vorhanden.forEach((t, k) => {
          const v = t.werte[i], y0 = Y(basis), y1 = Y(basis + v), oberstes = k === vorhanden.length - 1;
          const h = Math.max(0, y0 - y1 - (oberstes ? 0 : 2));
          s += oberstes ? barPfad(X(i) - b / 2, y1, b, h, i, t.farbe) : `<rect data-i="${i}" x="${X(i) - b / 2}" y="${y0 - h}" width="${b}" height="${h}" fill="${t.farbe}"/>`;
          basis += v;
        });
      });
      if(ziel) s += `<line class="ziel" x1="${X(0) - band / 2}" x2="${X(tage.length - 1) + band / 2}" y1="${Y(ziel)}" y2="${Y(ziel)}"/>`;
      return s;
    },
    tooltip: i => summen[i] ? kopf(tage[i]) + [...teile].reverse().filter(t => t.werte[i] != null).map(t => zeile(t.farbe, t.name, format.wert(t.werte[i]))).join('') + `<div class="tt-sum"><span>Gesamt</span><b>${esc(format.wert(summen[i]))}</b></div>` : kopf(tage[i]) + '<div class="tt-leer">Keine Daten</div>',
  });
}

/** Linie (2 px) mit optionaler Min/Max-Spanne als Fläche; Lücken bleiben Lücken. */
export function linie(el, { tage, werte, spanne, punkte, farbe, format, name, einheit = '', label, null: nullBasis = false, punkteName = 'Messung' }){
  const alle = [...werte, ...(punkte || []), ...(spanne || []).flatMap(s => s ? [s.min, s.max] : [])].filter(v => v != null);
  if(!alle.length) return leer(el, label);
  let lo = Math.min(...alle), hi = Math.max(...alle); const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1;
  const y = schoen(hi + pad, nullBasis ? 0 : lo - pad);
  geruest(el, { tage, y, label,
    zeichne: ({ X, Y }) => {
      let s = '';
      if(spanne){
        const seg = []; let cur = [];
        spanne.forEach((p, i) => { if(p && p.min != null){ cur.push([i, p]); } else if(cur.length){ seg.push(cur); cur = []; } });
        if(cur.length) seg.push(cur);
        for(const c of seg) s += `<path class="band" fill="${farbe}" d="M${c.map(([i, p]) => `${X(i)},${Y(p.max)}`).join('L')}L${[...c].reverse().map(([i, p]) => `${X(i)},${Y(p.min)}`).join('L')}Z"/>`;
      }
      if(punkte) punkte.forEach((v, i) => { if(v != null) s += `<circle class="roh" cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${farbe}"/>`; });
      let d = '', offen = false;
      const verbinden = werte.filter(v => v != null).length < werte.length * 0.8; // spärliche Werte (Gewicht) verbinden
      werte.forEach((v, i) => { if(v == null){ offen = offen && verbinden; return; } d += (offen ? 'L' : 'M') + X(i) + ',' + Y(v); offen = true; });
      s += `<path class="linie" stroke="${farbe}" d="${d}" pathLength="1"/>`;
      werte.forEach((v, i) => { if(v != null) s += `<circle data-i="${i}" class="pkt" cx="${X(i)}" cy="${Y(v)}" r="${tage.length > 45 || punkte ? 0 : 3}" fill="${farbe}"/>`; });
      const letzter = werte.findLastIndex(v => v != null);
      if(letzter >= 0) s += `<circle class="ende" cx="${X(letzter)}" cy="${Y(werte[letzter])}" r="4.5" fill="${farbe}"/>`;
      return s;
    },
    tooltip: i => werte[i] == null ? kopf(tage[i]) + '<div class="tt-leer">Keine Daten</div>' :
      kopf(tage[i]) + zeile(farbe, name, format(werte[i]) + (einheit ? ' ' + einheit : '')) + (punkte?.[i] != null ? zeile('', punkteName, format(punkte[i]) + (einheit ? ' ' + einheit : '')) : '') + (spanne?.[i]?.min != null ? zeile('', 'Spanne', `${format(spanne[i].min)}–${format(spanne[i].max)}`) : ''),
  });
}

/** Schlaffenster: schwebende Balken von Einschlafen bis Aufwachen, y = Uhrzeit (18 → 12 Uhr). */
export function fenster(el, { tage, naechte, farbe, zone, label }){
  const uhr = iso => { if(!iso) return null; const p = new Intl.DateTimeFormat('de-DE', { timeZone: zone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(iso)); const h = +p.find(x => x.type === 'hour').value + +p.find(x => x.type === 'minute').value / 60; return h < 15 ? h + 24 : h; };
  const map = new Map(naechte.map(n => [n.nacht, n]));
  const rows = tage.map(t => { const n = map.get(t); return n && n.start && n.ende ? { s: uhr(n.start), e: uhr(n.ende), n } : null; });
  const vals = rows.filter(Boolean).flatMap(r => [r.s, r.e]);
  if(!vals.length) return leer(el, label);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const ticks = []; const schritt = hi - lo > 10 ? 3 : 2; for(let h = Math.ceil(lo / schritt) * schritt; h <= hi; h += schritt) ticks.push(h);
  const yf = h => String(h % 24).padStart(2, '0') + ':00';
  const hm = h => { const m = Math.round((h % 24) * 60); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  // invertiert: früh oben
  geruest(el, { tage, y: { lo: -hi, hi: -lo, ticks: ticks.map(t => -t) }, yFormat: v => yf(-v), label, links: 46,
    zeichne: ({ X, Y, band }) => {
      const b = Math.max(3, Math.min(14, band - 4));
      return rows.map((r, i) => r ? `<rect data-i="${i}" x="${X(i) - b / 2}" y="${Y(-r.s)}" width="${b}" height="${Math.max(2, Y(-r.e) - Y(-r.s))}" rx="${Math.min(4, b / 2)}" fill="${farbe}"/>` : '').join('');
    },
    tooltip: i => rows[i] ? kopf(tage[i]) + zeile(farbe, 'Eingeschlafen', hm(rows[i].s)) + zeile('', 'Aufgewacht', hm(rows[i].e)) : kopf(tage[i]) + '<div class="tt-leer">Keine Nacht</div>',
  });
}

export function leer(el, label){ el.innerHTML = `<div class="leer-d" role="img" aria-label="${esc(label || '')}">Noch keine Daten in diesem Zeitraum</div>`; }

/** Sparkline als SVG-String. */
export function spark(werte, farbe, b = 96, h = 28){
  const v = werte.map((x, i) => [i, x]).filter(([, x]) => x != null);
  if(v.length < 2) return '';
  const lo = Math.min(...v.map(p => p[1])), hi = Math.max(...v.map(p => p[1])), sp = hi - lo || 1;
  const X = i => 2 + i / (werte.length - 1) * (b - 4), Y = x => h - 3 - (x - lo) / sp * (h - 6);
  const d = v.map(([i, x], k) => (k ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(x).toFixed(1)).join('');
  const [li, lx] = v.at(-1);
  return `<svg class="spark" viewBox="0 0 ${b} ${h}" width="${b}" height="${h}" aria-hidden="true"><path d="${d}" stroke="${farbe}"/><circle cx="${X(li)}" cy="${Y(lx)}" r="2.6" fill="${farbe}"/></svg>`;
}

/** Divergierende Balken um null: Überschuss nach oben, Defizit nach unten. */
export function divergierend(el, { tage, werte, farbePlus, farbeMinus, format, einheit = '', label, namePlus = 'Überschuss', nameMinus = 'Defizit' }){
  const v = werte.filter(x => x != null);
  if(!v.length) return leer(el, label);
  const m = Math.max(...v.map(Math.abs), 1);
  const y = schoen(m, -m, 4);
  geruest(el, { tage, y, label, yFormat: t => (t > 0 ? '+' : '') + kompakt(t),
    zeichne: ({ X, Y, band }) => {
      const b = Math.max(2, Math.min(22, band - 2));
      let s = `<line class="null" x1="${X(0) - band / 2}" x2="${X(tage.length - 1) + band / 2}" y1="${Y(0)}" y2="${Y(0)}"/>`;
      werte.forEach((w, i) => {
        if(w == null || Math.abs(Y(w) - Y(0)) < 0.5) return;
        const x = X(i) - b / 2, r = Math.min(4, b / 2, Math.abs(Y(w) - Y(0)));
        if(w > 0){ const t = Y(w), u = Y(0); s += `<path data-i="${i}" fill="${farbePlus}" d="M${x},${u}V${t + r}Q${x},${t} ${x + r},${t}H${x + b - r}Q${x + b},${t} ${x + b},${t + r}V${u}Z"/>`; }
        else { const t = Y(0), u = Y(w); s += `<path data-i="${i}" class="unten" fill="${farbeMinus}" d="M${x},${t}V${u - r}Q${x},${u} ${x + r},${u}H${x + b - r}Q${x + b},${u} ${x + b},${u - r}V${t}Z"/>`; }
      });
      return s;
    },
    tooltip: i => werte[i] == null ? kopf(tage[i]) + '<div class="tt-leer">Keine Daten</div>' :
      kopf(tage[i]) + zeile(werte[i] >= 0 ? farbePlus : farbeMinus, werte[i] >= 0 ? namePlus : nameMinus, (werte[i] > 0 ? '+' : '') + format(werte[i]) + (einheit ? ' ' + einheit : '')),
  });
}
