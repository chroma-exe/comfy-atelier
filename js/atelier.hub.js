import { app } from "../../scripts/app.js";

const HUB_CLASS = "AtelierHub";
const STATE = "checkpoints"; // the json field the backend reads - single source of truth
const SLOT = "__atelier_slot";

function ckptList(node) {
    const w = node.widgets?.find((w) => w.name === "ckpt_name");
    return w?.options?.values ?? [];
}

function slots(node) {
    return (node.widgets ?? []).filter((w) => w[SLOT]);
}

function relabel(node) {
    slots(node).forEach((w, i) => (w.name = `checkpoint ${i + 2}`));
}

function sync(node) {
    const data = slots(node).map((w) => ({ ckpt: w.value, loras: [] }));
    const state = node.widgets?.find((w) => w.name === STATE);
    if (state) state.value = JSON.stringify(data);
}

function resize(node, width = node.size[0]) {
    // grow to fit the rows but keep the width the user dragged to. computeSize returns the
    // *minimum* box, so setting it raw is what was collapsing the width - floor, don't replace.
    // addWidget auto-resizes to min first, so callers that just added must pass the pre-add width.
    const min = node.computeSize();
    node.setSize([Math.max(width, min[0]), min[1]]);
}

function hide(w) {
    if (!w) return;
    // internal plumbing, not for human eyes - collapse it but keep the widget so its value
    // still serializes into the saved workflow. that field is the whole source of truth.
    w.hidden = true;
    w.computeSize = () => [0, -4];
}

function addSlot(node, value) {
    const width = node.size[0]; // grab it before addWidget auto-collapses to min
    const list = ckptList(node);
    // serialize:false on purpose - the slots never touch widgets_values, so a saved workflow
    // can't resurrect a ghost slot. the STATE blob is the only thing that persists.
    const combo = node.addWidget("combo", `checkpoint ${slots(node).length + 2}`, value ?? list[0], () => sync(node), { values: list, serialize: false });
    combo[SLOT] = true;
    node.addWidget("button", "remove ✕", null, () => {
        const i = node.widgets.indexOf(combo);
        node.widgets.splice(i, 2); // the combo and this button, added as a pair, removed as one
        relabel(node);
        sync(node);
        resize(node);
    }, { serialize: false });
    resize(node, width);
    sync(node);
    return combo;
}

function setup(node) {
    if (node[SLOT + "_ready"]) return;
    node[SLOT + "_ready"] = true;
    hide(node.widgets?.find((w) => w.name === STATE));
    node.addWidget("button", "+ Add Checkpoint", null, () => addSlot(node), { serialize: false });
}

function rehydrate(node) {
    const state = node.widgets?.find((w) => w.name === STATE);
    if (!state?.value) return;
    let data;
    try {
        data = JSON.parse(state.value);
    } catch {
        return;
    }
    for (const item of data) addSlot(node, item.ckpt);
}

app.registerExtension({
    name: "atelier.hub",
    async nodeCreated(node) {
        if (node.comfyClass !== HUB_CLASS) return;
        setup(node);
    },
    async loadedGraphNode(node) {
        if (node.comfyClass !== HUB_CLASS) return;
        setup(node);
        rehydrate(node);
    },
});
