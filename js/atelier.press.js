import { app } from "../../scripts/app.js";
import {
    C, registerGlass, drawSwitch, drawGauge, drawPill,
    fit, inZone, hide, bodyMouse, resize,
} from "./atelier.glass.js";

const CLASS = "AtelierPress";
const BODY_W = 252, PADX = 12, TOP = 8, PADB = 11;
const WELL_H = 26, GAPV = 7, DIVH = 14, SEC_H = 18, GAUGE_H = 28, PILL_H = 28;
const bodyH = TOP + WELL_H + GAPV + WELL_H + DIVH + SEC_H + GAUGE_H + GAPV + WELL_H + GAPV + PILL_H + PADB;
const S_MAX = 1;   // variation_strength ceiling, 0 = off

const getW = (node, name) => node.widgets?.find((w) => w.name === name);
function setW(node, name, v) { const w = getW(node, name); if (w) { w.value = v; w.callback?.(v); } node.setDirtyCanvas(true, true); }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const intStr = (v) => String(Math.round(Number(v) || 0));

function well(ctx, x, y, w, hot) {
    ctx.beginPath(); ctx.roundRect(x, y, w, WELL_H, 9);
    ctx.fillStyle = hot ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.26)"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = hot ? "rgba(255,255,255,0.16)" : C.stroke; ctx.stroke();
}

function drawChev(ctx, cx, mid, dir, hot) {
    if (hot) {
        ctx.beginPath(); ctx.roundRect(cx - 9, mid - 9, 18, 18, 6);
        ctx.fillStyle = "rgba(255,255,255,0.09)"; ctx.fill();
    }
    ctx.save();
    ctx.strokeStyle = hot ? C.txt : C.dim; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const d = 3, h = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - dir * d, mid - h); ctx.lineTo(cx + dir * d, mid); ctx.lineTo(cx - dir * d, mid + h);
    ctx.stroke();
    ctx.restore();
}

function stepSlot(node, delta) {
    const cur = Math.round(Number(getW(node, "slot")?.value) || 0);
    setW(node, "slot", clamp(cur + delta, 0, 63));
}

function drawBody(ctx, node, width, y0, w) {
    const zones = [];
    const hov = node.__hover, hx = hov ? hov[0] : -1, hy = hov ? hov[1] : -1;
    const x = PADX, ww = (node.size?.[0] ?? BODY_W) - PADX * 2;
    let y = y0 + TOP;
    ctx.textBaseline = "middle";

    // slot - which roster pass this press renders. < > to step, tap the number to type
    let hot = inZone(hx, hy, x, y, x + ww, y + WELL_H), mid = y + WELL_H / 2;
    well(ctx, x, y, ww, hot);
    ctx.font = "600 10px 'Hanken Grotesk', Arial"; ctx.textAlign = "left"; ctx.fillStyle = C.dim;
    ctx.fillText("SLOT", x + 11, mid);
    ctx.font = "600 8.5px 'Hanken Grotesk', Arial"; ctx.fillStyle = "rgba(154,147,180,0.6)";
    ctx.fillText("0 = hub", x + 44, mid);
    const chL = x + ww - 64, chR = x + ww - 16, valCx = x + ww - 40;
    const lHot = inZone(hx, hy, chL - 11, y, chL + 11, y + WELL_H);
    const rHot = inZone(hx, hy, chR - 11, y, chR + 11, y + WELL_H);
    drawChev(ctx, chL, mid, -1, lHot);
    drawChev(ctx, chR, mid, 1, rHot);
    ctx.font = "500 12px 'Hanken Grotesk', Arial"; ctx.fillStyle = C.txt; ctx.textAlign = "center";
    ctx.fillText(intStr(getW(node, "slot")?.value), valCx, mid);
    zones.push({ x0: x, y0: y, x1: x + ww, y1: y + WELL_H, fn: (e) => typeNum(node, "slot", 0, 63, true, "slot", e) });
    zones.push({ x0: chL - 11, y0: y, x1: chL + 11, y1: y + WELL_H, fn: () => stepSlot(node, -1) });
    zones.push({ x0: chR - 11, y0: y, x1: chR + 11, y1: y + WELL_H, fn: () => stepSlot(node, 1) });
    y += WELL_H + GAPV;

    // free vram first - the evict toggle
    hot = inZone(hx, hy, x, y, x + ww, y + WELL_H), mid = y + WELL_H / 2;
    well(ctx, x, y, ww, hot);
    const vram = !!getW(node, "free_vram_first")?.value;
    ctx.font = "600 10px 'Hanken Grotesk', Arial"; ctx.textAlign = "left"; ctx.fillStyle = C.dim;
    ctx.fillText("free vram first", x + 11, mid);
    drawSwitch(ctx, node, getW(node, "free_vram_first"), x + ww - 35, mid, vram);
    zones.push({ x0: x, y0: y, x1: x + ww, y1: y + WELL_H, fn: () => setW(node, "free_vram_first", !vram) });
    y += WELL_H;

    // divider, then the variation group
    ctx.beginPath(); ctx.moveTo(x + 4, y + DIVH / 2); ctx.lineTo(x + ww - 4, y + DIVH / 2);
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1; ctx.stroke();
    y += DIVH;

    ctx.font = "700 9px 'Hanken Grotesk', Arial"; ctx.textAlign = "left"; ctx.fillStyle = C.lilac;
    ctx.fillText("VARIATION", x + 2, y + SEC_H / 2);
    y += SEC_H;

    // strength - the horizontal gauge: drag to slide, tap to type
    hot = inZone(hx, hy, x, y, x + ww, y + GAUGE_H);
    drawGauge(ctx, x, y, ww, {
        value: Number(getW(node, "variation_strength")?.value) || 0, min: 0, max: S_MAX,
        label: "STRENGTH", fmt: (v) => v.toFixed(2), hot, active: !!node.__scrub,
    });
    node.__gauge = { x, y, w: ww, h: GAUGE_H };   // the scrub in pressMouse owns it, no zone needed
    y += GAUGE_H + GAPV;

    // variation seed - plain int, no random sentinel (the per-pass seed lives in the dials)
    hot = inZone(hx, hy, x, y, x + ww, y + WELL_H), mid = y + WELL_H / 2;
    well(ctx, x, y, ww, hot);
    ctx.font = "600 10px 'Hanken Grotesk', Arial"; ctx.textAlign = "left"; ctx.fillStyle = C.dim;
    ctx.fillText("SEED", x + 11, mid);
    ctx.font = "500 12px 'Hanken Grotesk', Arial"; ctx.fillStyle = C.txt; ctx.textAlign = "right";
    ctx.fillText(fit(ctx, intStr(getW(node, "variation_seed")?.value), ww - 64), x + ww - 11, mid);
    zones.push({ x0: x, y0: y, x1: x + ww, y1: y + WELL_H, fn: (e) => typeNum(node, "variation_seed", 0, Number.MAX_SAFE_INTEGER, true, "variation seed", e) });
    y += WELL_H + GAPV;

    // method - linear or slerp
    hot = inZone(hx, hy, x, y, x + ww, y + PILL_H);
    drawPill(ctx, x, y, ww, PILL_H, "method", String(getW(node, "variation_method")?.value || "linear"), hot);
    zones.push({ x0: x, y0: y, x1: x + ww, y1: y + PILL_H, fn: (e) => pickMethod(node, e) });

    w.__zones = zones;
}

