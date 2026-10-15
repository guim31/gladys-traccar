# Traccar for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Traccar](https://www.traccar.org), the open-source GPS tracking server: the
phones (Traccar Client app), car, pet and bike trackers of your Traccar server
become Gladys devices, scenes react to geofences and alarms, and a tracker at
home can drive the presence of a Gladys user.

Tested against a real Traccar 6.16 server with simulated phones (OsmAnd
protocol), not with physical GPS trackers: feedback welcome.

## Features

- **One device per tracker**: status (online, offline, unknown), last update,
  zone (the Traccar geofences it is in), speed (km/h), battery, moving,
  ignition and address when the tracker or the server reports them, distance
  from the Gladys house.
- **Presence**: an "At home" feature (a radius around the Gladys house, or a
  Traccar geofence), and a "Presence" signal for the core's "Check user
  presence" scene action.
- **Live**: positions pushed by the Traccar WebSocket; REST reads every 30 s
  while it is down, catching up on the latest position of each tracker.
- **Scene triggers**: tracker enters or leaves a geofence, stops reporting, raises
  an alarm (SOS, low battery, overspeed, power cut, fall, tampering...).
  Derived from the positions: no Traccar notification to configure.
- **Scene action** "Get the position of a tracker": a ready sentence ("Car is
  in Work, 4.1 km from home, position of 16:08."), the zone, address, distance
  and a map link (OpenStreetMap).
- **Dashboard widget** "GPS trackers": every tracker with its zone, the time of
  its last position and its status.
- English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- A Traccar server, version 5 or later (checked on 6.16), reachable from Gladys.
- A Traccar user token (Settings → Preferences → Token), or the email and
  password of a Traccar user. A read-only user is enough.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-traccar` (or find **Traccar** in the
   catalog).
2. In **Configuration**, enter the address of Traccar (`http://<ip>:8082`) and
   a token, save, and click **Test the connection**.
3. Add the trackers from the **Discover** tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration opens a Traccar session (cookie) with the token
(`GET /api/session?token=`) or the email and password (`POST /api/session`),
reads `/api/devices`, `/api/positions` and `/api/geofences`, then listens to
`/api/socket`. Every new position is compared with the previous one of its
tracker: a change of `geofenceIds` fires the geofence triggers, an
`attributes.alarm` the alarm trigger, a device status leaving `online` (to `offline`, or `unknown` for phones
and HTTP trackers) the offline trigger. Traccar only pushes its own events to users who created a
notification for them; the positions always arrive, so the triggers need no
setup in Traccar.

Speeds come from Traccar in knots and are converted to km/h. The Gladys house
location is read through the host API (manifest `location: true`).

## Limitations

- No map in the widget: the dashboard widget vocabulary of Gladys has none; a
  map link opens OpenStreetMap.
- Read-only: no command is sent to the trackers.
- Traccar's server-side events (overspeed from a speed limit, maintenance,
  fuel) are not triggers; alarms reported by the trackers are.
- One Traccar server per Gladys.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test: unit tests + a simulated Traccar
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js                  SDK wiring (src/app.js registers the handlers)
src/hub.js                trackers, states, triggers, presence, connection status
src/model.js              Traccar device + position -> tracker view (zones, home, distance)
src/devices.js            tracker view -> Gladys device and states
src/traccar/client.js     REST client (session cookie)
src/traccar/socket.js     push socket with reconnection and idle watchdog
src/widgets.js            "GPS trackers" dashboard widget
src/scenes.js             scene action
src/texts.js              every text, in four languages
test/                     node --test; the SDK's fake Gladys, a simulated Traccar
test/fixtures/traccar-6.16/  real Traccar 6.16.0 answers (test server, fake data)
```

`test/gladys-rules.test.js` checks every discovered device against the
category/type table extracted from the Gladys core.

To run it outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="traccar" \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. A hand-pushed `vX.Y.Z` tag also builds the image and the
GitHub Release, but then `version` in `package.json` and in the manifest (with
the `docker_image` tag) must be bumped and committed before tagging. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Traccar](https://github.com/traccar/traccar) by Anton Tananaev and
  contributors (Apache-2.0): the server, its API and its documentation.
- The Home Assistant
  [`traccar_server`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/traccar_server)
  integration (Apache-2.0) and the
  [`pytraccar`](https://github.com/ludeeus/pytraccar) library (MIT) by Joakim
  Sørensen, read as references for the session and socket flow; no code was
  copied.
- The cover is a generic illustration made for this repository.

## Disclaimer

This project is not affiliated with, endorsed by or sponsored by Traccar or
Anton Tananaev. Traccar is a trademark of its owner.

## License

[Apache-2.0](LICENSE).
