import folder_paths
import comfy.sd
from nodes import LoraLoader


def load_checkpoint(ckpt_name):
    ckpt_path = folder_paths.get_full_path_or_raise("checkpoints", ckpt_name)
    return comfy.sd.load_checkpoint_guess_config(
        ckpt_path,
        output_vae=True,
        output_clip=True,
        embedding_directory=folder_paths.get_folder_paths("embeddings"),
    )[:3]


def apply_loras(model, clip, loras):
    loader = LoraLoader()
    for entry in loras or []:
        if not entry.get("on", True):
            continue
        name = entry.get("lora")
        strength = entry.get("strength", 1.0)
        if not name or not strength:
            continue
        model, clip = loader.load_lora(model, clip, name, strength, strength)
    return model, clip
