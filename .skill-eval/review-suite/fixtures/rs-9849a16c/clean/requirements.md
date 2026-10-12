# Requirements: an evidence recovery keeps the Coordinator's evidence in place

The change keeps evidence where the Coordinator first received it when an evidence recovery follows a worker's compaction. Placement for evidence the Coordinator missed while it kept working through a new user input stays as it was.

1. After a worker compacts, an assessment that the Coordinator suspends to ask for an evidence recovery resumes with its view unchanged: the request sent after the recovery's supplement extends the request the Coordinator sent while assessing, and does not repeat or move evidence it already received.
2. Evidence the recovery adds (the fresh read the worker made for the recovery) reaches the Coordinator in its resumed view.
3. Evidence the Coordinator never saw while it kept working through a suspension caused by new user input is delivered where the assessment resumes after that suspension, when no evidence recovery intervenes before the resume.
4. A selected result appears once in the Coordinator's view, through the recovery round and after the unit closes, and the request after the unit closes extends the resumed view.
