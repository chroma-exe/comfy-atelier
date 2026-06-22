import { app } from "../../scripts/app.js";
import {
    C, registerGlass, M, GAP, HEAD_H, ADD_H, DIV_H,
    anim, tap, scaled, fit, inZone,
    drawSwitch, drawGrip, drawIco, cardShell,
    drawHole, drawDropLine, computeDrop, drawDivider, drawAdd,
    resize, hide, bodyMouse,
} from "./atelier.glass.js";

const CLASS = "AtelierSwatches";
const STATE = "cards";   // the json blob the backend reads - single source of truth
const TOP = 6, TXT_DEFAULT = 40, TXT_MIN = 30, PADB = 8, LBL_H = 17, EMPTY_H = 22;
const MARK_W = 48, COMMA_W = 22;

function thH(v) { return typeof v === "number" && v >= TXT_MIN ? v : TXT_DEFAULT; }
function cardH(card) { return HEAD_H + thH(card.th) + PADB; }
function zoneH(cards) {
    if (!cards.length) return LBL_H + EMPTY_H;
    let h = LBL_H;
    for (const c of cards) h += cardH(c) + GAP;
    return h;
}
function bodyHeight(node) {
    const A = node.__a;
    if (!A) return HEAD_H;
    return TOP + zoneH(A.pos) + DIV_H + zoneH(A.neg) + ADD_H;
}

function cleanCards(arr) {
    return (arr ?? []).filter((c) => c && (c.kind === "prepend" || c.kind === "append")).map((c) => ({
        kind: c.kind, label: c.label ?? "", text: c.text ?? "", comma: c.comma !== false, on: c.on !== false, th: thH(c.th),
    }));
}
function parseState(raw) {
    if (!raw) return { pos: [], neg: [] };
    let d;
    try { d = JSON.parse(raw); } catch { return { pos: [], neg: [] }; }
    return { pos: cleanCards(d.pos), neg: cleanCards(d.neg) };
}
function sync(node) {
    const w = node.widgets?.find((w) => w.name === STATE);
    if (w) w.value = JSON.stringify({ pos: node.__a.pos, neg: node.__a.neg });
}
function commit(node) {
    sync(node);
    resize(node);
    syncOverlays(node);
    node.setDirtyCanvas(true, true);
}

// --- the two swatch-only glyphs (everything else comes from the canon) ---
function drawComma(ctx, node, x, mid, on) {
    const cx = x + COMMA_W / 2, FH = 15;
    scaled(ctx, tap(node, cx, mid), cx, mid, () => {
        ctx.beginPath(); ctx.roundRect(x, mid - FH / 2, COMMA_W, FH, 5);
        if (on) { ctx.fillStyle = C.accent; ctx.fill(); }
        else { ctx.lineWidth = 1; ctx.strokeStyle = C.stroke; ctx.stroke(); }
        ctx.fillStyle = on ? "#241008" : C.dim;
        ctx.beginPath(); ctx.roundRect(cx - 1.2, mid - 1, 2.6, 3.5, 1.1); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - 1.2, mid + 2); ctx.lineTo(cx + 1.4, mid + 2); ctx.lineTo(cx - 1.4, mid + 5); ctx.closePath(); ctx.fill();
    });
}
function drawMarker(ctx, x, mid, kind, hot, accent) {
    const MH = 16, y = mid - MH / 2, ax = x + 11;
    ctx.beginPath(); ctx.roundRect(x, y, MARK_W, MH, MH / 2);
    ctx.fillStyle = hot ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = hot ? "rgba(255,255,255,0.22)" : C.stroke; ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 1.3;
    if (kind === "prepend") { ctx.beginPath(); ctx.moveTo(ax + 2, mid - 3); ctx.lineTo(ax - 2, mid); ctx.lineTo(ax + 2, mid + 3); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(ax - 2, mid - 3); ctx.lineTo(ax + 2, mid); ctx.lineTo(ax - 2, mid + 3); ctx.stroke(); }
    ctx.fillStyle = hot ? C.txt : C.dim; ctx.font = "600 10px 'Hanken Grotesk', Arial"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(kind === "prepend" ? "before" : "after", x + 18, mid);
}

