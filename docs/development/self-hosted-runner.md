# Runner de CI propio (Windows + WSL 2)

`.github/workflows/self-hosted-ci.yml` ejecuta los mismos cuatro trabajos que CircleCI (calidad,
pruebas e2e de la API con PostGIS, bundles de las apps móviles e imágenes de producción) en un
**runner de GitHub Actions instalado en tu propia computadora**. GitHub no cobra minutos por los
runners propios, así que los checks siguen funcionando aunque se acaben los créditos de la CI en la
nube. Ver ADR-022.

Cómo se comporta:

- Los trabajos solo corren mientras la computadora está encendida y el runner iniciado. Si no,
  esperan en la cola (hasta 24 horas) y arrancan cuando el runner vuelve.
- Los cuatro trabajos corren uno tras otro en un solo runner; una corrida completa tarda entre 10 y
  20 minutos aproximadamente.
- Los pull requests que vienen de forks nunca corren en él (el runner ejecuta el código del pull
  request). Mantén el repositorio **privado** mientras uses un runner propio.

## Por qué WSL 2 y no Windows directamente

Los trabajos corren dentro de los mismos contenedores que en CircleCI (`node:24.22.0-trixie` y,
para las pruebas e2e, `postgis/postgis:18-3.6`). GitHub Actions solo admite contenedores de
trabajo y de servicio en runners **Linux**, por eso el runner se instala dentro de Ubuntu en WSL 2,
usando el Docker Desktop que ya tienes.

## 1. Preparar Ubuntu en WSL 2 (una sola vez)

1. En PowerShell **como administrador**: `wsl --install -d Ubuntu-24.04`. Reinicia si te lo pide y
   crea el usuario de Ubuntu cuando se abra la ventana.
2. En Docker Desktop → _Settings → Resources → WSL integration_: activa **Ubuntu-24.04** y pulsa
   _Apply & restart_.
3. Abre Ubuntu (menú Inicio → "Ubuntu 24.04") y comprueba Docker: `docker run --rm hello-world`.
4. Opcional, para que el runner arranque solo: activa systemd en Ubuntu.

   ```bash
   printf '[boot]\nsystemd=true\n' | sudo tee /etc/wsl.conf
   ```

   Luego en PowerShell: `wsl --shutdown`, y vuelve a abrir Ubuntu.

5. Opcional, si las compilaciones se quedan sin memoria: crea `C:\Users\<tu-usuario>\.wslconfig`
   con

   ```ini
   [wsl2]
   memory=8GB
   ```

   y ejecuta `wsl --shutdown`.

## 2. Registrar el runner (una sola vez)

1. En GitHub: repositorio → _Settings → Actions → Runners → New self-hosted runner_. Elige
   **Linux** y **x64**. La página muestra los comandos con un **token de registro**: es personal y
   vence en una hora. No lo pegues en ningún otro lugar.
2. En Ubuntu, ejecuta los comandos de la sección _Download_ de esa página (crean
   `~/actions-runner`).
3. Ejecuta el comando de la sección _Configure_ de esa página agregando la etiqueta `vtp`, por
   ejemplo:

   ```bash
   ./config.sh --url https://github.com/Cosmopolis4286/venezuela-transport-platform \
     --token <token de la página> --name vtp-pc --labels vtp --work _work --unattended
   ```

   El workflow solo corre en runners con las etiquetas `self-hosted`, `linux` y `vtp`.

## 3. Iniciarlo

- **Cuando quieras checks:** `cd ~/actions-runner && ./run.sh` (se detiene con Ctrl+C).
- **Siempre activo mientras Ubuntu esté abierto** (necesita systemd, paso 1.4):
  `cd ~/actions-runner && sudo ./svc.sh install && sudo ./svc.sh start`.

En el repositorio → _Settings → Actions → Runners_ aparece como **Idle** cuando está listo. Los
trabajos que estaban en cola arrancan solos.

## 4. Exigir sus checks (opcional)

_Settings → Branches_ (regla de `main`) → _Require status checks to pass_ y elige los trabajos de
**CI (self-hosted)**: `Lint, typecheck, test, build`, `API e2e (PostgreSQL + PostGIS)`,
`Mobile bundles (Android + iOS JS)` y `Production images`. Mientras no haya créditos de CircleCI,
no exijas los checks `ci/circleci: …`, o no se podrá fusionar ningún pull request.

## Mantenimiento

- Actualizaciones: el runner se actualiza solo. Las imágenes Docker de los trabajos se descargan
  cuando faltan.
- Disco: el almacén de pnpm vive en el volumen Docker `vtp-ci-pnpm-store`; el trabajo de imágenes
  borra las que construye. Para liberar espacio: `docker system prune` (y
  `docker volume rm vtp-ci-pnpm-store`, que solo hace más lenta la siguiente instalación).
- Quitar el runner: en GitHub, _Runners → … → Remove_ te da un token de eliminación; luego en
  Ubuntu `sudo ./svc.sh uninstall` (si lo instalaste como servicio) y
  `./config.sh remove --token <token>`.

## Problemas frecuentes

| Síntoma                                                     | Solución                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Los trabajos se quedan en "Queued"                          | El runner está apagado o no tiene la etiqueta `vtp`. Inicia `./run.sh`; revisa las etiquetas en _Settings → Runners_.                      |
| `docker: permission denied` / `Cannot connect`              | Docker Desktop está cerrado, o la integración con WSL está desactivada para este Ubuntu (paso 1.2).                                        |
| `Container operations are only supported on Linux`          | El runner se instaló en Windows en vez de dentro de Ubuntu. Instálalo en WSL.                                                              |
| La siguiente corrida falla al limpiar la carpeta (permisos) | Un trabajo se canceló antes de devolver los archivos. Ejecuta una vez `sudo chown -R $USER ~/actions-runner/_work`.                        |
| Los trabajos no arrancan y GitHub menciona facturación      | Un bloqueo de facturación (por ejemplo, un pago fallido) puede bloquear Actions por completo, incluso con runner propio. Revisa _Billing_. |
