# CyclePlanner – Gesamtkonzept (Version 2.0, rein textuell)

**Historie:** v0.2 Anforderungen → v1.0 Serverkonzept → v1.1 Local Edition → v1.2 Prioritäten → v1.3 Layer/Ausschlüsse → **v2.0 konsolidiert, diagrammfrei**
**Stand:** August 2026
**Begleitdokument:** `CyclePlanner_Umsetzungshandbuch_v1.0.md` (Installation, Schritt-für-Schritt-Ablauf, Agent-Prompts)

Dieses Dokument enthält alle fachlichen und technischen Entscheidungen. Es ist bewusst frei von Diagrammen und Bildern, damit es als reine Textquelle an einen Coding-Agenten übergeben werden kann.

---

## 1. Zielbild und Prioritäten

**Produktziel:** Eine lokal betriebene Webanwendung zur Planung hochwertiger Fahrradtouren, deren Kern ein **transparentes, tief konfigurierbares Routing-System** ist.

**Prioritätenordnung (verbindlich für alle Entscheidungen):**

1. **Routing-Kern mit Live-Tuning.** Routen erzeugen und dabei die Gewichtungen des Routing-Algorithmus live verändern können: Untergrund, Straßentyp, Steigung, Radinfrastruktur, Popularität, Hierarchieverhalten der Suche. Das ist der zentrale Nutzen der Anwendung.
2. **Erweiterbarkeit um Informationsebenen.** Neue Datenebenen müssen sich auf einem definierten Weg in den Routing-Algorithmus einspeisen lassen, nicht nur in die Anzeige.
3. **Skalierbarkeit per Konfiguration.** Start lokal mit einem Bundesland, später Mitteleuropa, optional Serverbetrieb – identischer Softwarestack, nur Datenumfang und Host ändern sich.
4. **Karten-Overlays und POI-Anreicherung** sind schrittweise Erweiterungen der Anzeigeebene, entkoppelt vom Routing.
5. **Der KI-Planungsmodus ist ein Add-on der letzten Ausbauphase.** Er liefert ausschließlich Zwischenziele an das dann fertige Routing-System.

**Rahmenbedingungen:** Einzelnutzer, gelegentliche Nutzung, Betrieb auf dem eigenen Rechner, Budget rund 20 Euro pro Monat (tatsächlich anfallend: nahe null im Grundbetrieb), Routenlängen bis etwa 400 Kilometer, Abdeckung mittelfristig Mitteleuropa.

---

## 2. Technologie-Entscheidungen (Programmiersprachen und Werkzeuge)

| Bereich | Entscheidung | Version | Begründung |
|---|---|---|---|
| Sprache Frontend | **TypeScript** | 5.x, strict | Typsicherheit ist bei KI-generiertem Code der wirksamste Qualitätsanker; Fehler fallen beim Kompilieren auf, nicht im Betrieb |
| UI-Framework | **React** | 19 | größtes Ökosystem, beste Codegen-Unterstützung, MapLibre-Integrationen erprobt |
| Build-Werkzeug | **Vite** | 6/7 | schneller Dev-Server, minimale Konfiguration |
| Kartenbibliothek | **MapLibre GL JS** | 5.x | Open-Source-Fork von Mapbox GL, WebGL-Vektorrendering, Terrain-Unterstützung, PMTiles-fähig |
| Zustandsverwaltung | **Zustand** | aktuell | schlank; Redux wäre für ein Einzelprojekt Overhead |
| Server-Datenzugriff Frontend | **TanStack Query** | 5.x | Caching, Deduplizierung, Retry – wichtig beim Draggen von Wegpunkten |
| Styling | **Tailwind CSS** + **Radix UI** | Tailwind 4, Radix aktuell | schnelle, konsistente UI ohne eigenes Designsystem |
| Sprache Backend | **TypeScript auf Node.js** | Node 22 LTS | eine Sprache im gesamten Projekt; reduziert Kontextwechsel für Mensch und Agent |
| Web-Framework Backend | **Fastify** | 5.x | schnell, schema-basierte Validierung, gute TypeScript-Typen |
| Datenbank | **SQLite** über **better-sqlite3** + **Drizzle ORM** | aktuell | Einzelnutzer braucht keinen Datenbankserver; Backup ist eine Dateikopie; Drizzle bildet die Repository-Schicht für einen späteren Postgres-Wechsel |
| Geometrie-Hilfsbibliothek | **Turf.js** | 7.x | Vereinfachung von Linien, Puffer, Entfernungen |
| Monorepo-Verwaltung | **pnpm Workspaces** | pnpm 10 | ein Repository für Web, API und gemeinsame Typen |
| Tests | **Vitest** | aktuell | gleiche Konfiguration wie Vite; für Score-Logik und Utilities verpflichtend |
| Routing-Engine | **Valhalla** (C++, als Docker-Container) | offizielles Image | wird nicht selbst geschrieben, sondern betrieben und tief konfiguriert |
| Reverse Proxy / Auslieferung | **Caddy** | 2.x | statische Dateien, Byte-Range-Auslieferung für PMTiles, Proxy zur API; TLS später mit einer Zeile |
| Containerisierung | **Docker** + **Docker Compose** | Engine 24+ | identische Umgebung lokal und später auf einem Server |
| Kartendaten-Aufbereitung (später) | **Planetiler** (Java) | aktuell | erzeugt die eigenen Vektor-Kacheln; wird nur als fertiges Werkzeug aufgerufen, kein Java-Code im Projekt |
| OSM-Datenwerkzeuge | **osmium-tool**, **pyosmium** (Python) | aktuell | Zusammenfügen und Zuschneiden von Kartendaten; Python nur für die Anreicherungsskripte der Popularitätsebene |

**Sprachbilanz:** Das Projekt ist zu über 95 Prozent TypeScript. C++ kommt nur ins Spiel, falls die letzte Tuning-Ebene gezogen wird (Anpassung der Kostenfunktion in Valhalla). Python erscheint nur in optionalen Datenaufbereitungsskripten. Java wird nie geschrieben, sondern nur als fertiges Werkzeug ausgeführt.

---

## 3. Systemarchitektur (textuelle Beschreibung)

Die Anwendung besteht aus vier lokal laufenden Bausteinen und einer Reihe externer, kostenfreier Datendienste.

**Lokale Bausteine, alle in einem Docker-Compose-Verbund:**

