# Purpurpyramide

Ein Jump & Run für iPhone und iPad (Touch, am besten quer): Eine Forscherin erkundet in
**100 aufeinander aufbauenden Leveln** eine riesige Pyramide und lüftet ihre zehn Geheimnisse.

**Spielen:** https://marcelweissgerberit.github.io/Egypts/
(auf dem iPhone in Safari öffnen, dann „Teilen → Zum Home-Bildschirm“ für Vollbild)
Das erste Spiel, der Pyramiden-Bauplatz, liegt jetzt unter https://marcelweissgerberit.github.io/Egypts/builder/

Alle Bilder, Hintergründe, Steintafeln und Knöpfe sind mit **Higgsfield** erzeugt, die Forscherin ist ein
**Meshy**-3D-Modell mit Rig und eigenen Animationen (Laufen, Springen, Fallen, Klettern, Schwimmen,
Treffer, Jubeln). Im Spiel gibt es keine Schrift: jede Zahl und jeder Knopf ist ein Bild.

## Steuerung (Touch, wie beim Game Boy)

* **Steuerkreuz links unten:** laufen, Leitern hoch und runter (oben auf der Leiter „runter“ drücken),
  „runter“ + Springen fällt durch Holzplanken, im Stehen hoch/runter halten schaut nach oben/unten.
  Der Daumen kann über das Kreuz gleiten (8 Richtungen), jede Berührung der linken Hälfte zählt.
* **A (Pfeil, rechts oben):** Springen, länger halten = höher. Großzügige Sprungtoleranz.
* **B (Hand, links unten davon):** rissige Steine aufbrechen, Hebel ziehen, Symbolsäulen drücken,
  Krüge zerschlagen, Steinblöcke heranziehen, das Wurfholz werfen. B leuchtet, wenn es etwas zu tun gibt.
  Der Daumen kann von B auf A rutschen. Jede Berührung der rechten Hälfte zählt für den näheren Knopf.
* Auf dem Rechner: Pfeiltasten/WASD, Leertaste, E.

## Atmosphäre und Klang

* Fünf eigene Musikstücke (Higgsfield/ElevenLabs Music): Hallen, Zisterne, Gruft, Wüstensturm,
  Sternenschacht; sie wechseln mit der Welt und überblenden sich nahtlos in der Schleife.
* Umgebungsklänge (Wind in den Gängen, Wassertropfen, knisternde Fackeln je nach Nähe) und
  aufgenommene Effekte (Mirelo SFX) für Münzen, Papyrus, Steintür, Bruch, Wasser, Sprung, Landung,
  Felsbrocken; alles läuft durch einen Steinhallen-Hall, der je nach Welt größer wird. Schritte folgen
  der Laufanimation.
* Jede Welt hat eigene Schwebeteilchen (Sonnenstaub, Wasserdunst, Glühwürmchen, Sandwehen, Glut,
  Goldglitzer, Sternenfunkeln), Fackeln leuchten mit Lichthof, jedes Level beginnt mit einer Welt-Karte.

## iPhone

* Hintergründe werden pro Welt geladen, beim Levelwechsel wird der Grafikspeicher freigegeben.
* Hält ein Gerät die Bildrate nicht, sinkt die Auflösung stufenweise, dann fallen Schatten weg.
* Ton läuft nach dem ersten Tippen auf Start; das Spiel meldet sich als Wiedergabe an, damit der
  Lautlos-Schalter es auf neueren iOS-Versionen (ab 17) nicht stummschaltet.
* Am besten quer halten und über „Teilen → Zum Home-Bildschirm“ als Vollbild-App starten.

## Gegner, Power-ups, Rätsel, Aufstiege

* **Gegner ab dem ersten Level:** Skarabäen (Meta SAM 3D aus einem Higgsfield-Bild), Mumien (SAM 3D,
  von Meshy geriggt, schlurfender Gang, zweimal draufspringen), hüpfende Käfer, geflügelte Käfer,
  Fledermäuse und Kobras. Draufspringen, Wurfholz oder Sonnenscheibe besiegen sie.
