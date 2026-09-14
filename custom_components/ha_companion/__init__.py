"""Watch Sensors Pro Integration."""
from __future__ import annotations
import contextlib
import logging
import os
import shutil
from datetime import timedelta

import aiohttp
from homeassistant.components import frontend
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import label_registry as lr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.loader import async_get_integration

_LOGGER = logging.getLogger(__name__)
DOMAIN = "ha_companion"

# Tarjeta Lovelace que sirve la propia integración: no hace falta que nadie
# la descargue aparte ni la dé de alta como recurso a mano.
CARD_STATIC_URL = "/ha_companion_static"
CARD_DIR = "custom_components/ha_companion/www"
CARDS = (
    "ha-companion-sleep-card.js",
    "ha-companion-sleep-week-card.js",
    "ha-companion-workout-card.js",
)

# Panel propio en la barra lateral, al estilo de lo que hace WashData.
PANEL_JS = "ha-companion-panel.js"
PANEL_ELEMENT = "ha-companion-panel"
PANEL_URL_PATH = "ha-companion"

# Blueprints que trae la integración. HA NO los descubre solos por estar
# dentro de custom_components/ha_companion/ — solo mira config/blueprints/
# automation/<carpeta>/, así que hay que copiarlos ahí a mano en el arranque.
BLUEPRINTS_SRC_DIR = "custom_components/ha_companion/blueprints/automation/ha_companion"
BLUEPRINTS_DST_DIR = "blueprints/automation/ha_companion"
BLUEPRINT_FILES = (
    "ha_companion_dormido.yaml",
    "ha_companion_despierto.yaml",
    "ha_companion_sin_sincronizar.yaml",
)


def _copy_blueprints(hass: HomeAssistant) -> None:
    """Copia los blueprints al lugar que HA sí mira, si no están ya.

    Nunca sobreescribe: si el usuario ya tiene el fichero (lo importó antes,
    o lo ha tocado a mano), se deja tal cual. Solo rellena lo que falte.
    Llamar siempre vía `hass.async_add_executor_job` — es I/O de disco.
    """
    src_dir = hass.config.path(BLUEPRINTS_SRC_DIR)
    dst_dir = hass.config.path(BLUEPRINTS_DST_DIR)
    try:
        os.makedirs(dst_dir, exist_ok=True)
        for filename in BLUEPRINT_FILES:
            dst = os.path.join(dst_dir, filename)
            if os.path.exists(dst):
                continue
            src = os.path.join(src_dir, filename)
            if os.path.exists(src):
                shutil.copyfile(src, dst)
    except OSError as exc:
        _LOGGER.warning("Could not install bundled blueprints: %s", exc)


async def _version(hass: HomeAssistant) -> str:
    """La versión del manifest, para enseñarla en la cabecera del panel.

    Lee el manifest ya cargado por HA (`async_get_integration` cachea el
    `Integration` tras la primera carga) en vez de abrir el fichero a mano:
    un `open()` a pelo aquí es una llamada bloqueante dentro del bucle de
    eventos (HA lo detecta y avisa — ver homeassistant.util.loop).
    """
    try:
        integration = await async_get_integration(hass, DOMAIN)
        return integration.manifest.get("version", "")
    except Exception:  # pylint: disable=broad-exception-caught
        return ""


async def _card_token(hass: HomeAssistant, filename: str) -> str:
    """Cache-busting token derived from a card file's mtime.

    The static path is served without a Cache-Control header, so browsers fall
    back to heuristic caching: with a fixed ?v= they can keep serving a stale
    copy of the card indefinitely. Keying the query string to the file's mtime
    means every edit produces a URL the browser has never seen.

    `os.path.getmtime` is blocking I/O, so it runs in the executor — calling
    it straight from `async_setup_entry` triggers HA's blocking-call detector.
    """
    try:
        path = hass.config.path(f"{CARD_DIR}/{filename}")
        mtime = await hass.async_add_executor_job(os.path.getmtime, path)
        return str(int(mtime))
    except OSError:
        return "0"

VERSION_JSON_URL = (
    "https://raw.githubusercontent.com/AguacatecHA/HA_Companion/main/version.json"
)
VERSION_UPDATE_INTERVAL = timedelta(hours=1)

