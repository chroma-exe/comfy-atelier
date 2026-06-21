import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { openLoraInfo } from "./atelier.lorainfo.js";

const HUB_CLASS = "AtelierHub";
const STATE = "checkpoints";   // the json blob the backend reads - single source of truth
const MAINCKPT = "ckpt_name";  // hidden stock combo: holds the main checkpoint + the file list

// palette
const C = {
    txt: "#ece9f5", dim: "#9a93b4", accent: "#ff6b5c", gold: "#ffd36b",
    stroke: "rgba(255,255,255,0.10)", inset: "rgba(0,0,0,0.22)",
};
// flat on purpose - a gradient sheen here reads fake. one number is the whole glass
const GLASS = { fill: "#14121e", alpha: 0.82 };

// layout, px, node-local
const M = 9, GAP = 9, HEAD_H = 26, CK_H = 24, ROW_H = 22, PADB = 8, ADD_H = 30, TOP = 4;

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

function parseState(raw) {
    const empty = { main_label: "main", main_loras: [], main_vae: null, main_clip_skip: null, slots: [] };
    if (!raw) return empty;
    let d;
    try { d = JSON.parse(raw); } catch { return empty; }
    if (Array.isArray(d)) d = { main_loras: [], slots: d }; // phase 2 shipped a bare slot array
    return {
        main_label: d.main_label || "main",
        main_loras: cleanLoras(d.main_loras),
        main_vae: d.main_vae ?? null,
        main_clip_skip: cleanSkip(d.main_clip_skip),
        slots: (d.slots ?? []).map((s) => ({ ckpt: s.ckpt ?? "", on: s.on !== false, label: s.label ?? "", loras: cleanLoras(s.loras), vae: s.vae ?? null, clip_skip: cleanSkip(s.clip_skip) })),
    };
}

function sync(node) {
    const w = node.widgets?.find((w) => w.name === STATE);
    const A = node.__a;
    if (w) w.value = JSON.stringify({ main_label: A.main_label, main_loras: A.main_loras, main_vae: A.main_vae, main_clip_skip: A.main_clip_skip, slots: A.slots });
}

function newLora() {
    return { on: true, force: false, lora: "", strength: 1.0 };
}

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
function bodyHeight(node) {
    const A = node.__a;
    if (!A) return ROW_H; // body widget only mounts after __a is set; this is just belt-and-suspenders
    let h = TOP + cardHeight(A.main_loras, nExtras(A.main_vae, A.main_clip_skip)) + GAP;
    for (const s of A.slots) h += cardHeight(s.loras, s.on ? nExtras(s.vae, s.clip_skip) : 0) + GAP;
    return h + ADD_H;
}

function resize(node) {
    // computeSize returns the minimum box; addWidget collapses to it, so floor at the dragged width.
    const w = node.size[0];
    const min = node.computeSize();
    node.setSize([Math.max(w, min[0]), min[1]]);
}
function commit(node) {
    sync(node);
    resize(node);
    node.setDirtyCanvas(true, true);
}

function hide(w) {
    if (!w) return;
    w.hidden = true;
    w.computeSize = () => [0, -4]; // keep it so the value still serializes; just stop drawing it
}

function fit(ctx, str, max) {
    if (max <= 0) return "";
    if (ctx.measureText(str).width <= max) return str;
    while (str.length && ctx.measureText(str + "…").width > max) str = str.slice(0, -1);
    return str + "…";
}

// mirrors the gate's _inherit_source - the two have to agree or the preview lies about the roster
function inheritedSrc(node, slotIdx) {
    for (let i = slotIdx - 1; i >= 0; i--) {
        const s = node.__a.slots[i];
        if (s.on) return { ckpt: s.ckpt, count: s.loras.filter((l) => l.on).length };
    }
    return { ckpt: mainCkpt(node), count: node.__a.main_loras.filter((l) => l.on).length };
}

