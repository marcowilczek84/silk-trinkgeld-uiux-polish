# SILK Trinkgeld – Critical Data Integrity Fix V1

Basis: `16fab0e23fa58a0fb59d4c8b4c7aa66dbbb79440` (Production, am 14.10.2026 erneut verifiziert). Entwicklungsbranch: `tips-data-integrity-v1-20261014`.

## Ursache und Korrektur

Bisher wurden Mitarbeitername und Dienstcode gleichzeitig als Anzeigename und Referenzschlüssel verwendet. Der Editor ersetzte diese Schlüssel. `buildVisibleDays()` fand anschliessend die alten Zuordnungen nicht mehr und speicherte leere Felder zurück. F01 und F02 sind auf der unveränderten Basis mit den neuen Tests erneut reproduziert.

Die Oberfläche bearbeitet jetzt ausschliesslich Anzeigenamen. Bestehende Namen/Codes bleiben unveränderliche interne Legacy-IDs; neue Mitarbeiter und Dienste erhalten UUID-basierte IDs. `staff` und `assignments[].name` enthalten diese IDs. Mitarbeiternamen stehen zusätzlich in `staffLabels`; bei Diensten bleiben `name` und die Zuordnungswerte stabil, der Anzeigename steht in `label`. Alte Dokumente ohne Labels bleiben lesbar. Es gibt keine SQL- oder Datenbankmigration und keine automatische Umschreibung vorhandener Zuordnungen.

Die Berechnung verwendet weiterhin dieselben internen Schlüssel und dieselben Formeln. Die bestehende Emily-Regel bleibt an der bisherigen Identität `Emily` erhalten, auch wenn ihr Anzeigename geändert wird. Eine andere Person durch blosses Umbenennen in „Emily“ erhält diese Regel nicht. Die spätere Zuordnung neuer Sonderregeln ist ein eigener fachlicher Auftrag.

Der Editor speichert Stammliste, Labels und Ergebnisinvalidierung in einer lokalen Transaktion. Er blockiert inzwischen veraltete Editorfassungen, doppelte/mehrdeutige oder leere Bezeichnungen sowie das Löschen noch zugeordneter Einträge. Bei Speicherfehlern bleiben die bisherigen Daten und die eingegebenen Formularwerte erhalten.

Unbekannte historische Mitarbeiter/Dienste verschwinden beim Rendern nicht mehr. Sie bleiben sichtbar und gespeichert; die Validierung verlangt eine geklärte Zuordnung. Im Import werden Anzeigenamen und unveränderliche Schlüssel aufgelöst. Doppelte Zuordnungen über beide Schreibweisen werden abgewiesen.

## Ältere Entwürfe und Historie

Das Fortsetzen eines Entwurfs und das Verwerfen aktueller Eingabeänderungen ersetzen keine heutigen Mitarbeiter- oder Dienstlisten mehr. Zusätzliche aktuelle Einträge und aktuelle Anzeigenamen bleiben erhalten.

Vor jeder Übernahme werden verwendete Mitarbeiter, Dienste und die damaligen Früh-/Spätgewichte geprüft. Fehlende Referenzen oder inzwischen veränderte Gewichte blockieren die Übernahme mit einem erklärenden Hinweis. Der Entwurf und der aktuelle Arbeitsstand bleiben dabei unverändert. Auch ältere, nicht vollständig interpretierbare Eingabeformate werden nicht geraten oder automatisch umgeschrieben.

Vorhandene gespeicherte Entwürfe, Finalisierungen, Ergebnisdaten und Archiv-HTML werden durch Umbenennungen nicht verändert. Ein fortgesetzter Entwurf erhält erst durch bewusstes Speichern einen neuen Eingabesnapshot. Neue Finalisierung bleibt an den aktuellen Eingabefingerprint gebunden; auch konkurrierende Namensänderungen invalidieren einen veralteten Abschluss.

## Fachliche Grenzen

Keine Änderung an Service/Küche/Housekeeping, Früh-/Spätgewichten, Emily-Betrag, Summierung oder Rundung. Die reine Umbenennung erhält auch nicht ganzzahlige bestehende Gewichte exakt.

- MIA: im gelesenen Stand wie F1 (`f=1`, `s=0`); gewünschte 50-%-Beteiligung ist nicht umgesetzt und bleibt eine gesonderte Entscheidung.
- FF2: keine aktive allgemeine Sonderregel nachgewiesen; nicht ergänzt.
- OFS: keine neue Ausschlussregel ergänzt.

## Prüfungen

