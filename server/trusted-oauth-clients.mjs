// Hosts allowed to start the OAuth flow.
// client_id must be an https URL on one of these hosts. The redirect URI still has to be
// listed in the client metadata that host publishes.
export const TRUSTED_OAUTH_CLIENT_HOSTS = new Set([
    'chatgpt.com',
    'claude.ai',
    'claude.com',
]);
