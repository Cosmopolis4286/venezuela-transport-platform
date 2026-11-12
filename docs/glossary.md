# Glosario

Términos del negocio y del código, en el orden en que suelen aparecer.

| Término (código)                                 | Significado                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Empresa de autobuses** (`bus_company`)         | Organización que publica rutas y vende boletos                                                             |
| **Línea de taxis** (`taxi_line`)                 | Organización de taxis que opera en uno o más terminales                                                    |
| **Terminal** (`terminal`)                        | Organización que administra un terminal de pasajeros (y también un tipo de parada del catálogo)            |
| **Parada** (`stop`)                              | Lugar del catálogo donde suben o bajan pasajeros: un terminal o una parada en la vía                       |
| **Ruta** (`route`)                               | Recorrido de una empresa: paradas en orden con el tiempo desde el origen                                   |
| **Tramo**                                        | Par de paradas de una ruta (desde dónde hasta dónde viaja un pasajero); cada tramo tiene su tarifa         |
| **Horario** (`schedule`)                         | Hora de salida semanal de una ruta, con días, vigencia, clase de servicio y mapa de puestos                |
| **Salida / viaje** (`trip`)                      | Un horario en una fecha concreta                                                                           |
| **Mapa de puestos** (`seat layout`)              | La distribución de los asientos de un tipo de vehículo                                                     |
| **Apartado** (`held`)                            | Puestos reservados 15 minutos mientras el pasajero paga                                                    |
| **Reserva** (`booking`)                          | Los puestos de una persona en una salida; código `VTP-XXXXXX`                                              |
| **Boleto**                                       | Un puesto pagado, con su código QR (`VTP1.<id>`) que se escanea al abordar                                 |
| **Lista de pasajeros** (`manifest`)              | Quién viaja en cada puesto de una salida y si abordó                                                       |
| **Despacho** (`dispatch`)                        | Asignar vehículo y conductor a cada salida                                                                 |
| **Tasa de cambio** (`exchange rate`)             | Bolívares o reales por dólar que fija cada empresa para convertir sus tarifas                              |
| **Pago móvil**                                   | Transferencia inmediata entre bancos venezolanos por teléfono y cédula                                     |
| **PIX**                                          | Pago instantáneo de Brasil, en reales                                                                      |
| **USDT**                                         | Moneda digital atada al dólar (1:1)                                                                        |
| **Proveedor de pagos** (`PaymentProvider`)       | El adaptador que da las instrucciones de pago y confirma que llegó el dinero; hoy solo el simulado         |
| **Por reembolsar** (`refund_due`)                | Dinero que debe volver al pasajero: llegó tarde, de menos, o el pasajero canceló con derecho a reembolso   |
| **Comisión**                                     | Porcentaje de cada boleto que se queda la plataforma (política general u otra acordada con la empresa)     |
| **Tramos de reembolso**                          | Cuánto se devuelve según las horas que faltan para abordar (por defecto: 100 % desde 48 h, 50 % desde 2 h) |
| **Libro** (`settlement_entries`)                 | Lo que gana cada empresa por reserva pagada, y lo que pierde si se cancela                                 |
| **Liquidación / saldo**                          | Lo que la plataforma le debe a una empresa: ganado menos pagado                                            |
| **Pago a la empresa** (`payout`)                 | Transferencia de la plataforma a una empresa, registrada por un administrador                              |
| **KYC / solicitud** (`application`)              | Verificación de identidad y documentos de conductores y personal                                           |
| **Revisor** / **administrador** de la plataforma | Personal de VTP: el revisor aprueba organizaciones y KYC; el administrador además maneja el dinero         |
| **Código de acceso** (OTP)                       | Código de 6 dígitos para entrar sin contraseña                                                             |
| **Push**                                         | Notificación en el teléfono, enviada por el servicio de Expo                                               |
| **EAS**                                          | Servicio de Expo para compilar y publicar las apps; su id de proyecto habilita el push                     |
| **Mailpit**                                      | Buzón de prueba para ver en el navegador los correos de desarrollo                                         |
| **`reason`**                                     | Código estable que explica un rechazo de la API (por ejemplo `SEAT_TAKEN`); las apps lo traducen           |
