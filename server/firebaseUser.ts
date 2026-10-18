const FIREBASE_API_KEY = 'AIzaSyBTQydgSo-CmDM8kAXunBCqqUlKG8oTS5I';

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  displayName: string;
  idToken: string;
  emailVerified?: boolean;
}

export async function verifyFirebaseRequest(request: Request): Promise<VerifiedFirebaseUser | null> {
  const authorization = request.headers.get('authorization') || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!idToken || idToken.length > 8_192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken)) return null;

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response) return null;
  if (!response.ok) return null;
  const data = await response.json() as { users?: Array<{ localId?: string; email?: string; displayName?: string; emailVerified?: boolean; disabled?: boolean }> };
  const user = data.users?.[0];
  return user?.localId && !user.disabled ? { uid: user.localId, email: user.email || '', displayName: user.displayName || user.email || 'Student', idToken, emailVerified: user.emailVerified === true } : null;
}
