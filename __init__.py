from .hub import AtelierHub
from .gate import AtelierPassGate
from . import info  # noqa: F401 - imported for its side effect: registers the /atelier routes

NODE_CLASS_MAPPINGS = {
    "AtelierHub": AtelierHub,
    "AtelierPassGate": AtelierPassGate,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AtelierHub": "Atelier Hub",
    "AtelierPassGate": "Atelier Pass Gate",
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
