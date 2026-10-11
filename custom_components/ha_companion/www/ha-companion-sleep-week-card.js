/**
 * ha-companion-sleep-week-card
 *
 * Las últimas N noches, una columna por noche, apiladas por fase.
 *
 * No necesita nada nuevo de la integración: los sensores de fase llevan
 * `state_class: measurement`, así que el recorder ya les genera estadísticas
 * por su cuenta. La tarjeta se las pide por websocket
 * (`recorder/statistics_during_period`).
 *
 * Se piden por HORAS, no por días, y de cada día se coge la última lectura
 * anterior al CORTE (13:00 local). Con el máximo diario los números salían
 * inflados: el reloj sincroniza varias veces y el máximo de cada fase cae en un
 * momento distinto del día, así que sumarlos daba una noche que nunca existió
 * (9 h 23 de media cuando la noche real había sido de 8 h 0). Tomando todas las
 * fases del MISMO instante, el reparto es coherente.
 *
 * Dos trampas más que hay que esquivar con estos datos:
 *  - Un reinicio de Home Assistant recrea el sensor maestro vacío, y ese día
 *    queda registrado como 0. No es una noche sin dormir: es un hueco. Se
 *    descarta, no se pinta como cero.
 *  - Puede haber días sin ninguna estadística. Se dejan en blanco.
 *
 * config:
 *   type: custom:ha-companion-sleep-week-card
 *   prefix: sensor.mi_reloj          (opcional; de ahí compone las cuatro fases)
 *     — o bien —
 *   entities: {DEEP: sensor.x, REM: sensor.y, LIGHT: ..., AWAKE: ...}
 *     (el panel las pasa así: son claves internas fijas, no traducidas — el
 *     texto que se ve sale de T/FASE_NOMBRE según `hass.language`)
 *   score_entity: sensor.<...>_puntuacion_del_sueno   (opcional)
 *   timeline_entity: sensor.<...>_cronologia_del_sueno (opcional; sin él las
 *     columnas no son pulsables — hace falta para pedir el historial de
 *     ESTADOS, no de estadísticas, y sacar el `timeline` tal y como estaba
 *     esa noche)
 *   days: 7                               (opcional)
 *   title: Las últimas noches             (opcional)
 *
 * Pulsar una noche con datos abre un hipnograma (igual que
 * ha-companion-sleep-card, pero de ese día) vía `history/history_during_period`
 * sobre `timeline_entity`: coge el último estado de ese día anterior al mismo
 * CORTE de las 13:00 que usan las estadísticas, para ser coherente con cómo se
 * agrupó esa columna. Solo funciona mientras el historial de estados de HA no
 * haya purgado ese día (por defecto 10 días) — más corto que lo típico
 * (`days: 7`), pero no está garantizado si el usuario ha bajado la retención.
 */

const TAG = "ha-companion-sleep-week-card";

const SOPORTADOS = ["es", "en", "fr", "de", "it"];
const idioma = (hass) => {
  const l = String((hass && (hass.language || (hass.locale && hass.locale.language))) || "en").toLowerCase().slice(0, 2);
  return SOPORTADOS.includes(l) ? l : "en";
};

// --- Encontrar los relojes sin depender del idioma -------------------------
// El entity_id se genera a partir del nombre traducido, así que cambia con el
// idioma de la instalación: buscar por texto ("_peso", "_recent_workouts") solo
// acierta en el idioma en el que se escribió la tarjeta. Lo estable es la clave
// del `unique_id` del registro (`<ULID>_<clave>`), que es justo lo que mira el
// panel. Va duplicado en cada tarjeta a propósito: así ninguna depende de que
// otro fichero se haya cargado antes.
const ULID = 26;
async function relojesDeHA(hass) {
  let ents, devs;
  try {
    [ents, devs] = await Promise.all([
      hass.callWS({ type: "config/entity_registry/list" }),
      hass.callWS({ type: "config/device_registry/list" }),
    ]);
  } catch (_) {
    return [];
  }
  const nombreDe = new Map((devs || []).map((d) => [d.id, d.name_by_user || d.name]));
  const porDisp = new Map();
  for (const e of ents || []) {
    if (e.platform !== "ha_companion" || !e.device_id || !e.unique_id) continue;
    const clave = e.unique_id.slice(ULID + 1);
    if (!clave) continue;
    if (!porDisp.has(e.device_id)) {
      porDisp.set(e.device_id, {
        device_id: e.device_id,
        nombre: nombreDe.get(e.device_id) || e.device_id,
        claves: {},
      });
    }
    porDisp.get(e.device_id).claves[clave] = e.entity_id;
  }
  // Delante, el reloj que esté dando datos: con dos relojes dados de alta, el
  // que interesa por defecto es el que se está usando.
  const vivo = (r) => {
    const id = r.claves.record_time || r.claves.battery;
    const st = id && hass.states[id];
    return !!st && st.state !== "unavailable" && st.state !== "unknown";
  };
  const todos = [...porDisp.values()];
  return todos.filter(vivo).concat(todos.filter((r) => !vivo(r)));
}

