# Submission kit — draft, not submitted

## Positioning

**Project:** Proof of Done — an outcome contract for real-world issues.

**Who it serves:** A small team whose ticket says “get this fixed” but whose work happens across calls, email, quotes, approval, and physical delivery. A useful next-week example is a team needing a broken office device repaired without losing track of who approved the cost or whether it works again.

**What is distinct:** Fo does the outside-world outreach. Proof of Done turns an issue into an explicit success check, gives Fo a bounded brief, records its MCP calls and human decisions, and keeps the issue open until a person checks the result. Recovery after a setback is part of the same record. GitHub receives only a coarse status; vendor messages and receipts stay with the task owner.

## Current honest evidence (update before recording)

- One real poster task was sent to Fo. Wajo shows CopyMat's itemized $130.89 response and its correction that pickup cannot be before noon, whereas the task's limit was $40 and the requested time was 9 AM. Fo asked clarifying follow-ups; no order or payment was made. The original Wajo reply and quote are not yet imported into that task's app record. There is no print-ready file, pickup, or completion proof.
- The first run predates exact MCP-call telemetry. Its export contains the saved Fo request and responses but labels later tool names as unattributed. The approval sent in Wajo's own chat is outside the app trace. A new run through the updated app is needed for a complete app-to-Fo trace.
- The demo workspace and “Simulate next step” remain simulated. Never present those cards as live Fo outcomes. The new `fo_showcase` account is empty until a fresh real task is created and sent.
- GitHub issue [#1](https://github.com/BlackBeanEagles/fo/issues/1) was imported into the `hge` workspace. A new, smaller inquiry, [issue #2](https://github.com/BlackBeanEagles/fo/issues/2), was imported into the `fooo` workspace. Issue #2 has not yet started a Fo run or received an issue status update, so the full issue-to-Fo-to-issue loop remains unverified.

## Form fields to prepare

**A — X quote-repost link:** [Insert after posting.]

**B — Team emails and content consent:** [The team enters its own emails and consent in the official form.]

**C — Video/demo:** [Record later. Show the key real action live or in one unedited take, as the rules require.]

**D — Short write-up:** Proof of Done is for teams whose issue trackers stop at a recommendation while the real work continues with people and vendors. We built a private control desk that scopes Fo's outreach, captures quotes and setbacks, asks a person to approve spending, and requires real-world evidence before closing an issue. [Describe the actual verified result here.] Early UI and simulated workflow existed before the event; [team to confirm the exact pre-event scope]. The live Fo connection, run ledger, and final demo path were built during the event. The demo workspace is mocked; [list any other hard-coded parts].

**E — Build note:** The app uses Fo MCP `ask_fo` and `get_fo_reply`, OAuth with PKCE, and GitHub issue APIs. We added per-account task isolation, explicit approval and completion gates, a redacted run trace, recovery actions, and private receipts. An early live run stalled when Fo needed a reply and the app had no reply field; we answered through Wajo's chat, then added an in-task reply form. [Test that new reply path live before claiming it works.]

**F — Run trace:** Export the redacted JSON from the real task and its proof packet. For the current older run, disclose its partial provenance. For a stronger submission, run a fresh task through the updated app and export its exact `ask_fo` and `get_fo_reply` calls. Fo's internal email and phone calls are not exposed by this app; show Wajo's actual action evidence separately if available. Owner-entered provider notes are labeled as logs, not authenticated records.

**G — Run count:** Count distinct real tasks sent to Fo in the workspace selected for the demo; count success only after human-verified completion. Read the current numbers from that workspace immediately before submitting. The newly imported issue #2 has **0 Fo runs and 0 verified successes** so far.

## X caption draft

“A ticket saying ‘done’ should mean the real-world job was checked. We built Proof of Done on Fo: a bounded request, real outreach, approval before booking, a recovery path, and proof before closure. In this demo Fo [insert actual action]; the task remains open until [insert real verification].”

Attach the unedited demo video to the quote-repost of the founder's launch post. Keep private account details, vendor contact data, and the participant-only access link out of public material.

## Timing and unresolved rule conflict

- **Monday Oct 19, 10:15 AM Pacific / 10:45 PM India:** X quote-repost due. The founder's post is expected at 10:00 AM Pacific.
- **Tuesday Oct 20:** The newer Discord text says form due at 10:15 AM Pacific; a screenshot says 10:00 AM Pacific. Have every field ready and submit before **10:00 AM Pacific / 10:30 PM India**.
- The participant messages disagree about whether likes count for only 24 hours or until Friday Oct 23 at noon Pacific. Treat the first 24 hours as critical and keep sharing through the stated Friday close. Verify the rule in the latest Discord announcement before quoting a voting deadline publicly.
- Hardware reimbursement refers to a rough demo at 5 PM Pacific on Oct 17, now past. A device is optional and should only be included if it has a real working role and the organizers confirm eligibility.
