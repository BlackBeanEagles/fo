# Real demo runbook

This is a checklist for preparing the live path. Do not present the simulated scenarios as real Fo outcomes.

## Before recording

1. Open the local app in the same Chrome profile where Wajo is signed in. Create a dedicated app workspace account and connect Fo. Verify the sidebar says **Fo is connected** and the account exposes `ask_fo`.
2. Create one real task that can finish quickly, such as printing and collecting one hackathon poster. Add the actual city, printer requirements, deadline, and price ceiling. Use a real print file you are allowed to share.
3. Click **Ask Fo for quotes**. Check that the task displays a real Fo reply and conversation ID. If Fo cannot reach a shop, show the setback honestly and use **Try another path**.
4. Record a genuine quote, approve it, and ask Fo to book within the approved amount. If Fo cannot book, keep the task open and explain the dependency.
5. Save the real confirmation. Pick up or receive the print. Verify it yourself and attach a real receipt or photo. The task should then show **Verified done**.
6. Create a GitHub issue labeled `fo` in `BlackBeanEagles/fo` after webhook and owner configuration. Verify that it appears only in the mapped account, and that GitHub receives a status comment if comments are enabled.
7. Keep a second local account available for the privacy check. It should not see the real task or evidence.

## Suggested one-minute sequence

- **0–8 seconds:** The problem: issue trackers call work done when they have only produced a suggestion.
- **8–20 seconds:** Create the poster task and show the exact Fo permission preview.
- **20–34 seconds:** Show live Fo outreach and an actual quote, including a setback and retry if it occurred.
- **34–44 seconds:** Approve the selected amount and show a real booking confirmation.
- **44–55 seconds:** Show the collected poster or receipt, then the private proof view and final verified state.
- **55–60 seconds:** Show the GitHub issue status and the product name.

Use only events that actually occurred. The current product has no live Fo outcome until account authorization and a task request are completed.
