"""Binary Sensor platform for Watch Sensors Pro."""
from __future__ import annotations
import logging
from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.device_registry import DeviceInfo

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
    _LOGGER.info(f"Setting up Watch Binary Sensors for master: {master_sensor_id}")

    entities = []
    for sensor_config in BINARY_SENSORS:
        entities.append(
            WatchBinarySensor(hass, config_entry.entry_id, username, master_sensor_id, sensor_config)
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
        self._attr_is_on = None
        self._attr_available = False

        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{username}_watch")},
            name=f"{username.capitalize()} Amazfit Watch",
            manufacturer="Aguacatec Team",
            model="Amazfit Watch",
            sw_version=None,
        )

        async_track_state_change_event(
            hass, [master_sensor_id], self._handle_master_update
        )

    def _parse_value(self, attr_value) -> bool | None:
        """Convert attribute value to boolean."""
        if attr_value is None:
            return None
        if isinstance(attr_value, bool):
            return attr_value
        if isinstance(attr_value, str):
            return attr_value.lower() == "on"
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
