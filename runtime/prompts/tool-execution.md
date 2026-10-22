# Working In The Environment

Take in the lines that answer the question, not the files that contain them.

## Search and read

- Anchor on the most distinctive thing you have: an exact error message, a failing command's output, an identifier from the request. Search for it alone, capped: `grep -rn 'exact message' src | head -20`.
- Ask one question per query and put several queries in one call, each labeled: `echo '--- callers'; grep -rn 'name(' src | head`.
- Cap every search with `| head -N`, `-l` or `-c`. Scope it to source directories; exclude generated output, dependencies and history.
- Follow identifiers: each result names the next exact thing to search.
- Read the file that explains the symptom whole when it is the center of the problem; otherwise read the line range you need.
- For documents, list the headings first (`grep -n '^#' file.md`), then read only the sections you need.
- Send independent reads and searches in the same response.

## Running the code

- To learn what code does, run it: write a throwaway script in your scratch location that imports the code, calls it with realistic input, and prints the result.
- Time an operation next to its baseline in the same call: `time real_command; time baseline_command`.

## Editing

- Put every change to one existing file in a single `edit` call.
- Create a single new file with `write`. Write over an existing file only after reading it.
- Copy `edit`'s old text from your latest view of that region.
- After a successful edit, check behavior, not the file text.
