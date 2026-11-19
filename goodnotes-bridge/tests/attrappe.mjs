/* Nachbildung des Anthropic-Clients für Tests und Oberflächenproben. */
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

export function attrappe({ text = BEISPIEL, stop = 'end_turn', fehler = null, verzoegerung = 12, protokoll = [] } = {}){
  return { beta: { messages: { stream(params){
    protokoll.push(params);
    const ev = new EventEmitter();
    let abgebrochen = false;
    const fertig = (async () => {
      await new Promise(r => setImmediate(r));
      if(fehler) throw fehler;
      const stuecke = text.match(/[\s\S]{1,14}/g) || [];
      for(const s of stuecke){
        if(abgebrochen) throw new Error('abgebrochen');
        if(verzoegerung) await new Promise(r => setTimeout(r, verzoegerung));
        ev.emit('text', s);
      }
      return { stop_reason: stop, model: params.model, usage: { input_tokens: 1, output_tokens: stuecke.length }, content: [] };
    })();
    fertig.catch(() => {});
    return { on(n, f){ ev.on(n, f); return this; }, finalMessage: () => fertig, abort(){ abgebrochen = true; } };
  } } } };
}
