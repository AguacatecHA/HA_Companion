/**
 * ha-companion-panel
 *
 * Panel propio en la barra lateral con todo lo que manda el reloj.
 *
 * Las entidades NO se buscan por `entity_id`: con `translation_key` el id sale
 * del nombre TRADUCIDO, así que `is_charging` acaba en `..._cargando` y cambia
 * con el idioma. Se buscan por `unique_id` en el registro, que es `<ULID>_<clave>`
 * y sí es estable. De ahí sale un mapa clave -> entity_id por dispositivo.
 *
 * Las secciones de sueño y deporte reutilizan las tarjetas que ya sirve la
 * integración, en vez de repintar lo mismo por segunda vez.
 *
 * Todos los textos visibles salen de `T`, en español o inglés según
 * `hass.language` (el resto de idiomas cae en inglés, igual que hace el lado
 * Python con SLEEP_PHASE_LABELS / SPORT_TYPE_LABELS).
 */

const ULID = 26;   // longitud del prefijo del unique_id

const SOPORTADOS = ["es", "en", "fr", "de", "it"];
const idioma = (hass) => {
  const l = String((hass && (hass.language || (hass.locale && hass.locale.language))) || "en").toLowerCase().slice(0, 2);
  return SOPORTADOS.includes(l) ? l : "en";
};

// Algunos estados llegan del reloj en inglés porque no pasan por el catálogo de
// traducciones de la integración (son valores crudos del sensor, no su nombre).
const ESTADO_TRAD = {
  es: { Awake: "Despierto", Sleeping: "Durmiendo", Napping: "Siesta",
        is_wearing: "Puesto", not_wearing: "Quitado" },
  en: { Awake: "Awake", Sleeping: "Sleeping", Napping: "Napping",
        is_wearing: "Worn", not_wearing: "Not worn" },
  fr: { Awake: "Éveillé", Sleeping: "Endormi", Napping: "Sieste",
        is_wearing: "Portée", not_wearing: "Retirée" },
  de: { Awake: "Wach", Sleeping: "Schläft", Napping: "Nickerchen",
        is_wearing: "Getragen", not_wearing: "Abgelegt" },
  it: { Awake: "Sveglio", Sleeping: "Dorme", Napping: "Pisolino",
        is_wearing: "Indossato", not_wearing: "Non indossato" },
};
const traduce = (v, lang) => (ESTADO_TRAD[lang] && ESTADO_TRAD[lang][v]) || v;