1. **Web-Container (Caddy).** Liefert das gebaute Frontend als statische Dateien aus, stellt später die eigenen Kartenkacheldateien mit Byte-Range-Unterstützung bereit und leitet alle Anfragen unter dem Pfad `/api` an den Backend-Container weiter. Nach außen ist ausschließlich dieser Container erreichbar.
2. **Backend-Container (Node.js, Fastify).** Die einzige Komponente, die Zugangsschlüssel kennt. Sie übersetzt Anfragen der Oberfläche in Routing-Aufrufe, betreibt Zwischenspeicher, führt die Analyse- und Bewertungslogik aus und kapselt später den KI-Agenten.
3. **Routing-Container (Valhalla).** Enthält den vorberechneten Routing-Graphen der konfigurierten Region und antwortet auf Routing-, Attribut- und Debug-Anfragen. Erreichbar nur innerhalb des Compose-Netzwerks, nicht vom Browser.
4. **Datenbank (SQLite als Datei).** Liegt in einem gemounteten Verzeichnis, wird vom Backend direkt gelesen und geschrieben. Kein eigener Container.

**Datenfluss einer Routenberechnung:** Der Browser sendet Wegpunkte, Profil und Tuning-Parameter an das Backend. Das Backend setzt daraus eine oder mehrere Routing-Anfragen zusammen, ruft den Routing-Container auf, holt für jede Antwort die Kantenattribute nach, berechnet Analyse und Bewertung, wählt bei mehreren Kandidaten den besten aus und liefert Geometrie, Kennzahlen und Bewertung zurück. Der Browser rendert die Geometrie und stellt die Kennzahlen dar.

**Externe Dienste und wer sie aufruft:** Die Basiskarte, das Geländerelief und das Radrouten-Overlay lädt der **Browser direkt**, weil diese Dienste ausdrücklich frei und unbegrenzt nutzbar sind und der Umweg über den eigenen Rechner nur Latenz kosten würde. Punkte von Interesse, die Detailanreicherung, die Adresssuche und die KI-Aufrufe laufen **ausschließlich über das Backend**, weil dort Schlüssel, Kontingente und Zwischenspeicher zentral kontrolliert werden.

**Architektur-Invarianten:**

- Zugangsschlüssel erscheinen niemals im Frontend-Bundle.
- Routing, Analyse, Bewertung und Tuning funktionieren vollständig ohne Internetverbindung. Nur Basiskarte, Punkte von Interesse und der KI-Modus benötigen Netz.
- Kein Baustein hält Zustand außerhalb der SQLite-Datei und des Dateisystems. Damit ist der gesamte Stack portabel.
- Der Routing-Container ist niemals direkt aus dem Browser erreichbar.

---

## 4. Karten-Layer und Datenquellen

### 4.1 Grundsatz: Anzeigeebene ist nicht Routingebene

Die Karten-Layer dienen der **Darstellung**. Die Kriterien, die in das **Routing** eingehen, stammen nicht aus Kartenkacheln, sondern aus den OpenStreetMap-Rohdaten, aus denen der Routing-Graph gebaut wird. Dort liegen alle Wegattribute in voller Detailtiefe vor: sämtliche Oberflächenwerte wie Asphalt, verdichteter Schotter, Kies, Naturboden, dazu Angaben zur Wegqualität, zur Wegetypisierung, alle Straßenklassen von Autobahn bis Wohnstraße, Radweg- und Fahrradstraßenangaben sowie die Zugehörigkeit zu Radroutennetzen. Die Anzeige-Layer visualisieren dieselben Informationen, dürfen aber vereinfachen. Beide Welten speisen sich aus derselben Quelle und bleiben dadurch konsistent.

**Praktische Folge:** Die beiden Kernkriterien Untergrund und Straßentyp sind vom ersten Tag an vollständig im Routing wirksam, auch wenn der flächendeckende Anzeige-Layer erst in einer späten Phase entsteht. Bis dahin wird die berechnete Route selbst segmentweise nach Untergrund beziehungsweise Straßentyp eingefärbt – genau dort, wo die Information gebraucht wird.

### 4.2 Layer-Spezifikation mit Bezugsquellen

Jeder Layer ist ein registriertes Modul mit einheitlicher Schnittstelle: Kennung, Datenquelle, Stil, Legende, Quellenangabe, minimale Zoomstufe und optionale Klickbehandlung. Layer sind einzeln zuschaltbar und voneinander unabhängig.

**L1 – Basiskarte.** Zweck: Orientierung; enthält bereits alle Straßentypen und eine Grobklassifizierung befestigt/unbefestigt. Quelle: `https://tiles.openfreemap.org/styles/liberty` (Alternativen `bright`, `positron`); Daten aus OpenStreetMap, wöchentlich aktualisiert. Lizenz: kostenlos und unbegrenzt nutzbar, keine Registrierung, kein Schlüssel; Quellenangabe „© OpenMapTiles © OpenStreetMap" erforderlich. Umsetzung: Stil-Definition kopieren und entsättigt einfärben, damit Route und Overlays hervortreten. Phase P0.

