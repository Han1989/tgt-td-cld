// Imports every art file (./entities/*.ts); each one registers itself (registry.ts). Adding a file
// there is all it takes for the renderer and ?showcase to pick it up.

import './common';

import.meta.glob('./entities/*.ts', { eager: true });
