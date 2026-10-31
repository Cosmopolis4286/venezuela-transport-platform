# Solicitudes de conductores y personal (KYC)

Implementado en `apps/api/src/modules/onboarding`, con el almacenamiento de archivos en
`apps/api/src/storage`. Contratos en `packages/shared-types/src/api/onboarding.ts`.

Una persona puede unirse a una organización de dos formas:

1. **Invitación** de la organización ([organizations.md](organizations.md)).
2. **Solicitud** (este módulo): la persona llena un formulario, sube documentos, un **revisor de
   la plataforma** los verifica (KYC) y — si indicó una organización — esa organización decide si
   la incorpora. Nadie entra a una organización sin su consentimiento.

## Flujo

```
solicitante: crear (borrador) → subir documentos → enviar ──▶ submitted
revisor:                          request_changes ◀──┤ (notas + veredicto por documento)
solicitante: corregir / reemplazar documentos → enviar de nuevo ─┤
revisor:                     reject (definitivo) ◀────┤
                             approve ─────────────────┘──▶ approved  → user.identityVerified = true
organización (si se indicó una): accept → membresía con el rol pedido | decline
```

- Una sola solicitud **abierta** por persona (`draft`, `submitted`, `changes_requested`). Después
  de un rechazo la persona puede empezar otra.
- El solicitante solo puede editar en `draft` o `changes_requested`.
- Para aprobar, el revisor debe marcar como `accepted` todos los documentos requeridos.
- Los solicitantes deben ser mayores de 18 años. Las organizaciones indicadas en una solicitud
  deben estar `active` y ofrecer el rol pedido (por ejemplo, una línea de taxis no tiene
  taquilleros).

## Documentos requeridos

| Documento (`kind`)                             | Conductor | Conductor con vehículo propio | Despachador / taquillero / inspector |
| ---------------------------------------------- | :-------: | :---------------------------: | :----------------------------------: |
| `identity_document` — cédula (V/E) o pasaporte |    ✅     |              ✅               |                  ✅                  |
| `driver_license` — licencia de conducir        |    ✅     |              ✅               |                  —                   |
| `medical_certificate` — certificado médico     |    ✅     |              ✅               |                  —                   |
| `vehicle_registration` — carnet de circulación |     —     |              ✅               |                  —                   |
| `liability_insurance` — póliza RCV             |     —     |              ✅               |                  —                   |

Solo se pueden subir los tipos requeridos (no se recogen datos personales innecesarios). Subir de
nuevo un tipo reemplaza el archivo anterior. Los documentos con vencimiento (`expiresOn`) no pueden
estar vencidos al subirlos ni al enviar la solicitud.

## Manejo de archivos y privacidad

- Formatos: **JPG, PNG, PDF**, detectados por los bytes del archivo — se ignoran el nombre y el
  tipo declarado. Tamaño máximo `FILE_UPLOAD_MAX_BYTES` (10 MiB). Los archivos quedan en memoria
  solo hasta validarlos.
- Se guardan con nombres aleatorios (`kyc/<applicationId>/<uuid>.<ext>`); el nombre original solo
  se conserva, saneado, para mostrarlo. Los archivos **nunca son públicos**: se entregan por rutas
  autenticadas como descargas (`Content-Disposition: attachment`, `Cache-Control: no-store`,
  `nosniff`).
- Quién puede ver qué:

  | Dato                                               | Solicitante | Revisor de la plataforma  | Organización indicada |
  | -------------------------------------------------- | :---------: | :-----------------------: | :-------------------: |
  | Solicitud, incluido el número de documento         |   la suya   |            ✅             |           —           |
  | Archivos de los documentos                         |  los suyos  | ✅ (cada acceso auditado) |           —           |
  | Nombre, rol, ciudad, vehículo (tras la aprobación) |  los suyos  |            ✅             |          ✅           |

- Eventos de auditoría: `application.created`, `.updated`, `.document_uploaded`, `.submitted`,
  `.document_viewed`, `.approved`, `.rejected`, `.changes_requested`, `.organization_accepted`,
  `.organization_declined`.

## Almacenamiento

`FileStorage` (`src/storage/file-storage.ts`) es la única forma de leer o escribir archivos.

| Driver                                              | Estado          | Uso                                                                                              |
| --------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `local`                                             | ✅ implementado | Desarrollo, y un solo VPS con el volumen `api-uploads` **respaldado junto con la base de datos** |
| Compatible con S3 (AWS S3, Cloudflare R2, MinIO, …) | planificado     | Al pasar a la nube o correr más de una instancia de la API                                       |

Para agregar el driver en la nube: implementa `FileStorage` con `@aws-sdk/client-s3` (bucket
privado, cifrado del lado del servidor, sin ACL públicas), agrega `s3` a `FILE_STORAGE_DRIVER` y sus
credenciales al esquema de configuración, selecciónalo en `storage.module.ts` y copia los archivos
existentes con sus mismos nombres.

## Endpoints (`/api/v1`)

| Método y ruta                                                                               | Quién                               |
| ------------------------------------------------------------------------------------------- | ----------------------------------- |
| `GET/POST/PATCH /me/application`                                                            | Solicitante                         |
| `PUT /me/application/documents/:kind` (multipart `file`, `expiresOn` opcional)              | Solicitante                         |
| `GET /me/application/documents/:documentId/file`                                            | Solicitante                         |
| `POST /me/application/submit`                                                               | Solicitante                         |
| `GET /admin/applications?status=submitted`, `GET /admin/applications/:id`                   | Revisor de la plataforma            |
| `GET /admin/applications/:id/documents/:documentId/file`                                    | Revisor de la plataforma (auditado) |
| `POST /admin/applications/:id/review` — `approve \| reject \| request_changes`              | Revisor de la plataforma            |
| `GET /organizations/:id/applicants`, `POST …/applicants/:applicationId/accept` · `/decline` | `members.manage`                    |

## Todavía no implementado

Notificaciones a los solicitantes (necesita un proveedor de SMS o correo), recordatorios
automáticos de vencimiento de licencias y pólizas, proveedores de verificación de identidad
(prueba de vida / selfie) y el driver de almacenamiento en la nube.
