# Casacoima (El Triunfo – Sierra Imataca): transporte y auditoría de la plataforma

Noviembre de 2026. Qué dicen las fuentes públicas sobre el transporte en el municipio Casacoima
(Delta Amacuro) y su conexión con San Félix, Puerto Ordaz y Tucupita, y qué tiene o le falta a la
plataforma para ese contexto. Las fuentes son medios regionales y fichas públicas; hay pocas y
algunas son antiguas, así que **conviene confirmar en terreno** con las líneas y la alcaldía antes
del piloto.

## 1. El contexto

| Tema                  | Qué se encontró                                                                                                                                                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Territorio            | Municipio de ~30.000 habitantes, capital Sierra Imataca; incluye El Triunfo, Los Castillos de Guayana y Piacoa. La parroquia 5 de Julio pasó al municipio Caroní (Bolívar) por decisión del TSJ: la zona de servicio cruza el límite entre estados. [1][2]                                                                  |
| Rutas                 | El Triunfo – Puerto Ordaz / San Félix por carretera, unos 45 minutos; desde San Félix salen unidades a El Triunfo. La vía (carretera nacional en Casacoima) es estrecha y ha tenido accidentes graves. El terminal de Tucupita tiene más de diez líneas de carros por puesto a Puerto Ordaz, San Félix y Maturín. [3][4][5] |
| Combustible           | Habitantes de Casacoima reportaron meses **sin transporte público por falta de combustible**; colas de más de 4 horas para surtir en Tucupita; denuncias de choferes que reciben gasolina subsidiada y no cubren las rutas. [3][6][7]                                                                                       |
| Tarifas               | El pasaje se ajusta **cada mes** y se ancla al dólar con la tasa BCV; abundan los cobros por encima de la tarifa legal y los recargos por pagar con pago móvil; falta efectivo en bolívares. [8][9][10]                                                                                                                     |
| Calidad del servicio  | Denuncias de choferes que **cobran el pasaje completo y no cubren la ruta completa**. [11]                                                                                                                                                                                                                                  |
| Conectividad          | En Casacoima solo llegan Movilnet y Movistar, con serias dificultades; los equipos en **El Triunfo, Sierra Imataca y Los Castillos fueron abandonados** por los operadores; caídas de días y velocidades muy bajas; apagones. [12][13][14]                                                                                  |
| Comunidades ribereñas | En Santa Catalina (Casacoima) no hay transporte público ni fluvial, y en emergencias no hay cómo trasladar a los enfermos. [15]                                                                                                                                                                                             |

**Conclusiones para el producto:** la señal es el mayor riesgo (sin señal no se compra, no se
muestra el boleto y no se valida); el servicio se interrumpe por días (combustible) y los
pasajeros necesitan saberlo antes de ir a la parada; el precio cambia cada mes y se cobra en
bolívares a tasa del día; y la confianza depende de poder reclamar cuando cobran de más o no
completan la ruta.

## 2. Lo que ya cubre la plataforma

- Servicio suburbano **por frecuencia con boleto abierto** para el día (ADR-032), que encaja con
  carritos y autobuses que salen seguido.
- **Ventas en efectivo** registradas por el conductor (ADR-033) y **pago móvil con referencia**
  verificado a mano (ADR-027): no depende de pasarelas.
- **Compra sin registrarse** (ADR-034) y **WhatsApp** asistido y automático (ADR-037/038), para
  quien no usa la app o tiene poca experiencia digital.
- La empresa **cancela una salida** y se reembolsa completo; la administración **pausa una zona**.
- Taxis y **mototaxis por tramo** con tarifa fija, conductores independientes, ubicación,
  emergencia y calidad por calificación (ADR-035 a 044).
- Precios en US$ o Bs. con tasas de cambio; facturación en bolívares con la tasa BCV (ADR-031).
- Calidad del código: `pnpm check` pasa completo (19/19) sobre `main` al 2026-11-21.

## 3. Lo que falta o hay que corregir

