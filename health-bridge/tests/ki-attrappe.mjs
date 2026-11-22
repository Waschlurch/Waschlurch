/* Simulierter Anthropic-Client für Tests und lokale Vorschau des KI-Coachs (PULS_KI_ATTRAPPE=1). */
export const BEISPIEL = {
  kernaussage: 'Dein Aufbau läuft solide, aber du verschenkst Potenzial: Das Tempo liegt unter Ziel, weil du an Trainingstagen zu wenig isst. Wichtigster Schritt: Kohlenhydrate rund ums Training erhöhen und den Schlaf auf 8 Stunden bringen.',
  gesamturteil: 'gut',
  prioritaeten: [
    { titel: 'Trainingstage auffüllen', dringlichkeit: 'hoch', warum: 'Ø 3.150 kcal bei Ziel 3.450 – Tempo +0,11 % statt +0,25 % pro Woche.', aktion: '+80 g Kohlenhydrate vor und nach dem Training (z. B. Reis, Haferflocken) für 14 Tage.', messgroesse: 'Trendgewicht +0,2 kg pro Woche' },
    { titel: 'Schlaf auf 8 Stunden', dringlichkeit: 'hoch', warum: 'Ø 7 h 18; bei dir steigt die HRV nach langen Nächten um 7 ms (r = 0,79).', aktion: 'Bettzeit 22:30, Koffein nach 14 Uhr weglassen.', messgroesse: 'Schlaf Ø ≥ 7 h 45, HRV Ø > 52 ms' },
    { titel: 'Beine öfter reizen', dringlichkeit: 'mittel', warum: 'Beine 1,3× pro Woche, Ober­körper 1,5×.', aktion: 'Rhythmus 3 an / 1 frei testen, damit jeder Split-Tag ~2× pro 10 Tage kommt.', messgroesse: 'Quadrizeps ≥ 1,7× pro Woche' },
  ],
  ernaehrung: { kcal_trainingstag: 3450, kcal_restday: 3050, eiweiss_g: 190, kohlenhydrate_g_training: 430, kohlenhydrate_g_rest: 320, fett_g: 85, begruendung: 'TDEE ≈ 3.170 kcal + 250 Überschuss, Trainingstage höher für Leistung, Rest-Days niedriger.' },
  training: 'Split Push/Pull/Beine passt. Volumen halten, Cardio an Rest-Days bei 30–35 min belassen.',
  erholung: 'Bereitschaft heute niedrig (36/100): Ruhepuls +1,9 σ. Heute Technik und Pump statt schwerer Sätze.',
  gut_laeuft: ['Eiweiß 2,2 g/kg', 'Alle geplanten Trainingstage absolviert'],
  warnsignale: ['Ruhepuls heute deutlich über deinem Normalbereich'],
  fragen: ['Wie viele Sätze machst du pro Muskelgruppe und Woche?', 'Wann trinkst du deinen letzten Kaffee?'],
};

export function attrappe(antwort = BEISPIEL, { stop = 'end_turn' } = {}){
  const aufrufe = [];
  const client = { beta: { messages: { stream(params){ aufrufe.push(params); return { finalMessage: async () => ({ stop_reason: stop, model: params.model, content: [{ type: 'text', text: typeof antwort === 'string' ? antwort : JSON.stringify(antwort) }] }) }; } } } };
  client.aufrufe = aufrufe;
  return client;
}
