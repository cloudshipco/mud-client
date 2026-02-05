# Twilite GUI (Tauri)

The GUI wrapper for the MUD client is built with Tauri v2 and lives in the `gui/` directory.

## Architecture

```
gui/
├── src/                    # Frontend (TypeScript)
│   └── main.ts            # xterm.js terminal + Tauri IPC
├── src-tauri/             # Backend (Rust)
│   ├── src/main.rs        # PTY management, Tauri commands
│   ├── tauri.conf.json    # App config, bundling, sidecar
│   ├── Cargo.toml         # Rust dependencies
│   ├── binaries/          # Sidecar binaries (generated)
│   ├── icons/             # App icons
│   └── capabilities/      # Tauri permissions
├── package.json           # Frontend dependencies
├── index.html             # App shell
└── vite.config.ts         # Vite bundler config
```

## How It Works

1. **Tauri app** spawns the **mud-client binary** (sidecar) inside a PTY
2. **Rust backend** reads PTY output and emits events to frontend
3. **Frontend** renders output in xterm.js and sends input back via Tauri commands
4. PTY provides proper terminal emulation (raw mode, ANSI, resize signals)

## Key Commands (Rust → Frontend)

- `spawn_pty(cols, rows)` - Start the mud-client with initial terminal size
- `write_to_pty(data)` - Send input to the PTY
- `resize_pty(cols, rows)` - Resize the PTY (triggers SIGWINCH)
- `set_window_title(title)` - Update window title dynamically

## Building

```bash
cd gui

# Install dependencies
npm install

# Build sidecar (from project root)
cd .. && ./gui/scripts/setup-sidecar.sh && cd gui

# Development
npm run tauri dev

# Production build (macOS ARM)
npm run tauri build -- --target aarch64-apple-darwin

# Production build (macOS Intel)
npm run tauri build -- --target x86_64-apple-darwin
```

## Sidecar Binaries

The mud-client binary is bundled as a "sidecar" via `externalBin` in tauri.conf.json.

Binaries must be named with target triple suffix:
- `binaries/mud-client-aarch64-apple-darwin` (macOS ARM)
- `binaries/mud-client-x86_64-apple-darwin` (macOS Intel)
- `binaries/mud-client-x86_64-pc-windows-msvc.exe` (Windows)

The `scripts/setup-sidecar.sh` script builds and places the binary correctly for local development.

## Icons

Generate icons from a source PNG (1024x1024+):

```bash
cd src-tauri/icons
SOURCE="path/to/source.png"
magick "$SOURCE" -resize 32x32 PNG32:32x32.png
magick "$SOURCE" -resize 128x128 PNG32:128x128.png
magick "$SOURCE" -resize 256x256 PNG32:128x128@2x.png
magick "$SOURCE" -resize 512x512 PNG32:icon.png
magick "$SOURCE" -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# macOS icns
mkdir -p icon.iconset
magick "$SOURCE" -resize 16x16 icon.iconset/icon_16x16.png
# ... (see existing icons generation for full list)
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

## macOS Code Signing & Notarization

Set these environment variables in GitHub Actions:
- `APPLE_CERTIFICATE` - Base64-encoded .p12 certificate
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY` - e.g., "Developer ID Application: Name (TEAMID)"
- `APPLE_ID` - Apple account email
- `APPLE_PASSWORD` - App-specific password
- `APPLE_TEAM_ID`

The `tauri-apps/tauri-action` handles signing and notarization automatically.

## Windows

Currently unsigned. Users will see SmartScreen warnings but can proceed.

To sign in the future: Azure Trusted Signing (~$10/month) or EV certificate.

## Common Tasks

### Add a new Tauri command

1. Add function in `src-tauri/src/main.rs` with `#[tauri::command]`
2. Register in `.invoke_handler(tauri::generate_handler![...])`
3. Call from frontend: `invoke("command_name", { args })`

### Change app metadata

Edit `src-tauri/tauri.conf.json`:
- `productName` - Display name
- `identifier` - Bundle ID (com.example.app)
- `version` - Semver
- `app.windows[0].title` - Default window title

### Update dependencies

```bash
# Frontend
npm update

# Rust
cd src-tauri && cargo update
```

## Releasing

**IMPORTANT:** Always use the release script to create releases. This ensures the version in
`tauri.conf.json` matches the git tag, which is required for the auto-updater to work correctly.

```bash
# From project root
./scripts/release.sh           # Bump patch (0.5.14 -> 0.5.15)
./scripts/release.sh minor     # Bump minor (0.5.14 -> 0.6.0)
./scripts/release.sh major     # Bump major (0.5.14 -> 1.0.0)
./scripts/release.sh 1.2.3     # Set specific version
```

The script will:
1. Validate there are no uncommitted changes
2. Update the version in `gui/src-tauri/tauri.conf.json`
3. Commit the version bump
4. Push to remote
5. Create and push the git tag
6. Create a GitHub release with auto-generated notes

GitHub Actions (`release.yml` and `release-gui.yml`) then build and upload the artifacts.

### Why this matters

The Tauri auto-updater fetches `latest.json` which contains the version and download URLs.
The artifact filenames include the version from `tauri.conf.json` (e.g., `Twilite_0.5.15_macos-arm64.app.tar.gz`).
If the version in `tauri.conf.json` doesn't match the git tag, the URLs in `latest.json` will point
to non-existent files, causing update failures.
