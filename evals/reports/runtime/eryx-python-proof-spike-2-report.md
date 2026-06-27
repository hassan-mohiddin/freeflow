# Eryx Python Sandbox Proof Spike 2 Report

> **Date:** 2026-06-24
> **Status:** Passed temp-patched proof spike for Python candidate
> **Scope:** Proof-only evaluation. No Freeflow script execution path is enabled.

## Candidate

- Package: `@bsull/eryx@0.5.0`
- License: MIT OR Apache-2.0
- Package root: `/tmp/freeflow-eryx-proof-run-87KaRW/node_modules/@bsull/eryx`
- Preview2 shim: `@bytecodealliance/preview2-shim@0.17.9`
- Preview2 shim root: `/tmp/freeflow-eryx-proof-run-87KaRW/node_modules/@bytecodealliance/preview2-shim`
- Patched temp copy: `/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-eryx-proof-0QeDOW`
- WASM shards: 10
- WASM total bytes: 44664377
- Timeout: 500ms via Worker termination
- Output cap: 4096 bytes across stdout + stderr before Worker result crosses to parent
- Worker resource limits: `maxOldGenerationSizeMb=256`, `maxYoungGenerationSizeMb=32`
- Node requirement: parent process started with `--experimental-wasm-jspi`

## Package Files

- `eryx-sandbox.core.wasm` — 14217612 bytes
- `eryx-sandbox.core10.wasm` — 5014 bytes
- `eryx-sandbox.core2.wasm` — 66749 bytes
- `eryx-sandbox.core3.wasm` — 1949270 bytes
- `eryx-sandbox.core4.wasm` — 5780 bytes
- `eryx-sandbox.core5.wasm` — 8408 bytes
- `eryx-sandbox.core6.wasm` — 27258519 bytes
- `eryx-sandbox.core7.wasm` — 1090852 bytes
- `eryx-sandbox.core8.wasm` — 10145 bytes
- `eryx-sandbox.core9.wasm` — 52028 bytes
- `eryx-sandbox.d.ts` — 4086 bytes
- `eryx-sandbox.js` — 1069741 bytes
- `index.d.ts` — 4463 bytes
- `index.js` — 7898 bytes
- `interfaces/eryx-net-tcp.d.ts` — 1056 bytes
- `interfaces/eryx-net-tls.d.ts` — 931 bytes
- `interfaces/wasi-cli-environment.d.ts` — 209 bytes
- `interfaces/wasi-cli-exit.d.ts` — 177 bytes
- `interfaces/wasi-cli-stderr.d.ts` — 163 bytes
- `interfaces/wasi-cli-stdin.d.ts` — 158 bytes
- `interfaces/wasi-cli-stdout.d.ts` — 163 bytes
- `interfaces/wasi-cli-terminal-input.d.ts` — 176 bytes
- `interfaces/wasi-cli-terminal-output.d.ts` — 178 bytes
- `interfaces/wasi-cli-terminal-stderr.d.ts` — 207 bytes
- `interfaces/wasi-cli-terminal-stdin.d.ts` — 201 bytes
- `interfaces/wasi-cli-terminal-stdout.d.ts` — 207 bytes
- `interfaces/wasi-clocks-monotonic-clock.d.ts` — 374 bytes
- `interfaces/wasi-clocks-wall-clock.d.ts` — 200 bytes
- `interfaces/wasi-filesystem-preopens.d.ts` — 194 bytes
- `interfaces/wasi-filesystem-types.d.ts` — 5405 bytes
- `interfaces/wasi-io-error.d.ts` — 185 bytes
- `interfaces/wasi-io-poll.d.ts` — 254 bytes
- `interfaces/wasi-io-streams.d.ts` — 1170 bytes
- `interfaces/wasi-random-insecure-seed.d.ts` — 108 bytes
- `interfaces/wasi-random-insecure.d.ts` — 166 bytes
- `interfaces/wasi-random-random.d.ts` — 148 bytes
- `interfaces/wasi-sockets-instance-network.d.ts` — 173 bytes
- `interfaces/wasi-sockets-ip-name-lookup.d.ts` — 617 bytes
- `interfaces/wasi-sockets-network.d.ts` — 2190 bytes
- `interfaces/wasi-sockets-tcp-create-socket.d.ts` — 360 bytes
- `interfaces/wasi-sockets-tcp.d.ts` — 1954 bytes
- `interfaces/wasi-sockets-udp-create-socket.d.ts` — 360 bytes
- `interfaces/wasi-sockets-udp.d.ts` — 1698 bytes
- `package.json` — 1135 bytes
- `python-stdlib.tar.gz` — 3082487 bytes
- `README.md` — 4505 bytes
- `shims/callbacks.d.ts` — 1376 bytes
- `shims/callbacks.js` — 3991 bytes
- `shims/net.js` — 1074 bytes
- `shims/sockets.js` — 1068 bytes
- `stdlib-loader.js` — 5523 bytes

