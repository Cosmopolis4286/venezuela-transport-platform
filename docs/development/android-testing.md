# Testing the apps on Android

Three ways, from quickest to closest to what users will install. All of them need the API
running and reachable from the phone or emulator.

| Way                    | Install on the phone | Needs                                            | Best for                             |
| ---------------------- | -------------------- | ------------------------------------------------ | ------------------------------------ |
| **Expo Go**            | Expo Go (Play Store) | Phone and computer on the same Wi-Fi             | Daily testing, live reload           |
| **Android emulator**   | Nothing              | Android Studio with an emulator (AVD)            | Testing without a phone              |
| **APK** (EAS or local) | The APK file         | An Expo account (EAS) or Android Studio + JDK 17 | Sharing a build, testing like a user |

Both apps only use modules included in Expo Go (camera, secure storage), so Expo Go runs every
screen, including the ticket scanner.

## 1. Make the API reachable

`localhost` on a phone is the phone itself, so the app needs your computer's address.

1. Find your computer's Wi-Fi IP. On Windows: `ipconfig` → _Wireless LAN adapter Wi-Fi_ →
   _IPv4 Address_ (for example `192.168.1.50`).
2. Publish the API on the network:
   - API in Docker ([docker.md](docker.md)): set `VTP_API_PUBLISH_ADDRESS=0.0.0.0` in the root
     `.env` and run `pnpm stack:api`.
   - API on your machine: set `API_HOST=0.0.0.0` in `apps/api/.env` and restart it.
3. Allow the port in the Windows firewall (PowerShell as administrator, private networks only):

   ```powershell
   New-NetFirewallRule -DisplayName "VTP API" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
   ```

4. Check from the phone's browser: `http://192.168.1.50:4000/api/v1/health` shows `"status":"ok"`.

Only do this on a trusted network: anyone on it can reach the API.

## 2. Expo Go (recommended to start)

1. In `apps/passenger-mobile/.env` (and `apps/transport-mobile/.env`):
   `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:4000/api/v1`.
2. `pnpm dev:passenger` (or `pnpm dev:transport`). Windows may ask to allow Node.js on private
   networks: allow it, Metro must be reachable too.
3. Open **Expo Go** on the phone and scan the QR code shown in the terminal.
4. After editing a `.env`, restart Metro with a clean cache:
   `pnpm --filter @vtp/passenger-mobile exec expo start --clear --port 8081`.

If Expo Go says the project needs a different SDK, update Expo Go from the Play Store (the apps
use SDK 58). If the phone cannot reach Metro (corporate Wi-Fi, WSL), start Metro with
`--tunnel`.

Sign-in codes are printed by the API (`docker compose logs api | grep "login code"` in Docker);
payments use the simulated provider.

## 3. Android emulator

Start an emulator from Android Studio (_Device Manager_), set
`EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000/api/v1` (the emulator's name for your computer) and
press `a` in the Metro terminal. No firewall change is needed.

## 4. An installable APK

An APK is a **release build**: it contains the bundled JavaScript and the API URL, and it does not
connect to Metro. Two things to decide first:

- **Android package name** of each app, for example `ve.vtp.pasajeros` and
  `ve.vtp.transportistas`. It is permanent once published on Google Play.
- **An HTTPS API URL.** Android release builds refuse plain `http://` by default. For tests, a
  temporary tunnel gives your local API an HTTPS address:
  `cloudflared tunnel --url http://localhost:4000` prints `https://<random>.trycloudflare.com`
  (use `https://<random>.trycloudflare.com/api/v1`). Later, the deployed API.

### With EAS Build (cloud, no Android tooling)

Needs a free [Expo](https://expo.dev) account (the free plan has a monthly build quota).

```bash
cd apps/passenger-mobile
npx eas-cli@latest login
npx eas-cli@latest init                 # links the app to your Expo account
npx eas-cli@latest build -p android --profile preview
```

The `preview` profile in `eas.json` must build an APK (`"android": { "buildType": "apk" }`) and set
`EXPO_PUBLIC_API_BASE_URL` in its `env`, because EAS does not upload the git-ignored `.env`. When
the build finishes, EAS shows a link and a QR code: open it on the phone, download the APK and
allow installing from that source.

### Locally (no account, more setup)

Needs Android Studio (Android SDK) and JDK 17 on the computer.

```bash
cd apps/passenger-mobile
npx expo prebuild -p android            # generates android/ (not committed)
cd android && ./gradlew assembleRelease # on Windows: gradlew.bat assembleRelease
```

The APK is in `android/app/build/outputs/apk/release/`. Copy it to the phone and install it. This
build is signed with a development key: fine for testing, not for Google Play.
