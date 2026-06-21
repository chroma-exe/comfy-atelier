import folder_paths
import comfy.sd
from nodes import LoraLoader


# ※ single-entry reuse cache. an inheriting (off) pass reuses the resident checkpoint instead
# of re-reading it from disk - that's the entire point of toggling a checkpoint off. one slot
# deep on purpose; grows to a real lru only if a workflow ever juggles more than two live at once.
_resident = {"name": None, "out": None}


def load_checkpoint(ckpt_name, reuse=False):
    if reuse and _resident["name"] == ckpt_name and _resident["out"] is not None:
        return _resident["out"]
    ckpt_path = folder_paths.get_full_path_or_raise("checkpoints", ckpt_name)
    out = comfy.sd.load_checkpoint_guess_config(
        ckpt_path,
        output_vae=True,
        output_clip=True,
        embedding_directory=folder_paths.get_folder_paths("embeddings"),
    )[:3]
    _resident["name"] = ckpt_name
    _resident["out"] = out
    return out


def apply_loras(model, clip, loras):
    # the caller already decided what belongs here - an on-pass hands its enabled loras, an
    # off-pass hands only the forced ones. this just stacks whatever it's given, in order.
    loader = LoraLoader()
    for entry in loras or []:
        name = entry.get("lora")
        strength = entry.get("strength", 1.0)
        if not name or not strength:
            continue
        model, clip = loader.load_lora(model, clip, name, strength, strength)
    return model, clip