Ordenado por impacto en Casacoima.

### Crítico

1. **Funcionar sin señal.**
   - ✅ Resuelto (ADR-050): la app de pasajeros guarda los boletos pagados y los muestra sin señal. Antes: el boleto (QR) del pasajero se carga de la API cada vez (`apps/passenger-mobile/src/app/booking/[id].tsx`): sin señal en la parada no hay boleto. Hay que **guardarlo en el teléfono** al pagar y mostrarlo sin conexión.
   - ✅ Resuelto (ADR-049): el escáner valida sin señal con la lista guardada. Antes: el escáner del conductor valida contra la API (`apps/transport-mobile/src/app/scan.tsx`); el roadmap ya lo marca pendiente. Hay que **descargar los boletos de la salida o del día** antes de salir, validar en el teléfono y sincronizar al recuperar la señal (sin vender dos veces el mismo boleto).
   - ✅ Resuelto (ADR-051): se guardan en una cola y se envían al volver la señal, con la hora real; la app abre sin señal. Antes: las **ventas en efectivo**, la salida y la llegada fallan sin señal: hay que **guardarlas en una cola** y enviarlas después.
2. ✅ **Resuelto (ADR-048): los bolívares usan siempre la tasa oficial del BCV, actualizada cada 6 horas.** Antes: **tasa de cambio de la empresa sin vencimiento.** Al pagar una reserva en bolívares se usa la
   tasa que la empresa guardó, sin importar su antigüedad (`PaymentsService.optionsFor`), mientras
   que la tasa de la plataforma para paquetes debe tener menos de 24 horas
   (`PLATFORM_RATE_MAX_HOURS`). Con el pasaje anclado al dólar y el BCV moviéndose a diario, una
   tasa vieja hace perder dinero a la empresa (o cobrar de más). Propuesta: misma regla de 24 horas
   (si vence, no se ofrece el pago en Bs. y el portal avisa), o tomar la tasa BCV del día.
3. **Aviso de "sin servicio"** por ruta o línea (combustible, vía, lluvia), visible en la búsqueda,
   la app y WhatsApp, con push a quien tenga boletos de ese día. Hoy solo se cancela salida por
   salida, y pausar la zona es de la administración.

### Alto

4. **Reportar un problema en un viaje de bus o carrito**: cobró de más, no completó la ruta, no
   salió. Hoy solo los taxis y motos se califican (ADR-044) y lo demás va al WhatsApp de soporte.
   Debe quedar registrado por empresa, verse en su portal y en las métricas de la plataforma.
5. **Tarifa oficial** por zona y tipo de vehículo (la que fija la alcaldía): mostrarla al pasajero
   y avisar cuando una línea publica una tarifa por encima.
6. **Entrar sin correo** para conductores y personal: los códigos solo llegan por correo (SMS y
   WhatsApp pendientes; en WhatsApp los mensajes de autenticación se pagan). Alternativa sin costo:
   un **código de acceso** que genera el dueño de la línea en el portal.
7. **Datos reales del piloto**: la semilla tiene una sola "Parada Casacoima" con coordenadas
   aproximadas. Faltan las paradas reales (El Triunfo, Sierra Imataca, Los Castillos, Piacoa…), los
   tiempos y las tarifas de cada línea, y la ruta hacia Tucupita si se va a ofrecer. Esto se
   levanta en terreno.

### Medio

8. **Tiempo para pagar con señal débil**: el apartado dura 15 minutos (`BOOKING_HOLD_MINUTES`). En
   el piloto conviene 30.
9. **"Sale cuando se llena"** (carritos por puesto del terminal): mostrar cuántos puestos quedan en
   el carro que está cargando. La frecuencia con boleto abierto lo cubre en parte; decidir tras el
   piloto.
10. **Emergencia sin señal**: el botón llama al 911; si no hay señal, mostrar qué hacer (número para
    llamar cuando vuelva la señal, compartir el viaje por SMS).
11. **Consumo de datos**: medir el tamaño de la app y de cada pantalla; evitar descargas grandes
    en actualizaciones.

