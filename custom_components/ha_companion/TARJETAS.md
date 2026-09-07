# Panel y tarjetas de HA Companion

Desde esta versión, HA Companion trae **su propio panel en la barra lateral** y
**tres tarjetas de Lovelace**. **No hay que instalar nada ni dar de alta ningún
recurso**: la integración lo sirve y lo registra todo sola al arrancar.

| Qué | Dónde |
|---|---|
| Panel **HA Companion** | Barra lateral, en `/ha-companion` |
| `custom:ha-companion-sleep-card` | Hipnograma de la última noche |
| `custom:ha-companion-sleep-week-card` | Las últimas noches, apiladas por fase |
| `custom:ha-companion-workout-card` | Historial de entrenamientos, a su hora real |

Sustituye `balance_jesus` por el nombre de tu reloj en todos los ejemplos.

---

## El panel

Aparece solo en la barra lateral, con todo lo que manda el reloj en una página:

- **Cabecera** — usuario, modelo, edad, altura y peso, más los estados del
  momento en fichas: batería, cargando, puesto, durmiendo, en movimiento,
  actualización pendiente, y un aviso si el reloj lleva demasiado sin
  sincronizar.
- **Hoy** — pasos, calorías, distancia, horas de pie, quema de grasa y PAI, con
  un aro de progreso en los que tienen objetivo. El del PAI usa la meta de Zepp,
  100 puntos en 7 días, que no llega como sensor porque es un valor fijo.
- **Esta semana** — el acumulado de 7 días de esos mismos contadores, con la
  media diaria y sobre cuántos días se ha calculado.
- **Ahora mismo** — pulso, reposo, máximo del día, estrés, oxígeno, temperatura,
  altitud y presión.
- **Sueño** — puntuación, estado y horas, y debajo las dos tarjetas de sueño.
- **Deporte** — número de entrenamientos, carga, VO₂ máx, recuperación, último
  deporte y duración, más la tarjeta de historial.
- **El reloj** — firmware, versión de la app, última publicada, Zepp OS, API
  mínima, brillo, disco y última sincronización.
- **Modos** — no molestar, sueño, teatro, ahorro, ultra ahorro y pantalla
  siempre activa.

El panel dibuja su propia **barra superior**: botón de menú, título con la
versión y las acciones. El botón de menú lo tiene que poner el panel — Home
Assistant no lo añade por su cuenta en los paneles personalizados, y sin él en el
móvil no hay forma de volver a la barra lateral: el panel ocupa la pantalla
entera y te quedas atrapado dentro.

La versión que aparece bajo el título llega por la configuración del panel
(`config["version"]`, junto a `_panel_custom`): cualquier clave suelta de `config`
llega al panel en su propiedad `panel`. El `manifest.json` no se sirve al
frontend, así que de otro modo el panel no sabría en qué versión está.

En pantallas estrechas el selector de reloj baja a su propia línea a todo el
ancho, en vez de estrujar el título hasta partirlo en dos.

**Con varios relojes sale un desplegable** arriba a la derecha. Por defecto se
abre el que esté dando datos, no el primero de la lista: si tienes un reloj viejo
ya retirado, no te lo encuentras al entrar.

Cada sección **se oculta sola si no hay datos**, así que un reloj que no reporte
oxígeno en sangre no enseña una ficha vacía.

### Cómo encuentra las entidades

No las busca por `entity_id`, y esto importa: con `translation_key`, el
`entity_id` sale del nombre **traducido**, así que `is_charging` acaba en
`..._cargando` en español y en otra cosa en cada idioma. El panel lee el
**registro de entidades** y usa el `unique_id`, que es `<ULID>_<clave>` y no
cambia nunca. De ahí saca un mapa `clave -> entity_id` por dispositivo.

Si añades un sensor nuevo a la integración y quieres que salga en el panel, basta
con añadir su **clave** a la lista que toque en `ha-companion-panel.js` (`HOY`,
`AHORA`, `RELOJ` o `MODOS`).

---

## `ha-companion-sleep-card` — el hipnograma de anoche

Un carril por fase y un bloque por tramo, más el reparto con minutos y
porcentaje. Sale del atributo `timeline` del sensor de cronología del sueño.

```yaml
type: custom:ha-companion-sleep-card
entity: sensor.balance_jesus_cronologia_del_sueno
score_entity: sensor.amazfit_balance_jesus     # opcional
```

