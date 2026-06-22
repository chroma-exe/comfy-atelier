INTEROP = [
    ("model", "MODEL"),
    ("clip", "CLIP"),
    ("vae", "VAE"),
    ("positive", "CONDITIONING"),
    ("negative", "CONDITIONING"),
    ("latent", "LATENT"),
    ("images", "IMAGE"),
    ("seed", "INT"),
]


def merge(base, overrides):
    out = dict(base) if base else {}
    for k, v in overrides.items():
        # skip None on purpose - absent input inherits the incoming value. this is the whole
        # contract; a plain out.update() would clobber it with None and silently break inherit
        if v is not None:
            out[k] = v
    return out