## WASM Shard Hashes

- `eryx-sandbox.core.wasm` — 14217612 bytes — `63083db02cba1b628c5a939458c8e8c374f99b89d113a2c0670f715404944939`
- `eryx-sandbox.core10.wasm` — 5014 bytes — `66a00b7099832c6cc85d42439e8bed880cdb0912ddb7f82e8b73c54fec89522e`
- `eryx-sandbox.core2.wasm` — 66749 bytes — `d632b1884e0e376335a101e98d92c2d9279eda8dc8e196d8cf5114036d9512be`
- `eryx-sandbox.core3.wasm` — 1949270 bytes — `f963fd45a753db5c8b33f8247b3f77aa045aca4ad516c580a6f70930def8d579`
- `eryx-sandbox.core4.wasm` — 5780 bytes — `d67ce024ccf6d4191760a543888eccc9e1bca7ac4bfd68a794a693d238efd3f4`
- `eryx-sandbox.core5.wasm` — 8408 bytes — `aa9012bd695b1f9d1bf3a770a547c2a3705be47cf00d4b45898b019c1f937799`
- `eryx-sandbox.core6.wasm` — 27258519 bytes — `fde75b7a2c2d57630d1966cc0aa64f52fd6e48c17f10236e5c09da11e28ba8cc`
- `eryx-sandbox.core7.wasm` — 1090852 bytes — `ca9450bf30ecf9243966168e043c72dc1c69208ef8ca5a0d4993b57bbc000b37`
- `eryx-sandbox.core8.wasm` — 10145 bytes — `c7d356a9a1e71d26a37be99c9ee536d40484e36522b6447a625c6270e95637b0`
- `eryx-sandbox.core9.wasm` — 52028 bytes — `e13ac26656e8c6fb5862961821a115df02009f1b9bd8b16acda4c1826b5f484d`

## Import Patch

The runner copies `@bsull/eryx` and `@bytecodealliance/preview2-shim` into a temp `node_modules` tree, then rewrites Eryx's generated preview2-shim imports from bare package subpaths to explicit browser/in-memory shim files:

- `@bytecodealliance/preview2-shim/cli` → `../../@bytecodealliance/preview2-shim/lib/browser/cli.js`
- `@bytecodealliance/preview2-shim/clocks` → `../../@bytecodealliance/preview2-shim/lib/browser/clocks.js`
- `@bytecodealliance/preview2-shim/filesystem` → `../../@bytecodealliance/preview2-shim/lib/browser/filesystem.js`
- `@bytecodealliance/preview2-shim/io` → `../../@bytecodealliance/preview2-shim/lib/browser/io.js`
- `@bytecodealliance/preview2-shim/random` → `../../@bytecodealliance/preview2-shim/lib/browser/random.js`

This avoids Node resolving `@bytecodealliance/preview2-shim/filesystem` to the host-filesystem-oriented Node shim that lacks `_setFileData`.

The runner also replaces the temp-copied Eryx `shims/net.js` with an equivalent deny-only shim that records TCP/TLS attempts and returns `not-permitted`. This makes the network proof check the wrapper denial event instead of accepting any generic socket failure.

## Import Probe

- Status: success
- Exports: `Sandbox`, `_fileTree`, `execute`, `setCallbackHandler`, `setCallbacks`, `setOutputHandler`, `setResultVariable`, `setTraceHandler`
- Error: none

## Positive API Probe

