/* Werkzeuge, mit denen Claude die Bibliothek selbst durchsucht und liest.

   Ausgeführt werden sie NICHT auf dem Server, sondern im Browser des
   Nutzers: dort liegen die Goodnotes-Dateien. Der Server reicht nur die
   Anfrage von Claude durch. So verlässt nur das Gerät, was Claude
   wirklich anfordert – nicht der ganze Ordner. */

export const SEITEN_PRO_AUFRUF = 10;

export const WERKZEUGE = [
  {
    name: 'ordner_auflisten',
    description:
      'Zeigt den Inhalt eines Ordners der Goodnotes-Bibliothek: Unterordner, Notizbücher und Seitenzahlen. '
      + 'Mit leerem Pfad ("") kommt die oberste Ebene. Beginne damit, wenn du nicht weißt, was vorhanden ist.',
    input_schema: {
      type: 'object',
      properties: { pfad: { type: 'string', description: 'Ordnerpfad, z. B. "Studium/Biologie". Leer für die oberste Ebene.' } },
      required: ['pfad'], additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'notizen_suchen',
    description:
      'Sucht in Namen und Pfaden aller Notizbücher der Bibliothek nach einem Begriff und liefert die Treffer mit Pfad und Seitenzahl. '
      + 'Nützlich, um ein bestimmtes Notizbuch zu finden, ohne jeden Ordner zu öffnen. Sucht NICHT im handschriftlichen Inhalt.',
    input_schema: {
      type: 'object',
      properties: { begriff: { type: 'string', description: 'Suchbegriff, z. B. "Klausur" oder "Biologie".' } },
      required: ['begriff'], additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'notiz_lesen',
    description:
      `Liefert Seiten eines Notizbuchs als Bilder, die du direkt lesen kannst. Höchstens ${SEITEN_PRO_AUFRUF} Seiten pro Aufruf – `
      + 'bei längeren Notizbüchern rufe das Werkzeug mehrmals hintereinander auf. '
      + 'Lies nur, was für die Aufgabe nötig ist; der Nutzer wartet auf jede Seite.',
    input_schema: {
      type: 'object',
      properties: {
        pfad: { type: 'string', description: 'Vollständiger Pfad des Notizbuchs, genau wie aufgelistet.' },
        von:  { type: 'integer', description: 'Erste Seite (1 = Anfang).' },
        bis:  { type: 'integer', description: `Letzte Seite. 0 bedeutet: bis zu ${SEITEN_PRO_AUFRUF} Seiten ab "von".` },
      },
      required: ['pfad', 'von', 'bis'], additionalProperties: false,
    },
    strict: true,
  },
];

export const WERKZEUG_NAMEN = new Set(WERKZEUGE.map(w => w.name));
