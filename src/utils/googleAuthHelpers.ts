export interface GoogleAuthUiState {
  isSignedIn: boolean;
  hasActiveSyncToken: boolean;
  userLabel: string | null;
}

export function resolveGoogleAuthState(params: {
  hasFirebaseUser: boolean;
  userEmail?: string | null;
  displayName?: string | null;
  hasAccessToken: boolean;
}): GoogleAuthUiState {
  if (!params.hasFirebaseUser) {
    return {
      isSignedIn: false,
      hasActiveSyncToken: false,
      userLabel: null,
    };
  }

  const label = params.userEmail?.trim() || params.displayName?.trim() || 'Akun Google';
  return {
    isSignedIn: true,
    hasActiveSyncToken: Boolean(params.hasAccessToken),
    userLabel: label,
  };
}

export function buildGoogleProviderParams(
  loginHint?: string | null,
): Record<string, string> {
  const hint = loginHint?.trim();
  if (hint) {
    return { login_hint: hint };
  }
  return { prompt: 'select_account' };
}
