# NoteMyDoc AI: Launch Readiness

Checked 18 October 2026. Payments and testing with other people were intentionally excluded.

## Completed

- Bounded JSON parsing, type checks, context/history limits and same-origin checks for state-changing API requests. Limits apply to AI request payloads, not the size of locally opened PDFs.
- Verified-email requirement for administrator access. Administrator status comes from the backend allowlist and D1, not client-writable Firestore profile fields.
- Shared D1 request windows and expiring concurrency leases. Defaults: 12 requests/minute per user, 2 concurrent requests per user, 30 hosted requests/minute, 8 concurrent hosted requests and 16 concurrent custom requests. These are application safety caps, not provider entitlements or a guarantee of user capacity.
- Complete allowance reservation: a request larger than the remaining balance is rejected instead of reserving only a small part of its estimated cost.
- PDF indexing remains mounted in single-tab mode, so switching to AI before indexing finishes does not leave the assistant permanently disabled.
- Public HTTPS custom endpoints only; blocked IP literals/private hostnames, URL credentials and redirect forwarding. Provider responses are bounded and custom-provider credential strings are redacted from errors. Arbitrary custom domains still require caution: hostname validation alone is not a DNS-rebinding-proof network firewall.
- Encrypted custom keys remain owner-bound through AES-GCM authenticated data. Lists return masked metadata, not plaintext keys.
- Response security headers, API no-store caching, clickjacking protection and Google-popup-compatible opener policy. CSP is a conservative baseline, not a complete strict script allowlist.
- Privacy notice reachable from desktop/mobile navigation. It explains local/cloud data, optional Drive, AI content sharing, browser speech recognition, provider terms and deletion requests. It is not a legal compliance certification.
- Large cloud-document deletion split into bounded batches, including transcript records.
- Fixed uptime monitoring to use notemydocai.pages.dev rather than the previous domain. Health explicitly identifies its AI check as configuration-only; a successful health response does not prove quota availability.
- Patched the framework, sanitizer, math renderer, gRPC and other compatible production dependencies. Final production audit: no high/critical advisories; three moderate findings remain in the Mammoth/argparse/sprintf-js chain, with no compatible published fix selected. Development-tool advisories also remain; no forced major-version downgrades were applied.

## Verification

- `npm test`: request validation, authentication, URL restrictions, credential redaction, security headers, SQL capacity controls and existing document/voice/math tests.
- `node scripts/security-api-smoke.mjs`: synthetic authenticated/unauthenticated route requests, quota/busy responses, release of capacity, owner-bound encrypted-key storage and redaction.
- Firestore emulator: two synthetic users plus unauthenticated access. Cross-account reads, overwrites and deletes denied for documents, notes, voice jobs, preferences and connections. Only the repository rules were tested; this does not independently establish that deployed rules are identical.
- 200 synthetic request attempts exercised the real SQL admission statements; only the configured active-request limit was admitted. No real provider calls or other people's accounts were used for this burst test. This is not a full production HTTP load benchmark or proof of 200-user capacity.
- Voice, vision routing, attachments, formulas, annotation tools, notes sharing, page insertion/deletion, navigation, drawing and export browser smoke suites.
- Type checking and production build.
- D1 Time Travel returned a current recovery bookmark. Production was not restored or overwritten as part of testing.

## Repeating Firestore Isolation Checks

Use isolated Firebase CLI/rules-unit-testing tools, Java 21 and a local-only Firestore emulator at 127.0.0.1:8908. Set `FIREBASE_TEST_MODULES` to that installation's node_modules and execute `node scripts/firestore-isolation-smoke.mjs` through `firebase emulators:exec` with demo project `demo-notemydoc-security`. Never point these synthetic writes at production.

## Still Required Before an Unrestricted Public Launch

1. Rotate any API keys previously pasted into chat. Existing credentials were not printed or replaced. Credential creation/rotation requires the account owner to complete the sensitive step, followed by updating the backend secret.
2. Confirm the deployed Firestore rules match the tested repository rules, and review Firebase/Google OAuth authorized domains and the Drive consent-screen production status.
3. Confirm the exact Google project associated with the hosted key, then read its actual RPM, TPM and daily quotas in AI Studio. The browser showed ai-studio-applet-webapp-3af43, but its relationship to the deployed key was not established; its numbers must not be attributed to production. No billing was enabled.
4. Tune application safety caps against measured average context size and real provider quotas. Test a few real requests, including provider exhaustion and recovery, before increasing traffic. Separate estimated app allowance from actual provider token usage.
5. Resolve or explicitly assess the remaining document-conversion advisories and development-tool advisories. Review custom-domain egress policy; for a stricter launch, use a verified provider-host allowlist or an egress proxy with DNS/IP controls.
6. Review retention periods, manual account-deletion procedure, provider data terms and business/privacy notices for the intended launch regions. No blanket GDPR-compliance claim is made.
7. Run a recovery drill in a separate environment, never by overwriting the production database. Include Firestore and Google Drive recovery, not just D1.
8. Optional later work: full HTTP load testing in staging, edge anti-bot protection, payment integration and an invited beta. Payments and contacting/inviting people were not performed.

## References

- Gemini project limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini data-use terms: https://ai.google.dev/gemini-api/terms
- D1 recovery: https://developers.cloudflare.com/d1/reference/time-travel/