- Status: success
- Output: `INFO setup\nERROR target`
- Error: none

## Required Proof Results

| Proof | Result | Evidence |
| --- | --- | --- |
| env_access_denied | pass | ambient host environment and secret sentinel were not exposed; status=success; exitCode=0; durationMs=82; outputBytes=89; stdoutBytes=89; stderrBytes=0; rawStdoutBytes=89; rawStderrBytes=0; truncated=false; outputFiles=0; networkEvents=none; error=none |
| home_access_denied | pass | home directory was unavailable and home/secret file contents were not exposed; status=error; exitCode=1; durationMs=128; outputBytes=790; stdoutBytes=460; stderrBytes=330; rawStdoutBytes=460; rawStderrBytes=330; truncated=false; outputFiles=0; networkEvents=none; error=Traceback (most recent call last):\n  File "<string>", line 1, in <module>\n  File "<string>", line 179, in _eryx_exec\n  File "<user>", line 2, in <module>\n  File "/python-stdlib/pathlib/__init__.py", line 1266, in home\n    raise RuntimeError("Could not determine home directory.")\nRuntimeError: Could not determine home directory.\n |
| repo_access_denied | pass | repo file contents were not exposed; status=error; exitCode=1; durationMs=126; outputBytes=1146; stdoutBytes=483; stderrBytes=663; rawStdoutBytes=483; rawStderrBytes=663; truncated=false; outputFiles=0; networkEvents=none; error=Traceback (most recent call last):\n  File "<string>", line 1, in <module>\n  File "<string>", line 179, in _eryx_exec\n  File "<user>", line 2, in <module>\n  File "/python-stdlib/pathlib/__init__.py", line 792, in read_text\n    with self.open(mode='r', encoding=encoding, errors=errors, newline=newline) as f:\n         ~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File "/python-stdlib/pathlib/__init__.py", line 776, in open\n    return io.open(self, mode, buffering, encoding, errors, newline)\n           ~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nNotADirectoryError: [Errno 54] Not a directory: '/workspace/package.json'\n |
| vault_access_denied | pass | vault records were not exposed; status=success; exitCode=0; durationMs=117; outputBytes=462; stdoutBytes=462; stderrBytes=0; rawStdoutBytes=462; rawStderrBytes=0; truncated=false; outputFiles=0; networkEvents=none; error=none |
| network_access_denied | pass | outbound network attempt reached the instrumented Eryx shim and was denied as not-permitted; status=error; exitCode=1; durationMs=219; outputBytes=4096; stdoutBytes=2048; stderrBytes=2048; rawStdoutBytes=3795; rawStderrBytes=2442; truncated=true; outputFiles=0; networkEvents=tcp.connect:not-permitted,tls.upgrade:not-permitted,tls.write:not-permitted; error=Traceback (most recent call last):\n  File "/python-stdlib/urllib/request.py", line 1321, in do_open\n    h.request(req.get_method(), req.selector, req.data, headers,\n    ~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n              encode_chunked=req.has_header('Transfer-encoding'))\n              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File "/python-stdlib/http/client.py", line 1338, in request\n    self._send_request(method, url, body, headers, encode_chunked)\n    ~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File "/python-stdlib/http/client.py", line 1384, in _send_request\n    self.endheaders(body, encode_chunked=encode_chunked)\n    ~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File "/python-stdlib/http/client.py", line 1333, in endheaders\n    self._send_output(message_body, encode_chunked=encode_chunked)\n    ~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File "/python-stdlib/http/client.py", line 1093, in _send_output\n    self.send(msg)\n    ~~~~~~~~~^^^^^\n  File "/python-stdlib/http/client.py", line 1057, in send\n    self.sock.sendall(data)\n    ~~~~~~~~~~~~~~~~~^^^^^^\n  File "<ssl_eryx>", line 220, in sendall\n  File "<socket_eryx>", line 359, in sendall\nsocket.error: Connection closed\n\nDuring handling of the above exception, another exception occurred:\n\nTraceback (most recent call last):\n  File "<string>", line 1, in <module>\n  File "<string>", line 179, in _eryx_exec\n  File "<user>", line 2, in <module>\n  File "/python-stdlib/urllib/request.py", line 187, in urlopen\n    return opener.open(url, data, timeout)\n           ~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^\n  File "/python-stdlib/urllib/request.py", line 487, in open\n    response = self._open(req, data)\n  File "/python-stdlib/urllib/request.py", line 504, in _open\n    result = self._call_chain(self.handle_open, protocol, protocol +\n                              '_open', req)\n  File "/python-stdlib/urllib/request.py", line 464, in _call_chain\n    result = func(*args)\n  File "/python-stdlib/urllib/request.py", line 1369, in https_open\n    return self.do_open(http.client.HTTPSConnection, req,\n           ~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n                        context=self._context)\n                        ^^^^^^^^^^^^^^^^^^^^^^\n  File "/python-stdlib/urllib/request.py", line 1324, in do_open\n    raise URLError(err)\nurllib.error.URLError: <urlopen error Connection closed>\n |
| input_read_only | pass | input mutation was not possible through filesystem paths; status=error; exitCode=1; durationMs=120; outputBytes=1143; stdoutBytes=483; stderrBytes=660; rawStdoutBytes=483; rawStderrBytes=660; truncated=false; outputFiles=0; networkEvents=none; error=Traceback (most recent call last):\n  File "<string>", line 1, in <module>\n  File "<string>", line 179, in _eryx_exec\n  File "<user>", line 2, in <module>\n  File "/python-stdlib/pathlib/__init__.py", line 814, in write_text\n    with self.open(mode='w', encoding=encoding, errors=errors, newline=newline) as f:\n         ~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File "/python-stdlib/pathlib/__init__.py", line 776, in open\n    return io.open(self, mode, buffering, encoding, errors, newline)\n           ~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nNotADirectoryError: [Errno 54] Not a directory: '/input/test_log.txt'\n |
| output_escape_denied | pass | output symlink attempt stayed inside ignored in-memory filesystem and no output files were collected; status=success; exitCode=0; durationMs=119; outputBytes=454; stdoutBytes=454; stderrBytes=0; rawStdoutBytes=454; rawStderrBytes=0; truncated=false; outputFiles=0; networkEvents=none; error=none |
| stdout_stderr_bounded | pass | stdout/stderr flood was capped before crossing from Worker to parent; status=success; exitCode=0; durationMs=103; outputBytes=4096; stdoutBytes=2048; stderrBytes=2048; rawStdoutBytes=100999; rawStderrBytes=100999; truncated=true; outputFiles=0; networkEvents=none; error=none |
| timeout_enforced | pass | infinite loop was stopped by Worker termination; status=timed_out; exitCode=null; durationMs=502; outputBytes=0; stdoutBytes=0; stderrBytes=0; rawStdoutBytes=0; rawStderrBytes=0; truncated=false; outputFiles=0; networkEvents=none; error=none |

