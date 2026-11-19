/* Nachbildung des Anthropic-Clients für Tests und Oberflächenproben.
   `zuege` ist eine Liste von Antworten; jede wird beim nächsten Aufruf
   verwendet. So lässt sich eine ganze Werkzeugschleife nachspielen. */
import { EventEmitter } from 'node:events';

export const BEISPIEL = `# Zellatmung – Mitschrift

## Kernaussagen
- **Glykolyse** läuft im Cytoplasma ab und liefert 2 ATP
- Der *Citratzyklus* findet in der \`Mitochondrienmatrix\` statt
- Die Atmungskette erzeugt den Großteil des ATP (~34)

## Aufgaben
- [ ] Kapitel 4 bis Freitag lesen
- [x] Skizze des Mitochondriums abzeichnen

> Skizze: Mitochondrium mit Pfeilen von der Matrix zur inneren Membran

| Phase | Ort | ATP |
|---|---|---|
| Glykolyse | Cytoplasma | 2 |
| Atmungskette | Innere Membran | ~34 |
`;

/* Die Oberflächenprobe (BRIDGE_MOCK) spielt durch, was auch echt
   passiert: in der Bibliothek umsehen, lesen, dann antworten.
   Der Zug ergibt sich aus dem Verlauf – der Server ist zustandslos. */
function plan(params){
  const gelesen = params.messages.some(n => Array.isArray(n.content) && n.content.some(b =>
    b.type === 'tool_result' && Array.isArray(b.content) && b.content.some(c => c.type === 'image')));
  if(gelesen) return { text: BEISPIEL };
  const notiz = ersterTreffer(params, /\[Notizbuch\] (.+?)\s+–/);
  if(notiz) return { text: 'Ich lese das passende Notizbuch.', werkzeuge: [{ name: 'notiz_lesen', input: { pfad: notiz, von: 1, bis: 3 } }] };
  const ordner = ersterTreffer(params, /\[Ordner\] (.+?)\/\s+–/);
  if(ordner) return { text: `Ich sehe in „${ordner}“ nach.`, werkzeuge: [{ name: 'ordner_auflisten', input: { pfad: ordner } }] };
  return { text: 'Ich sehe mir an, was da ist.', werkzeuge: [{ name: 'ordner_auflisten', input: { pfad: '' } }] };
}

/* Zieht den ersten Treffer aus den bisherigen Werkzeug-Ergebnissen. */
function ersterTreffer(params, muster){
  for(const n of [...params.messages].reverse()){
    if(!Array.isArray(n.content)) continue;
    for(const b of n.content){
      if(b.type !== 'tool_result') continue;
      for(const c of (Array.isArray(b.content) ? b.content : [])){
        const m = c.type === 'text' && c.text.match(muster);
        if(m) return m[1];
      }
    }
  }
  return null;
}

export function attrappe({ zuege = null, fehler = null, verzoegerung = 8, protokoll = [] } = {}){
  return { beta: { messages: { stream(params){
    protokoll.push(params);
    /* Der Zug ergibt sich aus dem Verlauf, nicht aus einem Zähler:
       Der Server ist zustandslos und erzeugt pro Anfrage eine neue Attrappe. */
    const bisher = params.messages.filter(n => n.role === 'assistant').length;
    const zug = zuege ? zuege[Math.min(bisher, zuege.length - 1)] : plan(params);
    const ev = new EventEmitter();
    let abgebrochen = false;
    const fertig = (async () => {
      await new Promise(r => setImmediate(r));
      if(fehler) throw fehler;
      const text = zug.text || '';
      for(const s of text.match(/[\s\S]{1,14}/g) || []){
        if(abgebrochen) throw new Error('abgebrochen');
        if(verzoegerung) await new Promise(r => setTimeout(r, verzoegerung));
        ev.emit('text', s);
      }
      const content = text ? [{ type: 'text', text }] : [];
      for(const w of zug.werkzeuge || []){
        const input = { ...w.input };
        content.push({ type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2, 10), name: w.name, input });
      }
      return { stop_reason: zug.werkzeuge?.length ? 'tool_use' : (zug.stop || 'end_turn'),
               model: params.model, usage: { input_tokens: 1, output_tokens: 1 }, content };
    })();
    fertig.catch(() => {});
    return { on(n, f){ ev.on(n, f); return this; }, finalMessage: () => fertig, abort(){ abgebrochen = true; } };
  } } } };
}
