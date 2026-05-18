// BRD §5.1 — Microsoft Entra ID integration.
//
// Thin Graph API helper. Uses the user's *delegated* Azure access token
// (received as `provider_token` from the Supabase Azure provider) to read
// their direct manager from the Microsoft Graph `/me/manager` endpoint.
//
// Requires only the `User.Read` delegated permission on the Azure AD app,
// which is already configured per docs/SETUP-AZURE-SSO.md.
//
// Soft-fails on every error path — never throws. If Graph is unreachable,
// the token is stale, or the user has no manager, the SSO sign-in flow
// continues normally with no enrichment.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export async function fetchManagerEmail(providerToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me/manager?$select=mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (res.status === 404) return null; // user has no manager configured in AD
    if (!res.ok) return null;
    const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
    const email = data.mail ?? data.userPrincipalName ?? null;
    return email ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}
