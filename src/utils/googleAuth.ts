import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  buildGoogleProviderParams,
  resolveGoogleAuthState,
  type GoogleAuthUiState,
} from './googleAuthHelpers';

export const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
] as const;

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

void setPersistence(auth, browserLocalPersistence).catch(() => {
  // Fallback safely if persistent IndexedDB storage is restricted
});

function createGoogleProvider(loginHint?: string | null): GoogleAuthProvider {
  const nextProvider = new GoogleAuthProvider();
  for (const scope of SHEETS_SCOPES) {
    nextProvider.addScope(scope);
  }
  nextProvider.setCustomParameters(buildGoogleProviderParams(loginHint));
  return nextProvider;
}

let isSigningIn = false;
// Access token is cached strictly in memory (never in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export function initGoogleAuth(
  onAuthStateChange?: (state: GoogleAuthUiState, user: User | null) => void,
): () => void {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (!user) {
      cachedAccessToken = null;
    }
    if (isSigningIn && !cachedAccessToken) {
      return;
    }
    const nextState = resolveGoogleAuthState({
      hasFirebaseUser: Boolean(user),
      userEmail: user?.email,
      displayName: user?.displayName,
      hasAccessToken: Boolean(user && cachedAccessToken),
    });
    onAuthStateChange?.(nextState, user);
  });
}

export async function googleSignInForSheets(loginHint?: string | null): Promise<{
  user: User;
  accessToken: string;
}> {
  isSigningIn = true;
  try {
    const effectiveHint = loginHint ?? auth.currentUser?.email ?? null;
    const provider = createGoogleProvider(effectiveHint);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Token akses Google Sheets tidak ditemukan');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getInMemoryAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearInMemoryAccessToken(): void {
  cachedAccessToken = null;
}

export async function googleSignOut(): Promise<void> {
  cachedAccessToken = null;
  await signOut(auth);
}

