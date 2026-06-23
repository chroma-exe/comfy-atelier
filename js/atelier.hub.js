import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { openLoraInfo } from "./atelier.lorainfo.js";
import {
    C, registerGlass, M, GAP, HEAD_H, ADD_H, DIV_H,
    anim, tap, scaled, grad, fit, inZone,
    drawSwitch, drawGrip, drawIco, cardShell,
    drawHole, drawDropLine, computeDrop, drawDivider, drawAdd,
    resize, hide, bodyMouse,
} from "./atelier.glass.js";

const HUB_CLASS = "AtelierHub";
const CART_CLASS = "AtelierCart";
const STATE = "checkpoints";   // the json blob the backend reads - single source of truth
const MAINCKPT = "ckpt_name";  // hidden stock combo: holds the main checkpoint + the file list

// layout, px, node-local (the shared ones - M/GAP/HEAD_H/ADD_H/DIV_H - come from the canon)
const CK_H = 24, ROW_H = 22, PADB = 8, TOP = 4;
// the latent card body (the two dim boxes + the controls strip)
const LAT_DIM_H = 34, LAT_CTL_H = 28;
// prompt card: two textareas, heights live in state so a dragged size rehydrates
const TA_DEFAULT = 72, TA_GAP = 7, TA_MIN = 36;
// the blessed sdxl dimensions, portrait → square → landscape (mother's list)
const SDXL_DIMS = [[640, 1536], [768, 1344], [832, 1216], [896, 1152], [1024, 1024], [1152, 896], [1216, 832], [1344, 768], [1536, 640]];
const MAXDIM = 8192;
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function ratio(w, h) { const g = gcd(w, h) || 1; return w / g + ":" + h / g; }
function snapDim(v) {
    let n = parseInt(v, 10);
    if (!Number.isFinite(n)) return 1024;
    n = Math.max(16, Math.min(MAXDIM, n));
    return n - (n % 8);
}

let _loras = null;
async function loraList() {
    if (_loras) return _loras;
    try {
        const r = await api.fetchApi("/object_info/LoraLoader");
        const j = await r.json();
        _loras = j?.LoraLoader?.input?.required?.lora_name?.[0] ?? [];
    } catch {
        _loras = [];
    }
    return _loras;
}

let _vaes = null;
async function vaeList() {
    if (_vaes) return _vaes;
    try {
        const r = await api.fetchApi("/object_info/VAELoader");
        const j = await r.json();
        // taesd* are pseudo-entries the backend's plain load_vae can't open, so don't offer them
        _vaes = (j?.VAELoader?.input?.required?.vae_name?.[0] ?? []).filter((v) => !v.startsWith("taesd"));
    } catch {
        _vaes = [];
    }
    return _vaes;
}

function ckptList(node) {
    return node.widgets?.find((w) => w.name === MAINCKPT)?.options?.values ?? [];
}
function mainCkpt(node) {
    return node.widgets?.find((w) => w.name === MAINCKPT)?.value ?? "";
}
function bodyOf(node) {
    return node.widgets?.find((w) => w.name === "__atelier_body");
}
function baseName(p) {
    if (!p) return "";
    const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
    return (i < 0 ? p : p.slice(i + 1)).replace(/\.safetensors$/, "");
}

function cleanLoras(arr) {
    return (arr ?? []).map((l) => ({
        on: l.on !== false,
        force: !!l.force,
        lora: l.lora ?? "",
        strength: typeof l.strength === "number" ? l.strength : 1.0,
    }));
}

function cleanSkip(v) {
    return typeof v === "number" ? v : null;
}
function dimOf(v) { return typeof v === "number" ? v : 1024; }
function clampDn(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, Math.round(n * 100) / 100)) : 0.6; }
function taH(v) { return typeof v === "number" && v >= TA_MIN ? v : TA_DEFAULT; }

function cleanGlobals(arr) {
    const out = [];
    for (const g of arr ?? []) {
        if (g.kind === "latent") out.push({ kind: "latent", width: dimOf(g.width), height: dimOf(g.height), batch: typeof g.batch === "number" ? g.batch : 1, i2i: !!g.i2i, denoise: clampDn(g.denoise), resize: g.resize === "pad" ? "pad" : "crop" });
        else if (g.kind === "prompt") out.push({ kind: "prompt", positive: g.positive ?? "", negative: g.negative ?? "", ph: taH(g.ph), nh: taH(g.nh) });
    }
    return out;
}

function parseState(raw) {
    const empty = { main_label: "main", main_loras: [], main_vae: null, main_clip_skip: null, slots: [], globals: [] };
    if (!raw) return empty;
    let d;
    try { d = JSON.parse(raw); } catch { return empty; }
    if (Array.isArray(d)) d = { main_loras: [], slots: d }; // phase 2 shipped a bare slot array
    let globals = d.globals;
    if (globals === undefined && (d.latent || d.prompt)) {
        // legacy: latent was a permanent footer, prompt carried its own on-flag
        globals = [{ kind: "latent", ...(d.latent || {}) }];
        if (d.prompt?.on) globals.push({ kind: "prompt", positive: d.prompt.positive, negative: d.prompt.negative });
    }
    return {
        main_label: d.main_label || "main",
        main_loras: cleanLoras(d.main_loras),
        main_vae: d.main_vae ?? null,
        main_clip_skip: cleanSkip(d.main_clip_skip),
        slots: (d.slots ?? []).map((s) => ({ ckpt: s.ckpt ?? "", on: s.on !== false, label: s.label ?? "", loras: cleanLoras(s.loras), vae: s.vae ?? null, clip_skip: cleanSkip(s.clip_skip) })),
        globals: cleanGlobals(globals),
    };
}

function sync(node) {
    const w = node.widgets?.find((w) => w.name === STATE);
    const A = node.__a;
    if (w) w.value = JSON.stringify({ main_label: A.main_label, main_loras: A.main_loras, main_vae: A.main_vae, main_clip_skip: A.main_clip_skip, slots: A.slots, globals: A.globals });
}

function newLora() {
    return { on: true, force: false, lora: "", strength: 1.0 };
}
function promptOf(node) { return node.__a.globals.find((g) => g.kind === "prompt"); }
function hasGlobal(node, kind) { return node.__a.globals.some((g) => g.kind === kind); }

