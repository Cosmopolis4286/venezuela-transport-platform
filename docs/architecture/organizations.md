# Organizations, roles and invitations

Implemented in `apps/api/src/modules/organizations`. Contracts (types, roles, permission matrix)
in `packages/shared-types/src/api/organizations.ts`, shared so the apps can hide actions a role
cannot perform. **The API is the only place permissions are enforced.**

## Organization types and roles

| Role           | Label                |  Bus company  |    Taxi line     |   Terminal   |
| -------------- | -------------------- | :-----------: | :--------------: | :----------: |
| `owner`        | Dueño                |      ✅       |        ✅        |      ✅      |
| `admin`        | Administrador        |      ✅       |        ✅        |      ✅      |
| `dispatcher`   | Despachador          | ✅ departures | ✅ assigns trips | ✅ platforms |
| `ticket_agent` | Taquillero           |      ✅       |        —         |      —       |
| `driver`       | Conductor            |      ✅       |        ✅        |      —       |
| `inspector`    | Inspector de boletos |      ✅       |        —         |      ✅      |

One role per person per organization. A person may belong to several organizations.

## Permissions

| Permission                                      | owner | admin | dispatcher | ticket_agent | driver | inspector |
| ----------------------------------------------- | :---: | :---: | :--------: | :----------: | :----: | :-------: |
| `organization.manage`                           |  ✅   |  ✅   |            |              |        |           |
| `members.view`                                  |  ✅   |  ✅   |     ✅     |              |        |           |
| `members.manage` (invite, change roles, remove) |  ✅   |  ✅   |            |              |        |           |
| `operations.dispatch`                           |  ✅   |  ✅   |     ✅     |              |        |           |
| `tickets.sell`                                  |  ✅   |  ✅   |            |      ✅      |        |           |
| `tickets.validate`                              |  ✅   |  ✅   |            |              |        |    ✅     |
| `trips.drive`                                   |  ✅   |       |            |              |   ✅   |           |

Rules on top of the matrix:

- Only an **owner** can invite, promote, demote or remove an owner.
- An organization always keeps **at least one owner** (checked inside the same transaction).
- Roles must exist for the organization type (no `ticket_agent` in a taxi line).

### Protecting a route in a new module

```ts
@Post(':organizationId/departures')
@RequireOrganizationAccess('operations.dispatch')
create(@CurrentOrganization() access: OrganizationAccess) { … }
```

Non-members get **404** (the organization's existence is not revealed); members without the
permission get **403**. Operational modules must additionally require
`access.organization.status === 'active'`.

## Lifecycle

```
register (any signed-in user, becomes owner)
   └─▶ pending_review ──approve──▶ active ──suspend──▶ suspended ──approve──▶ active
             └──reject──▶ rejected ──approve──▶ active
```

While `pending_review` the owner can complete the profile and invite staff, but operations
(selling tickets, dispatching) will be blocked by the operational modules until a platform
reviewer approves. Rejecting or suspending requires notes, which the owner can see.
One person can have at most 5 organizations awaiting review at a time.

## Invitations

1. An owner/admin invites by **e-mail or phone** with a role (`POST /organizations/:id/invitations`).
2. No message is sent yet (no SMS/e-mail provider). The invitee signs in with that e-mail or phone
   — signing in by code verifies it — and sees the invitation in `GET /me/invitations`.
3. `POST /me/invitations/:id/accept` creates the membership; `/decline` refuses it.

Invitations are matched against the invitee's **verified** contacts only, so a forwarded message
or an unverified address is useless to anyone else. They expire after 7 days; at most one pending
invitation exists per person per organization; admins can revoke pending ones.

The self-service path for drivers and operators who are not invited (application form, documents,
KYC review) is the next module.

## Platform staff

Users may carry a platform role: `reviewer` (reviews organizations; later KYC) or `admin`
(everything a reviewer can do). There is no HTTP endpoint to grant it; someone with database
access runs:

```bash
pnpm platform:grant --email persona@example.com --role admin      # or reviewer | none
pnpm platform:grant --phone 0414-1234567 --role reviewer
```

The person must have signed up first. Review queue: `GET /admin/organizations?status=pending_review`,
decision: `POST /admin/organizations/:id/review` with `approve | reject | suspend` (+ `notes`).

## Endpoints (`/api/v1`)

| Method & path                                                                   | Who                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `POST /organizations`                                                           | Any signed-in user                                                       |
| `GET /me/organizations`                                                         | Signed-in user: memberships with role and permissions                    |
| `GET /organizations/directory?type=&q=`                                         | Signed-in user: active organizations to apply to (name, type, city only) |
| `GET /organizations/:id`                                                        | Any member                                                               |
| `PATCH /organizations/:id`                                                      | `organization.manage`                                                    |
| `GET /organizations/:id/members`                                                | `members.view`                                                           |
| `PATCH/DELETE /organizations/:id/members/:userId`                               | `members.manage`                                                         |
| `POST/GET /organizations/:id/invitations`, `DELETE …/invitations/:invitationId` | `members.manage`                                                         |
| `GET /me/invitations`, `POST /me/invitations/:id/accept` · `/decline`           | Invitee                                                                  |
| `GET /admin/organizations`, `POST /admin/organizations/:id/review`              | Platform reviewer/admin                                                  |

Audit events: `organization.created`, `.updated`, `.approved`, `.rejected`, `.suspended`,
`.member_role_changed`, `.member_removed`, `.invitation_created`, `.invitation_revoked`,
`.invitation_accepted`, `.invitation_declined`.
