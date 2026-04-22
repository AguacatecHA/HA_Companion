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
        entities.append(
            WatchBinarySensor(hass, config_entry.entry_id, username, master_sensor_id, sensor_config)
        )
    entities.append(
        UpdatePendingBinarySensor(hass, coordinator, config_entry.entry_id, username, master_sensor_id)
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
