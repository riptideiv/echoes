<div align="center">
<img width="500" alt="screenshot of Echoes Report" src="https://github.com/user-attachments/assets/58120700-4627-459a-b126-e094cd778623" /><br>
<h1>Echoes Report</h1>
<img alt="GitHub" src="https://img.shields.io/github/license/riptideiv/echoes">
<img alt="npm" src="https://img.shields.io/npm/v/@riptideiv/echoes-report">
<img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white">
<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
<br>
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white">
<img alt="SQLite" src="https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white">
<img alt="DeepSeek" src="https://img.shields.io/badge/LLM-DeepSeek-4D6BFE?logo=deepseek&logoColor=white">
</div>
<br>

Echoes Report is a private, local-first dashboard that turns recent Claude
Code and Codex sessions plus browser history into grounded ideas for blog and
LinkedIn posts. It groups related activity, ranks ideas by evidence and reader
interest, and keeps its configuration and generated reports on your computer.

## Features

- Reads Claude Code sessions, interactive Codex sessions, and selected browser profiles
- Finds standard browser history locations and verifies real file access during setup
- Clusters related activity into themes
- Generates long-form and short-form post ideas with DeepSeek
- Ranks ideas by evidence strength and predicted reader interest
- Supports favorites, filters, dismissals, missing-context questions, and a date archive
- Caches tags and themes to avoid repeat model calls

## Requirements

- Node.js 20.17 or newer
- A DeepSeek API key
- At least one readable Claude, Codex, or browser-history source

## Install and run

```bash
npx @riptideiv/echoes-report
```

To install the command globally instead:

```bash
npm install --global @riptideiv/echoes-report
echoes-report
```

The first run launches an interactive setup wizard for the DeepSeek API key,
session directories, and browser profiles. It then starts the dashboard and
prints its loopback-only URL. Later runs reuse the saved configuration. Keep
the command running while using the dashboard and press `Ctrl+C` to stop it.

## CLI commands

```text
echoes-report [start] [--port <number>]
echoes-report setup
echoes-report doctor [--json]
echoes-report --help
echoes-report --version
```

- `setup` configures the DeepSeek key, session directories, and browser profiles.
- `doctor` rechecks permissions and formats without printing private activity.
- `start` is the default command and keeps the local server in the foreground.

Configuration, secrets, generated reports, and runtime state are stored in the
platform's standard user-data location:

| Platform | Default location |
| --- | --- |
| macOS | `~/Library/Application Support/com.riptideiv.echoes-report/` |
| Windows | `%APPDATA%\Echoes Report\` |
| Linux | `$XDG_CONFIG_HOME/echoes-report/` or `~/.config/echoes-report/` |

Set `ECHOES_REPORT_HOME` to override that location.

## Browser history

Echoes Report copies live SQLite databases and their WAL/SHM companions to a
temporary directory before reading them. It never modifies the browser's
database.

The standard-location catalog covers every browser represented by the
upstream `browser-history` catalog on its supported platforms:

| Engine | Browsers |
| --- | --- |
| Chromium | Chromium, Google Chrome, Microsoft Edge, Opera, Opera GX, Brave, Vivaldi, Epic Privacy Browser, Arc, and Dia |
| Firefox | Firefox, LibreWolf, and Zen |
| Safari | Safari |
| JSON | Manually added history exports |

Browsers with multiple profiles are shown separately in setup. Custom history
files can be added when a browser is installed outside its standard location.

On macOS, Safari and some browser profiles may require Full Disk Access for
the terminal application running Echoes Report. Run `echoes-report doctor`
after changing that permission and restarting the terminal.

## Session sources

Claude Code sessions default to `~/.claude/projects`. Codex sessions default
to `~/.codex`, including dated and archived rollouts. Setup accepts custom
locations and verifies a representative JSONL session record before saving
them.

For sessions active in the configured rolling window—seven days by default—
Echoes Report summarizes the complete user-visible conversation: your messages
and the agent's final answers. It excludes reasoning, progress commentary, tool
calls, and tool output. Persisted Codex forks are supported, but ephemeral
`/side` chats are not saved by Codex; use a normal task or `/fork` for
conversations you want Echoes Report to retain.

## Local extensions

Echoes Report can load an optional trusted local extension that adds tools to
the idea detail view. Set `ECHOES_EXTENSION_PATH` to the absolute path of an
ESM module implementing extension API v1. Without an extension, the local-tools
API and UI remain disabled. See
[`lib/extensions/types.ts`](lib/extensions/types.ts) for the contract.

Local extensions run with the same operating-system permissions as Echoes
Report. Only configure code you trust.

## Development

Run the web application directly during development:

```bash
npm ci
cp .env.example .env
npm run dev
```

Environment variables override saved CLI configuration. The primary options
are `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `WINDOW_DAYS`,
`CLAUDE_PROJECTS_DIR`, `CODEX_HOME`, `DB_PATH`, `GEN_TEMPERATURE`, and
`TAG_TEMPERATURE`.

To build and test the distributable CLI:

```bash
npm run typecheck
npm test
npm run build
npm run smoke:dist
```

The smoke test creates isolated fixture configuration, starts the app through
`dist/cli/echoes-report.mjs`, checks the health endpoint and dashboard, and
shuts it down without sending an API request.

## Privacy

Claude and Codex session files, browser history, API keys, configuration, and
generated reports remain local. Only selected activity summaries are sent to
the configured model API during tagging and idea generation.

## Third-party attribution

The standard browser catalog is adapted from the Apache-2.0-licensed
[`browser-history` project](https://github.com/browser-history/browser-history).
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt).

## License

Echoes Report is licensed under the [MIT License](LICENSE).
