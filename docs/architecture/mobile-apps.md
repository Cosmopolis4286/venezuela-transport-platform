# Mobile apps (Expo)

Two separate apps with Spanish UIs, both on Expo SDK 58 + Expo Router (routes in `src/app/`):

- `apps/passenger-mobile` (_VTP Pasajeros_): trip search (no account needed), sign-in and account.
  Booking comes later.
- `apps/transport-mobile` (_VTP Transportistas_): drivers and staff of bus companies, taxi lines
  and terminals. Sign-in, invitations and the KYC application.

Code both apps need lives in `packages/mobile-core` (`@vtp/mobile-core`, see ADR-016). Contracts
come from `@vtp/shared-types`.

## Screens

| App       | Route               | What                                                                                             |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| Both      | `/sign-in`          | Code by SMS, WhatsApp or e-mail (creates the account on first use), or e-mail + password         |
| Both      | `/register`         | Create an account with e-mail + password                                                         |
| Passenger | `/`                 | Trip search: origin, destination (stop picker), date chips for the next 7 days; works signed out |
| Passenger | `/stop-picker`      | Modal search over active terminals and stops (`GET /stops?q=`)                                   |
| Passenger | `/results`          | Departures with times (`+1 d` overnight), duration, operator, class, seats and fare              |
| Passenger | `/trip`             | Seat map of one departure: taken seats disabled, up to 6 seats, price; public until holding      |
| Passenger | `/passengers`       | Signed in: name and ID per seat (first prefilled from the account), then hold the seats          |
| Passenger | `/booking/:id`      | Booking code, status, hold countdown, passengers, total; cancel while held                       |
| Passenger | `/bookings`         | "Mis viajes": the user's bookings, newest first                                                  |
| Passenger | `/account`          | Signed in only: account and verified contacts, "Mis viajes", sign out                            |
| Transport | `/`                 | Pending invitations (accept / decline), my organizations and roles, my application status        |
| Transport | `/application`      | Application data, required documents with upload and review verdicts, submit to review           |
| Transport | `/application/edit` | Role, organization (searched in the directory), personal data, vehicle for taxi drivers          |

Navigation follows the auth state: `Stack.Protected` in each root layout shows the signed-in
screens only with a session and the sign-in screens only without one, so a screen never decides
where to go after signing in or out. The passenger search screens sit outside both guards: the
search is public, and `useApi(path, { auth: false })` calls it without a session.

## Session handling (`@vtp/mobile-core`)

- `ApiClient` signs in with `client: 'passenger'` or `client: 'transport'`; sessions are never
  shared between apps.
- Tokens are stored by `secureTokenStore()` in the iOS Keychain / Android Keystore, readable only
  while the device is unlocked and not restored onto another device from a backup.
- The access token is refreshed 30 seconds before it expires. Refresh tokens rotate and the API
  revokes the session when an old one is replayed, so concurrent requests share **one** in-flight
  refresh, and the rotated tokens are saved before any request uses them. A 401 triggers one
  refresh and a retry; if the refresh is rejected the session ends and the app returns to sign-in
  with a notice. Network errors and 5xx keep the session.
- `AuthProvider` restores the saved session on launch. If the API cannot be reached, it shows a
  retry screen instead of signing the user out.
- Errors are shown in Spanish through `ApiError.userMessage` (same wording as the web portal).

## KYC application (transport app)

1. The user picks the role and, optionally, the organization: `GET /organizations/directory`
   lists active organizations, filtered in the app to those that have the chosen role.
2. Personal data and, for taxi drivers with their own vehicle, the vehicle.
3. Documents: `requiredDocuments(role, providesVehicle)` from the contracts decides which ones.
   Each is picked with `expo-document-picker` (JPG, PNG or PDF) and uploaded as multipart to
   `PUT /me/application/documents/:kind`, optionally with its expiry date. The API checks the
   real type by content and the 10 MB limit.
4. **Enviar a revisión** once nothing is missing. Review notes, rejected documents and the final
   decision (including the organization's answer) are shown on the application screen.

## Browser preview

`app.json` includes the `web` platform so both apps can be opened in a browser
(`pnpm --filter @vtp/passenger-mobile dev --web`, `pnpm --filter @vtp/transport-mobile dev --web`) to check screens without an
emulator. It is a development aid, not a product:

- There is no secure storage in the browser, so the session lives in memory and a page reload
  signs you out. Tokens are never written to `localStorage`.
- The API must allow the origin: `CORS_ORIGINS` in `apps/api/.env.example` already lists
  `http://localhost:8081` and `http://localhost:8082`.

## Known limitations

- Validation messages from the API are in English. The screens replace the common ones (file
  rejected, documents missing) with Spanish text; translating API messages is a later task.
- Dates are typed as `AAAA-MM-DD`; a native date picker can replace that later.
- No push notifications yet: the user pulls to refresh to see review results.
