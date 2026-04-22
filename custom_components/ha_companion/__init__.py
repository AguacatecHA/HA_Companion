"""Watch Sensors Pro Integration."""
from __future__ import annotations
import logging
from datetime import timedelta

import aiohttp
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

_LOGGER = logging.getLogger(__name__)
DOMAIN = "ha_companion"

VERSION_JSON_URL = (
    "https://raw.githubusercontent.com/AguacatecHA/HA_Companion/refs/heads/main/version.jsonn"
)
VERSION_UPDATE_INTERVAL = timedelta(hours=1)


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


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HA Companion from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Coordinator is shared — create it only once per HA instance
    if "version_coordinator" not in hass.data[DOMAIN]:
        coordinator = VersionCoordinator(hass)
        await coordinator.async_refresh()  # non-blocking: fails gracefully on first run
        hass.data[DOMAIN]["version_coordinator"] = coordinator

    hass.data[DOMAIN][entry.entry_id] = entry.data

    # Create the master sensor if the watch hasn't sent data yet
    username = entry.data["username"]
    master_sensor_id = f"sensor.{username}"
    if hass.states.get(master_sensor_id) is None:
        hass.states.async_set(
            master_sensor_id,
            "unknown",
            {"friendly_name": f"{username.capitalize()} Watch", "unit_of_measurement": "%"},
        )
        _LOGGER.info(f"Created placeholder master sensor: {master_sensor_id}")

    await hass.config_entries.async_forward_entry_setups(entry, ["sensor", "binary_sensor", "device_tracker"])
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, ["sensor", "binary_sensor", "device_tracker"])
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