// Mismo lenguaje de color que ha-companion-sleep-card: se leen juntas.
// En el ORDEN EN QUE SE VEN, de arriba abajo: despierto, ligero, profundo, REM
// — de peor a mejor calidad de sueño, el mismo criterio que la leyenda de la
// tarjeta de la noche y del hipnograma. Un usuario avisó de que aquí no
// coincidía: la barra se pintaba con `column-reverse`, así que el array iba al
// revés de lo que se veía y era imposible de seguir. Ahora el array ES el orden
// visual y la barra se pinta en `column`; si se cambia una cosa hay que cambiar
// la otra.
const FASES = [
  { sufijo: "_tiempo_despierto", clave: "AWAKE", color: "#F0A030" },
  { sufijo: "_sueno_ligero",   clave: "LIGHT", color: "#5B8DEF" },
  { sufijo: "_sueno_profundo", clave: "DEEP", color: "#3D5AAF" },
  { sufijo: "_sueno_rem",      clave: "REM",  color: "#A78BFA" },
];
const FASE_NOMBRE = {
  es: { DEEP: "Profundo", REM: "REM", LIGHT: "Ligero", AWAKE: "Despierto" },
  en: { DEEP: "Deep", REM: "REM", LIGHT: "Light", AWAKE: "Awake" },
  fr: { DEEP: "Profond", REM: "REM", LIGHT: "Léger", AWAKE: "Éveillé" },
  de: { DEEP: "Tief", REM: "REM", LIGHT: "Leicht", AWAKE: "Wach" },
  it: { DEEP: "Profondo", REM: "REM", LIGHT: "Leggero", AWAKE: "Sveglio" },
};
const FASE_COLOR = { AWAKE: "#F0A030", REM: "#A78BFA", LIGHT: "#5B8DEF", DEEP: "#3D5AAF" };
const FASE_ORDEN = ["AWAKE", "LIGHT", "DEEP", "REM"];
const COLOR_OTRO = "#64748B";

// Respaldo por si el historial trae un timeline sin `stage` (sensor viejo):
// mismo texto que SLEEP_PHASE_LABELS, ver ha-companion-sleep-card.js.
const FASE_CANON = {
  Despierto: "AWAKE", Awake: "AWAKE", Éveillé: "AWAKE", Wach: "AWAKE", Sveglio: "AWAKE",
  REM: "REM",
  "Sueño Ligero": "LIGHT", "Light Sleep": "LIGHT", "Sommeil léger": "LIGHT",
  "Leichter Schlaf": "LIGHT", "Sonno leggero": "LIGHT",
  "Sueño Profundo": "DEEP", "Deep Sleep": "DEEP", "Sommeil profond": "DEEP",
  "Tiefschlaf": "DEEP", "Sonno profondo": "DEEP",
};
const STAGE_CANON = { WAKE_STAGE: "AWAKE", REM_STAGE: "REM", LIGHT_STAGE: "LIGHT", DEEP_STAGE: "DEEP" };
// El historial de ESTADOS (a diferencia del sensor en vivo) guarda lo que la
// integración escribía EN CADA MOMENTO, y `timeline.phase` ha tenido tres
// formas a lo largo del tiempo: la clave cruda del reloj sin traducir
// ("LIGHT_STAGE", de antes de que existiera _phase_label), el texto ya
// traducido ("Sueño Ligero"/"Light Sleep"...) y, con `stage` añadido, las dos
// cosas a la vez. Verificado con historial real: sin este tercer intento
// (STAGE_CANON[x.phase]), un tramo "WAKE_STAGE" crudo en `phase` no matcheaba
// nada y se contaba como dormido.
const canonizar = (x) =>
  (x.stage && STAGE_CANON[x.stage]) || FASE_CANON[x.phase] || STAGE_CANON[x.phase] || x.phase;

const hhmm = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
};
const aMinutos = (txt) => {
  if (typeof txt !== "string") return null;
  const p = txt.match(/^(\d{1,2}):(\d{2})/);
  return p ? Number(p[1]) * 60 + Number(p[2]) : null;
};

const DIAS = {
  es: ["D", "L", "M", "X", "J", "V", "S"],
  en: ["S", "M", "T", "W", "T", "F", "S"],
  fr: ["D", "L", "M", "M", "J", "V", "S"],
  de: ["S", "M", "D", "M", "D", "F", "S"],
  it: ["D", "L", "M", "M", "G", "V", "S"],
};

