/**
 * ha-companion-weight-card
 *
 * Peso del reloj: el valor de ahora mismo y cómo ha ido evolucionando.
 *
 * El peso no es un dato que el reloj mida solo — se cambia a mano en el reloj
 * o en la app de Zepp — así que el número de hoy dice poco y lo que interesa es
 * la línea: si sube, si baja y cuánto desde que empezó el periodo.
 *
 * De dónde salen los datos:
 *   - Semana y mes: estadísticas del recorder por día (`statistics_during_period`,
 *     period `day`, tipo `mean`).
 *   - Año: las mismas estadísticas, pero por mes.
 *   - Si todavía no hay estadísticas (acaba de instalarse la versión que le pone
 *     `state_class`, y HA NO rellena hacia atrás), cae al historial normal
 *     (`history_during_period`), que cubre los días que el recorder guarde.
 *
 * config:
 *   type: custom:ha-companion-weight-card
 *   entity: sensor.<reloj>_peso      (opcional: si falta, se busca solo)
 *   range: week | month | year       (opcional, por defecto month)
 *   title: Peso                      (opcional)
 *   decimals: 1                      (opcional, por defecto 1)
 */

const TAG = "ha-companion-weight-card";

const SOPORTADOS = ["es", "en", "fr", "de", "it"];
const idioma = (hass) => {
  const l = String((hass && (hass.language || (hass.locale && hass.locale.language))) || "en")
    .toLowerCase().slice(0, 2);
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

const T = {
  es: {
    titulo: "Peso",
    semana: "Semana", mes: "Mes", anio: "Año",
    sinEntidad: (e) => `No encuentro la entidad <code>${e}</code>.`,
    sinDatos: "Todavía no hay histórico de peso. Aparecerá según el reloj lo vaya enviando.",
    error: "No he podido leer el histórico.",
    desde: "desde el inicio del periodo",
    igual: "sin cambios",
    minimo: "mínimo", maximo: "máximo", media: "media",
    meses: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  },
  en: {
    titulo: "Weight",
    semana: "Week", mes: "Month", anio: "Year",
    sinEntidad: (e) => `Can't find the entity <code>${e}</code>.`,
    sinDatos: "No weight history yet. It will build up as the watch reports it.",
    error: "Couldn't read the history.",
    desde: "since the start of the period",
    igual: "no change",
    minimo: "low", maximo: "high", media: "average",
    meses: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
  fr: {
    titulo: "Poids",
    semana: "Semaine", mes: "Mois", anio: "Année",
    sinEntidad: (e) => `Entité <code>${e}</code> introuvable.`,
    sinDatos: "Pas encore d'historique de poids. Il se remplira au fil des envois de la montre.",
    error: "Impossible de lire l'historique.",
    desde: "depuis le début de la période",
    igual: "sans changement",
    minimo: "mini", maximo: "maxi", media: "moyenne",
    meses: ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"],
  },
  de: {
    titulo: "Gewicht",
    semana: "Woche", mes: "Monat", anio: "Jahr",
    sinEntidad: (e) => `Entität <code>${e}</code> nicht gefunden.`,
    sinDatos: "Noch kein Gewichtsverlauf. Er entsteht, sobald die Uhr Daten sendet.",
    error: "Verlauf konnte nicht gelesen werden.",
    desde: "seit Beginn des Zeitraums",
    igual: "unverändert",
    minimo: "Min", maximo: "Max", media: "Mittel",
    meses: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  },
  it: {
    titulo: "Peso",
    semana: "Settimana", mes: "Mese", anio: "Anno",
    sinEntidad: (e) => `Entità <code>${e}</code> non trovata.`,
    sinDatos: "Ancora nessuno storico del peso. Si riempirà man mano che l'orologio lo invia.",
    error: "Non sono riuscito a leggere lo storico.",
    desde: "dall'inizio del periodo",
    igual: "nessuna variazione",
    minimo: "minimo", maximo: "massimo", media: "media",
    meses: ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"],
  },
};

const RANGOS = {
  week:  { dias: 7,   periodo: "day",   etiqueta: "semana" },
  month: { dias: 31,  periodo: "day",   etiqueta: "mes" },
  year:  { dias: 365, periodo: "month", etiqueta: "anio" },
};

const ESTILOS = `
  :host { display: block; }
  ha-card { padding: 16px; }

  .cab { display: flex; align-items: center; justify-content: space-between;
         gap: 12px; flex-wrap: wrap; }
  .rangos { display: flex; gap: 4px; }
  .rangos button { border: none; cursor: pointer; font: inherit; font-size: 12px;
                   padding: 4px 10px; border-radius: 12px;
                   background: var(--divider-color); color: var(--primary-text-color);
                   opacity: .75; }
  .rangos button.on { background: var(--primary-color); color: var(--text-primary-color);
                      opacity: 1; }

  .ahora { display: flex; align-items: baseline; gap: 10px; margin-top: 6px; }
  .valor { font-size: 34px; font-weight: 500; line-height: 1.1;
           color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .uni { font-size: 15px; color: var(--secondary-text-color); }
  .delta { font-size: 14px; font-variant-numeric: tabular-nums; }
  .delta.sube { color: var(--error-color, #e45649); }
  .delta.baja { color: var(--success-color, #34c77b); }
  .delta.igual { color: var(--secondary-text-color); }
  .desde { color: var(--secondary-text-color); font-size: 12px; }

  .grafica { margin-top: 12px; }
  /* Sin preserveAspectRatio="none": estirar el SVG deformaría también los
     números del eje. Escala uniforme y la altura sale del viewBox. */
  svg { width: 100%; height: auto; display: block; overflow: visible; }
  .linea { fill: none; stroke: var(--primary-color); stroke-width: 2.5;
           stroke-linejoin: round; stroke-linecap: round; }
  .area { fill: var(--primary-color); opacity: .12; }
  .punto { fill: var(--primary-color); }
  .reja { stroke: var(--divider-color); stroke-width: 1; }
  .marca { font-size: 10px; fill: var(--secondary-text-color);
           font-variant-numeric: tabular-nums; }

  .eje { display: flex; justify-content: space-between; margin-top: 2px;
         font-size: 10px; color: var(--secondary-text-color);
         font-variant-numeric: tabular-nums; }

  .pie { display: flex; gap: 18px; margin-top: 12px; flex-wrap: wrap; }
  .dato { display: flex; flex-direction: column; }
  .dato b { font-size: 16px; font-weight: 500; color: var(--primary-text-color);
            font-variant-numeric: tabular-nums; }
  .dato span { font-size: 11px; color: var(--secondary-text-color); }

  .vacio, .error { color: var(--secondary-text-color); font-size: 14px;
                   padding: 10px 0; }
  code { font-family: var(--code-font-family, monospace); }
`;

class HaCompanionWeightCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement(TAG + "-editor");
  }

  static async getStubConfig(hass) {
    const relojes = await relojesDeHA(hass);
    const reloj = relojes.find((x) => x.claves.user_weight);
    return {
      type: "custom:ha-companion-weight-card",
      entity: (reloj && reloj.claves.user_weight) || "",
      range: "month",
    };
  }

  setConfig(config) {
    // Sin `entity` NO se lanza error: la tarjeta busca sola el sensor de peso
    // del reloj que esté dando datos. Así se puede añadir desde el selector sin
    // saberse los entity_id, que además cambian con el idioma.
    this._config = config || {};
    this._entidad = this._config.entity || null;
    this._rango = RANGOS[config.range] ? config.range : "month";
    this._serie = null;        // null = sin pedir todavía
    this._pedido = null;       // huella de la última petición, para no repetirla
    // Igual que en las otras tarjetas: HA llama a setConfig varias veces sobre
    // el mismo elemento y un segundo attachShadow lanza NotSupportedError.
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<style>${ESTILOS}</style><ha-card></ha-card>`;
    }
    this._card = this.shadowRoot.querySelector("ha-card");
    if (this._hass) this._actualizar();
  }

  set hass(hass) {
    const primero = !this._hass;
    this._hass = hass;
    if (primero) { this._actualizar(); return; }
    // Repintar solo si cambió el peso o el idioma, no con la casa entera.
    const st = hass.states[this._entidad];
    const huella = `${idioma(hass)}|${this._rango}|` + (st ? `${st.state}` : "sin");
    if (huella === this._pintado) return;
    this._pintado = huella;
    this._actualizar();
  }

  getCardSize() { return 4; }

  async _actualizar() {
    if (!this._hass || !this._card) return;

    // Sin entidad configurada, se busca el peso del reloj activo. Una vez.
    if (!this._entidad && !this._buscando) {
      this._buscando = true;
      const relojes = await relojesDeHA(this._hass);
      const reloj = relojes.find((x) => x.claves.user_weight);
      this._entidad = (reloj && reloj.claves.user_weight) || null;
      this._buscando = false;
    }

    const st = this._hass.states[this._entidad];
    this._render(st);                 // pinta ya lo que se sabe (valor de ahora)
    if (!st) return;

    const huella = `${this._entidad}|${this._rango}`;
    if (huella === this._pedido) return;
    this._pedido = huella;
    this._serie = null;
    await this._pedirSerie();
    this._render(this._hass.states[this._entidad]);
  }

  /** Estadísticas del recorder; si no hay, el historial normal. */
  async _pedirSerie() {
    const r = RANGOS[this._rango];
    const fin = new Date();
    const ini = new Date(fin.getTime() - r.dias * 86400000);
    const id = this._entidad;

    try {
      const res = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: ini.toISOString(),
        end_time: fin.toISOString(),
        statistic_ids: [id],
        period: r.periodo,
        types: ["mean"],
      });
      const filas = (res && res[id]) || [];
      const serie = filas
        .map((f) => ({ t: new Date(f.start).getTime(), v: Number(f.mean) }))
        .filter((p) => Number.isFinite(p.v));
      if (serie.length >= 2) { this._serie = serie; return; }
    } catch (_) { /* seguimos con el historial */ }

    // Sin estadísticas todavía: el historial cubre lo que el recorder guarde.
    try {
      const res = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: ini.toISOString(),
        end_time: fin.toISOString(),
        entity_ids: [id],
        minimal_response: true,
        no_attributes: true,
      });
      const filas = (res && res[id]) || [];
      const porDia = new Map();
      for (const f of filas) {
        const v = Number(f.s !== undefined ? f.s : f.state);
        if (!Number.isFinite(v)) continue;
        const ms = (f.lu !== undefined ? f.lu * 1000 : new Date(f.last_updated).getTime());
        const d = new Date(ms); d.setHours(0, 0, 0, 0);
        porDia.set(d.getTime(), v);        // nos quedamos con la última del día
      }
      const serie = [...porDia.entries()]
        .map(([t, v]) => ({ t, v }))
        .sort((a, b) => a.t - b.t);
      this._serie = serie.length ? serie : [];
    } catch (_) {
      this._serie = "error";
    }
  }

  _render(st) {
    const t = T[idioma(this._hass)];
    const c = this._card;
    c.innerHTML = "";
    c.setAttribute("header", this._config.title || t.titulo);

    if (!st) {
      c.innerHTML = `<div class="error">${t.sinEntidad(this._entidad || "—")}</div>`;
      return;
    }

    const dec = this._config.decimals === undefined ? 1 : Number(this._config.decimals);
    const uni = st.attributes.unit_of_measurement || "kg";
    const actual = Number(st.state);

    c.appendChild(this._cabecera(t));

    // ---- valor de ahora + variación en el periodo -------------------------
    const serie = Array.isArray(this._serie) ? this._serie : [];
    const primero = serie.length ? serie[0].v : null;
    const ahora = document.createElement("div");
    ahora.className = "ahora";
    ahora.innerHTML = Number.isFinite(actual)
      ? `<span class="valor">${actual.toFixed(dec)}</span><span class="uni">${uni}</span>`
      : `<span class="valor">—</span>`;
    if (primero !== null && Number.isFinite(actual)) {
      const d = actual - primero;
      const clase = Math.abs(d) < 0.05 ? "igual" : (d > 0 ? "sube" : "baja");
      const txt = Math.abs(d) < 0.05
        ? t.igual
        : `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(dec)} ${uni}`;
      const s = document.createElement("span");
      s.className = `delta ${clase}`;
      s.textContent = txt;
      ahora.appendChild(s);
    }
    c.appendChild(ahora);

    if (primero !== null) {
      const d = document.createElement("div");
      d.className = "desde";
      d.textContent = t.desde;
      c.appendChild(d);
    }

    // ---- gráfica ----------------------------------------------------------
    // Nada de `innerHTML +=` aquí: reconstruye los hijos ya puestos y deja los
    // botones del selector sin su listener, o sea, muertos.
    const aviso = (clase, texto) => {
      const d = document.createElement("div");
      d.className = clase;
      d.textContent = texto;
      c.appendChild(d);
    };
    if (this._serie === "error") { aviso("error", t.error); return; }
    if (this._serie === null) return;           // aún pidiendo
    if (serie.length < 2) { aviso("vacio", t.sinDatos); return; }
    c.appendChild(this._grafica(serie, t, uni, dec));
    c.appendChild(this._pie(serie, t, uni, dec));
  }

  _cabecera(t) {
    const cab = document.createElement("div");
    cab.className = "cab";
    const rangos = document.createElement("div");
    rangos.className = "rangos";
    [["week", t.semana], ["month", t.mes], ["year", t.anio]].forEach(([k, etiqueta]) => {
      const b = document.createElement("button");
      b.textContent = etiqueta;
      if (k === this._rango) b.className = "on";
      b.addEventListener("click", () => {
        if (this._rango === k) return;
        this._rango = k;
        this._pintado = null;
        this._actualizar();
      });
      rangos.appendChild(b);
    });
    cab.appendChild(document.createElement("div"));
    cab.appendChild(rangos);
    return cab;
  }

  _grafica(serie, t, uni, dec) {
    const W = 300, H = 150, ML = 34, MR = 6, MT = 10, MB = 16;
    const vs = serie.map((p) => p.v);
    let min = Math.min(...vs), max = Math.max(...vs);
    if (max - min < 0.5) { const m = (max + min) / 2; min = m - 0.5; max = m + 0.5; }
    const margen = (max - min) * 0.15;
    min -= margen; max += margen;

    const x = (i) => ML + (i / (serie.length - 1)) * (W - ML - MR);
    const y = (v) => MT + (1 - (v - min) / (max - min)) * (H - MT - MB);

    const pts = serie.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`);
    const linea = "M" + pts.join(" L");
    const area = `${linea} L${x(serie.length - 1).toFixed(1)},${(H - MB).toFixed(1)} `
               + `L${x(0).toFixed(1)},${(H - MB).toFixed(1)} Z`;

    const env = document.createElement("div");
    env.className = "grafica";
    const marcas = [max - margen, (max + min) / 2, min + margen];
    env.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img">
        ${marcas.map((v) => `
          <line class="reja" x1="${ML}" y1="${y(v).toFixed(1)}" x2="${W - MR}" y2="${y(v).toFixed(1)}"/>
          <text class="marca" x="0" y="${(y(v) + 3).toFixed(1)}">${v.toFixed(dec)}</text>
        `).join("")}
        <path class="area" d="${area}"/>
        <path class="linea" d="${linea}"/>
        <circle class="punto" cx="${x(serie.length - 1).toFixed(1)}"
                cy="${y(serie[serie.length - 1].v).toFixed(1)}" r="3.5"/>
      </svg>`;

    const eje = document.createElement("div");
    eje.className = "eje";
    const fecha = (ms) => {
      const d = new Date(ms);
      return this._rango === "year"
        ? `${t.meses[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
        : `${d.getDate()} ${t.meses[d.getMonth()]}`;
    };
    eje.innerHTML = `<span>${fecha(serie[0].t)}</span>`
                  + `<span>${fecha(serie[serie.length - 1].t)}</span>`;
    env.appendChild(eje);
    return env;
  }

  _pie(serie, t, uni, dec) {
    const vs = serie.map((p) => p.v);
    const media = vs.reduce((a, b) => a + b, 0) / vs.length;
    const pie = document.createElement("div");
    pie.className = "pie";
    [[Math.min(...vs), t.minimo], [media, t.media], [Math.max(...vs), t.maximo]]
      .forEach(([v, etiqueta]) => {
        const d = document.createElement("div");
        d.className = "dato";
        d.innerHTML = `<b>${v.toFixed(dec)} ${uni}</b><span>${etiqueta}</span>`;
        pie.appendChild(d);
      });
    return pie;
  }
}

