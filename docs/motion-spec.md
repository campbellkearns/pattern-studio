# Walkthrough Motion Spec (UX-01)

Resolves PRD open item **A3**: concrete durations, easing, and camera framing
for the seam-by-seam assembly walkthrough. The code home of these values is
`src/view/walkthroughMotion.ts` — this document records the reasoning. The
rework's contract: **no snap, ever** — Prev/Next tween continuously between
poses, the camera pre-frames the seam about to fold, and every step reverses
smoothly.

## Why the walkthrough snapped

The scrubber's slider value `v ∈ [0, stepCount]` is the single source of
truth (`stepIndex = min(floor(v), stepCount − 1)`, `t = v − floor(v)`), and
poses come from the pure `evaluateAssemblyPose(plan, stepIndex, t)`. Nothing
was wrong with that pipeline — the snap came from the **Previous/Next
buttons jumping `v` a whole boundary per click** (`v = floor(v) + 1`), which
teleports the fold from t = 0 to t = 1 between two rendered frames.

## The fix: tween `v`, never the poses

Button steps animate `v` from its current value to the target boundary over
the spec duration, calling the same scrub pipeline each frame. Because the
pose function is pure and deterministic in `(stepIndex, t)`, a value that
moves continuously produces a fold that moves continuously — and Previous is
the same tween mirrored, so **reversal is automatically smooth**: unfolding
visits exactly the states folding visited, in reverse order.

- Tween target: the next/previous integer boundary (a mid-fold Next first
  finishes the current seam — unchanged).
- **Interruptible:** a click mid-tween retargets from the current value;
  rapid tapping accumulates, never queues. A manual scrub (slider input)
  cancels the tween — the user always outranks the animation.
- The fold angle is a linear function of `t`, so easing `v` eases the fold.

## Durations

A fold is a rigid 180° swing, so duration is set by **readability, not
distance** — every fold sweeps the same angle. Curved seams fold about
their endpoint chord (the correspondence is harder to follow) and get a more
deliberate pace. Reverse runs quicker everywhere: undo should feel like an
undo.

| Seam type | Direction (Next ▶) | Reverse (◀ Previous) |
|---|---|---|
| Straight chain | 700 ms | 550 ms |
| Curved chain (bow > 0.5 cm) | 900 ms | 700 ms |

**Straight vs curved** is classified from geometry — a seam is curved when
any sample of its chain deviates from the endpoint line by more than
`CURVE_TOLERANCE_CM = 0.5` cm. All v1 starters have straight chains; curved
support keeps the spec honest for future projects.

## Easing

`easeInOutCubic` — `f(t) = 4t³` for t < ½, `1 − (−2t + 2)³ / 2` after.
Symmetric on purpose: a fold is a physical swing. The piece starts at rest
on the mat, accelerates through the arc, and lands at rest on the anchor —
it must not launch (the design system's `--ease` starts fast: right for
chrome, wrong for fabric) and must not drift into the seam.

## Camera framing ("pre-frame the active seam")

When a button step begins, the view pre-frames the seam about to fold so the
fold in progress is always visible:

- **Framed region:** the step's swept volume — the mover group's bounding
  boxes sampled through the swing at `t ∈ {0, 0.25, 0.5, 0.75, 1}` plus the
  anchor chain — as a bounding sphere (`computeSeamFrame`).
- **Fit:** distance = `radius × 1.2 / sin(min(½·fovY, ½·fovX))`, clamped to
  the orbit limits. The 1.2 margin keeps air around the swinging piece.
- **Direction preserved:** only target and distance move; the camera keeps
  the user's viewing angle, so pre-framing never yanks the viewpoint.
- **Timing:** the camera glide runs at `0.6×` the fold's duration with the
  same easing, so the camera settles before the fold's fast middle and the
  second half of every fold plays fully framed.
- **User override:** orbiting (pointer/wheel on the canvas) cancels an
  in-flight glide; manual scrubbing never moves the camera. The next button
  step re-frames — the walkthrough contract wins on steps, the user wins in
  between.
- **Entry:** the walkthrough opens with the same glide onto seam 1.

## Reduced motion

Under `prefers-reduced-motion: reduce`, both tweens collapse to **zero
duration**: a step lands instantly on the legible boundary frame — full flat
or full folded — and the camera jumps straight to the seam's frame. The
walkthrough never renders mid-fold limbo on its own; manual scrubbing stays
fully available, because the media query limits motion the system plays,
not control the user drives.

## Preserved invariants

- `evaluateAssemblyPose` stays pure — no mutation, no animation state; all
  motion lives in the controls' value tween and the view's camera glide.
- The failed-draft path keeps the last valid pattern: an assembly replan
  after a redraft rebuilds the walkthrough from scratch (fresh controls and
  view), so no tween survives a geometry change.
- The learn card still appears only at `v = stepCount` (every fold complete).
