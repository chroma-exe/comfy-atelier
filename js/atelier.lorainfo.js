const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@300;400;500;600&display=swap";

const CSS = `
.atelier-li{
  --glass:rgba(28,26,40,.55); --stroke:rgba(255,255,255,.09); --txt:#ece9f5;
  --dim:#9a93b4; --accent:#ff6b5c; --accent-2:#ffd36b;
  position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:0 20px;
  background:rgba(8,6,12,.62);font-family:"Hanken Grotesk",sans-serif;color:var(--txt);overflow:hidden;
  animation:atelier-li-fade .2s ease both}
@keyframes atelier-li-fade{from{opacity:0}to{opacity:1}}
.atelier-li::before{content:"";position:fixed;inset:-20%;z-index:0;filter:blur(90px);opacity:.55;pointer-events:none;
  background:
    radial-gradient(38% 40% at 22% 28%,#ff6b5c 0%,transparent 60%),
    radial-gradient(40% 44% at 82% 22%,#7c6bff 0%,transparent 60%),
    radial-gradient(50% 50% at 60% 92%,#ffd36b 0%,transparent 55%);
  animation:atelier-li-drift 18s ease-in-out infinite alternate}
@keyframes atelier-li-drift{to{transform:translate3d(0,-20px,0) scale(1.08)}}

.atelier-li *{box-sizing:border-box;margin:0;padding:0}
.atelier-li .card{position:relative;z-index:1;width:min(720px,100%);height:92vh;display:flex;flex-direction:column;
  background:var(--glass);backdrop-filter:blur(28px) saturate(1.3);-webkit-backdrop-filter:blur(28px) saturate(1.3);
  border:1px solid var(--stroke);border-radius:26px;
  box-shadow:0 50px 100px -30px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.03) inset,0 1px 0 rgba(255,255,255,.12) inset;
  overflow:hidden;animation:atelier-li-pop .6s cubic-bezier(.2,.9,.25,1) both}
@keyframes atelier-li-pop{from{opacity:0;transform:translateY(20px) scale(.98)}to{opacity:1;transform:none}}

.atelier-li .head{display:flex;gap:18px;align-items:center;padding:30px 32px 22px;flex:0 0 auto;position:relative}
.atelier-li .close{position:absolute;top:18px;right:18px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;
  cursor:pointer;border:1px solid var(--stroke);background:rgba(255,255,255,.06);color:var(--txt);font-size:15px;transition:.2s;z-index:3}
.atelier-li .close:hover{background:rgba(255,255,255,.15);transform:rotate(90deg);border-color:rgba(255,255,255,.3)}
.atelier-li .av{flex:0 0 auto;width:72px;height:72px;border-radius:20px;overflow:hidden;position:relative;
  box-shadow:0 10px 30px -8px rgba(0,0,0,.6),0 0 0 1px var(--stroke)}
.atelier-li .av .ph{width:100%;height:100%;object-fit:cover;display:block;
  background:conic-gradient(from 210deg,#ff6b5c,#ffd36b,#7c6bff,#ff6b5c)}
.atelier-li .titles{flex:1;min-width:0}
.atelier-li .kicker{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:7px}
.atelier-li h1{font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:33px;line-height:1.02;letter-spacing:-.02em;word-break:break-word}
.atelier-li .pills{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap}
.atelier-li .pill{font-size:12px;font-weight:500;color:var(--txt);background:rgba(255,255,255,.07);
  border:1px solid var(--stroke);padding:5px 11px;border-radius:999px}

.atelier-li .body{padding:6px 32px 8px;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.atelier-li .scroll{overflow-y:auto;padding-right:6px}
.atelier-li .chip-scroll{flex:1 1 0;min-height:0}
.atelier-li .grid-scroll{flex:1 1 0;min-height:0}
.atelier-li .scroll::-webkit-scrollbar{width:10px}
.atelier-li .scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:99px;border:3px solid transparent;background-clip:padding-box}
.atelier-li .scroll::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.26);background-clip:padding-box}
.atelier-li .label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin:14px 0 12px;font-weight:600}
.atelier-li .lbl-row{display:flex;align-items:center;gap:10px}

.atelier-li .chips{display:flex;flex-wrap:wrap;gap:8px}
.atelier-li .chip{display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-size:13px;font-weight:500;color:var(--txt);cursor:pointer;
  background:rgba(30,27,44,.88);border:1px solid var(--stroke);padding:7px 9px 7px 13px;border-radius:999px;transition:.18s}
.atelier-li .chip:hover{background:rgba(52,48,70,.95);transform:translateY(-1px);border-color:rgba(255,255,255,.25)}
.atelier-li .chip .n{font-size:11px;font-weight:600;color:var(--dim);background:rgba(0,0,0,.32);border-radius:999px;padding:2px 7px;transition:.18s}
.atelier-li .chip .civ{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--accent-2);box-shadow:0 0 6px rgba(255,211,107,.6)}
.atelier-li .chip.on{background:linear-gradient(120deg,var(--accent),#ff8f5c);border-color:transparent;color:#1a1008}
.atelier-li .chip.on::before{content:"✓";font-weight:700}
.atelier-li .chip.on .n{color:#3a1810;background:rgba(255,255,255,.4)}
.atelier-li .status{font-size:12px;color:var(--dim);margin-left:auto;transition:.18s}
.atelier-li .status.live{color:var(--accent-2)}
.atelier-li .empty{color:var(--dim);font-size:13px;padding:4px 0 8px}

.atelier-li .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--tile,140px),1fr));gap:13px;margin-top:4px;padding-bottom:6px}
.atelier-li .tile{position:relative;aspect-ratio:3/4;border-radius:16px;overflow:hidden;cursor:zoom-in;
  box-shadow:0 12px 30px -14px rgba(0,0,0,.7),0 0 0 1px var(--stroke);transition:.3s cubic-bezier(.2,.9,.25,1)}
.atelier-li .tile .ph{width:100%;height:100%;object-fit:cover;display:block;transition:.45s;
  background:linear-gradient(150deg,#ff8f6b,#c2567a 50%,#3a2c5e)}
.atelier-li .tile::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 55%,rgba(11,10,16,.55));opacity:0;transition:.3s}
.atelier-li .tile:hover{transform:translateY(-5px) scale(1.015);box-shadow:0 26px 50px -16px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.2)}
.atelier-li .tile:hover .ph{transform:scale(1.08)}
.atelier-li .tile:hover::after{opacity:1}
.atelier-li .tile .zoom{position:absolute;right:9px;bottom:9px;z-index:2;font-size:11px;color:#fff;opacity:0;transform:translateY(4px);
  transition:.3s;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:3px 9px;backdrop-filter:blur(4px)}
.atelier-li .tile:hover .zoom{opacity:1;transform:none}

.atelier-li .tip{position:fixed;z-index:10001;width:320px;max-height:62vh;overflow-y:auto;pointer-events:none;
  background:rgba(20,18,30,.94);backdrop-filter:blur(28px) saturate(1.3);-webkit-backdrop-filter:blur(28px) saturate(1.3);
  border:1px solid var(--stroke);border-radius:16px;padding:13px 15px;
  box-shadow:0 30px 60px -20px rgba(0,0,0,.8);opacity:0;transform:translateY(4px);transition:.15s}
.atelier-li .tip.show{opacity:1;transform:none}
.atelier-li .tip-lbl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:600;margin:9px 0 4px}
.atelier-li .tip-lbl:first-child{margin-top:0}
.atelier-li .tip-text{font-size:12px;line-height:1.5;color:var(--txt);word-break:break-word;white-space:pre-wrap}
.atelier-li .tip-text.dim{color:var(--dim)}
.atelier-li .tip-params{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.atelier-li .tip-param{font-size:11px;color:var(--accent-2);background:rgba(255,211,107,.1);border:1px solid rgba(255,211,107,.22);border-radius:999px;padding:3px 9px;white-space:nowrap}

.atelier-li.lb-overlay{z-index:10002}
.atelier-li .lb{position:relative;z-index:1;display:flex;width:min(1040px,94vw);max-height:92vh;
  background:var(--glass);backdrop-filter:blur(28px) saturate(1.3);-webkit-backdrop-filter:blur(28px) saturate(1.3);
  border:1px solid var(--stroke);border-radius:24px;overflow:hidden;
  box-shadow:0 50px 100px -30px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.03) inset,0 1px 0 rgba(255,255,255,.12) inset;
  animation:atelier-li-pop .5s cubic-bezier(.2,.9,.25,1) both}
.atelier-li .lb-img{flex:0 0 auto;width:min(52%,540px);background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}
.atelier-li .lb-img img{max-width:100%;max-height:92vh;object-fit:contain;display:block}
.atelier-li .lb-panel{flex:1 1 auto;min-width:0;padding:30px 26px 26px}
.atelier-li .lb-prompt{margin-bottom:15px}
.atelier-li .lb-prompthead{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.atelier-li .copybtn{margin-left:auto;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;color:var(--txt);
  background:rgba(255,255,255,.08);border:1px solid var(--stroke);border-radius:999px;padding:4px 12px;transition:.15s}
.atelier-li .copybtn:hover{background:rgba(255,255,255,.18)}
.atelier-li .lb-text{font-size:12.5px;line-height:1.55;color:var(--txt);word-break:break-word;white-space:pre-wrap;
  background:rgba(0,0,0,.22);border:1px solid var(--stroke);border-radius:12px;padding:11px 13px;max-height:230px;overflow-y:auto}
.atelier-li .lb-text.dim{color:var(--dim)}
.atelier-li .lb-params{display:grid;grid-template-columns:auto 1fr;gap:7px 16px;margin-top:6px}
.atelier-li .lb-k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);font-weight:600;white-space:nowrap}
.atelier-li .lb-v{font-size:12.5px;color:var(--txt);word-break:break-word}
.atelier-li .lb-orig{display:inline-block;margin-top:18px;font-size:12px;color:var(--accent-2);cursor:pointer;background:none;border:0;font-family:inherit;padding:0}
.atelier-li .lb-orig:hover{text-decoration:underline}

.atelier-li .foot{display:flex;align-items:center;gap:12px;padding:22px 32px 28px;flex:0 0 auto;border-top:1px solid var(--stroke);flex-wrap:wrap}
.atelier-li .btn{font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;padding:11px 18px;border-radius:999px;
  border:1px solid var(--stroke);background:rgba(255,255,255,.06);color:var(--txt);transition:.18s}
.atelier-li .btn:hover{background:rgba(255,255,255,.13)}
.atelier-li .btn.grow{margin-right:auto}
.atelier-li .btn.primary{border:0;color:#1a1008;background:linear-gradient(120deg,var(--accent),#ff8f5c);box-shadow:0 8px 24px -8px var(--accent)}
.atelier-li .btn.primary:hover{filter:brightness(1.08)}

.atelier-li .loading{flex:1;display:flex;flex-direction:column;gap:16px;align-items:center;justify-content:center;padding:90px 0;color:var(--dim)}
.atelier-li .spinner{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.12);border-top-color:var(--accent);animation:atelier-li-spin .8s linear infinite}
@keyframes atelier-li-spin{to{transform:rotate(360deg)}}
.atelier-li .loadingtxt{font-size:13px;letter-spacing:.04em}
.atelier-li .loadingname{font-size:13px;color:var(--txt);font-weight:600;word-break:break-all;max-width:80%;text-align:center}
`;

