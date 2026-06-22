import json


class AtelierSwatches:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "cards": ("STRING", {"default": "", "multiline": False}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("SWATCHES",)
    RETURN_NAMES = ("swatches",)
    FUNCTION = "lay_out"
    CATEGORY = "atelier"

    def lay_out(self, cards="", unique_id=None):
        return (_parse(cards),)


def _parse(raw):
    raw = (raw or "").strip()
    out = {"pos": {"prepend": [], "append": []}, "neg": {"prepend": [], "append": []}}
    if not raw:
        return out
    data = json.loads(raw)
    for side in ("pos", "neg"):
        for c in data.get(side, []):
            if not c.get("on", True):
                continue
            kind = c.get("kind")
            if kind not in ("prepend", "append"):
                continue
            out[side][kind].append({"text": str(c.get("text") or ""), "comma": bool(c.get("comma", True))})
    return out
