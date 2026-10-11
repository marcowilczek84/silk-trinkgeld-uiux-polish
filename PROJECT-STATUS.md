# SILK Trinkgeld – Arbeitsstand

11.10.2026, Europe/Zurich. Production zuletzt verifiziert: `2053f2ed89e1643c38275225348dbe9c0d559b26`. Neuer Entwicklungsbranch `ambassador-start-header-20261011`, auf `4d92eb9476e4f8392f7f1fe939ae06289577a391` aufgebaut. Dieser ältere Preview änderte lediglich den Frühstück-Querverweistext.

Neuer Nutzerauftrag: kurzer Headername Trinkgeld, gemeinsamer Hub-Link und Menü-Icon, kein zusätzlicher Frühstücksverweis in den Einstellungen; Starttypografie und Logoproportionen angeglichen. Der Hub-Link übernimmt die bestehende Prüfung ungespeicherter Eingaben. Berechnung, Mitarbeiterdaten, Dienstregeln, Repository-/Sync-Implementierung und Abrechnungen unverändert.

Vier gezielte Tests in `tests/draft-workflow.test.mjs` bestanden, einschließlich Hub-Klick mit ungespeicherten Eingaben und „Zurück“. Neue visuelle Browserabnahme steht aus; keine Veröffentlichung dieser Änderungen. Vercel-Neudeployments sind wegen des bereits gemeldeten Tageslimits blockiert.

Die zentrale [Projektdokumentation](https://github.com/marcowilczek84/silk-service/blob/ambassador-start-header-20261011/PROJECT-STATUS.md) mit [Designsystem](https://github.com/marcowilczek84/silk-service/blob/ambassador-start-header-20261011/AMBASSADOR-DESIGN-SYSTEM.md) und [Prüfbericht](https://github.com/marcowilczek84/silk-service/blob/ambassador-start-header-20261011/docs/HEADER-STARTSEITEN-QA-20261011.md) liegt im bestehenden Inside-Repository.
