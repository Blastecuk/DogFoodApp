import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { isSuperAdmin, staffOnly, superAdminOnly } from '../access/roles'

const APPROVAL_STATES = ['approved', 'rejected', 'active'] as const

/**
 * Editable supplier-cost proposals owned by Payload.
 *
 * Non-negotiable ownership (architecture spec #18): only SuperAdmin may approve,
 * reject, activate, revoke or supersede supplier costs. Admin may prepare and
 * submit proposals but can never move them into an approval state — enforced by
 * the beforeChange hook below. The immutable approved version lives in Neon.
 */
export const SupplierPriceProposals: CollectionConfig = {
  slug: 'supplier-price-proposals',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'supplier', 'status', 'costPence', 'updatedAt'],
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
          (APPROVAL_STATES as readonly string[]).includes(nextStatus) &&
          !isSuperAdmin(req.user as never)
        ) {
          throw new APIError(
            'Only a SuperAdmin may approve, reject or activate a supplier-price proposal.',
            403,
          )
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'supplier', type: 'relationship', relationTo: 'suppliers', required: true },
    { name: 'product', type: 'relationship', relationTo: 'products' },
    {
      name: 'supplierSku',
      type: 'text',
      admin: { description: 'Supplier stock-keeping unit for this cost line.' },
    },
    {
      name: 'costPence',
      type: 'number',
      required: true,
      min: 0,
      admin: { description: 'Proposed supplier cost in pence (integer, ex-VAT).' },
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
        { label: 'Rejected', value: 'rejected' },
        { label: 'Active', value: 'active' },
      ],
      admin: {
        description:
          'Admin may set Draft/Submitted only. Approved/Rejected/Active require SuperAdmin.',
      },
    },
    {
      name: 'version',
      type: 'number',
      defaultValue: 1,
      admin: { description: 'Proposal version; the activated version is snapshotted into Neon.' },
    },
  ],
}