function drawSwatchCard(ctx, node, card, side, width, cy, zones, hx, hy, floating) {
    const h = cardH(card), wh = thH(card.th);
    const x0 = M, x1 = width - M;
    const hover = hy >= cy && hy < cy + h && hx >= x0 && hx <= x1;
    const accent = side === "pos" ? C.accent : C.gold;

    ctx.save(); ctx.translate(0, hover && !floating ? -1 : 0);
    const { cl, cr, headMid } = cardShell(ctx, node, { x0, x1, cy, h, hover, floating, accent });
    ctx.textBaseline = "middle";

    let hxp = cl;
    drawGrip(ctx, hxp, headMid, hover ? C.txt : C.dim);
    zones.push({ x0: hxp - 4, y0: cy + 2, x1: hxp + 12, y1: cy + HEAD_H - 2, drag: card, list: node.__a[side] });
    hxp += 16;
    drawSwitch(ctx, node, card, hxp, headMid, card.on);
    zones.push({ x0: hxp, y0: cy + 2, x1: hxp + 24, y1: cy + HEAD_H - 2, fn: () => { card.on = !card.on; commit(node); } });
    hxp += 32;

    let tx = cr;
    const xHot = inZone(hx, hy, tx - 16, cy + 2, tx, cy + HEAD_H - 2);
    drawIco(ctx, node, tx - 7, headMid, { a: hover ? 1 : 0.4, hot: xHot, kind: "x", danger: true, rot: anim(node, card, "spin", xHot ? 1 : 0, 220) });
    zones.push({ x0: tx - 16, y0: cy + 2, x1: tx, y1: cy + HEAD_H - 2, fn: () => removeCard(node, side, card) });
    tx -= 22;
    drawComma(ctx, node, tx - COMMA_W, headMid, card.comma);
    zones.push({ x0: tx - COMMA_W, y0: cy + 2, x1: tx, y1: cy + HEAD_H - 2, fn: () => { card.comma = !card.comma; commit(node); } });
    tx -= COMMA_W + 6;
    const mHot = inZone(hx, hy, tx - MARK_W, cy + 2, tx, cy + HEAD_H - 2);
    drawMarker(ctx, tx - MARK_W, headMid, card.kind, mHot, accent);
    zones.push({ x0: tx - MARK_W, y0: cy + 2, x1: tx, y1: cy + HEAD_H - 2, fn: () => { card.kind = card.kind === "prepend" ? "append" : "prepend"; commit(node); } });
    tx -= MARK_W + 8;

    const label = card.label || card.kind;
    ctx.font = "600 13px 'Bricolage Grotesque', Arial"; ctx.fillStyle = card.on ? C.txt : C.dim; ctx.textAlign = "left";
    const labelText = fit(ctx, label, tx - hxp - 6);
    ctx.fillText(labelText, hxp, headMid);
    const lw = ctx.measureText(labelText).width;
    zones.push({ x0: hxp, y0: cy, x1: hxp + lw + 4, y1: cy + HEAD_H, fn: (e) => renameCard(node, card, e) });

    const wy = cy + HEAD_H;
    ctx.beginPath(); ctx.roundRect(cl, wy, cr - cl, wh, 9);
    ctx.fillStyle = "rgba(0,0,0,0.26)"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = floating ? "rgba(255,255,255,0.10)" : C.stroke; ctx.stroke();
    if (floating) {
        // overlay's hidden mid-drag, so paint a preview the way the hub's prompt card does
        ctx.save(); ctx.beginPath(); ctx.roundRect(cl, wy, cr - cl, wh, 9); ctx.clip();
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.font = (card.text ? "12px" : "italic 12px") + " 'Hanken Grotesk', Arial";
        ctx.fillStyle = card.text ? C.txt : C.dim;
        const lines = (card.text || "text…").split("\n").slice(0, Math.max(1, Math.floor((wh - 10) / 16)));
        lines.forEach((ln, i) => ctx.fillText(fit(ctx, ln, cr - cl - 16), cl + 8, wy + 7 + i * 16));
        ctx.restore();
        ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(cl + 1.5, wy + 7, 2, wh - 14, 1); ctx.fill();
    } else {
        node.__places.set(card, { cl, top: wy, w: cr - cl });
    }
    ctx.restore();
    return cy + h;
}