// real translucent glass: fill the whole node at globalAlpha < 1 (so the canvas + wires bleed
// through) and DON'T call the original drawNodeShape - the original paints an opaque body first,
// which is the lie. then redraw the title with the node's own methods; litegraph draws the slots
// after this returns. recipe lifted from the niutonian glassmorphism theme.
function drawHubShape(node, ctx, size, selected) {
    if (!node.drawTitleBox || !node.drawTitleText) throw new Error("no title methods on this litegraph");
    const collapsed = node.flags?.collapsed;
    const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
    const w = collapsed ? (node._collapsed_width || LiteGraph.NODE_COLLAPSED_WIDTH || 80) : size[0];
    const top = -titleH, full = collapsed ? titleH : size[1] + titleH, r = 11;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = selected ? 0 : 6;
    ctx.beginPath(); ctx.roundRect(0, top, w, full, r);
    ctx.globalAlpha = GLASS.alpha;
    ctx.fillStyle = GLASS.fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // drift-blob echo - faint color blooms clipped inside the glass (can't blur behind a node on canvas)
    ctx.save();
    ctx.beginPath(); ctx.roundRect(0, top, w, full, r); ctx.clip();
    for (const [bx, by, br, c0, c1] of [
        [w * 0.16, top + full * 0.88, full * 0.7, "rgba(255,107,92,0.07)", "rgba(255,107,92,0)"],
        [w * 0.86, top + full * 0.12, full * 0.5, "rgba(124,107,255,0.08)", "rgba(124,107,255,0)"],
        [w * 0.6, top + full * 0.5, full * 0.55, "rgba(255,211,107,0.05)", "rgba(255,211,107,0)"],
    ]) {
        const rg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        rg.addColorStop(0, c0); rg.addColorStop(1, c1);
        ctx.fillStyle = rg; ctx.fillRect(0, top, w, full);
    }
    ctx.restore();

    ctx.beginPath(); ctx.roundRect(0.5, top + 0.5, w - 1, full - 1, r);
    ctx.strokeStyle = selected ? "rgba(255,107,92,0.6)" : "rgba(255,255,255,0.13)";
    ctx.lineWidth = selected ? 1.5 : 1; ctx.stroke();

    // lit top edge - the dialog's inset highlight, faked as a hairline of light
    ctx.beginPath(); ctx.moveTo(r, top + 1); ctx.lineTo(w - r, top + 1);
    ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1; ctx.stroke();

    if (!collapsed) {
        ctx.strokeStyle = "rgba(255,107,92,0.35)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(10, 0.5); ctx.lineTo(w - 10, 0.5); ctx.stroke();
    }
    ctx.restore();

    if (node.onDrawBackground) node.onDrawBackground(ctx);
    const opts = { scale: this.ds?.scale || 1, low_quality: this.low_quality || false };
    node.drawTitleBox(ctx, { ...opts, box_size: 10 });
    node.drawTitleText(ctx, { ...opts, default_title_color: "#ffb7ac" });
    node.onDrawTitle?.(ctx);
}

let _glassInstalled = false;
function installGlass() {
    if (_glassInstalled || typeof LGraphCanvas === "undefined") return;
    _glassInstalled = true;
    const orig = LGraphCanvas.prototype.drawNodeShape;
    LGraphCanvas.prototype.drawNodeShape = function (node, ctx, size, fgcolor, bgcolor, selected, mouse_over) {
        if (node?.comfyClass !== HUB_CLASS) return orig.apply(this, arguments);
        try { return drawHubShape.call(this, node, ctx, size, selected); }
        catch { return orig.apply(this, arguments); } // fall back to a plain (opaque) node, never break
    };
}

// --- micro-animations: one raf per node while anything's mid-move, time-based so it self-settles ---
const SLIDE_MS = 190, TAP_MS = 100;
const ease = (t) => 1 - (1 - t) ** 3;
function keepAnimating(node) {
    if (node.__raf) return;
    node.__raf = requestAnimationFrame(() => { node.__raf = null; node.setDirtyCanvas(true, true); });
}
// 0..1 eased toward target, keyed per (obj, key). recaptures from-current when the target flips, so
// reversing mid-flight never jumps
const tweens = new WeakMap();
function curve(a) {
    const t = (performance.now() - a.t0) / a.ms;
    return t >= 1 ? a.target : a.from + (a.target - a.from) * ease(t);
}
function anim(node, obj, key, target, ms) {
    let m = tweens.get(obj); if (!m) tweens.set(obj, m = {});
    let a = m[key];
    if (!a) { m[key] = { from: target, target, t0: 0, ms }; return target; }
    if (a.target !== target) m[key] = a = { from: curve(a), target, t0: performance.now(), ms };
    const v = curve(a);
    if (v !== target) keepAnimating(node);
    return v;
}
// keyed by glyph center - it redraws identical every frame, so the pressed control finds itself
function tap(node, cx, cy) {
    const p = node.__tap;
    if (!p) return 1;
    const t = (performance.now() - p.t0) / TAP_MS;
    if (t >= 1) { node.__tap = null; return 1; }
    if (Math.abs(p.x - cx) > 3 || Math.abs(p.y - cy) > 3) return 1;
    keepAnimating(node);
    return 1 - Math.sin(Math.PI * t) * 0.06;
}
function scaled(ctx, s, cx, cy, fn) {
    if (s === 1) return fn();
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); fn(); ctx.restore();
}

