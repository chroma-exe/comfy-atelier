import json
import re

import torch
import folder_paths
import comfy.model_management
from nodes import MAX_RESOLUTION

from .loader import load_checkpoint, apply_loras, apply_overrides


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

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "ROSTER", "LATENT", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("model", "clip", "vae", "roster", "latent", "positive", "negative")
    FUNCTION = "load"
    CATEGORY = "atelier"

    def load(self, ckpt_name, checkpoints="", unique_id=None):
        state = _parse_state(checkpoints)
        main = {"ckpt": ckpt_name, "on": True, "loras": state["main_loras"],
                "vae": state["main_vae"], "clip_skip": state["main_clip_skip"]}
        model, clip, vae = load_checkpoint(ckpt_name)
        model, clip = apply_loras(model, clip, [l for l in main["loras"] if l["on"]])
        clip, vae = apply_overrides(clip, vae, main)
        roster = [main] + state["slots"]
        glb = state["globals"]
        lat = next((g for g in glb if g["kind"] == "latent"), None)
        pr = next((g for g in glb if g["kind"] == "prompt"), None)
        pos = _encode(clip, pr["positive"] if pr else "")
        neg = _encode(clip, pr["negative"] if pr else "")
        print(f"[atelier] hub roster: {[e['ckpt'] for e in roster]}")
        return (model, clip, vae, roster, _make_latent(lat), pos, neg)


def _parse_state(raw):
    raw = (raw or "").strip()
    if not raw:
        return {"main_loras": [], "main_vae": None, "main_clip_skip": None, "slots": [], "globals": []}
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
            slots.append({
                "ckpt": ckpt,
                "on": bool(item.get("on", True)),
                "loras": _clean_loras(item.get("loras")),
                "vae": item.get("vae") or None,
                "clip_skip": _clean_skip(item.get("clip_skip")),
            })
    return {
        "main_loras": _clean_loras(data.get("main_loras")),
        "main_vae": data.get("main_vae") or None,
        "main_clip_skip": _clean_skip(data.get("main_clip_skip")),
        "slots": slots,
        "globals": _clean_globals(data),
    }


def _encode(clip, text):
    chunks = [c for c in (s.strip() for s in re.split(r"\s*\bBREAK\b\s*", text or "")) if c]
    if not chunks:
        return clip.encode_from_tokens_scheduled(clip.tokenize(""))
    out = clip.encode_from_tokens_scheduled(clip.tokenize(chunks[0]))
    for c in chunks[1:]:
        out = _concat(out, clip.encode_from_tokens_scheduled(clip.tokenize(c)))
    return out


def _concat(cond_to, cond_from):
    # BREAK glues the next chunk onto every existing cond along the token axis - this is comfy's own
    # ConditioningConcat, inlined so a BREAK in the prompt doesn't need a node wired downstream
    src = cond_from[0][0]
    return [[torch.cat((t[0], src), 1), t[1].copy()] for t in cond_to]


def _clean_globals(data):
    raw = data.get("globals")
    if raw is None:
        # legacy shape carried latent as a permanent footer + a prompt with its own on-flag; fold
        # them into the ordered list so old test workflows don't lose their canvas or prompt
        if "latent" not in data and "prompt" not in data:
            return []
        out = [{"kind": "latent", **_clean_latent(data.get("latent"))}]
        p = data.get("prompt") or {}
        if p.get("on"):
            out.append({"kind": "prompt", "positive": str(p.get("positive") or ""), "negative": str(p.get("negative") or "")})
        return out
    out = []
    for g in raw:
        if g.get("kind") == "latent":
            out.append({"kind": "latent", **_clean_latent(g)})
        elif g.get("kind") == "prompt":
            out.append({"kind": "prompt", "positive": str(g.get("positive") or ""), "negative": str(g.get("negative") or "")})
    return out


def _clean_latent(raw):
    raw = raw or {}
    return {"width": _dim(raw.get("width")), "height": _dim(raw.get("height")), "batch": _batch(raw.get("batch"))}


def _dim(v):
    try:
        v = int(v)
    except (TypeError, ValueError):
        return 1024
    v = max(16, min(MAX_RESOLUTION, v))
    return v - (v % 8)


def _batch(v):
    try:
        return max(1, int(v))
    except (TypeError, ValueError):
        return 1


def _make_latent(cfg):
    cfg = cfg or _clean_latent(None)
    # 4-channel latent - right for sd1.5/sdxl. flux & sd3 want 16; revisit if this node ever loads one
    t = torch.zeros([cfg["batch"], 4, cfg["height"] // 8, cfg["width"] // 8], device=comfy.model_management.intermediate_device())
    return {"samples": t}


def _clean_skip(raw):
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _clean_loras(raw):
    out = []
    for l in raw or []:
        name = l.get("lora")
        if name:
            out.append({
                "on": bool(l.get("on", True)),
                "force": bool(l.get("force", False)),
                "lora": name,
                "strength": float(l.get("strength", 1.0)),
            })
    return out
