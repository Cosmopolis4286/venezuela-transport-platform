# Conservación y borrado de datos (interno)

Reglas para guardar y eliminar datos personales. Los plazos son propuestas que debe confirmar la
revisión legal (ver [README](README.md#lista-para-el-abogado)).

## Plazos

| Datos                                         | Plazo propuesto                   | Fundamento                                                                              | Cómo se cumple hoy                                                                       |
| --------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Cuenta (correo, teléfono, nombre, contraseña) | Mientras exista                   | Contrato                                                                                | Se anonimiza al borrar la cuenta (abajo)                                                 |
| Reservas, boletos, listas de pasajeros        | 10 años                           | Comprobantes mercantiles y tributarios; normativa de transporte                         | Los nombres y documentos de los pasajeros se borran al vencer                            |
| Pagos, reembolsos, liquidaciones              | 10 años                           | Código de Comercio, Código Orgánico Tributario, prevención de legitimación de capitales | Se conservan                                                                             |
| Expedientes KYC y sus archivos                | Mientras trabaje + 5 años         | Seguridad de los pasajeros; prevención de legitimación de capitales                     | Rechazados o de cuentas borradas: archivos y datos se borran a los 5 años de la revisión |
| Sesiones                                      | Hasta vencer o revocarse          | Seguridad                                                                               | Se revocan al cerrar sesión, cambiar la contraseña o borrar la cuenta                    |
| Códigos de un solo uso                        | Minutos (registro 12 meses)       | Seguridad                                                                               | Vencen solos; se borran a los 12 meses                                                   |
| Identificadores push                          | Hasta desinstalar o cerrar sesión | Contrato                                                                                | Se eliminan al cerrar sesión, al fallar la entrega o al borrar la cuenta                 |
| Registro de avisos                            | 12 meses                          | Soporte                                                                                 | Se borra a los 12 meses                                                                  |
| Auditoría                                     | 2 años                            | Seguridad; prueba                                                                       | Se borra a los 2 años                                                                    |

**Purga automática:** la API ejecuta una vez al día `RetentionService`
(`apps/api/src/modules/retention`), que aplica estos plazos: borra los códigos, avisos y auditoría
vencidos y las sesiones revocadas o vencidas hace más de 30 días; reemplaza por «—» el nombre y el
documento de los pasajeros de más de 10 años y la dirección, notas y teléfono de los taxis de más
de 5 años; y borra los archivos y datos de los expedientes KYC rechazados o de cuentas borradas a
los 5 años de su revisión. Las reservas, pagos y liquidaciones se conservan como comprobantes
contables (sin datos personales al vencer). Si cambia un plazo, cambiar también `RETENTION` en
`retention.service.ts`. El resultado queda en los registros (`Retention sweep`).

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
