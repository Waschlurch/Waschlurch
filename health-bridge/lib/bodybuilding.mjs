/* Server-Hülle um den Rechenkern: Daten laden, dann exakt wie im Browser rechnen. */
import { basisLaden } from './abfragen.mjs';
import { laden as protokollLaden } from './protokoll.mjs';
import { bodybuilding as bbKern, VORLAUF, tagPlus, phaseAm } from '../kern/rechnen.mjs';
import { analyse as analyseKern } from '../kern/analyse.mjs';

export { trend, steigung, isoWoche, KRAFT, KCAL_PRO_KG } from '../kern/rechnen.mjs';

/** Basis inkl. Vorlauf für Trend/TDEE und die Vorwoche der Analyse. */
export function basisBereich(fenster, e){
  const start = e ? phaseAm(fenster.bis, e.phasen, e.ziele.phase).start : null;
  const kandidaten = [tagPlus(fenster.von, -VORLAUF - 7), tagPlus(fenster.bis, -89 - VORLAUF - 7)]; // 90 Tage für die intelligente Analyse
  if(start && start >= tagPlus(fenster.bis, -400)) kandidaten.push(start);
  return { von: kandidaten.sort()[0], bis: fenster.bis };
}

export async function bodybuilding(fenster, einstellungen){
  const b = basisBereich(fenster, einstellungen);
  const [basis, prot] = await Promise.all([basisLaden(b), protokollLaden(b)]);
  return bbKern(basis, fenster, einstellungen, prot);
}

export async function coach(bis, einstellungen){
  const b = basisBereich({ von: bis, bis }, einstellungen);
  const [basis, prot] = await Promise.all([basisLaden(b), protokollLaden(b)]);
  return analyseKern(basis, einstellungen, prot, bis);
}
