"""Sensor platform for Watch Sensors Pro."""
from __future__ import annotations
import logging
import json
from datetime import datetime, timedelta, timezone
from homeassistant.components.sensor import SensorEntity

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.const import EntityCategory
from homeassistant.util import dt as dt_util
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import statistics_during_period

from .const import DOMAIN, SENSORS, SLEEP_PHASE_LABELS, SPORT_TYPE_LABELS

TREND_REFRESH_INTERVAL = timedelta(hours=6)
TREND_DAYS = 7

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
        elif sensor_config.get("sync_age_extract"):
            entities.append(
                WatchSyncAgeSensor(hass, config_entry.entry_id, username, master_sensor_id, sensor_config)
            )
        elif sensor_config.get("sleep_timeline_extract"):
            entities.append(
                WatchSleepTimelineSensor(hass, config_entry.entry_id, username, master_sensor_id, sensor_config)
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
        self._last_week = None  # only populated when sensor_config has trend_extract
        self._semana = None     # only populated when sensor_config has week_extract
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
                if self._config["key"] == "workout_last_sport_type":
                    return self._sport_name(attr_value)
                # Lookup genérica: código crudo -> clave de estado (p. ej.
                # wear_state 1 -> "is_wearing"), que HA traduce igual que
                # cualquier otro `state` de sensor vía translations/*.json.
                return table.get(int(attr_value), str(attr_value))
            except (TypeError, ValueError):
                return str(attr_value)

        else:
            return attr_value

    def _sport_name(self, sport_id) -> str:
        """Code -> localized sport name, with a readable fallback.

        Zepp keeps adding sports in watch firmware updates, so SPORT_TYPES will
        always lag behind: a real workout came back as 1215 (walking the dog)
        with the table ending at 1203. An unknown code is normal, not a bug, so
        it gets a sensible localized name that still carries the number — the
        number is what lets us add it to the table later.
        """
        from .const import SPORT_TYPES
        try:
            code = int(sport_id)
        except (TypeError, ValueError):
            return "Unknown"
        nombre = SPORT_TYPES.get(code)
        if nombre is not None:
            return self._sport_label(nombre)
        lang = str(self.hass.config.language or "en").lower()[:2]
        word = {"es": "Deporte", "fr": "Sport", "de": "Sportart", "it": "Sport"}.get(lang, "Sport")
        return f"{word} {code}"

    def _sport_label(self, nombre: str) -> str:
        """Localize a sport name to the instance's language.

        SPORT_TYPES comes from the Zepp SDK and is English-only, and until now it
        was used raw: a Spanish dashboard showed "Walking" and "Pool Swimming"
        next to everything else translated. Anything missing from the table
        stays in English rather than breaking.
        """
        lang = str(self.hass.config.language or "en").lower()[:2]
        if lang not in SPORT_TYPE_LABELS:
            return nombre
        return SPORT_TYPE_LABELS[lang].get(nombre, nombre)

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
    # TENDENCIA 7 DÍAS (trend_extract) — de las estadísticas del propio
    # recorder de HA, no de nada que mande el reloj.
    # ============================================================
    @property
    def extra_state_attributes(self) -> dict:
        attrs = {}
        if self._config.get("trend_extract"):
            attrs["last_week"] = self._last_week
        if self._config.get("week_extract"):
            attrs.update(self._semana or {})
        return attrs

    async def _async_refresh_trend(self, now=None) -> None:
        """Pull this entity's own daily statistics for the last 7 days.

        Requires state_class to be set (it is, on every trend_extract sensor) so HA's
        recorder already generates long-term (daily) statistics for it automatically —
        no extra recording config needed. Best-effort: any failure just logs and leaves
        last_week as it was.
        """
        if not self.entity_id:
            return
        try:
            end = dt_util.utcnow()
            start = end - timedelta(days=TREND_DAYS)
            stats = await get_instance(self.hass).async_add_executor_job(
                statistics_during_period,
                self.hass, start, end, {self.entity_id}, "day", None, {"mean", "min", "max"},
            )
            rows = stats.get(self.entity_id, [])
            last_week = []
            for row in rows:
                start_ts = row.get("start")
                day = dt_util.as_local(dt_util.utc_from_timestamp(start_ts)) if isinstance(start_ts, (int, float)) \
                    else dt_util.as_local(start_ts)
                last_week.append({
                    "date": day.strftime("%Y-%m-%d"),
                    "mean": round(row["mean"], 1) if row.get("mean") is not None else None,
                    "min": round(row["min"], 1) if row.get("min") is not None else None,
                    "max": round(row["max"], 1) if row.get("max") is not None else None,
                })
            self._last_week = last_week
            self.async_write_ha_state()
        except Exception as e:
            _LOGGER.warning(f"[{self._config['key']}] trend refresh error: {e}")

    # ============================================================
    # ACUMULADO 7 DÍAS (week_extract)
    # ============================================================
    async def _async_refresh_week(self, now=None) -> None:
        """Daily totals for the last 7 days, plus their sum, best day and average.

        Statistics are pulled by HOUR, not by day, because the day's total is not
        simply the day's max:

          * At 00:xx these counters still hold YESTERDAY's figure — the watch
            resets them a bit after midnight. Measured: stand hours on 2/9 read
            0h:15, then 1h:0, 2h:2 ... 14h:9. A daily max reported 15 for a day
            that had reached 9, silently inflating both the day and the week.
            So hour 0 is skipped.
          * Which field holds the value depends on state_class, and there is no
            overlap: total_increasing (steps, calories, distance) keeps `state`
            and a running `sum`, with no max; measurement (fat burning, stand
            hours) keeps mean/min/max and no state. Asking for both and
            preferring the last `state` of the day covers the two.

        Never `change`: it is the difference of the running sum and counts each
        reset as fresh accumulation — it reported -62102 steps for a day with
        4292.
        """
        if not self.entity_id:
            return
        try:
            end = dt_util.utcnow()
            start = end - timedelta(days=TREND_DAYS)
            stats = await get_instance(self.hass).async_add_executor_job(
                statistics_during_period,
                self.hass, start, end, {self.entity_id}, "hour", None, {"state", "max"},
            )

            por_dia: dict = {}
            for row in stats.get(self.entity_id, []):
                start_ts = row.get("start")
                cuando = dt_util.as_local(dt_util.utc_from_timestamp(start_ts)) \
                    if isinstance(start_ts, (int, float)) else dt_util.as_local(start_ts)
                if cuando.hour == 0:
                    continue                      # arrastre de ayer
                dia = cuando.strftime("%Y-%m-%d")
                estado, maximo = row.get("state"), row.get("max")
                if estado is None and maximo is None:
                    continue
                actual = por_dia.setdefault(dia, {"hora": -1, "state": None, "max": None})
                if maximo is not None:
                    actual["max"] = maximo if actual["max"] is None else max(actual["max"], maximo)
                if estado is not None and cuando.hour >= actual["hora"]:
                    actual["hora"], actual["state"] = cuando.hour, estado

            dias = []
            for dia in sorted(por_dia):
                v = por_dia[dia]
                valor = v["state"] if v["state"] is not None else v["max"]
                if valor is None:
                    continue
                dias.append({"date": dia, "total": round(valor, 1)})

            totales = [d["total"] for d in dias]
            self._semana = {
                "week_days": dias,
                "week_total": round(sum(totales), 1) if totales else None,
                "week_average": round(sum(totales) / len(totales), 1) if totales else None,
                "week_best": max(totales) if totales else None,
            }
            self.async_write_ha_state()
        except Exception as e:
            _LOGGER.warning(f"[{self._config['key']}] week refresh error: {e}")

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

        if self._config.get("week_extract"):
            await self._async_refresh_week()
            self.async_on_remove(
                async_track_time_interval(
                    self.hass, self._async_refresh_week, TREND_REFRESH_INTERVAL
                )
            )
        if self._config.get("trend_extract"):
            await self._async_refresh_trend()
            self.async_on_remove(
                async_track_time_interval(
                    self.hass, self._async_refresh_trend, TREND_REFRESH_INTERVAL
                )
            )


class WatchWorkoutHistorySensor(WatchSensor):
    """Sensor whose state is the number of recent workouts and attributes list each one."""

    def __init__(self, hass, entry_id, username, master_sensor_id, sensor_config):
        super().__init__(hass, entry_id, username, master_sensor_id, sensor_config)
        self._recent_workouts: list = []
        self._workouts: list = []

    @staticmethod
    def _local_dt(start_ts):
        """`start` arrives as an epoch in MILLISECONDS (w.startTime straight from the
        Zepp SDK). It used to be fed to datetime.fromisoformat(), which expects an ISO
        string: that raised for nine entries out of ten (leaving the bare epoch on the
        dashboard) and, for the tenth, fromisoformat happened to read the leading digits
        as a year — hence the "1788-08-28" nobody could explain. Same bug, two faces."""
        try:
            return dt_util.as_local(dt_util.utc_from_timestamp(int(start_ts) / 1000))
        except (TypeError, ValueError, OSError, OverflowError):
            return None

    def _parse_history(self, attr_value) -> list:
        try:
            data = json.loads(attr_value) if isinstance(attr_value, str) else attr_value
            if not isinstance(data, list):
                return []
            from .const import SPORT_TYPES
            result = []
            self._workouts = []
            for w in data[:10]:
                sport_id = w.get("sport_type")
                sport_name = self._sport_name(sport_id) if sport_id else "Unknown"
                start_ts = w.get("start")
                dt = self._local_dt(start_ts)
                date_str = dt.strftime("%d/%m %H:%M") if dt else str(start_ts)
                duration = w.get("duration_min", 0)
                result.append(f"{date_str} — {sport_name} ({duration} min)")
                # Structured twin of the pretty string, for cards: formatting a list of
                # sentences back into data on the frontend would be absurd.
                self._workouts.append({
                    "start": dt.isoformat() if dt else None,
                    "date": date_str,
                    "sport": sport_name,
                    "sport_type": sport_id,
                    "duration_min": duration,
                })
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
        return {"recent_workouts": self._recent_workouts, "workouts": self._workouts}


class WatchSyncAgeSensor(WatchSensor):
    """Minutes since the watch last pushed data.

    Every other sensor here is passive: it only changes when the watch sends
    something. That makes a stopped watch app invisible — the dashboard keeps
    showing this morning's figures as if they were current, and nothing says
    otherwise. This one is the exception: it ticks on its own, so the number
    grows when the watch goes quiet and any automation can act on it.
    """

    #: Cada cuánto se recalcula. La resolución interesante son minutos, así que
    #: un minuto sobra y no llena la base de datos.
    INTERVALO = timedelta(minutes=1)

    def __init__(self, hass, entry_id, username, master_sensor_id, sensor_config):
        super().__init__(hass, entry_id, username, master_sensor_id, sensor_config)
        self._ultimo = None

    def _leer_record_time(self):
        master = self.hass.states.get(self._master_sensor_id)
        if not master:
            return None
        crudo = master.attributes.get("record_time")
        if not crudo:
            return None
        return dt_util.parse_datetime(str(crudo))

    @callback
    def _recalcular(self, now=None) -> None:
        cuando = self._leer_record_time()
        if cuando is None:
            self._attr_available = False
            self.async_write_ha_state()
            return
        self._ultimo = cuando
        minutos = (dt_util.utcnow() - dt_util.as_utc(cuando)).total_seconds() / 60
        # Un reloj con la hora adelantada daría negativo; se corta en cero.
        self._attr_native_value = max(0, round(minutos))
        self._attr_available = True
        self.async_write_ha_state()

    @callback
    def _handle_master_update(self, event) -> None:
        self._recalcular()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self._recalcular()
        self.async_on_remove(
            async_track_time_interval(self.hass, self._recalcular, self.INTERVALO)
        )

    @property
    def extra_state_attributes(self) -> dict:
        umbral = self._config.get("stale_after_minutes", 60)
        valor = self._attr_native_value
        return {
            "last_sync": self._ultimo.isoformat() if self._ultimo else None,
            "stale_after_minutes": umbral,
            "is_stale": valor is not None and valor > umbral,
        }


class WatchSleepTimelineSensor(WatchSensor):
    """Sensor whose state is the total minutes of the last sleep session (sum of every
    segment's duration_min — a bare segment count meant nothing on a dashboard, a real
    user confirmed it was confusing). extra_state_attributes.timeline lists each
    segment (phase name + start/stop HH:MM + duration_min) plus segment_count, built
    from the same raw sleep_stage_data the sleep_*_minutes sensors already sum — no
    watch-side change needed."""

    def __init__(self, hass, entry_id, username, master_sensor_id, sensor_config):
        super().__init__(hass, entry_id, username, master_sensor_id, sensor_config)
        self._timeline: list = []
        self._model_to_name: dict = {}

    def _refresh_model_names(self) -> None:
        """(Re)build the model-id -> stage-name map from the master's sleep_stage_constant,
        cached the same way _extract_sleep_stage does."""
        master_state = self.hass.states.get(self._master_sensor_id)
        if not master_state:
            return
        raw_constants = master_state.attributes.get("sleep_stage_constant")
        if raw_constants is None or raw_constants == self._cached_raw_constants:
            return
        try:
            constants = json.loads(raw_constants) if isinstance(raw_constants, str) else raw_constants
            if not isinstance(constants, dict):
                return
            self._cached_constants = constants
            self._cached_raw_constants = raw_constants
            self._model_to_name = {v: k for k, v in constants.items()}
        except Exception as e:
            _LOGGER.warning(f"[sleep_timeline] constants parse error: {e}")

    @staticmethod
    def _to_hhmm(minutes_since_midnight) -> str:
        m = int(minutes_since_midnight) % (24 * 60)
        return f"{m // 60:02d}:{m % 60:02d}"

    def _phase_label(self, stage_name: str) -> str:
        """Localize a raw stage constant name (WAKE_STAGE, ...) to the instance's
        configured language. Falls back to English, then to the raw name itself for
        anything not in SLEEP_PHASE_LABELS (e.g. the "Unknown (N)" placeholder)."""
        lang = str(self.hass.config.language or "en").lower()[:2]
        table = SLEEP_PHASE_LABELS.get(lang, SLEEP_PHASE_LABELS["en"])
        return table.get(stage_name, stage_name)

    def _parse_timeline(self, attr_value) -> list:
        try:
            data = json.loads(attr_value) if isinstance(attr_value, str) else attr_value
            if not isinstance(data, list):
                return []
            self._refresh_model_names()
            result = []
            for segment in data:
                model = segment.get("model")
                start = segment.get("start", 0)
                stop = segment.get("stop", 0)
                stage_name = self._model_to_name.get(model, f"Unknown ({model})")
                result.append({
                    "phase": self._phase_label(stage_name),
                    # `phase` is for display and changes with the language; `stage` is
                    # for comparing and is always the watch's own constant
                    # (WAKE_STAGE/REM_STAGE/LIGHT_STAGE/DEEP_STAGE), never translated.
                    # Same lesson as entity_id vs unique_id: what's shown can't be
                    # what's compared.
                    "stage": stage_name,
                    "start": self._to_hhmm(start),
                    "stop": self._to_hhmm(stop),
                    "duration_min": stop - start,
                })
            return result
        except Exception as e:
            _LOGGER.warning(f"[sleep_timeline] parse error: {e}")
            return []

    @callback
    def _handle_master_update(self, event) -> None:
        new_state = event.data.get("new_state")
        if new_state is None:
            self._attr_available = False
            self.async_write_ha_state()
            return
        attr_value = new_state.attributes.get("sleep_stage_data")
        if attr_value is None:
            self._attr_available = False
            self.async_write_ha_state()
            return
        self._timeline = self._parse_timeline(attr_value)
        self._attr_native_value = self._total_minutes()
        self._attr_available = True
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        master_state = self.hass.states.get(self._master_sensor_id)
        if master_state:
            attr_value = master_state.attributes.get("sleep_stage_data")
            if attr_value is not None:
                self._timeline = self._parse_timeline(attr_value)
                self._attr_native_value = self._total_minutes()
                self._attr_available = True

    def _total_minutes(self) -> int:
        return sum(segment["duration_min"] for segment in self._timeline)

    @property
    def extra_state_attributes(self) -> dict:
        return {"timeline": self._timeline, "segment_count": len(self._timeline)}


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
