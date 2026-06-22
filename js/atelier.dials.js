import { app } from "../../scripts/app.js";
import {
    C, registerGlass, M, GAP, HEAD_H,
    fit, inZone,
    cardShell, drawSwitch, drawKnob, drawIco, hide, bodyMouse,
} from "./atelier.glass.js";

const CLASS = "AtelierDials";
const STATE = "dials";   // the json blob the backend reads - single source of truth
const TOP = 6, SEED_H = 28, GAPV = 6, KNOB_BAND = 66, PICK_H = 28, PADB = 8, KNOB_R = 22;
const CARD_W = 264, ADD_W = 40;   // passes lay side by side, fixed width; node grows wide, not tall
const cardH = HEAD_H + SEED_H + GAPV + KNOB_BAND + GAPV + PICK_H + GAPV + PICK_H + PADB;
const SCRUB_PX = 180; // vertical drag distance that sweeps a knob's whole range

// a seed of -1 means "roll fresh every gen"; any concrete value is fixed. resolved at queue-time so
// the saved metadata never shows the sentinel where a real number sampled
const RANDOM = -1;
const RAND_MAX = 1125899906842624; // 2^50 - past comfy's safe int but inside js's
const randSeed = () => Math.floor(Math.random() * RAND_MAX);

const KNOBS = [
    { key: "steps", label: "STEPS", min: 1, max: 100, step: 1, fmt: (v) => String(Math.round(v)) },
    { key: "cfg", label: "CFG", min: 0, max: 30, step: 0.5, fmt: (v) => v.toFixed(1) },
    { key: "denoise", label: "DENOISE", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
];

let _opts = null;
function loadOptions() {
    if (!_opts) _opts = fetch("/atelier/samplers").then((r) => r.json()).catch(() => ({ samplers: [], schedulers: [] }));
    return _opts;
}

function num(v, def, lo, hi) { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; }
function cleanSeed(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : RANDOM; }
function cleanCard(c) {
    return {
        label: typeof c?.label === "string" ? c.label : "",
        steps: Math.round(num(c?.steps, 20, 1, 100)),
        cfg: num(c?.cfg, 8, 0, 30),
        denoise: num(c?.denoise, 1, 0, 1),
        sampler_name: typeof c?.sampler_name === "string" ? c.sampler_name : "euler",
        scheduler: typeof c?.scheduler === "string" ? c.scheduler : "normal",
        seed: cleanSeed(c?.seed),
    };
}
function parseState(raw) {
    if (!raw) return { cards: [cleanCard()] };
    let d; try { d = JSON.parse(raw); } catch { return { cards: [cleanCard()] }; }
    const cards = (d.cards ?? []).map(cleanCard);
    return { cards: cards.length ? cards : [cleanCard()] };
}
function nodeWidth(node) {
    const n = node.__a?.cards?.length || 1;
    return M + n * (CARD_W + GAP) + ADD_W + M;
}
function sync(node) {
    const w = node.widgets?.find((w) => w.name === STATE);
    if (w) w.value = JSON.stringify({ cards: node.__a.cards });
}
// litegraph's computeSize derives width from the title, not our widget - so drive width ourselves
function fitNode(node) { node.setSize([nodeWidth(node), node.computeSize()[1]]); }
function commit(node) { sync(node); fitNode(node); node.setDirtyCanvas(true, true); }

function drawPill(ctx, x, y, w, h, label, value, hot) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8);
    ctx.fillStyle = hot ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.22)"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = hot ? "rgba(255,255,255,0.18)" : C.stroke; ctx.stroke();
    const mid = y + h / 2; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = "600 9px 'Hanken Grotesk', Arial"; ctx.fillStyle = C.dim;
    ctx.fillText(label, x + 9, mid);
    const lw = ctx.measureText(label).width;
    ctx.font = "600 11.5px 'Hanken Grotesk', Arial"; ctx.fillStyle = C.txt;
    ctx.fillText(fit(ctx, value, w - 24 - lw - 6), x + 9 + lw + 6, mid);
    ctx.strokeStyle = hot ? C.txt : C.dim; ctx.lineWidth = 1.3;
    const chx = x + w - 11;
    ctx.beginPath(); ctx.moveTo(chx - 4, mid - 2); ctx.lineTo(chx, mid + 2); ctx.lineTo(chx + 4, mid - 2); ctx.stroke();
}

