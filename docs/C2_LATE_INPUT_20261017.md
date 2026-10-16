# Letzte Eingabeanpassung: Spät-Trinkgeld optional

App-Commit: `a5df93a425360a0a35056890bee03432b29fffa8`, bestehender Branch `tips-v14-c-whole-chf-complete-period-20261016`.
Ausgangspunkt: App `d22900d6`, mit Dokumentation auf `f43fe885`.
Die drei vorherigen iPhone-Prüfpunkte sind laut Marco bestanden (Nachricht vom 17.10.2026, 01:26 Zürich).

Preview: https://silk-trinkgeld-uiux-polish-837yolp8c-restaurant-silk.vercel.app/
Deployment `dpl_7tZZwaR1j9JPtdRgRLkxg7Ex6xAi`, READY, HTTP 200; Cloud-URL/Schlüssel leer, `localOnly=true`, `c2AppApproved=false`. Endgültiger Abschluss weiterhin deaktiviert.

## Einzige Produktänderung

In `index.html` wird ein leeres Spät-Trinkgeldfeld bei erfasstem Frühbetrag als `0` übernommen. Der Nutzer muss keine Null eingeben. Derselbe Wert wird für Eingaben, Vergleichsstand und Zusammenführung verwendet; dadurch entstehen weder falsche Änderungen noch unbemerkte Überschreibungen tatsächlicher Spätbeträge. Nach Speichern/Neuladen kann die übernommene Null im Feld sichtbar sein.

Früh CHF 100 + Spät leer liefert genau dieselbe C2-Berechnung und dieselben übergebenen Tagesdaten wie Früh CHF 100 + Spät 0. Ein komplett unerfasster Tag bleibt leer und verhindert weiterhin die Berechnung einer unvollständigen Periode. Fehlender Frühbetrag, fehlende Dienstzuordnung und ungültige Zahleneingaben werden nicht als gültige Nullabrechnung angenommen.

Keine Änderung am Finanzkern, an C2, SQL, gespeicherten historischen Belegen, Serverrechten oder Finalisierung. Keine Migration oder Datenbereinigung. Bestehende Finanz- und Release-Nachweise übernommen.

## Nur der betroffene Ablauf geprüft

- Lokal: vier gezielte Tests bestanden; Gleichheit Leer/0 einschliesslich Speichern/Neuladen und serverseitigem Dokumentformat, unerfasste Tage/fehlende Zuordnungen, Schutz echter Änderungen und Zurücksetzen, unveränderte synthetische Archivkopie, Konflikterkennung bei gleichzeitig geändertem Spätbetrag. Cloudfreier Build bestanden.
- Standard-GitHub-Runner: dieselben vier Tests und Build bestanden. Je ein gezielter Ablauf in Chromium 151.0.7922.34 und WebKit 26.5 bei 393×852 px bestanden: echte Formulare, Berechnung Leer/0, Entwurf speichern/neu laden, tatsächliche Änderungen/Zurücksetzen, unvollständiger Zahlentext `1e`, vollständig unerfasster Folgetag. Keine Seitenfehler und keine Cloud-Anfragen.
- Run: https://github.com/marcowilczek84/silk-trinkgeld-uiux-polish/actions/runs/38981810075
- Maschinenlesbare Ergebnisse: `docs/evidence/c2-late-input-20261017.json`.

Die CI-Auswahl ist für diese Änderung an den übernommenen Basisstand und den SHA256 der geänderten Produktdatei gebunden. Die vorherigen UI- und vollständigen Supabase-Suites wurden nicht erneut ausgeführt. Kostenloser Standardrunner; keine Secrets, kostenpflichtigen Runner oder Zusatzdienste. Browseremulation ist kein neuer physischer iPhone-Test und keine Cloud-Datenbankabnahme.

Der App-Bezug im Release-Freigabeantrag ist auf `a5df93a4` aktualisiert. App, SQL und Rundungsausgleich bleiben getrennte Entscheidungen. Production bleibt unverändert; keine Freigabe aus dem bestandenen iPhone-Check abgeleitet.
