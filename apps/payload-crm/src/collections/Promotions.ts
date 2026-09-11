import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { isSuperAdmin, staffOnly, superAdminOnly } from '../access/roles'

const ACTIVATION_STATES = ['approved', 'active'] as const

/**
 * Editable promotion / discount-campaign proposals owned by Payload.
 *
 * Like supplier costs, only SuperAdmin may approve or activate a promotion.
 * The authoritative discount rules, reservations and redemptions live in Neon
 * (commerce), enforced by iii.dev with contribution-floor checks at checkout.
 */
export const Promotions: CollectionConfig = {
  slug: 'promotions',
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'kind', 'status', 'valuePence', 'active'],
  },
  access: {
    read: staffOnly,
    create: staffOnly,
    update: staffOnly,
    delete: superAdminOnly,
  },
  hooks: {
    beforeChange: [
      ({ data, req, originalDoc }) => {
        const nextStatus = data?.status
        const prevStatus = originalDoc?.status
        if (
          nextStatus &&
          nextStatus !== prevStatus &&
          (ACTIVATION_STATES as readonly string[]).includes(nextStatus) &&
          !isSuperAdmin(req.user as never)
        ) {
          throw new APIError('Only a SuperAdmin may approve or activate a promotion.', 403)
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'code', type: 'text', required: true, unique: true },
    { name: 'description', type: 'text' },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'fixed',
      options: [
        { label: 'Fixed amount off', value: 'fixed' },
        { label: 'Percentage off', value: 'percentage' },
      ],
    },
    {
      name: 'valuePence',
      type: 'number',
      min: 0,
      admin: { description: 'Fixed discount in pence, or percent (0-100) when kind = percentage.' },
    },
    {
      name: 'firstOrderOnly',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Submitted for approval', value: 'submitted' },
        { label: 'Approved', value: 'approved' },
        { label: 'Active', value: 'active' },
        { label: 'Expired', value: 'expired' },
      ],
    },
    {
      name: 'expiresAt',
      type: 'date',
    },
  ],
}
