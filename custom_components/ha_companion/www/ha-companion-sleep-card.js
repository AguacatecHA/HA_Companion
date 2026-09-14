/**
 * ha-companion-sleep-card
 *
 * Hipnograma para el sensor "Cronología del sueño" de HA Companion.
 *
 * La tarjeta markdown no sirve para esto: Home Assistant sanea el HTML y borra
 * todos los atributos `style`, así que las barras se quedaban en texto plano.
 * Aquí pintamos directamente en el DOM de la tarjeta, sin saneado de por medio.
 *
 * El atributo `phase` de cada tramo ya llega LOCALIZADO desde Python
 * (SLEEP_PHASE_LABELS, según el idioma de la instancia) — puede ser "Despierto"
 * o "Awake" según toque. Por eso el reconocimiento de fase pasa siempre por
 * FASE_CANON antes de nada: normaliza cualquiera de los dos idiomas a un código
 * interno fijo, y solo AHÍ se decide en qué idioma se pinta la tarjeta
 * (`hass.language`, que puede no coincidir con el de la instancia si el
 * usuario tiene su perfil en otro idioma).
 *
 * config:
 *   type: custom:ha-companion-sleep-card
 *   entity: sensor.<algo>_cronologia_del_sueno   (obligatorio)
 *   score_entity: sensor.<...>_puntuacion_del_sueno   (opcional; también acepta
 *                                                       el sensor maestro, vía sleep_info)
 *   title: Anoche                                (opcional)
 */

const SOPORTADOS = ["es", "en", "fr", "de", "it"];
const idioma = (hass) => {
  const l = String((hass && (hass.language || (hass.locale && hass.locale.language))) || "en").toLowerCase().slice(0, 2);
  return SOPORTADOS.includes(l) ? l : "en";
};

// Normaliza el texto de fase (en cualquiera de los 5 idiomas que manda el
// servidor) a un código interno. Lo que no se reconozca cae en su propio
// texto tal cual.
const FASE_CANON = {
  Despierto: "AWAKE", Awake: "AWAKE", Éveillé: "AWAKE", Wach: "AWAKE", Sveglio: "AWAKE",
  REM: "REM",
  "Sueño Ligero": "LIGHT", "Light Sleep": "LIGHT", "Sommeil léger": "LIGHT",
  "Leichter Schlaf": "LIGHT", "Sonno leggero": "LIGHT",
  "Sueño Profundo": "DEEP", "Deep Sleep": "DEEP", "Sommeil profond": "DEEP",
  "Tiefschlaf": "DEEP", "Sonno profondo": "DEEP",
};
// Por si algún día `phase` llegara con la clave cruda del reloj sin traducir
// (nunca debería, en el estado en vivo, pero es el mismo hueco que sí se vio
// en el historial de la tarjeta semanal — mejor cubrirlo aquí también).
const STAGE_CANON = { WAKE_STAGE: "AWAKE", REM_STAGE: "REM", LIGHT_STAGE: "LIGHT", DEEP_STAGE: "DEEP" };
const FASE_COLOR = { AWAKE: "#F0A030", REM: "#A78BFA", LIGHT: "#5B8DEF", DEEP: "#3D5AAF" };
const FASE_ORDEN = ["AWAKE", "LIGHT", "DEEP", "REM"];
const FASE_CORTO = {
  es: { AWAKE: "Despierto", REM: "REM", LIGHT: "Ligero", DEEP: "Profundo" },
  en: { AWAKE: "Awake", REM: "REM", LIGHT: "Light", DEEP: "Deep" },
  fr: { AWAKE: "Éveillé", REM: "REM", LIGHT: "Léger", DEEP: "Profond" },
  de: { AWAKE: "Wach", REM: "REM", LIGHT: "Leicht", DEEP: "Tief" },
  it: { AWAKE: "Sveglio", REM: "REM", LIGHT: "Leggero", DEEP: "Profondo" },
};
const COLOR_OTRO = "#64748B";

