"""Binary Sensor platform for Watch Sensors Pro."""
from __future__ import annotations
import logging
from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.storage import Store

from .const import DOMAIN, BINARY_SENSORS

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Watch Binary Sensors from config entry."""
    username = config_entry.data["username"]
    master_sensor_id = f"sensor.{username}"
    coordinator = hass.data[DOMAIN]["version_coordinator"]
    _LOGGER.info(f"Setting up Watch Binary Sensors for master: {master_sensor_id}")

    entities = []
    for sensor_config in BINARY_SENSORS:
        if sensor_config.get("charging_extract"):
            entities.append(
                WatchChargingBinarySensor(hass, config_entry.entry_id, username, master_sensor_id, sensor_config)
            )
        else:
            entities.append(
                WatchBinarySensor(hass, config_entry.entry_id, username, master_sensor_id, sensor_config)
            )
    entities.append(
        UpdatePendingBinarySensor(hass, coordinator, config_entry.entry_id, username, master_sensor_id)
    )
    entities.append(
        BackupBinarySensor(hass, config_entry.entry_id, username)
    )
    async_add_entities(entities, True)


class WatchBinarySensor(BinarySensorEntity):
    """Representation of a Watch Binary Sensor."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str,
        username: str,
        master_sensor_id: str,
        sensor_config: dict,
    ) -> None:
        self.hass = hass
        self._entry_id = entry_id
        self._username = username
        self._master_sensor_id = master_sensor_id
        self._config = sensor_config

        self._attr_has_entity_name = True
        self._attr_translation_key = sensor_config.get("key")
        self._attr_unique_id = f"{entry_id}_{sensor_config['key']}"
        self._attr_icon = sensor_config.get("icon")
        self._attr_device_class = sensor_config.get("device_class")
        self._attr_entity_category = EntityCategory(sensor_config["entity_category"]) \
            if sensor_config.get("entity_category") else None
        self._attr_is_on = None
        self._attr_available = False

        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{username}_watch")},
            name=f"{username.capitalize()} Amazfit Watch",
            manufacturer="Aguacatec Team",
            model="Amazfit Watch",
            sw_version=None,
        )

    def _parse_value(self, attr_value) -> bool | None:
        """Convert attribute value to boolean."""
        if attr_value is None:
            return None

        # Config-driven exact match (e.g. true_value: "Sleeping" or true_value: 2)
        true_value = self._config.get("true_value")
        if true_value is not None:
            try:
                return int(attr_value) == int(true_value)
            except (ValueError, TypeError):
                return str(attr_value).lower() == str(true_value).lower()

        if isinstance(attr_value, bool):
            return attr_value
        if isinstance(attr_value, str):
            return attr_value.lower() in ("on", "true", "yes")
        if isinstance(attr_value, (int, float)):
            return bool(attr_value)
        return None

    @callback
    def _handle_master_update(self, event) -> None:
        """Handle master sensor state changes."""
        new_state = event.data.get("new_state")
        if new_state is None:
            self._attr_available = False
            self.async_write_ha_state()
            return

        attr_value = new_state.attributes.get(self._config["attribute"])
        if attr_value is None:
            self._attr_available = False
            self.async_write_ha_state()
            return

        parsed = self._parse_value(attr_value)
        self._attr_is_on = parsed
        self._attr_available = parsed is not None
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        """Load initial state when added to hass."""
        await super().async_added_to_hass()

        master_state = self.hass.states.get(self._master_sensor_id)
        if master_state:
            attr_value = master_state.attributes.get(self._config["attribute"])
            if attr_value is not None:
                parsed = self._parse_value(attr_value)
                self._attr_is_on = parsed
                self._attr_available = parsed is not None

        self.async_on_remove(
            async_track_state_change_event(
                self.hass, [self._master_sensor_id], self._handle_master_update
            )
        )


class WatchChargingBinarySensor(WatchBinarySensor):
    """Infers charging status from the battery_state delta between consecutive master
    updates — Zepp OS has no native "is charging" flag on the Battery sensor, so this
    is the same workaround every third-party integration for this watch line uses.
    Unknown (unavailable) until we've seen at least two readings to compare."""

    def __init__(self, hass, entry_id, username, master_sensor_id, sensor_config):
        super().__init__(hass, entry_id, username, master_sensor_id, sensor_config)
        self._last_battery: float | None = None

    def _update_from_battery(self, attr_value) -> None:
        try:
            battery = float(attr_value)
        except (TypeError, ValueError):
            self._attr_is_on = None
            self._attr_available = False
            return

        if self._last_battery is not None:
            if battery > self._last_battery:
                self._attr_is_on = True
            elif battery < self._last_battery:
                self._attr_is_on = False
            elif self._attr_is_on is None:
                # First-ever comparison and it happened to be flat: don't stay stuck
                # in "unknown" forever waiting for a delta that may never come while
                # idle. Default to "not charging"; a later delta still overrides it.
                self._attr_is_on = False
            # else: equal but already initialized — keep the previous is_on (a
            # plateau at/near 100% while still plugged in is normal and shouldn't
            # flip the sensor to "not charging")
        self._last_battery = battery
        self._attr_available = self._attr_is_on is not None

    @callback
    def _handle_master_update(self, event) -> None:
        new_state = event.data.get("new_state")
        if new_state is None:
            self._attr_available = False
            self.async_write_ha_state()
            return
        attr_value = new_state.attributes.get(self._config["attribute"])
        if attr_value is None:
            self._attr_available = False
            self.async_write_ha_state()
            return
        self._update_from_battery(attr_value)
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        # Skip WatchBinarySensor.async_added_to_hass (it would call the generic
        # _parse_value, which doesn't know about deltas) and register directly.
        await super(WatchBinarySensor, self).async_added_to_hass()
        master_state = self.hass.states.get(self._master_sensor_id)
        if master_state:
            attr_value = master_state.attributes.get(self._config["attribute"])
            if attr_value is not None:
                self._update_from_battery(attr_value)
        self.async_on_remove(
            async_track_state_change_event(
                self.hass, [self._master_sensor_id], self._handle_master_update
            )
        )


