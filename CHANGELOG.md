# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-15

### Added

- One Gladys device per Traccar tracker: status, last update, zone (Traccar
  geofences), speed, battery, moving, ignition, address, distance from home.
- Live updates through the Traccar WebSocket, with a REST fallback while it is
  down; a token or an email and a password.
- Presence: an "At home" feature (radius around the Gladys house, or a Traccar
  geofence) and a "Presence" signal for the "Check user presence" scene action.
- Scene triggers: tracker enters or leaves a geofence, goes offline, raises an
  alarm (SOS, low battery, overspeed...), without any Traccar notification to
  set up.
- Scene action "Get the position of a tracker": a ready sentence, the zone,
  the address, the distance from home and a map link.
- Dashboard widget "GPS trackers": every tracker with its zone, the time of its
  last position and its status.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-traccar/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-traccar/releases/tag/v1.0.0