const T = {
  es: {
    subtitulo: "datos de tu reloj",
    sinDatosOpcion: "(sin datos)",
    anios: "años",
    errorRegistro: "No se pudo leer el registro de entidades.",
    buscando: "Buscando relojes…",
    sinReloj: "No hay ningún reloj configurado todavía.",
    reloj: "Reloj",
    ver: (id) => `Ver ${id}`,
    bateria: (v) => `Batería ${v}%`,
    cargando: "Cargando",
    puesto: "Puesto",
    durmiendo: "Durmiendo",
    enMovimiento: "En movimiento",
    actualizacion: "Actualización disponible",
    sinSync: (t) => `Sin sincronizar hace ${t}`,
    de: (v) => `de ${v}`,
    dias: (n) => (n === 1 ? "día" : "días"),
    alDia: "al día",
    si: "sí", no: "no",
    sinDatosTodavia: "Sin datos todavía.",
    hoy: "Hoy", estaSemana: "Esta semana", ahoraMismo: "Ahora mismo",
    sueno: "Sueño", deporte: "Deporte", elReloj: "El reloj", modos: "Modos",
    pasos: "Pasos", calorias: "Calorías", distancia: "Distancia",
    horasDePie: "Horas de pie", quemaGrasa: "Quema grasa", pai7: "PAI (7 días)",
    pulso: "Pulso", enReposo: "En reposo", maximoHoy: "Máximo hoy",
    estres: "Estrés", oxigeno: "Oxígeno", temperatura: "Temperatura",
    altitud: "Altitud", presion: "Presión",
    firmware: "Firmware", app: "App", ultimaPublicada: "Última publicada",
    zeppOs: "Zepp OS", apiMinima: "API mínima", brillo: "Brillo",
    discoLibre: "Disco libre", sincronizado: "Sincronizado",
    noMolestar: "No molestar", modoSueno: "Modo sueño", modoTeatro: "Modo teatro",
    ahorro: "Ahorro", ultraAhorro: "Ultra ahorro", pantallaAOD: "Pantalla siempre activa",
    puntuacion: "Puntuación", estado: "Estado", seDurmio: "Se durmió", seDesperto: "Se despertó",
    entrenamientos: "Entrenamientos", carga: "Carga", vo2max: "VO₂ máx",
    recuperacion: "Recuperación", ultimoDeporte: "Último deporte", duracion: "Duración",
    locale: "es-ES",
  },
  en: {
    subtitulo: "your watch data",
    sinDatosOpcion: "(no data)",
    anios: "yrs",
    errorRegistro: "Couldn't read the entity registry.",
    buscando: "Looking for watches…",
    sinReloj: "No watch configured yet.",
    reloj: "Watch",
    ver: (id) => `View ${id}`,
    bateria: (v) => `Battery ${v}%`,
    cargando: "Charging",
    puesto: "On wrist",
    durmiendo: "Sleeping",
    enMovimiento: "Moving",
    actualizacion: "Update available",
    sinSync: (t) => `Not synced for ${t}`,
    de: (v) => `of ${v}`,
    dias: (n) => (n === 1 ? "day" : "days"),
    alDia: "a day",
    si: "yes", no: "no",
    sinDatosTodavia: "No data yet.",
    hoy: "Today", estaSemana: "This week", ahoraMismo: "Right now",
    sueno: "Sleep", deporte: "Workouts", elReloj: "The watch", modos: "Modes",
    pasos: "Steps", calorias: "Calories", distancia: "Distance",
    horasDePie: "Standing hours", quemaGrasa: "Fat burn", pai7: "PAI (7 days)",
    pulso: "Heart rate", enReposo: "Resting", maximoHoy: "Max today",
    estres: "Stress", oxigeno: "Oxygen", temperatura: "Temperature",
    altitud: "Altitude", presion: "Pressure",
    firmware: "Firmware", app: "App", ultimaPublicada: "Last published",
    zeppOs: "Zepp OS", apiMinima: "Min API", brillo: "Brightness",
    discoLibre: "Free storage", sincronizado: "Synced",
    noMolestar: "Do not disturb", modoSueno: "Sleep mode", modoTeatro: "Theater mode",
    ahorro: "Power saving", ultraAhorro: "Ultra power saving", pantallaAOD: "Always-on display",
    puntuacion: "Score", estado: "Status", seDurmio: "Fell asleep", seDesperto: "Woke up",
    entrenamientos: "Workouts", carga: "Load", vo2max: "VO₂ max",
    recuperacion: "Recovery", ultimoDeporte: "Last workout", duracion: "Duration",
    locale: "en-US",
  },
  fr: {
    subtitulo: "les données de votre montre",
    sinDatosOpcion: "(pas de données)",
    anios: "ans",
    errorRegistro: "Impossible de lire le registre des entités.",
    buscando: "Recherche de montres…",
    sinReloj: "Aucune montre configurée pour le moment.",
    reloj: "Montre",
    ver: (id) => `Voir ${id}`,
    bateria: (v) => `Batterie ${v}%`,
    cargando: "En charge",
    puesto: "Portée",
    durmiendo: "Endormi",
    enMovimiento: "En mouvement",
    actualizacion: "Mise à jour disponible",
    sinSync: (t) => `Non synchronisé depuis ${t}`,
    de: (v) => `sur ${v}`,
    dias: (n) => (n === 1 ? "jour" : "jours"),
    alDia: "par jour",
    si: "oui", no: "non",
    sinDatosTodavia: "Aucune donnée pour le moment.",
    hoy: "Aujourd'hui", estaSemana: "Cette semaine", ahoraMismo: "En ce moment",
    sueno: "Sommeil", deporte: "Sport", elReloj: "La montre", modos: "Modes",
    pasos: "Pas", calorias: "Calories", distancia: "Distance",
    horasDePie: "Heures debout", quemaGrasa: "Combustion des graisses", pai7: "PAI (7 jours)",
    pulso: "Fréquence cardiaque", enReposo: "Au repos", maximoHoy: "Max aujourd'hui",
    estres: "Stress", oxigeno: "Oxygène", temperatura: "Température",
    altitud: "Altitude", presion: "Pression",
    firmware: "Firmware", app: "Application", ultimaPublicada: "Dernière publiée",
    zeppOs: "Zepp OS", apiMinima: "API minimale", brillo: "Luminosité",
    discoLibre: "Stockage libre", sincronizado: "Synchronisé",
    noMolestar: "Ne pas déranger", modoSueno: "Mode sommeil", modoTeatro: "Mode cinéma",
    ahorro: "Économie d'énergie", ultraAhorro: "Économie d'énergie ultra", pantallaAOD: "Écran toujours allumé",
    puntuacion: "Score", estado: "État", seDurmio: "Endormi à", seDesperto: "Réveillé à",
    entrenamientos: "Entraînements", carga: "Charge", vo2max: "VO₂ max",
    recuperacion: "Récupération", ultimoDeporte: "Dernier sport", duracion: "Durée",
    locale: "fr-FR",
  },
  de: {
    subtitulo: "die Daten deiner Uhr",
    sinDatosOpcion: "(keine Daten)",
    anios: "Jahre",
    errorRegistro: "Das Entitätsregister konnte nicht gelesen werden.",
    buscando: "Uhren werden gesucht…",
    sinReloj: "Noch keine Uhr konfiguriert.",
    reloj: "Uhr",
    ver: (id) => `${id} anzeigen`,
    bateria: (v) => `Akku ${v}%`,
    cargando: "Lädt",
    puesto: "Getragen",
    durmiendo: "Schläft",
    enMovimiento: "In Bewegung",
    actualizacion: "Update verfügbar",
    sinSync: (t) => `Seit ${t} nicht synchronisiert`,
    de: (v) => `von ${v}`,
    dias: (n) => (n === 1 ? "Tag" : "Tage"),
    alDia: "pro Tag",
    si: "ja", no: "nein",
    sinDatosTodavia: "Noch keine Daten.",
    hoy: "Heute", estaSemana: "Diese Woche", ahoraMismo: "Gerade eben",
    sueno: "Schlaf", deporte: "Training", elReloj: "Die Uhr", modos: "Modi",
    pasos: "Schritte", calorias: "Kalorien", distancia: "Distanz",
    horasDePie: "Stehstunden", quemaGrasa: "Fettverbrennung", pai7: "PAI (7 Tage)",
    pulso: "Herzfrequenz", enReposo: "Ruhe", maximoHoy: "Max heute",
    estres: "Stress", oxigeno: "Sauerstoff", temperatura: "Temperatur",
    altitud: "Höhe", presion: "Luftdruck",
    firmware: "Firmware", app: "App", ultimaPublicada: "Zuletzt veröffentlicht",
    zeppOs: "Zepp OS", apiMinima: "Min. API", brillo: "Helligkeit",
    discoLibre: "Freier Speicher", sincronizado: "Synchronisiert",
    noMolestar: "Nicht stören", modoSueno: "Schlafmodus", modoTeatro: "Kinomodus",
    ahorro: "Energiesparmodus", ultraAhorro: "Ultra-Energiesparmodus", pantallaAOD: "Always-on Display",
    puntuacion: "Wert", estado: "Status", seDurmio: "Eingeschlafen", seDesperto: "Aufgewacht",
    entrenamientos: "Trainings", carga: "Belastung", vo2max: "VO₂ max",
    recuperacion: "Erholung", ultimoDeporte: "Letzte Sportart", duracion: "Dauer",
    locale: "de-DE",
  },
  it: {
    subtitulo: "i dati del tuo orologio",
    sinDatosOpcion: "(nessun dato)",
    anios: "anni",
    errorRegistro: "Impossibile leggere il registro delle entità.",
    buscando: "Ricerca orologi…",
    sinReloj: "Nessun orologio configurato ancora.",
    reloj: "Orologio",
    ver: (id) => `Vedi ${id}`,
    bateria: (v) => `Batteria ${v}%`,
    cargando: "In carica",
    puesto: "Indossato",
    durmiendo: "Sta dormendo",
    enMovimiento: "In movimento",
    actualizacion: "Aggiornamento disponibile",
    sinSync: (t) => `Non sincronizzato da ${t}`,
    de: (v) => `di ${v}`,
    dias: (n) => (n === 1 ? "giorno" : "giorni"),
    alDia: "al giorno",
    si: "sì", no: "no",
    sinDatosTodavia: "Ancora nessun dato.",
    hoy: "Oggi", estaSemana: "Questa settimana", ahoraMismo: "In questo momento",
    sueno: "Sonno", deporte: "Allenamenti", elReloj: "L'orologio", modos: "Modalità",
    pasos: "Passi", calorias: "Calorie", distancia: "Distanza",
    horasDePie: "Ore in piedi", quemaGrasa: "Consumo grassi", pai7: "PAI (7 giorni)",
    pulso: "Frequenza cardiaca", enReposo: "A riposo", maximoHoy: "Max oggi",
    estres: "Stress", oxigeno: "Ossigeno", temperatura: "Temperatura",
    altitud: "Altitudine", presion: "Pressione",
    firmware: "Firmware", app: "App", ultimaPublicada: "Ultima pubblicata",
    zeppOs: "Zepp OS", apiMinima: "API minima", brillo: "Luminosità",
    discoLibre: "Spazio libero", sincronizado: "Sincronizzato",
    noMolestar: "Non disturbare", modoSueno: "Modalità sonno", modoTeatro: "Modalità cinema",
    ahorro: "Risparmio energetico", ultraAhorro: "Risparmio energetico ultra", pantallaAOD: "Schermo sempre attivo",
    puntuacion: "Punteggio", estado: "Stato", seDurmio: "Addormentato", seDesperto: "Sveglio",
    entrenamientos: "Allenamenti", carga: "Carico", vo2max: "VO₂ max",
    recuperacion: "Recupero", ultimoDeporte: "Ultimo sport", duracion: "Durata",
    locale: "it-IT",
  },
};

