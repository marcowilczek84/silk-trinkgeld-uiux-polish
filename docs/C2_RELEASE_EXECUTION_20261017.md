# SILK C2 – Ausführungsstand 17.10.2026

**Status: technisch blockiert vor Installation; noch keine Veröffentlichung.** Kontrollstand 10:48:35 Europe/Zurich.

## Freigaben und Zugang

Marcos Freigaben MCV2-023/024/025 und Ausführungsauftrag gelten. Übergabe `f41770fc44394f2d8f77c5ead441fe5e05a12d17`, unveränderter App-Kandidat `a5df93a425360a0a35056890bee03432b29fffa8`.

Die bisher offene Zuordnung ist erledigt: Marco öffnete am 17.10.2026 seinen bestehenden Safari-Zugang und zeigte „Synchronisiert“. Genau die bereits gespeicherte Safari-Sitzung erneuerte sich um 10:15:28 Zürich; die übrigen sechs gekoppelten Sitzungen blieben unverändert. Gespeicherte Installationskennung, aktives Workspace-Mitglied und Auth-Kennung passen zusammen. Die exakten Kennungen liegen ausschliesslich im privaten Sicherungsnachweis. Keine manuelle Geräteliste, keine neue Gerätebindung. Der separate ChatGPT-Browser ist ungekoppelt und wurde nicht berechtigt. iPad und Computer bleiben über die vorhandene Kopplung nutzbar; noch nicht bestätigte Browser erhalten keine automatischen Abschluss-/Zahlungsrechte.

## Fertige Ausführungsvorbereitung

Aktuelle Sicherung vom **17.10.2026 10:18:27 Zürich**, 14 Tabellen / 153 Datensätze, sämtlich identisch zur bisherigen Sicherung. SHA256 `72688fb1c6ecf5e9c73fa3a4a8782c011e43d40f0ca9741788f779fc5aefffcb`. Privat dauerhaft gespeichert; beide vorherigen Snapshots erhalten. Lokale Wiederherstellung in leerem PGlite 0.5.10 / PostgreSQL 18.6 WASM bestanden: feldgleiche Daten, Installation/Transaktions-Rollback, leere Gates/Operatoren und anon-RPC-Entzug. Kein neuer nativer lokaler PG17-Nachweis behauptet. Vorhandene native isolierte PG17- und Browsernachweise aus f41770fc weiterverwendet.

Zielschema einschliesslich Eigentümern, Rechten, Policies, Triggern, Funktionen und Constraints unverändert. Exaktes genehmigtes Installationspaket SHA256 `cb5a28d4fe759904e4096a9dbf9b6ccc90b3f06e794bb3459657827ae560bd33` überprüft.

## Konkreter technischer Blocker

Zwei SQL-Ausführungsaufrufe und anschliessend der reguläre Migrationsaufruf mit exakt demselben Paket lieferten jeweils **“McpServerError: Invalid or expired requestState”**. Das ist ein Fehler der Supabase-Verbindung; seine Ursache ist nicht nachgewiesen. Lesender Zugriff funktioniert. Keine SQL-Fehlermeldung, keine erneute fachliche Freigabeanforderung und keine belegte automatische Sicherheitsablehnung.

Nach jedem fehlgeschlagenen Weg den tatsächlichen Zustand kontrolliert: C2-Gate, Ereignistabelle und neuer Schreib-RPC fehlen weiterhin. Workspace Revision 31 / Payload-MD5 `3832a0ec13892927c3b62fe2cb4d17d1`. Keine Teilinstallation nachgewiesen. Keine Operatoren aktiviert; keine historischen Daten verändert. Das App-Freigabeflag wurde noch nicht gesetzt und kein Production-Deployment angelegt.

Production bleibt `16fab0e23fa58a0fb59d4c8b4c7aa66dbbb79440`, Deployment `dpl_AckEsRbZoAmihU4wmn7qEtbRrvMj`.

## Fortsetzung

Die Browser-Zugriffsregel verlangt vor dem Wechsel vom wiederholt fehlgeschlagenen Connector zum Supabase-Webdashboard eine ausdrückliche Zustimmung. Danach nur den bereits genehmigten Release ausführen: aktuellen Drift prüfen → identisches SQL atomar installieren, Gate geschlossen → App a5df93a4 mit bestehender Production-Konfiguration bereitstellen → zugeordneten Zugang und Gate aktivieren → tatsächlichen Stand lesend prüfen und Veröffentlichungsnachweis ergänzen. Keine neuen Funktionen oder pauschalen Tests. Fachliche App-/SQL-/Rundungsfreigaben bleiben gültig.

Sicherer Rückfall unverändert: `release/PAUSE-PREPARED-NOT-APPLIED.sql`, SHA256 `49e72f435bedac6e6cab7e5067f865ecf27037dc3042e36712c092d40e9d2fc4`. Kompatible App und sämtliche Belege erhalten; keine alte Sicherung über neue Zahlungen.
