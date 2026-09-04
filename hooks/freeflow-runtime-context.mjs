#!/usr/bin/env node

import { main } from "./adapters/codex-session-start.mjs";
import { runSafely } from "./shared/runtime-context.mjs";

runSafely(main);