// main's data lives spread on __a; a slot's lives on the slot object. this is the one accessor
// that papers over that split, so draw/menu code never has to branch on kind.
function cardProps(node, card) {
    const A = node.__a;
    if (card.kind === "main") return { loras: A.main_loras, vae: A.main_vae, skip: A.main_clip_skip };
    return { loras: card.slot.loras, vae: card.slot.vae, skip: card.slot.clip_skip };
}
function setVae(node, card, v) {
    if (card.kind === "main") node.__a.main_vae = v; else card.slot.vae = v;
    commit(node);
}
function setSkip(node, card, v) {
    if (card.kind === "main") node.__a.main_clip_skip = v; else card.slot.clip_skip = v;
    commit(node);
}
function nExtras(vae, skip) {
    return (vae != null ? 1 : 0) + (skip != null ? 1 : 0);
}

function cardHeight(loras, extras) {
    return HEAD_H + CK_H + extras * ROW_H + loras.length * ROW_H + PADB;
}
function latentHeight(g) { return HEAD_H + LAT_DIM_H + LAT_CTL_H + (g?.i2i ? LAT_CTL_H : 0) + PADB; }
function promptHeight(g) { return HEAD_H + taH(g.ph) + TA_GAP + taH(g.nh) + PADB; }
function globalHeight(g) { return g.kind === "latent" ? latentHeight(g) : promptHeight(g); }

function bodyHeight(node) {
    const A = node.__a;
    if (!A) return ROW_H; // body widget only mounts after __a is set; this is just belt-and-suspenders
    let h = TOP + cardHeight(A.main_loras, nExtras(A.main_vae, A.main_clip_skip)) + GAP;
    for (const s of A.slots) h += cardHeight(s.loras, s.on ? nExtras(s.vae, s.clip_skip) : 0) + GAP;
    if (A.globals.length) {
        h += DIV_H;
        for (const g of A.globals) h += globalHeight(g) + GAP;
    }
    return h + ADD_H;
}

function commit(node) {
    sync(node);
    resize(node);
    syncOverlay(node);
    node.setDirtyCanvas(true, true);
}

// mirrors the gate's _inherit_source - the two have to agree or the preview lies about the roster
function inheritedSrc(node, slotIdx) {
    for (let i = slotIdx - 1; i >= 0; i--) {
        const s = node.__a.slots[i];
        if (s.on) return { ckpt: s.ckpt, count: s.loras.filter((l) => l.on).length };
    }
    return { ckpt: mainCkpt(node), count: node.__a.main_loras.filter((l) => l.on).length };
}

// --- tiny canvas glyphs (we own every pixel here) ---
function drawBolt(ctx, cx, cy, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx + 1, cy - 5); ctx.lineTo(cx - 3, cy + 1); ctx.lineTo(cx, cy + 1);
    ctx.lineTo(cx - 1, cy + 5); ctx.lineTo(cx + 3, cy - 1); ctx.lineTo(cx, cy - 1);
    ctx.closePath(); ctx.fill();
}
function drawForce(ctx, node, x, mid, on) {
    const FW = 24, FH = 15;
    scaled(ctx, tap(node, x + FW / 2, mid), x + FW / 2, mid, () => {
        ctx.beginPath(); ctx.roundRect(x, mid - FH / 2, FW, FH, 5);
        if (on) { ctx.fillStyle = C.gold; ctx.fill(); }
        else { ctx.lineWidth = 1; ctx.strokeStyle = C.stroke; ctx.stroke(); }
        drawBolt(ctx, x + FW / 2, mid, on ? "#1a1410" : C.dim);
    });
}
function drawInfo(ctx, node, cx, mid, hot) {
    scaled(ctx, tap(node, cx, mid), cx, mid, () => {
        ctx.lineWidth = 1.2;
        ctx.save();
        if (hot) { ctx.shadowColor = C.accent; ctx.shadowBlur = 9; }
        ctx.strokeStyle = hot ? C.accent : "rgba(255,255,255,0.4)";
        ctx.beginPath(); ctx.arc(cx, mid, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = hot ? C.accent : "rgba(255,255,255,0.72)";
        ctx.beginPath(); ctx.arc(cx, mid - 3, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.roundRect(cx - 0.9, mid - 1, 1.8, 5, 0.9); ctx.fill();
    });
}
function drawStep(ctx, node, cx, mid, glyph, hot) {
    scaled(ctx, tap(node, cx, mid), cx, mid, () => {
        if (hot) { ctx.beginPath(); ctx.arc(cx, mid, 9, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fill(); }
        ctx.fillStyle = hot ? C.txt : C.dim; ctx.font = "12px Arial";
        ctx.fillText(glyph, cx, mid);
    });
}
function drawChev(ctx, cx, cy, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(cx - 3, cy - 1.5); ctx.lineTo(cx, cy + 1.5); ctx.lineTo(cx + 3, cy - 1.5); ctx.stroke();
}
function drawUp(ctx, cx, cy, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy - 4); ctx.moveTo(cx - 3, cy - 1); ctx.lineTo(cx, cy - 4); ctx.lineTo(cx + 3, cy - 1); ctx.stroke();
}
function drawFrame(ctx, cx, mid, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.roundRect(cx - 6, mid - 5, 12, 10, 2); ctx.stroke();
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(cx - 4, mid + 3); ctx.lineTo(cx - 1, mid - 1); ctx.lineTo(cx + 1.5, mid + 1.5); ctx.lineTo(cx + 4, mid - 2); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + 2.5, mid - 2.5, 1, 0, Math.PI * 2); ctx.fill();
}
function drawQuote(ctx, cx, mid, col) {
    ctx.fillStyle = col;
    for (const dx of [-3, 2]) {
        ctx.beginPath(); ctx.roundRect(cx + dx - 1, mid - 4, 2.4, 4.5, 1); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + dx - 1, mid + 0.5); ctx.lineTo(cx + dx + 1.4, mid + 0.5); ctx.lineTo(cx + dx - 1, mid + 3.5); ctx.closePath(); ctx.fill();
    }
}
function drawGrid(ctx, cx, mid, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.roundRect(cx - 4, mid - 4, 8, 8, 1.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, mid - 4); ctx.lineTo(cx, mid + 4); ctx.moveTo(cx - 4, mid); ctx.lineTo(cx + 4, mid); ctx.stroke();
}
function drawAspect(ctx, rx, mid, w, h) {
    const label = ratio(w, h);
    ctx.font = "11px 'Hanken Grotesk', Arial"; ctx.fillStyle = C.dim; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(label, rx, mid);
    const lw = ctx.measureText(label).width, maxd = 15;
    const bw = w >= h ? maxd : maxd * w / h, bh = w >= h ? maxd * h / w : maxd;
    const bx = rx - lw - 8 - bw, by = mid - bh / 2;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 2);
    ctx.fillStyle = "rgba(255,107,92,0.10)"; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = C.accent; ctx.stroke();
}
function drawNumBox(ctx, x, mid, w, h, val, hot) {
    ctx.beginPath(); ctx.roundRect(x, mid - h / 2, w, h, 7);
    ctx.fillStyle = C.inset; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = hot ? "rgba(255,255,255,0.28)" : C.stroke; ctx.stroke();
    ctx.fillStyle = C.gold; ctx.font = "600 13px 'Bricolage Grotesque', Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(val), x + w / 2, mid);
}

