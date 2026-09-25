export { createDb, checkDatabase } from './client.js';
export type { AppDb, TenantTransaction } from './client.js';
export { provisionTenant, ProvisioningConflictError } from './provisioning.js';
export type { ProvisionTenantInput } from './provisioning.js';
export { appMetadata, campuses, schools, tenants } from './schema.js';
export { withTenantContext } from './tenant-context.js';
