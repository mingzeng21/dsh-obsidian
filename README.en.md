# dsh-obsidian

Connect [DeepSeek Harness](https://github.com/deepseek-ai/dsh) (`dsh`) to a local [Obsidian](https://obsidian.md) vault. Because an Obsidian vault is just a folder of Markdown files on disk, your `dsh` agent can search, read, write, move, and trash notes directly — **no MCP server, no OAuth**.

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Node: >=22.12.0](https://img.shields.io/badge/Node-%3E%3D22.12.0-339933.svg)](https://nodejs.org)

[中文](README.md) | English

## What it does

Once `dsh-obsidian` is installed, your `dsh` agent can read and write a local Obsidian vault directly. On startup the plugin detects your vault (or reads the path you configured) and mounts 12 `obsidian_*` tools covering search, read, write, append, move, delete, and backlink lookups.

## Features

- **Zero server** — reads/writes the vault filesystem directly; no Local REST API community plugin, no standing MCP server.
- **Safe by default** — deletes move notes into `.trash/` (reversible), paths can't escape the vault root, and `.obsidian/` is never touched.

## How it works

```text
dsh agent calls obsidian_* tools
   │
   ▼
VaultAccess interface
   └─ FsAccess — node:fs + hand-written frontmatter/wikilink parsing (default, pure filesystem)
```

On startup the plugin resolves the vault root as "explicit `vaultPath` wins, else auto-detect from `obsidian.json`"; when `useCli` is on and the CLI is detected, `property:set`/`property:remove` delegate to it and everything else stays on `FsAccess`; any CLI failure silently falls back to `FsAccess`.

## Install

```sh
dsh plugin --profile web add dsh-obsidian
```

Replace `web` with the profile you run your agent in (`web`, `headless`, `tui`, …).

## Update

Re-running `add` pulls the latest (`latest`):

```sh
dsh plugin --profile web add dsh-obsidian
```

Or pin a specific version:

```sh
dsh plugin --profile web add dsh-obsidian@0.2.2
```

Restart the harness (`dsh web`) or refresh the Web UI after updating; verify with `dsh plugin --profile web list`.

## Uninstall

```sh
dsh plugin --profile web remove dsh-obsidian
```

## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `vaultPath` | (auto-detected) | Absolute path to the vault; leave empty to auto-detect the currently-open vault from `obsidian.json` |
| `useCli` | `false` | Delegate `property:set`/`property:remove` to the `obsidian` CLI when available |
| `excludeDirs` | `[".obsidian", ".git", ".trash"]` | Directories excluded from search and list |

## Tools

| Tool | Purpose |
| --- | --- |
| `obsidian_list` | List notes in the vault (filter by subdirectory, limit results) |
| `obsidian_search` | Full-text search with match lines + context (case-insensitive, `.md` only) |
| `obsidian_read` | Read a note (body + parsed frontmatter) |
| `obsidian_frontmatter` | Read only a note's YAML properties |
| `obsidian_backlinks` | Find notes linking to a note via `[[wikilinks]]` |
| `obsidian_write` | Create or overwrite a note (creates parent directories) |
| `obsidian_append` | Append text to the end of a note |
| `obsidian_move` | Move/rename a note (updates `[[wikilinks]]` in pure filesystem) |
| `obsidian_delete` | Trash a note into `.trash/` (reversible, never permanently deletes) |
| `obsidian_set_property` | Set or update a single frontmatter property (YAML) on a note |
| `obsidian_delete_property` | Remove a frontmatter property from a note |
| `obsidian_tags` | List all tags in the vault with usage counts |

All tool path arguments are relative to the vault root (e.g. `Folder/note.md`).

## Safety

- **Path containment** — every path argument is resolved and checked to stay inside the vault root; escapes (`../` or absolute paths) are rejected.
- **Reversible delete** — `obsidian_delete` only moves notes into the vault's `.trash/`, never permanently deletes.
- **Hands off `.obsidian/`** — search and list exclude `.obsidian/`, `.git/`, and `.trash/` by default.
- **Preserves frontmatter and wikilinks** — reads/writes don't break YAML properties or `[[links]]` (unless the task explicitly asks).

## Requirements

- [DeepSeek Harness](https://github.com/deepseek-ai/dsh) (`dsh`)
- Node.js ≥ 22.12.0

Verified compatible up to `dsh` v0.1.1-rc.2 (including v0.1.0-rc.8).

## Development

```sh
npm install
npm run build      # tsdown → lib/
npm run typecheck  # tsc --noEmit
npm test           # vitest
```

## Changelog

### 0.2.2

- `obsidian_tags` and inline `#tag` extraction now support CJK and other Unicode characters.
- `obsidian_backlinks` / `obsidian_move` resolve `[[wikilinks]]` uniquely following Obsidian's rules: same-named notes are no longer over-matched, and ambiguous links are no longer mis-rewritten.
- `obsidian_set_property` / `obsidian_delete_property` preserve existing YAML comments, anchors/aliases, and block formatting instead of re-serializing.
- Reliability: atomic writes when `obsidian_move` updates links, fallback for cross-filesystem moves/deletes, and consistent search results with or without ripgrep.

## License

[MIT](LICENSE) © 2026 MingZeng
