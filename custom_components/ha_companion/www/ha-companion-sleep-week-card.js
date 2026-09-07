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
 *   prefix: sensor.balance_jesus          (de ahí compone las cuatro fases)
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

// Mismo lenguaje de color que ha-companion-sleep-card: se leen juntas.
const FASES = [
  { sufijo: "_sueno_profundo", clave: "DEEP", color: "#3D5AAF" },
  { sufijo: "_sueno_rem",      clave: "REM",  color: "#A78BFA" },
  { sufijo: "_sueno_ligero",   clave: "LIGHT", color: "#5B8DEF" },
  { sufijo: "_tiempo_despierto", clave: "AWAKE", color: "#F0A030" },
];
const FASE_NOMBRE = {
  es: { DEEP: "Profundo", REM: "REM", LIGHT: "Ligero", AWAKE: "Despierto" },
  en: { DEEP: "Deep", REM: "REM", LIGHT: "Light", AWAKE: "Awake" },
  fr: { DEEP: "Profond", REM: "REM", LIGHT: "Léger", AWAKE: "Éveillé" },
  de: { DEEP: "Tief", REM: "REM", LIGHT: "Leicht", AWAKE: "Wach" },
  it: { DEEP: "Profondo", REM: "REM", LIGHT: "Leggero", AWAKE: "Sveglio" },
};
const FASE_COLOR = { AWAKE: "#F0A030", REM: "#A78BFA", LIGHT: "#5B8DEF", DEEP: "#3D5AAF" };
const FASE_ORDEN = ["AWAKE", "REM", "LIGHT", "DEEP"];
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
    faltaConfig: "Falta `prefix` (o `entities`), por ejemplo sensor.balance_jesus",
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
    faltaConfig: "Missing `prefix` (or `entities`), e.g. sensor.balance_jesus",
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
    faltaConfig: "`prefix` (ou `entities`) manquant, ex. sensor.balance_jesus",
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
    faltaConfig: "`prefix` (oder `entities`) fehlt, z. B. sensor.balance_jesus",
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
    faltaConfig: "`prefix` (o `entities`) mancante, es. sensor.balance_jesus",
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
  .pila { display: flex; flex-direction: column-reverse; border-radius: 4px;
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
  static getStubConfig() {
    return { type: "custom:" + TAG, prefix: "sensor.balance_jesus" };
  }

  setConfig(config) {
    if (!config || (!config.prefix && !config.entities)) {
      throw new Error("Missing `prefix` (or `entities`), e.g. sensor.balance_jesus");
    }
    this._config = config;
    this._noches = null;
    this._pedido = 0;
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
    this._quizasPedir(primera || cambioIdioma);
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

const definir = () => {
  try {
    if (!customElements.get(TAG)) customElements.define(TAG, HaCompanionSleepWeekCard);
  } catch (_) { /* ya registrada */ }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({
      type: TAG,
      name: "HA Companion · Sleep (week)",
      description: "Recent nights stacked by phase, from the recorder statistics.",
      preview: false,
    });
  }
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
