# ⌚ Integracion HA Companion ⌚

## ¿Qué puede hacer esta Integracion HA Companion?

«HA Companion» es un componente para [Home Assistant](https://home-assistant.io/) que permite obtener los datos de salud de tu smartwatch Amazfit/Zepp con la aplicación HA Companion instalada, en tu instalación de Home Assistant, visualizando más de 40 métricas de salud, actividad, sueño y estado del dispositivo.

---

## Instalación

### Mediante HACS (Recomendado)

Para instalar el componente usando HACS:

1. Haz click en los tres puntos en la parte de arriba de la esquina del menú de HACS.
2. Selecciona **Repositorio Personalizado**.
3. Añade la URL del repositorio: `https://github.com/AguacatecHA/HA_Companion`.
4. Selecciona el tipo: **Integración**.
5. Haz click en el botón **Añadir**.

<details>
<summary>Fuera de HACS</summary>

1. Descarga la última release de la integración HA Companion de **[GitHub Releases](https://github.com/AguacatecHA/HA_Companion/releases)**.
2. Extrae los ficheros y pon la carpeta `ha_companion` en la carpeta `custom_components` de tu Home Assistant (normalmente en `config/custom_components`).
3. Reinicia tu Home Assistant para cargar la nueva integración.

</details>

---

## Configuración

Para añadir la integración a tu instancia de Home Assistant, usa el botón:

<p>
    <a href="https://my.home-assistant.io/redirect/config_flow_start?domain=ha_companion" class="my badge" target="_blank">
        <img src="https://my.home-assistant.io/badges/config_flow_start.svg">
    </a>
</p>

### Configuración Manual

Una vez instalado, ve a _Dispositivos y Servicios → Añadir Integración_ y busca _HA Companion_.

El asistente te solicitará el nombre de usuario que tienes puesto en tu aplicacion de Zepp HA Companion, y la proxima vez que actualice los datos se rellenaran automaticamente

---

## Sensores disponibles

Una vez configurado, tendrás un dispositivo con los sensores organizados en las siguientes categorías:

### 🫀 Salud

| Sensor | Descripción |
|---|---|
| Frecuencia Cardíaca | Pulsaciones por minuto |
| Frecuencia Cardíaca en Reposo | Media de pulsaciones en reposo del día |
| Frecuencia Cardíaca Máxima | Máximo alcanzado durante el día |
| Oxígeno en Sangre (SpO2) | Porcentaje de saturación de oxígeno |
| Estrés | Índice de nivel de estrés (0–100) |
| Temperatura Corporal | Temperatura en °C |
| VO2 Máx | Consumo máximo de oxígeno (ml/kg/min) |

### 😴 Sueño

| Sensor | Descripción |
|---|---|
| Estado del Sueño | Estado actual del ciclo de sueño |
| Modo Sueño | Indica si el modo sueño está activado |
| Puntuación del Sueño | Puntuación global de la calidad del sueño |
| Tiempo Total de Sueño | Duración total del sueño en horas/minutos |
| Sueño Profundo | Duración de la fase de sueño profundo |
| Tiempo de Sueño Profundo | Tiempo acumulado en sueño profundo |
| Sueño Ligero | Duración de la fase de sueño ligero |
| Sueño REM | Duración de la fase REM |
| Tiempo Despierto | Tiempo despierto durante la noche |
| Hora de Dormir | Hora en que se inició el sueño |
| Hora de Despertar | Hora en que se detectó el despertar |

### 🏃 Actividad

| Sensor | Descripción |
|---|---|
| Pasos | Contador diario de pasos |
| Calorías | Calorías quemadas en el día |
| Distancia | Distancia recorrida en km |
| Horas de Pie | Horas activo / de pie durante el día |
| Quema de Grasa | Grasa quemada estimada (g) |
| PAI Total | Índice de actividad personal acumulado |
| Puntuación PAI | Puntuación PAI del período actual |

### 🏋️ Entrenamientos

| Sensor | Descripción |
|---|---|
| Número de Entrenamientos | Total de sesiones registradas |
| Carga de Entrenamiento | Carga acumulada de los entrenamientos |
| Duración Último Entrenamiento | Duración de la última sesión |
| Fecha Último Entrenamiento | Fecha y hora del último entrenamiento |
| Tipo Último Deporte | Tipo de deporte del último entrenamiento |

### 🌍 Entorno

| Sensor | Descripción |
|---|---|
| Altitud | Altitud actual en metros |
| Presión Atmosférica | Presión en hPa |

### ⌚ Estado del Dispositivo

| Sensor | Descripción |
|---|---|
| Batería | Porcentaje de batería restante |
| Estado del Reloj | Estado general de conexión del reloj |
| Modo Ahorro de Energía | Indica si está activo el ahorro de energía |
| Modo Ultra Ahorro de Energía | Indica si está activo el modo ultra ahorro |
| Modo Teatro | Indica si el modo teatro está activado |
| No Molestar | Indica si el modo No Molestar está activo |
| Versión del Firmware | Versión actual del firmware del reloj |

### 🔧 Diagnóstico

| Sensor | Descripción |
|---|---|
| Altura | Altura del usuario en cm (perfil) |
| Peso | Peso del usuario en kg (perfil) |
| Edad | Edad del usuario (perfil) |
| Género | Género del usuario (perfil) |
| Región | Región configurada en la app |
| API Mínima | Versión mínima requerida de la API |
| Objetivo de Pasos Diarios | Meta de pasos configurada |
| Objetivo de Calorías | Meta de calorías configurada |
| Objetivo Horas de Pie | Meta de horas de pie configurada |
| Objetivo Quema de Grasa | Meta de quema de grasa configurada |
