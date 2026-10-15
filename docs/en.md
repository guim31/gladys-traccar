# Traccar

Brings the GPS trackers of your [Traccar](https://www.traccar.org) server into
Gladys: phones running the Traccar Client app, car trackers, pet or bike
trackers — any of the hundreds of models Traccar supports. Each tracker
becomes a Gladys device with its zone, speed, battery and distance from home;
scenes can react when a tracker enters or leaves a zone, goes offline or
raises an alarm; a tracker at home can drive the presence of a Gladys user.

Traccar is a complete tracking server you host yourself. If you only want the
presence of a phone, the OwnTracks integration of Gladys is lighter; Traccar
is the choice when you already run it, or when you track vehicles and GPS
devices.

Tested against a real Traccar 6.16 server with simulated phones (OsmAnd
protocol), not with physical GPS trackers: feedback welcome.

## Requirements

- Gladys 5.1 or later.
- A Traccar server (version 5 or later) that Gladys can reach on your network,
  usually on port 8082.
- A Traccar user who sees the trackers. A read-only user is enough: the
  integration never changes anything in Traccar.

## Configuration

1. In Traccar, open **Settings → Preferences**, then the **Token** section,
   and generate a token (set an expiration date far enough ahead). You can
   also use the email and password of a Traccar user instead.
2. In Gladys, open the **Configuration** tab of the integration:
   - **Traccar address**: as you open it in your browser, for example
     `http://192.168.1.20:8082`. Without a port, 8082 is assumed.
   - **Token**, or **Email** and **Password**.
3. Save. The **Test the connection** button shows the Traccar version and how
   many trackers and geofences it sees.
4. Open the **Discovery** tab and add the trackers you want in Gladys.

**Home and presence** (optional):

- The **home** is a radius (150 m by default) around the location of your
  Gladys house (**Settings → Houses**). With several houses, give the name of the
  one to use; by default, the first one that has a location.
- Or name a **Traccar geofence** (for example `Home`): a tracker is then at
  home when it is inside it, and the radius is ignored.
- **Presence: last fix at most**: a tracker at home only keeps saying "seen
  at home" while its last position is younger than this (30 minutes by
  default).
- **Language**: the language of the feature names and of the texts the
  integration writes (zones, statuses, sentences). French by default.

## Devices

One device per Traccar tracker, with:

| Feature            | What it shows                                                  |
| ------------------ | -------------------------------------------------------------- |
| Status             | Online, offline or unknown, as Traccar sees it                 |
| Last update        | Date and time of the last message received by Traccar          |
| Zone               | The Traccar geofences the tracker is in, or "Outside zones"    |
| Speed              | In km/h                                                        |
| Battery            | In %, if the tracker reports it                                |
| Moving             | Yes or no, if Traccar computes it                              |
| Ignition           | On or off, for vehicle trackers that report it                 |
| Address            | Only if your Traccar server computes addresses (geocoder)      |
| Distance from home | In km, to the Gladys house                                     |
| At home            | Yes or no, following the home rule above                       |
| Presence           | A "seen at home" signal for the presence of a user (see below) |

Battery, moving, ignition and address appear as soon as the tracker reports
them: if one appears later, Gladys offers to **Update** the device in the
Discovery tab. Distance needs a Gladys house with a location; at home and
presence need a home (house or geofence).

Updates are live: Traccar pushes every new position to the integration
through its WebSocket. If the link drops, the integration reads Traccar every
30 seconds until it is back.

### Presence of a user

Gladys decides who is at home with scenes. Two ways, which combine well:

- **Simple**: a scene triggered when the **At home** feature of the tracker
  becomes 1, with the action **User seen at home**; a second one when it
  becomes 0, with **User left home**.
- **Robust**: the **Presence** feature sends a "seen at home" signal at every
  position at home, then every 5 minutes while the last position is recent.
  A scheduled scene (every 5 or 10 minutes) with the action **Check user
  presence** (the user, the house, the **Presence** feature of their tracker,
  a delay such as 15 minutes) marks the user away when the phone has not been
  seen at home for that delay — even if it ran out of battery at the office.

The scenes "user left home" and "user back home" of Gladys then work as
usual.

## Dashboard widget

The **GPS trackers** widget lists every tracker (eight at most) with its
zone, the time of its last position and its status as a colored badge. Tap a
tracker for its address, speed, battery, distance from home and a link to
the map (OpenStreetMap).

## Scenes

The integration adds to the scene editor, under **Integrations**:

**Triggers**

- **Tracker enters a geofence** and **Tracker leaves a geofence**: optionally
  for one tracker and one geofence (its name exactly as in Traccar; empty
  means any). The next actions can use the tracker name, the geofence, the
  address and a map link.
- **Tracker goes offline**: Traccar marked the tracker offline (no data for a
  while, set by Traccar). Variables: tracker name, last update.
- **Tracker alarm**: the tracker reports an alarm (SOS, low battery,
  overspeed, power cut, fall, tampering, vibration, movement), optionally
  only one kind. Variables: tracker name, alarm code and label, map link.

These triggers come from the positions themselves: no notification to set up
in Traccar. Only the trackers added to Gladys fire them.

**Action**

- **Get the position of a tracker**: returns a ready sentence ("Car is in
  Work, 4.1 km from home, position of 16:08."), and the status, zone,
  address, at home (yes/no), distance from home (km, -1 when unknown), speed
  (km/h), time of the position and a map link, for the next actions.

## Scene examples

- **The kids are home**: trigger "Tracker enters a geofence", tracker "Phone
  Léa", geofence "Home" → send a message "Léa is home".
- **Where is the car?** Trigger: a button or a chat message → action "Get the
  position of a tracker" (Car) → send a message with the sentence and the map
  link.
- **SOS**: trigger "Tracker alarm", alarm "SOS" → send a message with the
  tracker name and the map link to everyone, and turn the lights on.

## Troubleshooting

- **"Traccar refused the token"**: the token expired or was revoked; generate
  a new one. With an email and a password, check them in the Traccar web
  interface.
- **"Traccar does not answer"**: check the address (with the port) from
  another device of the network, and that Traccar is running. The
  integration runs in a container: `localhost` there is not your server, use
  its IP address.
- **No distance from home**: the Gladys house has no location (**Settings →
  Houses), or the integration was installed without the house location
  permission.
- **A tracker never "at home"**: check the radius, or the exact name of the
  home geofence; a phone indoors can report a position tens of meters away.
- Details are in the integration logs, with `LOG_LEVEL=debug` for every
  message. Positions are never written in the logs at the normal level.

## Limits

- No map in the dashboard: the widget vocabulary of Gladys has none; the map
  opens in OpenStreetMap.
- Read-only: no commands are sent to the trackers.
- Traccar's own events (overspeed computed by the server from a speed limit,
  maintenance, fuel) are not triggers; the alarms reported by the trackers
  are.
- Speed limits, geofences and statuses are those of Traccar: change them
  there.
