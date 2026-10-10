// Backend-enforced RBAC. The frontend may hide buttons; only this decides access.
export const ROLES = ['super_admin', 'admin', 'manager', 'support', 'inventory_manager', 'content_manager'];

export const ALL_PERMISSIONS = ['dashboard:read', 'products:read', 'products:write', 'inventory:read', 'inventory:write',
  'orders:read', 'orders:write', 'customers:read', 'customers:manage', 'coupons:write', 'reviews:moderate',
  'returns:manage', 'refunds:process', 'payments:read', 'analytics:read', 'content:write', 'newsletter:read',
  'messages:read', 'staff:manage', 'settings:manage', 'audit:read'];

export const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: ALL_PERMISSIONS.filter((p) => p !== 'staff:manage'),
  manager: ['refunds:process', 'dashboard:read', 'products:read', 'products:write', 'inventory:read', 'inventory:write',
    'orders:read', 'orders:write', 'customers:read', 'coupons:write', 'reviews:moderate',
    'returns:manage', 'analytics:read', 'messages:read'],
  support: ['dashboard:read', 'orders:read', 'customers:read', 'returns:manage', 'reviews:moderate', 'messages:read'],
  inventory_manager: ['dashboard:read', 'products:read', 'inventory:read', 'inventory:write'],
  content_manager: ['dashboard:read', 'products:read', 'content:write', 'newsletter:read', 'reviews:moderate'],
};

export const permissionsFor = (role) => { const p = ROLE_PERMISSIONS[role] ?? []; return p.includes('*') ? ALL_PERMISSIONS : p; };

export const can = (role, permission) => {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes('*') || perms.includes(permission);
};
