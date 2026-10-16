# V1.4 — Fachliche Rundungsentscheidung erforderlich

Der Code berechnet Ansprüche exakt als Rappenbrüche. Verbindliche Auszahlung ist bis zur Entscheidung nur möglich, wenn die bisherige Einzelrundung auf ganze Franken exakt mit dem Eingang übereinstimmt. Über- UND Unterdeckung bleiben gesperrt. Vorhandene Archive werden niemals neu berechnet.

## Beispiel CHF 1’000, eine reguläre Serviceperson

| Variante | Service | Küche | Housekeeping | Auszahlung | Rest |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bisherige Einzelrundung (gesperrt) | 683.00 | 293.00 | 25.00 | 1’001.00 | −1.00 |
| A: Auszahlung auf Rappen | 682.50 | 292.50 | 25.00 | 1’000.00 | 0.00 |
| B: Ganze CHF, persönliche Restkonten | 682.00 | 292.00 | 25.00 | 999.00 | 1.00 auf Empfängerkonten |
| C: Ganze CHF, grösster Rest | 683.00 | 292.00 | 25.00 | 1’000.00 | 0.00 |

A ist eine Alternative, die die bisherige Auszahlung in ganzen Franken fachlich ändern würde. Sie benötigt eine ausdrückliche Entscheidung für Rappenauszahlungen. Nicht ganzzahlige Rappenansprüche werden zunächst abgerundet; die verbleibenden Rappen gehen nach absteigendem Bruchrest an die Empfänger, bei Gleichstand nach unveränderlicher Empfänger-ID. Vor Aktivierung muss bestätigt werden, ob zuerst Bereichstöpfe und danach Personen oder alle Empfänger gemeinsam gerundet werden. Empfohlen: Bereiche zuerst (Service/Küche/HK), danach Servicepersonen; dadurch bleibt die Bereichsverteilung bis auf unvermeidbare Rappen konsistent. Innerhalb des Service ist die Emily-Pauschale als eigener Anspruch zu berücksichtigen, ohne höhere Auszahlung als ihr Anspruch.

B ist die bevorzugte Fortsetzung der V1.3-Audit-Empfehlung: Sie bewahrt ganze Franken je Auszahlung und führt nicht ausgezahlte Ansprüche empfängerbezogen fort. Die Beispielreste sind CHF 0.50 Service und CHF 0.50 Küche. Benötigt ein dauerhaftes, versionsgesichertes Restbetragsbuch mit Regeln für Folgeperioden, Austritte, Korrekturen und Eröffnungsstände; keine fiktiven historischen Salden anlegen. Bruchteile von Rappen müssen dabei ebenfalls exakt erhalten bleiben.

C verteilt den ganzen verfügbaren Frankenbetrag innerhalb derselben Abrechnung. Der Gleichstand im Beispiel wurde nur zur Illustration zugunsten Service aufgelöst. Ein verbindlicher Gleichstandsentscheid und die Reihenfolge Bereich/Person wären gesondert festzulegen. Diese Variante kann einzelne Ansprüche um fast CHF 1 verschieben und wird gegenüber persönlichen Restkonten nicht empfohlen.

Keine Variante A/B/C wurde aktiviert. Insbesondere sind keine Prozentsätze geändert, keine historischen Restkonten erfunden und keine alten Abrechnungen migriert worden. Nach Marco's Entscheidung folgt ausschließlich die gewählte Verteilungslogik samt Invarianten-/Grenztests und Servergleichlauf. Danach bleiben Staging- und Production-Freigaben getrennte Schritte.