* **Power-ups** stecken in **Glyphen-Blöcken** (von unten dagegen springen) und in **Tonkrügen**
  (B oder draufspringen); oben links zeigt die Leiste, was aktiv ist:
  * Skarabäus-Amulett: fängt einen Treffer ab
  * Wurfholz: B wirft es, es kehrt zurück und besiegt Gegner
  * Ibisfeder: höher springen, mit gehaltenem A langsam herabschweben (25 s)
  * Sonnenscheibe: unverwundbar und schneller, Gegner vergehen bei Berührung (10 s)
* **Rätsel** hinter Steintoren (die Farbe des Edelsteins verbindet Tor und Auslöser, das Bild schwenkt
  zum Tor, wenn es sich öffnet):
  * Hebel auf einem Sims, in einer Grube oder hinter Stufen
  * Steinblock auf die Druckplatte schieben (B zieht ihn zurück, falls er festsitzt)
  * Symbolreihenfolge: eine Tafel zeigt drei bis vier Zeichen (Ankh, Lotus, Djed, Falke); die Säulen
    stehen in anderer Reihenfolge, falsch gedrückt setzt alles zurück
* **Aufstiege:** hohe Kammern mit Simsen, Leitern und Aufzügen führen nach oben, der Weg geht dort
  weiter; Leitern und Abstiege führen wieder hinunter. Jedes fünfte Level ist ein großer Aufstieg.

## 10 Welten × 10 Level

| Welt | Ort | Neu |
|---|---|---|
| 1 | Sonnige Eingangshalle | Laufen, Springen, Gruben, Stacheln, Skarabäen, Mumien, erste Rätsel |
| 2 | Hieroglyphenhalle | Leitern, bröckelnde Steine, hüpfende Käfer |
| 3 | Überflutete Zisterne | Schwimmen, schwebende Steinplatten |
| 4 | Skarabäennest | Fledermäuse, geflügelte Käfer, Pfeilfallen |
| 5 | Mumiengruft (dunkel) | Laterne, viele Mumien |
| 6 | Sandfälle | Treibsand, Sandströme, rollender Felsbrocken |
| 7 | Fallenkammern | Stampfer, Feuerdüsen, Aufzüge |
| 8 | Schatzkammer | **Doppelsprung** (goldene Sandalen), Kobras |
| 9 | Sternenschacht | **Wandsprung**, senkrechte Schächte |
| 10 | Königskammer | alles zusammen, das letzte Geheimnis |

In jedem Level liegen **drei Papyrusfetzen** versteckt (hinter rissigen Bodenplatten, auf hohen
Simsen, in Kellern unter Holzplanken), sie geben die Horusaugen des Levels. Nach Level 10 jeder Welt
wird eine **Steintafel** mit einem Geheimnis der Pyramide enthüllt; die Tafeln bleiben im Weltraum
abrufbar. Ankh-Herzen: drei Treffer, dann geht es am letzten Obelisken (Kontrollpunkt) weiter.

Die Level werden aus festen Bausteinen mit festem Startwert erzeugt (gleiches Level bei jedem Spiel).
`tools/check_levels.mjs` spielt jedes Level mit der echten Spielphysik durch (Rennen, Springen, kurze
Hüpfer, Doppelsprung, Leitern hoch und runter, Schwimmen) und prüft, dass Ausgang und alle drei Papyri
erreichbar sind; Tore gelten erst als offen, wenn ihr Hebel, Block und Druckplatte oder alle Symbolsäulen
erreichbar sind: alle 100 Level bestehen.

## Entwickeln

```bash
npm install
npm run build              # dist/ = Purpurpyramide, dist/builder/ = Pyramiden-Bauplatz
node tools/serve.cjs dist  # http://localhost:8080
node tools/check_levels.mjs
```

