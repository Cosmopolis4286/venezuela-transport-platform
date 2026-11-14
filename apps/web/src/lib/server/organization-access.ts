import 'server-only';
import type { OrganizationMembershipSummary, OrganizationPermission } from '@vtp/shared-types';
import { notFound, redirect } from 'next/navigation';
import { ApiError, apiFetch } from './api';

/**
 * The signed-in member's view of an organization, before a portal page asks for anything else.
 * Not a member (or no such organization): 404, as the API answers. A member whose role lacks
 * `permission`: back to the organization's page with a notice, instead of an error page. The API
 * checks the same permission on every call; this only keeps pages from half-rendering.
 */
export async function requireOrganizationPermission(
  organizationId: string,
  permission?: OrganizationPermission,
): Promise<OrganizationMembershipSummary> {
  let membership: OrganizationMembershipSummary;
  try {
    membership = await apiFetch<OrganizationMembershipSummary>(
      `/organizations/${encodeURIComponent(organizationId)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  if (permission && !membership.permissions.includes(permission)) {
    redirect(`/portal/organizations/${membership.organization.id}?denied=1`);
  }
  return membership;
}
