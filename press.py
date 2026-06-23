import math
import random

import torch
import comfy.sample
import comfy.utils
import comfy.model_management as model_management
import latent_preview

from .loader import load_checkpoint, apply_loras, apply_overrides
from .encode import encode_prompt

_DEFAULTS = {"steps": 20, "cfg": 8.0, "denoise": 1.0, "sampler_name": "euler", "scheduler": "normal", "seed": None}


class AtelierPress:
    DESCRIPTION = ("the sampler. a multi-pass KSampler that reads steps/cfg/seed/sampler off the dials and the "
                   "cond/roster off the palette, loads this slot's checkpoint, renders the pass, and drops VRAM "
                   "before the next one. variation_strength > 0 blends a second seed in for near-misses.")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "palette": ("PALETTE",),
                "slot": ("INT", {"default": 0, "min": 0, "max": 63}),
                "free_vram_first": ("BOOLEAN", {"default": True}),
                "variation_seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "variation_strength": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "variation_method": (["linear", "slerp"],),
            },
            "optional": {
                # wire the previous pass's latent/image in here. nothing reads the value - the
                # data edge IS the point: it's the only thing that makes comfy run this press
                # after that pass instead of whenever it pleases. see decisions.md
                "run_after": ("*", {}),
            },
        }

    RETURN_TYPES = ("PALETTE", "LATENT")
    RETURN_NAMES = ("palette", "latent")
    FUNCTION = "pull"
    CATEGORY = "atelier"

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    def pull(self, palette, slot, free_vram_first=True, variation_seed=0, variation_strength=0.0,
             variation_method="linear", run_after=None):
        palette = palette or {}
        latent = palette.get("latent")
        if latent is None:
            raise ValueError("press: no latent in the palette - wire one through the hub's globals first")

        model, clip, vae = _load_slot(palette, slot, free_vram_first)

        d = _settings(palette, slot)
        pos_text, neg_text = palette.get("positive_text"), palette.get("negative_text")
        positive = encode_prompt(clip, pos_text) if pos_text is not None else palette.get("positive")
        negative = encode_prompt(clip, neg_text) if neg_text is not None else palette.get("negative")

        seed = _resolve(d["seed"] if d["seed"] is not None else palette.get("seed"))
        latent_image = latent["samples"]
        latent_image = comfy.sample.fix_empty_latent_channels(model, latent_image, latent.get("downscale_ratio_spacial"))
        noise = _make_noise(latent_image, seed, latent.get("batch_index"), variation_seed, variation_strength, variation_method)
        callback = latent_preview.prepare_callback(model, d["steps"])
        print(f"[atelier] press -> slot {slot}: {d['steps']} steps, {d['sampler_name']}/{d['scheduler']}, seed {seed}"
              + (f", variation {variation_strength} ({variation_method})" if variation_strength > 0 else ""))
        samples = comfy.sample.sample(model, noise, d["steps"], d["cfg"], d["sampler_name"], d["scheduler"],
                                      positive, negative, latent_image, denoise=d["denoise"],
                                      noise_mask=latent.get("noise_mask"), callback=callback,
                                      disable_pbar=not comfy.utils.PROGRESS_BAR_ENABLED, seed=seed)

        out_latent = latent.copy()
        out_latent.pop("downscale_ratio_spacial", None)
        out_latent["samples"] = samples
        out = dict(palette)
        out["latent"] = out_latent
        return (out, out_latent)


def _settings(palette, slot):
    dials = palette.get("dials") or []
    return dials[slot] if 0 <= slot < len(dials) else _DEFAULTS


def _load_slot(palette, slot, free_vram_first):
    roster = palette.get("roster", [])
    if not 0 <= slot < len(roster):
        raise ValueError(f"press: slot {slot} out of range (roster holds {len(roster)} checkpoint(s))")
    entry = roster[slot]
    if entry.get("on", True):
        ckpt = entry["ckpt"]
        loras = [l for l in entry.get("loras", []) if l.get("on", True)]
        overrides = entry
        if free_vram_first:
            # ※ a 10gb card can't hold two checkpoints at once, so evict before the next lands.
            # unloads ALL models - grows a keep-loaded option if a pass ever needs something warm.
            model_management.unload_all_models()
        print(f"[atelier] press load -> slot {slot}: {ckpt}" + (" (vram freed first)" if free_vram_first else ""))
        model, clip, vae = load_checkpoint(ckpt)
    else:
        # off slot: don't evict, don't reload, inherit the resident checkpoint. forced loras
        # REPLACE the inherited stack (they don't stack on top) - none forced means inherit it whole.
        # vae/clip-skip ride along too: an off slot wears the source's overrides, not its own.
        src = _inherit_source(roster, slot)
        overrides = roster[src]
        ckpt = overrides["ckpt"]
        forced = [l for l in entry.get("loras", []) if l.get("force")]
        loras = forced or [l for l in overrides.get("loras", []) if l.get("on", True)]
        kind = f"{len(forced)} forced (override)" if forced else f"{len(loras)} inherited"
        print(f"[atelier] press load -> slot {slot} off, inherits slot {src}: {ckpt} ({kind})")
        model, clip, vae = load_checkpoint(ckpt, reuse=True)
    model, clip = apply_loras(model, clip, loras)
    clip, vae = apply_overrides(clip, vae, overrides)
    return model, clip, vae


def _inherit_source(roster, slot):
    for i in range(slot - 1, -1, -1):
        if roster[i].get("on", True):
            return i
    return 0


def _resolve(v):
    if v is None or v < 0:
        return random.randint(0, 0xffffffffffffffff)
    return v


def _make_noise(latent_image, seed, batch_inds, variation_seed, variation_strength, variation_method):
    noise = comfy.sample.prepare_noise(latent_image, seed, batch_inds)
    if variation_strength <= 0:
        return noise
    gen = torch.manual_seed(variation_seed)
    one = [1, latent_image.shape[1], latent_image.shape[2], latent_image.shape[3]]
    var = torch.randn(one, dtype=latent_image.dtype, layout=latent_image.layout, generator=gen, device="cpu")
    var = var.expand(noise.size()[0], -1, -1, -1).to(noise.device)
    if variation_method == "slerp":
        return _slerp(variation_strength, noise, var)
    mixed = (1 - variation_strength) * noise + variation_strength * var
    # ※ blending two gaussians shrinks the variance; rescale so the sampler still sees unit noise
    return mixed / math.sqrt((1 - variation_strength) ** 2 + variation_strength ** 2)


def _slerp(val, low, high):
    dims = low.shape
    low, high = low.reshape(dims[0], -1), high.reshape(dims[0], -1)
    low_n = low / torch.norm(low, dim=1, keepdim=True)
    high_n = high / torch.norm(high, dim=1, keepdim=True)
    low_n[low_n != low_n] = 0.0
    high_n[high_n != high_n] = 0.0
    omega = torch.acos((low_n * high_n).sum(1))
    so = torch.sin(omega)
    res = (torch.sin((1.0 - val) * omega) / so).unsqueeze(1) * low + (torch.sin(val * omega) / so).unsqueeze(1) * high
    return res.reshape(dims)