| Ordner | Inhalt |
|---|---|
| `jump/src/` | Jump & Run: `levels.js` Welten und Levelgenerator, `sim.js` Physik/Gegner/Fallen, `render.js` 2.5D-Grafik (Three.js), `input.js` Touch, `ui.js` bildbasierte Oberfläche, `main.js` Ablauf |
| `jump/assets/` | Hintergründe, Steintafeln, Texturen, Knöpfe, Power-ups, Symbole, Forscherin, Mumie, Käfer (meshopt-GLB), Klänge |
| `src/`, `public/` | der Pyramiden-Bauplatz (erstes Spiel) |
| `tools/` | Build, Bild-/Modell-/Klang-Aufbereitung, Levelprüfung, Balancing |

---

# Erstes Spiel: Pyramiden-Bauplatz (/builder/)

Isometrisches Aufbauspiel für das iPhone (Safari / Home-Bildschirm): Vorkommen erschließen, Wege bauen, Pyramide errichten.

**Spielen:** https://marcelweissgerberit.github.io/Egypts/builder/

## Spielprinzip – Vorkommen erschließen, Wege bauen, Pyramide errichten

Du startest mit etwas Deben und einem Arbeiterhaus. Auf der Insel liegen sichtbare
**Vorkommen**: cremefarbene Kalksteinfelsen, Kupferadern mit grünem Malachit, rosa Granit am
anderen Nilufer und dunkler, fruchtbarer Nilschlamm. Ein Steinbruch geht nur auf Kalkstein, eine
Mine nur auf Kupfer, ein Feld nur auf Nilschlamm. Werkstätten und Häuser stehen auf Sandplätzen.

Waren bewegen sich **nur über Wege, die du Kachel für Kachel baust**:

* **Wege-Knopf** (unten links) öffnet den Wegebau: ein Raster zeigt jede baubare Kachel.
  * **Ziehen statt Kacheln tippen** (wie in Pocket City, Mini Motorways oder Die Siedler): Finger auf
    einen Betrieb (oder eine Kachel) setzen und zum Ziel ziehen. Die Strecke wird automatisch geplant
    (gerade, um Hindernisse herum, vorhandene Wege werden mitbenutzt) und **grün mit Preis**
    angezeigt; rot heißt zu teuer. **Loslassen baut** die ganze Strecke, ein Tipp setzt eine Kachel.
  * **Pfad** (1 Deben/Kachel): für leichte Waren (Getreide, Brot, Ziegel, Erz, Werkzeug).
  * **Schlittenbahn** (3 Deben/Kachel, nasser Lehm mit Holzschwellen und Ziegelkante): für Rohstein,
    Quader und Granit. Wer an Steinbruch, Steinmetz oder Baustelle ansetzt, bekommt sie automatisch.
  * **Abriss**: über Kacheln wischen (halbe Kosten zurück). **Zurück-Knopf** macht den letzten Bau
    oder Abriss rückgängig.
  * **Zwei Finger** verschieben und zoomen die Kamera, so malt man nie aus Versehen beim Scrollen.
* Ein Weg muss die Kante eines Betriebs (bzw. den Steinplatz am Rampenfuß) berühren. Längere Wege
  kosten mehr und machen die Träger langsamer.
* Jeder Betrieb hat eigene **Träger**: Sie holen die Ware vom Stapel neben dem Betrieb und bringen
  sie über die Wege zum nächsten verbundenen Abnehmer mit Platz. Leichte Waren tragen Träger mit
  einem Korb auf dem Kopf, schwere Steine zieht ein Schlittentrupp (einer zieht am Seil, einer
  schiebt), voll ausgebaute Betriebe fahren ab Level 2 mit Ochsenkarren, Granit kommt per Nilboot
  zum Kai. Im Betriebsfenster: **+** stellt einen weiteren Träger ein (max. 3).
* Fehlt die Verbindung, zeigt der Betrieb eine Sprechblase mit Pfad oder Schlittenbahn.

