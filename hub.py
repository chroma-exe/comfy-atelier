import json

import folder_paths

from .loader import load_checkpoint, apply_loras


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
        state = _parse_state(checkpoints)
        model, clip, vae = load_checkpoint(ckpt_name)
        model, clip = apply_loras(model, clip, state["main_loras"])
        roster = [{"ckpt": ckpt_name, "loras": state["main_loras"]}] + state["slots"]
        print(f"[atelier] hub roster: {[e['ckpt'] for e in roster]}")
        return (model, clip, vae, roster)


def _parse_state(raw):
    raw = (raw or "").strip()
    if not raw:
        return {"main_loras": [], "slots": []}
    # this one field is the source of truth - behavior never gets inferred from widget
    # presence. that's the anti-ghost contract.
    data = json.loads(raw)
    # phase 2 shipped a bare array of slots; tolerate it so old test workflows still load
    if isinstance(data, list):
        data = {"main_loras": [], "slots": data}
    slots = []
    for item in data.get("slots", []):
        ckpt = item.get("ckpt")
        if ckpt:
            slots.append({"ckpt": ckpt, "loras": _clean_loras(item.get("loras"))})
    return {"main_loras": _clean_loras(data.get("main_loras")), "slots": slots}


def _clean_loras(raw):
    out = []
    for l in raw or []:
        name = l.get("lora")
        if name:
            out.append({"on": bool(l.get("on", True)), "lora": name, "strength": float(l.get("strength", 1.0))})
    return out