const T = {
  es: {
    faltaEntity: "Falta `entity`: el sensor de cronología del sueño",
    noExiste: (e) => `No existe ${e}`,
    sinDatos: "Todavía no hay datos de sueño.",
    puntos: "puntos",
    enCama: "en cama",
  },
  en: {
    faltaEntity: "Missing `entity`: the sleep timeline sensor",
    noExiste: (e) => `${e} doesn't exist`,
    sinDatos: "No sleep data yet.",
    puntos: "points",
    enCama: "in bed",
  },
  fr: {
    faltaEntity: "`entity` manquant : le capteur de chronologie du sommeil",
    noExiste: (e) => `${e} n'existe pas`,
    sinDatos: "Pas encore de données de sommeil.",
    puntos: "points",
    enCama: "au lit",
  },
  de: {
    faltaEntity: "`entity` fehlt: der Schlafverlauf-Sensor",
    noExiste: (e) => `${e} existiert nicht`,
    sinDatos: "Noch keine Schlafdaten.",
    puntos: "Punkte",
    enCama: "im Bett",
  },
  it: {
    faltaEntity: "`entity` mancante: il sensore della cronologia del sonno",
    noExiste: (e) => `${e} non esiste`,
    sinDatos: "Ancora nessun dato sul sonno.",
    puntos: "punti",
    enCama: "a letto",
  },
};

const ESTILOS = `
  :host { display: block; }
  ha-card { padding: 16px; }
  .cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .total { font-size: 30px; font-weight: 500; line-height: 1.1;
           color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .rango { color: var(--secondary-text-color); font-size: 14px;
           font-variant-numeric: tabular-nums; }
  .marca { margin-left: auto; display: flex; align-items: center; gap: 6px;
           color: var(--secondary-text-color); font-size: 13px; }
  .marca b { font-size: 19px; font-weight: 500; color: var(--primary-text-color);
             font-variant-numeric: tabular-nums; }

  .grafica { display: grid; grid-template-columns: auto 1fr; gap: 0 10px;
             margin: 16px 0 4px; }
  .etiquetas { display: grid; }
  .etiquetas span { display: flex; align-items: center; font-size: 11px;
                    color: var(--secondary-text-color); white-space: nowrap; }
  .lienzo { position: relative; }
  .carril { position: absolute; left: 0; right: 0; border-radius: 3px;
            background: var(--divider-color); opacity: .35; }
  .tramo { position: absolute; border-radius: 3px; transition: filter .12s; }
  .tramo:hover { filter: brightness(1.35); }

  .eje { grid-column: 2; position: relative; height: 14px; margin-top: 6px;
         font-size: 11px; color: var(--secondary-text-color);
         font-variant-numeric: tabular-nums; }
  .eje span { position: absolute; transform: translateX(-50%); }

  .leyenda { display: grid; gap: 7px; margin-top: 14px; }
  .fila { display: flex; align-items: center; gap: 9px; }
  .punto { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .nombre { width: 84px; font-size: 13px; color: var(--primary-text-color); }
  .barra { flex: 1; height: 6px; border-radius: 3px; overflow: hidden;
           background: var(--divider-color); }
  .barra > i { display: block; height: 100%; border-radius: 3px; }
  .cifra { flex: none; text-align: right; font-size: 13px; white-space: nowrap;
           color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .cifra em { font-style: normal; opacity: .7; }

  .vacio { color: var(--secondary-text-color); font-size: 14px; }
  .error { color: var(--error-color, #db4437); font-size: 14px; }
`;

const hhmm = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" +
         String(m % 60).padStart(2, "0");
};

const aMinutos = (txt) => {
  if (typeof txt !== "string") return null;
  const p = txt.match(/^(\d{1,2}):(\d{2})/);
  return p ? Number(p[1]) * 60 + Number(p[2]) : null;
};

const duracion = (min) => {
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
};

