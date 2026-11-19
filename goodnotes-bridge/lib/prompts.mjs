/* Modi der Brücke: was Claude mit einer Goodnotes-Seite tun soll.
   Ein Ort für Titel, Aufwand und Anweisung, damit Oberfläche und
   Server nicht auseinanderlaufen. */

export const MODEL = 'claude-opus-5-5';

const GRUNDREGELN = `Du bist die Brücke zwischen handschriftlichen Goodnotes-Notizen und einem digitalen Arbeitsplatz.
Die Eingabe sind exportierte Goodnotes-Seiten (PDF oder Bild), oft handschriftlich, manchmal mit Skizzen, Pfeilen, Markierungen.

Regeln:
- Antworte ausschließlich in sauberem Markdown (Überschriften #/##/###, Listen, **fett**, Tabellen, "- [ ]" für Aufgaben).
- Antworte in der Sprache der Notizen, außer der Nutzer verlangt etwas anderes.
- Unleserliche Stellen markierst du als [unleserlich] statt zu raten. Unsichere Lesungen als [?Wort].
- Skizzen und Diagramme beschreibst du knapp in einer Zeile: > Skizze: …
- Keine Einleitung, keine Schlussfloskeln. Direkt mit dem Inhalt beginnen.`;

export const MODI = {
  transkribieren: {
    titel: 'Transkribieren',
    effort: 'medium',
    anweisung: `Übertrage die Handschrift vollständig und wortgetreu in Markdown.
Erhalte Struktur, Reihenfolge, Hervorhebungen und Seitenumbrüche (als "---").
Korrigiere nichts inhaltlich; offensichtliche Rechtschreibfehler darfst du still berichtigen.`,
  },
  zusammenfassen: {
    titel: 'Zusammenfassen',
    effort: 'medium',
    anweisung: `Erstelle eine prägnante Zusammenfassung:
# Titel (aus dem Inhalt abgeleitet)
## Kernaussagen (3–7 Punkte)
## Details (gegliedert nach Themen)
## Offene Fragen (nur wenn sich welche aus den Notizen ergeben)`,
  },
  aufgaben: {
    titel: 'Aufgaben',
    effort: 'medium',
    anweisung: `Ziehe alle Aufgaben, Termine, Entscheidungen und Zusagen heraus.
# Aufgaben
- [ ] Aufgabe — Verantwortlich (falls genannt) — Frist (falls genannt)
## Termine
## Entscheidungen
Ordne nach Dringlichkeit. Erfinde keine Fristen oder Personen.`,
  },
  lernkarten: {
    titel: 'Lernkarten',
    effort: 'high',
    anweisung: `Erstelle Lernkarten zum Inhalt (8–25 Stück, je nach Stoffmenge).
Format exakt so, eine Karte pro Block:
### Frage
Antwort (1–4 Sätze oder kurze Liste)
Beginne mit "# Lernkarten: <Thema>". Keine Karte ohne Grundlage in den Notizen.`,
  },
  ausarbeiten: {
    titel: 'Ausarbeiten',
    effort: 'high',
    anweisung: `Arbeite die Notizen zu einem gut lesbaren, vollständigen Dokument aus:
klare Gliederung, ausformulierte Absätze, ergänzende Erklärungen wo die Notizen knapp sind.
Kennzeichne eigene Ergänzungen, die nicht in den Notizen stehen, mit einem vorangestellten "*Ergänzung:*".`,
  },
  fragen: {
    titel: 'Frei fragen',
    effort: 'high',
    anweisung: `Beantworte die Frage des Nutzers auf Grundlage der Notizen. Wenn die Notizen die Antwort nicht hergeben, sag das klar und antworte dann mit allgemeinem Wissen, deutlich getrennt.`,
  },
  schreiben: {
    titel: 'Neue Seite',
    effort: 'high',
    anweisung: `Es gibt keine Notizen als Eingabe. Erstelle auf Wunsch des Nutzers eine neue Seite für Goodnotes:
ein klar gegliedertes Dokument (Lernblatt, Plan, Vorlage, Checkliste, Erklärung …), das sich gut ausdrucken und handschriftlich ergänzen lässt.
Lass bei Übungen oder Vorlagen Platz durch leere Aufgaben "- [ ]" oder kurze Lückentexte "______".`,
  },
};

export function systemPrompt(){
  // Bewusst konstant: stabiler Präfix für Prompt-Caching.
  return GRUNDREGELN;
}

export function nutzerText(modus, frage){
  const m = MODI[modus];
  const extra = (frage || '').trim();
  let text = `Modus: ${m.titel}\n\n${m.anweisung}`;
  if(extra) text += `\n\nZusätzlicher Wunsch des Nutzers:\n${extra}`;
  return text;
}
