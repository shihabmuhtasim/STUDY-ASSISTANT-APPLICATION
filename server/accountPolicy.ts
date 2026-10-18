export function adminPromotion(email: string, emailVerified: boolean | undefined, allowedEmails: Set<string>): { plan?: 'pro'; role?: 'admin' } {
  return emailVerified === true && allowedEmails.has(email.toLowerCase()) ? { plan: 'pro', role: 'admin' } : {};
}
