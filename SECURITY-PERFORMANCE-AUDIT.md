# Security and Performance Audit

**Audit date:** 2026-11-14  
**Scope:** Repository static review, production-dependency advisory scan, production build, and automated tests. No production Supabase/database access or load-test environment was available.

## Executive summary

The application has useful baseline controls: Supabase RLS is enabled in the checked-in schema, role checks were hardened in a later migration, browser auth uses PKCE, and the service worker caches only same-origin static assets. The configured 60-day idle/session limits exist in the repository, but their deployment to the hosted Supabase project was not verified.

The most important confirmed issue is the dependency scan: **2 high and 1 moderate advisories** were reported by `npm audit --omit=dev`. Performance risk is concentrated in an admin report that retrieves whole tables and in frequent presence writes/polling. No exploit was demonstrated in this static audit.

## Findings

| ID | Severity | Area | Finding and evidence |
|---|---|---|---|
| S-01 | High | Dependencies | `npm audit --omit=dev` reports Vite 8.1.5 in the affected range, with a fix available at 8.3.8. The listed advisories include dev-server cross-origin script execution and Windows `launch-editor` command handling. This is most directly a development/build-tool exposure, not evidence that the production site serves the vulnerable Vite server. `@tailwindcss/vite` is listed as a production dependency in [package.json](./package.json#L48), making build tooling available in the production dependency tree. |
| S-02 | High | Dependencies | The scan reports Zod versions below 4.6.6, including nested Zod 4.6.5 installations under TanStack router/start tooling. The advisory describes memory exhaustion for oversized constrained collections. Reachability from public application inputs was not established. Upgrade affected versions and test the installed dependency tree. |
| S-03 | Moderate | Dependencies | The scan reports Seroval 1.6.8, in the affected 1.5.5–1.6.10 range, through TanStack router/start. Advisories describe code/script injection in serialization cases. This audit did not establish a reachable vulnerable serialization path. |
| S-04 | Medium | Session enforcement | The configured client and Supabase inactivity/timebox limits are now 60 days, reducing repeat MFA challenges while extending the period an unattended session can remain active. Client-side timers are not a server security boundary; an already-issued access token may remain usable until its configured five-minute expiry. Deploy and verify the Auth settings. |
| P-01 | Medium | Admin reporting | [ReportsPanel](./src/components/admin/StaffDashboard.tsx#L2802) fetches application, student, fee, payment, and result rows without pagination or server-side aggregation, then aggregates them in the browser. At scale this increases response size and latency; REST row caps can also make totals incomplete. The school grouping additionally searches all courses for each student at [StaffDashboard.tsx](./src/components/admin/StaffDashboard.tsx#L2854). |
| P-02 | Medium | Database load | Every signed-in browser tab writes online presence every 25 seconds at [__root.tsx](./src/routes/__root.tsx#L290); `heartbeat_presence` performs an upsert on every call in [0034_online_users_and_auth_audit.sql](./drizzle/migrations/0034_online_users_and_auth_audit.sql#L24). That is up to 144 writes per continuously active tab per hour. The admin fees and online-users panels also poll every 20 and 15 seconds, respectively, at [StaffDashboard.tsx](./src/components/admin/StaffDashboard.tsx#L3277) and [StaffDashboard.tsx](./src/components/admin/StaffDashboard.tsx#L3617). |
| S-05 | Low | HTTP headers | The application server sets `X-Content-Type-Options`, `X-Frame-Options`, Referrer Policy, Permissions Policy, and HSTS at [server.ts](./src/server.ts#L47), but does not set Content-Security-Policy there. A hosting layer may add one; that could not be verified. Consider a report-only CSP first, accounting for the site's inline structured data and required third parties. |

## Controls observed

- Browser Supabase auth is configured for PKCE in [client.ts](./src/integrations/supabase/client.ts#L50).
- A 60-day client idle guard is implemented in [session-security.ts](./src/lib/session-security.ts#L1), with server session settings in [config.toml](./supabase/config.toml#L3). These settings are repository configuration only until deployed and confirmed in the hosted Auth configuration.
- RLS is enabled across core tables in [0000_profia_schema.sql](./drizzle/migrations/0000_profia_schema.sql#L18); role helper functions were subsequently hardened to bind role checks to `auth.uid()` in [0032_rls_cache_hardening.sql](./drizzle/migrations/0032_rls_cache_hardening.sql#L1).
- The service worker caches only same-origin static assets and uses network-first navigation; it does not cache API responses or authenticated pages in [sw.js](./public/sw.js#L1).
- User-authored public rich text is escaped and links are protocol-checked before rendering in [content-format.ts](./src/lib/content-format.ts#L1).

## Recommended priorities

1. **Upgrade and re-scan dependencies:** resolve Vite and Seroval advisories; update the affected nested Zod 4 installations through compatible TanStack upgrades or a tested override. Avoid applying a breaking Zod major upgrade without running the application tests.
2. **Make admin reports aggregate in the database:** use bounded/paginated results for detail views and an authorized aggregate RPC for counts/totals. Verify with representative production-sized data and query plans.
3. **Reduce presence churn:** coalesce heartbeat updates in the database or reduce heartbeat frequency while preserving the online-user expiry window; pause or slow polling for background tabs.
4. **Verify hosted security configuration:** confirm RLS policies and migration state in Supabase, deploy the Auth inactivity/timebox configuration, and verify effective refresh behavior. The five-minute JWT expiry limits the lifetime of an already-issued access token.
5. **Add a staged CSP:** start with report-only telemetry, then enforce a policy after reviewing scripts, fonts, analytics, and embedded content.

## Validation and limitations

- `npm audit --omit=dev`: 3 findings (2 high, 1 moderate; 0 critical).
- `npm run build`: passed.
- `npm test`: passed, 12 test files / 60 tests.
- `npm run lint -- --quiet`: passed.
- No production database policies, live Auth configuration, hosting headers, real-user latency, or database query plans were inspected. Those require access to the deployed environment.

## Security hardening implementation

Repository changes now include:

- TOTP enrollment and verification for every account with a non-student role, including facilitators.
- Migration `0063_staff_mfa_enforcement.sql`, which requires AAL2 for staff database/storage access and role checks. Apply it only alongside the application and Edge Function deployment so staff can enroll through the new gate.
- MFA checks in authenticated Supabase Edge Functions, including student-facing functions that may also be called by staff accounts.
- A report-only CSP header for initial browser-side review; it does not block requests and no hosted report collector has been configured.
- Vite, Zod, Seroval, Vitest, and TypeScript ESLint updates. `npm audit --omit=dev` reports no advisories. `npm audit` still reports four moderate findings through the legacy `drizzle-kit`/`@esbuild-kit` development dependency path; a blanket fix would downgrade the migration tool, so this remains for a compatible upstream fix.

Before production rollout, apply and verify the migration in staging, test enrollment and supervised recovery for every staff role, confirm the Supabase Auth MFA settings, and verify host-level headers. Rate limiting, backups, restore tests, and alert delivery require configuration in the deployed Supabase/hosting environment and were not changed here.
