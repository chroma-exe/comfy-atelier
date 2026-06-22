from .palette import INTEROP, merge

_FORCE = {"INT", "FLOAT", "STRING"}


class AtelierCart:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {"palette": ("PALETTE",)}
        for name, t in INTEROP:
            optional[name] = (t, {"forceInput": True}) if t in _FORCE else (t,)
        return {"optional": optional}

    RETURN_TYPES = ("PALETTE", *(t for _, t in INTEROP))
    RETURN_NAMES = ("palette", *(n for n, _ in INTEROP))
    FUNCTION = "wheel"
    CATEGORY = "atelier"

    def wheel(self, palette=None, **kwargs):
        out = merge(palette, kwargs)
        return (out, *(out.get(n) for n, _ in INTEROP))
