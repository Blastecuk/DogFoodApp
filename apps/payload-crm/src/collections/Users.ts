import type { CollectionConfig } from 'payload'

import { isSuperAdmin, staffOnly, superAdminFieldWrite, superAdminOnly } from '../access/roles'

/**
 * Staff accounts (Payload Auth). Only SuperAdmin and Admin exist here.
 * Customer accounts live in Better Auth / commerce_db, never in Payload.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role'],
  },
  auth: true,
  access: {
    read: staffOnly,
    create: superAdminOnly,
    update: ({ req: { user }, id }) =>
      isSuperAdmin(user as never) || (user?.id === id ? true : false),
    delete: superAdminOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'admin',
      options: [
        { label: 'Super Admin', value: 'superadmin' },
        { label: 'Admin', value: 'admin' },
      ],
      // Only a SuperAdmin may grant or change roles.
      access: {
        create: superAdminFieldWrite,
        update: superAdminFieldWrite,
      },
    },
  ],
}