**L2 – Geländerelief.** Zweck: Plastik des Geländes. Quelle: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` aus dem offenen Datenprogramm von AWS. Einbindung als Höhenraster-Quelle mit Kodierung „terrarium" und darauf aufbauendem Schummerungs-Layer. Lizenz: kostenlos. Phase P0.

**L3 – Radroutennetz gesamt.** Zweck: Überblick über internationale, nationale, regionale und lokale Radroutennetze. Quelle: Rasterkacheln von `https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png`, gerendert aus den OpenStreetMap-Routenrelationen. Lizenz: kostenloser Gemeinschaftsdienst, angemessene Nutzung und Quellenangabe erwartet. Phase P0.

**L3a – Europäisches Fernradwegenetz, deutlich markiert.** Zweck: die EuroVelo-Routen als eigener, kräftig gestylter Layer mit Routennummern-Beschriftung. Quelle: OpenStreetMap-Relationen mit Typ Route, Route gleich Fahrrad und Netzebene international; im ersten Schritt über den Overpass-Dienst geladen und als Vektorgeometrie gerendert, später aus dem eigenen Kachelsatz L4. Lizenz: OpenStreetMap-Datenbanklizenz. Phase P1.

**L4 – Untergrund und Radinfrastruktur flächendeckend.** Zweck: Detailanzeige der Routing-Kernkriterien über die ganze Fläche, mit Oberflächenwerten, Wegqualität, Wegetypisierung, Radwegen, Fahrradstraßen und Netzzugehörigkeit. Quelle: eigener Vektorkachelsatz, erzeugt mit Planetiler und einem eigenen Profil aus den Geofabrik-Rohdaten; Ergebnis ist eine einzelne Kacheldatei, die der Web-Container mit Byte-Range-Anfragen ausliefert. Lizenz: OpenStreetMap-Datenbanklizenz; Kosten nur lokale Rechenzeit. Phase P5.

**L5 – Geplante Route, segmentweise eingefärbt.** Zweck: macht Untergrund beziehungsweise Straßentyp auf der Route sofort sichtbar und überbrückt den Anzeigebedarf bis L4 existiert. Quelle: Kantenattribute der berechneten Route aus dem Routing-Container. Umschaltbar zwischen Untergrund-, Straßentyp- und Steigungsdarstellung. Phase P3.

**L6 – Suchraum-Debug.** Zweck: sichtbar machen, welchen Bereich der Suchalgorithmus tatsächlich durchsucht hat; unverzichtbar, um Hierarchie-Einstellungen zu verstehen. Quelle: Expansions-Endpunkt des Routing-Containers, liefert den Suchbaum als Geometrie. Phase P2.

**L7 – GPS-Spuren-Overlay (optional).** Zweck: grobe Sichtprüfung, wo überhaupt gefahren wird. Quelle: `https://gps.tile.openstreetmap.org/lines/{z}/{x}/{y}.png`, alle öffentlich zu OpenStreetMap hochgeladenen Spuren. Wichtig: **nur Anzeige**, als Routing-Signal ungeeignet, weil die Darstellung kumulativ ohne Häufigkeitsabstufung erfolgt. Nutzungsregeln des Kachelservers beachten. Phase P4, optional.

**L8 – Persönliche Popularitätskarte.** Zweck: eigene gefahrene Wege anzeigen und als Datenbasis für das Popularitätssignal im Routing dienen. Quelle: eigenes Archiv aufgezeichneter Touren, in ein Raster überführt und als eigener Kachelsatz ausgeliefert. Phase P5.

**L9 – Punkte von Interesse.** Dreizehn Kategorien: Restaurants, Cafés, Supermärkte, Hotels, Campingplätze, Trinkwasser, Fahrradwerkstätten, Fahrradhändler, Bahnhöfe, Toiletten, Bushaltestellen, Sehenswürdigkeiten, Aussichtspunkte. Quelle: Overpass-Dienst unter `https://overpass-api.de/api/interpreter`, Ausweichinstanz `https://overpass.kumi.systems/api/interpreter`, jeweils über das Backend mit Zwischenspeicher. Lizenz: kostenlos bei angemessener Nutzung. Phase P4.

**L10 – Detailanreicherung von Punkten.** Zweck: Öffnungszeiten, Bewertung, Telefonnummer, Internetadresse als Zusatzinformation im Klick-Fenster. Quelle: Google Places API in der neuen Fassung, ausschließlich auf Klick, mit minimaler Feldauswahl. Kosten: null innerhalb der kostenlosen Monatsmengen, zusätzlich gesichert durch harte Mengenbegrenzungen in der Anbieterkonsole. Speicherung: höchstens dreißig Tage, dauerhaft nur die Ortskennung. Quellenangabe im Fenster verpflichtend. Phase P4.

### 4.3 Routing-Datenquellen

Alle Wegattribute stammen aus den OpenStreetMap-Rohdaten von Geofabrik unter `https://download.geofabrik.de/`. Bundesland-Auszüge liegen unter dem Pfad für Deutschland, Länder-Auszüge direkt unter Europa. Die Höhendaten lädt der Routing-Container beim Graphaufbau selbst herunter, sofern die entsprechende Option aktiviert ist; die Steigungen werden dabei dauerhaft in die Graphkanten eingerechnet, sodass die Rohdaten anschließend gelöscht werden können.

---

## 5. Routing-Engine, Region und Datenpipeline

### 5.1 Wahl der Engine

Gewählt ist **Valhalla**, betrieben als eigener Container. Ausschlaggebend sind vier Eigenschaften:

- **Gewichtungsänderung zur Laufzeit.** Alle Kostenparameter werden pro Anfrage übergeben und wirken sofort, ohne den Graphen neu zu berechnen. Nur so ist ein Tuning-Werkzeug mit kurzen Iterationszyklen möglich. Konkurrenzlösungen fixieren das Profil beim Vorberechnen oder benötigen je Profil einen eigenen Vorberechnungslauf.
- **Kantenattribute abrufbar.** Für jede Route lassen sich Oberfläche, Straßenklasse, Nutzungsart und Radweg-Kennzeichen je Kante abrufen. Das ist die Datengrundlage der Analyse und der Bewertung.
- **Suchraum sichtbar.** Ein eigener Endpunkt liefert den durchsuchten Bereich als Geometrie, wodurch Hierarchie-Einstellungen überprüfbar werden statt geraten.
- **Kachelbasierter Graph.** Dieselbe Software trägt ein Bundesland auf einem Notebook und Mitteleuropa auf einem Arbeitsrechner. Die Skalierung ist eine Daten-, keine Softwarefrage.

**Bewusste Nicht-Entscheidung:** Eine eigene Routing-Engine wird nicht geschrieben. Die Suchverfahren selbst sind Lehrbuchwissen, aber die Verarbeitung der Rohdaten, Abbiegebeschränkungen, Zugangsrechte und eine performante Suche über 400 Kilometer sind monatelanger Aufwand ohne Qualitätsgewinn. Die Kontrolle über die Suchlogik entsteht stattdessen über die vier Tuning-Ebenen in Kapitel 6, bis hinunter in den Quellcode der Kostenfunktion. Ein eigenes Lernprojekt für eine kleine Region bleibt als separates Vorhaben außerhalb dieses Fahrplans möglich.

### 5.2 Profile

Vier Profile sind reine Parametersätze, kein eigener Graph und kein Vorberechnungslauf:

| Parameter | Tourenrad | Rennrad | Gravel | Mountainbike |
|---|---|---|---|---|
| Radtyp | Hybrid | Rennrad | Cross | Mountainbike |
| Reisegeschwindigkeit (km/h) | 20 | 27 | 21 | 16 |
| Straßenmeidung (0 meidet, 1 gleichgültig) | 0,15 | 0,5 | 0,2 | 0,1 |
| Steigungsbereitschaft | 0,35 | 0,5 | 0,5 | 0,8 |
| Strenge gegen schlechte Oberflächen | 0,6 | 0,95 | 0,15 | 0,05 |
| Fährenbereitschaft | 0,5 | 0,3 | 0,5 | 0,5 |
| Wohnstraßenbereitschaft | 0,6 | 0,4 | 0,5 | 0,5 |

