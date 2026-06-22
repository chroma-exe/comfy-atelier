// the glass canon - color tokens + the shell every atelier node wears

export const C = {
    txt: "#ece9f5", dim: "#9a93b4", accent: "#ff6b5c", gold: "#ffd36b", lilac: "#9d8dff",
    stroke: "rgba(255,255,255,0.10)", inset: "rgba(0,0,0,0.22)",
};
// flat on purpose - a gradient sheen here reads fake. one number is the whole glass
const GLASS = { fill: "#14121e", alpha: 0.82 };
const WIRE = C.lilac;

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
