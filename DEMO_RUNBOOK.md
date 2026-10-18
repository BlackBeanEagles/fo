# Real demo runbook

This is a checklist for preparing a real, one-take demo. Do not present simulated scenarios as real Fo outcomes. As of Oct 18, Fo reports two quote-request emails sent; the poster is still open with no vendor quote or physical proof.

## Before recording

1. Run one current server and open its exact port in the same Chrome profile where Wajo is signed in. Sign into the dedicated local workspace and connect Fo. Verify the sidebar says **Fo is connected**. A second port has a separate server-side Fo connection even when the browser has a Wajo login.
2. Create one real task that can finish quickly. Set **Done when** to an outcome a person can check, plus the actual city, requirements, deadline, and price ceiling. The poster path needs a real print-ready file and a person able to receive or collect it. If those are unavailable, use a different real task whose outcome can be verified before submission.
3. Click **Ask Fo for quotes**. Check that the task displays a real Fo reply and conversation ID. If Fo cannot reach a shop, show the setback honestly and use **Try another path**.
4. For a quote-only task, log the provider's actual written reply and verify its itemized price and timing. For a physical task, record a genuine quote, approve it, and ask Fo to book within the approved amount. If Fo cannot book, keep the physical task open and explain the dependency.
5. Check the defined outcome yourself, tick the human-verification attestation, and record the evidence. A physical pickup should include its real confirmation and preferably a receipt or photo. The task should then show **Verified done**. A Fo `complete` reply alone does not close it.
6. Create a GitHub issue labeled `fo` in `BlackBeanEagles/fo` after webhook and owner configuration. Verify that it appears only in the mapped account, and that GitHub receives a status comment if comments are enabled.
7. Export the **proof packet** and the redacted **run trace** from the real task. Check that Fo reports, provider replies logged by the owner, and human verification are labeled by source; that contact details are redacted; and that actions made directly in Wajo are disclosed as outside the app log. Record the board's distinct-task run count and verified-success count.
8. Keep a second local account available for the privacy check. It should not see the real task, trace, or evidence.

## Suggested one-minute sequence

- **0–8 seconds:** The problem: issue trackers call work done when they have only produced a suggestion.
- **8–20 seconds:** Create the poster task and show the exact Fo permission preview.
- **20–34 seconds:** Show live Fo outreach and an actual response, including a setback and retry if it occurred. The key action must be live or in one unedited take.
- **34–44 seconds:** Show the actual provider quote or, for a physical task, approve the amount and show a real booking confirmation.
- **44–55 seconds:** Verify the stated outcome with its real evidence. For a physical poster, show the collected print or receipt. For a quote-only task, show the written provider reply and the person’s check.
- **55–60 seconds:** Show the proof chain, run ledger, and product name. Show GitHub status only if that issue actually received the update.

Use only events that actually occurred. The current poster run has real Fo-reported quote emails but no verified vendor response or physical completion. If the live path is incomplete at recording time, show the open state and choose a smaller independently verifiable action for the one-take demo.