# El reloj escribe el sensor maestro por la API REST de Home Assistant, y los
# estados puestos así NO se restauran al reiniciar: se pierde el estado y, con
# él, TODOS los atributos de los que cuelgan los sensores derivados. Resultado:
# tras cada reinicio la integración entera queda `unavailable` hasta que el
# reloj vuelva a sincronizar, que puede tardar horas. Además, mientras tanto el
# recorder anota ceros que luego ensucian las estadísticas.
#
# Guardamos el último envío en disco y lo reponemos al arrancar. El reloj lo
# pisará en cuanto sincronice.
CACHE_VERSION = 1
CACHE_DELAY = 20          # segundos de espera antes de escribir, para no
                          # castigar el disco en cada envío del reloj


def _cache_key(username: str) -> str:
    return f"{DOMAIN}.master.{username}"


class VersionCoordinator(DataUpdateCoordinator):
    """Fetches the latest published app version from GitHub."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name="HA Companion published version",
            update_interval=VERSION_UPDATE_INTERVAL,
        )

    async def _async_update_data(self) -> dict:
        session = async_get_clientsession(self.hass)
        try:
            async with session.get(
                VERSION_JSON_URL,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                return await resp.json(content_type=None)
        except Exception as e:
            raise UpdateFailed(f"Could not fetch version.json: {e}") from e


class HACompanionAreasView(HomeAssistantView):
    """Expose the area registry (incl. icon) over REST for the watch app.

    HA only serves the area registry over the WebSocket API, and the Zepp
    watch companion (app-side) can only do HTTP fetch — so we bridge it here:
    GET /api/ha_companion/areas -> [{area_id, name, icon}, ...]
    """

    url = "/api/ha_companion/areas"
    name = "api:ha_companion:areas"
    requires_auth = True

    async def get(self, request):
        """Return all areas with icon + the user-assigned temp/humidity sensors."""
        hass = request.app["hass"]
        area_reg = ar.async_get(hass)
        # temperature_entity_id / humidity_entity_id exist on the area registry
        # since HA 2024.6; getattr keeps this working on older cores (returns None).
        areas = [
            {
                "area_id": area.id,
                "name": area.name,
                "icon": area.icon,
                "temperature_entity_id": getattr(area, "temperature_entity_id", None),
                "humidity_entity_id": getattr(area, "humidity_entity_id", None),
            }
            for area in area_reg.async_list_areas()
        ]
        return self.json(areas)


class HACompanionLabelsView(HomeAssistantView):
    """Expose the label registry (incl. icon + color) over REST for the watch.

    Like areas, HA only serves the label registry over the WebSocket API, and the
    watch app-side can only do HTTP — so we bridge it here:
    GET /api/ha_companion/labels -> [{label_id, name, icon, color}, ...]
    """

    url = "/api/ha_companion/labels"
    name = "api:ha_companion:labels"
    requires_auth = True

    async def get(self, request):
        """Return all labels with their assigned icon (mdi:... or null) and color."""
        hass = request.app["hass"]
        label_reg = lr.async_get(hass)
        labels = [
            {"label_id": lbl.label_id, "name": lbl.name, "icon": lbl.icon, "color": lbl.color}
            for lbl in label_reg.async_list_labels()
        ]
        return self.json(labels)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HA Companion from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Blueprints listos para usar sin que el usuario tenga que importarlos a
    # mano: HA solo los descubre en config/blueprints/automation/, no dentro
    # de custom_components/, así que los copiamos ahí una vez por instancia.
    if not hass.data[DOMAIN].get("blueprints_installed"):
        await hass.async_add_executor_job(_copy_blueprints, hass)
        hass.data[DOMAIN]["blueprints_installed"] = True

    # Serve + register the bundled Lovelace cards once per HA instance.
    if not hass.data[DOMAIN].get("card_registered"):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    CARD_STATIC_URL,
                    hass.config.path(CARD_DIR),
                    cache_headers=False,
                )
            ]
        )
        for filename in CARDS:
            url = f"{CARD_STATIC_URL}/{filename}?v={await _card_token(hass, filename)}"
            add_extra_js_url(hass, url)
            _LOGGER.debug("Registered Lovelace card at %s", url)
        hass.data[DOMAIN]["card_registered"] = True

    # Panel de la barra lateral. Va aparte de las tarjetas: si el registro del
    # panel fallara, las tarjetas deben seguir funcionando igualmente.
    #
    # A diferencia de las tarjetas, el panel se REGISTRA DE NUEVO en cada setup.
    # Su module_url lleva el token de caché, que se calcula aquí: si nos
    # limitásemos a saltar cuando ya existe, un panel actualizado seguiría
    # sirviéndose con la URL vieja hasta el siguiente reinicio completo. Así
    # basta con recargar la integración.
    if True:
        try:
            with contextlib.suppress(Exception):
                # `warn_if_unknown=False`: en el primer arranque (o tras
                # borrar y volver a añadir la integración) el panel aún no
                # existe, y sin esto HA suelta un WARNING "Removing unknown
                # panel ha-companion" que asusta y no significa nada. No
                # lanza excepción, así que el suppress de arriba no bastaba.
                frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
            # ha-panel-custom.ts del frontend lee los parámetros de carga de
            # `config._panel_custom`; las claves sueltas del primer nivel NO se
            # miran. El panel es un módulo más de www/, así que se sirve por la
            # misma ruta estática que las tarjetas.
            frontend.async_register_built_in_panel(
                hass,
                component_name="custom",
                sidebar_title="HA Companion",
                sidebar_icon="mdi:watch",
                frontend_url_path=PANEL_URL_PATH,
                config={
                    "_panel_custom": {
                        "name": PANEL_ELEMENT,
                        "module_url": f"{CARD_STATIC_URL}/{PANEL_JS}"
                                      f"?v={await _card_token(hass, PANEL_JS)}",
                        "embed_iframe": False,
                        "trust_external": False,
                    },
                    # Cualquier clave suelta de `config` llega al panel en su
                    # propiedad `panel`. La versión no la sabe de otro modo: el
                    # manifest no se sirve al frontend.
                    "version": await _version(hass),
                },
                require_admin=False,
            )
            hass.data[DOMAIN]["panel_registered"] = True
            _LOGGER.debug("Registered sidebar panel at /%s", PANEL_URL_PATH)
        except ValueError:
            # Ya estaba registrado (recarga de la integración): no es un error.
            hass.data[DOMAIN]["panel_registered"] = True
        except Exception as exc:  # pylint: disable=broad-exception-caught
            _LOGGER.warning("Could not register the sidebar panel: %s", exc)

    # Register the areas REST bridge once per HA instance.
    if not hass.data[DOMAIN].get("areas_view_registered"):
        hass.http.register_view(HACompanionAreasView())
        hass.data[DOMAIN]["areas_view_registered"] = True

    # Register the labels REST bridge once per HA instance.
    if not hass.data[DOMAIN].get("labels_view_registered"):
        hass.http.register_view(HACompanionLabelsView())
        hass.data[DOMAIN]["labels_view_registered"] = True

    # Coordinator is shared — create it only once per HA instance
    if "version_coordinator" not in hass.data[DOMAIN]:
        coordinator = VersionCoordinator(hass)
        await coordinator.async_refresh()  # non-blocking: fails gracefully on first run
        hass.data[DOMAIN]["version_coordinator"] = coordinator

    hass.data[DOMAIN][entry.entry_id] = entry.data

    # Create the master sensor if the watch hasn't sent data yet, restoring the
    # last payload the watch sent so a restart does not blank every sensor.
    username = entry.data["username"]
    master_sensor_id = f"sensor.{username}"
    store: Store = Store(hass, CACHE_VERSION, _cache_key(username))

    if hass.states.get(master_sensor_id) is None:
        guardado = await store.async_load()
        if guardado and guardado.get("attributes"):
            hass.states.async_set(
                master_sensor_id,
                guardado.get("state", "unknown"),
                guardado["attributes"],
            )
            _LOGGER.info(
                "Restored master sensor %s from the last watch payload",
                master_sensor_id,
            )
        else:
            hass.states.async_set(
                master_sensor_id,
                "unknown",
                {"friendly_name": f"{username.capitalize()} Watch", "unit_of_measurement": "%"},
            )
            _LOGGER.info(f"Created placeholder master sensor: {master_sensor_id}")

    @callback
    def _guardar(event) -> None:
        """Persist every payload the watch pushes, with a delay so a burst of
        updates becomes a single write."""
        nuevo_estado = event.data.get("new_state")
        if nuevo_estado is None or nuevo_estado.state in ("unknown", "unavailable"):
            return
        # Sin `sleep_stage_data` ni `steps_state` esto es el marcador vacío, no
        # un envío de verdad: guardarlo pisaría la copia buena.
        if not any(k in nuevo_estado.attributes
                   for k in ("sleep_stage_data", "steps_state", "battery_state")):
            return
        store.async_delay_save(
            lambda: {
                "state": nuevo_estado.state,
                "attributes": dict(nuevo_estado.attributes),
            },
            CACHE_DELAY,
        )

    entry.async_on_unload(
        async_track_state_change_event(hass, [master_sensor_id], _guardar)
    )

    await hass.config_entries.async_forward_entry_setups(entry, ["sensor", "binary_sensor", "device_tracker"])
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, ["sensor", "binary_sensor", "device_tracker"])
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