function ensureAssets() {
    if (document.getElementById("atelier-li-style")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS;
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.id = "atelier-li-style";
    style.textContent = CSS;
    document.head.appendChild(style);
}

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

function copy(text) {
    // comfy runs on a LAN ip over http, not a secure context, so navigator.clipboard is blocked
    // there. the textarea + execCommand path is the one that actually works.
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    try {
        document.execCommand("copy");
    } catch {}
    t.remove();
}

function fmtCount(n) {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
}

function closeBtn(close) {
    const b = el("button", "close", "✕");
    b.title = "close (esc)";
    b.addEventListener("click", close);
    return b;
}

function sizedUrl(url, size) {
    // civitai cdn urls carry the size in the path (/width=450/); swap it for a bigger render
    // without yanking the multi-MB original. local sidecar urls have no such segment - leave them.
    return url && /\/width=\d+\//.test(url) ? url.replace(/\/width=\d+\//, `/${size}/`) : url;
}

function promptBlock(label, text, dim) {
    const wrap = el("div", "lb-prompt");
    const head = el("div", "lb-prompthead");
    const btn = el("button", "copybtn", "copy");
    btn.addEventListener("click", () => {
        copy(text);
        btn.textContent = "copied ✓";
        setTimeout(() => (btn.textContent = "copy"), 1200);
    });
    head.append(el("span", "label", label), btn);
    wrap.append(head, el("div", dim ? "lb-text dim" : "lb-text", text));
    return wrap;
}

function openLightbox(im) {
    const lb = el("div", "atelier-li lb-overlay");
    const card = el("article", "lb");
    lb.appendChild(card);

    function closeLb() {
        lb.remove();
        document.removeEventListener("keydown", onKey, true);
    }
    // capture + stopPropagation so Esc closes the lightbox without also closing the lora dialog under it
    const onKey = (e) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            closeLb();
        }
    };
    document.addEventListener("keydown", onKey, true);
    lb.addEventListener("mousedown", (e) => {
        if (e.target === lb) closeLb();
    });

    card.appendChild(closeBtn(closeLb));
    const imgWrap = el("div", "lb-img");
    const img = el("img");
    img.src = sizedUrl(im.url, "width=1024");
    img.referrerPolicy = "no-referrer";
    imgWrap.appendChild(img);

    const panel = el("div", "lb-panel scroll");
    const meta = im.meta || {};
    if (meta.prompt) panel.appendChild(promptBlock("prompt", meta.prompt));
    if (meta.negativePrompt) panel.appendChild(promptBlock("negative", meta.negativePrompt, true));

    const grid = el("div", "lb-params");
    const row = (k, v) => v != null && v !== "" && grid.append(el("div", "lb-k", k), el("div", "lb-v", String(v)));
    row("model", meta.Model);
    row("sampler", meta.sampler);
    row("scheduler", meta.scheduler);
    row("steps", meta.steps);
    row("cfg", meta.cfgScale);
    row("seed", meta.seed);
    row("clip skip", meta.clipSkip);
    row("denoise", meta.denoise);
    row("size", meta.size);
    if (grid.children.length) panel.append(el("div", "label", "parameters"), grid);
    if (!meta.prompt && !grid.children.length) panel.appendChild(el("div", "empty", "no generation data for this image"));

    const orig = el("button", "lb-orig", "open full image ↗");
    orig.addEventListener("click", () => window.open(sizedUrl(im.url, "original=true"), "_blank", "noopener"));
    panel.appendChild(orig);

    card.append(imgWrap, panel);
    document.body.appendChild(lb);
}

