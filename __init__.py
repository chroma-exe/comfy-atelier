from .hub import AtelierHub
from .press import AtelierPress
from .cart import AtelierCart
from .swatches import AtelierSwatches
from .dials import AtelierDials
from . import info  # noqa: F401 - imported for its side effect: registers the /atelier routes

NODE_CLASS_MAPPINGS = {
    "AtelierHub": AtelierHub,
    "AtelierPress": AtelierPress,
    "AtelierCart": AtelierCart,
    "AtelierSwatches": AtelierSwatches,
    "AtelierDials": AtelierDials,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AtelierHub": "Atelier Hub",
    "AtelierPress": "Atelier Press (KSampler)",
    "AtelierCart": "Atelier Cart",
    "AtelierSwatches": "Atelier Swatches",
    "AtelierDials": "Atelier Dials",
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
