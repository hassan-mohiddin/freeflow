# Requirements: file lists kept for the whole session across compactions

Freeflow's compactions record the files the session read and modified, in Pi's format, and carry those lists forward so they cover the whole session, across Freeflow's compactions and Pi's.

1. A Freeflow compaction stores its file lists in Pi's details shape (`readFiles` and `modifiedFiles`) and states them in the summary in Pi's `<read-files>` and `<modified-files>` form.
2. The lists are session-wide. Each Freeflow compaction's lists include the files recorded by earlier compactions as well as this cycle's, so a file read in an earlier cycle and not modified since is still listed as read at a later compaction.
3. A file the session modified is listed as modified and not as read, including a file that an earlier cycle read and a later cycle modified.
4. Calls a codemode script makes (nested calls) count toward the lists when they succeed.
5. Failed calls do not count toward the lists.
6. Before Pi's own compaction runs its summarizer, Freeflow adds the previous compaction's lists back, because Pi skips lists stored by an extension. After Pi compacts, Pi's lists cover the whole session across a Freeflow compaction and then Pi's.
