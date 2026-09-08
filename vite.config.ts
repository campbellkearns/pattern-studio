import { defineConfig } from 'vite';

// Relative asset base so one build serves both the GitHub Pages subpath
// (campbellkearns.github.io/pattern-studio/) and any root-path deployment
// without hardcoding a repository name into asset URLs.
export default defineConfig({
  base: './',
});
