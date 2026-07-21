# Easy Workflow Layout

a ComfyUI extension to organize workflow nodes into a clean, flowchart-like layout with same-type nodes aligned and connected nodes flowing left-to-right

## how to use

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
6. **Column consolidation**: nodes with a single predecessor in the adjacent column are merged into that column, eliminating unnecessary pipeline stages

2 options to control layout density:
- horizontal spacing between columns (`ranksep`)
- vertical spacing between nodes in same column (`nodesep`)

why alignment matters:
- `PreviewImage`, `FaceDetailer`, `UltralyticsDetectorProvider` and other multi-instance types get snapped to the same Y row instead of being scattered vertically
- nodes of the same type that share an X column (like multiple inputs) get stacked vertically
- the overall height stays compact (close to a hand-organized layout)

**TODO**
- [ ] apply layout to only a subset of nodes instead of whole graph

## example

### before / after
- Before (auto-arranged):
  ![Before](./Before.png)
- After (Easy Workflow Layout):
  ![After](./After.png)


