# Real demo runbook

This is a checklist for preparing a real, one-take demo. Do not present simulated scenarios as real Fo outcomes. As of Oct 18, Fo reports two quote-request emails sent; the poster is still open with no vendor quote or physical proof.

## Before recording

1. Run one current server and open its exact port in the same Chrome profile where Wajo is signed in. Sign into the dedicated local workspace and connect Fo. Verify the sidebar says **Fo is connected**. A second port has a separate server-side Fo connection even when the browser has a Wajo login.
2. Create one real task that can finish quickly. Set **Done when** to an outcome a person can check, plus the actual city, requirements, deadline, and price ceiling. The poster path needs a real print-ready file and a person able to receive or collect it. If those are unavailable, use a different real task whose outcome can be verified before submission.
3. Click **Ask Fo for quotes**. Check that the task displays a real Fo reply and conversation ID. If Fo cannot reach a shop, show the setback honestly and use **Try another path**.
4. Record a genuine quote, approve it, and ask Fo to book within the approved amount. If Fo cannot book, keep the task open and explain the dependency.
5. Save the real confirmation. Check the outcome yourself, tick the human-verification attestation, and attach a real receipt or photo if available. The task should then show **Verified done**. A Fo `complete` reply alone does not close it.
6. Create a GitHub issue labeled `fo` in `BlackBeanEagles/fo` after webhook and owner configuration. Verify that it appears only in the mapped account, and that GitHub receives a status comment if comments are enabled.
7. Export the redacted **run trace** from the real task. Check that the call names and arguments are present, contact details are redacted, and any actions made directly in Wajo are disclosed as outside the app log. Record the board's distinct-task run count and verified-success count.
8. Keep a second local account available for the privacy check. It should not see the real task, trace, or evidence.

## Suggested one-minute sequence

- **0–8 seconds:** The problem: issue trackers call work done when they have only produced a suggestion.
- **8–20 seconds:** Create the poster task and show the exact Fo permission preview.
- **20–34 seconds:** Show live Fo outreach and an actual response, including a setback and retry if it occurred. The key action must be live or in one unedited take.
- **34–44 seconds:** Approve the selected amount and show a real booking confirmation.
- **44–55 seconds:** Show the collected poster or receipt, then the private proof view and final verified state.
- **55–60 seconds:** Show the private run ledger, GitHub issue status, and product name.

Use only events that actually occurred. The current poster run has real Fo-reported quote emails but no verified vendor response or physical completion. If the live path is incomplete at recording time, show the open state and choose a smaller independently verifiable action for the one-take demo.
