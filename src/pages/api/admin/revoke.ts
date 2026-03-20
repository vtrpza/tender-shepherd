import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/admin';
import { isValidSlug } from '../../../lib/modules';
import { revokeModuleAccess } from '../../../lib/db';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { userId } = locals.auth();
  if (!isAdmin(userId)) {
    return new Response('Forbidden', { status: 403 });
  }

  const formData = await request.formData();
  const targetUserId = formData.get('userId') as string;
  const moduleSlug = formData.get('moduleSlug') as string;
  const returnTo = (formData.get('returnTo') as string) || '/admin/users';

  if (!targetUserId || !moduleSlug || !isValidSlug(moduleSlug)) {
    return new Response('Invalid parameters', { status: 400 });
  }

  await revokeModuleAccess(targetUserId, moduleSlug);
  return redirect(returnTo, 303);
};
