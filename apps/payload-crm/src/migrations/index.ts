import * as migration_20260911_101850_initial from './20260911_101850_initial';

export const migrations = [
  {
    up: migration_20260911_101850_initial.up,
    down: migration_20260911_101850_initial.down,
    name: '20260911_101850_initial'
  },
];