const ESTILOS = `
  :host { display: block; height: 100%; background: var(--primary-background-color); }
  .envoltorio { max-width: 1180px; margin: 0 auto; padding: 16px 16px 48px; }

  /* Barra superior pegada arriba, al estilo del resto de paneles de Home
     Assistant: menú, título con subtítulo y acciones a la derecha. */
  header.barra { position: sticky; top: 0; z-index: 3;
                 display: flex; align-items: center; gap: 4px;
                 padding: 4px 4px 10px; flex-wrap: wrap;
                 background: var(--primary-background-color); }
  .bloque-titulo { display: flex; flex-direction: column; justify-content: center;
                   min-width: 0; margin-inline-start: 4px; }
  /* nowrap: sin esto el desplegable le robaba el ancho y "HA Companion" se
     partía en dos líneas en el móvil. */
  .titulo { font-size: 20px; font-weight: 500; color: var(--primary-text-color);
            white-space: nowrap; line-height: 1.2; }
  .subtitulo { font-size: 12px; color: var(--secondary-text-color);
               white-space: nowrap; }
  .selector { margin-left: auto; min-width: 0; max-width: 100%; }
  select { font: inherit; padding: 6px 10px; border-radius: 8px; max-width: 100%;
           color: var(--primary-text-color); background: var(--card-background-color);
           border: 1px solid var(--divider-color); }

  /* En pantallas estrechas el desplegable baja a su propia línea, a todo el
     ancho, en vez de estrujar el título. */
  @media (max-width: 620px) {
    .envoltorio { padding: 12px 12px 40px; }
    .selector { margin-left: 0; flex: 1 0 100%; }
    .selector select { width: 100%; }
    .cabecera { padding: 14px; gap: 12px; }
    .estados { margin-left: 0; }
    .rejilla { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  }

  .cabecera { display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
              background: var(--card-background-color); border-radius: 12px;
              padding: 18px; box-shadow: var(--ha-card-box-shadow, none); }
  .quien { display: flex; flex-direction: column; gap: 2px; }
  .quien b { font-size: 22px; font-weight: 500; color: var(--primary-text-color); }
  .quien span { font-size: 13px; color: var(--secondary-text-color); }
  .estados { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
          padding: 5px 11px; border-radius: 999px; background: var(--secondary-background-color);
          color: var(--secondary-text-color); white-space: nowrap; }
  .chip.on { background: color-mix(in srgb, var(--primary-color) 22%, transparent);
             color: var(--primary-text-color); }
  .chip.alerta { background: color-mix(in srgb, #F0A030 28%, transparent);
                 color: var(--primary-text-color); }

  h2 { font-size: 15px; font-weight: 500; color: var(--primary-text-color);
       margin: 26px 0 10px; display: flex; align-items: center; gap: 8px; }
  h2 ha-icon { --mdc-icon-size: 19px; color: var(--secondary-text-color); }

  .rejilla { display: grid; gap: 12px;
             grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); }
  .dato { background: var(--card-background-color); border-radius: 12px; padding: 14px;
          display: flex; align-items: center; gap: 12px;
          box-shadow: var(--ha-card-box-shadow, none); }
  .dato.pulsable { cursor: pointer; transition: background .12s, transform .12s; }
  .dato.pulsable:hover { background: var(--secondary-background-color); }
  .dato.pulsable:active { transform: scale(.985); }
  .dato.pulsable:focus-visible { outline: 2px solid var(--primary-color);
                                 outline-offset: 2px; }
  .chip.pulsable { cursor: pointer; }
  .chip.pulsable:hover { filter: brightness(1.25); }
  .dato .txt { min-width: 0; }
  .dato .val { font-size: 21px; font-weight: 500; color: var(--primary-text-color);
               font-variant-numeric: tabular-nums; line-height: 1.15;
               white-space: nowrap; }
  .dato .val small { font-size: 12px; font-weight: 400;
                     color: var(--secondary-text-color); margin-left: 2px; }
  .dato .eti { font-size: 12px; color: var(--secondary-text-color);
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dato .meta { font-size: 11px; color: var(--secondary-text-color); opacity: .75; }

  /* El icono va DENTRO del aro. Ojo: en el DOM es hermano de .aro, no hijo, así
     que la regla tiene que colgar de .envoltura-aro. Con el selector .aro
     ha-icon no casaba nada, el absolute no se aplicaba y el icono caia fuera. */
  .envoltura-aro { position: relative; width: 42px; height: 42px; flex: none; }
  .aro { --p: 0; --c: var(--primary-color);
         width: 100%; height: 100%; border-radius: 50%;
         background: conic-gradient(var(--c) calc(var(--p) * 1%), var(--divider-color) 0);
         display: grid; place-items: center; }
  .aro::after { content: ""; width: 32px; height: 32px; border-radius: 50%;
                background: var(--card-background-color); }
  .envoltura-aro ha-icon { position: absolute; inset: 0; display: grid;
                           place-items: center; --mdc-icon-size: 17px;
                           color: var(--c); pointer-events: none; }

  .tarjetas { display: grid; gap: 12px; }
  .aviso { background: var(--card-background-color); border-radius: 12px; padding: 16px;
           color: var(--secondary-text-color); font-size: 14px; }
  .pie { margin-top: 30px; font-size: 12px; color: var(--secondary-text-color);
         opacity: .7; text-align: center; }
`;