function drawZone(ctx, node, side, accent, width, cy, zones, hx, hy, d, rows) {
    const cards = node.__a[side];
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "600 10px 'Hanken Grotesk', Arial";
    ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = accent;
    ctx.fillText(side === "pos" ? "POSITIVE" : "NEGATIVE", M + 5, cy + LBL_H / 2 + 1);
    ctx.restore();
    cy += LBL_H;
    if (!cards.length) {
        ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = C.dim; ctx.font = "italic 11px 'Hanken Grotesk', Arial";
        ctx.fillText("empty - add a swatch below", M + 16, cy + EMPTY_H / 2 - 1); ctx.restore();
        return cy + EMPTY_H;
    }
    for (const card of cards) {
        const top = cy, h = cardH(card);
        if (d && d.item === card) { drawHole(ctx, width, top, h); cy = top + h; }
        else cy = drawSwatchCard(ctx, node, card, side, width, top, zones, hx, hy, false);
        rows.push({ item: card, list: cards, side, top, h: cy - top });
        cy += GAP;
    }
    return cy;
}

function drawBody(ctx, node, width, y0, w) {
    const A = node.__a;
    const zones = [];
    const d = node.__drag;
    const hov = (node.__hover && !d) ? node.__hover : null, hx = hov ? hov[0] : -1, hy = hov ? hov[1] : -1;
    node.__places = new Map();
    ctx.save();
    let cy = y0 + TOP;
    const rows = [];
    cy = drawZone(ctx, node, "pos", C.accent, width, cy, zones, hx, hy, d, rows);
    drawDivider(ctx, width, cy); cy += DIV_H;
    cy = drawZone(ctx, node, "neg", C.gold, width, cy, zones, hx, hy, d, rows);
    node.__rows = rows;
    drawAdd(ctx, node, width, cy, zones, hx, hy, (e) => addMenu(node, e));
    if (d) {
        computeDrop(node, d);
        drawDropLine(ctx, width, d.lineY);
        const home = rows.find((r) => r.item === d.item);
        if (home) {
            const dside = d.list === A.pos ? "pos" : "neg";
            ctx.save(); ctx.translate(0, d.curY - d.grabY);
            drawSwatchCard(ctx, node, d.item, dside, width, home.top, [], -1, -1, true);
            ctx.restore();
        }
    }
    ctx.restore();
    w.__zones = zones;
    placeOverlays(node);
}

function addCard(node, side, kind) {
    node.__a[side].push({ kind, label: "", text: "", comma: true, on: true });
    commit(node);
}
function addMenu(node, event) {
    const items = [
        { content: "Positive · prepend", callback: () => addCard(node, "pos", "prepend") },
        { content: "Positive · append", callback: () => addCard(node, "pos", "append") },
        { content: "Negative · prepend", callback: () => addCard(node, "neg", "prepend") },
        { content: "Negative · append", callback: () => addCard(node, "neg", "append") },
    ];
    new LiteGraph.ContextMenu(items, { event, className: "dark", title: "add swatch" });
}
function removeCard(node, side, card) {
    const i = node.__a[side].indexOf(card);
    if (i >= 0) node.__a[side].splice(i, 1);
    commit(node);
}
function renameCard(node, card, event) {
    app.canvas.prompt("Label", card.label || "", (v) => { card.label = (v || "").trim(); commit(node); }, event);
}

