import json
import random

import comfy.samplers

_SAMPLERS = comfy.samplers.KSampler.SAMPLERS
_SCHEDULERS = comfy.samplers.KSampler.SCHEDULERS
_DEF_SAMPLER = "euler" if "euler" in _SAMPLERS else _SAMPLERS[0]
_DEF_SCHED = "normal" if "normal" in _SCHEDULERS else _SCHEDULERS[0]


class AtelierDials:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"dials": ("STRING", {"default": "", "multiline": False})},
            "optional": {"palette": ("PALETTE",)},
        }

    RETURN_TYPES = ("PALETTE",)
    RETURN_NAMES = ("palette",)
    FUNCTION = "turn"
    CATEGORY = "atelier"

    def turn(self, dials="", palette=None):
        cards = _parse(dials)
        out = dict(palette) if palette else {}
        out["dials"] = cards
        if cards:
            # a sentinel only reaches here on an api run with no frontend to resolve it - never sample -1
            out["seed"] = _resolve(cards[0].get("seed"))
        return (out,)


def _parse(raw):
    raw = (raw or "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    cards = data.get("cards", []) if isinstance(data, dict) else data
    return [_clean(c) for c in (cards or [])]


def _clean(c):
    return {
        "steps": _int(c.get("steps"), 20, 1, 100),
        "cfg": _float(c.get("cfg"), 8.0, 0.0, 30.0),
        "denoise": _float(c.get("denoise"), 1.0, 0.0, 1.0),
        "sampler_name": _pick(c.get("sampler_name"), _SAMPLERS, _DEF_SAMPLER),
        "scheduler": _pick(c.get("scheduler"), _SCHEDULERS, _DEF_SCHED),
        "seed": _seed(c.get("seed")),
    }


def _pick(v, options, default):
    return v if v in options else default


def _int(v, d, lo, hi):
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return d


def _float(v, d, lo, hi):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return d


def _seed(v):
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _resolve(v):
    if v is None or v < 0:
        return random.randint(0, 0xffffffffffffffff)
    return v
