# Derechos de los titulares e incidentes de seguridad (procedimientos internos)

## Solicitudes de los titulares (_habeas data_, LGPD)

Canal: {{correo_privacidad}}. Plazo de respuesta: **15 días hábiles** (Venezuela) y, para usuarios
en Brasil, el que fije la LGPD y la ANPD (en general, 15 días para el acceso completo).

1. **Registrar** la solicitud (fecha, canal, tipo: acceso, rectificación, actualización,
   cancelación, oposición, revocación, portabilidad).
2. **Verificar la identidad**: la solicitud debe venir del correo de la cuenta, o la persona debe
   probar que controla el correo o teléfono de la cuenta (un código de un solo uso). Nunca pedir
   la contraseña.
3. **Buscar** sus datos con el [registro de tratamientos](registro-de-tratamientos.md) (cuenta,
   reservas, pagos, KYC, taxis, avisos, auditoría).
4. **Responder**:
   - _Acceso / portabilidad_: entregar una copia en un formato legible (JSON o PDF) por un canal
     seguro.
   - _Rectificación_: corregir; la mayoría de los datos la persona puede cambiarlos en Mi cuenta.
   - _Cancelación_: borrar la cuenta según [conservación y borrado](conservacion-y-borrado.md),
     explicando qué se conserva por obligación legal y hasta cuándo.
   - _Oposición / revocación_: dejar de tratar para esa finalidad (por ejemplo, retirar el
     consentimiento KYC implica dejar de trabajar como conductor en la plataforma).
5. **Documentar** la respuesta y la fecha.

## Incidentes de seguridad

Un incidente es cualquier acceso, pérdida, alteración o divulgación no autorizada de datos
personales, o una falla que la haga posible.

1. **Contener** (primeras horas): revocar credenciales o sesiones comprometidas
   (`sessions.revoked_at`), rotar secretos de la configuración, aislar el servidor si hace falta.
2. **Evaluar**: qué datos, de cuántas personas, desde cuándo, si incluye datos sensibles (KYC,
   certificado médico, documentos de identidad) o de pago, y el riesgo para las personas.
3. **Registrar** el incidente: hechos, cronología, datos afectados, medidas.
4. **Avisar**:
   - a las personas afectadas, **sin demora indebida**, cuando el incidente pueda afectar sus
     derechos: qué pasó, qué datos, qué hicimos y qué pueden hacer (por ejemplo, cambiar la
     contraseña);
   - a las empresas afectadas, si involucra datos de sus pasajeros o personal;
   - a las autoridades competentes cuando la ley lo exija o el incidente constituya un delito
     (Ley Especial contra los Delitos Informáticos); para usuarios en Brasil, evaluar la
     comunicación a la ANPD en el plazo que esta fije.
5. **Corregir** la causa y revisar las medidas; anotar lo aprendido.

Responsable de coordinar: {{encargado_datos}}.
