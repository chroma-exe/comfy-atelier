import asyncio
import hashlib
import json
import os
import struct

import aiohttp
from aiohttp import web

import comfy.samplers
import folder_paths
from server import PromptServer

CIVITAI_BY_HASH = "https://civitai.com/api/v1/model-versions/by-hash/{}"
_IMG_EXTS = ("png", "jpg", "jpeg", "webp")
_HASH_MEMO = {}


def _lora_path(name):
    return folder_paths.get_full_path("loras", name) if name else None


def _cache_dir():
    # get_user_directory() is the bare user/ root; per-profile data nests under the profile name,
    # and "default" is the single-user profile every other node writes behind. ※ thread the real
    # request user here if multi-user comfy ever matters; the cache is regenerable, so it doesn't yet.
    d = os.path.join(folder_paths.get_user_directory(), "default", "atelier", "lora-info")
    os.makedirs(d, exist_ok=True)
    return d


def _sha256(path):
    sig = (os.path.getmtime(path), os.path.getsize(path))
    memo = _HASH_MEMO.get(path)
    if memo and memo[0] == sig:
        return memo[1]
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(128 * 1024), b""):
            h.update(block)
    digest = h.hexdigest()
    _HASH_MEMO[path] = (sig, digest)
    return digest


def _read_metadata(path):
    # safetensors: 8-byte little-endian u64 header length, then that many bytes of json. the
    # trainer's own notes live in __metadata__ - trigger words AND their counts, sitting right
    # there in the file for free. no network, no civitai.
    try:
        with open(path, "rb") as f:
            n = struct.unpack("<Q", f.read(8))[0]
            header = json.loads(f.read(n))
        meta = header.get("__metadata__")
        return meta if isinstance(meta, dict) else {}
    except (OSError, ValueError, struct.error):
        return {}


def _trained_words(meta):
    raw = meta.get("ss_tag_frequency")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return []
    if not isinstance(raw, dict):
        return []
    counts = {}
    for bucket in raw.values():
        if isinstance(bucket, dict):
            for word, count in bucket.items():
                try:
                    counts[word] = counts.get(word, 0) + int(count)
                except (TypeError, ValueError):
                    continue
    return [{"word": w, "count": c, "source": "metadata"} for w, c in counts.items()]


def _local_image(path, lora):
    stem = os.path.splitext(path)[0]
    for ext in _IMG_EXTS:
        if os.path.exists(f"{stem}.{ext}"):
            return f"/atelier/lora-img?lora={lora}"
    return None


def _from_header(path, lora, sha):
    meta = _read_metadata(path)
    img = _local_image(path, lora)
    return {
        "name": os.path.splitext(os.path.basename(lora))[0],
        "baseModel": meta.get("ss_base_model_version") or meta.get("ss_sd_model_name"),
        "trainedWords": _trained_words(meta),
        "images": [{"url": img, "local": True}] if img else [],
        "civitai": False,
        "sha256": sha,
    }


async def _fetch_civitai(sha):
    try:
        timeout = aiohttp.ClientTimeout(total=8)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(CIVITAI_BY_HASH.format(sha)) as r:
                return await r.json() if r.status == 200 else None
    except (aiohttp.ClientError, asyncio.TimeoutError):
        return None


_META_FIELDS = ("prompt", "negativePrompt", "sampler", "scheduler", "seed", "steps", "cfgScale", "clipSkip", "denoise", "Model")


def _image_meta(meta):
    # civitai stuffs the whole comfy workflow into meta sometimes - keep only the readable gen params
    if not isinstance(meta, dict):
        return None
    out = {k: meta[k] for k in _META_FIELDS if meta.get(k) not in (None, "")}
    w, h = meta.get("width"), meta.get("height")
    if w and h:
        out["size"] = f"{w}x{h}"
    return out or None


def _merge_civitai(info, data):
    info["civitai"] = True
    model = data.get("model") or {}
    name = model.get("name") or info["name"]
    version = data.get("name")
    info["name"] = f"{name} - {version}" if version else name
    info["type"] = model.get("type")
    info["baseModel"] = data.get("baseModel") or info["baseModel"]

    have = {w["word"] for w in info["trainedWords"]}
    for raw in data.get("trainedWords") or []:
        for word in str(raw).split(","):
            word = word.strip()
            if word and word not in have:
                info["trainedWords"].append({"word": word, "source": "civitai"})
                have.add(word)

    for img in data.get("images") or []:
        url = img.get("url")
        if url:
            info["images"].append({"url": url, "width": img.get("width"), "height": img.get("height"), "nsfw": img.get("nsfwLevel"), "meta": _image_meta(img.get("meta"))})

    model_id, ver_id = data.get("modelId"), data.get("id")
    if model_id:
        link = f"https://civitai.com/models/{model_id}"
        info["civitaiUrl"] = f"{link}?modelVersionId={ver_id}" if ver_id else link


def _sort_words(info):
    # counts first (descending), civitai-only words with no count trail behind
    info["trainedWords"].sort(key=lambda w: w.get("count", -1), reverse=True)


async def get_lora_info(lora, refresh=False):
    path = _lora_path(lora)
    if not path or not os.path.exists(path):
        return None
    sha = _sha256(path)
    cache = os.path.join(_cache_dir(), f"{sha}.json")

    if not refresh and os.path.exists(cache):
        try:
            with open(cache, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            pass

    info = _from_header(path, lora, sha)
    data = await _fetch_civitai(sha)
    if data:
        _merge_civitai(info, data)
        _sort_words(info)
        # only persist on a civitai hit. a miss (offline, 404) stays uncached, so the next time
        # someone opens the dialog we just try again - no negative cache, nothing to get stuck.
        try:
            with open(cache, "w", encoding="utf-8") as f:
                json.dump(info, f)
        except OSError:
            pass
    else:
        _sort_words(info)
    return info


@PromptServer.instance.routes.get("/atelier/lora-info")
async def _route_lora_info(request):
    lora = request.query.get("lora")
    if not lora:
        return web.json_response({"error": "no lora specified"}, status=400)
    info = await get_lora_info(lora, refresh=request.query.get("refresh") in ("1", "true"))
    if info is None:
        return web.json_response({"error": f"lora not found: {lora}"}, status=404)
    return web.json_response(info)


@PromptServer.instance.routes.get("/atelier/samplers")
async def _route_samplers(request):
    return web.json_response({
        "samplers": comfy.samplers.KSampler.SAMPLERS,
        "schedulers": comfy.samplers.KSampler.SCHEDULERS,
    })


@PromptServer.instance.routes.get("/atelier/lora-img")
async def _route_lora_img(request):
    path = _lora_path(request.query.get("lora"))
    if path:
        stem = os.path.splitext(path)[0]
        for ext in _IMG_EXTS:
            if os.path.exists(f"{stem}.{ext}"):
                return web.FileResponse(f"{stem}.{ext}")
    return web.json_response({"error": "no image"}, status=404)
