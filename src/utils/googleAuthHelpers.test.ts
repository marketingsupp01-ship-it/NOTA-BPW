import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleProviderParams, resolveGoogleAuthState } from './googleAuthHelpers';

test('resolveGoogleAuthState keeps user signed in across refresh even before token is renewed', () => {
  assert.deepEqual(
    resolveGoogleAuthState({
      hasFirebaseUser: true,
      userEmail: 'marketingsupp01@gmail.com',
      hasAccessToken: false,
    }),
    {
      isSignedIn: true,
      hasActiveSyncToken: false,
      userLabel: 'marketingsupp01@gmail.com',
    },
  );
});

test('resolveGoogleAuthState marks active sync token when both Firebase user and access token exist', () => {
  assert.deepEqual(
    resolveGoogleAuthState({
      hasFirebaseUser: true,
      userEmail: 'vaniandriana.ch@gmail.com',
      hasAccessToken: true,
    }),
    {
      isSignedIn: true,
      hasActiveSyncToken: true,
      userLabel: 'vaniandriana.ch@gmail.com',
    },
  );
});

test('resolveGoogleAuthState returns signed out state when Firebase user is absent', () => {
  assert.deepEqual(
    resolveGoogleAuthState({
      hasFirebaseUser: false,
      userEmail: 'marketingsupp01@gmail.com',
      hasAccessToken: true,
    }),
    {
      isSignedIn: false,
      hasActiveSyncToken: false,
      userLabel: null,
    },
  );
});

test('buildGoogleProviderParams targets saved email with login_hint and uses select_account when empty', () => {
  assert.deepEqual(buildGoogleProviderParams('marketingsupp01@gmail.com'), {
    login_hint: 'marketingsupp01@gmail.com',
  });
  assert.deepEqual(buildGoogleProviderParams(''), {
    prompt: 'select_account',
  });
  assert.deepEqual(buildGoogleProviderParams(null), {
    prompt: 'select_account',
  });
});
