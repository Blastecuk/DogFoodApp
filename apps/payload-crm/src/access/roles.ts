import type { Access, FieldAccess } from 'payload'

/**
 * The only roles in the platform are SuperAdmin, Admin and User.
 * Payload staff auth only ever issues SuperAdmin or Admin. Customers are
 * authenticated by Better Auth on the storefront, never here.
 */
export type StaffRole = 'superadmin' | 'admin'

export const isSuperAdmin = (user: { role?: StaffRole } | null | undefined): boolean =>
  user?.role === 'superadmin'

export const isStaff = (user: { role?: StaffRole } | null | undefined): boolean =>
  user?.role === 'superadmin' || user?.role === 'admin'

/** Collection-level access: any authenticated staff member. */
export const staffOnly: Access = ({ req: { user } }) => isStaff(user as never)

/** Collection-level access: SuperAdmin only. */
export const superAdminOnly: Access = ({ req: { user } }) => isSuperAdmin(user as never)

/**
 * Field-level access: only SuperAdmin may write. Used to guard supplier-cost
 * and promotion approval/activation fields so Admin can prepare and submit
 * proposals but can never approve them (architecture spec, non-negotiable #18).
 */
export const superAdminFieldWrite: FieldAccess = ({ req: { user } }) => isSuperAdmin(user as never)
