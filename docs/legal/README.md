# Documentos legales

> **Borradores pendientes de revisión legal.** Estos textos los preparó el equipo técnico a partir
> de la normativa venezolana (y de la brasileña, por los pagos con PIX) y del funcionamiento real
> de la plataforma. **No son asesoría jurídica** ni garantizan cumplimiento ante las autoridades:
> antes de operar con usuarios y dinero reales, un abogado venezolano debe revisarlos, completarlos
> y aprobarlos. Mientras `revisado_por_abogado` sea `false` en [empresa.json](empresa.json), las
> páginas públicas muestran un aviso de «versión preliminar».

## Qué hay

| Documento                                                                       | Para quién                                          | Publicado en                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| [Términos y Condiciones de Uso](terminos-y-condiciones.md)                      | Todos los usuarios                                  | `/{idioma}/legal/terminos`                  |
| [Política de Privacidad](politica-de-privacidad.md)                             | Todos (incluye la sección LGPD para Brasil)         | `/{idioma}/legal/privacidad`                |
| [Política de Cancelación y Reembolsos](politica-de-cancelacion-y-reembolsos.md) | Pasajeros                                           | `/{idioma}/legal/cancelacion-y-reembolsos`  |
| [Condiciones para Empresas](condiciones-para-empresas.md)                       | Empresas de transporte, líneas de taxis, terminales | `/{idioma}/legal/condiciones-para-empresas` |
| [Política de Cookies](politica-de-cookies.md)                                   | Visitantes del sitio                                | `/{idioma}/legal/cookies`                   |
| [Registro de tratamientos](registro-de-tratamientos.md)                         | Interno                                             | —                                           |
| [Conservación y borrado de datos](conservacion-y-borrado.md)                    | Interno                                             | —                                           |
| [Derechos de los titulares e incidentes de seguridad](derechos-e-incidentes.md) | Interno (procedimientos)                            | —                                           |

Las páginas se generan desde estos archivos: después de editar uno, ejecuta
`pnpm --filter @vtp/web legal:build` y confirma el resultado (`src/content/legal.generated.ts`).
Una prueba falla si el archivo generado no coincide con estos documentos.

## Datos de la empresa

Los textos usan marcadores como `{{razon_social}}` o `{{rif}}`, que se reemplazan con los valores
de [empresa.json](empresa.json). Hay que completar: razón social, RIF, domicilio fiscal, datos del
registro mercantil, correos de soporte y privacidad, teléfono, sitio web, ciudad de los tribunales
competentes, responsable de protección de datos y proveedor/país del alojamiento. Al cambiar un
texto de forma importante, sube `version` (fecha `AAAA-MM-DD`): la plataforma pedirá a los usuarios
aceptar la nueva versión.

## Cómo se aceptan

- Al **registrarse con correo y contraseña** (web y apps) hay que marcar «Acepto los Términos y la
  Política de Privacidad».
- Al **crear la cuenta con un código**, el botón indica que continuar implica aceptarlos.
- La API guarda la **versión aceptada y la fecha** (`users.terms_version`, `users.terms_accepted_at`)
  y la auditoría registra `user.terms_accepted`. Cuando cambia la versión, el portal y las apps
  piden aceptar la nueva.

## Normativa considerada

**Venezuela**

- Constitución (1999): art. 28 (_habeas data_), art. 60 (honor, vida privada, confidencialidad y
  límites al uso de la informática), art. 117 (derechos de las personas consumidoras y usuarias).
- Jurisprudencia de la Sala Constitucional del TSJ sobre principios de protección de datos
  personales (no hay una ley general de protección de datos).
- Decreto con Fuerza de Ley sobre Mensajes de Datos y Firmas Electrónicas (2001): validez de la
  contratación y los documentos electrónicos.
- Ley Especial contra los Delitos Informáticos (2001).
- Ley de Transporte Terrestre (2008) y normativa del INTT: permisos, seguros, lista de pasajeros.
- Ley Orgánica de Precios Justos y normativa de la SUNDDE: derechos de las personas en el acceso a
  bienes y servicios, reclamos.
- Ley Orgánica para la Protección de Niños, Niñas y Adolescentes: viajes de menores.
- Ley Orgánica contra la Delincuencia Organizada y Financiamiento al Terrorismo (2012) y
  normativa sobre legitimación de capitales.
- Código Orgánico Tributario y providencias del SENIAT sobre facturación; Código de Comercio
  (conservación de libros y comprobantes).
- Normativa sobre criptoactivos (Decreto Constituyente sobre el Sistema Integral de Criptoactivos
  y la autoridad competente en la materia).

**Brasil** (usuarios que pagan con PIX o residen allá)

- Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).
- Código de Defesa do Consumidor (Lei nº 8.078/1990).

## Lista para el abogado

Puntos que la revisión debe resolver o confirmar (marcados también en el [roadmap](../roadmap.md)):

1. **Recibir pagos por cuenta de terceros** (modo «cobra la plataforma»): si exige autorización,
   registro o una figura especial ante SUDEBAN u otra autoridad, o si conviene operar solo con el
   modo «cobra la empresa» hasta tenerla.
2. **Pagos en USDT**: requisitos vigentes de la autoridad de criptoactivos y del régimen de
   prevención de legitimación de capitales (registro, límites, debida diligencia).
3. **PIX y usuarios en Brasil**: si recibir pagos de brasileños exige una institución o socio en
   Brasil, y si hace falta nombrar un _encarregado_ y traducir la Política de Privacidad al
   portugués (recomendado).
4. **Facturación**: confirmar que cada empresa emite la factura del pasaje y {{nombre_comercial}}
   factura solo su comisión, y el tratamiento del IVA de cada parte.
5. **Plazos de conservación** de la [tabla](conservacion-y-borrado.md): ajustarlos a las normas
   mercantiles, tributarias, de transporte y de prevención de legitimación de capitales.
6. **Datos sensibles**: el certificado médico de los conductores (dato de salud); confirmar el
   consentimiento y el acceso restringido.
7. **Viajes de menores**: alcance de la autorización exigida por la LOPNNA para viajes nacionales.
8. **Responsabilidad e indemnidad**: límites válidos frente a consumidores (no se pueden renunciar
   derechos) y frente a las empresas.
9. **Jurisdicción** y fuero del consumidor.
10. **Traducciones**: hoy el texto que rige es el español; decidir si publicar versiones en inglés
    y portugués y cuál prevalece.
11. **Contratos con proveedores** (alojamiento, correo, Expo/Google/Apple, bancos): acuerdos de
    confidencialidad y tratamiento de datos.
12. Registro de la marca «{{nombre_comercial}}» ante el SAPI.
