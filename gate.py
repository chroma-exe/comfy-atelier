import comfy.model_management as model_management

from .loader import load_checkpoint, apply_loras


class AtelierPassGate:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "roster": ("ROSTER",),
                "slot": ("INT", {"default": 1, "min": 0, "max": 63}),
                "free_vram_first": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                # wire the previous pass's latent/image in here. nothing reads the value - the
                # data edge IS the point: it's the only thing that makes comfy run this gate
                # after that pass instead of whenever it pleases. see decisions.md
                "run_after": ("*", {}),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    RETURN_NAMES = ("model", "clip", "vae")
    FUNCTION = "load_slot"
    CATEGORY = "atelier"

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    def load_slot(self, roster, slot, free_vram_first=True, run_after=None):
        if not 0 <= slot < len(roster):
            raise ValueError(f"pass gate: slot {slot} out of range (roster holds {len(roster)} checkpoint(s))")
        entry = roster[slot]
        if entry.get("on", True):
            ckpt = entry["ckpt"]
            loras = [l for l in entry.get("loras", []) if l.get("on", True)]
            if free_vram_first:
                # ※ a 10gb card can't hold two checkpoints at once, so evict before the next lands.
                # unloads ALL models - grows a keep-loaded option if a pass ever needs something warm.
                model_management.unload_all_models()
            print(f"[atelier] pass gate -> slot {slot}: {ckpt}" + (" (vram freed first)" if free_vram_first else ""))
            model, clip, vae = load_checkpoint(ckpt)
        else:
            # off slot: don't evict, don't reload, inherit the resident checkpoint. forced loras
            # REPLACE the inherited stack (they don't stack on top) - none forced means inherit it whole.
            src = _inherit_source(roster, slot)
            ckpt = roster[src]["ckpt"]
            forced = [l for l in entry.get("loras", []) if l.get("force")]
            loras = forced or [l for l in roster[src].get("loras", []) if l.get("on", True)]
            kind = f"{len(forced)} forced (override)" if forced else f"{len(loras)} inherited"
            print(f"[atelier] pass gate -> slot {slot} off, inherits slot {src}: {ckpt} ({kind})")
            model, clip, vae = load_checkpoint(ckpt, reuse=True)
        model, clip = apply_loras(model, clip, loras)
        return (model, clip, vae)


def _inherit_source(roster, slot):
    for i in range(slot - 1, -1, -1):
        if roster[i].get("on", True):
            return i
    return 0