// the ‹ value › pill. box stays solid; arrows+value dim to `alpha` (a lora row fades when off).
// zones: dec (left arrow) / type (middle, click-to-enter) / inc (right arrow).
function drawStepper(ctx, node, sx, mid, ry, text, alpha, hx, hy, zones, onDec, onType, onInc) {
    const stepW = 56;
    ctx.beginPath(); ctx.roundRect(sx, mid - 9, stepW, 18, 9);
    ctx.fillStyle = C.inset; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = C.stroke; ctx.stroke();
    ctx.globalAlpha = alpha; ctx.textAlign = "center";
    drawStep(ctx, node, sx + 9, mid, "‹", inZone(hx, hy, sx, ry + 2, sx + 18, ry + ROW_H - 2));
    ctx.fillStyle = C.gold; ctx.font = "600 11px 'Bricolage Grotesque', Arial"; ctx.fillText(text, sx + stepW / 2, mid);
    drawStep(ctx, node, sx + stepW - 9, mid, "›", inZone(hx, hy, sx + stepW - 18, ry + 2, sx + stepW, ry + ROW_H - 2));
    ctx.globalAlpha = 1;
    zones.push({ x0: sx, y0: ry + 2, x1: sx + 18, y1: ry + ROW_H - 2, fn: onDec });
    zones.push({ x0: sx + 18, y0: ry + 2, x1: sx + stepW - 18, y1: ry + ROW_H - 2, fn: onType });
    zones.push({ x0: sx + stepW - 18, y0: ry + 2, x1: sx + stepW, y1: ry + ROW_H - 2, fn: onInc });
}

function drawLoraRow(ctx, node, card, inh, loras, l, li, cl, cr, ry, zones, hx, hy) {
    const mid = ry + ROW_H / 2;
    const active = inh ? l.force : l.on;
    const hover = hy >= ry && hy < ry + ROW_H && hx >= cl && hx <= cr;
    if (hover) {
        ctx.beginPath(); ctx.roundRect(cl - 3, ry + 1, cr - cl + 6, ROW_H - 2, 7);
        ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fill();
    }

    let x = cl;
    if (inh) {
        drawForce(ctx, node, x, mid, l.force);
        zones.push({ x0: x, y0: ry + 2, x1: x + 24, y1: ry + ROW_H - 2, fn: () => { l.force = !l.force; commit(node); } });
    } else {
        drawSwitch(ctx, node, l, x, mid, l.on);
        zones.push({ x0: x, y0: ry + 2, x1: x + 24, y1: ry + ROW_H - 2, fn: () => { l.on = !l.on; commit(node); } });
    }
    x += 33;

    let rx = cr;
    drawIco(ctx, node, rx - 7, mid, { a: hover ? 1 : 0.3, hot: inZone(hx, hy, rx - 15, ry + 2, rx, ry + ROW_H - 2), kind: "x", danger: true, box: 18 });
    zones.push({ x0: rx - 15, y0: ry + 2, x1: rx, y1: ry + ROW_H - 2, fn: () => { loras.splice(li, 1); commit(node); } });
    rx -= 20;

    const sx = rx - 56;
    drawStepper(ctx, node, sx, mid, ry, (l.strength ?? 1).toFixed(2), active ? 1 : 0.5, hx, hy, zones,
        () => { l.strength = Math.round(((l.strength ?? 1) - 0.05) * 100) / 100; commit(node); },
        (e) => app.canvas.prompt("Strength", l.strength ?? 1, (v) => { l.strength = Number(v) || 0; commit(node); }, e),
        () => { l.strength = Math.round(((l.strength ?? 1) + 0.05) * 100) / 100; commit(node); });
    rx = sx - 7;

    if (l.lora) {
        drawInfo(ctx, node, rx - 8, mid, inZone(hx, hy, rx - 16, ry + 2, rx, ry + ROW_H - 2));
        zones.push({ x0: rx - 16, y0: ry + 2, x1: rx, y1: ry + ROW_H - 2, fn: () => openLoraInfo(l.lora) });
        rx -= 20;
    }

    ctx.textAlign = "left"; ctx.globalAlpha = active ? 1 : 0.5;
    ctx.fillStyle = l.lora ? C.txt : C.dim;
    ctx.font = (l.lora ? "12px" : "italic 12px") + " 'Hanken Grotesk', Arial";
    ctx.fillText(fit(ctx, l.lora ? baseName(l.lora) : "click to choose a lora…", rx - x - 6), x, mid);
    ctx.globalAlpha = 1;
    zones.push({ x0: x, y0: ry + 2, x1: rx - 4, y1: ry + ROW_H - 2, fn: (e) => chooseLora(e, (v) => { if (typeof v === "string") { l.lora = v; commit(node); } }) });
}

