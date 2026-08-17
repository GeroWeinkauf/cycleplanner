# Radnetz-Geodaten (D-Netz & EuroVelo)

Offizielle Radfernwege als GeoJSON-FeatureCollections für die Kartenebenen im
Frontend. Jedes Feature ist ein `LineString` mit
`properties = { name, ref, network }`, z. B.

- `{ "name": "D10 (Elberadweg)", "ref": "D10", "network": "dnetz" }`
- `{ "name": "EV7 (Sonnenroute)", "ref": "EV7", "network": "eurovelo" }`

| Datei | Netz | Routen | Douglas-Peucker-Toleranz | Größe |
|---|---|---|---|---|
| `d-netz.geojson` | D-Netz (Radnetz Deutschland) | D1–D13 (13 Routen) | 0.0001° (~11 m) | ~1,4 MB |
| `eurovelo.geojson` | EuroVelo | EV1–EV15, EV17, EV19 (17 Routen) | 0.00025° (~28 m) | ~4,7 MB |

Die Geometrie wurde jeweils moderat vereinfacht, um unter 5 MB je Datei zu
bleiben. Koordinaten sind auf 6 (D-Netz) bzw. 5 (EuroVelo) Nachkommastellen
gerundet.

## Abrufdatum

2026-08-17

## D-Netz (Radnetz Deutschland)

- **Quelle:** [Radnetz Deutschland](https://www.radnetz-deutschland.de/) —
  Betreiber: Bundesamt für Logistik und Mobilität (BALM).
- **Download-URL:** `https://www.radroutenplaner-deutschland.de/api/droutes/{id}/download`
  (verlinkt von der [Downloads-Seite](https://www.radnetz-deutschland.de/EN/Service/Downloads/downloads_node.html)).
  Hinweis: D13 (Iron Curtain Trail) wird unter der ID `ICT` ausgeliefert.
- **Enthaltene Routen:** D1 Nordseeküsten-Route, D2 Ostseeküsten-Route,
  D3 Europaradweg R1, D4 Mittelland-Route, D5 Saar-Mosel-Main, D6 Donauroute,
  D7 Pilgerroute, D8 Rhein-Route, D9 Weser-Romantische Straße, D10 Elberadweg,
  D11 Ostsee-Oberbayern-Route, D12 Oder-Neiße-Radweg, D13 Iron Curtain Trail.
- **Lizenz:** © Bundesamt für Logistik und Mobilität (BALM). Die GPX-Dateien
  werden kostenfrei zum Download angeboten; auf den Download-Seiten ist keine
  explizite Open-Data-Lizenz ausgewiesen. Für eine Nutzung über den privaten
  Gebrauch hinaus sind die [Rechtshinweise](https://www.radnetz-deutschland.de/EN/Service/LegalNotice/legalnotice_node.html)
  des Anbieters zu prüfen.

## EuroVelo

- **Quelle:** [EuroVelo](https://en.eurovelo.com/) — European Cyclists'
  Federation (ECF).
- **Download-URL:** `https://en.eurovelo.com/route/get-gpx/{id}`
  (verlinkt von den Routenseiten `https://en.eurovelo.com/ev{n}`).
- **Enthaltene Routen (17):** EV1 Atlantikküsten-Route, EV2 Hauptstädte-Route,
  EV3 Pilgerroute, EV4 Mitteleuropa-Route, EV5 Via Romea Francigena,
  EV6 Atlantik–Schwarzes Meer, EV7 Sonnenroute, EV8 Mittelmeer-Route,
  EV9 Ostsee-Adria-Route, EV10 Ostseeküsten-Route, EV11 Osteuropa-Route,
  EV12 Nordseeküsten-Route, EV13 Iron Curtain Trail, EV14 Gewässer
  Mitteleuropas, EV15 Rheinradweg, EV17 Rhone-Route, EV19 Maas-Route.
  (EV16 und EV18 existieren nicht.) Deutschland berühren insbesondere EV2, EV3,
  EV4, EV6, EV7, EV13, EV15, EV17 und EV19.
- **Lizenz:** Open Data Commons **Open Database License (ODbL) 1.0** (seit
  Oktober 2024). Namensnennung erforderlich, Share-Alike, Keep open.
  Pflicht-Attribution:
  > Contains information from EuroVelo GPX tracks downloaded from
  > www.EuroVelo.com on 2026-08-17, which is made available here under the
  > Open Database License (ODbL).

## Regenerieren

Das Skript `scripts/fetch-cycle-networks.mjs` lädt die GPX-Dateien herunter,
konvertiert sie nach GeoJSON und vereinfacht die Geometrie. Roh-GPX-Dateien
werden unter `scripts/downloads/` zwischengespeichert.

```bash
node scripts/fetch-cycle-networks.mjs
```