Diese Werte sind Startwerte und werden anhand von Referenztouren kalibriert. Zusätzlich bietet die Oberfläche drei Regler für Steigungsmeidung, Straßenmeidung und Oberflächenstrenge, die unmittelbar auf diese Parameter wirken.

### 5.3 Planungsfunktionen

- **Wegpunkte** werden als Haltepunkte oder als Durchfahrtpunkte gesetzt; ein Zug auf die Routenlinie erzeugt einen Durchfahrtpunkt, der die Route verformt, ohne als Etappenziel zu zählen.
- **Neuberechnung** ist entprellt, damit das Ziehen eines Punktes nicht dutzende Anfragen auslöst.
- **Rundtour** in zwei Varianten: manuell mit Start gleich Ziel und eigenen Zwischenpunkten sowie halbautomatisch über eine Heuristik, die aus der Wunschlänge einen Kreisradius berechnet, darauf mehrere Zwischenpunkte verteilt, mehrere Varianten mit unterschiedlichen Drehwinkeln berechnet und die Ergebnisse nach Länge und Bewertung sortiert zur Auswahl anbietet.
- **Strecke umkehren** durch Umkehren der Wegpunktreihenfolge.
- **Teilstück sperren** durch Ausschlussflächen um das gewählte Segment.
- **Import aufgezeichneter Touren** über die Kartenabgleichsfunktion der Engine, die eine fremde Spur auf das Wegenetz zieht und daraus eine bearbeitbare Route mit automatisch gesetzten Zwischenpunkten macht.
- **Export** als Spur, als Route und als Wegpunktliste.
- Die Höchstdistanz für Fahrradanfragen wird in der Dienstkonfiguration ausdrücklich auf mindestens 400 Kilometer gesetzt; bei Rundtouren zählt die Summe aller Teilstrecken.

### 5.4 Region als Konfiguration

Eine Konfigurationsdatei beschreibt die aktive Region mit Name, Bezugsquellen beziehungsweise Umrissfläche und einem Puffer von etwa fünfzig Kilometern über die Planungsregion hinaus. Der Puffer ist wichtig, weil Routen nahe der Datenkante sonst fehlschlagen oder unnatürlich verlaufen.

Drei Ausbaustufen desselben Mechanismus:

1. **Ein Bundesland.** Ein Auszug, Rohdaten unter einem Gigabyte, Graphaufbau in Minuten, Graph wenige Gigabyte. Startstufe.
2. **Mitteleuropa.** Deutschland, Österreich, Schweiz, Tschechien, Polen, Niederlande, Belgien, Luxemburg, Dänemark, Liechtenstein sowie Randstreifen im Elsass, in Norditalien, Slowenien und der Westslowakei. Rohdaten zwölf bis fünfzehn Gigabyte, Graph zwanzig bis dreißig Gigabyte, Aufbau lokal über Nacht bei sechzehn Gigabyte Arbeitsspeicher, drei bis sechs Stunden bei zweiunddreißig.
3. **Europa.** Nur bei Serverbetrieb sinnvoll; Graph etwa fünfundvierzig Gigabyte, gleicher Ablauf mit größerem Aufbaurechner.

### 5.5 Datenpipeline

Der Ablauf ist für alle Stufen identisch: Rohdaten gemäß Regionskonfiguration herunterladen und gegebenenfalls zusammenfügen, optional den Anreicherungsschritt für zusätzliche Datenebenen einschieben, den Graphaufbau im Aufbau-Profil des Containerverbunds starten, nach Abschluss die Höhen-Rohdaten löschen und in den normalen Betrieb wechseln. Bei zu schwacher lokaler Hardware läuft dasselbe Skript gegen einen stundenweise gemieteten Rechner; das fertige Graph-Archiv wird anschließend heruntergeladen. Aktualisierungen sind halbjährlich ausreichend, da sich das Wegenetz langsam ändert.

---

## 6. Eingriff in den Routing-Algorithmus: vier Tuning-Ebenen

Die Ebenen sind nach Aufwand und Eingriffstiefe geordnet. Empfehlung: von oben nach unten ausschöpfen; die ersten drei Ebenen erreichen erfahrungsgemäß nahezu alle Qualitätsziele.

### Ebene 1 – Kostenparameter zur Laufzeit

Wirkt pro Anfrage, ohne Neustart und ohne Neuaufbau. Gruppen:

- **Charakter:** Radtyp und Reisegeschwindigkeit bestimmen, welche Oberflächen als geeignet gelten und wie schnell gerechnet wird.
- **Präferenzen:** Straßenmeidung, Steigungsbereitschaft, Oberflächenstrenge, Fährenbereitschaft, Wohnstraßenbereitschaft, jeweils zwischen null und eins.
- **Strafkosten:** Zuschläge für Richtungswechsel, Tore, Gassen, Anliegerwege und Wirtschaftswege wirken gegen unruhige Streckenführung.
- **Suchverhalten:** Ein Schalter deaktiviert das Beschneiden der hierarchischen Suche. Damit findet die Suche auch in Randfällen die tatsächlich optimale Route, benötigt aber mehr Rechenzeit. Für Fahrradrouten bis 400 Kilometer im lokalen Betrieb gut vertretbar.
- **Geometriezwang:** Ausschlussflächen, ausgeschlossene Punkte, Wegpunkttypen sowie Einstellungen zum Anziehen von Punkten auf das Wegenetz.

Alle diese Parameter sind im Tuning-Werkzeug als Regler und Schalter abgebildet und lassen sich als benannte Voreinstellung speichern. Die vier Profile sind technisch nichts anderes als gespeicherte Voreinstellungen.

### Ebene 2 – Dienst- und Suchkonfiguration

Wirkt nach einem Neustart des Routing-Containers, ohne Neuaufbau des Graphen. Die Suche arbeitet auf einem hierarchischen Graphen mit drei Ebenen: Fernstraßen, überregionale Verbindungen und lokales Wegenetz. Einstellbar sind unter anderem, wie viele Kanten je Ebene ausgebaut werden, bevor die Suche auf eine höhere Ebene wechselt, die Dienstgrenzen einschließlich der Höchstdistanz sowie die Anzahl erlaubter Alternativrouten. Der Schalter, der harte Ausschlüsse überhaupt erlaubt, gehört ebenfalls hierher. Die Wirkung dieser Einstellungen wird über den Suchraum-Layer sichtbar gemacht.

