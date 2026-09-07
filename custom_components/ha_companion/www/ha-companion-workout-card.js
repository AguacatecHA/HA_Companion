/**
 * ha-companion-workout-card
 *
 * Historial de entrenamientos del reloj, hermana de ha-companion-sleep-card.
 *
 * Zepp OS solo da `startTime`, `duration` y (de propina) `sportType` por sesión:
 * no hay muestras de pulso, ni zonas, ni ritmo, ni distancia. Así que esto pinta
 * lo único que existe de verdad — cuándo y cuánto — y lo acompaña con los
 * agregados del reloj (carga, VO2 máx, recuperación).
 *
 * El nombre del deporte (`w.sport`) ya llega traducido desde Python
 * (SPORT_TYPE_LABELS, según el idioma de la instancia) — aquí no hace falta
 * tocarlo, solo los rótulos propios de la tarjeta.
 *
 * config:
 *   type: custom:ha-companion-workout-card
 *   entity: sensor.<algo>_recent_workouts        (obligatorio, atributo `workouts`)
 *   load_entity: sensor.<reloj>_carga_de_entrenamiento    (opcional)
 *   vo2_entity: sensor.<reloj>_vo2_max                    (opcional)
 *   recovery_entity: sensor.<reloj>_tiempo_de_recuperacion_total  (opcional)
 *   days: 7                                      (opcional, por defecto 7)
 *   title: Entrenamientos                        (opcional)
 */

const TAG = "ha-companion-workout-card";

const SOPORTADOS = ["es", "en", "fr", "de", "it"];
const idioma = (hass) => {
  const l = String((hass && (hass.language || (hass.locale && hass.locale.language))) || "en").toLowerCase().slice(0, 2);
  return SOPORTADOS.includes(l) ? l : "en";
};

// Un color por familia de deporte; el resto cae en el neutro. Se compara
// contra el nombre en inglés del SDK (SPORT_TYPES), que es estable
// independientemente del idioma de visualización — ver sensor.py: `_sport_name`
// localiza el nombre pero el patrón de familia (walk/run/cycl...) es el mismo
// texto en inglés de origen.
const COLORES = [
  { re: /walk|hiking|trek/i,               color: "#5B8DEF" },
  { re: /run|jog|treadmill/i,              color: "#F0A030" },
  { re: /cycl|bike|riding/i,               color: "#34C77B" },
  { re: /swim|pool/i,                      color: "#22B8CF" },
  { re: /strength|gym|weight|training|fuerza/i, color: "#A78BFA" },
  { re: /yoga|pilates|stretch/i,           color: "#E86FA9" },
];
const NEUTRO = "#64748B";
const color = (deporte) =>
  (COLORES.find((c) => c.re.test(deporte || "")) || {}).color || NEUTRO;

const DIAS = {
  es: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  fr: ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"],
  de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  it: ["dom", "lun", "mar", "mer", "gio", "ven", "sab"],
};

const T = {
  es: {
    faltaEntity: "Falta `entity`: el sensor de entrenamientos recientes",
    noExiste: (e) => `No existe ${e}`,
    sinDatos: "Todavía no hay entrenamientos.",
    sesion: (n) => (n === 1 ? "sesión" : "sesiones"),
    enDias: (n) => `en ${n} días`,
    carga: "carga de entreno",
    vo2max: "VO₂ máx",
    recuperacion: "h de recuperación",
  },
  en: {
    faltaEntity: "Missing `entity`: the recent workouts sensor",
    noExiste: (e) => `${e} doesn't exist`,
    sinDatos: "No workouts yet.",
    sesion: (n) => (n === 1 ? "session" : "sessions"),
    enDias: (n) => `in ${n} days`,
    carga: "training load",
    vo2max: "VO₂ max",
    recuperacion: "h recovery",
  },
  fr: {
    faltaEntity: "`entity` manquant : le capteur des entraînements récents",
    noExiste: (e) => `${e} n'existe pas`,
    sinDatos: "Pas encore d'entraînements.",
    sesion: (n) => (n === 1 ? "séance" : "séances"),
    enDias: (n) => `en ${n} jours`,
    carga: "charge d'entraînement",
    vo2max: "VO₂ max",
    recuperacion: "h de récupération",
  },
  de: {
    faltaEntity: "`entity` fehlt: der Sensor für letzte Trainings",
    noExiste: (e) => `${e} existiert nicht`,
    sinDatos: "Noch keine Trainings.",
    sesion: (n) => (n === 1 ? "Einheit" : "Einheiten"),
    enDias: (n) => `in ${n} Tagen`,
    carga: "Trainingsbelastung",
    vo2max: "VO₂ max",
    recuperacion: "Std. Erholung",
  },
  it: {
    faltaEntity: "`entity` mancante: il sensore degli allenamenti recenti",
    noExiste: (e) => `${e} non esiste`,
    sinDatos: "Ancora nessun allenamento.",
    sesion: (n) => (n === 1 ? "sessione" : "sessioni"),
    enDias: (n) => `in ${n} giorni`,
    carga: "carico di allenamento",
    vo2max: "VO₂ max",
    recuperacion: "h di recupero",
  },
};