class HaCompanionSleepCard extends HTMLElement {
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.includes("cronologia_del_sueno"));
    return { type: "custom:ha-companion-sleep-card", entity: e || "" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Missing `entity`: the sleep timeline sensor");
    }
    this._config = config;
    this._pintado = null;
    // Home Assistant llama a setConfig más de una vez sobre el mismo elemento
    // (al reevaluar la vista, al reconstruir la tarjeta...). attachShadow por
    // segunda vez lanza NotSupportedError y la tarjeta entera queda en
    // "Error de configuración", que es justo lo que pasaba.
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<style>${ESTILOS}</style><ha-card></ha-card>`;
    }
    this._card = this.shadowRoot.querySelector("ha-card");
    // El estado que ya tuviéramos debe repintarse con la configuración nueva.
    if (this._hass) this._render(this._hass.states[config.entity]);
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass.states[this._config.entity];
    // Repintar solo si cambió algo: el hipnograma es caro y `hass` llega a
    // cada cambio de estado de la casa entera.
    const huella = `${idioma(hass)}|` + (st ? `${st.state}|${st.last_updated}` : "sin-entidad");
    if (huella === this._pintado) return;
    this._pintado = huella;
    this._render(st);
  }

  getCardSize() { return 5; }

  _puntuacion() {
    const id = this._config.score_entity;
    if (!id || !this._hass) return null;
    const st = this._hass.states[id];
    if (!st) return null;
    let info = st.attributes.sleep_info;
    // El reloj manda `sleep_info` como cadena JSON, no como diccionario.
    if (typeof info === "string") {
      try { info = JSON.parse(info); } catch (_) { info = null; }
    }
    if (info && info.score != null) return info.score;
    // Sin `sleep_info` (no es el sensor maestro): puede ser el sensor
    // dedicado "Puntuación del sueño" — mismo `score_entity` que ya acepta
    // la tarjeta semanal, ahí su propio estado ES la puntuación.
    const directo = Number(st.state);
    return Number.isFinite(directo) ? directo : null;
  }

  _render(st) {
    const lang = idioma(this._hass);
    const t = T[lang];
    const corto = FASE_CORTO[lang];
    const c = this._card;
    c.innerHTML = "";
    if (this._config.title) c.setAttribute("header", this._config.title);

    if (!st) {
      c.innerHTML = `<div class="error">${t.noExiste(this._config.entity)}</div>`;
      return;
    }

    const tramos = (st.attributes.timeline || [])
      .map((x) => ({
        fase: FASE_CANON[x.phase] || STAGE_CANON[x.phase] || x.phase,
        stage: x.stage,   // clave estable del reloj (WAKE_STAGE...), no traducida
        ini: aMinutos(x.start),
        fin: aMinutos(x.stop),
        min: Number(x.duration_min) || 0,
        start: x.start,
        stop: x.stop,
      }))
      .filter((x) => x.min > 0);

    if (!tramos.length) {
      c.innerHTML = `<div class="vacio">${t.sinDatos}</div>`;
      return;
    }

    const total = tramos.reduce((a, x) => a + x.min, 0);
    // Dormido de verdad = todo menos los tramos despierto. El número grande de
    // la cabecera es este, no el intervalo completo en cama: un usuario real
    // señaló que "8h 38" arriba y "Despierto · 67 min · 13%" en la leyenda de
    // debajo se contradecían — 67 min despierto no pueden estar "dormidos".
    // El intervalo completo en cama se queda, pero pequeño, junto a la hora.
    //
    // Se compara por `stage` (WAKE_STAGE, estable, no traducido) cuando existe;
    // si el sensor todavía no lo manda (integración sin actualizar), se cae al
    // `fase` ya canonicalizada por FASE_CANON — verificado que también acierta,
    // pero `stage` no depende de mantener esa tabla sincronizada con
    // SLEEP_PHASE_LABELS a mano.
    const esDespierto = (x) => (x.stage ? x.stage === "WAKE_STAGE" : x.fase === "AWAKE");
    const dormido = tramos.filter((x) => !esDespierto(x)).reduce((a, x) => a + x.min, 0);
    const inicio = tramos[0].ini ?? 0;
    const score = this._puntuacion();

    // ---- cabecera -------------------------------------------------------
    const cab = document.createElement("div");
    cab.className = "cab";
    cab.innerHTML =
      `<span class="total">${duracion(dormido)}</span>` +
      `<span class="rango">${tramos[0].start} → ${tramos[tramos.length - 1].stop} · ${duracion(total)} ${t.enCama}</span>` +
      (score != null
        ? `<span class="marca"><b>${score}</b>${t.puntos}</span>`
        : "");
    c.appendChild(cab);

    // ---- hipnograma -----------------------------------------------------
    const presentes = FASE_ORDEN.filter((f) => tramos.some((t2) => t2.fase === f));
    const otras = [...new Set(tramos.map((t2) => t2.fase))]
      .filter((f) => !FASE_ORDEN.includes(f));
    const niveles = [
      ...presentes.map((f) => ({ clave: f, color: FASE_COLOR[f], corto: corto[f] })),
      ...otras.map((f) => ({ clave: f, color: COLOR_OTRO, corto: f })),
    ];

    const ALTO_FILA = 22, HUECO = 6;
    const alto = niveles.length * ALTO_FILA + (niveles.length - 1) * HUECO;

    const graf = document.createElement("div");
    graf.className = "grafica";

    const etiq = document.createElement("div");
    etiq.className = "etiquetas";
    etiq.style.gridTemplateRows = `repeat(${niveles.length}, ${ALTO_FILA}px)`;
    etiq.style.rowGap = `${HUECO}px`;
    niveles.forEach((n) => {
      const s = document.createElement("span");
      s.textContent = n.corto;
      etiq.appendChild(s);
    });

    const lienzo = document.createElement("div");
    lienzo.className = "lienzo";
    lienzo.style.height = `${alto}px`;

    niveles.forEach((_, i) => {
      const carril = document.createElement("div");
      carril.className = "carril";
      carril.style.top = `${i * (ALTO_FILA + HUECO)}px`;
      carril.style.height = `${ALTO_FILA}px`;
      lienzo.appendChild(carril);
    });

    let acumulado = 0;
    tramos.forEach((t2) => {
      const fila = niveles.findIndex((n) => n.clave === t2.fase);
      const color = (niveles[fila] || {}).color || COLOR_OTRO;
      const d = document.createElement("div");
      d.className = "tramo";
      d.style.left = `${(acumulado / total) * 100}%`;
      d.style.width = `${Math.max((t2.min / total) * 100, 0.4)}%`;
      d.style.top = `${Math.max(fila, 0) * (ALTO_FILA + HUECO)}px`;
      d.style.height = `${ALTO_FILA}px`;
      d.style.background = color;
      d.title = `${(niveles[fila] || {}).corto || t2.fase} · ${t2.start}–${t2.stop} · ${t2.min} min`;
      lienzo.appendChild(d);
      acumulado += t2.min;
    });

    graf.appendChild(etiq);
    graf.appendChild(lienzo);

    // ---- eje de horas ---------------------------------------------------
    const eje = document.createElement("div");
    eje.className = "eje";
    // Una marca por cada hora en punto, sin amontonarlas en pantallas cortas.
    const salto = Math.max(1, Math.ceil(total / 60 / 8));
    const primera = Math.ceil(inicio / 60) * 60;
    const marcas = [];
    for (let m = primera; m < inicio + total; m += 60 * salto) marcas.push(m);
    if (marcas.length) {
      marcas.forEach((m) => {
        const s = document.createElement("span");
        s.textContent = hhmm(m);
        s.style.left = `${((m - inicio) / total) * 100}%`;
        eje.appendChild(s);
      });
      // Va dentro de la rejilla para quedar alineado con el lienzo sin medir nada.
      graf.appendChild(eje);
    }

    c.appendChild(graf);

    // ---- leyenda con el reparto ----------------------------------------
    const ley = document.createElement("div");
    ley.className = "leyenda";
    niveles.forEach((n) => {
      const min = tramos.filter((t2) => t2.fase === n.clave)
                        .reduce((a, x) => a + x.min, 0);
      if (!min) return;
      const pct = (min / total) * 100;
      const fila = document.createElement("div");
      fila.className = "fila";
      fila.innerHTML =
        `<span class="punto" style="background:${n.color}"></span>` +
        `<span class="nombre">${n.corto}</span>` +
        `<span class="barra"><i style="width:${pct.toFixed(1)}%;background:${n.color}"></i></span>` +
        `<span class="cifra">${duracion(min)} <em>${Math.round(pct)}%</em></span>`;
      ley.appendChild(fila);
    });
    c.appendChild(ley);
  }
}

const TAG = "ha-companion-sleep-card";

// Los módulos de `extra_module_url` se evalúan MUY pronto, antes de que el
// frontend termine de montar su registro de elementos: la definición se hace
// sobre un registro que después se reemplaza, y la tarjeta acaba saliendo como
// "Error de configuración" pese a que el módulo se ejecutó entero (su banner
// aparece en la consola). Como el módulo ya está en el mapa de módulos, cargarlo
// otra vez no lo re-ejecuta. Por eso reafirmamos la definición un rato.
const definir = () => {
  try {
    if (!customElements.get(TAG)) customElements.define(TAG, HaCompanionSleepCard);
  } catch (_) {
    /* ya registrada en este registro: nada que hacer */
  }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({
      type: TAG,
      name: "HA Companion · Sleep",
      description: "Last night's hypnogram from the sleep timeline sensor.",
      preview: false,
    });
  }
};

definir();
let intentos = 0;
const reintento = setInterval(() => {
  definir();
  if (++intentos >= 60) clearInterval(reintento);   // 15 s y paramos
}, 250);

console.info("%c HA-COMPANION-SLEEP-CARD %c v1.2.0 ",
  "color:#fff;background:#3D5AAF;font-weight:700",
  "color:#3D5AAF;background:#fff");
