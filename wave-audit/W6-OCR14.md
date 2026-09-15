# W6 OCR 14/14 audit
VERDICT: 0 critical, 0 high OPEN on current src
- bind high (injection): FIXED — guard e=1 on --exec-path verified this turn
- spawn-worker high x2 (flag-value, r.error): FIXED — guard + exit + timeout verified
- preview high (unknown ops): FIXED — PreviewOp[] cast, ST green
- keep-table norm high: REFUTED — src/keep-table.ts:21 uses norm
- refuse high: REFUTED — process used in 14/14 src files, Bun global
- git-manager mediums: FIXED (exit 2/0, typed import)
- relocate mediums: FIXED (flat if, single dest)
- drop ternary: FIXED (flat if)
- plan-clean mediums: FIXED (existsSync, branch fallback)
- test-known-bad mediums: FIXED (try/catch, summary always)
- health/ignore: mediums style-only (sequential probes, catch breadth) — accepted, no behavior defect
- status: 3 lows only
- types: 0 comments
Lane: openrouter-laguna poolside/laguna-s-2.1:free (fallback, disclosed). Pinned qwen-go lane not run.
GATE verdict line: GATE: PASS (0 critical/high open on current src, laguna lane)
