# Conservación y borrado de datos (interno)

Reglas para guardar y eliminar datos personales. Los plazos son propuestas que debe confirmar la
revisión legal (ver [README](README.md#lista-para-el-abogado)).

## Plazos

| Datos                                         | Plazo propuesto                   | Fundamento                                                                              | Cómo se cumple hoy                                                       |
| --------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Cuenta (correo, teléfono, nombre, contraseña) | Mientras exista                   | Contrato                                                                                | Se anonimiza al borrar la cuenta (abajo)                                 |
| Reservas, boletos, listas de pasajeros        | 10 años                           | Comprobantes mercantiles y tributarios; normativa de transporte                         | Se conservan; purga pendiente (tarea programada)                         |
| Pagos, reembolsos, liquidaciones              | 10 años                           | Código de Comercio, Código Orgánico Tributario, prevención de legitimación de capitales | Se conservan; purga pendiente                                            |
| Expedientes KYC y sus archivos                | Mientras trabaje + 5 años         | Seguridad de los pasajeros; prevención de legitimación de capitales                     | Se conservan; purga pendiente                                            |
| Sesiones                                      | Hasta vencer o revocarse          | Seguridad                                                                               | Se revocan al cerrar sesión, cambiar la contraseña o borrar la cuenta    |
| Códigos de un solo uso                        | Minutos (registro 12 meses)       | Seguridad                                                                               | Vencen solos; purga pendiente                                            |
| Identificadores push                          | Hasta desinstalar o cerrar sesión | Contrato                                                                                | Se eliminan al cerrar sesión, al fallar la entrega o al borrar la cuenta |
| Registro de avisos                            | 12 meses                          | Soporte                                                                                 | Purga pendiente                                                          |
| Auditoría                                     | 2 años                            | Seguridad; prueba                                                                       | Purga pendiente                                                          |

**Pendiente técnico:** una tarea programada que purgue o anonimice lo vencido según esta tabla
(está en el [roadmap](../roadmap.md)).

## Borrar una cuenta

`DELETE /api/v1/me` (desde Mi cuenta en la web y en las apps) o a pedido por
{{correo_privacidad}}. Se rechaza con `409` mientras la persona tenga:

- reservas pagadas de salidas que aún no ocurrieron o un taxi en curso (`ACCOUNT_HAS_TRIPS`);
- pagos en verificación o reembolsos por recibir (`ACCOUNT_HAS_REFUNDS`);
- una empresa de la que es el único dueño (`ACCOUNT_OWNS_ORGANIZATION`).

Al borrar, en una transacción:

1. se vacían correo, teléfono, nombre, apellido y contraseña de `users`, el estado pasa a
   `deleted` y se registra `deleted_at`;
2. se revocan todas las sesiones y se eliminan los identificadores push;
3. se eliminan sus membresías e invitaciones pendientes;
4. se registra `user.deleted` en la auditoría (sin datos personales).

Lo que la ley obliga a conservar (reservas, pagos, listas de pasajeros, expedientes KYC) queda
guardado sin vínculo con una cuenta activa y se elimina al vencer su plazo. Si la persona vuelve a
registrarse con el mismo correo, obtiene una cuenta nueva sin su historial.