function drawExtraHover(ctx, cl, cr, ry, hx, hy) {
    if (hy >= ry && hy < ry + ROW_H && hx >= cl && hx <= cr) {
        ctx.beginPath(); ctx.roundRect(cl - 3, ry + 1, cr - cl + 6, ROW_H - 2, 7);
        ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fill();
    }
}
function drawExtraRemove(ctx, node, cr, ry, mid, hx, hy, zones, onRemove) {
    const hover = hy >= ry && hy < ry + ROW_H;
    drawIco(ctx, node, cr - 7, mid, { a: hover ? 1 : 0.3, hot: inZone(hx, hy, cr - 15, ry + 2, cr, ry + ROW_H - 2), kind: "x", danger: true, box: 18 });
    zones.push({ x0: cr - 15, y0: ry + 2, x1: cr, y1: ry + ROW_H - 2, fn: onRemove });
}
function drawVaeRow(ctx, node, card, vae, cl, cr, ry, zones, hx, hy) {
    const mid = ry + ROW_H / 2;
    drawExtraHover(ctx, cl, cr, ry, hx, hy);
    drawExtraRemove(ctx, node, cr, ry, mid, hx, hy, zones, () => setVae(node, card, null));
    let rx = cr - 18;
    drawChev(ctx, rx - 6, mid, C.dim); rx -= 14;
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = "12px 'Hanken Grotesk', Arial"; ctx.fillStyle = C.dim;
    ctx.fillText("vae", cl, mid);
    const vx = cl + 30;
    ctx.fillStyle = vae ? C.txt : C.dim;
    ctx.font = (vae ? "12px" : "italic 12px") + " 'Hanken Grotesk', Arial";
    ctx.fillText(fit(ctx, vae ? baseName(vae) : "Baked VAE", rx - vx - 4), vx, mid);
    zones.push({ x0: cl, y0: ry + 2, x1: rx, y1: ry + ROW_H - 2, fn: (e) => chooseVae(node, card, e) });
}
function drawClipRow(ctx, node, card, skip, cl, cr, ry, zones, hx, hy) {
    const mid = ry + ROW_H / 2;
    drawExtraHover(ctx, cl, cr, ry, hx, hy);
    drawExtraRemove(ctx, node, cr, ry, mid, hx, hy, zones, () => setSkip(node, card, null));
    const sx = cr - 18 - 56;
    const clamp = (n) => Math.max(-24, Math.min(-1, n));
    drawStepper(ctx, node, sx, mid, ry, String(skip), 1, hx, hy, zones,
        () => setSkip(node, card, clamp(skip - 1)),
        (e) => app.canvas.prompt("Clip skip", skip, (v) => setSkip(node, card, clamp(parseInt(v, 10) || -2)), e),
        () => setSkip(node, card, clamp(skip + 1)));
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = "12px 'Hanken Grotesk', Arial"; ctx.fillStyle = C.dim;
    ctx.fillText("clip skip", cl, mid);
}

