import type { CollectionConfig } from 'payload'

import { staffOnly, superAdminOnly } from '../access/roles'

/**
 * Editorial product content owned by Payload (names, descriptions, media, SEO).
 * These are proposals for publication into the commerce read model; they are
 * NOT checkout-authoritative. Price/VAT/stock live in commerce (catalog_skus),
 * owned by iii.dev + Neon. See architecture spec §3.1 and non-negotiable #1/#4.
 */
export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'lifeStage', '_status'],
  },
  versions: {
    drafts: true,
  },
  access: {
    read: staffOnly,
    create: staffOnly,
    update: staffOnly,
    delete: superAdminOnly,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Stable identifier used to request commerce price/availability.' },
    },
    { name: 'shortDescription', type: 'textarea' },
    { name: 'description', type: 'richText' },
    {
      name: 'lifeStage',
      type: 'select',
      options: [
        { label: 'Puppy', value: 'puppy' },
        { label: 'Adult', value: 'adult' },
        { label: 'Senior', value: 'senior' },
        { label: 'All life stages', value: 'all' },
      ],
    },
    { name: 'ingredients', type: 'textarea' },
    { name: 'suitability', type: 'text', hasMany: true },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
      ],
    },
  ],
}
