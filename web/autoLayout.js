// docs: https://docs.comfy.org/custom-nodes/js/javascript_overview

import { app } from "/scripts/app.js";
import "./elk.bundled.min.js";

const ext_id = "EWL";
const ext_label = "Easy Workflow Layout";

const ext_settings = [
	{
		"id": `${ext_id}.ranksep`,
		"category": [ext_label, "spacing", "ranksep"],
		"name": "horizontal spacing (px) between columns",
		"type": "number",
		"defaultValue": 200,
	},
	{
		"id": `${ext_id}.nodesep`,
		"category": [ext_label, "spacing", "nodesep"],
		"name": "vertical spacing (px) between nodes in same column",
		"type": "number",
		"defaultValue": 150,
	},
];

const ext_commands = [
	{
		"id": `${ext_id}.layout`,
		"label": "Layout Workflow",
		"function": masterLayout
	},
];

const ext_topbarmenu = [
	{
		path: ["Extensions", ext_label],
		commands: [`${ext_id}.layout`]
	},
];

app.registerExtension({
	"name": ext_id,
	"aboutPageBadges": [
		{
			"label": "GitHub",
			"url": "https://github.com/aeslampanah/ComfyUI-Easy-Workflow-Layout",
			"icon": "pi pi-github"
		}
	],
	"commands": ext_commands,
	"menuCommands": ext_topbarmenu,
	"settings": ext_settings,
	getCanvasMenuItems(canvas) {
		return [null, { content: "Layout Workflow", callback: masterLayout }];
	},
});

const REROUTE_SIZE = 20;
const COLGAP = 150;   // gap between a sink and its source column
const COL_TOL = 150;  // x tolerance for grouping nodes into columns
const GAP = 4;        // minimum gap used when resolving overlaps

function median(arr) {
	if (!arr.length) return null;
	const a = [...arr].sort((x, y) => x - y);
	return a[Math.floor(a.length / 2)];
}

