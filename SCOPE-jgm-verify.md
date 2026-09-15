# SCOPE god-loop-jgm-verify
LOCK: script-test + host-live + OCR rescan + thread + wave-audit
FILES (write): src/st-jgm.ts DEBUG_LOG.md BUILD_REPORT.md wave-audit/W*.md reports/
READ-ONLY: src/*.ts DPL1 MASTER thread git-manager
NEVER: product edits; never mutate keep-live; never mimo files
GATE: ST exit 0; health/known-bad same run; OCR 0 critical/high; mimo sha equal; discover git-manager hits>=1
