import './style.css';
import { REVISION } from 'three';

const app = document.querySelector<HTMLElement>('#app');
if (!app) {
  throw new Error('#app mount point missing from index.html');
}

// Scaffold placeholder: proves the dev server, TypeScript, and the three.js
// dependency (with its bundled types) all resolve. The 3D viewport arrives
// with the M1 rendering milestone.
app.innerHTML = `
  <main class="shell">
    <p class="eyebrow">Scaffold placeholder</p>
    <h1>Pattern Studio</h1>
    <p class="lede">
      A browser studio where flat pattern pieces become orbitable 3D objects
      with real fabric previews, so learners can see how a flat pattern turns
      into an assembled garment before cutting fabric. The 3D viewport,
      fabric previews, and seam assembly arrive in upcoming milestones.
    </p>
    <p class="meta">three.js r${REVISION} · TypeScript · Vite</p>
  </main>
`;
