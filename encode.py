import re

import torch


def encode_prompt(clip, text):
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
