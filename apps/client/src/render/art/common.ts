// Frames shared by several rigs: the soft contact shadow under towers and heroes.

import { registerArt } from './registry';

registerArt({
  id: 'common',
  name: 'Shared',
  category: 'common',
  frames: {
    shadow: { w: 44, h: 22, draw: (c, p) => p.shadow(c, 0, 0, 20, 9) },
  },
});
