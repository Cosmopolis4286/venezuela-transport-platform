# Probar las apps en Android

Tres formas, de la más rápida a la más parecida a lo que instalarán los usuarios. Todas necesitan
la API corriendo y accesible desde el teléfono o el emulador.

| Forma                   | Qué se instala en el teléfono | Necesita                                           | Ideal para                                 |
| ----------------------- | ----------------------------- | -------------------------------------------------- | ------------------------------------------ |
| **Expo Go**             | Expo Go (Play Store)          | Teléfono y computadora en la misma red Wi-Fi       | Pruebas diarias, recarga en vivo           |
| **Emulador de Android** | Nada                          | Android Studio con un emulador (AVD)               | Probar sin teléfono                        |
| **APK** (EAS o local)   | El archivo APK                | Una cuenta de Expo (EAS) o Android Studio + JDK 17 | Compartir una versión, probar como usuario |

Las dos apps solo usan módulos incluidos en Expo Go (cámara, almacenamiento seguro), así que en
Expo Go funcionan todas las pantallas, incluido el escáner de boletos.

## 1. Hacer accesible la API

En un teléfono, `localhost` es el propio teléfono, así que la app necesita la dirección de tu
computadora.

1. Busca la IP de tu computadora en la red Wi-Fi. En Windows: `ipconfig` →
   _Adaptador de LAN inalámbrica Wi-Fi_ → _Dirección IPv4_ (por ejemplo `192.168.1.50`).
2. Publica la API en la red:
   - API en Docker ([docker.md](docker.md)): pon `VTP_API_PUBLISH_ADDRESS=0.0.0.0` en el `.env` de
     la raíz y corre `pnpm stack:api`.
   - API en tu computadora: pon `API_HOST=0.0.0.0` en `apps/api/.env` y reiníciala.
3. Permite el puerto en el firewall de Windows (PowerShell como administrador, solo redes
   privadas):

   ```powershell
   New-NetFirewallRule -DisplayName "VTP API" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
   ```

4. Compruébalo desde el navegador del teléfono: `http://192.168.1.50:4000/api/v1/health` muestra
   `"status":"ok"`.

Hazlo solo en una red de confianza: cualquiera en esa red puede llegar a la API.

## 2. Expo Go (recomendado para empezar)

1. En `apps/passenger-mobile/.env` (y en `apps/transport-mobile/.env`):
   `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:4000/api/v1`.
2. `pnpm dev:passenger` (o `pnpm dev:transport`). Windows puede pedir permiso para que Node.js use
   las redes privadas: permítelo, porque Metro también tiene que ser accesible.
3. Abre **Expo Go** en el teléfono y escanea el código QR que aparece en la terminal.
4. Después de editar un `.env`, reinicia Metro limpiando la caché:
   `pnpm --filter @vtp/passenger-mobile exec expo start --clear --port 8081`.

Si Expo Go dice que el proyecto necesita otro SDK, actualiza Expo Go desde la Play Store (las apps
usan el SDK 58). Si el teléfono no llega a Metro (Wi-Fi corporativa, WSL), inicia Metro con
`--tunnel`.

La API imprime los códigos de acceso (`docker compose logs api | grep "login code"` en Docker);
los pagos usan el proveedor simulado.

## 3. Emulador de Android

Inicia un emulador desde Android Studio (_Device Manager_), pon
`EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000/api/v1` (así llama el emulador a tu computadora) y
pulsa `a` en la terminal de Metro. No hace falta tocar el firewall.

## 4. Un APK instalable

Un APK es una **versión de release**: lleva el JavaScript empaquetado y la URL de la API, y no se
conecta a Metro. Antes hay que decidir dos cosas:

- **El nombre del paquete Android** de cada app, por ejemplo `ve.vtp.pasajeros` y
  `ve.vtp.transportistas`. Es permanente una vez publicada en Google Play.
- **Una URL HTTPS para la API.** Las versiones de release de Android rechazan `http://` por
  defecto. Para pruebas, un túnel temporal le da una dirección HTTPS a tu API local:
  `cloudflared tunnel --url http://localhost:4000` muestra `https://<aleatorio>.trycloudflare.com`
  (usa `https://<aleatorio>.trycloudflare.com/api/v1`). Más adelante, la API desplegada.

### Con EAS Build (en la nube, sin herramientas de Android)

Necesita una cuenta gratuita de [Expo](https://expo.dev) (el plan gratuito tiene un cupo mensual
de compilaciones).

```bash
cd apps/passenger-mobile
npx eas-cli@latest login
npx eas-cli@latest init                 # vincula la app con tu cuenta de Expo
npx eas-cli@latest build -p android --profile preview
```

El perfil `preview` de `eas.json` debe generar un APK (`"android": { "buildType": "apk" }`) y
definir `EXPO_PUBLIC_API_BASE_URL` en su `env`, porque EAS no sube el `.env` (está ignorado por
git). Cuando termina, EAS muestra un enlace y un código QR: ábrelo en el teléfono, descarga el APK
y permite instalar desde ese origen.

`eas init` también escribe el id del proyecto en `app.json` (`extra.eas.projectId`). Con él, la
app se registra para las **notificaciones push** al iniciar sesión (con Expo Go en un teléfono
también). Para que lleguen, la API debe usar `PUSH_DELIVERY=expo`
([notifications.md](../architecture/notifications.md)); en Android, las compilaciones propias
necesitan además las credenciales de Firebase (FCM) cargadas en EAS.

### En tu computadora (sin cuenta, más preparación)

Necesita Android Studio (Android SDK) y JDK 17 en la computadora.

```bash
cd apps/passenger-mobile
npx expo prebuild -p android            # genera android/ (no se sube al repositorio)
cd android && ./gradlew assembleRelease # en Windows: gradlew.bat assembleRelease
```

El APK queda en `android/app/build/outputs/apk/release/`. Cópialo al teléfono e instálalo. Esta
versión va firmada con una clave de desarrollo: sirve para probar, no para Google Play.