### Ebene 3 – Kandidaten und eigenes Nachranking

Hier entsteht die eigentliche projektspezifische Intelligenz, ohne die Engine anzufassen. Ablauf: Das Backend erzeugt pro Planungsanfrage mehrere Kandidaten, einerseits über die Alternativroutenfunktion der Engine, andererseits über einen kleinen Parameterschwenk, bei dem zwei oder drei Varianten mit leicht verschobenen Gewichtungen parallel berechnet werden. Jeder Kandidat durchläuft die Analysekette. Der eigene Qualitätswert entscheidet, welcher Kandidat gewinnt; die übrigen bleiben als wählbare Alternativen sichtbar. Damit liegt die Entscheidungslogik vollständig im eigenen, versionierten Code und ist in Minuten veränderbar. Hier landen auch weiche Kriterien, die nicht in die Suche gehören, sowie der praktisch harte Ausschluss von Landstraßen.

### Ebene 4 – Anpassung der Kostenfunktion im Quellcode

Die Fahrrad-Kostenfunktion der Engine liegt offen: Geschwindigkeitsfaktoren je Oberfläche und Radtyp, Steigungskostenkurven, Straßenklassenfaktoren, Zuschläge für Radinfrastruktur. Vorgehen: Quellcode-Abbild anlegen, Konstanten und Kurven anpassen, eigenes Container-Abbild bauen. Der vorhandene Graph bleibt nutzbar, solange keine neuen Kantenattribute benötigt werden – die Kostenberechnung findet zur Laufzeit statt. Diese Ebene wird nur gezogen, wenn die ersten drei nachweislich nicht ausreichen, oder wenn eine neue Datenebene nach Weg B (Kapitel 7) in die Suche gebracht werden soll. Die Bauumgebung dafür wird vorbereitet, damit die Option jederzeit verfügbar ist.

### Kalibrierverfahren für alle Ebenen

Zwölf bis fünfzehn Referenztouren, die der Nutzer gut kennt, drei bis vier je Profil, im Repository abgelegt. Ein Skript berechnet zu jeder Referenztour mit dem aktuellen Parameterstand eine Route, vergleicht sie mit der Referenz über zwei Maße – Flächenabweichung zwischen den Linien und Anteil gemeinsamer Kanten – und gibt eine Vergleichstabelle aus. Jede Änderung wird gegen dieses Set gefahren, sodass Verschlechterungen sofort auffallen. Ergebnisse werden gespeichert, wodurch eine nachvollziehbare Tuning-Historie entsteht.

---

## 7. Harte Ausschlüsse und Profil-Implikationen

### 7.1 Ausschlussschalter

Voraussetzung: In der Dienstkonfiguration muss das Erlauben harter Ausschlüsse aktiviert sein. Ohne diese Freigabe ignoriert die Engine entsprechende Angaben und gibt lediglich eine Warnung zurück. Die Freigabe wird von Beginn an gesetzt.

| Ausschluss in der Oberfläche | Umsetzung | Härtegrad |
|---|---|---|
| Autobahn und Kraftfahrstraße | im Fahrradmodus bereits durch Zugangsrechte ausgeschlossen; ein zusätzlicher Ausschluss für Schnellstraßen existiert | automatisch hart |
| Fähren | weich über Fährenbereitschaft null, hart über den Fährenausschluss | wählbar |
| Schotter und unbefestigte Wege | hart über den Ausschluss unbefestigter Wege; zusätzlich bewirkt die höchste Stufe der Oberflächenstrenge, dass für den jeweiligen Radtyp ungeeignete Oberflächen vollständig aus der Routenfindung ausgeschlossen werden, einschließlich Start- und Zielpunkt | wählbar |
| Landstraßen ohne Radinfrastruktur | kein eingebauter harter Ausschluss vorhanden. Dreistufige Lösung: erstens weich über Straßenmeidung null; zweitens praktisch hart über den Kandidatenfilter auf Ebene 3, der Routen oberhalb eines Schwellenanteils verwirft; drittens echt hart erst über Ebene 4 | gestuft |
| Brücken, Tunnel, Maut | eingebaute Ausschlüsse vorhanden, Oberfläche optional | hart |
| Konkrete Abschnitte oder Gebiete | Ausschlussflächen beziehungsweise ausgeschlossene Punkte | hart |

**Gestaltungsregel:** Ein harter Ausschluss ist hart. Ist ein Ziel etwa nur über eine Fähre erreichbar, schlägt die Anfrage fehl. Das Backend erkennt diesen Fall und antwortet mit einer verständlichen Meldung samt Vorschlag, welchen Ausschluss man lockern könnte, statt einen technischen Fehler durchzureichen.

### 7.2 Profil-Implikationen

| Profil | automatisch gesetzt | Charakter |
|---|---|---|
| Rennrad | Ausschluss unbefestigter Wege aktiv, Oberflächenstrenge maximal, Straßenmeidung mittel, Fähren weich gemieden | Schotter ist per Definition ausgeschlossen |
| Normales Fahrrad und Touren | kein Oberflächenausschluss, mittlere Oberflächenstrenge, sehr niedrige Straßenmeidung, maximale Bevorzugung von Radwegen, Fahrradstraßen und ausgewiesenen Radroutennetzen; die europäischen und nationalen Fernradwege sind als Netzrelationen Teil des Graphen und werden von der Fahrrad-Kostenfunktion bereits bevorzugt, zusätzlich verstärkt über die Bewertung | zieht auf das Radwegenetz |
| Gravel | keine Ausschlüsse, sehr geringe Oberflächenstrenge | unbefestigte Abschnitte sind erwünscht |
| Mountainbike | keine Ausschlüsse, minimale Oberflächenstrenge, hohe Steigungsbereitschaft | alles fahrbar |

Regeln: Profile sind Voreinstellungen; jeder automatisch gesetzte Schalter bleibt sichtbar und überschreibbar. Widersprüchliche Kombinationen sind erlaubt, erzeugen aber einen sichtbaren Hinweis statt einer stillen Korrektur. Voreinstellungen speichern Gewichtungen und Ausschlüsse gemeinsam.

