# Traccar

Bringt die GPS-Tracker deines [Traccar](https://www.traccar.org)-Servers in
Gladys: Smartphones mit der App Traccar Client, Auto-, Haustier- oder
Fahrrad-Tracker — jedes der Hunderten von Modellen, die Traccar unterstützt.
Jeder Tracker wird zu einem Gladys-Gerät mit Zone, Geschwindigkeit, Akku und
Entfernung von zu Hause; Szenen können reagieren, wenn ein Tracker eine Zone
betritt oder verlässt, offline geht oder einen Alarm meldet; ein Tracker zu
Hause kann die Anwesenheit eines Gladys-Benutzers steuern.

Traccar ist ein vollständiger Tracking-Server, den du selbst betreibst. Wenn
du nur die Anwesenheit eines Smartphones brauchst, ist die OwnTracks-Integration
von Gladys schlanker; Traccar ist die richtige Wahl, wenn du es schon nutzt
oder Fahrzeuge und GPS-Geräte verfolgst.

Getestet mit einem echten Traccar-6.16-Server und simulierten Smartphones
(OsmAnd-Protokoll), nicht mit echten GPS-Trackern: Rückmeldungen sind
willkommen.

## Voraussetzungen

- Gladys 5.1 oder neuer.
- Ein Traccar-Server (Version 5 oder neuer), den Gladys in deinem Netzwerk
  erreicht, meist auf Port 8082.
- Ein Traccar-Benutzer, der die Tracker sieht. Ein Benutzer mit Nur-Lese-Rechten
  genügt: Die Integration ändert nie etwas in Traccar.

## Konfiguration

1. Öffne in Traccar **Einstellungen → Präferenzen**, dann den Abschnitt
   **Token**, und erzeuge ein Token (mit einem ausreichend fernen Ablaufdatum).
   Du kannst stattdessen auch E-Mail und Passwort eines Traccar-Benutzers
   verwenden.
2. Öffne in Gladys den Reiter **Konfiguration** der Integration:
   - **Traccar-Adresse**: so, wie du sie im Browser öffnest, zum Beispiel
     `http://192.168.1.20:8082`. Ohne Port wird 8082 verwendet.
   - **Token**, oder **E-Mail** und **Passwort**.
3. Speichere. Die Schaltfläche **Verbindung testen** zeigt die Traccar-Version
   und wie viele Tracker und Geofences sie sieht.
4. Öffne den Reiter **Entdecken** und füge die gewünschten Tracker zu Gladys
   hinzu.

**Zuhause und Anwesenheit** (optional):

- Das **Zuhause** ist ein Radius (standardmäßig 150 m) um den Standort deines
  Gladys-Hauses (**Einstellungen → Zuhause**). Bei mehreren Häusern gib den
  Namen des zu verwendenden an; standardmäßig das erste mit Standort.
- Oder nenne einen **Traccar-Geofence** (zum Beispiel `Zuhause`): Ein Tracker
  ist dann zu Hause, wenn er sich darin befindet, und der Radius wird
  ignoriert.
- **Anwesenheit: letzte Position höchstens**: Ein Tracker zu Hause meldet nur
  so lange „zu Hause gesehen“, wie seine letzte Position jünger ist als diese
  Dauer (standardmäßig 30 Minuten).
- **Sprache**: die Sprache der Funktionsnamen und der Texte, die die
  Integration schreibt (Zonen, Status, Sätze). Standardmäßig Französisch.

## Geräte

Ein Gerät pro Traccar-Tracker, mit:

| Funktion                | Was sie anzeigt                                                   |
| ----------------------- | ----------------------------------------------------------------- |
| Status                  | Online, offline oder unbekannt, wie Traccar es sieht              |
| Letzte Aktualisierung   | Datum und Uhrzeit der letzten Nachricht an Traccar                |
| Zone                    | Die Traccar-Geofences des Trackers, oder „Außerhalb der Zonen“    |
| Geschwindigkeit         | In km/h                                                           |
| Akku                    | In %, wenn der Tracker ihn meldet                                 |
| In Bewegung             | Ja oder nein, wenn Traccar es berechnet                           |
| Zündung                 | An oder aus, bei Fahrzeug-Trackern, die sie melden                |
| Adresse                 | Nur wenn dein Traccar-Server Adressen berechnet (Geocoder)        |
| Entfernung von zu Hause | In km, bis zum Gladys-Haus                                        |
| Zu Hause                | Ja oder nein, nach der obigen Zuhause-Regel                       |
| Anwesenheit             | Ein Signal „zu Hause gesehen“ für die Anwesenheit eines Benutzers |

Akku, Bewegung, Zündung und Adresse erscheinen, sobald der Tracker sie meldet:
Erscheint eine davon später, bietet Gladys im Reiter Entdecken an, das Gerät zu
**aktualisieren**. Die Entfernung braucht ein Gladys-Haus mit Standort; Zu
Hause und Anwesenheit brauchen ein Zuhause (Radius oder Geofence).

Die Aktualisierungen kommen live: Traccar schickt jede neue Position über
seinen WebSocket an die Integration. Fällt die Verbindung aus, fragt die
Integration Traccar alle 30 Sekunden ab, bis sie wieder steht: Die letzte
Position jedes Trackers wird nachgeholt, nicht die dazwischen.

### Anwesenheit eines Benutzers

Gladys entscheidet mit Szenen, wer zu Hause ist. Zwei Wege, die sich gut
kombinieren lassen:

- **Einfach**: eine Szene, die ausgelöst wird, wenn die Funktion **Zu Hause**
  des Trackers 1 wird, mit der Aktion **Benutzer zu Hause gesehen**; eine
  zweite, wenn sie 0 wird, mit **Benutzer hat das Zuhause verlassen**.
- **Robust**: Die Funktion **Anwesenheit** sendet bei jeder Position zu Hause
  ein Signal „zu Hause gesehen“, dann alle 5 Minuten, solange die letzte
  Position aktuell ist. Eine geplante Szene (alle 5 oder 10 Minuten) mit der
  Aktion **Anwesenheit von Benutzern überprüfen** (der Benutzer, das Haus, die
  Funktion **Anwesenheit** seines Trackers, eine Wartezeit wie 15 Minuten)
  markiert den Benutzer als abwesend, wenn das Smartphone so lange nicht zu
  Hause gesehen wurde — auch wenn sein Akku im Büro leer ist.

Die Szenen „Benutzer verlässt das Zuhause“ und „Benutzer kommt nach Hause“ von
Gladys funktionieren dann wie gewohnt.

## Dashboard-Widget

Das Widget **GPS-Tracker** listet jeden Tracker (höchstens acht) mit seiner
Zone, der Uhrzeit seiner letzten Position und seinem Status als farbigem
Abzeichen. Tippe auf einen Tracker, um Adresse, Geschwindigkeit, Akku,
Entfernung von zu Hause und einen Link zur Karte (OpenStreetMap) zu sehen.

## Szenen

Die Integration ergänzt den Szenen-Editor unter **Integrationen** um:

**Auslöser**

- **Tracker betritt einen Geofence** und **Tracker verlässt einen Geofence**:
  optional für einen Tracker und einen Geofence (sein Name genau wie in
  Traccar; leer bedeutet jeder). Die folgenden Aktionen können den Trackernamen,
  den Geofence, die Adresse und einen Kartenlink verwenden.
- **Tracker geht offline**: Der Tracker meldet sich nicht mehr, und Traccar
  markiert ihn als offline oder unbekannt (Smartphones und HTTP-Tracker werden
  unbekannt), nach der in Traccar eingestellten Frist (standardmäßig 10
  Minuten). Variablen: Trackername,
  letzte Aktualisierung.
- **Tracker-Alarm**: Der Tracker meldet einen Alarm (SOS, Akku schwach,
  Geschwindigkeitsüberschreitung, Stromausfall, Sturz, Manipulation,
  Vibration, Bewegung), optional nur eine Art. Variablen: Trackername,
  Alarmcode und -bezeichnung, Kartenlink.

Diese Auslöser kommen aus den Positionen selbst: In Traccar ist keine
Benachrichtigung einzurichten. Nur die zu Gladys hinzugefügten Tracker lösen
sie aus.

**Aktion**

- **Position eines Trackers abfragen**: liefert einen fertigen Satz („Auto ist
  in der Zone Arbeit, 4,1 km von zu Hause entfernt, Position von 16:08.“)
  sowie Status, Zone, Adresse, zu Hause (ja/nein), Entfernung von zu Hause
  (km, -1 wenn unbekannt), Geschwindigkeit (km/h), Uhrzeit der Position und
  einen Kartenlink für die folgenden Aktionen.

## Szenenbeispiele

- **Die Kinder sind zu Hause**: Auslöser „Tracker betritt einen Geofence“,
  Tracker „Handy Lea“, Geofence „Zuhause“ → Nachricht „Lea ist zu Hause“
  senden.
- **Wo ist das Auto?** Auslöser: eine Taste oder eine Chat-Nachricht → Aktion
  „Position eines Trackers abfragen“ (Auto) → eine Nachricht mit dem Satz und
  dem Kartenlink senden.
- **SOS**: Auslöser „Tracker-Alarm“, Alarm „SOS“ → allen eine Nachricht mit
  dem Trackernamen und dem Kartenlink senden und das Licht einschalten.

## Fehlerbehebung

- **„Traccar hat das Token abgelehnt“**: Das Token ist abgelaufen oder wurde
  widerrufen; erzeuge ein neues. Mit E-Mail und Passwort prüfe sie in der
  Weboberfläche von Traccar.
- **„Traccar antwortet nicht“**: Prüfe die Adresse (mit Port) von einem
  anderen Gerät im Netzwerk aus und ob Traccar läuft. Die Integration läuft in
  einem Container: `localhost` ist dort nicht dein Server, verwende seine
  IP-Adresse.
- **Keine Entfernung von zu Hause**: Das Gladys-Haus hat keinen Standort
  (**Einstellungen → Zuhause**), oder die Integration wurde ohne die
  Berechtigung installiert, den Standort des Hauses zu lesen.
- **Ein Tracker nie „zu Hause“**: Prüfe den Radius oder den genauen Namen des
  Zuhause-Geofence; ein Smartphone im Haus kann eine Position einige Dutzend
  Meter entfernt melden.
- Details stehen in den Logs der Integration, mit `LOG_LEVEL=debug` für jede
  Nachricht. Positionen werden auf der normalen Stufe nie in die Logs
  geschrieben.

## Grenzen

- Keine Karte im Dashboard: Das Widget-Vokabular von Gladys hat keine; die
  Karte öffnet sich in OpenStreetMap.
- Nur lesend: Es werden keine Befehle an die Tracker gesendet.
- Die eigenen Ereignisse von Traccar (vom Server anhand eines Tempolimits
  berechnete Geschwindigkeitsüberschreitung, Wartung, Kraftstoff) sind keine
  Auslöser; die von den Trackern gemeldeten Alarme schon.
- Tempolimits, Geofences und Status sind die von Traccar: Ändere sie dort.
