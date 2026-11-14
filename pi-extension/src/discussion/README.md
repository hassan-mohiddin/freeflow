# Discussion capture

Freeflow's capture of the user's messages on Pi (D-056): after a run settles, Track Work's `discussion capture` keeps
the turn's user messages word for word in the held task's `discussions/`, or in the session's own file while it holds
no task. `capture.ts` schedules it once the session has stayed idle a moment, cancels it when a run starts, and captures
what is left at shutdown. It names this session (`--session`) and its transcript (`--transcript`, Pi's session file)
itself, commits without pushing, and pushes once when it stored something. With no store, nothing runs.

The script's behaviour (what is stored, the cursor, numbering, redaction) is in `skills/track-work/scripts/lib/discussion5.mjs`.
