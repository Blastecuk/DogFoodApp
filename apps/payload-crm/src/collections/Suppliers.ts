import type { CollectionConfig } from 'payload'

import { staffOnly, superAdminOnly } from '../access/roles'

/**
 * Supplier records. Private commercial data — staff-only, never public.
 * Approved supplier costs are stored immutably in Neon (commerce), not here;
 * Payload only holds the editable supplier record and proposals.
 */
export const Suppliers: CollectionConfig = {
  slug: 'suppliers',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'contactEmail', 'active'],
  },
  access: {
    read: staffOnly,
    create: staffOnly,
    update: staffOnly,
    delete: superAdminOnly,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'contactEmail', type: 'email' },
    { name: 'contactPhone', type: 'text' },
    { name: 'notes', type: 'textarea' },
    { name: 'active', type: 'checkbox', defaultValue: true },
  ],
}
