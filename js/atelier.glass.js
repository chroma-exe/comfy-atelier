// the atelier canon in code - color tokens, the glass shell every node wears, and the shared card
// kit (glyphs, animation, drag-reorder, body chrome). new nodes pull from here, not the big hub.

export const C = {
    txt: "#ece9f5", dim: "#9a93b4", accent: "#ff6b5c", gold: "#ffd36b", lilac: "#9d8dff",
    stroke: "rgba(255,255,255,0.10)", inset: "rgba(0,0,0,0.22)",
};
// flat on purpose - a gradient sheen here reads fake. one number is the whole glass
const GLASS = { fill: "#14121e", alpha: 0.82 };
const WIRE = C.lilac;

// shared layout, px, node-local. card internals (rows, wells) stay private to each node.
export const M = 9, GAP = 9, HEAD_H = 26, ADD_H = 30, DIV_H = 14;

const GLASS_CLASSES = new Set();

// call from nodeCreated/loadedGraphNode
export function registerGlass(comfyClass) {
    GLASS_CLASSES.add(comfyClass);
    installGlass();
}

// real translucent glass: fill the whole node at globalAlpha < 1 (so the canvas + wires bleed
// through) and DON'T call the original drawNodeShape - the original paints an opaque body first,
// which is the lie. then redraw the title with the node's own methods; litegraph draws the slots
// after this returns. recipe lifted from the niutonian glassmorphism theme.
function drawGlassShape(node, ctx, size, selected) {
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
    LGraphCanvas.link_type_colors["PALETTE"] = WIRE;
    const origShape = LGraphCanvas.prototype.drawNodeShape;
    LGraphCanvas.prototype.drawNodeShape = function (node, ctx, size, fgcolor, bgcolor, selected, mouse_over) {
        if (!GLASS_CLASSES.has(node?.comfyClass)) return origShape.apply(this, arguments);
        try { return drawGlassShape.call(this, node, ctx, size, selected); }
        catch { return origShape.apply(this, arguments); } // fall back to a plain (opaque) node, never break
    };
}

// --- micro-animations: one raf per node while anything's mid-move, time-based so it self-settles ---
const SLIDE_MS = 190, TAP_MS = 100;
const ease = (t) => 1 - (1 - t) ** 3;
export function keepAnimating(node) {
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
export function anim(node, obj, key, target, ms) {
    let m = tweens.get(obj); if (!m) tweens.set(obj, m = {});
    let a = m[key];
    if (!a) { m[key] = { from: target, target, t0: 0, ms }; return target; }
    if (a.target !== target) m[key] = a = { from: curve(a), target, t0: performance.now(), ms };
    const v = curve(a);
    if (v !== target) keepAnimating(node);
    return v;
}
// keyed by glyph center - it redraws identical every frame, so the pressed control finds itself
export function tap(node, cx, cy) {
    const p = node.__tap;
    if (!p) return 1;
    const t = (performance.now() - p.t0) / TAP_MS;
    if (t >= 1) { node.__tap = null; return 1; }
    if (Math.abs(p.x - cx) > 3 || Math.abs(p.y - cy) > 3) return 1;
    keepAnimating(node);
    return 1 - Math.sin(Math.PI * t) * 0.06;
}
export function scaled(ctx, s, cx, cy, fn) {
    if (s === 1) return fn();
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); fn(); ctx.restore();
}