// --- Editor visual ---------------------------------------------------------
// Sin esto, añadir la tarjeta desde la interfaz dejaba al usuario delante de un
// YAML y teniéndose que saber el entity_id. Aquí se elige el reloj de una lista
// y la tarjeta se configura sola. HTML corriente a propósito: los componentes
// internos del frontend (ha-select, ha-form) cambian entre versiones de HA.
const EDT = {
  es: { reloj: "Reloj", auto: "El que esté dando datos", periodo: "Periodo", sinRelojes: "No he encontrado ningún reloj de HA Companion." },
  en: { reloj: "Watch", auto: "Whichever is reporting", periodo: "Range", sinRelojes: "No HA Companion watch found." },
  fr: { reloj: "Montre", auto: "Celle qui envoie des données", periodo: "Période", sinRelojes: "Aucune montre HA Companion trouvée." },
  de: { reloj: "Uhr", auto: "Die gerade Daten sendet", periodo: "Zeitraum", sinRelojes: "Keine HA-Companion-Uhr gefunden." },
  it: { reloj: "Orologio", auto: "Quello che sta inviando dati", periodo: "Periodo", sinRelojes: "Nessun orologio HA Companion trovato." },
};

const ESTILOS_ED = `
  .fila { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
  label { font-size: 12px; color: var(--secondary-text-color); }
  select { font: inherit; padding: 8px; border-radius: 6px;
           border: 1px solid var(--divider-color);
           background: var(--card-background-color); color: var(--primary-text-color); }
  .aviso { color: var(--secondary-text-color); font-size: 13px; }
`;

