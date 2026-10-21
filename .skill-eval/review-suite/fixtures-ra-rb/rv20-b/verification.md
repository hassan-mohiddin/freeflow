# Verification

Ran the native prompt test on the branch:

    node --test pi-extension/tests/tool-execution/prompt-native.test.js

Result: 3 tests, 3 pass, 0 fail. The tests cover the rules, docs and environment sections for the Anthropic and OpenAI request shapes, the identity of the system text and tools across requests, and the unchanged prompt with Tool Execution off.

Not run: the rest of the tool-execution directory, and `npm run check`.