function drawCard(ctx, node, card, i, x, y, zones, knobs, hx, hy) {
    const x0 = x, x1 = x + CARD_W, h = cardH;
    const hover = inZone(hx, hy, x0, y, x1, y + h);
    const { cl, cr, headMid } = cardShell(ctx, node, { x0, x1, cy: y, h, hover, floating: false, accent: C.lilac });
    ctx.textBaseline = "middle";
    const isRandom = card.seed === RANDOM, ww = cr - cl;

    const labelText = card.label || `PASS ${i + 1}`;
    ctx.font = "600 10px 'Hanken Grotesk', Arial"; ctx.textAlign = "left";
    ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = card.label ? C.txt : C.lilac;
    const shownLabel = fit(ctx, labelText, ww - 28);
    ctx.fillText(shownLabel, cl, headMid); ctx.restore();
    zones.push({ x0: cl, y0: y, x1: cl + ctx.measureText(shownLabel).width + 6, y1: y + HEAD_H, fn: (e) => renameCard(node, card, e) });
    if (node.__a.cards.length > 1) {
        const xx = cr - 9, xHot = inZone(hx, hy, xx - 10, y + 2, cr, y + HEAD_H - 2);
        drawIco(ctx, node, xx, headMid, { a: hover ? 0.5 : 0, hot: xHot, kind: "x", danger: true });
        zones.push({ x0: xx - 10, y0: y + 2, x1: cr, y1: y + HEAD_H - 2, fn: () => removeCard(node, card) });
    }

    const wy = y + HEAD_H, wh = SEED_H, wmid = wy + wh / 2;
    ctx.beginPath(); ctx.roundRect(cl, wy, ww, wh, 9);
    ctx.fillStyle = "rgba(0,0,0,0.26)"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = C.stroke; ctx.stroke();
    const sw = cl + ww - 24;
    ctx.font = "600 9px 'Hanken Grotesk', Arial"; ctx.textAlign = "right"; ctx.fillStyle = isRandom ? C.lilac : C.dim;
    ctx.fillText("random", sw - 8, wmid);
    drawSwitch(ctx, node, card, sw, wmid, isRandom);
    zones.push({ x0: sw - 56, y0: wy, x1: cl + ww, y1: wy + wh, fn: () => toggleMode(node, card, i) });
    ctx.font = "600 10px 'Hanken Grotesk', Arial"; ctx.fillStyle = C.dim; ctx.textAlign = "left";
    ctx.fillText("SEED", cl + 10, wmid);
    const last = node.__lastSeeds?.[i], known = typeof last === "number" && last >= 0;
    const shownSeed = isRandom ? (known ? String(last) : "rolls on queue") : String(card.seed);
    ctx.font = "500 12px 'Hanken Grotesk', Arial"; ctx.fillStyle = isRandom ? C.dim : C.txt; ctx.textAlign = "left";
    ctx.fillText(fit(ctx, shownSeed, sw - 58 - (cl + 50)), cl + 50, wmid);
    zones.push({ x0: cl, y0: wy, x1: sw - 58, y1: wy + wh, fn: (e) => typeSeed(node, card, e) });

    const bandTop = wy + wh + GAPV, ky = bandTop + 8 + KNOB_R, colW = ww / KNOBS.length;
    KNOBS.forEach((k, j) => {
        const kx = cl + colW * (j + 0.5);
        const hot = Math.hypot(hx - kx, hy - ky) <= KNOB_R + 8;
        const s = node.__scrub;
        drawKnob(ctx, kx, ky, KNOB_R, { value: card[k.key], min: k.min, max: k.max, label: k.label, fmt: k.fmt, hot, active: s?.card === card && s.cfg.key === k.key });
        knobs.push({ card, cfg: k, cx: kx, cy: ky });
    });

    const py = bandTop + KNOB_BAND + GAPV;
    const sHot = inZone(hx, hy, cl, py, cl + ww, py + PICK_H);
    drawPill(ctx, cl, py, ww, PICK_H, "sampler", card.sampler_name, sHot);
    zones.push({ x0: cl, y0: py, x1: cl + ww, y1: py + PICK_H, fn: (e) => pickMenu(node, card, "sampler_name", e) });
    const py2 = py + PICK_H + GAPV;
    const cHot = inZone(hx, hy, cl, py2, cl + ww, py2 + PICK_H);
    drawPill(ctx, cl, py2, ww, PICK_H, "scheduler", card.scheduler, cHot);
    zones.push({ x0: cl, y0: py2, x1: cl + ww, y1: py2 + PICK_H, fn: (e) => pickMenu(node, card, "scheduler", e) });
}