async function masterLayout() {
	const activeGraph = app.canvas.graph || app.graph;

	const nodesep = app.extensionManager.setting.get(`${ext_id}.nodesep`);

	const myElkNodes = activeGraph._nodes.map((n) => ({
		"id": n.id,
		"width": n.type === "Reroute" ? REROUTE_SIZE : (n.size[0] || 100),
		"height": n.type === "Reroute" ? REROUTE_SIZE : (n.size[1] || 50),
	}));
	const myElkEdges = [...activeGraph.links.values()].filter(Boolean).map((e) => ({
		"id": e.id,
		"sources": [e.origin_id],
		"targets": [e.target_id],
	}));

	const myElkGraph = {
		"id": "root",
		"children": myElkNodes,
		"edges": myElkEdges,
		"layoutOptions": {
			"elk.algorithm": "layered",
			"elk.direction": "RIGHT",
			"elk.layered.layering.strategy": "LONGEST_PATH",
			"elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
			"elk.layered.considerModelOrder": "NODES_AND_EDGES",
			"elk.layered.spacing.nodeNodeBetweenLayers": app.extensionManager.setting.get(`${ext_id}.ranksep`),
			"elk.spacing.nodeNode": nodesep,
		},
	};

	return new window.ELK()
		.layout(myElkGraph)
		.then((val) => {
			const layoutById = new Map(val.children.map((c) => [c.id, c]));
			const nodeById = new Map(activeGraph._nodes.map((n) => [n.id, n]));

			const ids = activeGraph._nodes.map((n) => n.id);
			const types = {};
			const sizes = {};
			for (const n of activeGraph._nodes) {
				types[n.id] = n.type;
				sizes[n.id] = [n.size[0] || 100, n.size[1] || 50];
			}

			// --- raw graph ---
			const rawPreds = new Map(ids.map((i) => [i, []]));
			const rawSuccs = new Map(ids.map((i) => [i, []]));
			for (const e of myElkEdges) {
				const s = e.sources[0], t = e.targets[0];
				if (!rawSuccs.has(s) || !rawPreds.has(t)) continue;
				rawSuccs.get(s).push(t);
				rawPreds.get(t).push(s);
			}

			const isReroute = {};
			const isSink = {};
			for (const id of ids) {
				isReroute[id] = types[id] === "Reroute";
				isSink[id] = rawSuccs.get(id).length === 0;
			}

			// --- transparent neighbors (follow through reroutes to real nodes) ---
			const expand = (seed, fwd) => {
				const out = new Set();
				const stack = [...seed];
				while (stack.length) {
					const u = stack.pop();
					if (isReroute[u]) stack.push(...fwd.get(u));
					else out.add(u);
				}
				return [...out];
			};
			const tpreds = {}, tsuccs = {}, rpreds = {}, rsuccs = {};
			for (const id of ids) {
				if (isReroute[id]) {
					rpreds[id] = expand(rawPreds.get(id), rawPreds);
					rsuccs[id] = expand(rawSuccs.get(id), rawSuccs);
				} else {
					tpreds[id] = expand(rawPreds.get(id), rawPreds);
					tsuccs[id] = expand(rawSuccs.get(id), rawSuccs);
				}
			}

			// --- X targets ---
			const X = {};
			for (const id of ids) {
				if (isReroute[id]) continue;
				if (isSink[id] && rawPreds.get(id).length) {
					let right = -Infinity;
					for (const s of rawPreds.get(id)) {
						const l = layoutById.get(s);
						right = Math.max(right, (l ? l.x : 0) + (l ? l.width : sizes[s][0]));
					}
					X[id] = right + COLGAP;
				} else {
					X[id] = layoutById.get(id) ? layoutById.get(id).x : 0;
				}
			}
			for (const id of ids) {
				if (!isReroute[id]) continue;
				const [w] = sizes[id];
				let rx;
				if (rsuccs[id].length) {
					let tl = Infinity;
					for (const t of rsuccs[id]) tl = Math.min(tl, X[t] !== undefined ? X[t] : 0);
					rx = tl - w - 80;
				} else {
					rx = layoutById.get(id) ? layoutById.get(id).x : 0;
				}
				if (rpreds[id].length) {
					let sr = -Infinity;
					for (const s of rpreds[id]) sr = Math.max(sr, (X[s] !== undefined ? X[s] : 0) + sizes[s][0]);
					rx = Math.max(rx, sr + 60);
				}
				X[id] = rx;
			}

			// --- columns ---
			const cols = [];
			for (const id of [...ids].sort((a, b) => X[a] - X[b])) {
				const last = cols[cols.length - 1];
				if (last && X[id] - last.maxx <= COL_TOL) {
					last.nodes.push(id);
					last.maxx = Math.max(last.maxx, X[id]);
				} else {
					cols.push({ maxx: X[id], nodes: [id] });
				}
			}
			for (const c of cols) c.nodes.sort((a, b) => (layoutById.get(a).y || 0) - (layoutById.get(b).y || 0));
			const colOf = {};
			cols.forEach((c, ci) => c.nodes.forEach((id) => (colOf[id] = ci)));

			// --- consolidate columns: merge simple chains into a single column ---
			// When node B in column C+1 has exactly one predecessor A in column C,
			// move B to A's column and stack vertically. This reduces horizontal
			// spreading for linear chains regardless of whether A has other branches.
			for (let ci = cols.length - 1; ci > 0; ci--) {
				const curCol = cols[ci];
				const prevCol = cols[ci - 1];
				const toMove = [];
				for (const id of curCol.nodes) {
					if (isReroute[id]) continue;
					const preds = tpreds[id] || [];
					if (preds.length !== 1) continue;
					const pred = preds[0];
					if (colOf[pred] !== ci - 1) continue;
					toMove.push(id);
				}
				for (const id of toMove) {
					const pred = (tpreds[id] || [])[0];
					X[id] = X[pred] || 0;
					colOf[id] = ci - 1;
					curCol.nodes = curCol.nodes.filter(n => n !== id);
					prevCol.nodes.push(id);
				}
				if (curCol.nodes.length === 0) {
					cols.splice(ci, 1);
					for (let j = ci; j < cols.length; j++) {
						for (const n of cols[j].nodes) colOf[n] = j;
					}
				}
			}

			// --- lane families: same-type nodes that each occupy their own column ---
			const famMembers = new Map();
			for (const id of ids) {
				if (isReroute[id]) continue;
				if (!famMembers.has(types[id])) famMembers.set(types[id], []);
				famMembers.get(types[id]).push(id);
			}
			const laneFams = new Set();
			for (const [fam, mem] of famMembers) {
				if (mem.length < 2) continue;
				const mcols = new Set(mem.map((m) => colOf[m]));
				if (mcols.size < 2 || mcols.size !== mem.length) continue;
				const memSet = new Set(mem);
				const chained = mem.some((m) => tsuccs[m].concat(tpreds[m]).some((u) => memSet.has(u)));
				const nbfams = new Set();
				for (const m of mem) {
					for (const u of tsuccs[m].concat(tpreds[m])) {
						if (!memSet.has(u)) nbfams.add(types[u]);
					}
				}
				if (chained || nbfams.size === 1) laneFams.add(fam);
			}
			let previewFam = null;
			for (const [fam, mem] of famMembers) {
				if (mem.every((m) => isSink[m]) && fam.toLowerCase().startsWith("preview")) {
					previewFam = fam;
					laneFams.add(fam);
				}
			}

			// spread X within a lane family so members never overlap horizontally
			for (const fam of laneFams) {
				let cx = null;
				for (const id of [...famMembers.get(fam)].sort((a, b) => X[a] - X[b])) {
					const [w] = sizes[id];
					if (cx !== null && X[id] < cx) X[id] = cx;
					cx = X[id] + w + 60;
				}
			}

			// --- Y placement ---
			const Y = new Map();
			const placed = []; // {x0,y0,x1,y1,id}

			const blockerAt = (id, y) => {
				const [w, h] = sizes[id];
				const x0 = X[id], x1 = x0 + w;
				for (const p of placed) {
					if (x0 < p.x1 && p.x0 < x1 && y < p.y1 && p.y0 < y + h) return p;
				}
				return null;
			};
			const resolveSingle = (id, desired) => {
				const [, h] = sizes[id];
				let y = desired;
				for (let k = 0; k < 800; k++) {
					const b = blockerAt(id, y);
					if (!b) break;
					y = b.y1 + GAP;
				}
				const down = y;
				y = desired;
				for (let k = 0; k < 800; k++) {
					const b = blockerAt(id, y);
					if (!b) break;
					y = b.y0 - h - GAP;
				}
				const up = y;
				return Math.abs(down - desired) <= Math.abs(desired - up) ? down : up;
			};
			const mark = (id, y) => {
				Y.set(id, y);
				const [w, h] = sizes[id];
				placed.push({ x0: X[id], y0: y, x1: X[id] + w, y1: y + h, id });
			};
			const placeFamily = (fam, baseY) => {
				const mem = famMembers.get(fam);
				let y = baseY;
				for (let k = 0; k < 1000; k++) {
					let hit = null;
					for (const m of mem) {
						const b = blockerAt(m, y);
						if (b) { hit = b; break; }
					}
					if (!hit) break;
					y = hit.y1 + GAP;
				}
				for (const m of mem) mark(m, y);
			};

			const famPlaced = new Set();
			const colBottom = {};
			let pending = ids.filter((id) => !isReroute[id]);
			pending.sort((a, b) => (colOf[a] - colOf[b]) || ((layoutById.get(a).y || 0) - (layoutById.get(b).y || 0)));

			for (let sweep = 0; sweep < 8; sweep++) {
				if (!pending.length) break;
				const still = [];
				for (const id of pending) {
					const fam = types[id];
					if (laneFams.has(fam)) {
						if (famPlaced.has(fam)) continue;
						const mem = famMembers.get(fam);
						const memSet = new Set(mem);
						const cents = [];
						for (const m of mem) {
							for (const u of tpreds[m].concat(tsuccs[m])) {
								if (Y.has(u) && !memSet.has(u)) cents.push(Y.get(u) + sizes[u][1] / 2);
							}
						}
						let baseY;
						if (!cents.length) {
							if (sweep < 3) { still.push(id); continue; }
							baseY = 0;
						} else {
							const maxh = Math.max(...mem.map((m) => sizes[m][1]));
							baseY = median(cents) - maxh / 2;
						}
						placeFamily(fam, baseY);
						famPlaced.add(fam);
						for (const m of mem) {
							const cb = colBottom[colOf[m]];
							colBottom[colOf[m]] = cb === undefined ? Y.get(m) + sizes[m][1] : Math.max(cb, Y.get(m) + sizes[m][1]);
						}
						continue;
					}
					// non-lane node: place near placed neighbors
					const cents = [];
					for (const u of tpreds[id].concat(tsuccs[id])) {
						if (Y.has(u)) cents.push(Y.get(u) + sizes[u][1] / 2);
					}
					let desired;
					if (cents.length) desired = median(cents) - sizes[id][1] / 2;
					else if (colBottom[colOf[id]] !== undefined) desired = colBottom[colOf[id]] + nodesep;
					else if (sweep < 3) { still.push(id); continue; }
					else desired = 0;
					const y = resolveSingle(id, desired);
					mark(id, y);
					const cb = colBottom[colOf[id]];
					colBottom[colOf[id]] = cb === undefined ? y + sizes[id][1] : Math.max(cb, y + sizes[id][1]);
				}
				pending = still;
			}

			// reroutes last: compact column at their targets' height
			const rerouteIds = ids.filter((i) => isReroute[i]);
			rerouteIds.sort((a, b) => (X[a] - X[b]) || ((layoutById.get(a).y || 0) - (layoutById.get(b).y || 0)));
			for (const id of rerouteIds) {
				const ref = [];
				for (const t of rsuccs[id]) if (Y.has(t)) ref.push(Y.get(t) + sizes[t][1] / 2);
				if (!ref.length) for (const p of rpreds[id]) if (Y.has(p)) ref.push(Y.get(p) + sizes[p][1] / 2);
				const d = ref.length ? ref.reduce((s, v) => s + v, 0) / ref.length - sizes[id][1] / 2 : 0;
				mark(id, resolveSingle(id, d));
			}

			// reposition previews above their source nodes
			if (previewFam) {
				const mem = famMembers.get(previewFam);
				const memSet = new Set(mem);
				for (const m of mem) {
					const idx = placed.findIndex(p => p.id === m);
					if (idx >= 0) placed.splice(idx, 1);
					Y.delete(m);
				}
				const sourceTops = [];
				for (const m of mem) {
					for (const u of tpreds[m].concat(tsuccs[m])) {
						if (Y.has(u) && !memSet.has(u)) sourceTops.push(Y.get(u));
					}
				}
				if (sourceTops.length) {
					const maxh = Math.max(...mem.map((m) => sizes[m][1]));
					let baseY = Math.min(...sourceTops) - maxh - 50;
					if (baseY < 0) baseY = 0;
					let y = baseY;
					for (let k = 0; k < 1000; k++) {
						let hit = null;
						for (const m of mem) {
							const b = blockerAt(m, y);
							if (b) { hit = b; break; }
						}
						if (!hit) break;
						y = hit.y1 + GAP;
					}
					for (const m of mem) mark(m, y);
				} else {
					for (const m of mem) mark(m, 0);
				}
			}

			// --- apply positions ---
			for (const id of ids) {
				const n = nodeById.get(id);
				if (!n || X[id] === undefined || !Y.has(id)) continue;
				n.pos[0] = X[id];
				n.pos[1] = Y.get(id);
			}

			activeGraph.setDirtyCanvas(true, true);
		})
		.catch(console.error);
}