| Opción | Obligatoria | Qué es |
|---|---|---|
| `entity` | sí | El sensor de cronología del sueño |
| `score_entity` | no | El sensor **maestro** del reloj, del que sale la puntuación |
| `title` | no | Cabecera de la tarjeta |

`score_entity` es el maestro, no un sensor de puntuación: la nota vive en su
atributo `sleep_info`, que **llega como cadena JSON, no como diccionario**. La
tarjeta lo parsea; si escribes tú una plantilla, acuérdate de `from_json`.

**El número grande es el tiempo DORMIDO, no el intervalo en cama.** Un usuario
real señaló que la cabecera decía "8h 38" mientras la leyenda de abajo admitía
"Despierto · 67 min · 13%" — contradictorio a simple vista. El número grande
resta los tramos de fase despierta (`FASE_CANON` normalizado a `"AWAKE"`); el
intervalo completo en cama (con los despertares incluidos) se queda, pero
pequeño, junto a la hora de inicio/fin. La leyenda de reparto por fases no
cambia: sigue mostrando el porcentaje de cada una sobre el total en cama, así
que "Despierto · 13%" ahora es coherente con el número de arriba en vez de
contradecirlo.

Ojo: **el estado del sensor `sleep_timeline` no ha cambiado**, sigue siendo la
suma de todos los tramos (incluida la fase despierta) — cambiar el estado
rompería el histórico de quien ya lo tenga grabado en el recorder. Esto es
puramente un cálculo del lado de la tarjeta, a partir del atributo `timeline`.

Comprobado que `sleep_info.totalTime` (el campo que manda el propio Zepp) **no
sirve como referencia**: es literalmente `endTime − startTime`, ni siquiera
descuenta los despertares — no es "el cálculo de sueño de Zepp", es solo el
intervalo. Verificado con datos reales: una noche con 546 min de `totalTime`
no coincidía ni con 451 (dormido) ni con 518 (en cama).

---

## `ha-companion-sleep-week-card` — la semana

Una columna por noche, apiladas por fase, con la media arriba.

```yaml
type: custom:ha-companion-sleep-week-card
prefix: sensor.balance_jesus
score_entity: sensor.balance_jesus_puntuacion_del_sueno         # opcional
timeline_entity: sensor.balance_jesus_cronologia_del_sueno      # opcional
days: 7                                                          # opcional
```

| Opción | Obligatoria | Qué es |
|---|---|---|
| `prefix` | sí\* | Prefijo de tus sensores; de ahí compone `_sueno_profundo`, `_sueno_rem`, `_sueno_ligero` y `_tiempo_despierto` |
| `entities` | sí\* | Alternativa a `prefix`: `{DEEP: sensor.x, REM: ..., LIGHT: ..., AWAKE: ...}` — claves internas fijas, no traducidas. Es lo que usa el panel, que resuelve los ids por `unique_id` y no depende del idioma |
| `score_entity` | no | Puntuación del sueño, se pinta bajo cada columna |
| `timeline_entity` | no | El sensor de cronología del sueño. Sin él las columnas no son pulsables |
| `days` | no | Cuántas noches, 7 por defecto |
| `title` | no | Cabecera de la tarjeta |

\* Hace falta uno de los dos, `prefix` o `entities`.

**Pulsar una noche con datos abre un hipnograma** de esa noche en concreto,
igual que `ha-companion-sleep-card` pero fijado a ese día — es la petición de
un usuario real, que quería poder mirar el detalle de una noche pasada sin
esperar a que fuera "la última". No sale de las estadísticas (que solo dan
los totales por fase), sino de `history/history_during_period` sobre
`timeline_entity`: pide el ESTADO (con sus atributos completos) del final de
ese día, con el mismo corte de las 13:00 que agrupó la columna, y pinta su
atributo `timeline` tal cual estaba en ese momento.

Dos límites de esto, por cómo funciona el historial de estados de HA (no las
estadísticas a largo plazo, que no guardan el detalle):

- Solo funciona mientras ese día no se haya purgado del historial de estados
  (por defecto **10 días**; si el usuario ha bajado esa retención, menos).
  Pasado ese plazo, el modal avisa de que no hay detalle guardado en vez de
  fallar en silencio.