// --- the inline textareas. like the hub's prompt overlay, but one per card: comfy's DOM widgets
// can't ride a custom-drawn body, so we hand-place a textarea over each card's text well.
const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@300;400;500;600&display=swap";
const SW_CSS = `
.atelier-sw{position:fixed;z-index:60;transform-origin:0 0;box-sizing:border-box;resize:vertical;overflow:auto;min-height:30px;
  font-family:"Hanken Grotesk",sans-serif;font-size:12.5px;line-height:1.4;color:#ece9f5;
  background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:6px 8px;outline:none;
  transition:border-color .15s,background .15s}
.atelier-sw::placeholder{color:#6f6889;font-style:italic}
.atelier-sw:focus{border-color:rgba(255,107,92,.55);background:rgba(0,0,0,.36)}
.atelier-sw.neg:focus{border-color:rgba(255,211,107,.5)}
.atelier-sw::-webkit-scrollbar{width:7px}
.atelier-sw::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:99px;border:2px solid transparent;background-clip:padding-box}
`;
function ensureAssets() {
    if (document.getElementById("atelier-sw-style")) return;
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = FONTS; document.head.appendChild(link);
    const style = document.createElement("style"); style.id = "atelier-sw-style"; style.textContent = SW_CSS; document.head.appendChild(style);
}
function mkArea(node, card, side) {
    const ta = document.createElement("textarea");
    ta.className = "atelier-sw" + (side === "neg" ? " neg" : "");
    ta.placeholder = "text…"; ta.spellcheck = false;
    ta.value = card.text || "";
    ta.style.height = thH(card.th) + "px";
    ta.addEventListener("input", () => { card.text = ta.value; sync(node); });
    const ro = new ResizeObserver(() => {
        const hh = ta.offsetHeight; // layout px == node-local (transform:scale doesn't touch offsetHeight)
        if (hh >= TXT_MIN && Math.abs(thH(card.th) - hh) > 1) { card.th = hh; commit(node); }
    });
    ro.observe(ta); ta.__ro = ro;
    return ta;
}
function syncOverlays(node) {
    if (!node.__areas) node.__areas = new Map();
    ensureAssets();
    const live = new Set();
    for (const side of ["pos", "neg"]) {
        for (const card of node.__a[side]) {
            live.add(card);
            let ta = node.__areas.get(card);
            if (!ta) { ta = mkArea(node, card, side); document.body.appendChild(ta); node.__areas.set(card, ta); }
            else if (ta.value !== card.text && document.activeElement !== ta) ta.value = card.text || "";
        }
    }
    for (const [card, ta] of node.__areas) {
        if (!live.has(card)) { ta.__ro?.disconnect(); ta.remove(); node.__areas.delete(card); }
    }
}
function destroyAreas(node) {
    if (!node.__areas) return;
    for (const [, ta] of node.__areas) { ta.__ro?.disconnect(); ta.remove(); }
    node.__areas.clear();
}
function placeOverlays(node) {
    if (!node.__areas) return;
    const ds = app.canvas?.ds;
    const rect = app.canvas.canvas.getBoundingClientRect();
    const places = node.__places;
    for (const [card, ta] of node.__areas) {
        const p = places?.get(card);
        if (!p || !ds || node.flags?.collapsed) { ta.style.display = "none"; continue; }
        const [sx, sy] = ds.convertOffsetToCanvas([node.pos[0] + p.cl, node.pos[1] + p.top]);
        if (sy < -40 || sy > rect.height + 40) { ta.style.display = "none"; continue; } // scrolled off
        ta.style.display = "block";
        ta.style.left = (rect.left + sx) + "px";
        ta.style.top = (rect.top + sy) + "px";
        ta.style.width = p.w + "px";
        ta.style.opacity = card.on ? "1" : "0.45";
        ta.style.transform = `scale(${ds.scale})`;
    }
}

function bodyOf(node) { return node.widgets?.find((w) => w.name === "__atelier_body"); }
function bodyWidget(node) {
    const w = { name: "__atelier_body", type: "custom", serialize: false };
    w.computeSize = () => [Math.max(node.size?.[0] ?? 300, 280), bodyHeight(node)];
    w.draw = (ctx, n, width, y) => drawBody(ctx, n, width, y, w);
    w.mouse = (e, pos, n) => bodyMouse(e, pos, n, w, commit);
    return w;
}

function mount(node) {
    registerGlass(CLASS);
    hide(node.widgets?.find((w) => w.name === STATE));
    node.__a = parseState(node.widgets?.find((w) => w.name === STATE)?.value);
    if (!bodyOf(node)) node.widgets.push(bodyWidget(node));
    syncOverlays(node);
    node.onMouseMove = function (e, pos) { this.__hover = pos; this.setDirtyCanvas(true); };
    node.onMouseLeave = function () { this.__hover = null; this.setDirtyCanvas(true); };
    const onRemoved = node.onRemoved;
    node.onRemoved = function () { destroyAreas(this); onRemoved?.apply(this, arguments); };
    resize(node);
}

app.registerExtension({
    name: "atelier.swatches",
    async nodeCreated(node) { if (node.comfyClass === CLASS) mount(node); },
    async loadedGraphNode(node) { if (node.comfyClass === CLASS) mount(node); },
});