Ketten: Steinbruch → Steinmetz → Baustelle · Feld → Bäckerei → Arbeiterhäuser (gemeinsame
Vorratskammer) · Feld → **Ziegelei** → Baustelle (Rampe, ab Level 2) · Kupfermine → Schmiede →
Steinbruch (ab Level 3) · Granitbruch → Nilboot → Kai → Baustelle (obere Stufen ab Level 4).

**Rampenbau (ab Level 2):** Bevor eine neue Stufe gelegt werden kann, muss die Rampe mit
Lehmziegeln erhöht werden (6, 8, 10 … Ziegel). Die Ziegelei macht aus Nilschlamm und dem Stroh der
Ernte Ziegel und konkurriert dabei mit der Bäckerei ums Getreide. Ziegelträger schleppen die Ziegel
die Rampe hinauf, der Rampenbalken im Baustellenfenster zeigt den Fortschritt, eine Sprechblase
über dem Steinplatz zeigt, was fehlt.

Level 1 führt mit einer Hand durch alles: Vorkommen erschließen, Steinmetz bauen, Wegebau öffnen,
Schlittenbahn wählen, die golden pulsierende Wegvorlage nachmalen, später Feld, Bäckerei und
Pfade für das Brot.

Die **Baustelle** ist echt animiert: Zwei Seilzieher lehnen sich in die Seile, ein dritter schiebt
den Schlitten mit dem Quader die Rampe hinauf, ein Wasserträger nässt die Bahn, zwei Setzer laufen
zum Platz des Steins und hebeln ihn ein, der Quader gleitet auf Rollen über die Stufe. Auf dem
Steinplatz behauen Steinmetze die wartenden Blöcke, Ziegelträger bauen die Rampe weiter, Pflöcke
und Messschnüre stecken die aktuelle Stufe ab, ein Aufseher gibt Kommandos.
In den **Betrieben** arbeiten Meshy-Figuren mit eigenen Animationen und Werkzeugen (Hämmern,
Meißeln, Hacken, Ernten mit der Sichel, Brot einlegen, Ziegel formen); beim Schlag fliegen
Splitter, in der Schmiede glüht die Esse. Ein Läufer trägt jedes fertige Stück zum Stapel neben dem
Betrieb, angelieferte Rohstoffe liegen sichtbar vor den Werkstätten.

Herausforderung: Regierungszeit des Pharaos (Sonnenleiste), Hunger-Streiks ohne Brot, Nilflut
über den Feldern, Sandstürme in Level 5. Horusaugen: 3 bei höchstens 75 % der Zeit, 2 bei 90 %.
Fristen sind mit `tools/balance_sim.mjs` eingestellt (ein Bot, der Vorkommen erschließt, Wege
legt und Träger einstellt).


| Ordner | Inhalt |
|---|---|
| `src/` | Spielcode (Three.js): `world.js` 3D-Diorama, `main.js` Spielablauf/Steuerung, `ui.js` bildbasierte Oberfläche, `economy.js` Produktionswirtschaft mit Trägern, `roads.js` Wegenetz auf dem Kachelraster (Wegsuche, Wegvorschläge), `map.js` Inselkarte (Vorkommen, Bauplätze, Monumente), `levels.js` Level, `audio.js` Musik und erzeugte Klänge |
| `public/assets/` | aufbereitete Assets (WebP/JPG, meshopt-komprimierte GLBs, MP3) |
| `tools/` | Bild-/Modell-Aufbereitung, Build, lokaler Server, Balancing-Simulation |
| `art/jobs.json` | Higgsfield/Meshy-Job-IDs der Rohdateien |

Jeder Push auf `claude/purpursonne-pyramide` (oder `main`) baut das Spiel per GitHub Actions
(`.github/workflows/pages.yml`) und veröffentlicht es auf GitHub Pages
(Settings → Pages → Source: „GitHub Actions“).
