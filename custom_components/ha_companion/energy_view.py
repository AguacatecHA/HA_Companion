"""Resumen de energía de hoy para la pantalla Energía del reloj.

El panel de Energía de HA (fuentes, aparatos, precios) y las estadísticas que
usa solo se sirven por WebSocket, y la parte del móvil de la app del reloj solo
sabe hacer HTTP. Aquí se lee esa misma configuración y se calcula lo de hoy con
las estadísticas del recorder, igual que lo pinta HA:

GET /api/ha_companion/energy -> ver `_resumen`.

No hay nada que configurar en la app: si el usuario no tiene el panel de
Energía montado, se devuelve `configured: false`.
"""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

# Potencias que sabemos pasar a vatios; lo demás se ignora.
_A_VATIOS = {"W": 1.0, "kW": 1000.0, "MW": 1_000_000.0, "mW": 0.001}


def _num(valor: Any) -> float | None:
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return n if n == n else None  # fuera NaN


def _redondear(valor: float | None, decimales: int = 2) -> float | None:
    return None if valor is None else round(valor, decimales)


class HACompanionEnergyView(HomeAssistantView):
    """Puente REST con el panel de Energía de HA."""

    url = "/api/ha_companion/energy"
    name = "api:ha_companion:energy"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        try:
            return self.json(await _resumen(hass))
        except Exception as exc:  # pylint: disable=broad-exception-caught
            _LOGGER.warning("Energy summary failed: %s", exc)
            return self.json({"configured": False, "error": str(exc)})