- **El historial de estados es un museo**: guarda lo que la integración
  escribía en cada momento, no lo que escribe hoy. Verificado con datos reales
  que el atributo `timeline` ha tenido tres formas a lo largo del tiempo —
  clave cruda del reloj sin traducir (`"LIGHT_STAGE"`, de antes de que
  existiera la traducción), texto ya traducido (`"Sueño Ligero"`) y, por
  último, las dos cosas a la vez más `stage`. La fase se reconoce probando las
  tres, en este orden: `stage` (si el tramo lo trae), el texto traducido
  (`FASE_CANON`) y, si tampoco encaja, la propia clave cruda por si `phase`
  fuera de la primera época. Sin este último paso, un tramo antiguo de la fase
  despierta se contaba como dormido — bug real, encontrado contra historial de
  verdad, no con datos simulados.

No necesita nada nuevo de la integración: esos sensores llevan
`state_class: measurement`, así que **el recorder ya les genera estadísticas
diarias solo**. La tarjeta se las pide por websocket **por horas** y de cada día se queda con la
última lectura anterior a las **13:00**.

Con el máximo diario los números salían inflados: el reloj sincroniza varias
veces al día y el máximo de cada fase caía en un momento distinto, así que
sumarlos daba una noche que nunca existió — 9 h 23 de media cuando la noche real
había sido de 8 h 0. Tomando todas las fases del **mismo instante**, el reparto
cuadra con el hipnograma al minuto.

**Al principio saldrá vacía y se irá llenando.** Solo puede pintar noches que ya
estén en las estadísticas: si acabas de instalar, no hay ninguna.

**Las noches en blanco no son noches sin dormir.** Un reinicio de Home Assistant
recrea el sensor maestro vacío y ese día queda registrado a 0. La tarjeta lo
trata como hueco y lo dibuja con un recuadro punteado, en vez de pintar un cero
que sería mentira.

---

## `ha-companion-workout-card` — los entrenamientos

Una fila por día y cada sesión colocada **en su hora real** sobre el eje de 24 h,
para ver de un vistazo a qué horas entrenas.

```yaml
type: custom:ha-companion-workout-card
entity: sensor.balance_jesus_recent_workouts
load_entity: sensor.balance_jesus_carga_de_entrenamiento          # opcional
vo2_entity: sensor.balance_jesus_vo2_max                          # opcional
recovery_entity: sensor.balance_jesus_tiempo_de_recuperacion_total # opcional
days: 7                                                            # opcional
```

| Opción | Obligatoria | Qué es |
|---|---|---|
| `entity` | sí | El sensor de entrenamientos recientes (usa su atributo `workouts`) |
| `load_entity` / `vo2_entity` / `recovery_entity` | no | Agregados que se pintan al pie |
| `days` | no | Cuántos días, 7 por defecto |
| `title` | no | Cabecera de la tarjeta |

### Por qué no hay zonas de intensidad

Es la pregunta que va a hacer todo el mundo, así que conviene tenerla escrita.

**Zepp OS no las expone.** `Workout.getHistory()` devuelve por sesión únicamente
`startTime` y `duration`; `sportType` viene de propina y ni siquiera está en los
tipos oficiales del SDK. No existe un `getSamples()`, ni pulso, ni ritmo, ni
distancia, ni calorías por sesión. `Workout.getStatus()` solo da agregados
(VO₂ máx, carga de entrenamiento, tiempo de recuperación), no desglose por
sesión. El detalle segundo a segundo del pulso durante un entrenamiento se queda
en la nube del fabricante y no está disponible para aplicaciones de terceros.

Tampoco vale reconstruirlo del historial de Home Assistant: el reloj empuja el
pulso en segundo plano cada ~5 minutos, así que un entrenamiento de 15 minutos
deja unas 5 muestras, y planas. Con eso no se puede pintar una intensidad sin
inventarla.

Existe `Workout.getUserHrZoneSettings()` (API 4.2), pero devuelve los **umbrales
configurados** de las zonas, no cuánto tiempo pasaste en cada una. Serviría para
otra cosa, no para esto.

---

## Cómo se sirven, para quien toque el código

Todo vive en `custom_components/ha_companion/www/` y se publica en
`async_setup_entry`:

