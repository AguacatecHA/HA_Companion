"""Constants for Watch Sensors Pro."""

DOMAIN = "ha_companion"

# Definición de todos los sensores
SENSORS = [
    {
        "key": "battery",
        "translation_key": "Battery",
        "attribute": "battery_state",
        "unit": "%",
        "device_class": "battery",
        "icon": "mdi:battery",
        "state_class": "measurement"
    },
    {
        "key": "steps",
        "translation_key": "Steps",
        "attribute": "steps_state",
        "unit": "steps",
        "icon": "mdi:walk",
        "state_class": "total_increasing"
    },
    {
        "key": "steps_target",
        "translation_key": "Steps Daily Target",
        "attribute": "steps_daily_target",
        "unit": "steps",
        "icon": "mdi:flag-checkered",
        "state_class": "measurement"
    },    
    {
        "key": "heart_rate",
        "translation_key": "Heart Rate",
        "attribute": "heart_state",
        "unit": "bpm",
        "device_class": "heart_rate",
        "icon": "mdi:heart-pulse",
        "state_class": "measurement"
    },
    {
        "key": "heart_max",
        "translation_key": "Heart Rate Max",
        "attribute": "heart_daily_summary",
        "unit": "bpm",
        "device_class": "heart_rate",
        "icon": "mdi:heart-flash",
        "state_class": "measurement",
        "json_extract": "maximum.hr_value"  
    },
    {
        "key": "heart_resting",
        "translation_key": "Resting Heart Rate",
        "attribute": "heart_resting",
        "unit": "bpm",
        "device_class": "heart_rate",
        "icon": "mdi:heart-pulse",
        "state_class": "measurement"
    },    
    {
        "key": "spo2",
        "translation_key": "Blood Oxygen",
        "attribute": "spo2_state",
        "unit": "%",
        "icon": "mdi:lungs",
        "state_class": "measurement",
        "json_extract": "value"
    },
    {
        "key": "calories",
        "translation_key": "Calories",
        "attribute": "calorie_state",
        "unit": "kcal",
        "device_class": "energy",
        "icon": "mdi:fire",
        "state_class": "total_increasing"
    },
    {
        "key": "calories_target",
        "translation_key": "Calories Target",
        "attribute": "calories_burnt_target",
        "unit": "kcal",
        "device_class": "energy",
        "icon": "mdi:fire-circle",
        "state_class": "measurement"
    },    
    {
        "key": "distance",
        "translation_key": "Distance",
        "attribute": "distance_state",
        "unit": "m",
        "device_class": "distance",
        "icon": "mdi:map-marker-distance",
        "state_class": "total_increasing"
    },
    {
        "key": "stand_hours",
        "translation_key": "Stand Hours",
        "attribute": "stand_state",
        "unit": "h",
        "icon": "mdi:human",
        "state_class": "measurement"
    },
    {
        "key": "stand_hours_target",
        "translation_key": "Stand Hours Target",
        "attribute": "stand_hours_target",
        "unit": "h",
        "icon": "mdi:human-handsup",
        "state_class": "measurement"
    },    
    {
        "key": "fat_burning",
        "translation_key": "Fat Burning",
        "attribute": "fat_burning_state",
        "unit": "min",
        "icon": "mdi:fire-circle",
        "state_class": "measurement"
    },
    {
        "key": "fat_burning_target",
        "translation_key": "Fat Burning Target",
        "attribute": "fat_burning_minutes_target",
        "unit": "min",
        "icon": "mdi:fire-circle",
        "state_class": "measurement"
    },    
    {
        "key": "pai",
        "translation_key": "PAI Score",
        "attribute": "pai_state",
        "unit": "PAI",
        "icon": "mdi:chart-line",
        "state_class": "measurement"
    },
    {
        "key": "pai_total",
        "translation_key": "PAI Total",
        "attribute": "pai_total",
        "unit": "PAI",
        "icon": "mdi:chart-line",
        "state_class": "total_increasing"
    },    
    {
        "key": "temperature",
        "translation_key": "Body Temperature",
        "attribute": "temperature_state",
        "unit": "°C",
        "device_class": "temperature",
        "icon": "mdi:thermometer",
        "state_class": "measurement",
        "json_extract": "value",
        "value_convert": 0.01  # ← 3318 * 0.01 = 33.18°C
    },
    {
        "key": "sleep_status",
        "translation_key": "Sleep Status",
        "attribute": "sleep_state",
        "icon": "mdi:sleep"
    },
    {
        "key": "sleep_score",
        "translation_key": "Sleep Score",
        "attribute": "sleep_info",
        "unit": "points",
        "icon": "mdi:sleep",
        "state_class": "measurement",
        "json_extract": "score"
    },
    {
        "key": "sleep_total_time",
        "translation_key": "Sleep Total Time", 
        "attribute": "sleep_info",
        "unit": "min",
        "device_class": "duration",
        "icon": "mdi:bed-clock",
        "state_class": "measurement",
        "json_extract": "totalTime"
    },
    {
        "key": "sleep_deep_time",
        "translation_key": "Sleep Deep Time",
        "attribute": "sleep_info",
        "unit": "min",
        "device_class": "duration",
        "icon": "mdi:bed",
        "state_class": "measurement",
        "json_extract": "deepTime"
    },
    {
        "key": "sleep_start_time",
        "translation_key": "Sleep Start Time",
        "attribute": "sleep_info",
        "icon": "mdi:weather-night",
        "json_extract": "startTime",
        "time_convert": True   
    },
    {
        "key": "sleep_end_time",
        "translation_key": "Sleep End Time",
        "attribute": "sleep_info",
        "icon": "mdi:weather-sunny",
        "json_extract": "endTime",
        "time_convert": True   
    },
    {
        "key": "sleep_deep_minutes",
        "translation_key": "Sleep Deep Stage",
        "attribute": "sleep_stage_data",
        "unit": "min",
        "device_class": "duration",
        "icon": "mdi:sleep",
        "state_class": "measurement",
        "sleep_stage_extract": "DEEP_STAGE"
    },
    {
        "key": "sleep_rem_minutes",
        "translation_key": "Sleep REM Stage",
        "attribute": "sleep_stage_data",
        "unit": "min",
        "device_class": "duration",
        "icon": "mdi:brain",
        "state_class": "measurement",
        "sleep_stage_extract": "REM_STAGE"
    },
    {
        "key": "sleep_light_minutes",
        "translation_key": "Sleep Light Stage",
        "attribute": "sleep_stage_data",
        "unit": "min",
        "device_class": "duration",
        "icon": "mdi:weather-night-partly-cloudy",
        "state_class": "measurement",
        "sleep_stage_extract": "LIGHT_STAGE"
    },
    {
        "key": "sleep_wake_minutes",
        "translation_key": "Sleep Wake Stage",
        "attribute": "sleep_stage_data",
        "unit": "min",
        "device_class": "duration",
        "icon": "mdi:eye",
        "state_class": "measurement",
        "sleep_stage_extract": "WAKE_STAGE"
    },

]