// clave -> {etiKey, unidad, icono, objetivo}. etiKey se resuelve contra T en
// tiempo de pintado, porque hasta entonces no sabemos el idioma.
const HOY = (t) => [
  { k: "steps",         eti: t.pasos,      obj: "steps_target",       icono: "mdi:shoe-print",     color: "#5B8DEF" },
  { k: "calories",      eti: t.calorias,   obj: "calories_target",    icono: "mdi:fire",           color: "#F0A030", uni: "kcal" },
  { k: "distance",      eti: t.distancia,  icono: "mdi:map-marker-distance", color: "#34C77B", uni: "m" },
  { k: "stand_hours",   eti: t.horasDePie, obj: "stand_hours_target", icono: "mdi:human-handsup", color: "#A78BFA" },
  { k: "fat_burning",   eti: t.quemaGrasa, obj: "fat_burning_target", icono: "mdi:lightning-bolt", color: "#E86FA9", uni: "min" },
  // La meta del PAI son 100 puntos en 7 días. No viene como sensor de objetivo
  // porque es un valor fijo de Zepp, así que va escrito aquí.
  { k: "pai_total",     eti: t.pai7, icono: "mdi:heart-pulse", color: "#E5484D",
    metaFija: 100 },
];

const AHORA = (t) => [
  { k: "heart_rate",  eti: t.pulso,        icono: "mdi:heart-pulse",  uni: "ppm" },
  { k: "heart_resting", eti: t.enReposo,   icono: "mdi:heart-outline", uni: "ppm" },
  { k: "heart_max",   eti: t.maximoHoy,    icono: "mdi:heart-flash",  uni: "ppm" },
  { k: "stress",      eti: t.estres,       icono: "mdi:emoticon-neutral-outline" },
  { k: "spo2",        eti: t.oxigeno,      icono: "mdi:water-percent", uni: "%" },
  { k: "temperature", eti: t.temperatura,  icono: "mdi:thermometer",  uni: "°" },
  { k: "altitude_state", eti: t.altitud,   icono: "mdi:image-filter-hdr", uni: "m" },
  { k: "air_pressure_state", eti: t.presion, icono: "mdi:gauge",      uni: "hPa" },
];