---

## 8. Informationsebenen: drei Wege ins Routing

Jede künftige Datenebene wird genau einem Weg zugeordnet.

**Weg A – Ebene steckt bereits in den Rohdaten.** Untergrund, Wegqualität, Straßenklasse, Radinfrastruktur, Zugehörigkeit zu Radroutennetzen und Steigung. Die Engine kennt diese Attribute; die Gewichtung erfolgt über die Regler der Ebene 1 beziehungsweise über die Kurven der Ebene 4. Untergrund- und Straßentyp-Gewichtung sind vollständig Weg A und damit ab Phase 2 live einstellbar.

**Weg B – externe Ebene über Anreicherung beim Graphaufbau.** Für Daten, die nicht in den Rohdaten stehen, etwa die eigene Popularität aus dem Tourenarchiv: Ein Anreicherungsschritt in der Datenpipeline ordnet die eigenen Spuren den Graphkanten zu, aggregiert die Häufigkeit und schreibt sie als zusätzliches Attribut in die Rohdaten. Eine kleine Anpassung der Kostenfunktion nach Ebene 4 liest dieses Attribut und macht daraus einen Kostenfaktor mit eigenem Regler in der Oberfläche. Der Aufwand fällt einmalig pro Ebene an, danach ist sie ein gewöhnlicher Regler. Die Invariante aus dem Anforderungsdokument bleibt gültig: Popularität ist ein begrenztes Bonussignal und überschreibt niemals Oberfläche, Straßenklasse oder Sperrungen.

**Weg C – weiche oder schnell veränderliche Ebene über das Nachranking.** Geöffnete Cafés entlang der Strecke, Versorgungsdichte, Ausstiegsmöglichkeiten per Bahn. Diese Ebenen fließen in die Bewertung und damit in die Kandidatenauswahl ein, nicht in die Suche selbst. Daten aus der kommerziellen Anreicherungsquelle sind ausschließlich Weg C beziehungsweise reine Anzeige, weil sie nicht dauerhaft gespeichert werden dürfen und deshalb niemals in einen Graphaufbau eingehen dürfen.

**Abschließendes Ergebnis der Heatmap-Recherche, Stand August 2026:** Es existiert keine frei nutzbare, aktuelle, hochwertige Popularitätskarte, die in eine eigene Anwendung eingebunden werden dürfte. Beim größten Anbieter ist die globale Popularitätskarte nur nach Anmeldung einsehbar, die Nutzungserlaubnis gilt ausdrücklich nur für das Nachzeichnen in Kartenbearbeitungsprogrammen, und die direkten Kachelzugriffe wurden im März 2025 technisch geschlossen. Der zweite große Sporthersteller bietet keine öffentliche Schnittstelle oder Lizenz an; weitere Anbieter halten ihre Popularitätskarten produktintern. Der Fremd-Layer entfällt daher. Ersatz: erstens die Radroutennetz-Zugehörigkeit als sofort wirksames Popularitätssignal über Weg A, zweitens das rein visuelle GPS-Spuren-Overlay ohne Routingwirkung, drittens die eigene Popularitätsebene aus dem persönlichen Tourenarchiv über Weg B.

---

## 9. Höhendaten und Höhenprofil

Steigungen sind nach dem Graphaufbau Bestandteil der Kanten; die Steigungsbereitschaft wirkt darauf. Das angezeigte Höhenprofil entsteht getrennt davon im Backend: Die Routenlinie wird etwa alle fünfzig Meter abgetastet, die Höhen werden aus den Geländekacheln gelesen, dekodiert und in einer Zwischenspeichertabelle gehalten. Nach einer Glättung gegen Messrauschen ergeben sich Gesamtanstieg, Gesamtabstieg, mittlere und maximale Steigung sowie eine Verteilung nach Steigungsklassen. Vorteil dieses Wegs: Es muss kein umfangreicher Höhendatensatz dauerhaft lokal liegen, und Anzeige und Relief nutzen dieselbe Datengrundlage.

---

## 10. Analyse und Qualitätsbewertung

**Datenfluss:** Route berechnen, Kantenattribute nachladen, Lichtsignalanlagen über eine Korridorabfrage ergänzen, Punkte von Interesse entlang der Strecke ermitteln, alles im Backend zu einem Analyseobjekt und einem Qualitätswert verdichten.

**Analyseobjekt während der Planung:** Gesamtlänge, Fahrzeit, Anstieg und Abstieg, mittlere und maximale Steigung, Oberflächenverteilung in Prozent und Kilometern, Straßenklassenverteilung, Anteil ausgewiesener Radwege und Radroutennetze, Anzahl größerer Kreuzungen, Anzahl Lichtsignalanlagen, Anzahl Punkte von Interesse je Kategorie.

**Qualitätswert:** gewichtete Summe normierter Teilwerte im Bereich null bis hundert, mit profilabhängigen Gewichten in einer Konfigurationsdatei, die ohne Neuauslieferung geändert werden kann. Teilwerte: Anteil profilgerechter Oberfläche, wobei beim Gravelprofil ein Anteil unbefestigter Wege zwischen vierzig und achtzig Prozent das Optimum bildet; Anteil Radinfrastruktur; Verkehrsbelastung als Gegenwert des Anteils größerer Straßen ohne Radinfrastruktur; Halte- und Kreuzungsdichte je zehn Kilometer, invertiert und gesättigt; Abweichung vom profiltypischen Höhenmeterkorridor; Versorgungsdichte mit Sättigung.

**Darstellung:** Neben der Zahl eine Aufschlüsselung in Klartextzeilen mit Symbolen, etwa Anteil Radwege, Anteil Bundesstraße, Anteil asphaltiert beziehungsweise Schotter, Kilometer durch Wald, Anzahl größerer Kreuzungen, geöffnete Cafés, Trinkwasserstellen, Bahnhöfe als Ausstiegsmöglichkeiten. Jede Zeile ist anklickbar und hebt die betreffenden Abschnitte oder Punkte auf der Karte hervor. Diese Aufschlüsselung ist das erklärte Unterscheidungsmerkmal gegenüber bestehenden Planungswerkzeugen und wird als eigenständiges Oberflächenmodul gebaut.

**Doppelnutzung:** Derselbe Qualitätswert ist die Rankingfunktion der Tuning-Ebene 3. Er bewertet Kandidatenrouten, bevor eine davon angezeigt wird.

---

## 11. Punkte von Interesse und Anreicherung