function drawCard(ctx, node, card, width, cy, zones, hx, hy, floating) {
    const A = node.__a;
    const isMain = card.kind === "main";
    const slot = card.slot;
    const loras = isMain ? A.main_loras : slot.loras;
    const inh = !isMain && !slot.on;
    const vae = isMain ? A.main_vae : slot.vae;
    const skip = isMain ? A.main_clip_skip : slot.clip_skip;
    const h = cardHeight(loras, inh ? 0 : nExtras(vae, skip));
    const x0 = M, x1 = width - M;
    const hover = hy >= cy && hy < cy + h && hx >= x0 && hx <= x1;

    // 1px lift, visual only - zones stay at the logical y or the hover boundary flickers
    ctx.save(); ctx.translate(0, hover && !floating ? -1 : 0);
    ctx.beginPath(); ctx.roundRect(x0, cy, x1 - x0, h, 12);
    if (floating) { ctx.save(); ctx.shadowColor = "rgba(255,107,92,0.45)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12; ctx.fillStyle = "rgba(26,22,38,0.97)"; ctx.fill(); ctx.restore(); }
    ctx.fillStyle = floating ? "rgba(255,255,255,0.06)" : (hover ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.035)");
    ctx.fill();
    ctx.lineWidth = floating ? 1.5 : 1;
    ctx.strokeStyle = floating ? "rgba(255,107,92,0.55)" : (inh ? "rgba(255,211,107,0.22)" : isMain ? "rgba(255,107,92,0.22)" : (hover ? "rgba(255,255,255,0.16)" : C.stroke));
    ctx.stroke();
    if (isMain || inh) {
        ctx.beginPath(); ctx.roundRect(x0 + 4, cy + 10, 2.5, h - 20, 2);
        ctx.fillStyle = isMain ? grad(ctx, x0, cy + 10, 0, h - 20, C.accent, "#ff9a6b") : grad(ctx, x0, cy + 10, 0, h - 20, C.gold, "#e0a44d");
        ctx.fill();
    }

    const cl = x0 + 12, cr = x1 - 11;
    const headMid = cy + HEAD_H / 2;
    ctx.textBaseline = "middle";

    let hxp = cl;
    if (!isMain) {
        drawGrip(ctx, hxp, headMid, hover ? C.txt : C.dim);
        zones.push({ x0: hxp - 4, y0: cy + 2, x1: hxp + 12, y1: cy + HEAD_H - 2, drag: slot, list: A.slots });
        hxp += 14;
        drawSwitch(ctx, node, slot, hxp, headMid, slot.on);
        zones.push({ x0: hxp, y0: cy + 2, x1: hxp + 24, y1: cy + HEAD_H - 2, fn: () => { slot.on = !slot.on; commit(node); } });
        hxp += 32;
    }

    const label = isMain ? (A.main_label || "main") : (slot.label || ("pass " + (card.i + 1)));
    ctx.font = "600 13px 'Bricolage Grotesque', Arial"; ctx.fillStyle = inh ? C.dim : C.txt; ctx.textAlign = "left";
    const labelText = fit(ctx, label, cr - hxp - 52);
    ctx.fillText(labelText, hxp, headMid);
    const lw = ctx.measureText(labelText).width;
    zones.push({ x0: hxp, y0: cy, x1: hxp + lw + 4, y1: cy + HEAD_H, fn: (e) => renameCard(node, card, e) });

    let tx = cr;
    if (!isMain) {
        const xHot = inZone(hx, hy, tx - 16, cy + 2, tx, cy + HEAD_H - 2);
        drawIco(ctx, node, tx - 7, headMid, { a: hover ? 1 : 0.4, hot: xHot, kind: "x", danger: true, rot: anim(node, slot, "spin", xHot ? 1 : 0, 220) });
        zones.push({ x0: tx - 16, y0: cy + 2, x1: tx, y1: cy + HEAD_H - 2, fn: () => { A.slots.splice(card.i, 1); commit(node); } });
        tx -= 22;
    }
    drawIco(ctx, node, tx - 7, headMid, { a: hover ? 1 : 0.45, hot: inZone(hx, hy, tx - 16, cy + 2, tx, cy + HEAD_H - 2), kind: "plus" });
    zones.push({ x0: tx - 16, y0: cy + 2, x1: tx, y1: cy + HEAD_H - 2, fn: (e) => cardAddMenu(node, card, e) });

    const ckY = cy + HEAD_H, ckMid = ckY + CK_H / 2;
    ctx.beginPath(); ctx.roundRect(cl, ckY + 2, cr - cl, CK_H - 6, 8);
    ctx.fillStyle = inh ? "rgba(255,211,107,0.06)" : C.inset; ctx.fill();
    if (!inh) { ctx.lineWidth = 1; ctx.strokeStyle = C.stroke; ctx.stroke(); }
    ctx.font = "12px 'Hanken Grotesk', Arial"; ctx.textAlign = "left";
    if (inh) {
        drawUp(ctx, cl + 10, ckMid, C.gold);
        ctx.fillStyle = "#cdbf9a";
        const src = inheritedSrc(node, card.i);
        const forced = loras.filter((l) => l.force).length;
        const tail = forced ? `  · ${forced} forced` : (src.count ? `  +${src.count} lora` : "");
        ctx.fillText(fit(ctx, "inherits · " + baseName(src.ckpt) + tail, cr - cl - 30), cl + 20, ckMid);
    } else {
        const ck = isMain ? mainCkpt(node) : slot.ckpt;
        ctx.fillStyle = "#cfc9de";
        ctx.fillText(fit(ctx, baseName(ck) || "choose checkpoint…", cr - cl - 24), cl + 10, ckMid);
        drawChev(ctx, cr - 10, ckMid, C.dim);
        zones.push({ x0: cl, y0: ckY + 2, x1: cr, y1: ckY + CK_H - 4, fn: (e) => chooseCkpt(node, card, e) });
    }

    let ly = ckY + CK_H;
    if (!inh) {
        if (vae != null) { drawVaeRow(ctx, node, card, vae, cl, cr, ly, zones, hx, hy); ly += ROW_H; }
        if (skip != null) { drawClipRow(ctx, node, card, skip, cl, cr, ly, zones, hx, hy); ly += ROW_H; }
    }
    loras.forEach((l, li) => { drawLoraRow(ctx, node, card, inh, loras, l, li, cl, cr, ly, zones, hx, hy); ly += ROW_H; });
    ctx.restore();
    return cy + h;
}

function drawLatentCard(ctx, node, g, width, cy, zones, hx, hy, floating) {
    const A = node.__a;
    const h = latentHeight(g);
    const x0 = M, x1 = width - M;
    const hover = hy >= cy && hy < cy + h && hx >= x0 && hx <= x1;
    ctx.save(); ctx.translate(0, hover && !floating ? -1 : 0);
    const { cl, cr, headMid } = cardShell(ctx, node, { x0, x1, cy, h, hover, floating });

    let hxp = cl;
    drawGrip(ctx, hxp, headMid, hover ? C.txt : C.dim);
    zones.push({ x0: hxp - 4, y0: cy + 2, x1: hxp + 12, y1: cy + HEAD_H - 2, drag: g, list: A.globals });
    hxp += 16;
    drawFrame(ctx, hxp + 3, headMid, C.accent); hxp += 14;
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.font = "600 13px 'Bricolage Grotesque', Arial"; ctx.fillStyle = C.txt;
    ctx.fillText("canvas", hxp, headMid);
    let mx = hxp + ctx.measureText("canvas").width + 12;
    ctx.font = "600 10px 'Hanken Grotesk', Arial"; ctx.fillStyle = g.i2i ? C.accent : C.dim;
    ctx.fillText("img2img", mx, headMid);
    const swX = mx + ctx.measureText("img2img").width + 6;
    drawSwitch(ctx, node, g, swX, headMid, g.i2i);
    zones.push({ x0: mx - 4, y0: cy + 2, x1: swX + 28, y1: cy + HEAD_H - 2, fn: () => { g.i2i = !g.i2i; commit(node); } });
    drawAspect(ctx, cr - 22, headMid, g.width, g.height);
    const xHot = inZone(hx, hy, cr - 16, cy + 2, cr, cy + HEAD_H - 2);
    drawIco(ctx, node, cr - 7, headMid, { a: hover ? 1 : 0.4, hot: xHot, kind: "x", danger: true, rot: anim(node, g, "spin", xHot ? 1 : 0, 220) });
    zones.push({ x0: cr - 16, y0: cy + 2, x1: cr, y1: cy + HEAD_H - 2, fn: () => removeGlobal(node, g) });

    const dimY = cy + HEAD_H, dimMid = dimY + LAT_DIM_H / 2;
    const boxW = 66, boxH = 24, gap = 26, totalW = boxW * 2 + gap;
    const wbx = (x0 + x1) / 2 - totalW / 2, hbx = wbx + boxW + gap;
    drawNumBox(ctx, wbx, dimMid, boxW, boxH, g.width, inZone(hx, hy, wbx, dimMid - 12, wbx + boxW, dimMid + 12));
    zones.push({ x0: wbx, y0: dimMid - 12, x1: wbx + boxW, y1: dimMid + 12, fn: (e) => app.canvas.prompt("Width", g.width, (v) => { g.width = snapDim(v); commit(node); }, e) });
    ctx.fillStyle = C.dim; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "13px 'Hanken Grotesk', Arial";
    ctx.fillText("×", wbx + boxW + gap / 2, dimMid);
    drawNumBox(ctx, hbx, dimMid, boxW, boxH, g.height, inZone(hx, hy, hbx, dimMid - 12, hbx + boxW, dimMid + 12));
    zones.push({ x0: hbx, y0: dimMid - 12, x1: hbx + boxW, y1: dimMid + 12, fn: (e) => app.canvas.prompt("Height", g.height, (v) => { g.height = snapDim(v); commit(node); }, e) });

    const ctlY = dimY + LAT_DIM_H, ctlMid = ctlY + LAT_CTL_H / 2;
    zones.push({ ...drawPresetPill(ctx, node, cl, ctlY, hx, hy), fn: (e) => chooseDim(node, g, e) });
    const sx = cr - 56;
    drawStepper(ctx, node, sx, ctlMid, ctlMid - ROW_H / 2, String(g.batch), 1, hx, hy, zones,
        () => { g.batch = Math.max(1, g.batch - 1); commit(node); },
        (e) => app.canvas.prompt("Batch", g.batch, (v) => { g.batch = Math.max(1, parseInt(v, 10) || 1); commit(node); }, e),
        () => { g.batch += 1; commit(node); });
    ctx.fillStyle = C.dim; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.font = "12px 'Hanken Grotesk', Arial";
    ctx.fillText("batch", sx - 8, ctlMid);

    if (g.i2i) {
        const r2 = ctlY + LAT_CTL_H, r2mid = r2 + LAT_CTL_H / 2;
        zones.push({ ...drawModePill(ctx, cl, r2, g.resize, hx, hy), fn: () => { g.resize = g.resize === "pad" ? "crop" : "pad"; commit(node); } });
        const dsx = cr - 56;
        drawStepper(ctx, node, dsx, r2mid, r2mid - ROW_H / 2, g.denoise.toFixed(2), 1, hx, hy, zones,
            () => { g.denoise = clampDn(g.denoise - 0.05); commit(node); },
            (e) => app.canvas.prompt("Denoise", g.denoise.toFixed(2), (v) => { g.denoise = clampDn(parseFloat(v)); commit(node); }, e),
            () => { g.denoise = clampDn(g.denoise + 0.05); commit(node); });
        ctx.fillStyle = C.dim; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.font = "12px 'Hanken Grotesk', Arial";
        ctx.fillText("denoise", dsx - 8, r2mid);
    }
    ctx.restore();
    return cy + h;
}

function drawModePill(ctx, x, cy, mode, hx, hy) {
    const w = 78, h = 20, y = cy + (LAT_CTL_H - h) / 2;
    const hot = inZone(hx, hy, x, y, x + w, y + h);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = hot ? "rgba(255,107,92,0.10)" : "rgba(255,255,255,0.04)"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = hot ? "rgba(255,107,92,0.4)" : C.stroke; ctx.stroke();
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillStyle = C.dim; ctx.font = "600 9px 'Hanken Grotesk', Arial";
    ctx.fillText("FIT", x + 10, y + h / 2);
    ctx.fillStyle = hot ? "#ffd0c8" : C.txt; ctx.font = "600 12px 'Hanken Grotesk', Arial";
    ctx.fillText(mode, x + 32, y + h / 2);
    return { x0: x, y0: y, x1: x + w, y1: y + h };
}

function drawPromptCard(ctx, node, g, width, cy, zones, hx, hy, floating) {
    const A = node.__a;
    const ph = taH(g.ph), nh = taH(g.nh);
    const h = HEAD_H + ph + TA_GAP + nh + PADB;
    const x0 = M, x1 = width - M;
    const hover = hy >= cy && hy < cy + h && hx >= x0 && hx <= x1;
    ctx.save(); ctx.translate(0, hover && !floating ? -1 : 0);
    const { cl, cr, headMid } = cardShell(ctx, node, { x0, x1, cy, h, hover, floating });

    let hxp = cl;
    drawGrip(ctx, hxp, headMid, hover ? C.txt : C.dim);
    zones.push({ x0: hxp - 4, y0: cy + 2, x1: hxp + 12, y1: cy + HEAD_H - 2, drag: g, list: A.globals });
    hxp += 16;
    drawQuote(ctx, hxp + 3, headMid, C.accent); hxp += 14;
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.font = "600 13px 'Bricolage Grotesque', Arial"; ctx.fillStyle = C.txt;
    ctx.fillText("prompt", hxp, headMid);
    const xHot = inZone(hx, hy, cr - 16, cy + 2, cr, cy + HEAD_H - 2);
    drawIco(ctx, node, cr - 7, headMid, { a: hover ? 1 : 0.4, hot: xHot, kind: "x", danger: true, rot: anim(node, g, "spin", xHot ? 1 : 0, 220) });
    zones.push({ x0: cr - 16, y0: cy + 2, x1: cr, y1: cy + HEAD_H - 2, fn: () => removeGlobal(node, g) });

    // the two textarea wells. live editing rides a DOM overlay placed over these (see placeOverlay).
    // while floating (a drag), the overlay is hidden and we paint a text preview so the card isn't empty.
    const wells = [[cy + HEAD_H, ph, g.positive, "positive prompt…", C.accent], [cy + HEAD_H + ph + TA_GAP, nh, g.negative, "negative prompt…", C.gold]];
    for (const [wy, wh, text, ph_text, tint] of wells) {
        ctx.beginPath(); ctx.roundRect(cl, wy, cr - cl, wh, 9);
        ctx.fillStyle = "rgba(0,0,0,0.26)"; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = floating ? "rgba(255,255,255,0.10)" : C.stroke; ctx.stroke();
        if (floating) {
            ctx.save(); ctx.beginPath(); ctx.roundRect(cl, wy, cr - cl, wh, 9); ctx.clip();
            ctx.textAlign = "left"; ctx.textBaseline = "top";
            ctx.font = (text ? "12px" : "italic 12px") + " 'Hanken Grotesk', Arial";
            ctx.fillStyle = text ? C.txt : C.dim;
            const lines = (text || ph_text).split("\n").slice(0, Math.max(1, Math.floor((wh - 10) / 16)));
            lines.forEach((ln, i) => ctx.fillText(fit(ctx, ln, cr - cl - 16), cl + 8, wy + 7 + i * 16));
            ctx.restore();
            ctx.fillStyle = tint; ctx.beginPath(); ctx.roundRect(cl + 1.5, wy + 7, 2, wh - 14, 1); ctx.fill();
        }
    }
    ctx.restore();
    if (!floating) node.__taPlace = { cl, top: cy + HEAD_H, w: cr - cl };
    return cy + h;
}

function drawSection(ctx, node, item, list, i, width, top, zones, hx, hy, floating) {
    if (list === node.__a.slots) return drawCard(ctx, node, { kind: "slot", slot: item, i }, width, top, zones, hx, hy, floating);
    if (item.kind === "latent") return drawLatentCard(ctx, node, item, width, top, zones, hx, hy, floating);
    return drawPromptCard(ctx, node, item, width, top, zones, hx, hy, floating);
}

function drawPresetPill(ctx, node, x, cy, hx, hy) {
    const w = 80, h = 20, y = cy + (LAT_CTL_H - h) / 2;
    const hot = inZone(hx, hy, x, y, x + w, y + h);
    const cx = x + w / 2, mid = y + h / 2;
    scaled(ctx, tap(node, cx, mid), cx, mid, () => {
        ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2);
        ctx.fillStyle = hot ? "rgba(255,107,92,0.10)" : "rgba(255,255,255,0.04)"; ctx.fill();
        ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
        ctx.strokeStyle = hot ? "rgba(255,107,92,0.4)" : "rgba(255,255,255,0.18)"; ctx.stroke();
        ctx.setLineDash([]);
        drawGrid(ctx, x + 13, mid, hot ? C.accent : C.dim);
        ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = hot ? "#ffd0c8" : C.txt; ctx.font = "600 12px 'Hanken Grotesk', Arial";
        ctx.fillText("presets", x + 23, mid);
    });
    return { x0: x, y0: y, x1: x + w, y1: y + h };
}

