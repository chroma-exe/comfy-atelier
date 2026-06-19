from .hub import AtelierHub
from .gate import AtelierPassGate

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