function loadingView(name) {
    const wrap = el("div", "loading");
    wrap.append(el("div", "spinner"), el("div", "loadingtxt", "summoning lora info…"), el("div", "loadingname", name));
    return wrap;
}

function header(info) {
    const head = el("div", "head");
    const av = el("div", "av");
    const first = info.images?.[0]?.url;
    if (first) {
        const img = el("img", "ph");
        img.src = first;
        img.referrerPolicy = "no-referrer";
        av.appendChild(img);
    } else {
        av.appendChild(el("div", "ph"));
    }
    const titles = el("div", "titles");
    titles.append(el("div", "kicker", info.type || "lora"), el("h1", null, info.name || "unknown lora"));
    const pills = el("div", "pills");
    if (info.baseModel) pills.appendChild(el("span", "pill", info.baseModel));
    if (!info.civitai) {
        const p = el("span", "pill", "header only · no civitai");
        p.style.opacity = ".7";
        pills.appendChild(p);
    }
    if (pills.children.length) titles.appendChild(pills);
    head.append(av, titles);
    return head;
}

function renderInfo(card, info, close, reload) {
    const words = info.trainedWords || [];
    const imgs = info.images || [];
    const selected = new Set();

    card.replaceChildren(closeBtn(close), header(info));

    const overlay = card.parentNode;
    overlay.querySelector(".tip")?.remove();
    const tipEl = el("div", "tip");
    overlay.appendChild(tipEl);
    function showTip(anchor, meta) {
        tipEl.replaceChildren();
        if (meta.prompt) tipEl.append(el("div", "tip-lbl", "prompt"), el("div", "tip-text", meta.prompt));
        if (meta.negativePrompt) tipEl.append(el("div", "tip-lbl", "negative"), el("div", "tip-text dim", meta.negativePrompt));
        const params = el("div", "tip-params");
        const add = (k, v) => v != null && v !== "" && params.appendChild(el("span", "tip-param", `${k} ${v}`));
        add("sampler", meta.sampler);
        add("steps", meta.steps);
        add("cfg", meta.cfgScale);
        add("seed", meta.seed);
        add("size", meta.size);
        add("clip skip", meta.clipSkip);
        if (params.children.length) tipEl.appendChild(params);
        const r = anchor.getBoundingClientRect();
        let left = r.right + 12;
        if (left + 320 > window.innerWidth) left = r.left - 320 - 12;
        tipEl.style.left = Math.max(8, left) + "px";
        tipEl.style.top = r.top + "px";
        tipEl.classList.add("show");
        requestAnimationFrame(() => {
            const over = r.top + tipEl.offsetHeight - (window.innerHeight - 8);
            if (over > 0) tipEl.style.top = Math.max(8, r.top - over) + "px";
        });
    }
    const hideTip = () => tipEl.classList.remove("show");

    const body = el("div", "body");

    const tlbl = el("div", "label lbl-row");
    tlbl.appendChild(document.createTextNode("trigger words - tap to select"));
    const status = el("span", "status", "none selected");
    tlbl.appendChild(status);
    body.appendChild(tlbl);

    let allBtn; // footer's select-all, referenced by syncSel below
    function syncSel() {
        if (selected.size) {
            copy([...selected].join(", "));
            status.textContent = `${selected.size} selected · copied ✓`;
            status.classList.add("live");
        } else {
            status.textContent = "none selected";
            status.classList.remove("live");
        }
        allBtn.textContent = words.length && selected.size === words.length ? "clear all" : "select all";
    }

    if (words.length) {
        const chips = el("div", "chips");
        for (const w of words) {
            const chip = el("button", "chip");
            chip.appendChild(document.createTextNode(w.word));
            if (typeof w.count === "number") chip.appendChild(el("span", "n", fmtCount(w.count)));
            if (w.source === "civitai") {
                const dot = el("span", "civ");
                dot.title = "from civitai";
                chip.appendChild(dot);
            }
            chip.addEventListener("click", () => {
                chip.classList.toggle("on");
                chip.classList.contains("on") ? selected.add(w.word) : selected.delete(w.word);
                syncSel();
            });
            chips.appendChild(chip);
        }
        const scroll = el("div", "chip-scroll scroll");
        scroll.appendChild(chips);
        body.appendChild(scroll);
    } else {
        body.appendChild(el("div", "empty", "no trigger words in the file or on civitai"));
    }

    body.appendChild(el("div", "label", "previews"));
    if (imgs.length) {
        const grid = el("div", "grid");
        const tile = imgs.length <= 2 ? 260 : imgs.length <= 4 ? 190 : imgs.length <= 9 ? 150 : 116;
        grid.style.setProperty("--tile", tile + "px");
        for (const im of imgs) {
            const fig = el("figure", "tile");
            const img = el("img", "ph");
            img.src = im.url;
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            fig.append(img, el("span", "zoom", "⤢ view"));
            fig.addEventListener("click", () => openLightbox(im));
            if (im.meta) {
                fig.addEventListener("mouseenter", () => showTip(fig, im.meta));
                fig.addEventListener("mouseleave", hideTip);
            }
            grid.appendChild(fig);
        }
        const scroll = el("div", "grid-scroll scroll");
        scroll.appendChild(grid);
        body.appendChild(scroll);
    } else {
        body.appendChild(el("div", "empty", "no preview images"));
    }
    card.appendChild(body);

    const foot = el("div", "foot");
    allBtn = el("button", "btn grow", "select all");
    allBtn.addEventListener("click", () => {
        const allOn = words.length && selected.size === words.length;
        selected.clear();
        card.querySelectorAll(".chip").forEach((c, i) => {
            c.classList.toggle("on", !allOn);
            if (!allOn) selected.add(words[i].word);
        });
        syncSel();
    });
    foot.appendChild(allBtn);
    const refresh = el("button", "btn", "↻ refresh");
    refresh.addEventListener("click", () => reload(true));
    foot.appendChild(refresh);
    if (info.civitaiUrl) {
        const cv = el("button", "btn primary", "open on civitai ↗");
        cv.addEventListener("click", () => window.open(info.civitaiUrl, "_blank", "noopener"));
        foot.appendChild(cv);
    }
    card.appendChild(foot);
}

function renderError(card, loraName, close) {
    card.replaceChildren(closeBtn(close));
    const w = el("div", "loading");
    w.append(el("div", "loadingtxt", "couldn't load info for"), el("div", "loadingname", loraName));
    card.appendChild(w);
}

export function openLoraInfo(loraName) {
    if (!loraName) return;
    ensureAssets();
    const overlay = el("div", "atelier-li");
    const card = el("article", "card");
    overlay.appendChild(card);

    const onKey = (e) => {
        if (e.key === "Escape") close();
    };
    function close() {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
    }
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) close();
    });

    const load = (refresh) => {
        card.replaceChildren(closeBtn(close), loadingView(loraName));
        fetch(`/atelier/lora-info?lora=${encodeURIComponent(loraName)}${refresh ? "&refresh=1" : ""}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r)))
            .then((info) => renderInfo(card, info, close, load))
            .catch(() => renderError(card, loraName, close));
    };

    document.body.appendChild(overlay);
    load(false);
}