const RELOJ = (t) => [
  { k: "firmware_version", eti: t.firmware,        icono: "mdi:chip" },
  { k: "app_version",      eti: t.app,             icono: "mdi:cellphone-arrow-down" },
  { k: "published_version", eti: t.ultimaPublicada, icono: "mdi:cloud-download-outline" },
  { k: "os_version",       eti: t.zeppOs,          icono: "mdi:memory" },
  { k: "min_api",          eti: t.apiMinima,       icono: "mdi:api" },
  { k: "screen_brightness", eti: t.brillo,         icono: "mdi:brightness-6", uni: "%" },
  { k: "disk_free",        eti: t.discoLibre,      icono: "mdi:harddisk" },
  { k: "record_time",      eti: t.sincronizado, icono: "mdi:sync", fecha: true },
];

const MODOS = (t) => [
  { k: "system_mode_dnd",              eti: t.noMolestar },
  { k: "system_mode_sleep",            eti: t.modoSueno },
  { k: "system_mode_theater",          eti: t.modoTeatro },
  { k: "system_mode_power_saving",     eti: t.ahorro },
  { k: "system_mode_ultra_power_saving", eti: t.ultraAhorro },
  { k: "screen_aod_mode",              eti: t.pantallaAOD },
];

class HaCompanionPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._relojes = null;      // [{device_id, nombre, claves:{}}]
    this._elegido = null;
    this._huella = null;
    this._cargando = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._relojes && !this._cargando) { this._descubrir(); return; }
    this._quizasPintar();
  }
  set narrow(v) {
    const antes = this._narrow;
    this._narrow = v;
    if (antes !== undefined && antes !== v) this._pintar();
  }
  get narrow() { return this._narrow; }
  set route(v) {}
  set panel(v) { this._panel = v; }

  get _lang() { return idioma(this._hass); }
  get _t() { return T[this._lang]; }

  /** Mapa clave -> entity_id por dispositivo, leído del registro. */
  async _descubrir() {
    this._cargando = true;
    let ents, devs;
    try {
      [ents, devs] = await Promise.all([
        this._hass.callWS({ type: "config/entity_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
      ]);
    } catch (e) {
      this._relojes = "error";
      this._cargando = false;
      this._pintar();
      return;
    }
    const nombreDe = new Map(devs.map((d) => [d.id, d.name_by_user || d.name]));
    const porDisp = new Map();
    for (const e of ents) {
      if (e.platform !== "ha_companion" || !e.device_id) continue;
      const clave = e.unique_id.slice(ULID + 1);
      if (!clave) continue;
      if (!porDisp.has(e.device_id)) {
        porDisp.set(e.device_id, {
          device_id: e.device_id,
          nombre: nombreDe.get(e.device_id) || this._t.reloj,
          claves: {},
        });
      }
      porDisp.get(e.device_id).claves[clave] = e.entity_id;
    }
    this._relojes = [...porDisp.values()];
    // Por defecto, el reloj que esté dando datos.
    const vivo = this._relojes.find((r) => this._vivo(r));
    this._elegido = (vivo || this._relojes[0] || {}).device_id || null;
    this._cargando = false;
    this._pintar();
  }

  _vivo(reloj) {
    const id = reloj.claves["record_time"] || reloj.claves["battery"];
    const st = id && this._hass.states[id];
    return !!st && st.state !== "unavailable" && st.state !== "unknown";
  }

  _reloj() {
    if (!Array.isArray(this._relojes)) return null;
    return this._relojes.find((r) => r.device_id === this._elegido) || this._relojes[0];
  }

  _st(clave) {
    const r = this._reloj();
    const id = r && r.claves[clave];
    return id ? this._hass.states[id] : null;
  }

  _val(clave) {
    const st = this._st(clave);
    if (!st || st.state === "unavailable" || st.state === "unknown") return null;
    return st.state;
  }

  _num(clave) {
    const v = this._val(clave);
    return v === null || isNaN(Number(v)) ? null : Number(v);
  }

  /** Repintar solo cuando cambie algo del reloj elegido, no con la casa entera. */
  _quizasPintar() {
    const r = this._reloj();
    if (!r) return;
    const h = Object.values(r.claves)
      .map((id) => { const s = this._hass.states[id]; return s ? s.state : "-"; })
      .join("|");
    if (h === this._huella) return;
    this._huella = h;
    this._pintar();
  }

  /** Abre el diálogo de más información, que es donde vive la gráfica.
   *  El evento tiene que ir con `composed: true` para poder salir del shadow
   *  DOM del panel y llegar a <home-assistant>, que es quien lo atiende. */
  _masInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  /** Deja un elemento pulsable, también con teclado. */
  _pulsable(el, entityId) {
    if (!entityId) return el;
    el.classList.add("pulsable");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", this._t.ver(entityId));
    el.addEventListener("click", () => this._masInfo(entityId));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._masInfo(entityId);
      }
    });
    return el;
  }

  _tarjeta(tipo, config) {
    const el = document.createElement(tipo);
    if (!customElements.get(tipo)) return null;
    try {
      el.setConfig({ type: "custom:" + tipo, ...config });
      el.hass = this._hass;
      return el;
    } catch (e) {
      return null;
    }
  }

  _pintar() {
    const t = this._t;
    const sr = this.shadowRoot;
    sr.innerHTML = `<style>${ESTILOS}</style>`;
    const env = document.createElement("div");
    env.className = "envoltorio";

    // ── barra superior ──────────────────────────────────────────────────
    const barra = document.createElement("header");
    barra.className = "barra";

    // Botón de menú. Sin esto, en el móvil no hay forma de volver a la barra
    // lateral de Home Assistant: el panel ocupa la pantalla entera y se queda
    // uno atrapado dentro. Home Assistant no lo pone por su cuenta en los
    // paneles personalizados, lo tiene que dibujar el propio panel.
    const boton = document.createElement("ha-menu-button");
    boton.hass = this._hass;
    boton.narrow = !!this._narrow;
    barra.appendChild(boton);

    const bloque = document.createElement("div");
    bloque.className = "bloque-titulo";
    const version = (this._panel && this._panel.config &&
                     this._panel.config.version) || "";
    bloque.innerHTML = `<div class="titulo">HA Companion</div>` +
      `<div class="subtitulo">${version ? "v" + version + " · " : ""}` +
      `${t.subtitulo}</div>`;
    barra.appendChild(bloque);
    if (Array.isArray(this._relojes) && this._relojes.length > 1) {
      const sel = document.createElement("select");
      sel.className = "selector";
      this._relojes.forEach((r) => {
        const o = document.createElement("option");
        o.value = r.device_id;
        o.textContent = r.nombre + (this._vivo(r) ? "" : " " + t.sinDatosOpcion);
        if (r.device_id === this._elegido) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", (e) => {
        this._elegido = e.target.value;
        this._huella = null;
        this._pintar();
      });
      barra.appendChild(sel);
    }
    env.appendChild(barra);

    if (this._relojes === "error") {
      env.innerHTML += `<div class="aviso">${t.errorRegistro}</div>`;
      sr.appendChild(env); return;
    }
    if (!this._relojes) {
      env.innerHTML += `<div class="aviso">${t.buscando}</div>`;
      sr.appendChild(env); return;
    }
    if (!this._reloj()) {
      env.innerHTML += `<div class="aviso">${t.sinReloj}</div>`;
      sr.appendChild(env); return;
    }

    env.appendChild(this._cabecera());
    env.appendChild(this._seccion(t.hoy, "mdi:calendar-today", this._rejillaHoy()));

    const semana = this._rejillaSemana();
    if (semana) env.appendChild(this._seccion(t.estaSemana, "mdi:calendar-week", semana));
    env.appendChild(this._seccion(t.ahoraMismo, "mdi:pulse", this._rejilla(AHORA(t))));

    const sueno = this._bloqueSueno();
    if (sueno) env.appendChild(this._seccion(t.sueno, "mdi:sleep", sueno));

    const deporte = this._bloqueDeporte();
    if (deporte) env.appendChild(this._seccion(t.deporte, "mdi:run", deporte));

    env.appendChild(this._seccion(t.elReloj, "mdi:watch", this._rejilla(RELOJ(t))));
    env.appendChild(this._seccion(t.modos, "mdi:tune", this._chipsModos()));

    const pie = document.createElement("div");
    pie.className = "pie";
    pie.textContent = "HA Companion";
    env.appendChild(pie);

    sr.appendChild(env);
  }

  _seccion(titulo, icono, cuerpo) {
    const frag = document.createDocumentFragment();
    const h = document.createElement("h2");
    h.innerHTML = `<ha-icon icon="${icono}"></ha-icon>${titulo}`;
    frag.appendChild(h);
    frag.appendChild(cuerpo);
    const d = document.createElement("div");
    d.appendChild(frag);
    return d;
  }

  _cabecera() {
    const t = this._t;
    const c = document.createElement("div");
    c.className = "cabecera";

    const nombre = this._val("user_nick_name") || this._reloj().nombre;
    const modelo = this._val("device_name") || "";
    const bat = this._num("battery");
    const peso = this._val("user_weight");
    const altura = this._val("user_height");
    const edad = this._val("user_age");

    const quien = document.createElement("div");
    quien.className = "quien";
    const detalles = [modelo, edad && `${edad} ${t.anios}`,
                      altura && `${altura} cm`, peso && `${peso} kg`].filter(Boolean).join(" · ");
    quien.innerHTML = `<b>${nombre}</b><span>${detalles}</span>`;
    c.appendChild(quien);

    const chips = document.createElement("div");
    chips.className = "estados";
    const claves = this._reloj().claves || {};
    const añade = (txt, clase, clave) => {
      const s = document.createElement("span");
      s.className = "chip" + (clase ? " " + clase : "");
      s.textContent = txt;
      chips.appendChild(this._pulsable(s, claves[clave]));
    };
    if (bat !== null) añade(t.bateria(bat), bat <= 20 ? "alerta" : "", "battery");
    if (this._val("is_charging") === "on") añade(t.cargando, "on", "is_charging");
    if (this._val("wear") === "1" || this._val("wear") === "is_wearing") añade(t.puesto, "on", "wear");
    if (this._val("is_sleeping") === "on") añade(t.durmiendo, "on", "is_sleeping");
    if (this._val("is_moving") === "on") añade(t.enMovimiento, "on", "is_moving");
    if (this._val("update_pending") === "on") añade(t.actualizacion, "alerta", "update_pending");

    // Si el reloj deja de enviar, todo lo demás se queda congelado sin avisar.
    const st = this._st("sync_age");
    const min = this._num("sync_age");
    if (min !== null) {
      const viejo = st && st.attributes && st.attributes.is_stale;
      if (viejo) {
        const h = Math.floor(min / 60);
        añade(t.sinSync(h ? h + " h" : min + " min"), "alerta", "sync_age");
      }
    }
    c.appendChild(chips);
    return c;
  }

  _dato({ val, eti, meta, uni, icono, color, pct, entidad }) {
    const d = document.createElement("div");
    d.className = "dato";
    if (pct !== undefined && icono) {
      const c = color || "var(--primary-color)";
      const w = document.createElement("div");
      w.className = "envoltura-aro";
      w.style.setProperty("--c", c);
      w.innerHTML = `<div class="aro" style="--p:${Math.min(pct, 100)}"></div>` +
                    `<ha-icon icon="${icono}"></ha-icon>`;
      d.appendChild(w);
    } else if (icono) {
      const i = document.createElement("ha-icon");
      i.setAttribute("icon", icono);
      i.style.color = color || "var(--secondary-text-color)";
      i.style.setProperty("--mdc-icon-size", "24px");
      i.style.flex = "none";
      d.appendChild(i);
    }
    const t = document.createElement("div");
    t.className = "txt";
    t.innerHTML = `<div class="val">${val}${uni ? `<small>${uni}</small>` : ""}</div>` +
                  `<div class="eti">${eti}</div>` +
                  (meta ? `<div class="meta">${meta}</div>` : "");
    d.appendChild(t);
    return this._pulsable(d, entidad);
  }

  _rejillaHoy() {
    const t = this._t;
    const g = document.createElement("div");
    g.className = "rejilla";
    HOY(t).forEach((f) => {
      const v = this._num(f.k);
      if (v === null) return;
      const obj = f.obj ? this._num(f.obj) : (f.metaFija || null);
      g.appendChild(this._dato({
        val: v.toLocaleString(t.locale),
        uni: f.uni,
        eti: f.eti,
        meta: obj ? t.de(obj.toLocaleString(t.locale)) : null,
        icono: f.icono,
        color: f.color,
        pct: obj ? (v / obj) * 100 : undefined,
        entidad: (this._reloj().claves || {})[f.k],
      }));
    });
    return g;
  }

  /** Acumulado de 7 días, del atributo week_total que publica la integración. */
  _rejillaSemana() {
    const t = this._t;
    const g = document.createElement("div");
    g.className = "rejilla";
    HOY(t).forEach((f) => {
      const st = this._st(f.k);
      const a = st && st.attributes;
      if (!a || a.week_total === null || a.week_total === undefined) return;
      const dias = (a.week_days || []).length;
      g.appendChild(this._dato({
        val: Math.round(a.week_total).toLocaleString(t.locale),
        uni: f.uni,
        eti: f.eti,
        meta: a.week_average !== null && a.week_average !== undefined
          ? `${Math.round(a.week_average).toLocaleString(t.locale)} ${t.alDia} · ${dias} ${t.dias(dias)}`
          : null,
        icono: f.icono,
        color: f.color,
        entidad: (this._reloj().claves || {})[f.k],
      }));
    });
    return g.children.length ? g : null;
  }

  _rejilla(defs) {
    const t = this._t;
    const g = document.createElement("div");
    g.className = "rejilla";
    defs.forEach((f) => {
      let v = this._val(f.k);
      if (v === null) return;
      if (f.fecha) {
        const d = new Date(v);
        v = isNaN(d) ? v : d.toLocaleString(t.locale,
          { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      } else if (!isNaN(Number(v))) {
        v = Number(v).toLocaleString(t.locale);
      } else {
        v = traduce(v, this._lang);
      }
      g.appendChild(this._dato({
        val: v, uni: f.uni, eti: f.eti, icono: f.icono,
        entidad: (this._reloj().claves || {})[f.k],
      }));
    });
    if (!g.children.length) {
      g.className = "";
      g.innerHTML = `<div class="aviso">${t.sinDatosTodavia}</div>`;
    }
    return g;
  }

  _chipsModos() {
    const t = this._t;
    const c = document.createElement("div");
    c.className = "estados";
    c.style.marginLeft = "0";
    MODOS(t).forEach((m) => {
      const v = this._val(m.k);
      if (v === null) return;
      const on = v === "on" || v === "true";
      const s = document.createElement("span");
      s.className = "chip" + (on ? " on" : "");
      s.textContent = `${m.eti}: ${on ? t.si : t.no}`;
      c.appendChild(this._pulsable(s, (this._reloj().claves || {})[m.k]));
    });
    if (!c.children.length) c.innerHTML = `<div class="aviso">${t.sinDatosTodavia}</div>`;
    return c;
  }

  _bloqueSueno() {
    const t = this._t;
    const r = this._reloj();
    const cont = document.createElement("div");
    cont.className = "tarjetas";

    const linea = this._rejilla([
      { k: "sleep_score",  eti: t.puntuacion,   icono: "mdi:star-outline" },
      { k: "sleep_status", eti: t.estado,       icono: "mdi:sleep" },
      { k: "sleep_start_time", eti: t.seDurmio, icono: "mdi:weather-night" },
      { k: "sleep_end_time",   eti: t.seDesperto, icono: "mdi:weather-sunset-up" },
    ]);
    cont.appendChild(linea);

    if (r.claves.sleep_timeline) {
      const tc = this._tarjeta("ha-companion-sleep-card", {
        entity: r.claves.sleep_timeline,
      });
      if (tc) cont.appendChild(tc);
    }
    const fases = ["sleep_deep_minutes", "sleep_rem_minutes",
                   "sleep_light_minutes", "sleep_wake_minutes"];
    if (fases.every((k) => r.claves[k])) {
      // Claves internas fijas (no traducidas): la tarjeta de la semana las
      // usa solo como identificador interno, no como texto visible.
      const tc = this._tarjeta("ha-companion-sleep-week-card", {
        entities: {
          DEEP: r.claves.sleep_deep_minutes,
          REM: r.claves.sleep_rem_minutes,
          LIGHT: r.claves.sleep_light_minutes,
          AWAKE: r.claves.sleep_wake_minutes,
        },
        score_entity: r.claves.sleep_score,
        timeline_entity: r.claves.sleep_timeline,
        days: 7,
      });
      if (tc) cont.appendChild(tc);
    }
    return cont.children.length ? cont : null;
  }

  _bloqueDeporte() {
    const t = this._t;
    const r = this._reloj();
    const cont = document.createElement("div");
    cont.className = "tarjetas";

    cont.appendChild(this._rejilla([
      { k: "workout_count",              eti: t.entrenamientos, icono: "mdi:counter" },
      { k: "workout_training_load",      eti: t.carga,          icono: "mdi:weight" },
      { k: "workout_vo2_max",            eti: t.vo2max,         icono: "mdi:lungs" },
      { k: "workout_full_recovery_time", eti: t.recuperacion,   icono: "mdi:bed-clock", uni: "h" },
      { k: "workout_last_sport_type",    eti: t.ultimoDeporte,  icono: "mdi:run-fast" },
      { k: "workout_last_duration",      eti: t.duracion,       icono: "mdi:timer-outline", uni: "min" },
    ]));

    if (r.claves.workout_history) {
      // Sin load/vo2/recovery: ya están en la fila de datos de encima.
      const tc = this._tarjeta("ha-companion-workout-card", {
        entity: r.claves.workout_history,
        days: 7,
      });
      if (tc) cont.appendChild(tc);
    }
    return cont.children.length ? cont : null;
  }
}

if (!customElements.get("ha-companion-panel")) {
  customElements.define("ha-companion-panel", HaCompanionPanel);
}
