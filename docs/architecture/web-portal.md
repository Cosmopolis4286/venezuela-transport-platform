# Web portal (Next.js)

`apps/web`: public site, the **organization portal** (`/portal`) and the **platform admin panel**
(`/admin`). Spanish UI. All data comes from the API; the web server never touches the database.

## Screens

| Route                                       | Who             | What                                                                                                         |
| ------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `/login`                                    | Anyone          | Sign in with a code (SMS / WhatsApp / e-mail) or with e-mail + password                                      |
| `/register`                                 | Anyone          | Create an account with e-mail + password                                                                     |
| `/portal`                                   | Signed in       | My organizations, pending invitations (accept / decline)                                                     |
| `/portal/organizations/new`                 | Signed in       | Register a bus company, taxi line or terminal (starts `pending_review`)                                      |
| `/portal/organizations/:id`                 | Members         | Details; team and roles (`members.view` / `members.manage`), invitations, verified applicants to incorporate |
| `/admin`                                    | Platform staff  | Review queues: organizations and KYC applications                                                            |
| `/admin/applications/:id`                   | Platform staff  | Applicant data, document downloads, per-document verdicts, approve / request changes / reject                |
| `/admin/stops`                              | Platform staff  | Stop catalog: add terminals and stops, search, activate / deactivate                                         |
| `/portal/organizations/:id/routes/new`      | `routes.manage` | Create a route: name and ordered stops with travel time from the origin                                      |
| `/portal/organizations/:id/routes/:routeId` | Members         | Stops, fares per pair of stops, schedules; publish / deactivate (`routes.manage` to edit)                    |

Sections a role cannot use are not rendered, but **the API enforces every permission**; the UI
only mirrors it (`permissions` returned with each membership).

## Session handling

- Sign-in happens in **Server Actions** that call the API with `client: 'web'` and store the
  tokens in **httpOnly** cookies (`__Host-` prefix and `Secure` in production, `SameSite=Lax`).
  Tokens never reach browser JavaScript.
- `src/proxy.ts` (Next.js 16's renamed middleware) guards `/portal` and `/admin`: no session →
  `/login?next=…`; access token expiring within a minute → refresh via the API and rotate the
  cookies before the page renders.
- The API revokes a session when a refresh token is replayed, and browsers send parallel requests
  (prefetching). Refreshes are therefore **de-duplicated per refresh token**
  (`src/lib/server/refresh.ts`): concurrent and slightly late requests share one API call.
  In-process only — use a shared store before running more than one web instance.
- `getCurrentUser()` (`src/lib/server/session.ts`) is the data-access entry point; with Cache
  Components it must render inside `<Suspense>` and uses `'use cache: private'`.
- Every Server Action calls the API with the caller's session, so a forged form only produces an
  API error. Next.js checks the Origin of Server Action requests (CSRF).
- `?next=` redirects only accept same-site paths (`safeNextPath`).
- KYC documents are streamed through `/admin/applications/:id/documents/:documentId`, which forwards
  the reviewer's token; the API checks the role and audits the access.

## Forms

`ActionForm` (`src/components/portal/action-form.tsx`) binds a form to a Server Action and shows
its message. React resets a form after its action runs, even on failure, and a reset `<select>`
shows its first-render value rather than the saved one. So `ActionForm` submits manually and keeps
the fields; only forms that add something new (`resetOnSuccess`: invite, add stop, add schedule)
are cleared after a success. Actions replace the API's English validation messages with Spanish
ones where they know the rule (`failure(error, messages)` in `src/lib/server/form-actions.ts`).

## Configuration

| Variable                   | Where                | Purpose                                                                  |
| -------------------------- | -------------------- | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_BASE_URL` | build time, public   | API URL (also used server-side if the next one is unset)                 |
| `API_INTERNAL_BASE_URL`    | runtime, server-only | API URL from the web server, e.g. `http://api:4000/api/v1` inside Docker |

## Testing

Unit tests cover cookie options, refresh timing and de-duplication, error messages and
`safeNextPath`. The full flow (register → create organization → invite by phone → code sign-in →
accept → admin approval → KYC review with document download → incorporate applicant → logout, plus
forced token refresh under parallel requests) was verified in Chromium against a production build,
and so was the network flow (stop catalog → route with 4 stops → fares → schedules → publish →
public search → deactivate);
an automated browser test suite in CI is a follow-up.
