import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { isAdmin } from './lib/admin';

const isProtectedRoute = createRouteMatcher(['/curso(.*)', '/admin(.*)']);
const isAdminRoute = createRouteMatcher(['/admin(.*)']);

export const onRequest = clerkMiddleware((auth, context) => {
  const { isAuthenticated, userId, redirectToSignIn } = auth();
  if (isProtectedRoute(context.request) && !isAuthenticated) {
    return redirectToSignIn();
  }
  if (isAdminRoute(context.request) && !isAdmin(userId)) {
    return new Response('Forbidden', { status: 403 });
  }
});