- 33 Node/JSDOM-Tests, davon 24 neue Regressionstests. Die bisherigen neun Tests bleiben grün.
- Neue F01/F02-Tests auf dem ursprünglichen Stand: beide erwartungsgemäss fehlgeschlagen; mit Korrektur bestanden.
- Golden Master: unveränderte CHF-Ergebnisse, Emily-Pauschale, Küche, Housekeeping und Rundung.
- Weitere Fälle: versteckte Tage/Monatswechsel, Reload, Cloud-Dokument-Roundtrip, unveränderte Archive, Altentwürfe, Konflikte, Löschschutz, Speicherfehler, Importauflösung.
- TypeScript: strenge `checkJs`-Typprüfung des neuen Identitätsmoduls und seines Datenvertrags. Die Anwendung bleibt JavaScript; kein vollständiger TypeScript-Umbau behauptet.
- ESLint: gezielte Fehlerprüfungen der geänderten JS-Module, Build-Skripte und automatisierten Regressionstests.
- Build: lokaler Preview-Build mit synthetisch gesetzter Cloud-Konfiguration bestätigt, dass URL und Schlüssel dennoch leer ausgegeben werden.
- Browser: `npm run test:browser` prüft fünf Viewports (393×852, 375×812, 1024×768, 1194×834, 1440×900): Umbenennen über Formulare, Betragsvergleich, Reload, Finalisieren, älteren Entwurf fortsetzen, unverändertes Archiv, realer Textimport und Sperre bei veränderten Gewichten. Lokaler Lauf: alle fünf Viewports bestanden, keine Seitenfehler oder horizontalen Überstände. Ergebnisprotokoll in `qa-integrity-v1.json`.

## Preview-Schutz

`VERCEL_ENV=preview` oder `SILK_LOCAL_ONLY=1` erzeugt eine leere Supabase-Konfiguration. Die Oberfläche kennzeichnet die lokale Test-Preview. Sie eröffnet keine Supabase-Auth-Sitzung, bietet kein Pairing an und schreibt nicht in den Produktions-Workspace. Die Browsertests prüfen diesen Schutz vor dem Einsetzen synthetischer Fixtures und blockieren fremde Netzwerkziele.

## Risiken und Production-Gate

1. Noch kein vollständiger Live-Cloud-Schreibtest mit zwei Geräten: lokal geprüft sind Dokument-Roundtrip, Dreiwege-Merge und Konfliktverhalten. Diese Preview ist bewusst lokal isoliert. Vor einem Cloud-Release in einem getrennten Test-Workspace prüfen.
2. Alte Clients verstehen die bisherigen internen Zuordnungen, aber nicht die neuen Anzeigenamen. Ein alter Client kann neue Labels entfernen oder neue IDs unverziert anzeigen; seine alten Verwaltungsfehler sind weiterhin vorhanden. Kein gemischter schreibender Betrieb als freigegeben betrachten. Vor Production alle Geräte aktualisieren und gezielt prüfen.
3. Neue IDs dürfen nicht durch Anzeigenamen ersetzt werden. Rückwärtskompatibilität bedeutet Lesen vorhandener Dokumente ohne Migration; sie garantiert keinen gleichzeitigen Betrieb beliebiger alter Schreibclients.
4. Altentwürfe mit fehlenden Referenzen oder geänderten Gewichten benötigen eine fachliche Klärung. Keine stillschweigende Wiederherstellung alter Stammlisten und keine automatische Neuberechnung mit abweichenden Gewichten.
5. Browserprüfung verwendet Chromium-Emulation; physisches iPhone/iPad mit Safari bleibt vor Production separat zu prüfen.
6. Das bestehende gemeinsame JSON-Dokument macht Finalisierungen nicht serverseitig unveränderlich. Dieser Fix verändert bestehende Archive nicht, führt aber kein neues Berechtigungs-/Archivsystem ein.

## Rollback

Es wurde keine Production veröffentlicht. Für diese lokale Preview genügt es, die Preview nicht zu verwenden; keine produktiven Daten müssen zurückgesetzt werden. Vor einem späteren Release einen dokumentierten v2-kompatiblen Build, Datenexport und Geräte-Reload-Plan bereithalten. Nicht unbesehen auf einen alten Client zurückrollen, nachdem neue IDs/Labels gespeichert wurden. Keine Rückkehr vor die v2-Synchronisierung.

## Reproduzierbare Befehle

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run lint
SILK_LOCAL_ONLY=1 npm run build
npm run test:browser
```

Für Browser-QA muss Chromium für die installierte Playwright-Version vorhanden sein. Alternativ `CHROMIUM_EXECUTABLE_PATH` und gegebenenfalls `CHROMIUM_ARGS` setzen. `BASE_URL` darf ausschliesslich eine isolierte Test-Preview sein; vor jedem Fixture wird deren leere Cloud-Konfiguration geprüft. Authentifizierte Preview-URLs, Cookies und Tokens nicht in Prüfprotokolle oder Git übernehmen.