Primärquelle ist der Overpass-Dienst für alle dreizehn Kategorien. Die Kategorien werden auf Attributmengen der Rohdaten abgebildet, etwa Trinkwasser auf Trinkwasserstellen und als trinkbar gekennzeichnete Brunnen. Anfragen laufen ausschließlich über das Backend, mit kachelweisem Zwischenspeicher nach Geokennung und einer Haltbarkeit von zwei Wochen sowie Ausweichinstanz bei Ausfall.

Die kommerzielle Anreicherung erfolgt erst auf Klick eines konkreten Punktes. Die Zuordnung zwischen der offenen Datenquelle und dem kommerziellen Dienst erfolgt über Namens- und Koordinatensuche mit anschließendem Detailabruf. Kostenkontrolle: minimale Feldauswahl, weil die angefragten Felder die Abrechnungsstufe bestimmen; harte Mengenbegrenzungen in der Anbieterkonsole deutlich unterhalb der kostenlosen Monatsmengen; Kostenwarnung bei einem Euro. Rechtliche Vorgaben: Speicherung der Detaildaten höchstens dreißig Tage mit automatischer Löschung, dauerhaft nur die Ortskennung, Quellenangabe im Anzeigefenster. Die gesamte Funktion liegt hinter einem Schalter; ohne sie ist die Anwendung voll funktionsfähig.

Für Bewertung und Anzeige entlang der Strecke wird die Routenlinie vereinfacht und mit einem Korridor von fünfhundert Metern abgefragt; die Ergebnisse werden mit ihrer Kilometerposition auf der Route versehen.

---

## 12. Datenmodell und Schnittstellen

**Tabellen in der lokalen Datenbank:**

- Touren: Kennung, Name, Profil, Wegpunkte, Geometrie, Kennzahlen, Qualitätswert, Erstellzeitpunkt.
- Zwischenspeicher Punkte von Interesse: Kachelkennung, Kategorie, Geometriedaten, Abrufzeitpunkt, räumlicher Index.
- Zwischenspeicher Anreicherung: Ortskennung, Felder, Abrufzeitpunkt, Verfallszeitpunkt.
- Zwischenspeicher Geländekacheln: Zoom, Spalte, Zeile, Bilddaten.
- Tuning-Voreinstellungen: Name, Parametersatz einschließlich Ausschlüsse, Erstellzeitpunkt.
- Kalibrierläufe: Voreinstellung, Referenztour, Messwerte, Zeitpunkt.
- Eigene Spuren für die Popularitätsebene, spätere Phase.
- Verbrauchszähler für die KI-Nutzung, spätere Phase.

**Schnittstellen des Backends:**

- Route berechnen: Wegpunkte, Profil, Parameter, Ausschlüsse; liefert Geometrie, Etappen, Zeiten.
- Kandidaten berechnen: erzeugt mehrere Varianten, bewertet und sortiert sie.
- Route analysieren: liefert Analyseobjekt und Qualitätswert.
- Höhenprofil: liefert abgetastete Höhen und Kennzahlen.
- Punkte von Interesse: Bereich oder Korridor mit Kategorien.
- Punktdetails: Anreicherung eines einzelnen Punktes auf Anfrage.
- Rundtourvorschläge: Startpunkt, Wunschlänge, Profil; liefert mehrere bewertete Varianten.
- Touren verwalten: Anlegen, Lesen, Ändern, Löschen.
- Import und Export von Tourdateien.
- Tuning-Voreinstellungen verwalten.
- Suchraum abrufen, für die Debug-Darstellung.
- KI-Planung, spätere Phase, mit Fortschrittsübertragung.

---

## 13. KI-Planungsmodus als Add-on

Die Rollenteilung bleibt wie im Anforderungsdokument festgelegt: Die KI erzeugt ausschließlich eine geordnete Liste sinnvoller Zwischenziele mit Koordinaten und Präferenzen; die exakte Route berechnet die Routing-Engine. Damit bleiben Ergebnisse konsistent und reproduzierbar.

Umsetzung: ein Agent mit vier Werkzeugen – Adresssuche, Flächensuche für Wald, Seen und Flüsse, Punktsuche mit Nebenbedingungen wie „Café nach etwa vierzig Kilometern" sowie Routenvorschau, die nur Kennzahlen zurückgibt und keine Geometrie in den Kontext lädt. Der Agent prüft die Kennzahlen gegen die Wunschkriterien, passt Zwischenziele an und bricht nach höchstens vier Durchläufen ab. Ausgabe ist ein strukturierter Datensatz mit Profil, Parameterüberschreibungen, Zwischenzielen mit Beschriftung und einer Begründung. Die Zwischenschritte werden in der Oberfläche fortlaufend angezeigt, damit nachvollziehbar bleibt, warum eine Tour so aussieht. Das Ergebnis landet als gewöhnliche, vollständig bearbeitbare Wegpunktliste in der Planung. Kostenkontrolle über Obergrenzen je Planung und je Tag sowie einen Verbrauchszähler.

Diese Funktion wird zuletzt gebaut und hat keine Rückwirkung auf den Kern.

---

## 14. Skalierungspfad

Die Skalierung ist eine Konfigurations- und Datenfrage, kein Umbau.

| Baustein | bereits skalierfähig, weil | Änderung beim Hochskalieren |
|---|---|---|
| Containerverbund | identische Definition lokal und auf einem Server; Unterschiede nur in der Umgebungsdatei | Host wechseln, Verbund starten |
| Routing-Container | kachelbasiert, liest vom Datenträger; gleiche Software für jede Regionsgröße | größerer Graph, mehr Speicherplatz |
| Backend | zustandslos außer der Datenbankdatei; alle Pfade und Schlüssel über Umgebungsvariablen | unverändert |
| Datenbank | Zugriff ausschließlich über eine Abstraktionsschicht | nur bei Mehrbenutzerbetrieb: Wechsel auf einen Datenbankserver hinter derselben Schicht |
| Eigene Kachelsätze | statische Dateien mit Byte-Range-Auslieferung | größere Datei oder Ablage auf einem Objektspeicher |
| Frontend | statisches Bündel | unverändert |
| Externe Dienste | tragen die Last eines Einzelprojekts problemlos | erst bei echtem Mehrbenutzerbetrieb eigene Instanzen; die Basiskartensoftware ist vollständig offen und selbst betreibbar |

