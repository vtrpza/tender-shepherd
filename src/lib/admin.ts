export function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const ids = (import.meta.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}