function typeNum(node, name, lo, hi, isInt, title, event) {
    const cur = getW(node, name)?.value;
    app.canvas.prompt(title, isInt ? intStr(cur) : String(Number(cur) || 0), (val) => {
        let n = isInt ? parseInt(val, 10) : parseFloat(val);
        if (Number.isFinite(n)) setW(node, name, clamp(n, lo, hi));
    }, event);
}
function pickMethod(node, event) {
    const items = ["linear", "slerp"].map((m) => ({ content: m, callback: () => setW(node, "variation_method", m) }));
    new LiteGraph.ContextMenu(items, { event, className: "dark", title: "method" });
}

// the gauge drag is absolute (the fill follows the cursor), so it pre-empts bodyMouse; a press that
// never moves falls through to type the value, same deal as the dials' knobs
function pressMouse(e, pos, node, w) {
    const x = pos[0], y = pos[1], t = e.type, s = node.__scrub;
    if (s) {
        if (t === "pointermove" || t === "mousemove") {
            const g = s.g, f = clamp((x - g.x) / g.w, 0, 1);
            const v = Math.round((f * S_MAX) / 0.01) * 0.01;
            if (Math.abs(x - s.startX) > 2) s.moved = true;
            setW(node, "variation_strength", v);
            return true;
        }
        if (t === "pointerup" || t === "mouseup") {
            if (!s.moved) typeNum(node, "variation_strength", 0, S_MAX, false, "strength", e);
            node.__scrub = null; node.setDirtyCanvas(true, true); return true;
        }
        return true;
    }
    if (t === "pointerdown" || t === "mousedown") {
        const g = node.__gauge;
        if (g && inZone(x, y, g.x, g.y, g.x + g.w, g.y + g.h)) {
            node.__scrub = { g, startX: x, moved: false }; node.setDirtyCanvas(true, true); return true;
        }
    }
    return bodyMouse(e, pos, node, w, () => node.setDirtyCanvas(true, true));
}

function bodyOf(node) { return node.widgets?.find((w) => w.name === "__atelier_body"); }
function bodyWidget(node) {
    const w = { name: "__atelier_body", type: "custom", serialize: false };
    w.computeSize = () => [BODY_W, bodyH];
    w.draw = (ctx, n, width, y) => drawBody(ctx, n, width, y, w);
    w.mouse = (e, pos, n) => pressMouse(e, pos, n, w);
    return w;
}

function mount(node) {
    registerGlass(CLASS);
    for (const name of ["slot", "free_vram_first", "variation_seed", "variation_strength", "variation_method"]) hide(getW(node, name));
    if (!bodyOf(node)) node.widgets.push(bodyWidget(node));
    node.onMouseMove = function (e, pos) { this.__hover = pos; this.setDirtyCanvas(true); };
    node.onMouseLeave = function () { this.__hover = null; this.setDirtyCanvas(true); };
    resize(node);
}

app.registerExtension({
    name: "atelier.press",
    async nodeCreated(node) { if (node.comfyClass === CLASS) mount(node); },
    async loadedGraphNode(node) { if (node.comfyClass === CLASS) mount(node); },
});
