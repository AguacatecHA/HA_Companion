"""Sensor platform for Watch Sensors Pro."""
from __future__ import annotations
import logging
import json
from datetime import datetime, timezone
from homeassistant.components.sensor import SensorEntity

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.const import EntityCategory

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

    coordinator = hass.data[DOMAIN]["version_coordinator"]

    entities = []
    for sensor_config in SENSORS:
        if sensor_config.get("workout_history_extract"):
            entities.append(
                WatchWorkoutHistorySensor(hass, config_entry.entry_id, username, master_sensor_id, sensor_config)
            )
        else:
            entities.append(
                WatchSensor(hass, config_entry.entry_id, username, master_sensor_id, sensor_config)
            )
    entities.append(PublishedVersionSensor(coordinator, config_entry.entry_id, username))
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
        self.hass = hass
        self._entry_id = entry_id
        self._username = username
        self._master_sensor_id = master_sensor_id
        self._config = sensor_config
        self._attr_entity_state_translation = True 
        self._attr_has_entity_name = True
        self._attr_translation_key = sensor_config.get("key")      
        #self._attr_name = sensor_config['name']
        self._attr_unique_id = f"{entry_id}_{sensor_config['key']}"
        self._attr_icon = sensor_config.get("icon")
        self._attr_native_unit_of_measurement = sensor_config.get("unit")
        self._attr_device_class = sensor_config.get("device_class")
        self._attr_state_class = sensor_config.get("state_class")
        self._attr_native_value = None
        self._attr_available = False
        self._cached_raw_constants = None
        self._cached_constants = None
        self._attr_entity_category = EntityCategory(sensor_config["entity_category"]) \
            if sensor_config.get("entity_category") else None
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{username}_watch")},
            name=f"{username.capitalize()} Amazfit Watch",
            manufacturer="Aguacatec Team",
            model="Amazfit Watch",
            sw_version=None,
        )

    # ============================================================
    # EXTRACTORES
    # ============================================================

    def _extract_value(self, attr_value):
        """Extractor principal: JSON anidado, arrays y conversiones."""

        # --- JSON anidado (json_extract: "maximum.hr_value") ---
        if self._config.get("json_extract"):
            try:
                if isinstance(attr_value, str):
                    data = json.loads(attr_value)
                elif isinstance(attr_value, dict):
                    data = attr_value  # HA ya lo convirtió a dict
                else:
                    return None

                path = self._config["json_extract"]
                result = data
                for key in path.split("."):
                    if isinstance(result, dict):
                        result = result.get(key)
                    else:
                        return None

                # Conversión genérica (ej: temperatura centésimas → grados)
                if self._config.get("value_convert") and result is not None:
                    result = round(result * self._config["value_convert"], 2)

                # Conversión bytes → MB (disco)
                if self._config.get("disk_convert") and result is not None:
                    result = round(result / 1024 / 1024, 1)

                if self._config.get("time_convert") and result is not None:
                    hours = (result // 60) % 24
                    minutes = result % 60
                    result = f"{hours:02d}:{minutes:02d}"


                return result

            except Exception as e:
                _LOGGER.warning(
                    f"[{self._config['key']}] json_extract error: {e} | raw: {attr_value}"
                )
                return None

        # --- Arrays de objetos (array_extract: "last/average/max/min") ---
        elif self._config.get("array_extract"):
            try:
                if isinstance(attr_value, str):
                    data = json.loads(attr_value)
                elif isinstance(attr_value, list):
                    data = attr_value
                else:
                    return None

                if not isinstance(data, list) or len(data) == 0:
                    return None

                field = self._config.get("array_field")
                mode = self._config["array_extract"]

                if mode == "last":
                    val = data[-1]
                    return val.get(field) if field and isinstance(val, dict) else val

                elif mode == "first":
                    val = data[0]
                    return val.get(field) if field and isinstance(val, dict) else val

                elif mode == "average":
                    values = [
                        (item.get(field) if field and isinstance(item, dict) else item)
                        for item in data
                    ]
                    values = [v for v in values if v is not None]
                    return round(sum(values) / len(values), 1) if values else None

                elif mode == "max":
                    values = [
                        (item.get(field) if field and isinstance(item, dict) else item)
                        for item in data
                    ]
                    values = [v for v in values if v is not None]
                    return max(values) if values else None

                elif mode == "min":
                    values = [
                        (item.get(field) if field and isinstance(item, dict) else item)
                        for item in data
                    ]
                    values = [v for v in values if v is not None]
                    return min(values) if values else None

            except Exception as e:
                _LOGGER.warning(
                    f"[{self._config['key']}] array_extract error: {e} | raw: {attr_value}"
                )
                return None

        elif self._config.get("sleep_stage_extract"):
            return self._extract_sleep_stage(attr_value)

        elif self._config.get("iso_timestamp"):
            try:
                dt = datetime.fromisoformat(str(attr_value).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except Exception as e:
                _LOGGER.warning(f"[{self._config['key']}] iso_timestamp parse error: {e}")
                return None

        elif self._config.get("lookup_table"):
            table = self._config["lookup_table"]
            try:
                return table.get(int(attr_value), f"Unknown ({attr_value})")
            except (TypeError, ValueError):
                return str(attr_value)

        else:
            return attr_value

    def _extract_sleep_stage(self, attr_value):
        """Calcula minutos totales de cada fase de sueño."""
        try:
            # Parsear sleep_stage_data
            if isinstance(attr_value, str):
                data = json.loads(attr_value)
            elif isinstance(attr_value, list):
                data = attr_value
            else:
                return None

            if not isinstance(data, list) or len(data) == 0:
                return None

            # Obtener constantes de fases desde el sensor maestro (con cache)
            master_state = self.hass.states.get(self._master_sensor_id)
            if not master_state:
                return None

            raw_constants = master_state.attributes.get("sleep_stage_constant")
            if raw_constants is None:
                return None

            if raw_constants != self._cached_raw_constants:
                if isinstance(raw_constants, str):
                    self._cached_constants = json.loads(raw_constants)
                elif isinstance(raw_constants, dict):
                    self._cached_constants = raw_constants
                else:
                    return None
                self._cached_raw_constants = raw_constants

            constants = self._cached_constants

            # Obtener el model ID de la fase que queremos calcular
            stage_name = self._config["sleep_stage_extract"]
            stage_model_id = constants.get(stage_name)

            if stage_model_id is None:
                return None

            # Calcular minutos totales para esa fase
            total_minutes = 0
            for segment in data:
                if segment.get("model") == stage_model_id:
                    start = segment.get("start", 0)
                    stop = segment.get("stop", 0)
                    total_minutes += (stop - start)

            return total_minutes

        except Exception as e:
            _LOGGER.warning(
                f"[{self._config['key']}] sleep_stage_extract error: {e}"
            )
            return None

    # ============================================================
    # HANDLERS
    # ============================================================
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

        raw_value = self._extract_value(attr_value)
        if raw_value == "Not supported":
            raw_value = None
        self._attr_native_value = raw_value
        self._attr_available = self._attr_native_value is not None
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        """Load initial state when added to hass."""
        await super().async_added_to_hass()

        master_state = self.hass.states.get(self._master_sensor_id)
        if master_state:
            attr_value = master_state.attributes.get(self._config["attribute"])
            if attr_value is not None:
                raw_value = self._extract_value(attr_value)
                if raw_value == "Not supported":
                    raw_value = None
                self._attr_native_value = raw_value
                self._attr_available = self._attr_native_value is not None

        self.async_on_remove(
            async_track_state_change_event(
                self.hass, [self._master_sensor_id], self._handle_master_update
            )
        )


class WatchWorkoutHistorySensor(WatchSensor):
    """Sensor whose state is the number of recent workouts and attributes list each one."""

    def __init__(self, hass, entry_id, username, master_sensor_id, sensor_config):
        super().__init__(hass, entry_id, username, master_sensor_id, sensor_config)
        self._recent_workouts: list = []

    def _parse_history(self, attr_value) -> list:
        try:
            data = json.loads(attr_value) if isinstance(attr_value, str) else attr_value
            if not isinstance(data, list):
                return []
            from .const import SPORT_TYPES
            result = []
            for w in data[:10]:
                sport_id = w.get("sport_type")
                sport_name = SPORT_TYPES.get(int(sport_id), f"Unknown ({sport_id})") if sport_id else "Unknown"
                start_ts = w.get("start")
                try:
                    dt = datetime.fromisoformat(str(start_ts).replace("Z", "+00:00"))
                    date_str = dt.strftime("%Y-%m-%d %H:%M")
                except Exception:
                    date_str = str(start_ts)
                duration = w.get("duration_min", 0)
                result.append(f"{date_str} — {sport_name} ({duration} min)")
            return result
        except Exception as e:
            _LOGGER.warning(f"[workout_history] parse error: {e}")
            return []

    @callback
    def _handle_master_update(self, event) -> None:
        new_state = event.data.get("new_state")
        if new_state is None:
            self._attr_available = False
            self.async_write_ha_state()
            return
        attr_value = new_state.attributes.get("workout_history")
        if attr_value is None:
            self._attr_available = False
            self.async_write_ha_state()
            return
        self._recent_workouts = self._parse_history(attr_value)
        self._attr_native_value = len(self._recent_workouts)
        self._attr_available = True
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        master_state = self.hass.states.get(self._master_sensor_id)
        if master_state:
            attr_value = master_state.attributes.get("workout_history")
            if attr_value is not None:
                self._recent_workouts = self._parse_history(attr_value)
                self._attr_native_value = len(self._recent_workouts)
                self._attr_available = True

    @property
    def extra_state_attributes(self) -> dict:
        return {"recent_workouts": self._recent_workouts}


class PublishedVersionSensor(CoordinatorEntity, SensorEntity):
    """Sensor that shows the latest published app version fetched from GitHub."""

    def __init__(self, coordinator, entry_id: str, username: str) -> None:
        super().__init__(coordinator)
        self._entry_id = entry_id
        self._username = username
        self._attr_has_entity_name = True
        self._attr_translation_key = "published_version"
        self._attr_unique_id = f"{entry_id}_published_version"
        self._attr_icon = "mdi:tag-arrow-up"
        self._attr_entity_category = EntityCategory.DIAGNOSTIC
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{username}_watch")},
            name=f"{username.capitalize()} Amazfit Watch",
            manufacturer="Aguacatec Team",
            model="Amazfit Watch",
            sw_version=None,
        )

    @property
    def native_value(self):
        if self.coordinator.data:
            return self.coordinator.data.get("published_version")
        return None

    @property
    def extra_state_attributes(self):
        if not self.coordinator.data:
            return {}
        return {
            k: v
            for k, v in self.coordinator.data.items()
            if k != "published_version" and v
        }

    @property
    def available(self) -> bool:
        return self.coordinator.last_update_success and self.native_value is not None
