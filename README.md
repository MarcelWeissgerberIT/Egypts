# Purpursonne Pyramide

Isometrisches Pyramiden-Puzzle für das iPhone (Safari / Home-Bildschirm). Alle Grafiken, Icons,
Ziffern, 3D-Figuren, Musik und Fanfare wurden mit **Higgsfield** erzeugt, die 3D-Modelle,
Rigs und Animationen mit **Meshy** (über Higgsfield). Im Spiel gibt es keine Schrift: jede
Beschriftung, jede Zahl und jeder Knopf ist ein Bild.

## Spielprinzip

* Jede Pyramide besteht aus Stufen (z. B. 7×7 → 5×5 → 3×3). Ganz oben setzt du als Belohnung
  die goldene Spitze.
* Unten liegen drei Steine. **Ziehen** legt einen Stein auf die aktuelle Stufe (die goldene
  Vorschau zeigt, wo er landet), **Antippen** dreht ihn um 90°.
* Die **Sonnenleiste** ist die Zeit für die Stufe: Der Tag läuft ab, der Himmel färbt sich purpur.
  Geht die Sonne unter, verlierst du einen **Skarabäus** (3 Leben).
* Volle Reihen und Spalten geben Punkte und etwas Sonnenzeit, mehrere hintereinander einen
  Kombo-Multiplikator.
* **Ankh-Felder** abdecken: viel Sonnenzeit und Punkte, die Priesterin wirkt einen Segen.
* **Goldsteine** zählen dreifach. Roter **Granit** ist schon verbaut und macht die Formen kniffliger.
* Passt kein Stein mehr? Der **Nil-Knopf** spült alle drei Steine fort (kostet 6 Sekunden Sonne).
* Die Wertung (1–3 Horusaugen) hängt von den übrigen Skarabäen ab. 6 Level, steigende
  Schwierigkeit.

## Entwickeln

```bash
npm install
npm run build              # bündelt src/ nach dist/
node tools/serve.cjs dist  # http://localhost:8080
```

| Ordner | Inhalt |
|---|---|
| `src/` | Spielcode (Three.js): `world.js` 3D-Diorama, `main.js` Spielablauf/Steuerung, `ui.js` bildbasierte Oberfläche, `logic.js`/`pieces.js`/`levels.js` Puzzle-Regeln, `audio.js` Musik und erzeugte Klänge |
| `public/assets/` | aufbereitete Assets (WebP/JPG, meshopt-komprimierte GLBs, MP3) |
| `tools/` | Bild-/Modell-Aufbereitung, Build, lokaler Server, Balancing-Simulation |
| `art/jobs.json` | Higgsfield/Meshy-Job-IDs der Rohdateien |

`dist/` lässt sich auf jedem statischen Hoster (z. B. GitHub Pages) ausliefern.