function drawAddCol(ctx, node, x, y, zones, hx, hy) {
    const w = ADD_W, h = cardH, hot = inZone(hx, hy, x, y, x + w, y + h);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12);
    ctx.fillStyle = hot ? "rgba(255,107,92,0.10)" : "rgba(255,255,255,0.04)"; ctx.fill();
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.strokeStyle = hot ? "rgba(255,107,92,0.4)" : "rgba(255,255,255,0.18)"; ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = hot ? "#ffd0c8" : C.txt; ctx.font = "600 20px 'Hanken Grotesk', Arial";
    ctx.fillText("＋", x + w / 2, y + h / 2 - 7);
    ctx.fillStyle = hot ? "#ffd0c8" : C.dim; ctx.font = "600 9px 'Hanken Grotesk', Arial";
    ctx.fillText("pass", x + w / 2, y + h / 2 + 12);
    zones.push({ x0: x, y0: y, x1: x + w, y1: y + h, fn: () => addCard(node) });
}

function drawBody(ctx, node, width, y0, w) {
    const zones = [], knobs = [];
    const hov = node.__hover, hx = hov ? hov[0] : -1, hy = hov ? hov[1] : -1;
    ctx.save();
    const y = y0 + TOP;
    let x = M;
    node.__a.cards.forEach((card, i) => { drawCard(ctx, node, card, i, x, y, zones, knobs, hx, hy); x += CARD_W + GAP; });
    drawAddCol(ctx, node, x, y, zones, hx, hy);
    ctx.restore();
    w.__zones = zones; w.__knobs = knobs;
}

function addCard(node) { node.__a.cards.push(cleanCard()); commit(node); }
function removeCard(node, card) {
    const i = node.__a.cards.indexOf(card);
    if (i >= 0 && node.__a.cards.length > 1) { node.__a.cards.splice(i, 1); node.__lastSeeds?.splice(i, 1); commit(node); }
}
function renameCard(node, card, event) {
    app.canvas.prompt("Pass label", card.label || "", (v) => { card.label = (v || "").trim(); commit(node); }, event);
}
function toggleMode(node, card, i) {
    if (card.seed === RANDOM) {
        // flipping to fixed locks the last roll - the whole point. nothing run yet? pin a fresh number
        const last = node.__lastSeeds?.[i];
        card.seed = (typeof last === "number" && last >= 0) ? last : randSeed();
    } else card.seed = RANDOM;
    commit(node);
}
function typeSeed(node, card, event) {
    app.canvas.prompt("Seed", card.seed === RANDOM ? "" : String(card.seed), (v) => {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n >= 0) { card.seed = n; commit(node); }
    }, event);
}
function typeKnob(node, kb, event) {
    const k = kb.cfg;
    app.canvas.prompt(k.label, k.fmt(kb.card[k.key]), (v) => {
        let n = parseFloat(v);
        if (!Number.isFinite(n)) return;
        n = Math.max(k.min, Math.min(k.max, n));
        kb.card[k.key] = k.step >= 1 ? Math.round(n) : n;
        commit(node);
    }, event);
}
async function pickMenu(node, card, key, event) {
    const o = await loadOptions();
    const list = (key === "sampler_name" ? o.samplers : o.schedulers) ?? [];
    const items = list.map((name) => ({ content: name, callback: () => { card[key] = name; commit(node); } }));
    new LiteGraph.ContextMenu(items, { event, className: "dark", title: key === "sampler_name" ? "sampler" : "scheduler" });
}

