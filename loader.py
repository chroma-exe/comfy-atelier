import folder_paths
import comfy.sd


def load_checkpoint(ckpt_name):
    ckpt_path = folder_paths.get_full_path_or_raise("checkpoints", ckpt_name)
    return comfy.sd.load_checkpoint_guess_config(
        ckpt_path,
        output_vae=True,
        output_clip=True,
        embedding_directory=folder_paths.get_folder_paths("embeddings"),
    )[:3]
