# Verification

Compiled the extension with the project configuration:

    tsc -p pi-extension/tsconfig.json

It compiles without errors. Ran the context-virtualization extension test after the schema change:

    node --test pi-extension/tests/context-virtualization/extension.test.js

Result: 12 tests, 12 pass, 0 fail. The placeholder-schema test and the Context Virtualization registration tests pass.
