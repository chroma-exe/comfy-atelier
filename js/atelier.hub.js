import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const HUB_CLASS = "AtelierHub";
const STATE = "checkpoints"; // the json field the backend reads - single source of truth
const DYN = "__atelier_dyn";
const ROW_H = 22;
const ACCENT = "#ff6b5c";

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

function ckptList(node) {
    return node.widgets?.find((w) => w.name === "ckpt_name")?.options?.values ?? [];
}

function parseState(raw) {
    const empty = { main_loras: [], slots: [] };
    if (!raw) return empty;
    let d;
    try {
        d = JSON.parse(raw);
    } catch {
        return empty;
    }
    if (Array.isArray(d)) d = { main_loras: [], slots: d }; // phase 2 shipped a bare slot array
    return {
        main_loras: cleanLoras(d.main_loras),
        slots: (d.slots ?? []).map((s) => ({ ckpt: s.ckpt ?? "", loras: cleanLoras(s.loras) })),
    };
}

function cleanLoras(arr) {
    return (arr ?? []).map((l) => ({
        on: l.on !== false,
        lora: l.lora ?? "",
        strength: typeof l.strength === "number" ? l.strength : 1.0,
    }));
}

function sync(node) {
    const w = node.widgets?.find((w) => w.name === STATE);
    if (w) w.value = JSON.stringify({ main_loras: node.__atelier.main_loras, slots: node.__atelier.slots });
}

function resize(node, width = node.size[0]) {
    // computeSize returns the *minimum* box; addWidget auto-collapses to it first, so floor at the
    // width the user dragged to instead of replacing it. height tracks row count, which is intended.
    const min = node.computeSize();
    node.setSize([Math.max(width, min[0]), min[1]]);
}

function hide(w) {
    if (!w) return;
    w.hidden = true;
    w.computeSize = () => [0, -4]; // keep the widget so its value still serializes; just stop drawing it
}

function fit(ctx, str, max) {
    if (ctx.measureText(str).width <= max) return str;
    while (str.length && ctx.measureText(str + "…").width > max) str = str.slice(0, -1);
    return str + "…";
}

function drawRow(ctx, w, node, width, y) {
    const e = w.value;
    const m = 10;
    const midY = y + ROW_H * 0.5;
    const togEnd = m + 18;
    const zoneW = 64;
    const zoneX = width - m - zoneW;

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.roundRect(m, y + 1, width - 2 * m, ROW_H - 2, 6);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(m + 9, midY, 6, 0, Math.PI * 2);
    ctx.fillStyle = e.on ? ACCENT : "rgba(255,255,255,0.16)";
    ctx.fill();

    ctx.globalAlpha = e.on ? 1 : 0.4;
    ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;
    ctx.textBaseline = "middle";
    ctx.font = `${LiteGraph.NODE_TEXT_SIZE || 12}px Arial`;

    ctx.textAlign = "center";
    ctx.fillText("◂", zoneX + 7, midY);
    ctx.fillText((e.strength ?? 1).toFixed(2), zoneX + 32, midY);
    ctx.fillText("▸", zoneX + 57, midY);

    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, e.lora || "click to choose a lora…", zoneX - 6 - togEnd), togEnd, midY);
    ctx.restore();

    w.__hit = {
        tog: [m, togEnd],
        dec: [zoneX, zoneX + 14],
        val: [zoneX + 14, zoneX + 50],
        inc: [zoneX + 50, zoneX + 64],
        name: [togEnd, zoneX - 6],
    };
}

function chooseLora(event, cb) {
    // className "dark" is the magic word: comfy's ContextMenuFilter extension only adds the
    // "Filter list" search box to dark menus with >4 items. without it, hundreds of loras = a wall.
    const scale = Math.max(1, app.canvas?.ds?.scale ?? 1);
    loraList().then((list) => new LiteGraph.ContextMenu(list, { event, scale, className: "dark", title: "choose a lora", callback: cb }));
}

function rowMouse(event, pos, node, w) {
    // the dispatcher calls this on down, move AND up - only act on the press
    if (event.type !== "pointerdown" && event.type !== "mousedown") return;
    const h = w.__hit;
    if (!h) return;
    const e = w.value;
    const x = pos[0];
    const hit = (r) => x >= r[0] && x <= r[1];
    const redraw = () => {
        sync(node);
        node.setDirtyCanvas(true, true);
    };
    if (hit(h.tog)) {
        e.on = !e.on;
        redraw();
    } else if (hit(h.dec)) {
        e.strength = Math.round(((e.strength ?? 1) - 0.05) * 100) / 100;
        redraw();
    } else if (hit(h.inc)) {
        e.strength = Math.round(((e.strength ?? 1) + 0.05) * 100) / 100;
        redraw();
    } else if (hit(h.val)) {
        app.canvas.prompt("Strength", e.strength ?? 1, (v) => {
            e.strength = Number(v) || 0;
            redraw();
        }, event);
    } else if (hit(h.name)) {
        chooseLora(event, (v) => {
            if (typeof v === "string") {
                e.lora = v;
                redraw();
            }
        });
    }
    return true;
}

function loraRow(node, entry) {
    const w = { name: "lora", type: "custom", value: entry, serialize: false, [DYN]: true };
    w.computeSize = () => [node.size[0], ROW_H];
    w.draw = (ctx, n, width, y) => drawRow(ctx, w, n, width, y);
    w.mouse = (e, p, n) => rowMouse(e, p, n, w);
    node.widgets.push(w);
    return w;
}

function addBtn(node, label, cb) {
    const w = node.addWidget("button", label, null, cb, { serialize: false });
    w[DYN] = true;
    return w;
}

function addCombo(node, slot, idx) {
    const list = ckptList(node);
    const w = node.addWidget("combo", `checkpoint ${idx + 2}`, slot.ckpt || list[0], (v) => {
        slot.ckpt = v;
        sync(node);
    }, { values: list, serialize: false });
    w[DYN] = true;
    return w;
}

function newLora() {
    return { on: true, lora: "", strength: 1.0 };
}

function rebuild(node) {
    const width = node.size[0]; // grab before the rebuild auto-collapses to min
    node.widgets = (node.widgets ?? []).filter((w) => !w[DYN]);
    const M = node.__atelier;

    for (const e of M.main_loras) loraRow(node, e);
    addBtn(node, "+ Add Lora", () => {
        M.main_loras.push(newLora());
        rebuild(node);
        sync(node);
    });

    M.slots.forEach((slot, i) => {
        addCombo(node, slot, i);
        for (const e of slot.loras) loraRow(node, e);
        addBtn(node, "+ Add Lora", () => {
            slot.loras.push(newLora());
            rebuild(node);
            sync(node);
        });
        addBtn(node, "remove ✕", () => {
            M.slots.splice(i, 1);
            rebuild(node);
            sync(node);
        });
    });

    addBtn(node, "+ Add Checkpoint", () => {
        M.slots.push({ ckpt: ckptList(node)[0] || "", loras: [] });
        rebuild(node);
        sync(node);
    });

    resize(node, width);
}

function mount(node) {
    hide(node.widgets?.find((w) => w.name === STATE));
    loraList();
    node.__atelier = parseState(node.widgets?.find((w) => w.name === STATE)?.value);
    rebuild(node);
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
