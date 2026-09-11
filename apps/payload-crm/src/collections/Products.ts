import type { CollectionConfig } from 'payload'

import { staffOnly, superAdminOnly } from '../access/roles'
import { syncCatalogAfterChange } from '../hooks/syncCatalog'

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
  hooks: {
    // On publish, push accepted variant pricing to iii.dev's signed sync endpoint,
    // which commits it to the commerce catalog_skus read model.
    afterChange: [syncCatalogAfterChange],
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
      name: 'variants',
      type: 'array',
      admin: {
        description:
          'Purchasable variants. Retail price is a proposal; it becomes checkout-authoritative only after publish syncs it to commerce catalog_skus.',
      },
      fields: [
        { name: 'variantLabel', type: 'text', required: true },
        { name: 'supplierSku', type: 'text' },
        {
          name: 'retailPricePence',
          type: 'number',
          required: true,
          min: 0,
          admin: { description: 'Gross retail price in pence (inc VAT).' },
        },
        { name: 'active', type: 'checkbox', defaultValue: true },
      ],
    },
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
