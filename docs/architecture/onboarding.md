# Driver and staff applications (KYC)

Implemented in `apps/api/src/modules/onboarding` with file storage in `apps/api/src/storage`.
Contracts in `packages/shared-types/src/api/onboarding.ts`.

People can join an organization in two ways:

1. **Invitation** by the organization ([organizations.md](organizations.md)).
2. **Application** (this module): the person fills in a form, uploads documents, a **platform
   reviewer** verifies them (KYC), and — if they named an organization — that organization decides
   whether to take them on. Nobody is added to an organization without its consent.

## Flow

```
applicant: create (draft) → upload documents → submit ──▶ submitted
reviewer:                          request_changes ◀──┤ (notes + per-document verdicts)
applicant: fix / replace documents → submit again ────┤
reviewer:                     reject (final) ◀────────┤
                              approve ────────────────┘──▶ approved  → user.identityVerified = true
organization (if one was named): accept → membership with the requested role | decline
```

- One **open** application per person (`draft`, `submitted`, `changes_requested`). After a
  rejection the person may start a new one.
- The applicant can edit only in `draft` or `changes_requested`.
- Approval requires every required document to be marked `accepted` by the reviewer.
- Applicants must be 18+. Organizations named in an application must be `active` and offer the
  requested role (e.g. no ticket agents in a taxi line).

## Required documents

| Document (`kind`)                              | Driver | Driver with own vehicle | Dispatcher / ticket agent / inspector |
| ---------------------------------------------- | :----: | :---------------------: | :-----------------------------------: |
| `identity_document` — cédula (V/E) or passport |   ✅   |           ✅            |                  ✅                   |
| `driver_license` — licencia de conducir        |   ✅   |           ✅            |                   —                   |
| `medical_certificate` — certificado médico     |   ✅   |           ✅            |                   —                   |
| `vehicle_registration` — carnet de circulación |   —    |           ✅            |                   —                   |
| `liability_insurance` — póliza RCV             |   —    |           ✅            |                   —                   |

Only required kinds can be uploaded (no unnecessary personal data is collected). Uploading a kind
again replaces the previous file. Documents with an expiry (`expiresOn`) must not be expired at
upload or submission.

## File handling and privacy

- Formats: **JPG, PNG, PDF**, detected from the file's bytes — the name and declared type are
  ignored. Max size `FILE_UPLOAD_MAX_BYTES` (10 MiB). Files are buffered in memory only until
  validated.
- Stored under random keys (`kyc/<applicationId>/<uuid>.<ext>`); the original name is kept only
  for display, sanitized. Files are **never public**: they are streamed by authenticated routes as
  downloads (`Content-Disposition: attachment`, `Cache-Control: no-store`, `nosniff`).
- Who can read what:

  | Data                                       | Applicant |    Platform reviewer     | Target organization |
  | ------------------------------------------ | :-------: | :----------------------: | :-----------------: |
  | Application incl. ID number                |    own    |            ✅            |          —          |
  | Document files                             |    own    | ✅ (each access audited) |          —          |
  | Name, role, city, vehicle (after approval) |    own    |            ✅            |         ✅          |

- Audit events: `application.created`, `.updated`, `.document_uploaded`, `.submitted`,
  `.document_viewed`, `.approved`, `.rejected`, `.changes_requested`, `.organization_accepted`,
  `.organization_declined`.

## Storage backends

`FileStorage` (`src/storage/file-storage.ts`) is the only way to read or write files.

| Driver                                          | Status         | Use                                                                                         |
| ----------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `local`                                         | ✅ implemented | Development, and a single VPS with the `api-uploads` volume **backed up with the database** |
| S3-compatible (AWS S3, Cloudflare R2, MinIO, …) | planned        | When moving to the cloud or running more than one API instance                              |

To add the cloud driver: implement `FileStorage` with `@aws-sdk/client-s3` (private bucket,
server-side encryption, no public ACLs), add `s3` to `FILE_STORAGE_DRIVER` and its credentials to the
env schema, select it in `storage.module.ts`, and copy existing files across with their keys.

## Endpoints (`/api/v1`)

| Method & path                                                                               | Who                         |
| ------------------------------------------------------------------------------------------- | --------------------------- |
| `GET/POST/PATCH /me/application`                                                            | Applicant                   |
| `PUT /me/application/documents/:kind` (multipart `file`, optional `expiresOn`)              | Applicant                   |
| `GET /me/application/documents/:documentId/file`                                            | Applicant                   |
| `POST /me/application/submit`                                                               | Applicant                   |
| `GET /admin/applications?status=submitted`, `GET /admin/applications/:id`                   | Platform reviewer           |
| `GET /admin/applications/:id/documents/:documentId/file`                                    | Platform reviewer (audited) |
| `POST /admin/applications/:id/review` — `approve \| reject \| request_changes`              | Platform reviewer           |
| `GET /organizations/:id/applicants`, `POST …/applicants/:applicationId/accept` · `/decline` | `members.manage`            |

## Not implemented yet

Notifications to applicants (needs an SMS/e-mail provider), automatic expiry reminders for
licences and insurance, identity-verification providers (liveness/selfie), and the cloud storage
driver.
