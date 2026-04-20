"""Device Tracker platform for HA Companion — watch GPS location."""
from __future__ import annotations
import logging

from homeassistant.components.device_tracker import SourceType, TrackerEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    username = config_entry.data["username"]
    master_sensor_id = f"sensor.{username}"
    async_add_entities([WatchDeviceTracker(hass, config_entry.entry_id, username, master_sensor_id)], True)


class WatchDeviceTracker(TrackerEntity):
    """Device tracker that reports the watch GPS location to HA zones."""

    def __init__(self, hass: HomeAssistant, entry_id: str, username: str, master_sensor_id: str) -> None:
        self.hass = hass
        self._entry_id = entry_id
        self._username = username
        self._master_sensor_id = master_sensor_id
        self._latitude: float | None = None
        self._longitude: float | None = None
        self._accuracy: int = 0

        self._attr_has_entity_name = True
        self._attr_translation_key = "watch_location"
        self._attr_unique_id = f"{entry_id}_watch_location"
        self._attr_icon = "mdi:watch"
        self._attr_available = False
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{username}_watch")},
            name=f"{username.capitalize()} Amazfit Watch",
            manufacturer="Aguacatec Team",
            model="Amazfit Watch",
        )

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            async_track_state_change_event(
                self.hass, [self._master_sensor_id], self._handle_master_update
            )
        )
        state = self.hass.states.get(self._master_sensor_id)
        if state:
            self._update_from_attributes(state.attributes)

    @callback
    def _handle_master_update(self, event) -> None:
        new_state = event.data.get("new_state")
        if new_state:
            self._update_from_attributes(new_state.attributes)
        self.async_write_ha_state()

    def _update_from_attributes(self, attrs: dict) -> None:
        lat = attrs.get("gps_latitude")
        lon = attrs.get("gps_longitude")
        acc = attrs.get("gps_accuracy")
        if lat and lon and lat != "Not supported" and lon != "Not supported":
            try:
                self._latitude = float(lat)
                self._longitude = float(lon)
                self._accuracy = int(float(acc)) if acc and acc != "Not supported" else 0
                self._attr_available = True
            except (ValueError, TypeError):
                self._attr_available = False
        else:
            self._attr_available = False

    @property
    def source_type(self) -> SourceType:
        return SourceType.GPS

    @property
    def latitude(self) -> float | None:
        return self._latitude

    @property
    def longitude(self) -> float | None:
        return self._longitude

    @property
    def location_accuracy(self) -> int:
        return self._accuracy
