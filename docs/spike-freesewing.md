# FreeSewing spike — men's high-rise pants coverage

**Task:** todo_PQD0xoG3 (read-only spike, docs-only) · **Blueprint:** D2/Q1 in _Pattern Studio — Fabric & Pattern Visualization Blueprint_ (art_45YpVjqy) · **Research base:** Findings Log §3 (art_Lf7wAsqu)
**Date:** 2026-09-08 · **Versions verified:** `@freesewing/core` 4.10.1, `@freesewing/titan` 4.10.1, `three` 0.185 · **Model:** `cisMaleAdult40` (mm)

## Verdict (TL;DR)

**Adopt FreeSewing core, drafted with Titan, as Pattern Studio's parametric engine for pants.** Do not hand-roll a pants draft.

The two questions the spike had to answer:

1. **Can a FreeSewing design approximate men's high-rise pants?** Yes. Titan is the classic trouser block and drafts at the natural waist (`waistHeight: 1.0`) with the full rise/crotch option set. (The brief's initial candidate Brian turned out to be a torso/body block, not pants — [docs](https://freesewing.eu/docs/designs/brian/).)
2. **Is the men's-drafting crux — asymmetric front/back crotch extensions (Findings Log §3, sewingforaliving table) — expressible?** Yes, and independently per side: Titan fronts consume `crotchSeamCurve{Start,Bend,Angle}`, backs consume a _separate_ `crossSeamCurve{Start,Bend,Angle}` group (source-verified in `@freesewing/titan` 4.10.1, `front.mjs`/`back.mjs`), and the empirical draft runs both sides at deliberately different settings with finite, plausible geometry.

The draft → SVG → `THREE.Shape` pipeline the blueprint's architecture figure assumes **works end-to-end with zero custom glue** (evidence below).

## 1. Designs surveyed

Per-design docs surveyed on the FreeSewing v4 catalog; Titan additionally verified at source level in the installed 4.10.1 packages.

| Design                                                 | What it is                       | High-rise?                               | Fit for our pants starter                                 |
| ------------------------------------------------------ | -------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| [Titan](https://freesewing.eu/docs/designs/titan/)     | Classic trouser block (menswear) | `waistHeight` up to natural waist (100%) | **Adopt** — block-grade, fully parametric                 |
| [Brian](https://freesewing.eu/docs/designs/brian/)     | Menswear body/torso block        | n/a                                      | Not a pants design — rules itself out                     |
| [Charlie](https://freesewing.eu/docs/designs/charlie/) | Chinos                           | `waistHeight` max 40%                    | Rejected for high rise; fine for hip-rise later           |
| [Paco](https://freesewing.eu/docs/designs/paco/)       | Tailored trousers                | Partial                                  | Style-driven; less exposed rise/crotch control than Titan |
| [Ashley](https://freesewing.eu/designs/) family        | Sweat/puffy variants of Titan    | To natural waist                         | Extends Titan later; not needed for v1                    |
| [Percy](https://freesewing.eu/docs/designs/percy/)     | Puffy shorts/pants               | Partial                                  | Not a block; no advantage over Titan                      |

## 2. Option exposure for rise / crotch controls (Titan 4.10.1, source-verified)

| Control group              | Options                                                                                                                    | Consumed by | Covers                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| Rise & depth               | `waistHeight` (fraction of waist-to-hip → natural waist), `crotchDrop`, `waistbandWidth`, `waistAngle`, `useWaistAngleFor` | both parts  | Rise from hip to natural waist; crotch depth                            |
| **Front crotch extension** | `crotchSeamCurveStart`, `crotchSeamCurveBend`, `crotchSeamCurveAngle`                                                      | `front.mjs` | Front extension length, curve position, angle                           |
| **Back crotch extension**  | `crossSeamCurveStart`, `crossSeamCurveBend`, `crossSeamCurveAngle`                                                         | `back.mjs`  | Back extension length, curve position, angle — **independent of front** |
| Fit machinery              | `fitCrossSeam{,Front,Back}`, `fitKnee`, `seatEase`, `waistEase`, `kneeEase`, `lengthBonus`, `legBalance`, `waistBalance`   | both parts  | Iterative cross-seam matching and inseam/outseam balancing              |

The men's crux (flatter/longer back extension vs steeper/shorter front — Findings Log §3) is therefore a **first-class, independently controllable asymmetry**, not something we'd have to patch in. In the empirical draft below the back extension is ~79 mm longer than the front (fork x: 400 mm vs 321 mm) purely from Titan's own proportions, with per-side curve options available on top.

## 3. Empirical round-trip: draft → SVG → THREE.Shape

**Method** (`docs/spike/freesewing-round-trip.mjs`, scratch — no production code): draft Titan twice for `cisMaleAdult40` — a **high-rise** set (`waistHeight: 1.0`, `crotchDrop: 0.02`) and a contrasting **low-rise** set (`waistHeight: 0.5`, `crotchDrop: 0.1`) with front/back crotch-curve options set asymmetrically — render SVG, then `SVGLoader.parse()` → `SVGLoader.createShapes()` (Three.js PR #21380 fill-rule handling for holes) → `THREE.Shape`.

**Results** (`docs/spike/out/round-trip-summary.json`, SVGs in `docs/spike/out/`):

| Draft     | SVG paths | THREE.Shape objects | Holes | Tessellated points | viewBox (mm) |
| --------- | --------- | ------------------- | ----- | ------------------ | ------------ |
| High-rise | 10        | 8                   | 50    | 1304               | 759 × 1214   |
| Low-rise  | 10        | 8                   | 50    | 1316               | 711 × 1139   |

Lever check — the same named points move between the two drafts (mm, from `pattern.parts`):

| Point          | High-rise           | Low-rise            | Sanity                                                                               |
| -------------- | ------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| Back fork      | (−400.2, **359.0**) | (−391.3, **387.2**) | fork y = waistToUpperLeg × (1 + crotchDrop): 352 × 1.02 = 359.0; 352 × 1.1 = 387.2 ✓ |
| Front fork     | (321.2, 358.9)      | (308.6, 386.4)      | same depth formula ✓                                                                 |
| Back waistIn y | −40.9               | −30.5               | waistband styling shifts with rise ✓                                                 |

Front/back fork x-values differ by ~79 mm — the men's asymmetry present in the block's own proportions. Zero `NaN` coordinates; sane mm-scale viewBox. The 10 SVG paths = 2 fabric outlines + ~8 decoration paths (logo, scalebox, title text, grainline); production redrafting must **filter to `class="fabric"` paths** before tessellation (decoration text is where the 50 holes come from).

### v4 gotchas (would have sunk an unprepared integration)

1. **Settings are variadic sets.** `new Titan({ measurements, options })` — _not_ `new Titan([{ ... }])`. The nested-array form spreads into `{0: {...}}` and silently drafts with **empty measurements** (all-NaN geometry, no error).
2. **The `fitCrossSeam*` options must stay `true`** (the part-level defaults). `back.mjs` only creates `points.forkCp2` inside the fit block, and _both_ parts' inseam paths consume it; disabling fitting aborts the back draft before it stores `inseamBack`/`outseamBack`, and the front part's unconditionally-called seam adaptation then rotates NaN into every styled point. Symptom-free fix: don't touch them.
3. **`plugin-measurements` is required** — it derives `seatFrontArc`, `seatBackArc`, `waistFrontArc`, `waistBackArc`, `crossSeamBack`, `seatFront` etc. from the base model at `preDraft`.
4. **Packaging gap:** `@freesewing/core-plugins` 4.10.1 imports `@freesewing/plugin-transform` without declaring it. Import `@freesewing/core` + the individual plugins directly (as the spike does) rather than the umbrella package; a patch/override is an option if the umbrella is ever needed.
5. **Parts are keyed `titan.back` / `titan.front`** under `pattern.parts[setIndex]` — not `back`/`front`.

## 4. What adopting buys vs. hand-rolling

**Adopting** gets Titan's already-shipped fit machinery — iterative cross-seam adaptation (guarded do/while rotation loops, ~15–20 iterations) and inseam/outseam balancing — plus published, true-scale mm models, option-structured parametrics that map cleanly onto learning cards, and per-design docs. The blueprint's true-scale and piece-first requirements are met by construction.

**Hand-rolling** one pants draft would re-implement that fit machinery from the published men's drafting differences, with every iteration step a new risk, and would still need the same SVG→Three.js pipeline on top.

**Costs of adopting (priced):** FreeSewing's option names are draft-internals-flavored (`crossSeamCurve*` for the _back_), so the parametrics UI will need a curation layer either way; v4 packaging quirks (above) need pinning; and a license review of the design packages was outside this spike's scope and remains open for the adoption task.

**Unblocks:** the parametric-redraft task (todo_Yp4OXmNT) can build on FreeSewing core + Titan + `plugin-measurements`, with the redraft surface = the option groups in §2.

## Artifacts

- `docs/spike-freesewing.md` — this report
- `docs/spike/freesewing-round-trip.mjs` — scratch round-trip script (docs-only, excluded from app build)
- `docs/spike/out/titan-highrise.svg`, `docs/spike/out/titan-lowrise.svg` — rendered drafts
- `docs/spike/out/round-trip-summary.json` — machine-readable round-trip + point evidence
