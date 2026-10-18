# Proof of Done

An issue tracker for tasks that require action in the physical world. A task moves from request to vendor research, human approval, booking, and verified completion. Fo is the action agent; this app is the private control desk and evidence trail.

## Run locally

Requires Node.js 20 or newer.

```powershell
npm ci
npm start
```

Open `http://127.0.0.1:4173/` in Chrome. Create a local workspace account, then click **Connect Fo**. The app registers an OAuth client with Wajo, redirects you to Wajo for authorization, and uses the authorized Fo MCP tools `ask_fo` and `get_fo_reply`. A Wajo login in another browser does not automatically authorize this app. The local callback must stay at `127.0.0.1:4173` (or use `localhost` consistently).

Fo OAuth tokens, app login sessions, and registered Fo clients are held in server memory. Restarting the server requires signing back into the local workspace and reconnecting Fo. No Fo token is stored in the browser or committed to Git. Local tasks, password hashes, and evidence photos are in `.data/`, which is ignored by Git.

## Try the real workflow

1. Use **New task → Poster** for a short task you can actually finish, or open the imported GitHub poster issue. Use **Edit brief** to add your city, print file details, deadline, and true spending limit before sending anything to Fo. These added details stay in your private workspace.
2. Click **Ask Fo for quotes**. Review the exact task details and permitted outreach, then authorize it. The app sends a real MCP request in a new Fo conversation and keeps its conversation ID private. The reply appears in the task, labeled **LIVE MCP**. **Check Fo reply** retrieves later results. If Fo asks a question, **Reply to Fo** continues that same conversation; the exact reply is shown before sending.
3. Record an actual vendor quote, then approve one option. For a setback, mark the task blocked and use **Try another path**, or schedule an explicitly authorized Fo follow-up. Fo may research and contact providers within the shown scope; it may not spend or book during research.
4. Only after a specific quote is approved, use **Ask Fo to book**. This sends the approved vendor and maximum total. A changed price, deposit, or payment request requires fresh approval.
5. Record a booking only after obtaining its real confirmation. Mark done only after checking the physical outcome; add a photo or receipt if possible. Photos are served only to the task owner.

The **Load demo workspace** and **Simulate next step** paths are labeled simulated and never call Fo. A Fo response, including one with status `complete`, does not automatically mark a task booked or verified.

## GitHub issue integration

The target repository is `BlackBeanEagles/fo`. Create a local app account first and set `GITHUB_TASK_OWNER` to that account's username and `GITHUB_ALLOWED_REPOSITORY=BlackBeanEagles/fo`. The owner's sidebar then offers **Sync GitHub issues**. It imports open issues labeled `fo` into that account only. Set `GITHUB_POLL=1` for a background check every two minutes. The public repository can be read without a token. This local route makes a real issue demo possible without exposing the preview server on the internet. The sync checks the first 100 matching open issues and skips pull requests and duplicates.

For webhook intake instead, set `GITHUB_WEBHOOK_SECRET` to a new random value. Configure GitHub's `issues` webhook to send to `https://YOUR_PUBLIC_HOST/api/github/webhook` with the same secret. An opened or newly labeled issue carrying label `fo` becomes a private task for the configured owner. Replayed events do not create duplicates.

For status comments, also set `GITHUB_TOKEN` to a fine-grained token with **Issues: read and write** on this repository and `GITHUB_SYNC_COMMENTS=1`. Comments contain only task ID and high-level status; private Fo replies, vendor details, prices, and evidence stay in the app. After a verified completion is recorded, the integration closes the GitHub issue. GitHub must reach an HTTPS deployment or tunnel for webhooks; the default `127.0.0.1` server is not reachable from GitHub. Do not publish a local test server with real credentials without HTTPS and deployment-grade session storage.

## Privacy and limits

- Tasks, receipts, evidence photos, and Fo calls are scoped to the signed-in local account. Tests cover cross-account access to task and Fo routes.
- Booking and spending are gated by a human-selected vendor and quoted amount. The UI shows Fo's permitted action before sending it.
- Follow-ups can run automatically only when the user explicitly opts in while Fo is connected. They can seek alternatives and quotes but cannot book or spend.
- Fo tool responses are preserved as reported. Vendor quotes and booking confirmations must be checked before recording them as facts. Completion needs separate evidence. A free-form reply to Fo cannot authorize booking or spending; use the gated booking flow.
- This is a local hackathon build. Sessions and Fo tokens do not survive restarts; rate limiting, durable encrypted tokens, and production hosting are still needed for a public service.

Run `npm test` to check workflow, GitHub webhook signatures and deduplication, photo ownership, and account isolation. See [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) for the real demo sequence and [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md) for a draft writeup. Recording and posting are left for the team.
