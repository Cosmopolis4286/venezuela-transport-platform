# Organizaciones, roles e invitaciones

Implementado en `apps/api/src/modules/organizations`. Los contratos (tipos, roles, matriz de
permisos) están en `packages/shared-types/src/api/organizations.ts`, compartidos para que las apps
puedan ocultar las acciones que un rol no puede hacer. **La API es el único lugar donde se aplican
los permisos.**

## Tipos de organización y roles

| Rol            | Etiqueta             | Empresa de autobuses |  Línea de taxis  |  Terminal  |
| -------------- | -------------------- | :------------------: | :--------------: | :--------: |
| `owner`        | Dueño                |          ✅          |        ✅        |     ✅     |
| `admin`        | Administrador        |          ✅          |        ✅        |     ✅     |
| `dispatcher`   | Despachador          |      ✅ salidas      | ✅ asigna viajes | ✅ andenes |
| `ticket_agent` | Taquillero           |          ✅          |        —         |     —      |
| `driver`       | Conductor            |          ✅          |        ✅        |     —      |
| `inspector`    | Inspector de boletos |          ✅          |        —         |     ✅     |

Un rol por persona en cada organización. Una persona puede pertenecer a varias organizaciones.

## Permisos

| Permiso                                           | owner | admin | dispatcher | ticket_agent | driver | inspector |
| ------------------------------------------------- | :---: | :---: | :--------: | :----------: | :----: | :-------: |
| `organization.manage`                             |  ✅   |  ✅   |            |              |        |           |
| `members.view`                                    |  ✅   |  ✅   |     ✅     |              |        |           |
| `members.manage` (invitar, cambiar roles, quitar) |  ✅   |  ✅   |            |              |        |           |
| `operations.dispatch`                             |  ✅   |  ✅   |     ✅     |              |        |           |
| `routes.manage` (rutas, tarifas, horarios, tasas) |  ✅   |  ✅   |            |              |        |           |
| `fleet.manage` (mapas de puestos)                 |  ✅   |  ✅   |            |              |        |           |
| `bookings.view` (viajes y lista de pasajeros)     |  ✅   |  ✅   |     ✅     |      ✅      |        |    ✅     |
| `tickets.sell`                                    |  ✅   |  ✅   |            |      ✅      |        |           |
| `tickets.validate` (escanear boletos)             |  ✅   |  ✅   |            |              |        |    ✅     |
| `trips.drive`                                     |  ✅   |       |            |              |   ✅   |           |

Reglas además de la matriz:

- Solo un **dueño** puede invitar, ascender, degradar o quitar a un dueño.
- Una organización siempre conserva **al menos un dueño** (se verifica dentro de la misma
  transacción).
- Los roles deben existir para el tipo de organización (no hay `ticket_agent` en una línea de
  taxis).

### Proteger una ruta en un módulo nuevo

```ts
@Post(':organizationId/departures')
@RequireOrganizationAccess('operations.dispatch')
create(@CurrentOrganization() access: OrganizationAccess) { … }
```

Quien no es miembro recibe **404** (no se revela que la organización existe); los miembros sin el
permiso reciben **403**. Los módulos operativos además deben exigir
`access.organization.status === 'active'`.

## Ciclo de vida

```
registrar (cualquier usuario con sesión, queda como dueño)
   └─▶ pending_review ──approve──▶ active ──suspend──▶ suspended ──approve──▶ active
             └──reject──▶ rejected ──approve──▶ active
```

Mientras está en `pending_review`, el dueño puede completar el perfil e invitar al personal, pero
las operaciones (vender boletos, despachar, publicar rutas) quedan bloqueadas hasta que un revisor
de la plataforma la apruebe. Rechazar o suspender exige notas, que el dueño puede ver. Una persona
puede tener como máximo 5 organizaciones esperando revisión a la vez.

## Invitaciones

1. Un dueño o administrador invita por **correo o teléfono** con un rol
   (`POST /organizations/:id/invitations`).
2. Todavía no se envía ningún mensaje (no hay proveedor de SMS ni correo). La persona invitada
   inicia sesión con ese correo o teléfono — iniciar sesión con código lo verifica — y ve la
   invitación en `GET /me/invitations`.
3. `POST /me/invitations/:id/accept` crea la membresía; `/decline` la rechaza.

Las invitaciones solo se emparejan con los contactos **verificados** de la persona invitada, así
que un mensaje reenviado o una dirección sin verificar no le sirven a nadie más. Vencen a los 7
días; existe como máximo una invitación pendiente por persona en cada organización; los
administradores pueden revocar las pendientes.

Los conductores y operadores que no fueron invitados pueden enviar una solicitud con sus
documentos para la revisión KYC ([onboarding.md](onboarding.md)).

## Personal de la plataforma

Los usuarios pueden tener un rol de plataforma: `reviewer` (revisa organizaciones y solicitudes
KYC, y administra el catálogo de paradas) o `admin` (todo lo que puede un revisor). No hay un endpoint HTTP
para otorgarlo; alguien con acceso a la base de datos ejecuta:

```bash
pnpm platform:grant --email persona@example.com --role admin      # o reviewer | none
pnpm platform:grant --phone 0414-1234567 --role reviewer
```

La persona debe haberse registrado antes. Cola de revisión:
`GET /admin/organizations?status=pending_review`; decisión: `POST /admin/organizations/:id/review`
con `approve | reject | suspend` (+ `notes`).

## Endpoints (`/api/v1`)

| Método y ruta                                                                   | Quién                                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `POST /organizations`                                                           | Cualquier usuario con sesión                                                                 |
| `GET /me/organizations`                                                         | Usuario con sesión: sus membresías con rol y permisos                                        |
| `GET /organizations/directory?type=&q=`                                         | Usuario con sesión: organizaciones activas a las que postularse (solo nombre, tipo y ciudad) |
| `GET /organizations/:id`                                                        | Cualquier miembro                                                                            |
| `PATCH /organizations/:id`                                                      | `organization.manage`                                                                        |
| `GET /organizations/:id/members`                                                | `members.view`                                                                               |
| `PATCH/DELETE /organizations/:id/members/:userId`                               | `members.manage`                                                                             |
| `POST/GET /organizations/:id/invitations`, `DELETE …/invitations/:invitationId` | `members.manage`                                                                             |
| `GET /me/invitations`, `POST /me/invitations/:id/accept` · `/decline`           | La persona invitada                                                                          |
| `GET /admin/organizations`, `POST /admin/organizations/:id/review`              | Revisor o administrador de la plataforma                                                     |

Eventos de auditoría: `organization.created`, `.updated`, `.approved`, `.rejected`, `.suspended`,
`.member_role_changed`, `.member_removed`, `.invitation_created`, `.invitation_revoked`,
`.invitation_accepted`, `.invitation_declined`.
