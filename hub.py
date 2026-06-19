import json

import folder_paths

from .loader import load_checkpoint


class AtelierHub:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ckpt_name": (folder_paths.get_filename_list("checkpoints"),),
                "checkpoints": ("STRING", {"default": "", "multiline": False}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "ROSTER")
    RETURN_NAMES = ("model", "clip", "vae", "roster")
    FUNCTION = "load"
    CATEGORY = "atelier"

    def load(self, ckpt_name, checkpoints="", unique_id=None):
        model, clip, vae = load_checkpoint(ckpt_name)
        roster = [{"ckpt": ckpt_name, "loras": []}] + _parse_slots(checkpoints)
        print(f"[atelier] hub roster: {[e['ckpt'] for e in roster]}")
        return (model, clip, vae, roster)


def _parse_slots(raw):
    raw = (raw or "").strip()
    if not raw:
        return []
    # this one field is the source of truth - behavior never gets inferred from widget
    # presence. that's the anti-ghost contract.
    slots = []
    for item in json.loads(raw):
        ckpt = item.get("ckpt")
        if ckpt:
            slots.append({"ckpt": ckpt, "loras": item.get("loras", [])})
    return slots
