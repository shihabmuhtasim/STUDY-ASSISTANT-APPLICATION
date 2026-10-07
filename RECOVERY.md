# Recovery: October 7, 2026

The October 6 rollback to `2a10e8c` removed features that had previously
been deployed from uncommitted source files. The final verified October 4
deployment was `06e7841d-c092-4e65-9ec4-f987254da22a`.

The source files were preserved on GitHub in `backup-codex-and-today`.
This recovery restores that source while removing the incomplete guest
mode and universal premium-access changes. Google sign-in and existing
server-side plan checks are retained. The corrected contact name is kept.

Recovered features include blank notebooks, study checklist, hosted Gemini
voice notes, drawing tools, page insertion, chat attachments, visual AI
routing, PDF text selection, and adjustable highlighter width.

The recovered release is tagged `recovered-working-2026-10-07`.
Do not roll back solely by the old deployment's source commit label: the
October 4 deployment contained additional uncommitted code. Future releases
should be committed and tagged before deployment.

Database contents, Google Drive files, and Cloudflare secrets were not
modified during this source recovery.