const T = {
  es: {
    faltaConfig: "Falta `prefix` (o `entities`), por ejemplo sensor.mi_reloj",
    error: "No se pudieron leer las estadísticas.",
    leyendo: "Leyendo las últimas noches…",
    sinNoches: "Todavía no hay noches guardadas. Se irá llenando cada mañana.",
    deMedia: "de media",
    noche: (n) => (n === 1 ? "noche" : "noches"),
    de: "de",
    sinDatosNoche: "Sin datos de esa noche",
    alDia: "al día de media",
    nota: "Las noches en blanco no tienen estadística guardada; un reinicio de Home Assistant deja ese hueco.",
    cargandoNoche: "Cargando esa noche…",
    errorNoche: "No se pudo leer el historial de esa noche.",
    sinDatosModal: "No hay detalle guardado de esa noche (puede que el historial ya lo haya purgado).",
    enCama: "en cama",
    puntos: "puntos",
    cerrar: "Cerrar",
  },
  en: {
    faltaConfig: "Missing `prefix` (or `entities`), e.g. sensor.mi_reloj",
    error: "Couldn't read the statistics.",
    leyendo: "Loading recent nights…",
    sinNoches: "No nights saved yet. It will fill in every morning.",
    deMedia: "average",
    noche: (n) => (n === 1 ? "night" : "nights"),
    de: "of",
    sinDatosNoche: "No data for that night",
    alDia: "average",
    nota: "Blank nights have no saved statistic; a Home Assistant restart leaves that gap.",
    cargandoNoche: "Loading that night…",
    errorNoche: "Couldn't read that night's history.",
    sinDatosModal: "No saved detail for that night (history may have purged it already).",
    enCama: "in bed",
    puntos: "points",
    cerrar: "Close",
  },
  fr: {
    faltaConfig: "`prefix` (ou `entities`) manquant, ex. sensor.mi_reloj",
    error: "Impossible de lire les statistiques.",
    leyendo: "Chargement des dernières nuits…",
    sinNoches: "Aucune nuit enregistrée pour le moment. Ça se remplira chaque matin.",
    deMedia: "en moyenne",
    noche: (n) => (n === 1 ? "nuit" : "nuits"),
    de: "sur",
    sinDatosNoche: "Pas de données pour cette nuit",
    alDia: "en moyenne",
    nota: "Les nuits vides n'ont pas de statistique enregistrée ; un redémarrage de Home Assistant laisse ce vide.",
    cargandoNoche: "Chargement de cette nuit…",
    errorNoche: "Impossible de lire l'historique de cette nuit.",
    sinDatosModal: "Aucun détail enregistré pour cette nuit (l'historique l'a peut-être déjà purgé).",
    enCama: "au lit",
    puntos: "points",
    cerrar: "Fermer",
  },
  de: {
    faltaConfig: "`prefix` (oder `entities`) fehlt, z. B. sensor.mi_reloj",
    error: "Die Statistiken konnten nicht gelesen werden.",
    leyendo: "Letzte Nächte werden geladen…",
    sinNoches: "Noch keine Nächte gespeichert. Füllt sich jeden Morgen.",
    deMedia: "im Durchschnitt",
    noche: (n) => (n === 1 ? "Nacht" : "Nächte"),
    de: "von",
    sinDatosNoche: "Keine Daten für diese Nacht",
    alDia: "im Durchschnitt",
    nota: "Leere Nächte haben keine gespeicherte Statistik; ein Neustart von Home Assistant hinterlässt diese Lücke.",
    cargandoNoche: "Diese Nacht wird geladen…",
    errorNoche: "Der Verlauf dieser Nacht konnte nicht gelesen werden.",
    sinDatosModal: "Kein gespeichertes Detail für diese Nacht (der Verlauf hat es möglicherweise schon gelöscht).",
    enCama: "im Bett",
    puntos: "Punkte",
    cerrar: "Schließen",
  },
  it: {
    faltaConfig: "`prefix` (o `entities`) mancante, es. sensor.mi_reloj",
    error: "Impossibile leggere le statistiche.",
    leyendo: "Caricamento delle ultime notti…",
    sinNoches: "Ancora nessuna notte salvata. Si riempirà ogni mattina.",
    deMedia: "in media",
    noche: (n) => (n === 1 ? "notte" : "notti"),
    de: "su",
    sinDatosNoche: "Nessun dato per quella notte",
    alDia: "in media",
    nota: "Le notti vuote non hanno statistiche salvate; un riavvio di Home Assistant lascia quel vuoto.",
    cargandoNoche: "Caricamento di quella notte…",
    errorNoche: "Impossibile leggere la cronologia di quella notte.",
    sinDatosModal: "Nessun dettaglio salvato per quella notte (la cronologia potrebbe averlo già eliminato).",
    enCama: "a letto",
    puntos: "punti",
    cerrar: "Chiudi",
  },
};

const ESTILOS = `
  :host { display: block; }
  ha-card { padding: 16px; }

  .cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .media { font-size: 30px; font-weight: 500; line-height: 1.1;
           color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .sub { color: var(--secondary-text-color); font-size: 14px; }

  .grafica { display: flex; align-items: flex-end; gap: 8px; height: 170px;
             margin: 18px 0 0; }
  .col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end;
         height: 100%; gap: 0; position: relative; }
  .col.pulsable { cursor: pointer; }
  .col.pulsable:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .pila { display: flex; flex-direction: column; border-radius: 4px;
          overflow: hidden; transition: filter .12s; }
  .pila:hover { filter: brightness(1.3); }
  .trozo { width: 100%; }
  .hueco { border: 1px dashed var(--divider-color); border-radius: 4px; height: 26px;
           opacity: .6; }

  .pies { display: flex; gap: 8px; margin-top: 7px; }
  .pie { flex: 1; text-align: center; font-size: 11px;
         color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .pie b { display: block; font-size: 12px; color: var(--primary-text-color);
           font-weight: 500; }
  .pie.sin { opacity: .4; }

  .leyenda { display: flex; gap: 13px; flex-wrap: wrap; margin-top: 15px;
             padding-top: 13px; border-top: 1px solid var(--divider-color);
             font-size: 12px; color: var(--secondary-text-color); }
  .leyenda i { display: inline-block; width: 8px; height: 8px; border-radius: 2px;
               margin-right: 5px; vertical-align: middle; }

  .nota { margin-top: 10px; font-size: 11px; color: var(--secondary-text-color);
          opacity: .8; }
  .vacio { color: var(--secondary-text-color); font-size: 14px; }
  .error { color: var(--error-color, #db4437); font-size: 14px; }

  /* ---- modal de una noche --------------------------------------------- */
  /* z-index explícito en el propio host, no solo en .fondo: si algún día una
     tarjeta vecina lleva su propio z-index, esto no depende del orden en el
     DOM para quedar por encima. */
  .modal-host { position: relative; z-index: 1000; }
  .fondo { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.5);
           display: flex; align-items: center; justify-content: center; padding: 16px; }
  .caja { background: var(--card-background-color); border-radius: 12px; padding: 20px;
          max-width: 480px; width: 100%; max-height: 85vh; overflow: auto;
          box-shadow: var(--ha-card-box-shadow, 0 4px 20px rgba(0,0,0,.3)); outline: none; }
  .caja-cab { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .caja-titulo { font-size: 15px; font-weight: 500; color: var(--primary-text-color); flex: 1; }
  .cerrar-btn { background: none; border: none; cursor: pointer; padding: 4px;
                color: var(--secondary-text-color); border-radius: 50%;
                display: flex; align-items: center; justify-content: center; }
  .cerrar-btn:hover { background: var(--secondary-background-color); }
  .m-cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 10px 0 16px; }
  .m-total { font-size: 26px; font-weight: 500; line-height: 1.1;
             color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .m-rango { color: var(--secondary-text-color); font-size: 13px; font-variant-numeric: tabular-nums; }
  .m-marca { margin-left: auto; display: flex; align-items: center; gap: 6px;
             color: var(--secondary-text-color); font-size: 13px; }
  .m-marca b { font-size: 17px; font-weight: 500; color: var(--primary-text-color);
               font-variant-numeric: tabular-nums; }
  .m-grafica { display: grid; grid-template-columns: auto 1fr; gap: 0 10px; margin: 12px 0 4px; }
  .m-etiquetas { display: grid; }
  .m-etiquetas span { display: flex; align-items: center; font-size: 11px;
                      color: var(--secondary-text-color); white-space: nowrap; }
  .m-lienzo { position: relative; }
  .m-carril { position: absolute; left: 0; right: 0; border-radius: 3px;
              background: var(--divider-color); opacity: .35; }
  .m-tramo { position: absolute; border-radius: 3px; }
  .m-eje { grid-column: 2; position: relative; height: 14px; margin-top: 6px;
           font-size: 11px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .m-eje span { position: absolute; transform: translateX(-50%); }
  .m-leyenda { display: grid; gap: 6px; margin-top: 14px; }
  .m-fila { display: flex; align-items: center; gap: 9px; }
  .m-punto { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .m-nombre { width: 80px; font-size: 12px; color: var(--primary-text-color); }
  .m-cifra { flex: none; font-size: 12px; color: var(--secondary-text-color);
             font-variant-numeric: tabular-nums; }
`;

