# Mobile app — Android APK build (client distribution)

This guide explains how to build a **standalone Android APK** for drivers and warehouse staff using [EAS Build](https://docs.expo.dev/build/introduction/). The APK is meant for **direct installation** (email, link, MDM, etc.) — **not** for publishing on Google Play.

The app lives in this folder (`mobile/`) and targets **Expo SDK 54**.

---

## Prerequisites

Install on the machine that runs the build:

| Tool | Version / notes |
|------|-----------------|
| [Node.js](https://nodejs.org/) | LTS (20+) |
| npm | Comes with Node |
| [EAS CLI](https://docs.expo.dev/build/setup/) | `npm install -g eas-cli` |
| Expo account | Free tier is enough for internal APK builds — [expo.dev/signup](https://expo.dev/signup) |

You do **not** need Android Studio for cloud builds. EAS compiles the app on Expo servers.

---

## One-time project setup

### 1. Install dependencies

```bash
cd mobile
npm install
```

### 2. Log in to Expo

```bash
eas login
```

### 3. Link the project to EAS (first time only)

From the `mobile/` directory:

```bash
eas init
```

This creates a project on Expo and adds a `projectId` under `expo.extra.eas` in `app.json`.

### 4. Set the Android application ID

EAS requires a unique package name. Edit `app.json` and add `package` under `expo.android`:

```json
"android": {
  "package": "com.yourcompany.logistica",
  "adaptiveIcon": { ... }
}
```

Use your own reverse-DNS identifier (e.g. `com.acme.logistica.driver`). **Keep it stable** — changing it later installs as a different app on devices.

Optionally set a display name:

```json
"expo": {
  "name": "Logística",
  "slug": "logistica-mobile"
}
```

### 5. Configure the API URL for release builds

The backend URL is baked in at **build time** via `EXPO_PUBLIC_API_URL` (see `src/core/api/client.ts`).

Create `mobile/.env` (do not commit secrets here; commit a `.env.example` if useful):

```env
EXPO_PUBLIC_API_URL=https://api.your-production-host.com/api/v1
```

Requirements for client devices:

- Use **HTTPS** in production.
- The URL must be reachable from the public internet (or the client VPN), not `localhost` or a LAN IP like `192.168.x.x`.
- Point at the same Laravel API the admin/business portals use (`/api/v1` prefix).

---

Create `mobile/.env.production` from the example file:

```bash
cp .env.production.example .env.production
```

Edit `.env.production`:

```env
EXPO_PUBLIC_API_URL=https://api.your-production-host.com/api/v1
```

The build script uploads this file to EAS before each production build.

---

## Production build (recommended)

The repo includes `scripts/build-android-production.mjs` and npm scripts that validate config, push env vars to EAS, and trigger an APK build.

### Quick start

```bash
cd mobile
npm install
npx eas login          # first time only
npx eas init           # first time only — links app.json to Expo
cp .env.production.example .env.production
# edit .env.production with your production API URL
npm run build:android:production
```

### Script options

| Command | Description |
|---------|-------------|
| `npm run build:android:production` | Cloud EAS build (APK, `production` profile) |
| `npm run build:android:production:local` | Same, but compiles on your machine (needs Android SDK) |
| `npm run build:android:production -- --download` | Cloud build + download APK when finished |
| `npm run build:android:production -- --yes` | Skip the confirmation prompt (EAS may still prompt on first build to create the Android keystore) |
| `npm run build:android:production -- --allow-http` | Skip HTTPS check (not for real client builds) |

Before starting the build, the script prints a summary (Expo account, app version, Android package, env vars) and asks **Continue with this production build? [y/N]**.

The script checks:

- You are logged in to Expo (`eas whoami`)
- `.env.production` exists with a valid `EXPO_PUBLIC_API_URL`
- The API URL is HTTPS and not localhost / LAN
- `expo.android.package` is set in `app.json`

Build profile lives in `eas.json` (`production` → APK, internal distribution).

---

## Build the APK manually

If you prefer not to use the script, from `mobile/`:

```bash
eas env:push --environment production --path .env.production --force
eas build --platform android --profile production
```

EAS will:

1. Upload your project.
2. Run the native Android build in the cloud.
3. Sign the APK (EAS generates and stores a keystore on first build — **back it up** when prompted).

When the build finishes, the CLI prints a download URL. You can also open [expo.dev](https://expo.dev) → your project → **Builds**.

### Download the APK locally

```bash
eas build:download --platform android --profile production
```

Or download the `.apk` from the build page in the Expo dashboard.

---

## Share the APK with clients

1. Upload the `.apk` to your preferred channel (Google Drive, S3, internal file server, etc.).
2. Send clients the download link plus the short install steps below.
3. For each new release, bump the version in `app.json`:

   ```json
   "version": "1.0.1"
   ```

   EAS auto-increments `versionCode` when `appVersionSource` is `"remote"`. To manage versions manually, set `"appVersionSource": "local"` in `eas.json` and add `"android": { "versionCode": 2 }` in `app.json`.

### Auto-update (Android)

Installed builds check `GET /api/v1/mobile/app-release` on startup, when returning to foreground (if 6+ hours passed), and every 6 hours while open. If the device `versionCode` differs from the backend (upgrade or downgrade), the app downloads the APK and opens the Android installer.

After each production build:

1. Note the **`versionCode`** from the EAS build page (Expo dashboard → Builds).
2. Upload the new `.apk` to your CDN/S3 and copy the **direct HTTPS URL** to the file.
3. Update backend production env:

   ```env
   MOBILE_APP_UPDATE_ENABLED=true
   MOBILE_APP_VERSION_CODE=<versionCode from EAS build>
   MOBILE_APP_VERSION_NAME=<version from app.json>
   MOBILE_APP_APK_URL=https://cdn.example.com/logistica-mobile.apk
   MOBILE_APP_APK_SHA256=<optional sha256 hex of the APK>
   ```

4. Deploy/restart the backend so the new env values load.

Optional integrity check: `sha256sum mobile.apk` (Linux/macOS) or `Get-FileHash -Algorithm SHA256 mobile.apk` (PowerShell) → set `MOBILE_APP_APK_SHA256`.

The first build that includes the auto-updater must still be installed manually. Subsequent updates are pushed automatically to devices with that build (or newer).

Users confirm installation in the system dialog (Android does not allow fully silent installs for sideloaded apps). Drivers can also tap **Buscar actualizaciones** in **Ajustes**.

To disable checks temporarily: `MOBILE_APP_UPDATE_ENABLED=false`.

---

## Install on a client Android device

These steps are for end users who receive the APK directly (no Play Store).

1. **Download** the APK file on the phone (browser or file manager).
2. **Allow installation from unknown sources** when Android prompts (wording varies by manufacturer: *Install unknown apps* → enable for Chrome/Files/your browser).
3. Open the downloaded `.apk` and tap **Install**.
4. If upgrading an existing install, tap **Update** (same `android.package` required).
5. Open the app and log in with driver/warehouse credentials from your backend.

If installation is blocked, common causes are: corrupted download, mismatched package name vs previous install, or enterprise policy blocking sideloading.

---

## Rebuild after code or API changes

```bash
cd mobile
npm install          # if dependencies changed
npm run build:android:production
```

Share the new APK. Clients must install over the existing app (same package name) or uninstall the old version first.

---

## Optional: local build (no Expo cloud)

Use this only if you already have the Android SDK and JDK installed and want to compile on your machine:

```bash
cd mobile
npm install
npm run build:android:production:local
```

Local builds still use EAS tooling and the same `eas.json` profile. Troubleshooting native errors locally is harder than cloud builds for most teams.

---

## Development (not for client APK)

For day-to-day development with hot reload:

```bash
npm start
# or
npm run android   # opens on emulator/device via Expo Go / dev client
```

Dev builds use Metro and are **not** the same as the release APK above.

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| App cannot reach API | `EXPO_PUBLIC_API_URL` in the build profile / `.env`; HTTPS; firewall; CORS is not relevant for mobile but JWT/auth must work |
| Build fails on permissions | `app.json` already declares camera, location, etc. — add new plugins there before rebuilding |
| “App not installed” on device | Conflicting package name, incomplete download, or insufficient storage |
| Clients always see old API URL | Env vars are embedded at build time — rebuild after changing `EXPO_PUBLIC_API_URL` |
| Lost signing key | Run `eas credentials` to manage Android keystore; without it you cannot update the same app identity |
| `Generating a new Keystore is not supported in --non-interactive mode` | First build only — run `npm run build:android:production` **without** `--yes` and accept when EAS offers to generate a keystore |

Official references:

- [Build APKs for Android](https://docs.expo.dev/build-reference/apk/)
- [Configure eas.json](https://docs.expo.dev/build/eas-json/)
- [Environment variables in Expo](https://docs.expo.dev/guides/environment-variables/)
