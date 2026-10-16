# Kurzer echter Bediencheck vor Aktivierung

App-Kandidat mit den letzten Bedienkorrekturen: `d22900d696bc40afb3978aaff635d142615c8e14`.

## Sofort am iPhone/iPad: Eingabe und Berechnung

Geprüfte, isolierte Preview (gegebenenfalls mit Marcos bestehender Vercel-Anmeldung):
https://silk-trinkgeld-uiux-polish-ikmzgt8m3-restaurant-silk.vercel.app/

Diese konkrete Preview hat **keine Supabase-URL, keinen Schlüssel und keine Abschlussfreigabe**. Nicht mit Production verbinden. Vorhandene lokale Preview-Eingaben erhalten; einen leeren zukünftigen Testtag verwenden.

1. **Zeitraum/Tag wechseln:** Ohne Eingaben wechseln, dann einen Testbetrag ändern und vollständig zurücksetzen bzw. als Entwurf speichern. Nur bei einer noch offenen echten Änderung darf die Speicherfrage erscheinen.
2. **CHF 1’000.00 berechnen:** An einem leeren Testtag Frühbetrag 1000, Spätbetrag 0 und einen Frühdienst erfassen. Bei CHF 0.00 Rundungsdifferenz ist kein Kassenausgleich erforderlich; „Abschluss prüfen“ erklärt die deaktivierte Testfunktion.
3. **Am iPhone scrollen:** Der Preview-Hinweis darf SILK-Logo und App-Namen nicht überdecken.

**Grenze:** Die sichere Preview kann keinen serverseitigen Abschluss-/Zahlungsdialog durchlaufen. Diese drei Punkte sind nur ein echter Eingabe-/Darstellungscheck, keine Abnahme der Bestätigungsformulare.

## Vollständiger kurzer Bediencheck am Computer

Im bestehenden Repository mit Node und den gesicherten Abhängigkeiten:

```sh
npm ci
node release/manual-check.mjs
```

Dann http://127.0.0.1:55449/c2-manual-start.html im echten Browser öffnen. Nur Loopback, synthetischer Benutzer, flüchtige Testdaten; keine Cloud-Verbindung. Der bestehende Testadapter verwendet PGlite statt PostgREST/Auth. Die nativen Integrationsprüfungen bleiben separat belegt.

1. **Synthetischen Bediencheck öffnen**, berechnen und **Abschluss prüfen**. CHF 1’801.10 ergibt CHF 1’801; Rest CHF 0.10. Die Bestätigung muss zunächst leer sein.
2. Testreferenz `TEST-KASSE-01` eintragen, synthetischen Verbleib bestätigen, abschliessen. **Beleg öffnen**: Abschluss vorhanden, tatsächliche Auszahlung noch unbestätigt.
3. **Auszahlungsnachweise laden → Auszahlung bestätigen**. Vorgeschlagene Beträge als Berechnung erkennen. Testreferenz `TEST-ZAHLUNG-01` und die noch leere ausdrückliche Bestätigung prüfen; nur diesen synthetischen Vorgang bestätigen.
4. Seite neu laden, Beleg und Zahlungsnachweise wieder öffnen: dieselben Beträge und Nachweise, keine zweite Auszahlung. Prüfen, ob die Trennung verständlich ist.
5. Terminal mit Strg+C beenden. Keine Testdaten in Production importieren.

Bitte zurückmelden: Gerät/Browser, Datum, Punkte 1–4 bestanden oder der konkrete störende Punkt. Die bereitgestellte Prüfmöglichkeit ist noch kein von Marco ausgeführter Test.

## Vor dem echten Wechsel

Auf jedem tatsächlich verwendeten Production-Gerät offene Eingaben speichern/synchronisieren. „Synchronisiert“ bedeutet nur servergesicherte Daten; reine Browserdaten und alte lokale Archive sind in der Serversicherung nicht enthalten. Bei lokalen Resten vor dem Wechsel sichern und klären. Alte Tabs danach schliessen.

Abschluss- und Zahlungsrechte erst dem eindeutig verifizierten Arbeitsgerät zuordnen. Die sieben bestehenden Gerätezugänge enthalten historische Testgeräte; eine pauschale Freischaltung ist nicht vorgesehen.