const dur = (min) => {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60}` : `${m} m`;
};

class HaCompanionSleepWeekCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement(TAG + "-editor");
  }

  static async getStubConfig(hass) {
    const relojes = await relojesDeHA(hass);
    const r = relojes.find((x) => x.claves.sleep_deep_minutes) || {};
    return {
      type: "custom:" + TAG,
      entities: {
        DEEP: r.claves.sleep_deep_minutes,
        REM: r.claves.sleep_rem_minutes,
        LIGHT: r.claves.sleep_light_minutes,
        AWAKE: r.claves.sleep_wake_minutes,
      },
      score_entity: r.claves.sleep_score,
    };
  }

  setConfig(config) {
    // Antes esto exigía un `prefix` y, si no se ponía, el selector metía
    // "sensor.mi_reloj" — el reloj del autor. Ahora, sin configuración,
    // la tarjeta busca sola las cuatro fases del reloj activo: los sufijos
    // "_sueno_profundo" y compañía solo existen en instalaciones en español.
    this._config = config || {};
    this._noches = null;
    this._pedido = 0;
    this._buscando = false;
    this._modalNoche = null;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML =
        `<style>${ESTILOS}</style><ha-card></ha-card><div class="modal-host"></div>`;
    }
    this._card = this.shadowRoot.querySelector("ha-card");
    this._modalHost = this.shadowRoot.querySelector(".modal-host");
    if (this._hass) this._quizasPedir(true);
  }

  set hass(hass) {
    const primera = !this._hass;
    const cambioIdioma = this._hass && idioma(this._hass) !== idioma(hass);
    this._hass = hass;
    if (!this._config.prefix && !this._config.entities) { this._buscar(); return; }
    this._quizasPedir(primera || cambioIdioma);
  }

  /** Sin prefijo ni entidades: se buscan las fases del reloj activo. */
  async _buscar() {
    if (this._buscando) return;
    this._buscando = true;
    const relojes = await relojesDeHA(this._hass);
    const r = relojes.find((x) => x.claves.sleep_deep_minutes);
    if (r) {
      this._config = {
        score_entity: r.claves.sleep_score,
        ...this._config,                 // lo que el usuario puso manda
        entities: {
          DEEP: r.claves.sleep_deep_minutes,
          REM: r.claves.sleep_rem_minutes,
          LIGHT: r.claves.sleep_light_minutes,
          AWAKE: r.claves.sleep_wake_minutes,
        },
      };
    }
    this._buscando = false;
    if (this._config.entities) {
      this._quizasPedir(true);
    } else if (this._card) {
      // Ni configuración ni reloj con fases de sueño: se dice qué falta en vez
      // de dejar la tarjeta en blanco.
      this._card.innerHTML = `<div class="vacio">${T[idioma(this._hass)].faltaConfig}</div>`;
    }
  }

  getCardSize() { return 6; }

  /** [{clave, color, id}] — desde `entities` si viene, si no desde `prefix`. */
  _fases() {
    return FASES.map((f) => ({
      clave: f.clave,
      color: f.color,
      id: (this._config.entities && this._config.entities[f.clave]) ||
          (this._config.prefix ? this._config.prefix + f.sufijo : null),
    })).filter((f) => f.id);
  }

  /** Las estadísticas cambian una vez al día: pedirlas en cada `hass` sería
   *  una consulta por cada cambio de estado de la casa entera. */
  _quizasPedir(forzar) {
    const ahora = Date.now();
    if (!forzar && ahora - this._pedido < 15 * 60 * 1000) return;
    this._pedido = ahora;
    this._pedirEstadisticas();
  }

  async _pedirEstadisticas() {
    const dias = Math.max(2, Number(this._config.days) || 7);
    const fases = this._fases();
    const ids = fases.map((f) => f.id);
    if (this._config.score_entity) ids.push(this._config.score_entity);

    const fin = new Date();
    const ini = new Date(fin.getTime() - (dias + 1) * 86400000);

    let res;
    try {
      res = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: ini.toISOString(),
        end_time: fin.toISOString(),
        statistic_ids: ids,
        period: "hour",
        types: ["max"],
      });
    } catch (e) {
      this._noches = "error";
      this._render();
      return;
    }

    // De cada día nos quedamos con la última lectura ANTERIOR AL CORTE, y la
    // misma hora para todas las fases: así el reparto es de un instante real.
    const CORTE = 13;
    const porDia = new Map();
    const ultima = new Map();   // clave `${dia}|${id}` -> {hora, valor}

    for (const [id, filas] of Object.entries(res || {})) {
      for (const fila of filas) {
        const t = new Date(fila.start);
        if (t.getHours() >= CORTE) continue;
        if (fila.max == null) continue;
        const d = new Date(t); d.setHours(0, 0, 0, 0);
        const k = `${d.getTime()}|${id}`;
        const prev = ultima.get(k);
        if (!prev || t.getHours() >= prev.hora) {
          ultima.set(k, { hora: t.getHours(), valor: fila.max, dia: d.getTime() });
        }
      }
    }

    for (const [k, x] of ultima) {
      const id = k.split("|")[1];
      if (!porDia.has(x.dia)) {
        porDia.set(x.dia, { fecha: new Date(x.dia), fases: {}, score: null });
      }
      if (id === this._config.score_entity) {
        porDia.get(x.dia).score = Math.round(x.valor);
      } else {
        const f = fases.find((y) => y.id === id);
        if (f) porDia.get(x.dia).fases[f.clave] = x.valor;
      }
    }
    this._noches = porDia;
    this._render();
  }

  _render() {
    const lang = idioma(this._hass);
    const t = T[lang];
    const nombreDe = FASE_NOMBRE[lang];
    const dias7 = DIAS[lang];
    const c = this._card;
    c.innerHTML = "";
    if (this._config.title) c.setAttribute("header", this._config.title);

    if (this._noches === "error") {
      c.innerHTML = `<div class="error">${t.error}</div>`;
      return;
    }
    if (!this._noches) {
      c.innerHTML = `<div class="vacio">${t.leyendo}</div>`;
      return;
    }

    const dias = Math.max(2, Number(this._config.days) || 7);
    const listaFases = this._fases();
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    const cols = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoy); d.setDate(d.getDate() - i);
      const n = this._noches.get(d.getTime());
      const fases = (n && n.fases) || {};
      const total = listaFases.reduce((a, f) => a + (fases[f.clave] || 0), 0);
      // Un reinicio deja el día a 0: eso es un hueco, no una noche en vela.
      cols.push({ fecha: d, fases, total, score: n ? n.score : null, hay: total > 0 });
    }

    const conDatos = cols.filter((x) => x.hay);
    if (!conDatos.length) {
      c.innerHTML = `<div class="vacio">${t.sinNoches}</div>`;
      return;
    }

    const media = conDatos.reduce((a, x) => a + x.total, 0) / conDatos.length;
    const tope = Math.max(...conDatos.map((x) => x.total));

    // ---- cabecera -------------------------------------------------------
    const cab = document.createElement("div");
    cab.className = "cab";
    cab.innerHTML =
      `<span class="media">${dur(media)}</span>` +
      `<span class="sub">${t.deMedia} · ${conDatos.length} ` +
      `${t.noche(conDatos.length)} ${t.de} ${dias}</span>`;
    c.appendChild(cab);

    // ---- columnas -------------------------------------------------------
    const g = document.createElement("div");
    g.className = "grafica";
    cols.forEach((x) => {
      const col = document.createElement("div");
      col.className = "col";
      if (!x.hay) {
        const h = document.createElement("div");
        h.className = "hueco";
        h.title = t.sinDatosNoche;
        col.appendChild(h);
      } else {
        const pila = document.createElement("div");
        pila.className = "pila";
        pila.style.height = `${(x.total / tope) * 100}%`;
        pila.title = listaFases.filter((f) => x.fases[f.clave])
          .map((f) => `${nombreDe[f.clave]} ${Math.round(x.fases[f.clave])} min`)
          .join(" · ");
        listaFases.forEach((f) => {
          const v = x.fases[f.clave];
          if (!v) return;
          const t2 = document.createElement("div");
          t2.className = "trozo";
          t2.style.height = `${(v / x.total) * 100}%`;
          t2.style.background = f.color;
          pila.appendChild(t2);
        });
        col.appendChild(pila);
        // Pulsable solo si hay datos y la tarjeta sabe de qué entidad pedir el
        // historial. Sin `timeline_entity` la columna sigue mostrando el
        // reparto, simplemente no abre nada al tocarla.
        if (this._config.timeline_entity) {
          col.classList.add("pulsable");
          col.setAttribute("role", "button");
          col.setAttribute("tabindex", "0");
          col.addEventListener("click", () => this._abrirNoche(x.fecha));
          col.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._abrirNoche(x.fecha); }
          });
        }
      }
      g.appendChild(col);
    });
    c.appendChild(g);

    // ---- pies de columna ------------------------------------------------
    const pies = document.createElement("div");
    pies.className = "pies";
    cols.forEach((x) => {
      const p = document.createElement("div");
      p.className = "pie" + (x.hay ? "" : " sin");
      p.innerHTML = `<b>${dias7[x.fecha.getDay()]}</b>` +
                    (x.hay ? dur(x.total) : "—") +
                    (x.hay && x.score ? `<br>${x.score}` : "");
      pies.appendChild(p);
    });
    c.appendChild(pies);

    // ---- leyenda --------------------------------------------------------
    const ley = document.createElement("div");
    ley.className = "leyenda";
    listaFases.forEach((f) => {
      const min = conDatos.reduce((a, x) => a + (x.fases[f.clave] || 0), 0);
      if (!min) return;
      const s = document.createElement("span");
      s.innerHTML = `<i style="background:${f.color}"></i>${nombreDe[f.clave]} · ` +
                    `${Math.round(min / conDatos.length)} min ${t.alDia}`;
      ley.appendChild(s);
    });
    c.appendChild(ley);

    if (conDatos.length < dias) {
      const n = document.createElement("div");
      n.className = "nota";
      n.textContent = t.nota;
      c.appendChild(n);
    }
  }

  // ============================================================
  // MODAL DE UNA NOCHE (hipnograma al pulsar una columna)
  // ============================================================

  /** `dia` es la misma fecha (a medianoche local) usada como clave de la
   *  columna. Pide el ESTADO (no la estadística) de `timeline_entity` en ese
   *  día, con el mismo corte de las 13:00 que agrupó la columna, para que el
   *  hipnograma corresponda exactamente a lo que se ve en la barra. */
  async _abrirNoche(dia) {
    if (!this._config.timeline_entity) return;
    this._modalNoche = { estado: "cargando", fecha: dia };
    this._pintarModal();

    const CORTE = 13;
    const desde = new Date(dia);
    const hasta = new Date(dia.getTime() + 37 * 3600000);   // cubre hasta ~13:00 del día siguiente
    let hist;
    try {
      const res = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: desde.toISOString(),
        end_time: hasta.toISOString(),
        entity_ids: [this._config.timeline_entity],
        minimal_response: false,
        no_attributes: false,
      });
      hist = (res && res[this._config.timeline_entity]) || [];
    } catch (e) {
      this._modalNoche = { estado: "error", fecha: dia };
      this._pintarModal();
      return;
    }

    let elegido = null, elegidoTs = null;
    for (const st of hist) {
      // El WS de historial devuelve el formato COMPRIMIDO (a/s/lu con `lu` en
      // segundos), no el verboso (attributes/state/last_changed) de la API
      // REST -- verificado contra la instancia real, donde `st.attributes`
      // no existe nunca y todo se descartaba en silencio. Se soportan los dos
      // por si acaso, comprimido primero.
      const attrs = st.a || st.attributes;
      const epoch = st.lu ?? st.lc;
      const ts = epoch != null ? new Date(epoch * 1000) : new Date(st.last_changed || st.last_updated);
      // Descarta estados sin `timeline` utilizable -- no solo "unavailable" por
      // nombre: verificado en real que un reinicio de HA dejaba el estado sin
      // atributos aunque el `state` en sí no fuera "unavailable".
      if (!attrs || !Array.isArray(attrs.timeline) || !attrs.timeline.length) continue;
      if (isNaN(ts) || ts.getHours() >= CORTE) continue;
      const d2 = new Date(ts); d2.setHours(0, 0, 0, 0);
      if (d2.getTime() !== dia.getTime()) continue;
      if (!elegidoTs || ts > elegidoTs) { elegido = attrs; elegidoTs = ts; }
    }

    const timeline = elegido && elegido.timeline;
    if (!Array.isArray(timeline) || !timeline.length) {
      this._modalNoche = { estado: "vacio", fecha: dia };
      this._pintarModal();
      return;
    }
    this._modalNoche = { estado: "ok", fecha: dia, timeline };
    this._pintarModal();
  }

  _cerrarModal() {
    this._modalNoche = null;
    this._pintarModal();
  }

  _pintarModal() {
    const host = this._modalHost;
    if (!this._modalNoche) { host.innerHTML = ""; return; }
    const lang = idioma(this._hass);
    const t = T[lang];

    const fondo = document.createElement("div");
    fondo.className = "fondo";
    fondo.addEventListener("click", (e) => { if (e.target === fondo) this._cerrarModal(); });
    // Además del Escape a nivel de window (por si el foco se queda fuera del
    // shadow DOM), uno en el propio fondo: con el foco ya dentro del modal
    // (ver _pintarModal más abajo) este es el que responde de verdad.
    fondo.addEventListener("keydown", (e) => { if (e.key === "Escape") this._cerrarModal(); });

    const caja = document.createElement("div");
    caja.className = "caja";
    caja.setAttribute("tabindex", "-1");
    fondo.appendChild(caja);

    const fechaTxt = this._modalNoche.fecha.toLocaleDateString(
      lang === "es" ? "es-ES" : lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : lang === "it" ? "it-IT" : "en-US",
      { weekday: "long", day: "numeric", month: "long" }
    );
    const cab = document.createElement("div");
    cab.className = "caja-cab";
    cab.innerHTML = `<div class="caja-titulo">${fechaTxt}</div>`;
    const btnCerrar = document.createElement("button");
    btnCerrar.className = "cerrar-btn";
    btnCerrar.setAttribute("aria-label", t.cerrar);
    btnCerrar.innerHTML = `<ha-icon icon="mdi:close"></ha-icon>`;
    btnCerrar.addEventListener("click", () => this._cerrarModal());
    cab.appendChild(btnCerrar);
    caja.appendChild(cab);

    if (this._modalNoche.estado === "cargando") {
      const p = document.createElement("div"); p.className = "vacio"; p.textContent = t.cargandoNoche;
      caja.appendChild(p);
    } else if (this._modalNoche.estado === "error") {
      const p = document.createElement("div"); p.className = "error"; p.textContent = t.errorNoche;
      caja.appendChild(p);
    } else if (this._modalNoche.estado === "vacio") {
      const p = document.createElement("div"); p.className = "vacio"; p.textContent = t.sinDatosModal;
      caja.appendChild(p);
    } else {
      this._pintarHipnograma(caja, this._modalNoche.timeline, lang, t);
    }

    host.innerHTML = "";
    host.appendChild(fondo);
    // El foco tiene que entrar en el modal para que el teclado (Escape,
    // tabulación) funcione de verdad; sin esto el foco se queda en la
    // columna que se pulsó, fuera del propio diálogo.
    caja.focus();

    if (!this._escHandler) {
      this._escHandler = (e) => { if (e.key === "Escape" && this._modalNoche) this._cerrarModal(); };
      window.addEventListener("keydown", this._escHandler);
    }
  }

  /** Mismo dibujo que ha-companion-sleep-card, adaptado al tamaño del modal. */
  _pintarHipnograma(caja, timeline, lang, t) {
    const FASE_CORTO = {
      es: { AWAKE: "Despierto", REM: "REM", LIGHT: "Ligero", DEEP: "Profundo" },
      en: { AWAKE: "Awake", REM: "REM", LIGHT: "Light", DEEP: "Deep" },
      fr: { AWAKE: "Éveillé", REM: "REM", LIGHT: "Léger", DEEP: "Profond" },
      de: { AWAKE: "Wach", REM: "REM", LIGHT: "Leicht", DEEP: "Tief" },
      it: { AWAKE: "Sveglio", REM: "REM", LIGHT: "Leggero", DEEP: "Profondo" },
    }[lang];

    const tramos = timeline
      .map((x) => ({
        fase: canonizar(x),
        min: Number(x.duration_min) || 0,
        start: x.start, stop: x.stop,
      }))
      .filter((x) => x.min > 0);
    if (!tramos.length) {
      const p = document.createElement("div"); p.className = "vacio"; p.textContent = t.sinDatosModal;
      caja.appendChild(p);
      return;
    }

    const total = tramos.reduce((a, x) => a + x.min, 0);
    const dormido = tramos.filter((x) => x.fase !== "AWAKE").reduce((a, x) => a + x.min, 0);
    const inicio = aMinutos(tramos[0].start) ?? 0;

    const mCab = document.createElement("div");
    mCab.className = "m-cab";
    mCab.innerHTML =
      `<span class="m-total">${dur(dormido)}</span>` +
      `<span class="m-rango">${tramos[0].start} → ${tramos[tramos.length - 1].stop} · ${dur(total)} ${t.enCama}</span>`;
    caja.appendChild(mCab);

    const presentes = FASE_ORDEN.filter((f) => tramos.some((x) => x.fase === f));
    const otras = [...new Set(tramos.map((x) => x.fase))].filter((f) => !FASE_ORDEN.includes(f));
    const niveles = [
      ...presentes.map((f) => ({ clave: f, color: FASE_COLOR[f], corto: FASE_CORTO[f] })),
      ...otras.map((f) => ({ clave: f, color: COLOR_OTRO, corto: f })),
    ];

    const ALTO_FILA = 18, HUECO = 5;
    const alto = niveles.length * ALTO_FILA + (niveles.length - 1) * HUECO;

    const graf = document.createElement("div");
    graf.className = "m-grafica";
    const etiq = document.createElement("div");
    etiq.className = "m-etiquetas";
    etiq.style.gridTemplateRows = `repeat(${niveles.length}, ${ALTO_FILA}px)`;
    etiq.style.rowGap = `${HUECO}px`;
    niveles.forEach((n) => {
      const s = document.createElement("span"); s.textContent = n.corto; etiq.appendChild(s);
    });

    const lienzo = document.createElement("div");
    lienzo.className = "m-lienzo";
    lienzo.style.height = `${alto}px`;
    niveles.forEach((_, i) => {
      const carril = document.createElement("div");
      carril.className = "m-carril";
      carril.style.top = `${i * (ALTO_FILA + HUECO)}px`;
      carril.style.height = `${ALTO_FILA}px`;
      lienzo.appendChild(carril);
    });

    let acumulado = 0;
    tramos.forEach((x) => {
      const fila = niveles.findIndex((n) => n.clave === x.fase);
      const color = (niveles[fila] || {}).color || COLOR_OTRO;
      const d = document.createElement("div");
      d.className = "m-tramo";
      d.style.left = `${(acumulado / total) * 100}%`;
      d.style.width = `${Math.max((x.min / total) * 100, 0.4)}%`;
      d.style.top = `${Math.max(fila, 0) * (ALTO_FILA + HUECO)}px`;
      d.style.height = `${ALTO_FILA}px`;
      d.style.background = color;
      d.title = `${(niveles[fila] || {}).corto || x.fase} · ${x.start}–${x.stop} · ${x.min} min`;
      lienzo.appendChild(d);
      acumulado += x.min;
    });
    graf.appendChild(etiq);
    graf.appendChild(lienzo);

    const eje = document.createElement("div");
    eje.className = "m-eje";
    const salto = Math.max(1, Math.ceil(total / 60 / 6));
    const primera = Math.ceil(inicio / 60) * 60;
    for (let m = primera; m < inicio + total; m += 60 * salto) {
      const s = document.createElement("span");
      s.textContent = hhmm(m);
      s.style.left = `${((m - inicio) / total) * 100}%`;
      eje.appendChild(s);
    }
    if (eje.children.length) graf.appendChild(eje);
    caja.appendChild(graf);

    const ley = document.createElement("div");
    ley.className = "m-leyenda";
    niveles.forEach((n) => {
      const min = tramos.filter((x) => x.fase === n.clave).reduce((a, x) => a + x.min, 0);
      if (!min) return;
      const pct = Math.round((min / total) * 100);
      const fila = document.createElement("div");
      fila.className = "m-fila";
      fila.innerHTML =
        `<span class="m-punto" style="background:${n.color}"></span>` +
        `<span class="m-nombre">${n.corto}</span>` +
        `<span class="m-cifra">${dur(min)} · ${pct}%</span>`;
      ley.appendChild(fila);
    });
    caja.appendChild(ley);
  }
}

// --- Editor visual ---------------------------------------------------------
// Sin esto, añadir la tarjeta desde la interfaz dejaba al usuario delante de un
// YAML y teniéndose que saber el entity_id. Aquí se elige el reloj de una lista
// y la tarjeta se configura sola. HTML corriente a propósito: los componentes
// internos del frontend (ha-select, ha-form) cambian entre versiones de HA.
const EDT = {
  es: { reloj: "Reloj", auto: "El que esté dando datos", dias: "Días", sinRelojes: "No he encontrado ningún reloj de HA Companion." },
  en: { reloj: "Watch", auto: "Whichever is reporting", dias: "Days", sinRelojes: "No HA Companion watch found." },
  fr: { reloj: "Montre", auto: "Celle qui envoie des données", dias: "Jours", sinRelojes: "Aucune montre HA Companion trouvée." },
  de: { reloj: "Uhr", auto: "Die gerade Daten sendet", dias: "Tage", sinRelojes: "Keine HA-Companion-Uhr gefunden." },
  it: { reloj: "Orologio", auto: "Quello che sta inviando dati", dias: "Giorni", sinRelojes: "Nessun orologio HA Companion trovato." },
};

const ESTILOS_ED = `
  .fila { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
  label { font-size: 12px; color: var(--secondary-text-color); }
  select, input { font: inherit; padding: 8px; border-radius: 6px;
                  border: 1px solid var(--divider-color);
                  background: var(--card-background-color); color: var(--primary-text-color); }
  .aviso { color: var(--secondary-text-color); font-size: 13px; }
`;

class EditorBase extends HTMLElement {
  setConfig(config) {
    this._config = { ...(config || {}) };
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<style>${ESTILOS_ED}</style><div class="cuerpo"></div>`;
    }
    this._pinta();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._relojes === undefined) {
      this._relojes = null;                       // null = pidiendo
      relojesDeHA(hass).then((r) => { this._relojes = r; this._pinta(); });
    }
  }

  _emitir(cambios) {
    this._config = { ...this._config, ...cambios };
    Object.keys(this._config).forEach((k) => {
      if (this._config[k] === undefined) delete this._config[k];
    });
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: this._config }, bubbles: true, composed: true,
    }));
    this._pinta();
  }

  _fila(cuerpo, etiqueta, control) {
    const d = document.createElement("div");
    d.className = "fila";
    const l = document.createElement("label");
    l.textContent = etiqueta;
    d.append(l, control);
    cuerpo.appendChild(d);
  }

  /** Desplegable de relojes. `clave` es la que debe tener el reloj para valer;
   *  `alElegir(reloj|null)` devuelve los cambios de configuración. */
  _selectorDeReloj(cuerpo, t, clave, seleccionado, alElegir) {
    const sel = document.createElement("select");
    const relojes = (this._relojes || []).filter((r) => r.claves[clave]);
    const op0 = document.createElement("option");
    op0.value = ""; op0.textContent = t.auto;
    if (!seleccionado) op0.selected = true;
    sel.appendChild(op0);
    relojes.forEach((r) => {
      const op = document.createElement("option");
      op.value = r.device_id; op.textContent = r.nombre;
      if (seleccionado === r.device_id) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener("change", () => {
      const r = relojes.find((x) => x.device_id === sel.value) || null;
      this._emitir(alElegir(r));
    });
    this._fila(cuerpo, t.reloj, sel);
    if (this._relojes && !relojes.length) {
      const a = document.createElement("div");
      a.className = "aviso";
      a.textContent = t.sinRelojes;
      cuerpo.appendChild(a);
    }
  }

  _campoDias(cuerpo, t, porDefecto) {
    const inp = document.createElement("input");
    inp.type = "number"; inp.min = "2"; inp.max = "60";
    inp.value = String(this._config.days || porDefecto);
    inp.addEventListener("change", () => this._emitir({ days: Number(inp.value) || porDefecto }));
    this._fila(cuerpo, t.dias, inp);
  }
}

class HaCompanionSleepWeekCardEditor extends EditorBase {
  _pinta() {
    if (!this.shadowRoot) return;
    const t = EDT[idioma(this._hass)];
    const cuerpo = this.shadowRoot.querySelector(".cuerpo");
    cuerpo.innerHTML = "";
    const ents = this._config.entities || {};
    const actual = (this._relojes || [])
      .find((r) => r.claves.sleep_deep_minutes === ents.DEEP);
    this._selectorDeReloj(cuerpo, t, "sleep_deep_minutes", actual && actual.device_id, (r) => ({
      // Al elegir reloj se quita el `prefix` viejo: manda la lista de entidades.
      prefix: undefined,
      entities: r ? {
        DEEP: r.claves.sleep_deep_minutes,
        REM: r.claves.sleep_rem_minutes,
        LIGHT: r.claves.sleep_light_minutes,
        AWAKE: r.claves.sleep_wake_minutes,
      } : undefined,
      score_entity: r ? r.claves.sleep_score : undefined,
      timeline_entity: r ? r.claves.sleep_timeline : undefined,
    }));
    this._campoDias(cuerpo, t, 7);
  }
}

// Nombre y descripcion del selector de tarjetas. No hay `hass` cuando se
// registra la tarjeta, asi que el idioma sale del <html lang> que pone el
// propio frontend de Home Assistant.
const FICHA = {
  "es": [
    "Sueño (semana)",
    "Las últimas noches apiladas por fase, de las estadísticas."
  ],
  "en": [
    "Sleep (week)",
    "Recent nights stacked by phase, from the recorder statistics."
  ],
  "fr": [
    "Sommeil (semaine)",
    "Les dernières nuits empilées par phase, depuis les statistiques."
  ],
  "de": [
    "Schlaf (Woche)",
    "Die letzten Nächte nach Phasen gestapelt, aus den Statistiken."
  ],
  "it": [
    "Sonno (settimana)",
    "Le ultime notti impilate per fase, dalle statistiche."
  ]
};

const definir = () => {
  const l = String(document.documentElement.lang || "en").toLowerCase().slice(0, 2);
  const lang = FICHA[l] ? l : "en";
  try {
    if (!customElements.get(TAG)) customElements.define(TAG, HaCompanionSleepWeekCard);
    if (!customElements.get(TAG + "-editor")) {
      customElements.define(TAG + "-editor", HaCompanionSleepWeekCardEditor);
    }
  } catch (_) { /* ya registrada */ }
  window.customCards = window.customCards || [];
  // El reintento tambien REESCRIBE nombre y descripcion: cuando se registra la
  // tarjeta, el frontend puede no haber puesto aun el idioma en <html>, asi que
  // la primera pasada cae en ingles y la siguiente ya lo corrige.
  const ficha = {
    type: TAG,
    name: "HA Companion \u00b7 " + FICHA[lang][0],
    description: FICHA[lang][1],
    preview: false,
  };
  const puesta = window.customCards.find((c) => c.type === TAG);
  if (puesta) Object.assign(puesta, ficha);
  else window.customCards.push(ficha);
};

definir();
let intentos = 0;
const reintento = setInterval(() => {
  definir();
  if (++intentos >= 60) clearInterval(reintento);
}, 250);

console.info("%c HA-COMPANION-SLEEP-WEEK-CARD %c v1.1.0 ",
  "color:#fff;background:#5B8DEF;font-weight:700",
  "color:#5B8DEF;background:#fff");