function chooseDim(node, g, event) {
    const scale = Math.max(1, app.canvas?.ds?.scale ?? 1);
    const items = SDXL_DIMS.map(([w, h]) => ({
        content: (g.width === w && g.height === h ? "● " : "") + w + " × " + h + "   " + ratio(w, h),
        callback: () => { g.width = w; g.height = h; commit(node); },
    }));
    new LiteGraph.ContextMenu(items, { event, scale, className: "dark", title: "sdxl dimensions" });
}

function drawBody(ctx, node, width, y0, w) {
    const A = node.__a;
    const zones = [];
    const d = node.__drag;
    const hov = (node.__hover && !d) ? node.__hover : null, hx = hov ? hov[0] : -1, hy = hov ? hov[1] : -1;
    node.__taPlace = null;
    ctx.save();
    let cy = y0 + TOP;
    cy = drawCard(ctx, node, { kind: "main" }, width, cy, zones, hx, hy) + GAP;
    const rows = [];
    A.slots.forEach((s, i) => {
        const top = cy, h = cardHeight(s.loras, s.on ? nExtras(s.vae, s.clip_skip) : 0);
        if (d && d.item === s) { drawHole(ctx, width, top, h); cy = top + h; }
        else cy = drawCard(ctx, node, { kind: "slot", slot: s, i }, width, top, zones, hx, hy);
        rows.push({ item: s, list: A.slots, i, top, h: cy - top });
        cy += GAP;
    });
    if (A.globals.length) {
        drawDivider(ctx, width, cy); cy += DIV_H;
        A.globals.forEach((g, i) => {
            const top = cy, h = globalHeight(g);
            if (d && d.item === g) { drawHole(ctx, width, top, h); cy = top + h; }
            else cy = drawSection(ctx, node, g, A.globals, i, width, top, zones, hx, hy);
            rows.push({ item: g, list: A.globals, top, h: cy - top });
            cy += GAP;
        });
    }
    node.__rows = rows;
    drawAdd(ctx, node, width, cy, zones, hx, hy, (e) => addMenu(node, e));
    if (d) {
        computeDrop(node, d);
        drawDropLine(ctx, width, d.lineY);
        const home = rows.find((r) => r.item === d.item);
        if (home) {
            ctx.save(); ctx.translate(0, d.curY - d.grabY);
            drawSection(ctx, node, d.item, d.list, home.i ?? 0, width, home.top, [], -1, -1, true);
            ctx.restore();
        }
    }
    ctx.restore();
    w.__zones = zones;
    placeOverlay(node);
}

