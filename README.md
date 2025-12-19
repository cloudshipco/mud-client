# MUD Client

A fast, ergonomic terminal MUD (Multi-User Dungeon) client built with Bun.

## Features

- **Raw terminal mode** - Fast, responsive input with no framework overhead
- **Connection management** - Save and switch between multiple MUD servers
- **Character profiles** - Per-character settings, aliases, and command history
- **Reverse search** - Bash-style Ctrl+R to search command history
- **Tab completion** - Completes words from MUD output
- **Aliases** - Define shortcuts with variable expansion (`$1`, `$2`, `$*`)
- **Auto-login** - Automatically sends character name and password on connect
- **ANSI colors** - Full passthrough of MUD color codes

## Installation

```bash
bun install
```

## Usage

```bash
# Start with connection menu
bun start

# Connect directly to a server
bun start mud.example.com:4000

# Development mode (auto-reload)
bun dev
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+R` | Reverse search history |
| `Tab` | Complete word from output |
| `Up/Down` | Navigate command history |
| `Ctrl+L` | Clear screen |
| `Ctrl+C` | Disconnect (or exit if disconnected) |
| `Ctrl+D` | Disconnect/exit |
| `Ctrl+U` | Clear input line |
| `Ctrl+W` | Delete word |

## Commands

| Command | Description |
|---------|-------------|
| `/connect <host> [port]` | Connect to a MUD server |
| `/disconnect` | Disconnect from current server |
| `/reconnect` | Reconnect to last server |
| `/menu` | Return to connection/character menu |
| `/alias <name> <expansion>` | Create an alias |
| `/unalias <name>` | Remove an alias |
| `/aliases` | List all aliases |
| `/clear` | Clear screen |
| `/exit` | Exit the client |
| `/help` | Show help |

## Alias Examples

```
/alias k kill $1
/alias kk kill $1; kill $1
/alias heal cast 'cure light' $1
/alias greet say Hello $*!
```

## Data Storage

Character data is stored in `~/.config/mud-client/`:

```
~/.config/mud-client/
└── connections/
    └── <server-id>/
        ├── connection.json
        └── characters/
            ├── <char-id>.json    # Character config & aliases
            └── <char-id>.db      # Command history (SQLite)
```

## Development

```bash
# Run tests
bun test

# Run tests in watch mode
bun test --watch
```

## License

MIT
