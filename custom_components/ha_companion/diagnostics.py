"""Diagnostics support for HA Companion."""
from __future__ import annotations
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict:
    """Return diagnostics for a config entry."""
    username = entry.data["username"]
    master_state = hass.states.get(f"sensor.{username}")
    coordinator = hass.data.get(DOMAIN, {}).get("version_coordinator")

    return {
        "config": {
            "username": username,
        },
        "master_sensor": {
            "state": master_state.state if master_state else None,
            "last_updated": master_state.last_updated.isoformat() if master_state else None,
            "attributes": dict(master_state.attributes) if master_state else {},
        },
        "published_version": coordinator.data if coordinator else None,
        "coordinator_last_update_success": coordinator.last_update_success if coordinator else None,
    }
