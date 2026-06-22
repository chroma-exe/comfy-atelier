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


def compose_prompts(main_pos, main_neg, swatches):
    if not swatches:
        return main_pos, main_neg
    pos = _compose_side(swatches["pos"]["prepend"], main_pos, swatches["pos"]["append"])
    neg = _compose_side(swatches["neg"]["prepend"], main_neg, swatches["neg"]["append"])
    return pos, neg


def _compose_side(prepends, main, appends):
    # prepends -> main -> appends. a prepend owns the gap after itself, an append owns the gap before
    # itself, main owns nothing (it's always flanked). comma toggle picks ", " vs a bare " "
    seq = []
    for p in prepends:
        t = (p.get("text") or "").strip()
        if t: seq.append(("pre", t, bool(p.get("comma"))))
    m = (main or "").strip()
    if m: seq.append(("main", m, False))
    for a in appends:
        t = (a.get("text") or "").strip()
        if t: seq.append(("app", t, bool(a.get("comma"))))
    if not seq:
        return ""
    out = seq[0][1]
    for i in range(1, len(seq)):
        lkind, _, lcomma = seq[i - 1]
        rkind, rtext, rcomma = seq[i]
        comma = lcomma if lkind == "pre" else (rcomma if rkind == "app" else False)
        out += (", " if comma else " ") + rtext
    return out
