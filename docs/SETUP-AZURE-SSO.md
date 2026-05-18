# Setup — Real Microsoft Entra ID SSO

This walks through wiring real Microsoft Entra ID (Azure AD) authentication via Supabase Auth, so the "Sign in with Microsoft" button on the login screen actually performs an OAuth flow against your Azure tenant.

If you skip this, the SSO button will show "Azure provider not configured" — email/password login still works.

## Prerequisites

- An Azure tenant (free tier is fine)
- Admin access to the Supabase project (`sgzboygiqtegxuhhdhmz`)
- Local dev running at `http://localhost:8081` (frontend) and `http://localhost:3001` (backend)

## Steps

### 1. Register the Azure AD app

1. Go to <https://portal.azure.com> → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Name: `GoalFlow`
3. Supported account types:
   - **For demo / dev (recommended during hackathon judging):** *Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) **and personal Microsoft accounts*** — lets you sign in with `@outlook.com`, `@hotmail.com`, `@live.com`, AND any work account from any Microsoft tenant. Pairs with **Azure Tenant URL = `https://login.microsoftonline.com/common`** in Supabase.
   - **For locked-down production:** *Accounts in this organizational directory only* (single tenant). Personal `@outlook.com` accounts will be rejected with `AADSTS50020`.
4. Redirect URI:
   - Platform: **Web** *(NOT Single-page application — Supabase uses the server-side code-exchange flow with a client secret, which is incompatible with SPA + PKCE-required mode. Picking SPA here causes `AADSTS9002325: Proof Key for Code Exchange is required for cross-origin authorization endpoint`.)*
   - URI: `https://sgzboygiqtegxuhhdhmz.supabase.co/auth/v1/callback`
5. Click **Register**

After registration, on the app's Overview page note:
- **Application (client) ID**
- **Directory (tenant) ID**

### 2. Add a client secret

1. **Certificates & secrets** → **New client secret**
2. Description: `GoalFlow Supabase`
3. Expires: 24 months
4. Click **Add** and immediately **copy the Value** (you won't see it again)

### 3. Configure API permissions

1. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**
2. Add: `email`, `openid`, `profile`, `User.Read`
3. Click **Grant admin consent** at the bottom

### 4. Wire it into Supabase

1. Go to <https://supabase.com/dashboard/project/sgzboygiqtegxuhhdhmz/auth/providers>
2. Find **Azure (Microsoft)** → toggle **Enable**
3. Paste:
   - **Azure Tenant URL**: depends on what you picked in step 1.3:
     - **Multi-tenant + personal accounts (demo mode)** → `https://login.microsoftonline.com/common`
     - **Single tenant** → `https://login.microsoftonline.com/<YOUR-TENANT-ID>`
     *(do NOT add `/v2.0` — Supabase appends `/oauth2/v2.0/authorize` itself; including `/v2.0` here causes a 404)*
   - **Azure Client ID**: from step 1
   - **Azure Secret**: from step 2
4. **Redirect URL** (shown read-only) should match what you set in Azure
5. Click **Save**

### 5. Allow the frontend redirect URL

Still in Supabase Auth settings:
1. **URL Configuration** → **Site URL**: `http://localhost:8081`
2. **Redirect URLs**: add `http://localhost:8081/auth/callback`

### 6. Test

1. Restart the backend (it picks up `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` from `.env`)
2. Open <http://localhost:8081/login>
3. Click **Sign in with Microsoft**
4. You should be redirected to Microsoft's consent screen
5. After consent you'll bounce through `/auth/callback` and land on your role-specific dashboard

A new GoalFlow user is auto-provisioned with role `EMPLOYEE` and department `Unassigned` if it doesn't already exist — an admin can then promote and assign a manager via the **Org Hierarchy** page.

### 7. Enable hierarchy + role sync (BRD §5.1 full implementation)

So far SSO authenticates the user. To also pull their **direct manager** from Azure AD and assign their **role from AD group membership** on every sign-in, do this:

#### 7a. Enable the `groups` claim on the Azure app

1. Azure portal → **App registrations** → **Atomberg** → **Token configuration**
2. **Add groups claim** → check **ID** + **Access** + **SAML** token boxes
3. Group ID format: **Group ID** (so the claim carries Object IDs / GUIDs)
4. Save

Now the user's ID token will include a `groups: ["<guid>", "<guid>"]` claim. Supabase passes this through to the backend via `user_metadata.groups`.

#### 7b. Confirm `User.Read` delegated permission

(You already added this in step 3.) Manager lookup uses Microsoft Graph `/me/manager`, which only needs `User.Read` delegated. No additional permissions needed.

#### 7c. Find your AD group Object IDs

1. **Microsoft Entra ID** → **Groups**
2. Create or pick two groups, e.g. `GoalFlow Admins`, `GoalFlow Managers`
3. Click each → copy **Object ID** (GUID)
4. Add the relevant users as members of these groups

#### 7d. Configure the role-mapping env vars

Edit `goalflow-backend/.env`:

```
ENTRA_GROUP_ADMIN=00000000-0000-0000-0000-000000000000
ENTRA_GROUP_MANAGER=11111111-1111-1111-1111-111111111111
```

(Multiple GUIDs comma-separated if more than one AD group should grant the role.)

Restart the backend.

#### 7e. Verify the sync works

1. Sign out of GoalFlow → sign back in with Microsoft
2. Backend log should print: `[entra-sync] user enriched { user, role, manager, groups: 2 }`
3. Audit log on `/admin/audit` shows a new **"Synced from Entra ID"** entry with previous → new role / manager values
4. If the user's manager (looked up by email) doesn't yet exist in GoalFlow, the managerId stays null — they'll get linked when the manager logs in for the first time

#### 7f. Admin one-click sync trigger

The admin can also visit `/admin/hierarchy` → click **Sync from Entra ID** → see how many users are still missing a manager. Per-user updates happen at each user's next SSO login (bulk service-principal sync is out of hackathon scope).

## How it works under the hood

```
Browser → supabase.auth.signInWithOAuth({ provider: 'azure' })
       → 302 to Azure AD consent page
       → 302 to https://<project>.supabase.co/auth/v1/callback
       → 302 to http://localhost:8081/auth/callback
       → supabase.auth.getSession()           // pulls the access_token
       → POST /auth/sso/microsoft { accessToken }   // to our Fastify API
       → API calls supabase.auth.getUser(accessToken)  // validates via JWKS
       → API finds or creates the GoalFlow user
       → API issues its own JWT cookie
       → Frontend redirects to role-specific dashboard
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Azure provider not configured in Supabase" toast | Step 4 didn't save, or you're on a different Supabase project |
| Sign-in succeeds but `/auth/callback` shows "Invalid Supabase token" | Backend's `SUPABASE_URL` doesn't match the one in the frontend |
| 401 from Supabase Auth | Check that the redirect URL in Azure exactly matches the one shown in Supabase |
| **`AADSTS50020: User account ... does not exist in tenant`** | Personal Microsoft account (`@outlook.com` / `@live.com`) hitting a single-tenant app. Either (a) switch the app registration to *"any org + personal accounts"* and set Supabase tenant URL to `/common` (see step 1.3 demo mode), or (b) sign in with a work account from the configured tenant. |
| User created but landed as EMPLOYEE in Unassigned dept | Expected — admin needs to promote via Org Hierarchy → user card → edit. Production org-sync would pull from MS Graph (hook exposed at `POST /users/sync-hierarchy`). |
