# Solicitudes de conductores independientes (KYC)

Implementado en `apps/api/src/modules/onboarding`, con el almacenamiento de archivos en
`apps/api/src/storage`. Contratos en `packages/shared-types/src/api/onboarding.ts`.

Hay dos caminos para trabajar en la plataforma, y no se mezclan (ADR-039):

1. **El personal de una empresa o línea** (conductores, despachadores, taquilleros…) entra **solo
   por invitación** de esa empresa ([organizations.md](organizations.md)). Las empresas no
   aparecen en ningún buscador y nadie se postula a ellas.
2. **Los conductores independientes** «conducen con VTP», como en las apps de viajes: eligen
   **carro o moto**, envían sus datos, su vehículo y sus documentos (este módulo), un **revisor de
   la plataforma** los verifica y, al aprobarlos, entran solos a la línea de la plataforma de ese
   vehículo. Nunca eligen ni ven una «línea».

## Flujo

```
conductor: elegir carro o moto → datos y vehículo (borrador) → subir documentos → enviar ──▶ submitted
revisor:                          request_changes ◀──┤ (notas + veredicto por documento)
conductor: corregir / reemplazar documentos → enviar de nuevo ─┤
revisor:                     reject (definitivo) ◀────┤
                             approve ─────────────────┘──▶ approved
   → identidad verificada, conductor de la línea de VTP del vehículo, vehículo propio en su flota
     (vehicles.owner_user_id) con la póliza RCV revisada como seguro del vehículo
```

- La API elige la línea por el vehículo (`mode`: `car` → la línea de taxis de la plataforma,
  `motorcycle` → la de motos); hay **una por tipo** (índice `organizations_platform_line_key`). Si
  todavía no existe, la solicitud responde `INDEPENDENTS_NOT_AVAILABLE`.
- No se puede pedir otro rol ni una organización (la validación rechaza esos campos). El vehículo es
  obligatorio (`INDEPENDENT_NEEDS_VEHICLE`).
- Con la póliza RCV vencida, el vehículo no puede tomar viajes (`VEHICLE_INSURANCE_EXPIRED`).

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

| Método y ruta                                                                  | Quién                               |
| ------------------------------------------------------------------------------ | ----------------------------------- |
| `GET/POST/PATCH /me/application`                                               | Solicitante                         |
| `PUT /me/application/documents/:kind` (multipart `file`, `expiresOn` opcional) | Solicitante                         |
| `GET /me/application/documents/:documentId/file`                               | Solicitante                         |
| `POST /me/application/submit`                                                  | Solicitante                         |
| `GET /admin/applications?status=submitted`, `GET /admin/applications/:id`      | Revisor de la plataforma            |
| `GET /admin/applications/:id/documents/:documentId/file`                       | Revisor de la plataforma (auditado) |
| `POST /admin/applications/:id/review` — `approve \| reject \| request_changes` | Revisor de la plataforma            |

## Todavía no implementado

Recordatorios
automáticos de vencimiento de licencias y pólizas, proveedores de verificación de identidad
(prueba de vida / selfie) y el driver de almacenamiento en la nube.