class HaCompanionWeightCardEditor extends HTMLElement {
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

  _pinta() {
    if (!this.shadowRoot) return;
    const t = EDT[idioma(this._hass)];
    const cuerpo = this.shadowRoot.querySelector(".cuerpo");
    cuerpo.innerHTML = "";

    const fila = (etiqueta, control) => {
      const d = document.createElement("div");
      d.className = "fila";
      const l = document.createElement("label");
      l.textContent = etiqueta;
      d.append(l, control);
      cuerpo.appendChild(d);
    };

    // --- reloj ---
    const sel = document.createElement("select");
    const relojes = this._relojes || [];
    const conPeso = relojes.filter((r) => r.claves.user_weight);
    const opciones = [{ v: "", txt: t.auto }]
      .concat(conPeso.map((r) => ({ v: r.claves.user_weight, txt: r.nombre })));
    opciones.forEach((o) => {
      const op = document.createElement("option");
      op.value = o.v; op.textContent = o.txt;
      if ((this._config.entity || "") === o.v) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener("change", () => this._emitir({ entity: sel.value || undefined }));
    fila(t.reloj, sel);
    if (this._relojes && !conPeso.length) {
      const a = document.createElement("div");
      a.className = "aviso";
      a.textContent = t.sinRelojes;
      cuerpo.appendChild(a);
    }

    // --- periodo ---
    const per = document.createElement("select");
    const tt = T[idioma(this._hass)];
    [["week", tt.semana], ["month", tt.mes], ["year", tt.anio]].forEach(([v, txt]) => {
      const op = document.createElement("option");
      op.value = v; op.textContent = txt;
      if ((this._config.range || "month") === v) op.selected = true;
      per.appendChild(op);
    });
    per.addEventListener("change", () => this._emitir({ range: per.value }));
    fila(t.periodo, per);
  }
}

// Nombre y descripcion del selector de tarjetas. No hay `hass` cuando se
// registra la tarjeta, asi que el idioma sale del <html lang> que pone el
// propio frontend de Home Assistant.
const FICHA = {
  "es": [
    "Peso",
    "El peso de ahora y su evolución por semana, mes o año."
  ],
  "en": [
    "Weight",
    "Current weight and how it has evolved over week, month or year."
  ],
  "fr": [
    "Poids",
    "Le poids actuel et son évolution par semaine, mois ou année."
  ],
  "de": [
    "Gewicht",
    "Das aktuelle Gewicht und sein Verlauf über Woche, Monat oder Jahr."
  ],
  "it": [
    "Peso",
    "Il peso attuale e la sua evoluzione per settimana, mese o anno."
  ]
};

const definir = () => {
  const l = String(document.documentElement.lang || "en").toLowerCase().slice(0, 2);
  const lang = FICHA[l] ? l : "en";
  try {
    if (!customElements.get(TAG)) customElements.define(TAG, HaCompanionWeightCard);
    if (!customElements.get(TAG + "-editor")) {
      customElements.define(TAG + "-editor", HaCompanionWeightCardEditor);
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

// Mismo motivo que en las otras tarjetas: los módulos de extra_module_url se
// evalúan antes de que el frontend termine de montar su registro de elementos.
definir();
let intentos = 0;
const reintento = setInterval(() => {
  definir();
  if (++intentos >= 60) clearInterval(reintento);
}, 250);

console.info("%c HA-COMPANION-WEIGHT-CARD %c v1.0.0 ",
  "color:#fff;background:#34C77B;font-weight:700",
  "color:#34C77B;background:#fff");