class UpdatePendingBinarySensor(CoordinatorEntity, BinarySensorEntity):
    """Binary sensor that is ON when the installed app version differs from the published one."""

    def __init__(
        self,
        hass: HomeAssistant,
        coordinator,
        entry_id: str,
        username: str,
        master_sensor_id: str,
    ) -> None:
        CoordinatorEntity.__init__(self, coordinator)
        self.hass = hass
        self._entry_id = entry_id
        self._username = username
        self._master_sensor_id = master_sensor_id
        self._app_version = None

        self._attr_has_entity_name = True
        self._attr_translation_key = "update_pending"
        self._attr_unique_id = f"{entry_id}_update_pending"
        self._attr_icon = "mdi:update"
        self._attr_device_class = "update"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{username}_watch")},
            name=f"{username.capitalize()} Amazfit Watch",
            manufacturer="Aguacatec Team",
            model="Amazfit Watch",
            sw_version=None,
        )

    @property
    def is_on(self) -> bool | None:
        published = self.coordinator.data.get("published_version") if self.coordinator.data else None
        if not published or not self._app_version:
            return None
        return self._app_version != published

    @property
    def available(self) -> bool:
        return (
            self.coordinator.last_update_success
            and self._app_version is not None
            and self.coordinator.data is not None
        )

    @callback
    def _handle_master_update(self, event) -> None:
        new_state = event.data.get("new_state")
        if new_state:
            self._app_version = new_state.attributes.get("app_version")
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        master_state = self.hass.states.get(self._master_sensor_id)
        if master_state:
            self._app_version = master_state.attributes.get("app_version")
        self.async_on_remove(
            async_track_state_change_event(
                self.hass, [self._master_sensor_id], self._handle_master_update
            )
        )


class BackupBinarySensor(BinarySensorEntity):
    """ON cuando hay una copia de la configuración de la app guardada en HA.

    No sale de los atributos del sensor maestro como el resto: refleja lo que
    la propia integración tiene guardado, así que se lee del `Store` al
    arrancar y se refresca por señal cuando la app manda una copia nueva.
    """

    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant, entry_id: str, username: str) -> None:
        self.hass = hass
        self._username = username
        self._saved_at: str | None = None
        self._keys: int | None = None

        self._attr_has_entity_name = True
        self._attr_translation_key = "config_backup"
        self._attr_unique_id = f"{entry_id}_config_backup"
        self._attr_icon = "mdi:cloud-check-variant"
        self._attr_entity_category = EntityCategory.DIAGNOSTIC
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{username}_watch")},
            name=f"{username.capitalize()} Amazfit Watch",
            manufacturer="Aguacatec Team",
            model="Amazfit Watch",
        )

    @property
    def is_on(self) -> bool:
        return self._saved_at is not None

    @property
    def extra_state_attributes(self) -> dict:
        return {"last_backup": self._saved_at, "entries": self._keys}

    async def _lee_store(self) -> None:
        """Relee la copia guardada. Es la única forma de poner el estado.

        La señal no trae los datos a propósito: si el sensor se fiara de lo que
        le llega, se quedaría en `on` cuando la copia desaparece por detrás
        (alguien limpia `.storage`, o se restaura un backup de HA anterior a
        ella). Leyendo siempre el `Store`, el sensor no puede mentir.
        """
        # Import local: la vista y las constantes viven en __init__, y traerlas
        # arriba del todo haría un import circular con la plataforma.
        from . import BACKUP_VERSION, _backup_key

        store: Store = Store(self.hass, BACKUP_VERSION, _backup_key(self._username))
        guardado = await store.async_load()
        if guardado and guardado.get("config"):
            self._saved_at = guardado.get("saved_at")
            self._keys = len(guardado["config"])
        else:
            self._saved_at = None
            self._keys = None

    async def _actualiza(self) -> None:
        await self._lee_store()
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        from . import BACKUP_SIGNAL

        await self._lee_store()

        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, f"{BACKUP_SIGNAL}_{self._username}", self._actualiza
            )
        )
