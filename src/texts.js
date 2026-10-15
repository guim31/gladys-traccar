// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface (German says "du", Spanish "usted"). Picked with the `language`
// field of the configuration: a device integration and its scene actions do
// not receive the user's language (a widget does).
// -----------------------------------------------------------------------------

// Feature names (frozen at the device creation in Gladys).
export const NAMES = {
  en: {
    status: 'Status',
    last_update: 'Last update',
    zone: 'Zone',
    address: 'Address',
    speed: 'Speed',
    battery: 'Battery',
    motion: 'Moving',
    ignition: 'Ignition',
    distance_home: 'Distance from home',
    at_home: 'At home',
    presence: 'Presence',
  },
  fr: {
    status: 'Statut',
    last_update: 'Dernière mise à jour',
    zone: 'Zone',
    address: 'Adresse',
    speed: 'Vitesse',
    battery: 'Batterie',
    motion: 'En mouvement',
    ignition: 'Contact',
    distance_home: 'Distance de la maison',
    at_home: 'À la maison',
    presence: 'Présence',
  },
  de: {
    status: 'Status',
    last_update: 'Letzte Aktualisierung',
    zone: 'Zone',
    address: 'Adresse',
    speed: 'Geschwindigkeit',
    battery: 'Akku',
    motion: 'In Bewegung',
    ignition: 'Zündung',
    distance_home: 'Entfernung von zu Hause',
    at_home: 'Zu Hause',
    presence: 'Anwesenheit',
  },
  es: {
    status: 'Estado',
    last_update: 'Última actualización',
    zone: 'Zona',
    address: 'Dirección',
    speed: 'Velocidad',
    battery: 'Batería',
    motion: 'En movimiento',
    ignition: 'Contacto',
    distance_home: 'Distancia de casa',
    at_home: 'En casa',
    presence: 'Presencia',
  },
};

// Traccar device statuses.
export const STATUS_LABELS = {
  en: { online: 'Online', offline: 'Offline', unknown: 'Unknown' },
  fr: { online: 'En ligne', offline: 'Hors ligne', unknown: 'Inconnu' },
  de: { online: 'Online', offline: 'Offline', unknown: 'Unbekannt' },
  es: { online: 'En línea', offline: 'Desconectado', unknown: 'Desconocido' },
};

// The zone of a tracker in no geofence, or without any position yet.
export const ZONE_TEXT = {
  en: { none: 'Outside zones', no_position: 'No position' },
  fr: { none: 'Hors zone', no_position: 'Aucune position' },
  de: { none: 'Außerhalb der Zonen', no_position: 'Keine Position' },
  es: { none: 'Fuera de zona', no_position: 'Sin posición' },
};

// Alarm types of Traccar (Position.ALARM_* in its code), as scene filters.
export const ALARMS = [
  'sos',
  'lowBattery',
  'overspeed',
  'powerCut',
  'fallDown',
  'tampering',
  'vibration',
  'movement',
];

export const ALARM_LABELS = {
  en: {
    sos: 'SOS',
    lowBattery: 'Low battery',
    overspeed: 'Overspeed',
    powerCut: 'Power cut',
    fallDown: 'Fall',
    tampering: 'Tampering',
    vibration: 'Vibration',
    movement: 'Movement',
  },
  fr: {
    sos: 'SOS',
    lowBattery: 'Batterie faible',
    overspeed: 'Excès de vitesse',
    powerCut: "Coupure d'alimentation",
    fallDown: 'Chute',
    tampering: 'Sabotage',
    vibration: 'Vibration',
    movement: 'Mouvement',
  },
  de: {
    sos: 'SOS',
    lowBattery: 'Akku schwach',
    overspeed: 'Geschwindigkeitsüberschreitung',
    powerCut: 'Stromausfall',
    fallDown: 'Sturz',
    tampering: 'Manipulation',
    vibration: 'Vibration',
    movement: 'Bewegung',
  },
  es: {
    sos: 'SOS',
    lowBattery: 'Batería baja',
    overspeed: 'Exceso de velocidad',
    powerCut: 'Corte de alimentación',
    fallDown: 'Caída',
    tampering: 'Manipulación',
    vibration: 'Vibración',
    movement: 'Movimiento',
  },
};

export function alarmLabel(alarm, language) {
  return (ALARM_LABELS[language] ?? ALARM_LABELS.en)[alarm] ?? alarm;
}

