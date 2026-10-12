# Changelog

Todos los cambios notables de la integración **HA Companion** para Home Assistant.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado es [SemVer](https://semver.org/lang/es/).

## [0.1.10] - Sin publicar

### Añadido
- **Las siestas, en las tarjetas de sueño.** Lo pidió un usuario: la siesta
  aparece en la leyenda entre Despierto y Ligero, y suma al tiempo dormido.
  - **Tarjeta de anoche:** fila "Siesta" con su duración y su porcentaje, y el
    número grande pasa a ser sueño + siestas. No se dibuja en el hipnograma: una
    siesta de la tarde cae fuera del eje de la noche. Si solo hay siestas (quien
    duerme de día), la tarjeta ya no dice "sin datos": enseña las siestas.
  - **Tarjeta semanal:** un tramo más en cada columna y en la media, y la noche
    que se abre al pulsar una columna también lo enseña. Las siestas se leen con
    el máximo del día entero, no con el corte de las 13:00 de las fases: el reloj
    las pone a cero a medianoche y con el corte se perdían las de la tarde.
  - Las tarjetas ya puestas encuentran solas el sensor de siestas del mismo
    reloj; no hay que tocar su configuración. El sensor "Tiempo total de sueño"
    no cambia: sigue siendo la cifra del reloj, la misma que da la app Zepp.
- **Energía de hoy para el reloj.** Nueva dirección `/api/ha_companion/energy`
  para la pantalla Energía de la app (2.15): lee el panel de Energía que el
  usuario ya tiene montado en HA y devuelve lo de hoy con las estadísticas del
  propio HA, las mismas cifras que el panel. Incluye:
  - el consumo de la casa y su coste;
  - la red (importado y vertido), la solar, la batería, el gas y el agua, según
    lo que tenga configurado;
  - lo que ha gastado cada aparato y la potencia que tira ahora.

  En la app no hay nada que configurar. La potencia de ahora sale del sensor de
  potencia que el usuario haya puesto en el panel o, si no puso ninguno, del
  sensor de potencia del mismo dispositivo que el contador.

## [0.1.9] - 2026-10-08

### Añadido
- **Copia de seguridad de la configuración del reloj.** Cambiar de reloj o
  reinstalar la app obligaba a volver a elegir las entidades una a una,
  reordenar el menú y reconfigurar los widgets. Ahora la app puede guardar su
  configuración aquí y recuperarla después:
  - `POST /api/ha_companion/backup` la guarda (indexada por reloj, para que
    dos relojes no se pisen), `GET` la devuelve.
  - Dos entidades nuevas: **Copia de Configuración**, que dice si la hay, y
    **Fecha de la Copia**, cuyo valor es la fecha de la última — así se ve en
    una tarjeta de un vistazo y se puede automatizar un aviso si lleva mucho
    sin actualizarse. En los doce idiomas de la integración.
  - Los ajustes del teléfono también enseñan esa fecha al abrirlos, sin tener
    que exportar antes para enterarse.
  - **Las credenciales no se guardan**: la URL y el token hay que teclearlos
    igualmente al reinstalar, así que no hacen falta en la copia y no quedan
    en disco.
  Necesita la versión **2.13 de la app del reloj**, que es la que trae los
  botones de exportar e importar. Hasta que la 2.13 esté publicada, esas dos
  entidades se ven vacías —*Copia de Configuración* en `off` y *Fecha de la
  Copia* sin valor— porque todavía no hay nada que exporte: es lo esperado, no
  un fallo.
- **Tarjeta nueva del peso** (`custom:ha-companion-weight-card`), a petición de
  un usuario: el peso de ahora mismo, cuánto ha subido o bajado en el periodo,
  la línea de evolución y el mínimo, la media y el máximo. Tres botones para
  ver la semana, el mes o el año. El peso aparece también en la sección
  "Ahora mismo" del panel.
- El sensor de peso pasa a llevar `state_class: measurement` (y su clase de
  dispositivo), que es lo que hace que Home Assistant le guarde estadísticas de
  largo plazo. **Ojo: HA no las rellena hacia atrás**, así que la gráfica
  empieza el día que se instale esta versión; los primeros días la tarjeta tira
  del historial normal para no salir vacía.
- **El selector de tarjetas sale en tu idioma.** El nombre y la descripción de
  las cuatro estaban fijos en inglés aunque Home Assistant estuviera en otro
  idioma; ahora siguen al de la instancia (es, en, fr, de, it).
- **Sensores de siestas**, a petición de un usuario que hace turnos de noche:
  Zepp apunta el sueño fuera de horas como siestas, aparte del sueño principal,
  así que su descanso de verdad no aparecía por ningún lado. Son cuatro:
  **Siestas** (cuántas hoy), **Tiempo de Siestas** (minutos en total), y el
  **inicio** y el **fin de la última**. En los doce idiomas.
  Necesita la **2.13 de la app**, que es la que empieza a mandar ese dato: hasta
  entonces los cuatro se ven vacíos, igual que los de la copia. Y en relojes
  anteriores a Zepp OS 3.0 seguirán vacíos, porque ahí el reloj no da siestas.
- **Editor visual en las cuatro tarjetas.** Al añadirlas desde la interfaz sale
  un desplegable con los relojes dados de alta: se elige el tuyo por su nombre y
  la tarjeta queda configurada, sin tocar YAML ni saberse ningún `entity_id`.
  Con un solo reloj ni eso: la opción por defecto ya vale.

### Corregido
- **El orden de las fases en la tarjeta semanal.** La 0.1.8 puso el orden
  acordado —despierto, ligero, profundo, REM— en la tarjeta de la noche y en el
  hipnograma, pero en la semanal se quedó al revés y con el profundo y el REM
  cambiados: la barra se pintaba con `column-reverse`, así que el array iba en
  sentido contrario a lo que se veía. Ahora la barra, su leyenda y el texto que
  sale al pasar el ratón siguen los cuatro el mismo orden. Avisado por el mismo
  usuario que pidió el cambio de la 0.1.8.
- **Recargar la integración no refrescaba las tarjetas.** Sus URLs se anunciaban
  una sola vez por arranque, así que tras actualizar seguía anunciándose la
  dirección anterior hasta reiniciar Home Assistant entero — y como la
  dirección no cambiaba pero el fichero sí, el navegador servía el archivo
  viejo de su caché. Ahora se vuelven a anunciar en cada arranque de la
  entrada, como ya hacía el panel, y se retira la dirección anterior para que
  no queden las dos.
- **Las tarjetas ya se pueden añadir a cualquier panel, no solo al nuestro.**
  Se registraban en todo el frontend desde el principio, pero al añadirlas desde
  "Añadir tarjeta" venían inservibles salvo en una instalación como la del
  autor: la semanal traía escrito su propio reloj (`sensor.balance_jesus`) y
  buscaba las fases por sufijos en español, la del sueño buscaba un `entity_id`
  que solo existe en español y la de entrenamientos, uno que solo existe en
  inglés. Ahora **si no se configura entidad, cada tarjeta busca sola** la del
  reloj que esté dando datos, por la clave del registro, que no cambia con el
  idioma. Configurarlas a mano sigue funcionando igual.

## [0.1.8] - 2026-09-14

### Corregido
- **`async_setup_entry` bloqueaba el bucle de eventos al leer el manifest y
  las fechas de las tarjetas** (`open()` y `os.path.getmtime()` a pelo, sin
  pasar por el executor) — HA lo detectaba y avisaba en el log
  (`homeassistant.util.loop`, "Detected blocking call to open..."), reportado
  por un usuario real. La versión ahora se lee del `Integration` que HA ya
  tiene cargado (`async_get_integration`, sin tocar disco); el token de caché
  de las tarjetas usa `hass.async_add_executor_job`.
- **La tarjeta de la última noche no mostraba la puntuación del sueño** si en
  `score_entity` se ponía el sensor dedicado **Puntuación del sueño** (lo
  intuitivo, y lo que ya pide la tarjeta semanal) — solo funcionaba con el
  sensor maestro. Reportado por un usuario real. Ahora `score_entity` acepta
  los dos: primero mira si es el maestro (atributo `sleep_info`), si no usa
  el propio estado del sensor.
- **Orden de las fases en la leyenda**, en ambas tarjetas de sueño: ahora
  Despierto, Ligero, Profundo, REM — de peor a mejor calidad de sueño, más
  fácil de leer de un vistazo. Petición de un usuario real.
- **El sensor "Estado del Reloj" salía como "Deporte 1"/"Deporte 2"** en vez
  de "Llevando puesto"/"En movimiento". Reportado por un usuario real. Causa:
  desde la 0.1.6, cualquier sensor con `lookup_table` (el mecanismo genérico
  de extractor) pasaba SIEMPRE por la traducción de deportes, aunque el
  comentario del propio código ya avisaba de que eso pasaría el día que
  hubiera una segunda `lookup_table` — y lo hubo, la del estado del reloj
  (`WEAR_STATES`), añadida en la misma 0.1.6. Afecta a la 0.1.6 y la 0.1.7,
  las dos publicadas.
- **Aviso "Removing unknown panel ha-companion" en el log de HA.** Lo
  provocaba la propia integración: al registrar el panel se quita primero el
  anterior, y si no había ninguno (primer arranque, o tras borrar y volver a
  añadir la integración) HA lo avisaba con un WARNING. No indicaba ningún
  fallo — reportado por un usuario real que lo confundió con la causa de que
  no le llegaran datos. Ahora se pide explícitamente que no avise.
- **Los blueprints no aparecían solos en Ajustes → Automatizaciones →
  Blueprints.** Reportado por varios usuarios reales. Nunca hubo un fallo
  puntual: Home Assistant no descubre blueprints por estar dentro de
  `custom_components/ha_companion/`, solo mira `config/blueprints/
  automation/<carpeta>/` — hacía falta que la propia integración los
  copiara ahí, y eso nunca se implementó. Ahora `async_setup_entry` los
  copia una vez por instancia (sin pisar nada si el usuario ya los tenía
  importados o tocados a mano). Afecta a todas las versiones publicadas con
  blueprints (0.1.6 y 0.1.7).

## [0.1.7] - 2026-09-07

### Añadido
- **El panel y las tres tarjetas de Lovelace ahora se adaptan al idioma de
  Home Assistant** (español, inglés, francés, alemán e italiano); antes su
  texto estaba fijo en español sin más, sin mirar el idioma de la instancia.
  Cualquier otro idioma cae en inglés.
- **Deportes traducidos también a francés, alemán e italiano** (además de
  español), 180 en cada idioma.
- **Pulsar una noche en `ha-companion-sleep-week-card` abre su hipnograma**,
  igual que el de la última noche pero fijado a ese día — petición de un
  usuario real. Usa el historial de estados de HA (`history/history_during_period`
  sobre el sensor de cronología del sueño), no las estadísticas, así que solo
  funciona mientras ese día no se haya purgado del historial (por defecto 10
  días, menos si se ha bajado `purge_keep_days`); pasado ese plazo, avisa en
  vez de fallar en silencio.
- Deporte **Hyrox** (código 1222) añadido a la tabla.

### Corregido
- **"Entrenamiento de fuerza" acortado a "Fuerza"** en la traducción al
  español — el nombre largo no cabía bien en las fichas.
- **"Cross-training" se deja sin traducir** en español: la traducción
  ("Entrenamiento cruzado") se confundía con CrossFit, que es un deporte
  Zepp distinto.
- **El número grande del hipnograma contaba el tiempo despierto como
  dormido.** Un usuario real señaló que la cabecera decía «8h 38» mientras la
  leyenda de debajo admitía «Despierto · 67 min · 13 %» — contradictorio.
  Ahora el número grande es el tiempo dormido de verdad (descuenta los tramos
  de fase despierta); el intervalo completo en cama se sigue viendo, pero
  pequeño, junto a la hora. Cambio solo en la tarjeta: el estado del sensor
  `sleep_timeline` no se toca, para no romper el histórico de nadie.
- **El hipnograma de una noche pasada (tarjeta semanal) podía contar el
  despertar como dormido.** El historial de estados de HA guarda lo que la
  integración escribía en cada momento, y el atributo `timeline` ha tenido
  tres formas distintas con el tiempo (clave cruda del reloj, texto ya
  traducido, y ambas cosas junto a `stage`); un tramo antiguo con la clave
  cruda sin traducir no se reconocía como fase despierta y se sumaba al
  tiempo dormido. Verificado y corregido contra historial real, no con datos
  de prueba.

## [0.1.6] - 2026-09-03

### Añadido
- **Panel propio en la barra lateral** (`/ha-companion`) con todo lo que manda el
  reloj: estado y datos personales, contadores del día con aro de progreso,
  acumulado de la semana, medidas del momento, sueño, deporte, información del
  reloj y modos. Cada ficha abre el historial de su entidad al pulsarla. Con
  varios relojes aparece un desplegable, y se abre por defecto el que esté dando
  datos.
- **Tres tarjetas de Lovelace**, servidas y registradas por la propia
  integración: no hay que instalar nada ni dar de alta recursos a mano.
  - `ha-companion-sleep-card` — hipnograma de la última noche.
  - `ha-companion-sleep-week-card` — las últimas noches apiladas por fase.
  - `ha-companion-workout-card` — entrenamientos colocados a su hora real.
- **Disparadores de dispositivo** (`device_trigger.py`): once disparadores desde
  el desplegable de la interfaz, sin necesidad de saberse ningún `entity_id` —
  me he dormido, me he despertado, me he puesto o quitado el reloj, empiezo o
  dejo de moverme, carga, batería baja, actualización disponible y reloj sin
  sincronizar. Solo se ofrecen los que ese reloj puede dar.
- **Tres blueprints** en `blueprints/automation/ha_companion/`: apagar la casa al
  dormirse (con espera de confirmación), actuar al despertar (con franja
  horaria) y avisar si el reloj deja de sincronizar.
- **Sensor `sync_age`**: minutos desde el último envío del reloj, con `last_sync`
  e `is_stale`. Es el único sensor que se actualiza solo; los demás son pasivos,
  así que una aplicación parada era invisible — los sensores no pasaban a «no
  disponible», se quedaban congelados con las últimas cifras.
- **Sensor `sleep_timeline`**: cronología del sueño de la última noche, con el
  total en minutos como estado y el detalle por tramos (fase, hora de inicio/fin
  y duración) en `timeline`, más `segment_count`. El nombre de cada fase sale en
  español o inglés según el idioma de la instancia de HA.
- **Sensor `is_charging`**: estado de carga deducido de la diferencia de batería
  entre envíos, ya que Zepp OS no expone un indicador nativo.
- **Atributo `last_week`** en PAI y Estrés: media/mín/máx diarios de los últimos
  7 días, leído de las estadísticas propias del recorder de HA (ambos sensores ya
  llevan `state_class: measurement`, así que HA ya las generaba solo).
- **Acumulado de 7 días** en pasos, calorías, distancia, quema de grasa y horas
  de pie: atributos `week_days`, `week_total`, `week_average` y `week_best`,
  disponibles para cualquier plantilla. Sale de las estadísticas que el recorder
  ya generaba, sin configuración añadida.
- **Atributo `workouts`** en el sensor de entrenamientos recientes, con los datos
  estructurados (inicio en ISO, deporte, duración) junto a las frases de
  siempre, para no obligar a parsear texto.
- Documentación de todo lo anterior en `TARJETAS.md`.
- El panel se adapta al móvil: barra superior con **botón de menú** —sin él no
  había forma de volver a la barra lateral de Home Assistant desde el móvil, el
  panel ocupaba la pantalla entera y se quedaba uno atrapado dentro—, y el
  selector de reloj baja a su propia línea a todo el ancho en pantallas
  estrechas, en lugar de estrujar el título hasta partirlo en dos.
- La cabecera del panel muestra la versión de la integración, que llega por la
  configuración del panel.

### Corregido
- **El estado sobrevive a los reinicios.** El reloj escribe el sensor maestro por
  la API REST, y Home Assistant no restaura los estados puestos así: cada
  reinicio dejaba la integración entera en «no disponible» hasta la siguiente
  sincronización, que puede tardar horas, y mientras tanto el recorder anotaba
  ceros que ensuciaban las estadísticas. Ahora se guarda el último envío y se
  repone al arrancar.
- **Los nombres de deporte salen traducidos.** `SPORT_TYPES` viene del SDK de
  Zepp solo en inglés y se usaba tal cual, así que una instalación en español
  mostraba *Walking* y *Pool Swimming*. Añadido `SPORT_TYPE_LABELS` con los 181
  deportes, con la misma mecánica que `SLEEP_PHASE_LABELS`: lo que no esté en la
  tabla se queda en inglés en vez de romperse.
- **Un deporte sin nombre ya no sale como «Unknown».** La tabla de Zepp se queda
  corta con cada actualización del reloj: un entrenamiento real llegó con el
  código 1215 (pasear al perro) cuando la tabla acababa en 1203. Añadido ese
  código, y los que falten muestran ahora «Deporte 1215» en lugar de
  «Unknown (1215)» —conservando el número, que es lo que permite añadirlos
  después.
- **Las fechas del historial de entrenamientos.** `start` llega como epoch en
  milisegundos y se pasaba a `datetime.fromisoformat()`, que espera texto ISO:
  fallaba en nueve de cada diez entradas y dejaba el número crudo, y en la décima
  interpretaba los dígitos como un año (de ahí fechas del tipo «1788-08-28»).
- **`is_charging` podía quedarse en «desconocido» para siempre** si dos lecturas
  consecutivas de batería eran iguales, porque esperaba una diferencia que podía
  no llegar nunca.

### Notas de actualización
- Cinco sensores de modos del sistema pueden tener el `entity_id` acabado en
  `_none`, `_none_2`… en instalaciones antiguas. Se generaron cuando aún no
  existía su traducción y el registro fija el `entity_id` de forma permanente:
  recargar no lo renombra. El **nombre visible es correcto**; si molesta, se
  renombra a mano desde el registro de entidades. Las instalaciones nuevas no lo
  arrastran.

## [0.1.5] - 2026-07-17

### Añadido
- Puente REST para la app del reloj (el reloj solo puede hacer HTTP, y HA sirve
  estos registros únicamente por WebSocket):
  - `GET /api/ha_companion/areas` → áreas con `area_id`, `name`, `icon` y los
    sensores asignados `temperature_entity_id` / `humidity_entity_id` (para la
    vista Casa del reloj). Usa `getattr` para seguir funcionando en cores
    anteriores a HA 2024.6.
  - `GET /api/ha_companion/labels` → etiquetas con `label_id`, `name`, `icon` y
    `color`.
  - Ambas vistas requieren autenticación y se registran una sola vez por instancia.

### Corregido
- `VERSION_JSON_URL` apuntaba a una ruta inexistente; ahora apunta a
  `version.json` en la raíz del repo de release.
- Restaurado el nombre del descriptor de HACS a `hacs.json` (se había renombrado
  a `hacks.json` por error, lo que impedía que HACS reconociera el repositorio).
- `documentation` e `issue_tracker` del manifest apuntan al repositorio oficial
  `AguacatecHA/HA_Companion`.

### Interno
- Añadido `.gitignore` y dejado de rastrear los `__pycache__/*.pyc`.

## [0.1.4]

### Añadido
- Plataforma `device_tracker` para la ubicación GPS del reloj.
- Sensor «Recent Workouts» con el historial de entrenamientos formateado.

### Corregido
- Fugas de suscripción en los sensores de la integración.
- Correcciones críticas detectadas en revisión de código.

---

El historial anterior a 0.1.4 está disponible en
[GitHub Releases](https://github.com/AguacatecHA/HA_Companion/releases).

[0.1.5]: https://github.com/AguacatecHA/HA_Companion/releases/tag/v.0.1.5
[0.1.4]: https://github.com/AguacatecHA/HA_Companion/releases/tag/v.0.1.4
