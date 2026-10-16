# C2 – fertiger Bedienkandidat, Production noch gesperrt

Ausgangspunkt: `e89e998593e0efd9dd2c9943a5a2b87da82112ed`, bestehender Branch `tips-v14-c-whole-chf-complete-period-20261016`. Kein neuer Gesamtaudit und keine neue Kassenverwaltung.

## Bedienung

1. Wie bisher erfassen, Entwurf speichern und berechnen. C2 bleibt unverändert: Gesamtsumme pro Periode einmal kaufmännisch auf ganze CHF; grösste exakte Reste auf Bereiche und Personen, keine persönlichen Überträge.
2. **Abschluss prüfen** zeigt Zeitraum, Eingang, berechnete Auszahlung und Rundungsdifferenz. Bei einer Differenz werden Beleg/Herkunft bzw. Beleg/Verbleib und eine ausdrückliche Bestätigung verlangt. Der Abschluss bestätigt keine Auszahlung.
3. Im bestehenden Beleg unter **Auszahlungsnachweise laden → Auszahlung bestätigen** nur die tatsächlich ausgezahlten Beträge bestätigen. Vorgeschlagene Beträge stammen aus der Berechnung und sind bei Abweichungen zu berichtigen. Die Bestätigung ist niemals vorangekreuzt.
4. Korrekturen zeigen nur die Differenz zur bestätigten Auszahlung. Nachzahlungen und Rückzahlungen bleiben getrennt. Eine Rückzahlung wird erst nach Eingang bestätigt; es gibt keinen automatischen Einbehalt. Auch eine Korrektur eines Korrekturbelegs verweist weiter auf das Original.
5. Nach einer fehlenden Antwort erscheint **Bestätigung erneut prüfen**, auch nach Neuladen. Die gespeicherte Anfrage-ID bleibt gleich. Ein Rechteentzug verwirft eine zuvor ungeklärte Anfrage nicht. Der unveränderliche Abschlussbeleg und die nachträglichen Zahlungsnachweise bleiben getrennt.

## Einfaches Rundungsverfahren zur Freigabe durch Marco

- Aufrundung: Den fehlenden Rappenbetrag aus der vorhandenen Betriebskasse ergänzen und die Herkunft mit Bezug auf die Abrechnungsperiode dokumentieren.
- Abrundung: Den verbleibenden Rappenbetrag in der vorhandenen Betriebskasse belassen und den Verbleib mit demselben Periodenbezug dokumentieren.
- Die zuständige auszahlende Person bestätigt den tatsächlichen Vorgang und später die tatsächlich ausgezahlten Beträge. Keine neue Kasse, keine persönlichen Restkonten, keine Überträge. Eine berechnete Differenz genügt nicht als Nachweis.

Dies ist ein Vorschlag zur Entscheidung, keine stillschweigend freigegebene Kassenregel. Eine eventuell nötige Kontierung erfolgt im bestehenden betrieblichen Verfahren ausserhalb dieser App.

## Getrennte Freigaben und Aktivierung

**App:** Standardbuilds bleiben geschlossen. Erst nach ausdrücklicher App-Freigabe wird für den freigegebenen Production-Build `SILK_C2_APP_APPROVAL=approved-c2` gesetzt. Preview- und lokale Testbuilds können damit keinen Produktivmodus aktivieren. Der Client verlangt zusätzlich passende Serverfreigabe und die konkrete Operationsberechtigung.

**SQL:** Die vorbereitete Datei `docs/production/c2-server-PREPARED-NOT-APPLIED.sql` legt keine Gate- oder Operatorzeilen an. Ohne Gate bleiben Abschluss und Zahlungsbestätigung serverseitig gesperrt. Für eine spätere SQL-Freigabe enthält `private.tip_c2_gate` zusätzlich `sql_approval_ref` und `approved_at`. `synthetic_only=false` ist nur mit dokumentierter Freigabereferenz und Zeitpunkt zulässig. Nur Administratoren können diese Zeile und die ausdrücklich benannten Operatorrechte setzen. Browserrollen erhalten keine Schreibrechte auf diese Tabellen.

Die SQL-Datei ist eine erstmalige Installation, kein automatisch wiederholbares Upgrade. Sie folgt auf die bereits vorbereiteten V1.4-Integritäts- und C2-Berechnungsdateien. Falls die Zielumgebung inzwischen Teile installiert hat, muss der Release den konkreten Schemaunterschied berücksichtigen; keinesfalls Tabellen löschen und neu anlegen. Kein historischer Backfill, keine Neuberechnung und keine Änderung alter Belege.

Die getrennten Freigaben ersetzen nicht die einmaligen Release-Nachweise: aktuellen Zielstand lesen, Sicherung und Wiederherstellung nachweisen, Rollen/Zuordnung prüfen und den freigegebenen Stand kontrolliert aktivieren. Diese Arbeiten greifen vor der Freigabe nicht auf produktive Datenbanken zu.

## Prüfungen und Grenzen

Vorhandene Finanz- und Sicherheitsprüfungen bleiben erhalten. Ergänzt werden die sichtbaren Bestätigungsdialoge, beide Rundungszeichen, tatsächliche Auszahlung, Rückzahlung, Korrektur eines Korrekturbelegs, verlorene Abschluss- und Zahlungsantwort mit Neuladen, Rechteentzug und konkurrierende Bestätigung auf zwei getrennten Browser-Sitzungen. Die Freigabelogik wird mit synthetischen Daten auch im späteren Produktionsmodus geprüft; das aktiviert keine echte Umgebung.

CI: vollständiger isolierter Supabase-Stack, kostenloser Standard-GitHub-Linux-Runner; keine Cloud-Verbindung, Repository-Secrets oder Zusatzdienste. Ergebnisse und Versionsnachweise stehen im jeweiligen Actions-Lauf. Browserbilder enthalten ausschliesslich synthetische Daten und werden ohne zusätzlichen Artefaktspeicher im Run-Log ausgegeben.

Automatisierte Browserprüfung ist keine physische iPhone-/iPad-/Desktop-Abnahme und keine gehostete Supabase-Abnahme. Der kurze reale Bedien- und Releasecheck bleibt als solcher auszuweisen. Keine Erfolgsmeldung für noch nicht ausgeführte Prüfungen.

## Rückfall

Vor Aktivierung ist Production unverändert. Für den Code bleibt `e89e9985` in der Historie erhalten. Nach einer späteren Aktivierung zuerst neue Abschlüsse/Zahlungsbestätigungen sperren: Gate für den Workspace entfernen bzw. Operatorrechte entziehen und das App-Freigabeflag zurücknehmen. Gate und Operatorrechte sind Konfiguration; Belege, Ketten und Zahlungsereignisse bleiben erhalten. Keine Rückkehr zu einem alten Client, der diese Belege nicht versteht; keine Datenrücksicherung über neuere Buchungen. Der Nachweis einer produktiven Wiederherstellung gehört zum Release, nicht zum synthetischen CI-Erfolg.
