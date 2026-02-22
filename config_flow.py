"""Config flow for Watch Sensors Pro."""
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

DOMAIN = "ha_companion"

class HACompanionConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for HA Companion."""
    
    VERSION = 1
    
    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        errors = {}
        
        if user_input is not None:
            username = user_input.get("username", "watch").lower().replace(" ", "_")
            
            # Crear entry
            await self.async_set_unique_id(f"{username}")
            self._abort_if_unique_id_configured()
            
            return self.async_create_entry(
                title=f"HA Companion - {username}",
                data={"username": username}
            )
        
        data_schema = vol.Schema({
            vol.Required("username", default="amazfit_HA_Companion"): str,
        })
        
        return self.async_show_form(
            step_id="user",
            data_schema=data_schema,
            errors=errors,
            description_placeholders={
                "info": "Enter the watch username (from your Zepp app)"
            }
        )
