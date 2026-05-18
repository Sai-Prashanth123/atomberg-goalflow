# Setup — Email + Teams notifications

Both integrations work end-to-end with real delivery once configured. Without configuration they fall back to **console logging** (visible in `npm run dev` output) so the demo still works offline.

## Resend (transactional email)

### Steps

1. Sign up at <https://resend.com> (free tier: 3000 emails/month, 100/day, no credit card)
2. Dashboard → **API Keys** → **Create API Key** → copy the key (`re_...`)
3. Add to `goalflow-backend/.env`:
   ```env
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   EMAIL_FROM=GoalFlow <onboarding@resend.dev>
   ```
4. Restart the backend
5. Trigger an event (manager approves a goal) → check the recipient inbox

### What gets emailed

| Event | Recipient | Template |
|---|---|---|
| Employee submits goals | Manager | `goalSubmittedHtml` |
| Manager approves a goal | Employee | `goalApprovedHtml` |
| Manager returns a goal | Employee | `goalReturnedHtml` |
| Check-in window opens (cron-based) | All employees | `checkinReminderHtml` |
| Escalation raised | Manager / Skip / HR | `escalationHtml` |

All templates use Atomberg colors (gold accent on white) and the GoalFlow brand wordmark.

### Using your own domain (optional)

For production / serious demos, replace the `resend.dev` sender:
1. Resend → **Domains** → add `atomberg.com` (or subdomain)
2. Add the DKIM + SPF DNS records Resend gives you
3. Change `EMAIL_FROM=GoalFlow <noreply@goalflow.atomberg.com>`

## Microsoft Teams adaptive cards

### Steps

1. In your Teams client: open the channel where you want notifications to land
2. Click the **⋯** (More options) next to the channel name → **Manage channel** → **Edit** under "Connectors"
   - If Connectors aren't visible, your tenant admin has disabled them — ask them to enable "Incoming Webhook" in Teams admin center
3. Find **Incoming Webhook** → **Configure**
4. Name: `GoalFlow`
5. Optionally upload an avatar
6. **Create** → copy the webhook URL
7. Add to `goalflow-backend/.env`:
   ```env
   TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/<long-id>/IncomingWebhook/<another-id>/<tenant-id>
   ```
8. Restart the backend

### What gets posted

Every event that emails (above) also posts an **adaptive card** to Teams with:
- Title with contextual emoji (✅ approval, ↩️ return, 📋 submit, ⚠️ escalation)
- Message body
- Color bar (green/yellow/blue/red)
- `Action.OpenUrl` button deep-linking back to the relevant page in GoalFlow

The deep-link uses `APP_URL` from `.env` (default `http://localhost:8081`) — set this to your hosted URL when deployed.

### Testing without a Teams tenant

If you don't have a Teams workspace, the adaptive card JSON is logged to the backend console with the prefix `[teams:console:<kind>]`. You can:
- Pipe it to <https://adaptivecards.io/designer/> to see the rendering
- Or use a free **Discord webhook** as a stand-in (paste the URL into `TEAMS_WEBHOOK_URL` — Discord ignores most of the adaptive card fields but will show the text)

## Verification

After both integrations are wired, run this demo path:

```bash
# 1. Login as manager
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"priya@atomberg.com","password":"password123"}' \
  -c /tmp/m.cookies

# 2. Approve any pending goal
curl -X PATCH http://localhost:3001/goals/g_aarav_5/approve -b /tmp/m.cookies

# Expected:
#  - Resend dashboard shows 1 sent email to aarav@atomberg.com
#  - Teams channel shows an "Approval" card with a green color bar
#  - `npm run dev` backend log shows:
#       [notify:email] sent via resend
#       [teams:webhook] 200
```