**Von Beginn an vorbereitete Schalter:** Netzwerkbindung standardmäßig nur auf den lokalen Rechner, umschaltbar über die Umgebungsdatei; Konfiguration des Web-Containers mit deaktiviertem, aber vorhandenem Block für Verschlüsselung und Zugangsschutz; Regionsgröße ausschließlich über die Regionskonfiguration; Aufbauskript identisch für lokale und gemietete Rechner.

**Ausbaustufen:** lokal ein Bundesland, lokal Mitteleuropa, Serverbetrieb mit Mitteleuropa oder Europa, schließlich Mehrbenutzerbetrieb außerhalb des Scopes mit dokumentiertem Pfad.

---

## 15. Betrieb, Sicherheit, Sicherung

Der Verbund wird bei Bedarf gestartet und danach beendet; kein automatischer Start nötig. Zwei Betriebsprofile: normaler Betrieb und Graphaufbau. Konfiguration über eine einzige Umgebungsdatei für Zugangsschlüssel und Region, alles Weitere in versionierten Konfigurationsdateien. Da nur der eigene Rechner Zugriff hat und alle Dienste auf die lokale Schnittstelle gebunden sind, sind Zugangsschutz, Verschlüsselung und Überwachung im lokalen Betrieb nicht erforderlich, aber vorbereitet. Sicherung: Projektordner mit Datenbankdatei, Referenztouren und Konfiguration wird vom normalen Rechner-Backup erfasst; Touren sind zusätzlich als Datei exportierbar. Alle Container existieren für gängige Prozessorarchitekturen; unter Windows läuft der Verbund über das Linux-Subsystem.

---

## 16. Risiken und offene Punkte

| Risiko | Einschätzung | Gegenmaßnahme |
|---|---|---|
| Harte Ausschlüsse führen zu „keine Route gefunden" | mittel | Fehler abfangen, Ursache benennen, Lockerung vorschlagen; weiche Vorstufe als Standard |
| Kein eingebauter harter Ausschluss für Landstraßen | mittel | dreistufige Lösung; Stufe zwei deckt den Praxisfall ab |
| Abschalten der Hierarchiebeschneidung erzeugt Wartezeiten bei großen Regionen | gering bis mittel | Kandidaten parallel berechnen; Qualitätsmodus optional; im Kalibrierverfahren messen |
| Lokale Hardware zu schwach für den Mitteleuropa-Aufbau | mittel | Start mit einem Bundesland; Ausweichaufbau auf gemietetem Rechner; Region frei zuschneidbar |
| Anreicherung nach Weg B erfordert Anpassung der Kostenfunktion | mittel | erst nach stabilem Kern; Anpassung als Patchsatz gegen eine feste Version; vorher liefert Ebene 3 Popularität im Ranking |
| Nutzungsbedingungen der kommerziellen Anreicherung ändern sich | mittel | hinter Schalter gekapselt, reine Anzeigeebene, Prüfung unmittelbar vor Umsetzung |
| Verfügbarkeit der Gemeinschaftsdienste für Kacheln und Abfragen | gering | nur Anzeige beziehungsweise Zwischenspeicher mit Ausweichinstanz; ab Phase 5 ersetzt der eigene Kachelsatz die externe Radroutendarstellung |
| Aufmerksamkeitsverlagerung auf Anzeigefunktionen vor stabilem Routingkern | mittel | Fahrplandisziplin: die ersten vier Phasen enthalten ausschließlich Routing, Tuning und Bewertung |

---

## 17. Phasenplan im Überblick

Die ausführliche Schritt-für-Schritt-Anleitung mit Installationsbefehlen und Übergabetexten für den Coding-Agenten steht im Begleitdokument. Hier nur die Gliederung mit Meilensteinen.

**Phase 0 – Fundament auf Bundesland-Ebene.** Entwicklungsumgebung, Projektgerüst, Containerverbund mit Routing-Container und aufgebautem Graphen für ein Bundesland, Karte mit Basiskarte, Relief und Radroutennetz. Meilenstein: eine Fahrradroute wird über die eigene Oberfläche berechnet und angezeigt.

**Phase 1 – Kern-Tourplanung.** Wegpunkte setzen, ziehen, sortieren; Profile mit ihren automatischen Implikationen; Höhenprofil; Rundtour, Umkehren, Sperren; Import und Export; Ausschlusspanel mit verständlicher Fehlerbehandlung; europäisches Fernradwegenetz als eigener Layer. Meilenstein: vollständig benutzbarer Tourenplaner.

**Phase 2 – Tuning-Werkzeuge.** Tuning-Werkzeug mit allen Reglern und Schaltern, Vergleich zweier Parameterstände, Voreinstellungsverwaltung; Suchraumdarstellung und festgelegte Dienstkonfiguration; Kalibrierwerkzeug mit Referenztouren. Meilenstein: Gewichtungen sind live veränderbar und ihre Wirkung ist messbar.

**Phase 3 – Analyse, Bewertung, Kandidatenauswahl.** Kantenattribute und Analyseobjekt; Einfärbung der Route; Qualitätswert mit anklickbarer Aufschlüsselung; Kandidatenberechnung mit eigenem Nachranking; Kalibrierdurchlauf. Meilenstein: funktionierendes, tunebares und bewertetes Routing-System – das Kernprodukt ist fertig.

**Phase 4 – Anzeigeerweiterungen.** Punkte von Interesse aus der offenen Quelle; Detailanreicherung auf Klick; optionales Spuren-Overlay.

**Phase 5 – Datenebenen und Region ausbauen.** Mitteleuropa-Aufbau über dieselbe Pipeline; Bauumgebung für Anpassungen der Kostenfunktion; eigene Popularitätsebene über Weg B; eigener flächendeckender Untergrund-Kachelsatz.

**Phase 6 – KI-Add-on und optionaler Serverbetrieb.**

---

## 18. Bewusst nicht im Scope

Eigene Routing-Engine von Grund auf, wobei ein separates Lernprojekt für eine kleine Region möglich bleibt. Live-Verkehrsdaten, da kostenfrei nicht seriös verfügbar; die Straßenklasse dient als Näherung. Mehrbenutzerbetrieb und Teilen von Touren, Pfad dokumentiert, aber nicht gebaut. Offline-Vektorkarten in der Anwendung. Abbiegeanweisungen und Navigation im Browser; die Übergabe an ein Fahrradnavigationsgerät erfolgt über den Dateiexport. Popularitätskarten kommerzieller Anbieter aus Lizenzgründen.
