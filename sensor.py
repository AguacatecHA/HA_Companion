"""Sensor platform for Watch Sensors Pro."""
from __future__ import annotations
import logging
import json
from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN, SENSORS

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Watch Sensors from config entry."""
    
    username = config_entry.data["username"]
    master_sensor_id = f"sensor.{username}"
    
    _LOGGER.info(f"Setting up Watch Sensors for master: {master_sensor_id}")
    
    # Crear todos los sensores
    entities = []
    for sensor_config in SENSORS:
        entities.append(
            WatchSensor(
                hass,
                config_entry.entry_id,
                username,
                master_sensor_id,
                sensor_config
            )
        )
    
    async_add_entities(entities, True)

class WatchSensor(SensorEntity):
    """Representation of a Watch Sensor."""
    
    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str,
        username: str,
        master_sensor_id: str,
        sensor_config: dict,
    ) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._entry_id = entry_id
        self._username = username
        self._master_sensor_id = master_sensor_id
        self._config = sensor_config
        
        # Entidad metadata
        self._attr_name = f"{username.capitalize()} {sensor_config['name']}"
        self._attr_unique_id = f"{entry_id}_{sensor_config['key']}"
        self._attr_icon = sensor_config.get("icon")
        self._attr_native_unit_of_measurement = sensor_config.get("unit")
        self._attr_device_class = sensor_config.get("device_class")
        self._attr_state_class = sensor_config.get("state_class")
        
        self._attr_native_value = None
        self._attr_available = False
        base_name = username.capitalize()

        # >>> AÑADIR ESTO: DEVICE INFO <<<
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{username}_watch")},
            name=f"{base_name} Watch",
            manufacturer="Aguacatec Team",
            model="Zepp OS Watch",
            sw_version=None,
        )
        # <<< FIN DEVICE INFO >>>

        # Subscribirse a cambios del sensor maestro
        async_track_state_change_event(
            hass, [master_sensor_id], self._handle_master_update
        )
    
    @callback
    def _handle_master_update(self, event) -> None:
        """Handle master sensor state changes."""
        new_state = event.data.get("new_state")
        if new_state is None:
            self._attr_available = False
            self.async_write_ha_state()
            return
        
        # Extraer valor del attribute
        attr_value = new_state.attributes.get(self._config["attribute"])
        
        if attr_value is None:
            self._attr_available = False
            self.async_write_ha_state()
            return
        
        # Procesar JSON si es necesario
        if self._config.get("json_extract"):
            try:
                if isinstance(attr_value, str):
                    data = json.loads(attr_value)
                else:
                    data = attr_value
                
                value = data.get(self._config["json_extract"])
                self._attr_native_value = value
            except (json.JSONDecodeError, KeyError, TypeError) as e:
                _LOGGER.warning(
                    f"Error extracting JSON from {self._config['attribute']}: {e}"
                )
                self._attr_native_value = None
        else:
            self._attr_native_value = attr_value
        
        self._attr_available = self._attr_native_value is not None
        self.async_write_ha_state()
    
    async def async_added_to_hass(self) -> None:
        """When entity is added to hass."""
        await super().async_added_to_hass()
        
        # Cargar estado inicial
        master_state = self.hass.states.get(self._master_sensor_id)
        if master_state:
            attr_value = master_state.attributes.get(self._config["attribute"])
            
            if attr_value is not None:
                if self._config.get("json_extract"):
                    try:
                        if isinstance(attr_value, str):
                            data = json.loads(attr_value)
                        else:
                            data = attr_value
                        value = data.get(self._config["json_extract"])
                        self._attr_native_value = value
                    except:
                        self._attr_native_value = None
                else:
                    self._attr_native_value = attr_value
                
                self._attr_available = self._attr_native_value is not None