## Notes

- This proof runner uses a temporary installed `@bsull/eryx` package root passed explicitly by the caller.
- It does not add repo dependencies and does not wire Python into `freeflow_derive` execution.
- It performs a temp-copy import rewrite and deny-only network-shim replacement. A product adapter would need an explicit package-root wrapper and focused security review before enabling this path.
- Timeout proof uses Node Worker termination because Eryx's high-level JS API does not expose timeout or fuel controls.
- Output proof caps what crosses from Worker to parent; Eryx/Python can still materialize large strings inside the Worker before the wrapper truncates them.
- The runner intentionally collects no output files, matching the current QuickJS/jq product adapters. In-memory filesystem writes and symlink attempts are ignored unless their contents reach stdout/stderr.
- The runner returns bounded error messages rather than JS host stack traces so proof output does not leak repo/home paths through adapter diagnostics.
- The runner overrides Worker `console` before importing Eryx so preview2 browser shim debug logs are captured and bounded instead of inherited by host stdout.
- Passing this spike supports candidate feasibility only. Product execution still requires adapter implementation, probe caching, review, and runtime-status wiring.

## Required Proof Set

- env_access_denied
- home_access_denied
- repo_access_denied
- vault_access_denied
- network_access_denied
- input_read_only
- output_escape_denied
- stdout_stderr_bounded
- timeout_enforced
