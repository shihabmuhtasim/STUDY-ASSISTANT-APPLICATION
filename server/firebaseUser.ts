const FIREBASE_API_KEY = 'AIzaSyBTQydgSo-CmDM8kAXunBCqqUlKG8oTS5I';

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  displayName: string;
  idToken: string;
}

export async function verifyFirebaseRequest(request: Request): Promise<VerifiedFirebaseUser | null> {
  const authorization = request.headers.get('authorization') || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!idToken || idToken.length > 8_192) return null;

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const data = await response.json() as { users?: Array<{ localId?: string; email?: string; displayName?: string }> };
  const user = data.users?.[0];
  return user?.localId ? { uid: user.localId, email: user.email || '', displayName: user.displayName || user.email || 'Student', idToken } : null;
}
