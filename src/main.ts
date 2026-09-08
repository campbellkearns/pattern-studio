import { mountApp } from './app';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('#app root element missing from index.html');
}
mountApp(root);
