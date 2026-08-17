# CyclePlanner – Feature-Ideen & Konzepte (Brainstorm)

> Stand: nach dem Grundausbau (MapLibre-Migration, Layer-Panel, Höhenprofil-Zoom,
> POI-Pipeline, Fahrprofil + Startzeit, Regenradar, D-Netz/EuroVelo).
>
> **Legende** — Aufwand: **S** = Stunden bis 1 Tag · **M** = 1–3 Tage · **L** = 1 Woche+ ·
> Netz: 🖧 = braucht Internet · 🏠 = läuft lokal/offline.
> Datenquellen sind, wo möglich, frei und keylos (passt zur lokalen Architektur:
> API-Keys nur im Backend, keine Keys im Frontend-Bundle).
>
> **✅ = bereits umgesetzt** (Stand: Feature-Runde „Wind/Wetter/POI/Segmente").

---

## 1. Routing & Routenplanung

### 1.1 Wind-Routing & Wind-Vorschau ✅
**Idee:** Die Route bevorzugt Abschnitte mit Rückenwind; Karte zeigt Windrichtung und -stärke entlang der Tour.
**Konzept:** Open-Meteo (frei, keylos) liefert Windprognosen für Startzeit + Streckendauer. Das Backend projiziert den Windvektor auf jede Kantenrichtung und bestraft Gegenwind im Candidate-Re-Ranking (Tuning-Level 3 — kein Eingriff in Valhalla nötig). Als Karten-Overlay: animierte Windpfeile. Aufwand **M**, 🖧.
**Umsetzung:** `/api/route/wind-optimized` (Kandidaten-Re-Ranking 70 % Qualität / 30 % Wind), Wind-Overlay unter der Route (grün = Rückenwind, rot = Gegenwind), Wind-Infos in der Routeninfo.

### 1.2 Startzeit-Optimierer ✅
**Idee:** „Wann soll ich starten?" — die App schlägt das beste Abfahrtsfenster vor.
**Konzept:** Wetterprognose (Regen, Wind, Temperatur) + Sonnenstand (SunCalc, frei) werden auf den Streckenverlauf und die Fahrzeit projiziert; jedes Startfenster bekommt eine Ampel (grün/gelb/rot). Baut auf dem vorhandenen Fahrprofil/Startzeit-Feld auf. Aufwand **M**, 🖧.
**Umsetzung:** `/api/weather/windows` wertet alle Tageslicht-Abfahrten der nächsten 48 h aus (🟢🟡🔴 mit Score); im Fahrprofil-Panel als auswählbare Vorschläge.

### 1.10 Segment-Bibliothek ✅
**Idee:** Lieblingsabschnitte speichern und neue Touren daraus zusammenstecken.
**Konzept:** Nutzer markiert einen Routenteil als benanntes Segment (z. B. „Elberadweg Stück"); Segmente werden in SQLite gespeichert und beim Planen per Valhalla zu einer Tour verbunden. Aufwand **M**, 🏠.
**Umsetzung:** Im Höhenprofil-Zoom „☆ Segment speichern" (speichert den gezoomten Abschnitt), Liste im Ebenen-Panel mit „↳ Anhängen" und Löschen; Persistenz in SQLite (`/api/segments`).

### 1.3 Schatten-Routing (Sommer-Modus)
**Idee:** Bei Hitze bevorzugt die Route Wald-, Allee- und Nordhang-Abschnitte.
**Konzept:** Schattenanteil pro Kante aus OSM (`landuse=forest`, `natural=tree_row`) + Baumdichte (Copernicus Tree Cover Density, einmaliger Download → PMTiles, 🏠 danach); Gewichtung abhängig von Temperatur und Sonnenstand zur Startzeit. Aufwand **L**, 🏠.

### 1.4 Etappen-Planer (Mehrtagestouren)
**Idee:** Eine lange Strecke wird automatisch in Tagesetappen mit Übernachtungsvorschlägen geteilt.
**Konzept:** Tagesdistanz aus Ø-Geschwindigkeit und Fitness; Etappen-Endpunkte werden an der POI-Dichte (Camping, Bett+Bike, Hotels — Kategorien existieren bereits in `POI_CATEGORIES`) ausgerichtet; Export je Etappe als GPX plus Gesamtübersicht. Aufwand **M**, 🏠.

### 1.5 Anreise-Planer (Bike + Ride)
**Idee:** Mit der Bahn zum Start, von dort radeln, mit der Bahn heim.
**Konzept:** Bahnhöfe (Kategorie existiert) als Start/Ziel-Kandidaten; Bahnstrecken-Overlay ist schon da (OpenRailwayMap). Optional Fahrpläne über GTFS-Feeds; sonst nur Strecken-/Haltestellen-Anzeige. Aufwand **M–L**, 🖧 (GTFS).

### 1.6 Sternfahrt-Planer (Gruppentouren)
**Idee:** Treffpunkt-Optimierung: Alle starten zu Hause und treffen sich möglichst fair in der Mitte.
**Konzept:** N Startadressen → Backend berechnet Routen zu Kandidaten-Treffpunkten und minimiert die maximale Anreisedistanz (K-Median-Heuristik auf Valhalla-Ergebnissen). Ergebnis: Treffpunkt + Route je Person. Aufwand **M**, 🏠.

### 1.7 „Überrasch-mich"-Modus
**Idee:** Statt starrer A→B-Planung: drei völlig unterschiedliche Routen (Szenisch / Flach / Wild).
**Konzept:** Candidate-Generator mit stark gespreizten Parametern plus Soft-Zielen (Aussichtspunkte, Gewässer, Waldanteil); die KI schreibt zu jeder Variante einen Begründungssatz. Aufwand **M**, 🏠.

### 1.8 Höhenmeter-Trainingsmodus
**Idee:** Gezielt Hügel einbauen: „Ich will 800 hm auf 80 km".
**Konzept:** Parameter-Sweep über Valhalla-Kandidaten (use_hills, Detours) bis das Höhenmeter-Ziel erreicht ist; Live-Anzeige „Erreicht: 812 / 800 hm" mit dem vorhandenen Elevation-Service. Aufwand **S–M**, 🏠.

### 1.9 Stopp-Routing (Badesee / Café / Bäckerei)
**Idee:** Die Route erzwingt Zwischenstopps: „alle 20 km ein Badesee" oder „Café bei km 35".
**Konzept:** Bestehende POI-Pipeline (Seen, Supermärkte) liefert die Kandidaten; der nächste POI im Korridor wird als Via-Waypoint in die Route eingeschleift. Aufwand **M**, 🏠.

### 1.11 Pendler-Vergleich
**Idee:** Die Alltagsstrecke dauerhaft beobachten: schnellste vs. sicherste vs. schönste Alternative.
**Konzept:** Gespeicherte Pendelstrecke; täglicher Vergleich auf Basis des Qualitäts-Scores; Ausgabe wie „Alternative spart 6 min, hat aber 30 % weniger Radweg". Aufwand **S–M**, 🏠.

### 1.12 Rückfahrt-Optionen
**Idee:** Nach der Tour nach Hause: Bahnverbindungen mit Fahrradmitnahme am Ziel anzeigen.
**Konzept:** Bahnhöfe in Zielnähe + Radmitnahme-Infos (OSM/ÖPNV-Daten) als „Heimweg"-Ansicht; optional Deep-Link in die Bahn-App. Aufwand **M**, 🖧.

---

## 2. Analyse, Bewertung & Wetter

### 2.1 Wetter-Risiko-Ampel je Etappe ✅
**Idee:** Pro 10-km-Abschnitt eine Wetterampel für den geplanten Zeitpunkt (Regen, Wind, Temperatur, Gewitter).
**Konzept:** Open-Meteo-Stundendaten werden über die Fahrzeit auf die Strecke gelegt (Startzeit aus dem Fahrprofil); Ergebnis als farbige Leiste über dem Höhenprofil. Aufwand **M**, 🖧.
**Umsetzung:** `/api/weather/route` liefert 10 Distanz-Buckets mit Risikostufe; der Streifen (grün/gelb/rot) liegt direkt über dem Höhenprofil und folgt dem Zoom.

### 2.2 Wind-Overlay (live)
**Idee:** Animierte Windpfeile auf der Karte (Stärke + Richtung).
**Konzept:** Open-Meteo-Rasterdaten → Canvas/Raster-Overlay; kombiniert mit dem Routenverlauf sieht man sofort Gegenwind-Abschnitte. Aufwand **S–M**, 🖧.

### 2.3 Sonnen- & Schatten-Vorschau
**Idee:** Wo steht die Sonne während der Tour? (Blendung, Schattenseiten)
**Konzept:** SunCalc + Geländemodell (Terrarium-DEM ist im Backend schon da) → Sonneneinstrahlung pro Segment als Farbverlauf auf der Route. Aufwand **M**, 🏠.

### 2.4 Schwierigkeitsgrad (komoot-ähnlich)
**Idee:** Einheitliche Einstufung Leicht / Mittel / Schwer / Experte für jede Tour.
**Konzept:** Gewichtete Formel aus Distanz, Höhenmetern, Maximalsteigung und Belag (Daten existieren alle im Elevation-/Analyse-Service); als Badge in der Routeninfo und zum Filtern der Bibliothek. Aufwand **S**, 🏠.

### 2.5 Komfort-Score
**Idee:** Wie angenehm ist die Tour zu fahren? (Belag, Verkehr, Steigungen)
**Konzept:** Erweiterung des vorhandenen Quality-Scores um einen nutzerfreundlichen 0–100-Komfortwert mit Aufschlüsselung; Farbcodierung auf der Route (grün→rot) existiert teils schon. Aufwand **S–M**, 🏠.

### 2.6 Sicherheits-Score ✅
**Idee:** Wie sicher ist die Route? (Radweganteil, Straßenklassen, Kreuzungen, Ampeln)
**Konzept:** Auswertung der Route-Analyse: Anteil Radweg/ruhige Straßen vs. Bundesstraßen; Ampeln/Kreuzungen aus OSM (`highway=traffic_signals`, `crossing=*`). Anzeige als „Sicherheits-Radar" + Verbesserungsvorschläge. Aufwand **M**, 🏠.
**Umsetzung:** 0–100-Score in der Routeninfo mit autofrei-/Bundesstraßen-Balken und Tipps; reine Frontend-Funktion (`lib/safety.ts`, getestet).

### 2.7 Lärm-Index
**Idee:** Wie laut ist die Strecke? — „Ruhigste Route"-Modus.
**Konzept:** Lärmmodell aus OSM-Straßenklasse + Tempolimit (Näherung); als Overlay-Färbung auf der Route und als Optimierungsziel im Re-Ranking. Aufwand **M**, 🏠.

### 2.8 Kalorien- & Trainingslast
**Idee:** Energieverbrauch und Trainingsbelastung je Tour (in kcal und TSS-ähnlichem Wert).
**Konzept:** Modell aus Distanz, Steigung, Belag und Fahrergewicht/Radtyp (Fahrprofil); Anzeige in der Routeninfo und im Statistik-Dashboard. Aufwand **S**, 🏠.

### 2.9 Touren-Radar („Genom" + ähnliche Touren)
**Idee:** Jede Tour bekommt einen Fingerabdruck (Steigung, Belag, Verkehr, Natur, Wasser) — und die App findet ähnliche Touren.
**Konzept:** Radar-Chart aus den Analyse-Werten; Ähnlichkeitssuche über gespeicherte Touren per Distanzmetrik im SQLite-Bestand. Aufwand **M**, 🏠.

### 2.10 10-km-Steckbriefe
**Idee:** Die Tour kompakt in Abschnitte zerlegt: je 10 km Karte mit Belag, Steigung, Wind, POIs.
**Konzept:** Aggregation der vorhandenen Edge-Daten in Kilometer-Karten (wie ein „Wetterbericht" für die Tour); scrollbare Kacheln neben der Karte. Aufwand **M**, 🏠.

### 2.11 Foto-Hotspots (Wikimedia Commons)
**Idee:** „Was gibt es unterwegs zu sehen?" — georeferenzierte Fotos entlang der Route.
**Konzept:** Wikimedia-Commons-API (frei, keylos) liefert Bilder mit Koordinaten; Backend filtert auf den Routenkorridor, Frontend zeigt Miniatur-Vorschauen + Link. Aufwand **M**, 🖧.

### 2.12 Rekord-Analyse (Ist vs. Plan)
**Idee:** Nach der Aufzeichnung: Wo war ich schneller/langsamer als geplant?
**Konzept:** GPS-Aufzeichnung (siehe 5.4) wird mit der geplanten Route gematcht; Abweichungen (Tempo, Pausen, Höhe) werden auf dem Höhenprofil farblich markiert. Aufwand **M**, 🏠.

---

## 3. Karten-Layer & POIs

### 3.1 POI-Kategorien aktivieren (Quick-Win!) ✅
**Idee:** Trinkwasser, WCs, Picknickplätze, Bänke, Fahrradläden, Reparaturstationen, Unterstände, Camping, Bahnhöfe, Aussichtspunkte als zuschaltbare Marker.
**Konzept:** All diese Kategorien sind in `POI_CATEGORIES` bereits definiert — es fehlen nur die Schalter im Ebenen-Panel und Marker-Icons (gleiche Pipeline wie Supermärkte/Badeseen). Aufwand **S**, 🏠.
**Umsetzung:** 11 Marker-Kategorien mit eigenen Icons und Zoom-Schwellen als Schalter im Ebenen-Panel.

### 3.2 E-Bike-Ladestationen
**Idee:** Ladepunkte mit Steckertyp als Overlay.
**Konzept:** OSM `amenity=charging_station` + `bicycle=yes`-Filter über die POI-Pipeline; Details via OpenChargeMap (API-Key im Backend) als Ergänzung. Aufwand **S–M**, 🏠/🖧.

### 3.3 Fähr-Info
**Idee:** Fährverbindungen entlang der Route mit Betriebszeiten und Radmitnahme.
**Konzept:** OSM `route=ferry`-Relationen im Korridor; Öffnungszeiten aus OSM-Tags; Warnung in der Routeninfo, wenn eine Fähre saisonal fährt. Aufwand **M**, 🏠.

### 3.4 Schutzgebiete & Nationalparks
**Idee:** Overlay mit Naturschutzgebieten, Nationalparks, Naturparks.
**Konzept:** WDPA/OSM `boundary=protected_area` als einmalig konvertiertes GeoJSON/PMTiles (Download, dann 🏠); dezent grün schraffiert. Aufwand **S–M**, 🏠.

### 3.5 Sperrungen & Baustellen
**Idee:** Aktuelle Wegsperrungen auf der Route anzeigen.
**Konzept:** OSM `access=no`/`highway=construction` + temporäre Sperrungen aus lokalen Datenquellen; Abgleich mit der geplanten Route → Warnhinweis. Aufwand **M**, 🖧.

### 3.6 Steigungs-Heatmap
**Idee:** Kartenweite Einfärbung der Steigung (nützlich für die Regionenwahl).
**Konzept:** Aus dem vorhandenen Terrarium-DEM (Backend) vorberechnete Steigungs-PMTiles einmalig erzeugen; als Overlay-Layer. Aufwand **L**, 🏠.

### 3.7 Persönliche Heatmap
**Idee:** Deine gefahrenen Strecken leuchten auf der Karte („Wo war ich schon überall?").
**Konzept:** Aufgezeichnete/importierte GPX-Tracks werden als Linien mit geringer Deckkraft übereinandergelegt; reine Frontend-Funktion auf den gespeicherten Tracks. Aufwand **S**, 🏠.

### 3.8 Historische Karten
**Idee:** Alte Karten als Overlay (z. B. Meilenblätter, historische Sachsen-Karten).
**Konzept:** Frei verfügbare historische Kartenwerke (z. B. Deutsche Fotothek/Geodatenportale) als WMS/Tiles; ein Eintrag im Layer-Panel. Aufwand **M**, 🖧/🏠.

---

## 4. Touren-Verwaltung & Community

### 4.1 Touren-Bibliothek
**Idee:** Geplante und gefahrene Touren speichern, taggen, favorisieren, durchsuchen.
**Konzept:** SQLite-Tabelle für Touren (Geometrie, Metadaten, Tags, Bewertung); UI-Bereich „Meine Touren" mit Suche/Filter (Distanz, Schwierigkeit, Region). Aufwand **M**, 🏠.

### 4.2 Touren-Vergleich (Split-Ansicht)
**Idee:** Zwei Touren direkt nebeneinander: Karten nebeneinander + Kennzahlen-Duell.
**Konzept:** Route B existiert schon — ausbauen zu einer echten Vergleichsansicht mit Score-Spalten und „Unterschiede"-Liste. Aufwand **M**, 🏠.

### 4.3 Statistik-Dashboard
**Idee:** km/Monat, Höhenmeter, Fahrzeit, Lieblingsstrecken im Jahresverlauf.
**Konzept:** Aggregation der Bibliothek + Aufzeichnungen; einfache SVG-Charts im Frontend (keine Chart-Lib nötig). Aufwand **S–M**, 🏠.

### 4.4 Kollektionen
**Idee:** Touren thematisch bündeln: „Sommertouren 2026", „Feierabendrunden".
**Konzept:** N:M-Zuordnung in SQLite; Kollektionen sind teilbar und durchsuchbar. Aufwand **S**, 🏠.

### 4.5 Touren teilen
**Idee:** Tour als Link/QR-Code teilen (GPX-Download + Vorschau-Karte).
**Konzept:** Exportiertes GPX + statische Mini-Karte; im lokalen Betrieb als Datei, optional Upload-Service später. Aufwand **S–M**, 🏠.

### 4.6 Route des Tages
**Idee:** Täglich ein Routenvorschlag passend zu Wetter, Jahreszeit und deinem Profil.
**Konzept:** Generator kombiniert Startort, Distanz-Präferenz, Wetter und Saison; als Karte beim App-Start. Aufwand **M**, 🖧.

### 4.7 Tour-Bingo & Challenges
**Idee:** Gamification: „Sammle alle Seen der Region", „Everesting", „100-km-Abzeichen".
**Konzept:** Regelbasierte Abzeichen auf Basis von Analyse-Daten + POIs; Anzeige im Dashboard. Aufwand **M**, 🏠.

---

## 5. Navigation & Unterwegs

### 5.1 Live-Navigation
**Idee:** Echte Navigation mit GPS-Folgen, Abbiegehinweisen und Sprachansage.
**Konzept:** Valhalla liefert bereits Manöver (directions) — Backend stellt sie als Turn-by-Turn-Liste bereit; Frontend folgt der Position (Geolocation-API), kündigt Manöver an, zeigt „Noch 3,2 km bis zur Abzweigung". Aufwand **L**, 🏠 (GPS) / optional Stimme.

### 5.2 Offline-Packen (PWA)
**Idee:** Kartenausschnitt + Route + Höhenprofil für unterwegs herunterladen.
**Konzept:** App als PWA (Service Worker, Cache); Region als PMTiles-Paket herunterladen (passt zur Caddy/PMTiles-Architektur); Tour funktioniert ohne Netz. Aufwand **L**, 🏠.

### 5.3 Notfall-Finder
**Idee:** Unterwegs sofort: nächste Werkstatt, Pannenhilfe, Krankenhaus, Bahnhof.
**Konzept:** Ein „Hilfe"-Knopf; POI-Suche radial um die aktuelle Position (Kategorien bikeShop/bikeRepair existieren); Direkt-Link zu Google-Maps-Route. Aufwand **S**, 🏠.

### 5.4 Fahrt-Aufzeichnung
**Idee:** Die Tour unterwegs aufzeichnen (GPX) und mit der Planung vergleichen.
**Konzept:** Geolocation-API zeichnet Track auf; Export als GPX (vorhanden) + Ist/Plan-Abgleich (2.12); Aufzeichnungen fließen in Bibliothek/Statistik/Heatmap. Aufwand **M**, 🏠.

### 5.5 Live-Standort teilen
**Idee:** Positionslink für Familie/Freunde während der Tour.
**Konzept:** Optionaler, privater Link mit Live-Position (nur auf Wunsch, lokal hostbar); reine Privacy-first-Option ohne Dritt-Dienste. Aufwand **M**, 🖧 (Server).

### 5.6 Vorschau-Fahrt (Animation)
**Idee:** Die Tour vorab „abfahren": Kamera fliegt die Route entlang, Wetter/Steigung werden eingeblendet.
**Konzept:** MapLibre-Kamera-Animation entlang der Geometrie, synchron mit dem Höhenprofil-Cursor; ideal zur Tourenkontrolle. Aufwand **M**, 🏠.

---

## 6. KI & Smarte Helfer

### 6.1 KI-Tourkritiker
**Idee:** Die KI bewertet deine geplante Tour und schlägt konkrete Verbesserungen vor.
**Konzept:** Analyse-Daten (Belag, Verkehr, Steigung, Wetter) als Kontext an den vorhandenen KI-Agenten; Ausgabe: Stärken/Schwächen + 3 Verbesserungsvorschläge. Aufwand **M**, 🖧.

### 6.2 KI-Wetterberater
**Idee:** „Soll ich die Tour morgen fahren oder verschieben?"
**Konzept:** KI interpretiert die Wetterprognose entlang der Route in einer klaren Empfehlung mit Begründung. Aufwand **S–M**, 🖧.

### 6.3 KI-Tourbeschreibung
**Idee:** Für jede Tour ein schöner Beschreibungstext („Erzähltext") für Tagebuch/Export.
**Konzept:** KI generiert aus Routendaten + POIs + Wetter eine 3–5-Satz-Beschreibung; wird im GPX/Metadaten gespeichert. Aufwand **S**, 🖧.

### 6.4 KI-Varianten mit Begründung
**Idee:** Drei Routenvorschläge mit je einem Satz „Warum diese Route?".
**Konzept:** Erweiterung des Überrasch-mich-Modus (1.7): Der KI-Agent bekommt die Kennzahlen der Varianten und erklärt die Unterschiede in Alltagssprache. Aufwand **M**, 🖧.

### 6.5 KI-Packliste
**Idee:** Aus Tour (Distanz, Belag, Wetter, Jahreszeit) eine Material-Checkliste generieren.
**Konzept:** Regelbasiert + KI-Text: „Regenjacke (70 % Regenrisiko), 2 Schläuche (viel Schotter), Badesachen (Badesee bei km 34)". Aufwand **S–M**, 🖧/🏠 (regelbasiert).

---

## 7. Komfort & UX

### 7.1 Undo/Redo für Wegpunkte
**Idee:** Fehlklicks rückgängig machen (Strg+Z / Buttons).
**Konzept:** Aktions-Historie im Waypoint-Store (bestehender Zustand-Store); Undo/Redo-Stack. Aufwand **S**, 🏠.

### 7.2 Tastatur-Shortcuts
**Idee:** Profi-Bedienung: E = Ebenen, R = Route neu, Esc = schließen, ←/→ = Karte.
**Konzept:** Globale Shortcut-Map + Cheatsheet-Overlay („?"). Aufwand **S**, 🏠.

### 7.3 Dark Mode
**Idee:** Dunkles Farbschema für Abendplanung.
**Konzept:** Tailwind-Dark-Mode + dunkle Basemap (CARTO Dark Matter — im Katalog dokumentiert, frei). Aufwand **S–M**, 🏠.

### 7.4 Druck-Tourenblatt (PDF)
**Idee:** Klassisches Radtourenblatt: Karte + Höhenprofil + Wegpunkte + Legende zum Drucken.
**Konzept:** Druck-optimierte Ansicht (CSS `@media print`) oder serverseitiges PDF; ideal zum Mitnehmen ohne Handy. Aufwand **M**, 🏠.

### 7.5 E-Bike-Reichweiten-Planer
**Idee:** Reicht der Akku? Reichweite je Unterstützungsstufe mit Ladestopp-Vorschlägen.
**Konzept:** Verbrauchsmodell aus Steigung, Belag und Unterstützungsstufe; Akkukapazität im Fahrprofil; Vorschlag „Bei km 42 laden (Steckdose am Café)". Aufwand **M**, 🏠.

### 7.6 Mehrere Fahrräder im Profil
**Idee:** Profil pro Rad (Tourenrad, Gravel, E-Bike) mit Gewicht, Reifenbreite, Akku.
**Konzept:** Fahrprofil-Verwaltung erweitern; Reifenbreite fließt in Belag-Empfehlungen ein, Akku in den Reichweiten-Planer. Aufwand **S–M**, 🏠.

### 7.7 CO₂-/Auto-Vergleich
**Idee:** „Diese Tour spart X kg CO₂ gegenüber dem Auto."
**Konzept:** Einfache Faustformel aus Distanz; motivierende Anzeige in Routeninfo und Statistik. Aufwand **S**, 🏠.

---

## Top-Empfehlungen (Impact × Aufwand)

| # | Feature | Aufwand | Warum |
|---|---|---|---|
| 1 | Wind-Routing (1.1) | M | Einzigartiges Differenzierungsmerkmal, freie Daten |
| 2 | Startzeit-Optimierer (1.2) | M | Baut auf Fahrprofil/Startzeit auf, hoher Alltagsnutzen |
| 3 | Wetter-Risiko-Ampel (2.1) | M | Komplettiert die Wetter-Story über dem Höhenprofil |
| 4 | POI-Kategorien aktivieren (3.1) | S | Größter Quick-Win — Datenmodell existiert komplett |
| 5 | Schwierigkeitsgrad (2.4) | S | Vergleichbarkeit, Sortierung der Bibliothek |
| 6 | Sicherheits-Score (2.6) | M | Kernnutzen für Freizeitradler |
| 7 | Etappen-Planer (1.4) | M | Erschließt Mehrtagestouren |
| 8 | Segment-Bibliothek (1.10) | M | Wiederverwendbarkeit von Lieblingsstrecken |
| 9 | Foto-Hotspots (2.11) | M | Kreativ, frei verfügbare Commons-Daten |
| 10 | Touren-Bibliothek (4.1) | M | Basis für Statistik, Vergleich, Kollektionen |
| 11 | E-Bike-Reichweite (7.5) | M | Starke Zielgruppe, baut auf Höhenprofil auf |
| 12 | Undo/Redo + Shortcuts (7.1/7.2) | S | Sofort spürbare UX-Verbesserung |
