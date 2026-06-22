from .hub import AtelierHub
from .gate import AtelierPassGate
from .cart import AtelierCart
from .swatches import AtelierSwatches
from . import info  # noqa: F401 - imported for its side effect: registers the /atelier routes

NODE_CLASS_MAPPINGS = {
    "AtelierHub": AtelierHub,
    "AtelierPassGate": AtelierPassGate,
    "AtelierCart": AtelierCart,
    "AtelierSwatches": AtelierSwatches,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AtelierHub": "Atelier Hub",
    "AtelierPassGate": "Atelier Pass Gate",
    "AtelierCart": "Atelier Cart",
    "AtelierSwatches": "Atelier Swatches",
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
