# Requirements: numbered carried files, and the compaction notices

The change numbers carried files and carried read results by file line, and changes what the compaction notices tell the agent to do and to say.

1. Carried files and carried read results print each line with its file line number, then a tab, then the line's text. Numbers are right-aligned to the width of the largest number in the block, so lines 9 to 11 print as " 9", "10", "11".
2. A carried read result is numbered from the offset its read started at: a read at offset 3 prints its first line as 3.
3. Pi's note at the end of a partial read (the "[Showing lines ...]" or "[N more lines in file ...]" note) is not numbered.
4. The 'Files, read at compaction' section states that its file bodies, and the text read results below it, are numbered by file line; errors, images and other tool results are not.
5. The warning ("Compaction is due soon") lets a worker finish a return that ends within a step or two, instead of compacting first. "Compact now" still tells a worker to compact before it returns, since the Coordinator and the next assignment continue the same history.
6. The notices do not say that Pi compacts only once a run ends; each notice describes Pi's threshold without tying it to the end of a run.
7. The Coordinator's notice under projection still says not to compact itself, and to delegate the compaction to a worker.
8. The compaction skill matches the notices: under Cognitive Routing a worker compacts before it returns when compact now applies, and may finish a return that ends within a step or two when only the warning applies.
