# Easy Workflow Layout

a ComfyUI extension to organize workflow nodes into a clean, flowchart-like layout with same-type nodes aligned and connected nodes flowing left-to-right

this serves as a working prototype of the proof-of-concept detailed in Comfy-Org/ComfyUI#1547

## description

while ComfyUI includes a [1-click auto-arrange feature](https://github.com/pythongosssss/ComfyUI-Custom-Scripts#auto-arrange-graph) based on `LiteGraph.js`’s default `arrange()` method, which [organizes nodes by dependency levels](https://github.com/jagenjo/litegraph.js/issues/9#issuecomment-377317416), i find its wire orientation often leads to visual clutter

for better visualization, my goal is to ensure all connections are clearly visible, indicating their direction, flow, and specific node attachments

given my limited understanding, it appears most (if not all) ComfyUI workflows can be classified as [directed acyclic graphs](https://en.wikipedia.org/wiki/Directed_acyclic_graph); this suggests that more advanced [graph drawing algorithms](https://en.wikipedia.org/wiki/Graph_drawing) could be applied; specifically, i’m focusing on [hierarchical graph drawing](https://en.wikipedia.org/wiki/Layered_graph_drawing), which seems particularly well-suited for directed acyclic graphs.

**credit**: this approach was inspired by this [comment](https://github.com/jagenjo/litegraph.js/issues/9#issuecomment-376413726)

**disclaimer**: this reflects a personal preference

It’s worth noting that since ComfyUI workflows are inherently oriented from left to right, the concept of ‘depth’ is more accurately described as a ‘column’ or ‘rank’ within this hierarchical context.

## how to use

> [!WARNING]
> As per issue #8 changes to graph not visible until Undo + Redo. I struggle to reproduce this bug with my machine, if u have any additional information please share in #8

**Installation**: via ComfyUI Manager for ease of use, or clone this repository manually using `git` if you’re developing (no additional requirements needed)

**Using**:
1. Finalize your workflow (Reroute nodes are fine — they're grouped into a compact column automatically)
2. Access the layout by either:
   - Right-clicking on the canvas → **Easy Workflow Layout**, or
   - Navigating to the top menu bar: **Extensions > Easy Workflow Layout > Easy Workflow Layout**
3. Customize the spacing between columns and nodes by adjusting the settings in ComfyUI settings

## implementation details

the principle is to use ELK (Eclipse Layout Kernel) to compute pipeline stages (the left-to-right column structure), then post-process to assign clean, overlap-free rows that match how well-organized workflows are arranged by hand

requirements: ComfyUI version ≥ 0.12.3

implemented algorithm (**Easy Workflow Layout**):
1. **ELK ‘layered’ layout** computes the column (pipeline stage) for every node — ELK's X placement already pulls inputs near their consumers, matching manual arrangement
2. **Sinks are re-anchored** just right of whatever produces them (instead of all being dumped in the last column), so e.g. every `PreviewImage` sits right after its stage
3. **Same-type lanes**: multi-instance types that each occupy their own column (chained like `FaceDetailer`, or siblings like `UltralyticsDetectorProvider`) are snapped to a shared horizontal lane, placed as a rigid group so they stay aligned
4. **Remaining nodes** are placed near their connected neighbors, then nudged up/down until nothing overlaps (node dimensions are fully accounted for — no overlaps, guaranteed)
5. **Reroute nodes** are gathered into a compact vertical column at their fan-out point instead of being scattered by the layout engine

2 options to control layout density:
- horizontal spacing between columns (`ranksep`)
- vertical spacing between nodes in same column (`nodesep`)

why alignment matters:
- `PreviewImage`, `FaceDetailer`, `UltralyticsDetectorProvider` and other multi-instance types get snapped to the same Y row instead of being scattered vertically
- nodes of the same type that share an X column (like multiple inputs) get stacked vertically
- the overall height stays compact (close to a hand-organized layout)

**TODO**
- [ ] apply layout to only a subset of nodes instead of whole graph
- [ ] find more layout algorithm, in JS preferably

## example

using [noisy latent composition example](https://comfyanonymous.github.io/ComfyUI_examples/noisy_latent_composition/)

(the empty black rectangle box is browser viewport)

- original workflow:
![Imgur](https://i.imgur.com/jqa3SoD.png)
remove groups because nodes gonna be placed very differently

- `LiteGraph.js` default auto-arrange:
![Imgur](https://i.imgur.com/3hTAdDU.png)

- `Master layout` (ELK-based):
![Imgur](https://i.imgur.com/yNztWil.png)

### before / after
- Before (auto-arranged):
  ![Before](./Before.png)
- After (Easy Workflow Layout):
  ![After](./After.png)

## extra

other possible graph layout in JS (but unsatisfying to me nor suitable for DAG):
- ELK: https://eclipse.dev/elk/reference/algorithms.html
- WebCOLA: https://github.com/tgdwyer/WebCola
- Cytoscape: https://blog.js.cytoscape.org/2020/05/11/layouts/#choice-of-layout
  - AVSDF: https://github.com/iVis-at-Bilkent/avsdf-base
  - CoSE: https://github.com/iVis-at-Bilkent/cose-base
- Graphology: https://graphology.github.io/standard-library/layout.html
- Springy: https://github.com/dhotson/springy