```python
CARD_STATIC_URL = "/ha_companion_static"
CARD_DIR = "custom_components/ha_companion/www"
CARDS = ("ha-companion-sleep-card.js", ...)

PANEL_JS = "ha-companion-panel.js"
PANEL_ELEMENT = "ha-companion-panel"
PANEL_URL_PATH = "ha-companion"
```

Se registra el directorio como ruta estática y cada tarjeta con
`add_extra_js_url`. **Para añadir una tarjeta nueva basta con dejar el `.js` en
`www/` y añadir su nombre a `CARDS`.**

El panel se registra aparte con `frontend.async_register_built_in_panel`:

```python
frontend.async_register_built_in_panel(
    hass,
    component_name="custom",
    sidebar_title="HA Companion",
    sidebar_icon="mdi:watch",
    frontend_url_path=PANEL_URL_PATH,
    config={"_panel_custom": {
        "name": PANEL_ELEMENT,
        "module_url": f"{CARD_STATIC_URL}/{PANEL_JS}?v={_card_token(hass, PANEL_JS)}",
        "embed_iframe": False, "trust_external": False,
    }},
    require_admin=False,
)
```

**Los parámetros de carga van dentro de `config._panel_custom`.** El
`ha-panel-custom.ts` del frontend solo mira ahí; las claves sueltas del primer
nivel se ignoran en silencio y el panel sale en blanco.

El registro del panel va en su propio `try`, separado del de las tarjetas: si
fallara, las tarjetas tienen que seguir funcionando.

**El panel se registra de nuevo en cada arranque de la entrada**, quitándolo
antes con `frontend.async_remove_panel`. No es un descuido: su `module_url` lleva
el token de caché, que se calcula en ese momento. Si nos limitásemos a saltar el
registro cuando ya existe, un panel actualizado seguiría sirviéndose con la URL
vieja hasta el siguiente reinicio completo. Así basta con **recargar la
integración** para publicar un cambio del `.js`.

**Todo lo que enseña un valor se puede pulsar** y abre el diálogo de más
información de esa entidad, que es donde está la gráfica del historial: las
fichas de *Hoy*, *Esta semana*, *Ahora mismo* y *El reloj*, y también las fichas
de estado de la cabecera y las de *Modos*. Van con `role="button"` y `tabindex`,
así que responden igual con el teclado.

El evento se lanza desde el propio panel:

```js
this.dispatchEvent(new CustomEvent("hass-more-info", {
  detail: { entityId }, bubbles: true, composed: true,
}));
```

**`composed: true` es imprescindible.** Sin él, el evento no sale del shadow DOM
del panel y nunca llega a `<home-assistant>`, que es quien abre el diálogo. Con
`bubbles` solo no basta.

Tres detalles del panel que costaron:

- **Los aros de progreso llevan el icono dentro, y el icono es hermano del aro en
  el DOM, no hijo.** La regla tiene que colgar de `.envoltura-aro`; con un
  selector `.aro ha-icon` no casa nada, el `position: absolute` no se aplica y
  el icono cae fuera del círculo.

- **Cuidado con las comillas invertidas dentro del bloque de estilos.** El CSS
  vive en una plantilla de JavaScript, así que una comilla invertida en un
  comentario —al citar un selector, por ejemplo— cierra la plantilla y rompe el
  módulo entero.

Tres cosas que costaron y conviene no deshacer:

- **La URL lleva la fecha del fichero** (`?v=<mtime>`). La ruta estática se sirve
  sin `Cache-Control`, así que el navegador aplica caché heurística: con un `?v=`
  fijo puede quedarse con una copia vieja para siempre. Atando la URL al `mtime`,
  cada cambio produce una URL que el navegador no ha visto nunca. El token se
  calcula al arrancar, así que **al editar un `.js` hay que reiniciar** (o
  recargar la integración) para que se propague.

- **Cada tarjeta reafirma su registro durante 15 segundos.** Los módulos de
  `extra_module_url` se evalúan muy pronto, antes de que el frontend termine de
  montar su registro de elementos: la definición cae en un registro que después
  se reemplaza y la tarjeta sale como *Error de configuración* aunque el módulo
  se haya ejecutado entero (su banner aparece en la consola). Como el módulo ya
  está en el mapa de módulos del navegador, volver a cargarlo no lo re-ejecuta.
  De ahí el `setInterval` que reintenta el `customElements.define`.

