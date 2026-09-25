import { and, eq } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import { BUILT_IN_ROLE_TEMPLATES } from './authorization-catalog.js';
import { authorizationRolePermissions, authorizationRoles } from './schema.js';

export async function seedTenantAuthorization(tx: TenantTransaction, tenantId: string): Promise<void> {
  for (const template of BUILT_IN_ROLE_TEMPLATES) {
    await tx.insert(authorizationRoles).values({
      tenantId,
      key: template.key,
      name: template.name,
      systemKey: template.key,
    }).onConflictDoNothing();

    const [role] = await tx.select({ id: authorizationRoles.id })
      .from(authorizationRoles)
      .where(and(
        eq(authorizationRoles.tenantId, tenantId),
        eq(authorizationRoles.systemKey, template.key),
      ))
      .limit(1);
    if (!role) throw new Error(`Built-in authorization role ${template.key} could not be seeded`);

    if (template.permissionKeys.length > 0) {
      await tx.insert(authorizationRolePermissions).values(template.permissionKeys.map((permissionKey) => ({
        tenantId,
        roleId: role.id,
        permissionKey,
      }))).onConflictDoNothing();
    }
  }
}
