# Guion del piloto suburbano

Prueba con gente real en **una ruta urbana o suburbana de una empresa**, antes de abrir al
público. Dura unas dos semanas (coincide con la prueba cerrada de Google Play). Cada paso dice quién
lo hace y qué debe pasar; anota cualquier diferencia.

## Antes de empezar

- La [guía de lanzamiento](../deployment/launch-guide.md) está completa hasta el paso 7.
- Participan: la administración (tú), la empresa (dueño o administrador), 2–3 conductores y unos
  12 pasajeros con Android (los probadores de Google Play).

## Día 0: preparación

| #   | Quién          | Qué hace                                                                                         | Debe pasar                                                                 |
| --- | -------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 1   | Empresa        | Se registra en la web y envía sus datos                                                          | Aparece en `/admin` para revisión                                          |
| 2   | Administración | Aprueba la empresa                                                                               | La empresa recibe un correo y entra al portal                              |
| 3   | Empresa        | Crea la ruta **urbana o suburbana** con sus paradas y tarifas                                    | La ruta queda en borrador                                                  |
| 4   | Empresa        | Agrega un horario con **frecuencia** (p. ej. cada 15 min de 05:00 a 20:00) y **publica** la ruta | Sale en la búsqueda como "Cada 15 min · boleto abierto"                    |
| 5   | Empresa        | Invita a los conductores (rol **Conductor**)                                                     | Les llega la invitación                                                    |
| 6   | Conductores    | Instalan la app de transportistas, aceptan y envían su solicitud con documentos                  | La administración la ve en `/admin`                                        |
| 7   | Administración | Revisa y aprueba a los conductores; la empresa los acepta                                        | En la app ven **Validar boletos**, **Ventas en efectivo** y **Mis cobros** |
| 8   | Conductores    | Registran en **Mis cobros** dónde quieren cobrar                                                 | La empresa y la administración lo ven en la liquidación                    |

## Cada día del piloto

| #   | Quién          | Qué hace                                                                    | Debe pasar                                                       |
| --- | -------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Pasajero       | Busca la ruta en la app, elige cuántos pasajeros y compra el boleto abierto | Ve el total con el cargo por servicio y la referencia para pagar |
| 2   | Pasajero       | Paga por pago móvil y escribe el número de operación                        | El pago queda "en revisión"                                      |
| 3   | Administración | Verifica el pago en `/admin/payments` contra el banco                       | El pasajero recibe el aviso y ve su QR                           |
| 4   | Conductor      | Al subir, escanea el QR en **Validar boletos**                              | "Boleto válido"; un segundo escaneo dice "ya se usó"             |
| 5   | Conductor      | Anota en **Ventas en efectivo** a quienes pagaron en efectivo               | El total del día sube; un error se puede anular                  |
| 6   | Administración | Carga la tasa BCV y emite las facturas en borrador en `/admin/fiscal`       | Las facturas quedan emitidas con monto en bolívares              |
| 7   | Empresa        | Revisa **Reportes**: ventas por la app y efectivo                           | Las cifras coinciden con lo que reportan los conductores         |

Prueba al menos una vez:

- un pago con monto equivocado (debe quedar para devolver);
- una cancelación del pasajero antes de que arranque el servicio (muestra cuánto se devuelve);
- la cancelación de un día de servicio por la empresa (todos reciben el aviso y el reembolso);
- un boleto de otro día (debe salir "es para otra salida");
- el pago a un conductor desde la liquidación (`/admin/settlements`).

## Al cierre de cada semana

- Pagar a los conductores su saldo y registrar la referencia.
- Descargar el libro de ventas del mes (`/admin/fiscal/books`) para el contador.
- Revisar los correos de alerta de errores y el monitor de `/api/v1/health/ready`.

## Criterios para abrir al público

- Ningún error que impida comprar, pagar o abordar durante una semana completa.
- Pagos verificados en menos de 30 minutos en horario de atención.
- Cifras de reportes, liquidación y libro de ventas cuadradas entre sí.
- Revisiones del abogado y del contador hechas y sus cambios aplicados.