// --- tiny canvas glyphs (we own every pixel here) ---
function grad(ctx, x, y, w, h, a, b) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, a); g.addColorStop(1, b);
    return g;
}
function drawSwitch(ctx, node, obj, x, mid, on) {
    const SW = 24, SH = 13, p = anim(node, obj, "sw", on ? 1 : 0, SLIDE_MS);
    ctx.beginPath(); ctx.roundRect(x, mid - SH / 2, SW, SH, SH / 2);
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fill();
    if (p > 0) {
        ctx.save(); ctx.globalAlpha = p;
        ctx.beginPath(); ctx.roundRect(x, mid - SH / 2, SW, SH, SH / 2);
        ctx.fillStyle = grad(ctx, x, mid - SH / 2, SW, SH, C.accent, "#ff8f5c"); ctx.fill();
        ctx.restore();
    }
    ctx.beginPath(); ctx.arc(x + SH / 2 + p * (SW - SH), mid, SH / 2 - 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
}
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
function drawGrip(ctx, x, mid, col) {
    ctx.fillStyle = col;
    for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) {
        ctx.beginPath(); ctx.arc(x + c * 4, mid - 4 + r * 4, 1.1, 0, Math.PI * 2); ctx.fill();
    }
}
function inZone(hx, hy, x0, y0, x1, y1) {
    return hx >= x0 && hx <= x1 && hy >= y0 && hy <= y1;
}
function drawHole(ctx, width, top, h) {
    ctx.save();
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath(); ctx.roundRect(M, top, width - 2 * M, h, 12); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
}
function drawDropLine(ctx, width, y) {
    if (y == null) return;
    const x0 = M + 4, x1 = width - M - 4;
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, "rgba(255,107,92,0)"); g.addColorStop(0.5, C.accent); g.addColorStop(1, "rgba(255,107,92,0)");
    ctx.save();
    ctx.shadowColor = C.accent; ctx.shadowBlur = 10;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x0, y - 1.25, x1 - x0, 2.5, 2); ctx.fill();
    ctx.restore();
}
// first slot whose midpoint sits below the pointer wins the drop; else it lands last
function computeDrop(node, d) {
    const rows = node.__rows || [];
    let before = null, lineY = null;
    for (const r of rows) {
        if (r.slot === d.slot) continue;
        if (d.curY < r.top + r.h / 2) { before = r.slot; lineY = r.top - GAP / 2; break; }
    }
    if (lineY === null && rows.length) { const last = rows[rows.length - 1]; lineY = last.top + last.h + GAP / 2; }
    d.before = before; d.lineY = lineY;
}
function drawIco(ctx, node, cx, mid, o) {
    scaled(ctx, tap(node, cx, mid), cx, mid, () => {
        if (o.hot) {
            const b = o.box ?? 22;
            ctx.beginPath(); ctx.roundRect(cx - b / 2, mid - b / 2, b, b, b <= 18 ? 6 : 7);
            ctx.fillStyle = o.danger ? "rgba(255,107,92,0.14)" : "rgba(255,255,255,0.09)"; ctx.fill();
        }
        ctx.save();
        ctx.globalAlpha = o.hot ? 1 : o.a;
        ctx.strokeStyle = o.hot ? (o.danger ? "#ff8f7e" : C.txt) : C.dim;
        ctx.lineWidth = 1.4;
        if (o.kind === "x") {
            if (o.rot) { ctx.translate(cx, mid); ctx.rotate(o.rot * Math.PI / 2); ctx.translate(-cx, -mid); }
            ctx.beginPath(); ctx.moveTo(cx - 3.5, mid - 3.5); ctx.lineTo(cx + 3.5, mid + 3.5); ctx.moveTo(cx + 3.5, mid - 3.5); ctx.lineTo(cx - 3.5, mid + 3.5); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(cx - 4, mid); ctx.lineTo(cx + 4, mid); ctx.moveTo(cx, mid - 4); ctx.lineTo(cx, mid + 4); ctx.stroke();
        }
        ctx.restore();
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
        zones.push({ x0: hxp - 4, y0: cy + 2, x1: hxp + 12, y1: cy + HEAD_H - 2, drag: slot });
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

function drawAdd(ctx, node, width, cy, zones, hx, hy) {
    const x0 = M, x1 = width - M, h = ADD_H - 6, y = cy + 2;
    const hover = hy >= cy && hy < cy + ADD_H && hx >= x0 && hx <= x1;
    const cx = (x0 + x1) / 2, mid = cy + ADD_H / 2;
    scaled(ctx, tap(node, cx, mid), cx, mid, () => {
        ctx.beginPath(); ctx.roundRect(x0, y, x1 - x0, h, h / 2);
        ctx.fillStyle = hover ? "rgba(255,107,92,0.10)" : "rgba(255,255,255,0.04)"; ctx.fill();
        ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
        ctx.strokeStyle = hover ? "rgba(255,107,92,0.4)" : "rgba(255,255,255,0.18)"; ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = hover ? "#ffd0c8" : C.txt; ctx.font = "600 13px 'Hanken Grotesk', Arial";
        ctx.fillText("＋  Add", cx, y + h / 2);
    });
    zones.push({ x0, y0: cy, x1, y1: cy + ADD_H, fn: (e) => addMenu(node, e) });
}

function drawBody(ctx, node, width, y0, w) {
    const A = node.__a;
    const zones = [];
    const d = node.__drag;
    const hov = (node.__hover && !d) ? node.__hover : null, hx = hov ? hov[0] : -1, hy = hov ? hov[1] : -1;
    ctx.save();
    let cy = y0 + TOP;
    cy = drawCard(ctx, node, { kind: "main" }, width, cy, zones, hx, hy) + GAP;
    const rows = [];
    A.slots.forEach((s, i) => {
        const top = cy, h = cardHeight(s.loras);
        if (d && d.slot === s) { drawHole(ctx, width, top, h); cy = top + h; }
        else cy = drawCard(ctx, node, { kind: "slot", slot: s, i }, width, top, zones, hx, hy);
        rows.push({ slot: s, i, top, h: cy - top });
        cy += GAP;
    });
    node.__rows = rows;
    drawAdd(ctx, node, width, cy, zones, hx, hy);
    if (d) {
        computeDrop(node, d);
        drawDropLine(ctx, width, d.lineY);
        const home = rows.find((r) => r.slot === d.slot);
        if (home) {
            ctx.save(); ctx.translate(0, d.curY - d.grabY);
            drawCard(ctx, node, { kind: "slot", slot: d.slot, i: home.i }, width, home.top, [], -1, -1, true);
            ctx.restore();
        }
    }
    ctx.restore();
    w.__zones = zones;
}

function applyDrop(node, d) {
    const slots = node.__a.slots;
    const i = slots.indexOf(d.slot);
    if (i < 0) return;
    computeDrop(node, d);
    slots.splice(i, 1);
    if (d.before && d.before !== d.slot) {
        const j = slots.indexOf(d.before);
        slots.splice(j < 0 ? slots.length : j, 0, d.slot);
    } else slots.push(d.slot);
}

function bodyMouse(e, pos, node, w) {
    const x = pos[0], y = pos[1], t = e.type;
    const d = node.__drag;
    if (d) {
        // litegraph keeps routing move/up here only because the grip's down returned true
        if (t === "pointermove" || t === "mousemove") { d.curY = y; node.setDirtyCanvas(true, true); return true; }
        if (t === "pointerup" || t === "mouseup") { d.curY = y; applyDrop(node, d); node.__drag = null; commit(node); return true; }
        return true;
    }
    if (t !== "pointerdown" && t !== "mousedown") return;
    const zs = w.__zones;
    if (!zs) return false;
    for (let i = zs.length - 1; i >= 0; i--) {
        const z = zs[i];
        if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) {
            if (z.drag !== undefined) { node.__drag = { slot: z.drag, grabY: y, curY: y, before: null, lineY: null }; keepAnimating(node); return true; }
            node.__tap = { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2, t0: performance.now() };
            keepAnimating(node);
            z.fn(e);
            return true;
        }
    }
    return false; // empty space falls through so the node still drags by its body
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
    w.mouse = (e, pos, n) => bodyMouse(e, pos, n, w);
    return w;
}

function mount(node) {
    installGlass();
    hide(node.widgets?.find((w) => w.name === STATE));
    hide(node.widgets?.find((w) => w.name === MAINCKPT));
    loraList();
    vaeList();
    node.__a = parseState(node.widgets?.find((w) => w.name === STATE)?.value);
    if (!bodyOf(node)) node.widgets.push(bodyWidget(node));
    node.onMouseMove = function (e, pos) { this.__hover = pos; this.setDirtyCanvas(true); };
    node.onMouseLeave = function () { this.__hover = null; this.setDirtyCanvas(true); };
    resize(node);
}

app.registerExtension({
    name: "atelier.hub",
    async nodeCreated(node) {
        if (node.comfyClass !== HUB_CLASS) return;
        mount(node);
    },
    async loadedGraphNode(node) {
        if (node.comfyClass !== HUB_CLASS) return;
        mount(node);
    },
});
