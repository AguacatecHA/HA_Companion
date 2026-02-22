"""Constants for Watch Sensors Pro."""

DOMAIN = "ha_companion"

# Definición de todos los sensores
SENSORS = [
    {
        "key": "battery",
        "name": "Battery",
        "attribute": "battery_state",
        "unit": "%",
        "device_class": "battery",
        "icon": "mdi:battery",
        "state_class": "measurement"
    },
    {
        "key": "steps",
        "name": "Steps",
        "attribute": "steps_state",
        "unit": "steps",
        "icon": "mdi:walk",
        "state_class": "total_increasing"
    },
    {
        "key": "heart_rate",
        "name": "Heart Rate",
        "attribute": "heart_state",
        "unit": "bpm",
        "device_class": "heart_rate",
        "icon": "mdi:heart-pulse",
        "state_class": "measurement"
    },
    {
        "key": "spo2",
        "name": "Blood Oxygen",
        "attribute": "spo2_state",
        "unit": "%",
        "icon": "mdi:lungs",
        "state_class": "measurement",
        "json_extract": "value"
    },
    {
        "key": "calories",
        "name": "Calories",
        "attribute": "calorie_state",
        "unit": "kcal",
        "device_class": "energy",
        "icon": "mdi:fire",
        "state_class": "total_increasing"
    },
    {
        "key": "distance",
        "name": "Distance",
        "attribute": "distance_state",
        "unit": "m",
        "device_class": "distance",
        "icon": "mdi:map-marker-distance",
        "state_class": "total_increasing"
    },
    {
        "key": "stand_hours",
        "name": "Stand Hours",
        "attribute": "stand_state",
        "unit": "h",
        "icon": "mdi:human",
        "state_class": "measurement"
    },
    {
        "key": "fat_burning",
        "name": "Fat Burning",
        "attribute": "fat_burning_state",
        "unit": "min",
        "icon": "mdi:fire-circle",
        "state_class": "measurement"
    },
    {
        "key": "pai",
        "name": "PAI Score",
        "attribute": "pai_state",
        "unit": "PAI",
        "icon": "mdi:chart-line",
        "state_class": "measurement"
    },
    {
        "key": "temperature",
        "name": "Skin Temperature",
        "attribute": "temperature_state",
        "unit": "°C",
        "device_class": "temperature",
        "icon": "mdi:thermometer",
        "state_class": "measurement",
        "json_extract": "value"
    },
    {
        "key": "sleep_status",
        "name": "Sleep Status",
        "attribute": "sleep_state",
        "icon": "mdi:sleep"
    }
]