- **`setConfig` se llama más de una vez sobre el mismo elemento.** Llamar a
  `attachShadow` la segunda vez lanza `NotSupportedError` y la tarjeta queda en
  *Error de configuración*. Por eso las tres crean el shadow root solo si no
  existe ya.

Y una que no es del código pero muerde igual: **la tarjeta markdown de Home
Assistant borra todos los atributos `style`**. Los `<div>` sobreviven, los
estilos no. Cualquier cosa que necesite pintar barras o colores calculados
necesita una tarjeta de verdad; con markdown solo se consigue texto plano.

---

## Acumulado de 7 días (`week_extract`)

Cinco sensores publican el acumulado de la semana en sus atributos: **pasos,
calorías, distancia, quema de grasa y horas de pie**.

| Atributo | Qué es |
|---|---|
| `week_days` | `[{date, total}]`, el total de cada día |
| `week_total` | La suma de todos ellos |
| `week_average` | La media por día, solo sobre los días con datos |
| `week_best` | El mejor día |

Están disponibles para cualquiera desde una plantilla:

```jinja
{{ state_attr('sensor.balance_jesus_pasos', 'week_total') }}
```

No hace falta configurar nada: sale de las estadísticas que el recorder ya
genera por el `state_class` que estos sensores tienen.

### Por qué se leen por horas y no por días

Esta es la parte que hay que respetar si alguien toca `_async_refresh_week`, y
son dos trampas independientes que se comieron los números en la primera versión:

**1. A las 00:xx el contador todavía marca lo de AYER.** El reloj lo reinicia un
rato después de medianoche. Medido en horas de pie el 2 de septiembre:

```
0h:15   1h:0   2h:2   3h:2  ...  14h:9
```

El máximo del día decía **15** para un día que iba por 9, inflando el día y la
semana. Por eso **se descarta la hora 0**.

**2. El campo con el valor depende del `state_class`, y no se solapan.**

| `state_class` | Sensores | Qué guarda el recorder |
|---|---|---|
| `total_increasing` | pasos, calorías, distancia | `state` y un `sum` acumulado, **sin max** |
| `measurement` | quema de grasa, horas de pie | mean/min/max, **sin state** |

Se piden los dos y se prefiere el último `state` del día, que cubre ambos casos.

**Nunca uses `change`.** Es la diferencia del `sum` acumulado y cuenta cada
reinicio como acumulación nueva: dio **-62102 pasos** para un día de 4292.

---

## El estado sobrevive a los reinicios

El reloj escribe el sensor maestro por la **API REST** de Home Assistant, y los
estados puestos así **no se restauran** al reiniciar. Antes, cada reinicio dejaba
la integración entera en `unavailable` hasta la siguiente sincronización, que
puede tardar horas — y mientras tanto el recorder anotaba ceros que luego
ensuciaban las estadísticas y las tarjetas semanales.

Ahora la integración **guarda en disco el último envío** del reloj
(`.storage/ha_companion.master.<usuario>`) y lo repone al arrancar. El reloj lo
pisa en cuanto sincroniza.

Dos detalles del guardado:

- Se escribe con `async_delay_save` y 20 segundos de espera, para que una ráfaga
  de envíos no se convierta en una ráfaga de escrituras en disco.
- **No se guarda cualquier estado.** Si no trae `sleep_stage_data`, `steps_state`
  ni `battery_state`, es el marcador vacío que se crea al arrancar y no un envío
  de verdad; guardarlo pisaría la copia buena con una vacía.

---

## Los deportes salen en tu idioma

`SPORT_TYPES` viene del SDK de Zepp y está **solo en inglés**. Antes se usaba tal
cual, así que un panel en español enseñaba *Walking* y *Pool Swimming* al lado de
todo lo demás traducido.

Ahora hay `SPORT_TYPE_LABELS` en `const.py`, con los **181 deportes** en español,
y se aplica en los dos sitios donde aparece un nombre de deporte: el sensor de
último deporte (por `lookup_table`) y el historial de entrenamientos. Funciona
igual que `SLEEP_PHASE_LABELS` con las fases del sueño: mira
`hass.config.language` y, **si un nombre no está en la tabla, se queda en inglés
en vez de romperse**.

Para añadir otro idioma basta con otra clave junto a `"es"`.