// --- the prompt overlay. comfy's own DOM widgets can't ride inside a custom-drawn body, so the
// textareas are placed by hand off the canvas transform. text lives in the globals blob, not the widget.
const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@300;400;500;600&display=swap";
const PR_CSS = `
.atelier-pr{position:fixed;z-index:60;transform-origin:0 0;pointer-events:none;display:flex;flex-direction:column;gap:${TA_GAP}px}
.atelier-pr textarea{pointer-events:auto;box-sizing:border-box;width:100%;resize:vertical;overflow:auto;min-height:${TA_MIN}px;
  font-family:"Hanken Grotesk",sans-serif;font-size:12.5px;line-height:1.45;color:#ece9f5;
  background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:7px 9px;outline:none;
  transition:border-color .15s,background .15s}
.atelier-pr textarea::placeholder{color:#6f6889;font-style:italic}
.atelier-pr textarea:focus{border-color:rgba(255,107,92,.55);background:rgba(0,0,0,.36)}
.atelier-pr textarea.neg:focus{border-color:rgba(255,211,107,.5)}
.atelier-pr textarea::-webkit-scrollbar{width:8px}
.atelier-pr textarea::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:99px;border:2px solid transparent;background-clip:padding-box}
`;
function ensurePromptAssets() {
    if (document.getElementById("atelier-pr-style")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = FONTS;
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.id = "atelier-pr-style"; style.textContent = PR_CSS;
    document.head.appendChild(style);
}

function mkArea(node, g, key, cls, placeholder) {
    const ta = document.createElement("textarea");
    ta.className = cls; ta.placeholder = placeholder; ta.spellcheck = false;
    ta.value = g[key];
    ta.style.height = (cls === "neg" ? taH(g.nh) : taH(g.ph)) + "px";
    ta.addEventListener("input", () => { g[key] = ta.value; sync(node); });
    const hk = cls === "neg" ? "nh" : "ph";
    const ro = new ResizeObserver(() => {
        const hh = ta.offsetHeight; // layout px == node-local (transform:scale doesn't touch offsetHeight)
        if (hh >= TA_MIN && Math.abs(taH(g[hk]) - hh) > 1) { g[hk] = hh; commit(node); }
    });
    ro.observe(ta);
    ta.__ro = ro;
    return ta;
}

function ensurePromptBox(node) {
    if (node.__prBox) return;
    const g = promptOf(node);
    if (!g) return;
    ensurePromptAssets();
    const box = document.createElement("div");
    box.className = "atelier-pr";
    box.append(mkArea(node, g, "positive", "pos", "positive prompt…"), mkArea(node, g, "negative", "neg", "negative prompt…"));
    document.body.appendChild(box);
    node.__prBox = box;
}
function destroyPromptBox(node) {
    if (!node.__prBox) return;
    node.__prBox.querySelectorAll("textarea").forEach((ta) => ta.__ro?.disconnect());
    node.__prBox.remove();
    node.__prBox = null;
}
function syncOverlay(node) {
    if (promptOf(node)) ensurePromptBox(node);
    else destroyPromptBox(node);
}

function placeOverlay(node) {
    const box = node.__prBox;
    if (!box) return;
    const p = node.__taPlace;
    const ds = app.canvas?.ds;
    if (!p || !ds || node.flags?.collapsed) { box.style.display = "none"; return; }
    const rect = app.canvas.canvas.getBoundingClientRect();
    const [sx, sy] = ds.convertOffsetToCanvas([node.pos[0] + p.cl, node.pos[1] + p.top]);
    if (sy < -40 || sy > rect.height + 40) { box.style.display = "none"; return; } // scrolled off the canvas
    box.style.display = "flex";
    box.style.left = (rect.left + sx) + "px";
    box.style.top = (rect.top + sy) + "px";
    box.style.width = p.w + "px";
    box.style.transform = `scale(${ds.scale})`;
}

function removeGlobal(node, g) {
    const i = node.__a.globals.indexOf(g);
    if (i >= 0) node.__a.globals.splice(i, 1);
    commit(node);
}

// --- choosers (the dark filtered menu is our one interaction grammar) ---
function chooseLora(event, cb) {
    const scale = Math.max(1, app.canvas?.ds?.scale ?? 1);
    loraList().then((list) => new LiteGraph.ContextMenu(list, { event, scale, className: "dark", title: "choose a lora", callback: cb }));
}
function chooseVae(node, card, event) {
    const scale = Math.max(1, app.canvas?.ds?.scale ?? 1);
    vaeList().then((list) => new LiteGraph.ContextMenu(["Baked VAE", ...list], {
        event, scale, className: "dark", title: "choose a vae",
        callback: (v) => { if (typeof v === "string") setVae(node, card, v === "Baked VAE" ? "" : v); },
    }));
}
function chooseCkpt(node, card, event) {
    const scale = Math.max(1, app.canvas?.ds?.scale ?? 1);
    new LiteGraph.ContextMenu(ckptList(node), {
        event, scale, className: "dark", title: "choose a checkpoint",
        callback: (v) => {
            if (typeof v !== "string") return;
            if (card.kind === "main") { const wd = node.widgets.find((wd) => wd.name === MAINCKPT); if (wd) wd.value = v; }
            else card.slot.ckpt = v;
            commit(node);
        },
    });
}
function renameCard(node, card, event) {
    const cur = card.kind === "main" ? (node.__a.main_label || "main") : (card.slot.label || "");
    app.canvas.prompt("Label", cur, (v) => {
        const t = (v || "").trim();
        if (card.kind === "main") node.__a.main_label = t || "main";
        else card.slot.label = t;
        commit(node);
    }, event);
}
function addMenu(node, event) {
    const items = [
        { content: "Checkpoint", callback: () => { node.__a.slots.push({ ckpt: ckptList(node)[0] || "", on: true, label: "", loras: [], vae: null, clip_skip: null }); commit(node); } },
        { content: "Lora", has_submenu: true, callback: (v, opts, e, parent) => loraSubmenu(node, e, parent) },
        { content: "Canvas", disabled: hasGlobal(node, "latent"), callback: () => { node.__a.globals.push({ kind: "latent", width: 1024, height: 1024, batch: 1 }); commit(node); } },
        { content: "Prompt", disabled: hasGlobal(node, "prompt"), callback: () => { node.__a.globals.push({ kind: "prompt", positive: "", negative: "", ph: TA_DEFAULT, nh: TA_DEFAULT }); commit(node); } },
    ];
    new LiteGraph.ContextMenu(items, { event, className: "dark", title: "add to hub" });
}
function cardAddMenu(node, card, event) {
    const p = cardProps(node, card);
    const inh = card.kind === "slot" && !card.slot.on;
    const items = [
        { content: "Lora", callback: () => { p.loras.push(newLora()); commit(node); } },
        { content: "VAE override", disabled: inh || p.vae != null, callback: () => setVae(node, card, "") },
        { content: "Clip skip", disabled: inh || p.skip != null, callback: () => setSkip(node, card, -2) },
    ];
    const title = card.kind === "main" ? (node.__a.main_label || "main") : (card.slot.label || "pass " + (card.i + 1));
    new LiteGraph.ContextMenu(items, { event, className: "dark", title: "add to " + title });
}
function loraSubmenu(node, event, parent) {
    const items = [{ content: node.__a.main_label || "main", callback: () => { node.__a.main_loras.push(newLora()); commit(node); } }];
    node.__a.slots.forEach((s, i) => items.push({ content: s.label || ("pass " + (i + 1)), callback: () => { s.loras.push(newLora()); commit(node); } }));
    new LiteGraph.ContextMenu(items, { event, className: "dark", title: "add lora to", parentMenu: parent });
}

function bodyWidget(node) {
    const w = { name: "__atelier_body", type: "custom", serialize: false };
    w.computeSize = () => [Math.max(node.size?.[0] ?? 340, 300), bodyHeight(node)];
    w.draw = (ctx, n, width, y) => drawBody(ctx, n, width, y, w);
    w.mouse = (e, pos, n) => bodyMouse(e, pos, n, w, commit);
    return w;
}

function mount(node) {
    registerGlass(HUB_CLASS);
    hide(node.widgets?.find((w) => w.name === STATE));
    hide(node.widgets?.find((w) => w.name === MAINCKPT));
    loraList();
    vaeList();
    node.__a = parseState(node.widgets?.find((w) => w.name === STATE)?.value);
    if (!bodyOf(node)) node.widgets.push(bodyWidget(node));
    syncOverlay(node);
    node.onMouseMove = function (e, pos) { this.__hover = pos; this.setDirtyCanvas(true); };
    node.onMouseLeave = function () { this.__hover = null; this.setDirtyCanvas(true); };
    const onRemoved = node.onRemoved;
    node.onRemoved = function () { destroyPromptBox(this); onRemoved?.apply(this, arguments); };
    resize(node);
}

app.registerExtension({
    name: "atelier.hub",
    async nodeCreated(node) {
        if (node.comfyClass === HUB_CLASS) mount(node);
        else if (node.comfyClass === CART_CLASS) registerGlass(CART_CLASS);
    },
    async loadedGraphNode(node) {
        if (node.comfyClass === HUB_CLASS) mount(node);
        else if (node.comfyClass === CART_CLASS) registerGlass(CART_CLASS);
    },
});