// --- shared utils + glyphs (every node draws these the same way) ---
export function grad(ctx, x, y, w, h, a, b) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, a); g.addColorStop(1, b);
    return g;
}
export function fit(ctx, str, max) {
    if (max <= 0) return "";
    if (ctx.measureText(str).width <= max) return str;
    while (str.length && ctx.measureText(str + "…").width > max) str = str.slice(0, -1);
    return str + "…";
}
export function inZone(hx, hy, x0, y0, x1, y1) {
    return hx >= x0 && hx <= x1 && hy >= y0 && hy <= y1;
}
export function drawSwitch(ctx, node, obj, x, mid, on) {
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
export function drawGrip(ctx, x, mid, col) {
    ctx.fillStyle = col;
    for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) {
        ctx.beginPath(); ctx.arc(x + c * 4, mid - 4 + r * 4, 1.1, 0, Math.PI * 2); ctx.fill();
    }
}
export function drawIco(ctx, node, cx, mid, o) {
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

// --- the card shell every node's cards sit in. pass `accent` for a left tab of color. ---
export function cardShell(ctx, node, opts) {
    const { x0, x1, cy, h, hover, floating, accent } = opts;
    ctx.beginPath(); ctx.roundRect(x0, cy, x1 - x0, h, 12);
    if (floating) { ctx.save(); ctx.shadowColor = "rgba(255,107,92,0.45)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12; ctx.fillStyle = "rgba(26,22,38,0.97)"; ctx.fill(); ctx.restore(); }
    ctx.fillStyle = floating ? "rgba(255,255,255,0.06)" : (hover ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.035)");
    ctx.fill();
    ctx.lineWidth = floating ? 1.5 : 1;
    ctx.strokeStyle = floating ? "rgba(255,107,92,0.55)" : (hover ? "rgba(255,255,255,0.16)" : C.stroke);
    ctx.stroke();
    if (accent) {
        ctx.beginPath(); ctx.roundRect(x0 + 4, cy + 10, 2.5, h - 20, 2);
        ctx.fillStyle = accent; ctx.fill();
    }
    return { cl: x0 + 12, cr: x1 - 11, headMid: cy + HEAD_H / 2 };
}

// --- drag-reorder. rows live on node.__rows; only rows in the dragged item's own list contend. ---
export function drawHole(ctx, width, top, h) {
    ctx.save();
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath(); ctx.roundRect(M, top, width - 2 * M, h, 12); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
}
export function drawDropLine(ctx, width, y) {
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
// first row whose midpoint sits below the pointer wins the drop; else it lands last
export function computeDrop(node, d) {
    const rows = (node.__rows || []).filter((r) => r.list === d.list);
    let before = null, lineY = null;
    for (const r of rows) {
        if (r.item === d.item) continue;
        if (d.curY < r.top + r.h / 2) { before = r.item; lineY = r.top - GAP / 2; break; }
    }
    if (lineY === null && rows.length) { const last = rows[rows.length - 1]; lineY = last.top + last.h + GAP / 2; }
    d.before = before; d.lineY = lineY;
}
export function applyDrop(node, d) {
    const arr = d.list;
    const i = arr.indexOf(d.item);
    if (i < 0) return;
    computeDrop(node, d);
    arr.splice(i, 1);
    if (d.before && d.before !== d.item) {
        const j = arr.indexOf(d.before);
        arr.splice(j < 0 ? arr.length : j, 0, d.item);
    } else arr.push(d.item);
}

export function drawDivider(ctx, width, cy) {
    const y = cy + DIV_H / 2;
    const x0 = M + 6, x1 = width - M - 6;
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.12)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(x0, y, x1 - x0, 1);
}
export function drawAdd(ctx, node, width, cy, zones, hx, hy, onAdd) {
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
    zones.push({ x0, y0: cy, x1, y1: cy + ADD_H, fn: onAdd });
}

// --- node plumbing shared by every atelier body widget ---
export function resize(node) {
    // computeSize returns the minimum box; addWidget collapses to it, so floor at the dragged width.
    const w = node.size[0];
    const min = node.computeSize();
    node.setSize([Math.max(w, min[0]), min[1]]);
}
export function hide(w) {
    if (!w) return;
    w.hidden = true;
    w.computeSize = () => [0, -4]; // keep it so the value still serializes; just stop drawing it
}
// the body widget's mouse handler: route an in-flight drag, else hit-test zones top-down. `commit`
// is the node's own (sync + resize + redraw) since each node serializes a different blob.
export function bodyMouse(e, pos, node, w, commit) {
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
            if (z.drag !== undefined) { node.__drag = { item: z.drag, list: z.list, grabY: y, curY: y, before: null, lineY: null }; keepAnimating(node); return true; }
            node.__tap = { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2, t0: performance.now() };
            keepAnimating(node);
            z.fn(e);
            return true;
        }
    }
    return false; // empty space falls through so the node still drags by its body
}
