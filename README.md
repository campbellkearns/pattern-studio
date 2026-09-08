# Pattern Studio

> 'Pattern Studio' is a working name — the app will be renamed before release.

A browser studio for learning to sew: flat pattern pieces become orbitable 3D
objects with real fabric previews, so learners can see how a flat pattern turns
into an assembled garment before cutting any fabric.

Built with TypeScript, Vite, and vanilla three.js — no UI framework, because
the point of the project is learning WebGL itself. Vector pattern geometry is
the source of truth for both 2D SVG output and the 3D scene.

The repo is in early scaffold; the placeholder page served by `npm run dev`
will be replaced by the 3D viewport in the first rendering milestone.

## Development

```sh
npm install       # install dependencies
npm run dev       # vite dev server on http://localhost:5173
npm run test      # vitest, single run
npm run lint      # eslint
npm run format    # prettier, write in place
npm run build     # type-check (tsc --noEmit) + production build
```

## CI

CircleCI runs lint and tests on every branch and PR (`.circleci/config.yml`):
`npm ci` → eslint → vitest on a small executor. One-time setup: the repo owner
must follow this repository in their CircleCI org before the pipeline triggers.