// knob drag is its own thing (vertical scrub), so it pre-empts bodyMouse; everything else falls through
function dialsMouse(e, pos, node, w) {
    const x = pos[0], y = pos[1], t = e.type;
    const s = node.__scrub;
    if (s) {
        if (t === "pointermove" || t === "mousemove") {
            const k = s.cfg, dy = s.startY - y;
            let v = s.startVal + (dy / SCRUB_PX) * (k.max - k.min);
            v = Math.max(k.min, Math.min(k.max, Math.round(v / k.step) * k.step));
            if (Math.abs(dy) > 2) s.moved = true;
            if (s.card[k.key] !== v) { s.card[k.key] = v; commit(node); }
            return true;
        }
        if (t === "pointerup" || t === "mouseup") {
            if (!s.moved) typeKnob(node, s, e); // a tap, not a turn -> type the number
            node.__scrub = null; node.setDirtyCanvas(true, true); return true;
        }
        return true;
    }
    if (t === "pointerdown" || t === "mousedown") {
        for (const kb of w.__knobs ?? []) {
            if (Math.hypot(x - kb.cx, y - kb.cy) <= KNOB_R + 8) {
                node.__scrub = { card: kb.card, cfg: kb.cfg, startY: y, startVal: kb.card[kb.cfg.key], moved: false };
                node.setDirtyCanvas(true, true);
                return true;
            }
        }
    }
    return bodyMouse(e, pos, node, w, commit);
}

// --- queue-time resolution: swap each random sentinel for a concrete seed in the prompt before it
// ships, writing the real number into both the server payload and the saved workflow so metadata
// never lies. ※ wraps graphToPrompt, which also fires on plain export - the way up is a queue-only
// hook (rgthree's own event) when the export quirk starts to matter.
let _hijacked = false;
function installHijack() {
    if (_hijacked || !app.graphToPrompt) return;
    _hijacked = true;
    const orig = app.graphToPrompt;
    app.graphToPrompt = async function (...args) {
        const res = await orig.apply(this, args);
        try { resolveAll(res); } catch (e) { console.error("[atelier] dials seed resolve failed", e); }
        return res;
    };
}
function resolveSeed(raw) {
    const v = Number(raw);
    if (v === RANDOM || !Number.isFinite(v) || v < 0) return randSeed();
    return Math.floor(v);
}
function resolveNode(node, res) {
    const live = node.widgets?.find((w) => w.name === STATE)?.value;
    if (live == null) return;
    let data; try { data = JSON.parse(live); } catch { return; }
    if (!node.__lastSeeds) node.__lastSeeds = [];
    // data is a fresh parse, not node.__a - so the live card keeps its sentinel and rolls again next gen
    (data.cards ?? []).forEach((c, i) => { const used = resolveSeed(c.seed); node.__lastSeeds[i] = used; c.seed = used; });
    const resolved = JSON.stringify(data);
    const out = res.output?.[node.id];
    if (out?.inputs && STATE in out.inputs) out.inputs[STATE] = resolved;
    const wf = res.workflow?.nodes?.find((n) => n.id === node.id);
    if (wf?.widgets_values) {
        const idx = wf.widgets_values.indexOf(live);
        if (idx >= 0) wf.widgets_values[idx] = resolved;
    }
    node.setDirtyCanvas(true, true);
}
function resolveAll(res) {
    for (const node of app.graph?._nodes ?? []) if (node.comfyClass === CLASS) resolveNode(node, res);
}

function bodyOf(node) { return node.widgets?.find((w) => w.name === "__atelier_body"); }
function bodyWidget(node) {
    const w = { name: "__atelier_body", type: "custom", serialize: false };
    w.computeSize = () => [nodeWidth(node), TOP + cardH + TOP];
    w.draw = (ctx, n, width, y) => drawBody(ctx, n, width, y, w);
    w.mouse = (e, pos, n) => dialsMouse(e, pos, n, w);
    return w;
}

function mount(node) {
    registerGlass(CLASS);
    installHijack();
    hide(node.widgets?.find((w) => w.name === STATE));
    node.__a = parseState(node.widgets?.find((w) => w.name === STATE)?.value);
    node.__lastSeeds = [];
    if (!bodyOf(node)) node.widgets.push(bodyWidget(node));
    node.onMouseMove = function (e, pos) { this.__hover = pos; this.setDirtyCanvas(true); };
    node.onMouseLeave = function () { this.__hover = null; this.setDirtyCanvas(true); };
    fitNode(node);
}

app.registerExtension({
    name: "atelier.dials",
    async nodeCreated(node) { if (node.comfyClass === CLASS) mount(node); },
    async loadedGraphNode(node) { if (node.comfyClass === CLASS) mount(node); },
});
