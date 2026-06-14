/**
 * API-key capability scopes recognised by the auth layer.
 *
 * Scopes are free-form strings stored on each API key (see `api-key.schema`).
 * Most are domain permissions consumed by feature code; the one defined here is
 * special because the auth layer itself enforces it.
 */

/**
 * Authorises a **trusted service caller** (e.g. a backend-for-frontend that has
 * already authenticated an end user) to act *on behalf of* another user. When a
 * key carrying this scope presents the delegation headers below, the request is
 * processed as that user — resolved/JIT-provisioned by `externalUserId` and
 * authorised by the propagated role.
 *
 * A key WITHOUT this scope has the delegation headers ignored, so an ordinary
 * key (a CLI wrapper, a service account) can never impersonate anyone.
 */
export const ACT_AS_SCOPE = 'act-as';

/** External id of the user to act as (becomes the resolved user's `externalUserId`). */
export const ACT_AS_USER_HEADER = 'x-user-uid';
/** Role asserted for the acted-as user (admin | operator | viewer). */
export const ACT_AS_ROLE_HEADER = 'x-user-role';
/** Optional email mirrored onto the acted-as user. */
export const ACT_AS_EMAIL_HEADER = 'x-user-email';
/** Optional display name mirrored onto the acted-as user. */
export const ACT_AS_NAME_HEADER = 'x-user-name';