const ESTILOS = `
  :host { display: block; }
  ha-card { padding: 16px; }

  .cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .total { font-size: 30px; font-weight: 500; line-height: 1.1;
           color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .sub { color: var(--secondary-text-color); font-size: 14px; }

  .dias { display: grid; gap: 6px; margin: 16px 0 4px; }
  .dia { display: grid; grid-template-columns: 58px 1fr auto; align-items: center;
         gap: 10px; }
  .fecha { font-size: 12px; color: var(--secondary-text-color);
           font-variant-numeric: tabular-nums; white-space: nowrap; }
  .fecha b { color: var(--primary-text-color); font-weight: 500; }
  .pista { position: relative; height: 20px; border-radius: 4px;
           background: var(--divider-color); overflow: hidden; }
  .pista.hoy { outline: 1px solid var(--primary-color); outline-offset: 1px; }
  .sesion { position: absolute; top: 0; height: 100%; border-radius: 3px;
            transition: filter .12s; }
  .sesion:hover { filter: brightness(1.35); }
  .min { font-size: 12px; color: var(--secondary-text-color); min-width: 52px;
         text-align: right; white-space: nowrap;
         font-variant-numeric: tabular-nums; }
  .min.cero { opacity: .35; }

  .eje { display: grid; grid-template-columns: 58px 1fr auto; gap: 10px;
         margin-top: 4px; }
  .horas { grid-column: 2; position: relative; height: 13px; font-size: 10px;
           color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .horas span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
  .horas span:last-child { transform: translateX(-100%); }

  .pie { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 16px;
         padding-top: 13px; border-top: 1px solid var(--divider-color); }
  .dato { display: flex; flex-direction: column; gap: 1px; }
  .dato b { font-size: 18px; font-weight: 500; color: var(--primary-text-color);
            font-variant-numeric: tabular-nums; }
  .dato span { font-size: 11px; color: var(--secondary-text-color); }

  .leyenda { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px;
             font-size: 12px; color: var(--secondary-text-color); }
  .leyenda i { display: inline-block; width: 8px; height: 8px; border-radius: 2px;
               margin-right: 5px; vertical-align: middle; }

  .vacio { color: var(--secondary-text-color); font-size: 14px; }
  .error { color: var(--error-color, #db4437); font-size: 14px; }
`;

const dur = (min) => {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
};