async def _resumen(hass: HomeAssistant) -> dict[str, Any]:
    # Importados aquí: energy y recorder no son dependencias de la integración,
    # y quien no los tenga cargados no debe romper el arranque.
    from homeassistant.components.energy.data import async_get_manager
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.statistics import statistic_during_period

    prefs = (await async_get_manager(hass)).data or {}
    fuentes = prefs.get("energy_sources") or []
    aparatos = prefs.get("device_consumption") or []
    if not fuentes and not aparatos:
        return {"configured": False}

    costes = (hass.data.get("energy") or {}).get("cost_sensors") or {}
    desde = dt_util.start_of_local_day()
    recorder = get_instance(hass)

    async def cambio(stat_id: str | None, unidades: dict[str, str] | None) -> float:
        """Lo que ha subido hoy una estadística acumulada (0 si no hay datos)."""
        if not stat_id:
            return 0.0
        datos = await recorder.async_add_executor_job(
            statistic_during_period, hass, desde, None, stat_id, {"change"}, unidades
        )
        return _num((datos or {}).get("change")) or 0.0

    async def kwh(stat_id: str | None) -> float:
        return await cambio(stat_id, {"energy": "kWh"})

    async def coste(stat_id: str | None, stat_cost: str | None) -> float:
        """Coste de hoy: el sensor de coste del usuario o el que crea HA."""
        return await cambio(stat_cost or costes.get(stat_id or ""), None)

    def vatios(entidad: str | None) -> float | None:
        if not entidad:
            return None
        estado = hass.states.get(entidad)
        if estado is None:
            return None
        valor = _num(estado.state)
        factor = _A_VATIOS.get(estado.attributes.get("unit_of_measurement") or "W")
        return None if valor is None or factor is None else valor * factor

    ent_reg = er.async_get(hass)

    def _clase(entrada: er.RegistryEntry) -> str | None:
        """Clase del sensor: la del registro y, si no la guarda, la de su estado."""
        clase = entrada.device_class or entrada.original_device_class
        if clase:
            return clase
        estado = hass.states.get(entrada.entity_id)
        return estado.attributes.get("device_class") if estado else None

    dev_reg = dr.async_get(hass)

    def potencia_del_aparato(entidad: str | None) -> str | None:
        """El sensor de potencia del mismo dispositivo que un contador de energía.

        HA solo guarda la potencia en el panel si el usuario la ha puesto
        (`stat_rate`); casi nadie lo hace, pero casi todo enchufe medidor trae
        las dos cosas en el mismo dispositivo. Si el dispositivo mide varios
        canales (una pinza con dos, una regleta), se empareja por nombre:
        `..._energy_a` con `..._power_a`; si no cuadra, mejor nada que el de otro.
        """
        entrada = ent_reg.async_get(entidad) if entidad else None
        if entrada is None or not entrada.device_id:
            return None
        potencias = [
            otra.entity_id
            for otra in er.async_entries_for_device(ent_reg, entrada.device_id)
            if otra.domain == "sensor" and _clase(otra) == "power"
        ]
        if len(potencias) == 1:
            return potencias[0]
        gemela = entidad.replace("energy", "power")
        return gemela if gemela in potencias else None

    # Dispositivos con más de un contador en la lista de aparatos: ahí el nombre
    # del dispositivo no distingue un canal de otro y se usa el de la entidad.
    vistos: dict[str, int] = {}
    for a in aparatos:
        entrada = ent_reg.async_get(a.get("stat_consumption") or "")
        if entrada and entrada.device_id:
            vistos[entrada.device_id] = vistos.get(entrada.device_id, 0) + 1

    def nombre(entidad: str, propio: str | None) -> str:
        if propio and propio.strip():
            return propio.strip()
        estado = hass.states.get(entidad)
        amigable = estado and estado.attributes.get("friendly_name")
        entrada = ent_reg.async_get(entidad)
        if entrada and entrada.device_id and vistos.get(entrada.device_id, 0) < 2:
            disp = dev_reg.async_get(entrada.device_id)
            if disp and (disp.name_by_user or disp.name):
                return disp.name_by_user or disp.name
        return amigable or entidad

    red_in = red_out = solar = bat_in = bat_out = coste_luz = 0.0
    hay = {"solar": False, "battery": False, "export": False}
    ahora_w: float | None = None
    solar_w: float | None = None
    otros: list[dict[str, Any]] = []

    def sumar_ahora(w: float | None) -> None:
        nonlocal ahora_w
        if w is not None:
            ahora_w = (ahora_w or 0.0) + w

    for f in fuentes:
        tipo = f.get("type")
        if tipo == "grid":
            # Formato actual (una conexión por fuente) y el antiguo (listas).
            entradas = [f] if "flow_from" not in f else (f.get("flow_from") or [])
            salidas = [f] if "flow_to" not in f else (f.get("flow_to") or [])
            for e in entradas:
                sid = e.get("stat_energy_from")
                if not sid:
                    continue
                red_in += await kwh(sid)
                coste_luz += await coste(sid, e.get("stat_cost"))
                if "flow_from" not in f:
                    sumar_ahora(vatios(f.get("stat_rate") or potencia_del_aparato(sid)))
            for s in salidas:
                sid = s.get("stat_energy_to")
                if not sid:
                    continue
                hay["export"] = True
                red_out += await kwh(sid)
                coste_luz -= abs(await coste(sid, s.get("stat_compensation")))
        elif tipo == "solar":
            hay["solar"] = True
            solar += await kwh(f.get("stat_energy_from"))
            w = vatios(f.get("stat_rate") or potencia_del_aparato(f.get("stat_energy_from")))
            if w is not None:
                solar_w = (solar_w or 0.0) + w
        elif tipo == "battery":
            hay["battery"] = True
            bat_out += await kwh(f.get("stat_energy_from"))
            bat_in += await kwh(f.get("stat_energy_to"))
        elif tipo in ("gas", "water"):
            sid = f.get("stat_energy_from")
            estado = hass.states.get(sid) if sid else None
            if estado is None:
                # Contador borrado pero que sigue en el panel de Energía.
                continue
            otros.append({
                "type": tipo,
                "amount": _redondear(await cambio(sid, None), 2),
                "unit": estado.attributes.get("unit_of_measurement") or "",
                "cost": _redondear(await coste(sid, f.get("stat_cost")), 2),
            })

    casa = max(0.0, red_in - red_out + solar + bat_out - bat_in)

    lista = []
    for a in aparatos:
        sid = a.get("stat_consumption")
        if not sid:
            continue
        lista.append({
            "name": nombre(sid, a.get("name")),
            "kwh": _redondear(await kwh(sid), 3),
            "w": _redondear(vatios(a.get("stat_rate") or potencia_del_aparato(sid)), 0),
            # Un aparato medido dentro de otro (regleta → enchufe) no suma dos veces.
            "sub": bool(a.get("included_in_stat")),
        })
    lista.sort(key=lambda x: x["kwh"] or 0, reverse=True)

    medido = sum(x["kwh"] or 0 for x in lista if not x["sub"])
    return {
        "configured": True,
        "currency": hass.config.currency,
        "home_kwh": _redondear(casa, 3),
        "cost": _redondear(coste_luz, 2),
        "now_w": _redondear(ahora_w, 0),
        "grid_in": _redondear(red_in, 3),
        "grid_out": _redondear(red_out, 3) if hay["export"] else None,
        "solar": _redondear(solar, 3) if hay["solar"] else None,
        "solar_w": _redondear(solar_w, 0),
        "battery_in": _redondear(bat_in, 3) if hay["battery"] else None,
        "battery_out": _redondear(bat_out, 3) if hay["battery"] else None,
        "untracked": _redondear(max(0.0, casa - medido), 3) if lista else None,
        "others": otros,
        "devices": lista,
    }