// Connection status shown in the Configuration screen (multi-language).
export const STATUS_TEXT = {
  en: {
    not_configured: 'Enter the address of Traccar and a token (or an email and a password).',
    invalid_url: 'The address of Traccar is not valid.',
    unauthorized: 'Traccar refused the token or the email and password.',
    unreachable: 'Traccar does not answer. Check its address and that it is running.',
    error: 'Traccar answered with an error. Check the integration logs.',
  },
  fr: {
    not_configured:
      "Saisissez l'adresse de Traccar et un jeton (ou une adresse e-mail et un mot de passe).",
    invalid_url: "L'adresse de Traccar n'est pas valide.",
    unauthorized: "Traccar a refusé le jeton ou l'e-mail et le mot de passe.",
    unreachable: "Traccar ne répond pas. Vérifiez son adresse et qu'il est démarré.",
    error: "Traccar a répondu par une erreur. Consultez les logs de l'intégration.",
  },
  de: {
    not_configured:
      'Gib die Adresse von Traccar und ein Token ein (oder eine E-Mail-Adresse und ein Passwort).',
    invalid_url: 'Die Adresse von Traccar ist ungültig.',
    unauthorized: 'Traccar hat das Token oder E-Mail und Passwort abgelehnt.',
    unreachable: 'Traccar antwortet nicht. Prüfe die Adresse und ob Traccar läuft.',
    error: 'Traccar hat mit einem Fehler geantwortet. Sieh in die Logs der Integration.',
  },
  es: {
    not_configured:
      'Introduzca la dirección de Traccar y un token (o un correo electrónico y una contraseña).',
    invalid_url: 'La dirección de Traccar no es válida.',
    unauthorized: 'Traccar ha rechazado el token o el correo electrónico y la contraseña.',
    unreachable: 'Traccar no responde. Compruebe su dirección y que esté en marcha.',
    error: 'Traccar ha respondido con un error. Consulte los registros de la integración.',
  },
};

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Die Initialisierung ist fehlgeschlagen, sieh in die Logs der Integration.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Answer of the "Test the connection" button.
export const TEST_TEXT = {
  en: {
    ok: (version, trackers, zones) =>
      `Connected to Traccar ${version}: ${trackers} tracker(s), ${zones} geofence(s).`,
  },
  fr: {
    ok: (version, trackers, zones) =>
      `Connecté à Traccar ${version} : ${trackers} traceur(s), ${zones} géobarrière(s).`,
  },
  de: {
    ok: (version, trackers, zones) =>
      `Mit Traccar ${version} verbunden: ${trackers} Tracker, ${zones} Geofence(s).`,
  },
  es: {
    ok: (version, trackers, zones) =>
      `Conectado a Traccar ${version}: ${trackers} rastreador(es), ${zones} geocerca(s).`,
  },
};

// Errors of the scene action.
export const ACTION_ERRORS = {
  en: { unknown_tracker: 'This tracker is unknown to the Traccar integration.' },
  fr: { unknown_tracker: "Ce traceur est inconnu de l'intégration Traccar." },
  de: { unknown_tracker: 'Dieser Tracker ist der Traccar-Integration unbekannt.' },
  es: { unknown_tracker: 'Este rastreador es desconocido para la integración Traccar.' },
};

const pick = (table, language) => table[language] ?? table.en;

/**
 * `16:08` today, `14/10 16:08` before, in the Gladys time zone (TZ). With
 * `now` null, always with the day (a feature state stays true over midnight).
 */
export function formatTime(iso, language, now = Date.now()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const locale = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'en-GB';
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const day = (d) => d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  return now !== null && day(date) === day(new Date(now)) && now - date.getTime() < 86_400_000
    ? time
    : `${day(date)} ${time}`;
}

/** `4.2 km` / `4,2 km` / `350 m`. */
export function formatDistance(km, language) {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  const value = km < 100 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${language === 'en' ? String(value) : String(value).replace('.', ',')} km`;
}

const SENTENCES = {
  en: {
    no_position: (name) => `${name} has not sent any position yet.`,
    in_zone: (name, zone) => `${name} is in ${zone}`,
    at_home: (name) => `${name} is at home`,
    away: (name) => `${name} is outside the known zones`,
    distance: (distance) => `, ${distance} from home`,
    address: (address) => ` (${address})`,
    time: (time) => `, position of ${time}.`,
  },
  fr: {
    no_position: (name) => `${name} n'a encore envoyé aucune position.`,
    in_zone: (name, zone) => `${name} est dans la zone ${zone}`,
    at_home: (name) => `${name} est à la maison`,
    away: (name) => `${name} est hors des zones connues`,
    distance: (distance) => `, à ${distance} de la maison`,
    address: (address) => ` (${address})`,
    time: (time) => `, position de ${time}.`,
  },
  de: {
    no_position: (name) => `${name} hat noch keine Position gesendet.`,
    in_zone: (name, zone) => `${name} ist in der Zone ${zone}`,
    at_home: (name) => `${name} ist zu Hause`,
    away: (name) => `${name} ist außerhalb der bekannten Zonen`,
    distance: (distance) => `, ${distance} von zu Hause entfernt`,
    address: (address) => ` (${address})`,
    time: (time) => `, Position von ${time}.`,
  },
  es: {
    no_position: (name) => `${name} todavía no ha enviado ninguna posición.`,
    in_zone: (name, zone) => `${name} está en la zona ${zone}`,
    at_home: (name) => `${name} está en casa`,
    away: (name) => `${name} está fuera de las zonas conocidas`,
    distance: (distance) => `, a ${distance} de casa`,
    address: (address) => ` (${address})`,
    time: (time) => `, posición de ${time}.`,
  },
};

export { SENTENCES };

/**
 * "Car is in Work (12 rue …), 4,1 km from home, position of 16:08."
 * @param {{ name: string, hasPosition: boolean, atHome: boolean | null,
 *   zones: string[], address: string | null, distanceKm: number | null,
 *   fixTime: string | null }} view
 */
export function positionSentence(view, language, now = Date.now()) {
  const s = pick(SENTENCES, language);
  if (!view.hasPosition) {
    return s.no_position(view.name);
  }
  let sentence;
  if (view.atHome) {
    sentence = s.at_home(view.name);
  } else if (view.zones.length > 0) {
    sentence = s.in_zone(view.name, view.zones.join(', '));
  } else {
    sentence = s.away(view.name);
  }
  if (view.address) {
    sentence += s.address(view.address);
  }
  if (!view.atHome && view.distanceKm !== null) {
    sentence += s.distance(formatDistance(view.distanceKm, language));
  }
  return sentence + s.time(formatTime(view.fixTime, language, now));
}
