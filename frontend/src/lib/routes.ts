/** Default landing route after login — POS first when user has access */
export function getDefaultRoute(permissions?: string[]): string {
  if (permissions?.includes('pos:access')) return '/pos'
  return '/'
}