class HaCompanionWorkoutCard extends HTMLElement {
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.endsWith("_recent_workouts"));
    return { type: "custom:" + TAG, entity: e || "" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Missing `entity`: the recent workouts sensor");
    }
    this._config = config;
    this._pintado = null;
    // Igual que en la tarjeta del sueño: setConfig se llama más de una vez sobre
    // el mismo elemento y attachShadow por segunda vez lanza NotSupportedError.
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<style>${ESTILOS}</style><ha-card></ha-card>`;
    }
    this._card = this.shadowRoot.querySelector("ha-card");
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass.states[this._config.entity];
    const huella = `${idioma(hass)}|` + (st ? `${st.state}|${st.last_updated}` : "sin-entidad");
    if (huella === this._pintado) return;
    this._pintado = huella;
    this._render();
  }

  getCardSize() { return 5; }

  _num(clave) {
    const id = this._config[clave];
    if (!id || !this._hass) return null;
    const st = this._hass.states[id];
    if (!st || isNaN(Number(st.state))) return null;
    return Number(st.state);
  }

  _render() {
    const lang = idioma(this._hass);
    const t = T[lang];
    const dias7 = DIAS[lang];
    const c = this._card;
    c.innerHTML = "";
    if (this._config.title) c.setAttribute("header", this._config.title);

    const st = this._hass.states[this._config.entity];
    if (!st) {
      c.innerHTML = `<div class="error">${t.noExiste(this._config.entity)}</div>`;
      return;
    }

    const sesiones = (st.attributes.workouts || [])
      .filter((w) => w.start && w.duration_min > 0)
      .map((w) => ({ ...w, d: new Date(w.start) }))
      .filter((w) => !isNaN(w.d));

    if (!sesiones.length) {
      c.innerHTML = `<div class="vacio">${t.sinDatos}</div>`;
      return;
    }

    const dias = Math.max(1, Number(this._config.days) || 7);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const clave = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };

    const enRango = sesiones.filter((w) => (hoy - clave(w.d)) / 86400000 < dias);
    const total = enRango.reduce((a, w) => a + w.duration_min, 0);

    // ---- cabecera -------------------------------------------------------
    const cab = document.createElement("div");
    cab.className = "cab";
    cab.innerHTML =
      `<span class="total">${dur(total)}</span>` +
      `<span class="sub">${enRango.length} ${t.sesion(enRango.length)}` +
      ` ${t.enDias(dias)}</span>`;
    c.appendChild(cab);

    // ---- una fila por día, la sesión colocada a su hora real -------------
    const cont = document.createElement("div");
    cont.className = "dias";

    for (let i = dias - 1; i >= 0; i--) {
      const dia = new Date(hoy); dia.setDate(dia.getDate() - i);
      const delDia = enRango.filter((w) => clave(w.d) === dia.getTime());
      const min = delDia.reduce((a, w) => a + w.duration_min, 0);

      const fila = document.createElement("div");
      fila.className = "dia";

      const f = document.createElement("div");
      f.className = "fecha";
      f.innerHTML = `${dias7[dia.getDay()]} <b>${dia.getDate()}</b>`;

      const pista = document.createElement("div");
      pista.className = "pista" + (i === 0 ? " hoy" : "");
      delDia.forEach((w) => {
        const desde = w.d.getHours() * 60 + w.d.getMinutes();
        const s = document.createElement("div");
        s.className = "sesion";
        s.style.left = `${(desde / 1440) * 100}%`;
        // Con 15 min sobre 24 h el bloque sería de un pelo: le damos un mínimo.
        s.style.width = `${Math.max((w.duration_min / 1440) * 100, 1.6)}%`;
        s.style.background = color(w.sport);
        s.title = `${w.date} · ${w.sport} · ${w.duration_min} min`;
        pista.appendChild(s);
      });

      const m = document.createElement("div");
      m.className = "min" + (min ? "" : " cero");
      m.textContent = min ? `${min} min` : "—";

      fila.append(f, pista, m);
      cont.appendChild(fila);
    }
    c.appendChild(cont);

    // ---- eje de horas ---------------------------------------------------
    const eje = document.createElement("div");
    eje.className = "eje";
    const horas = document.createElement("div");
    horas.className = "horas";
    [0, 6, 12, 18, 24].forEach((h) => {
      const s = document.createElement("span");
      s.textContent = h === 24 ? "24" : `${h}`;
      s.style.left = `${(h / 24) * 100}%`;
      horas.appendChild(s);
    });
    eje.appendChild(horas);
    c.appendChild(eje);

    // ---- leyenda de deportes presentes ----------------------------------
    const deportes = [...new Set(enRango.map((w) => w.sport))];
    if (deportes.length) {
      const ley = document.createElement("div");
      ley.className = "leyenda";
      deportes.forEach((d) => {
        const min = enRango.filter((w) => w.sport === d)
                           .reduce((a, w) => a + w.duration_min, 0);
        const s = document.createElement("span");
        s.innerHTML = `<i style="background:${color(d)}"></i>${d} · ${min} min`;
        ley.appendChild(s);
      });
      c.appendChild(ley);
    }

    // ---- agregados del reloj -------------------------------------------
    const pie = document.createElement("div");
    pie.className = "pie";
    const carga = this._num("load_entity");
    const vo2 = this._num("vo2_entity");
    const rec = this._num("recovery_entity");
    const add = (v, etiqueta) => {
      if (v === null) return;
      const d = document.createElement("div");
      d.className = "dato";
      d.innerHTML = `<b>${v}</b><span>${etiqueta}</span>`;
      pie.appendChild(d);
    };
    add(carga, t.carga);
    add(vo2, t.vo2max);
    add(rec, t.recuperacion);
    if (pie.children.length) c.appendChild(pie);
  }
}

const definir = () => {
  try {
    if (!customElements.get(TAG)) customElements.define(TAG, HaCompanionWorkoutCard);
  } catch (_) { /* ya registrada */ }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({
      type: TAG,
      name: "HA Companion · Workouts",
      description: "Workout history, placed at their real time of day.",
      preview: false,
    });
  }
};

// Mismo motivo que en la tarjeta del sueño: los módulos de extra_module_url se
// evalúan antes de que el frontend termine de montar su registro de elementos.
definir();
let intentos = 0;
const reintento = setInterval(() => {
  definir();
  if (++intentos >= 60) clearInterval(reintento);
}, 250);

console.info("%c HA-COMPANION-WORKOUT-CARD %c v1.1.0 ",
  "color:#fff;background:#34C77B;font-weight:700",
  "color:#34C77B;background:#fff");