### Después de la v1

12. **Transporte fluvial** (lanchas y curiaras) para comunidades ribereñas como Santa Catalina: un
    tipo de vehículo nuevo, con horarios por marea y capacidad por embarcación.
13. **Textos en warao** para las comunidades indígenas, empezando por la compra y el boleto.

## 4. Orden sugerido

1. Tasa de cambio con vencimiento (pequeño, evita pérdidas).
2. Boleto guardado en el teléfono y escáner sin conexión.
3. Aviso de "sin servicio".
4. Reportar un problema y tarifa oficial.
5. Código de acceso para conductores.
6. Levantamiento de paradas, rutas y tarifas reales con las líneas (trabajo de campo).

## Fuentes

1. [Municipio Casacoima — Wikipedia](https://es.wikipedia.org/wiki/Municipio_Casacoima)
2. [Anexo: Parroquias del estado Delta Amacuro — Wikipedia](https://es.wikipedia.org/wiki/Anexo:Parroquias_del_estado_Delta_Amacuro)
3. [Desde Casacoima caminan hasta San Félix por alimentos — Primicia](https://primicia.com.ve/guayana/regiones/casacoima/)
4. [Disfrute las quebradas de Casacoima — Últimas Noticias](https://ultimasnoticias.com.ve/delta%20amacuro/disfrute-las-quebradas-de-casacoima-en-delta-amacuro/)
5. [Más de 2.000 personas se han movilizado por el terminal de Tucupita — Últimas Noticias](https://ultimasnoticias.com.ve/delta-amacuro/mas-de-2-000-personas-se-han-movilizado-por-el-terminal-de-tucupita/)
6. [Largas colas para echar gasolina en Tucupita — Costa del Sol FM](https://www.costadelsolfm.org/2026/06/largas-colas-para-echar-gasolina-en-tucupita-la-e-s-del-paseo-manamo-esta-danada/)
7. [Transportistas de Villa Rosa reciben gasolina pero no trabajan — Costa del Sol FM](https://www.costadelsolfm.org/2026/04/denuncian-que-a-los-transportistas-de-villa-rosa-en-delta-amacuro-les-dan-gasolina-pero-no-trabajan/)
8. [Carros por puesto en Tucupita cobran 400 Bs. — Costa del Sol FM](https://www.costadelsolfm.org/2026/08/los-carros-por-puesto-en-tucupita-ya-estan-cobrando-el-pasaje-a-400-bolivares/)
9. [Pasaje urbano indexado al dólar — El Diario](https://eldiario.com/2026/05/22/aumento-pasaje-urbano-2/)
10. [Cobro adicional por pago móvil en Maturín — El Diario](https://eldiario.com/2026/09/10/cobro-adicional-transporte-maturin/)
11. [Cobran completo pero no cubren la ruta en San Rafael — Costa del Sol FM](https://www.costadelsolfm.org/2026/06/los-conductores-de-carros-por-puestos-cobran-completo-pero-no-cubren-la-ruta-completa-en-san-rafael-de-tucupita/)
12. [Colapsa el sistema de telecomunicaciones en Delta Amacuro — Tane Tanae](https://www.tanetanae.com/colapsa-el-sistema-de-telecomunicaciones-en-delta-amacuro/)
13. [Balance IPYSve: Delta Amacuro](https://ipysvenezuela.org/alerta/balance-ipysve-delta-amacuro-entre-desiertos-informativos-y-medios-sobrevivientes/)
14. [Tucupita, más de una semana sin Movilnet — Radio Fe y Alegría](https://www.radiofeyalegrianoticias.com/usuarios-de-tucupita-reportan-mas-de-una-semana-sin-servicio-de-movilnet/)
15. [Fallan todos los servicios públicos en Santa Catalina — Costa del Sol FM](https://www.costadelsolfm.org/2026/04/fallan-todos-los-servicios-publicos-en-santa-catalina-estado-delta-amacuro/)
