import * as migration_20260911_101850_initial from './20260911_101850_initial';
import * as migration_20260911_131051_variants from './20260911_131051_variants';

export const migrations = [
  {
    up: migration_20260911_101850_initial.up,
    down: migration_20260911_101850_initial.down,
    name: '20260911_101850_initial',
  },
  {
    up: migration_20260911_131051_variants.up,
    down: migration_20260911_131051_variants.down,
    name: '20260911_131051_variants'
  },
];