**La tabla de Zepp siempre irá por detrás del reloj.** Cada actualización del
firmware puede traer deportes nuevos: apareció un entrenamiento con el código
1215 (pasear al perro) cuando la tabla acababa en 1203. Un código desconocido no
es un fallo, es lo normal, y se muestra como «Deporte 1215» conservando el
número — que es justo lo que hace falta para añadirlo a `SPORT_TYPES` luego.

---

## Sensor de sincronización (`sync_age`)

Minutos desde el último envío del reloj, calculado a partir de `record_time`.

| Atributo | Qué es |
|---|---|
| `last_sync` | Marca de tiempo del último envío |
| `stale_after_minutes` | Umbral, 60 por defecto |
| `is_stale` | `true` cuando se pasa del umbral |

**Es el único sensor que se mueve solo.** Todos los demás son pasivos: solo
cambian cuando el reloj envía algo. Eso hacía que una app parada fuera invisible
— el panel seguía enseñando las cifras de la mañana como si fueran de ahora y
nada lo desmentía. Este se recalcula cada minuto, así que el número crece cuando
el reloj calla, y cualquiera puede montar un aviso encima:

```yaml
- alias: El reloj no sincroniza
  trigger:
    - platform: state
      entity_id: sensor.balance_jesus_desde_la_ultima_sincronizacion
      attribute: is_stale
      to: true
```

En el panel sale como una ficha de aviso en la cabecera, solo cuando toca.

---

## Automatizar con el reloj (disparadores de dispositivo)

El reloj sabe cosas que ningún sensor de la casa puede saber: que te has
dormido, que te has despertado, que te lo has quitado. Va en tu muñeca.

Hasta ahora, usar eso obligaba a saberse el `entity_id` de memoria — y esos ids
salen del nombre **traducido**, así que cambian con el idioma y con la
instalación. Ahora están en el desplegable de la interfaz: **Ajustes →
Automatizaciones → Disparador → Dispositivo**, eliges el reloj y sale la lista.

| Disparador | Cuándo salta |
|---|---|
| Me he dormido / Me he despertado | El reloj detecta el cambio |
| Me he puesto en marcha / Me he parado | Detección de movimiento |
| Me he puesto / quitado el reloj | Cambia el estado de uso |
| Se ha puesto a cargar / Ha dejado de cargar | |
| Se está quedando sin batería | Baja del 20 % |
| Tiene una actualización disponible | |
| Lleva demasiado sin sincronizar | Se pasa de `stale_after_minutes` |

Solo aparecen los que ese reloj puede dar: si un modelo no informa del uso, no
ofrece «me he quitado el reloj».

### Blueprints incluidos

En `blueprints/automation/ha_companion/`. Se copian a
`/config/blueprints/automation/ha_companion/`:

| Blueprint | Para qué |
|---|---|
| `ha_companion_dormido.yaml` | Apagar la casa cuando te duermes, con espera de confirmación para que una cabezada no cuente |
| `ha_companion_despierto.yaml` | Subir persianas al despertar, con franja horaria para que un despertar de madrugada no lo dispare |
| `ha_companion_sin_sincronizar.yaml` | Avisar si el reloj deja de enviar |

### Tres cosas que costaron, para quien toque `device_trigger.py`

- **`entity_id` no siempre viene, y cuando viene no siempre es un `entity_id`.**
  La interfaz puede guardar el identificador del registro, y un disparador
  escrito a mano puede traer solo dispositivo y tipo. Por eso el esquema lo
  declara **opcional** y con `entity_id_or_uuid`, y `_resolver()` cubre los tres
  casos. Dar por hecho que está presente hacía saltar un `KeyError` al enganchar
  la automatización — y el fallo no se ve al crearla, solo en el registro.

- **Los esquemas de las plataformas base no se llaman igual.** `state` expone
  `TRIGGER_STATE_SCHEMA` y `TRIGGER_ATTRIBUTE_SCHEMA`; `numeric_state` solo
  `_TRIGGER_SCHEMA`, con guion bajo. No existe ningún `TRIGGER_SCHEMA`. Se
  resuelven con `getattr` y alternativa para que un cambio de nombre en Home
  Assistant no deje la integración sin disparadores de golpe.

- **Editar `device_trigger.py` no basta con recargar la integración.** El módulo
  ya está importado y recargar la entrada no lo reimporta: hay que reiniciar
  Home Assistant. Distinto de las tarjetas, que sí se propagan recargando.
