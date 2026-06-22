from .palette import INTEROP, merge
from .encode import encode_prompt

_FORCE = {"INT", "FLOAT", "STRING"}


class AtelierCart:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {"palette": ("PALETTE",)}
        for name, t in INTEROP:
            optional[name] = (t, {"forceInput": True}) if t in _FORCE else (t,)
        return {"optional": optional}

    RETURN_TYPES = ("PALETTE", *(t for _, t in INTEROP), "INT", "INT")
    RETURN_NAMES = ("palette", *(n for n, _ in INTEROP), "width", "height")
    FUNCTION = "wheel"
    CATEGORY = "atelier"

    def wheel(self, palette=None, **kwargs):
        out = merge(palette, kwargs)
        clip = out.get("clip")
        if clip is not None:
            # text is canonical: a fresh prompt string wired in here means the baked cond is stale,
            # so re-encode it - unless a cond was also wired into this same cart, which wins on purpose
            if kwargs.get("positive_text") is not None and kwargs.get("positive") is None:
                out["positive"] = encode_prompt(clip, out["positive_text"])
            if kwargs.get("negative_text") is not None and kwargs.get("negative") is None:
                out["negative"] = encode_prompt(clip, out["negative_text"])
        w, h = _latent_size(out.get("latent"))
        return (out, *(out.get(n) for n, _ in INTEROP), w, h)


def _latent_size(latent):
    samples = latent.get("samples") if latent else None
    if samples is None:
        return 0, 0
    return samples.shape[3] * 8, samples.shape[2] * 8
