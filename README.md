# dsh-obsidian

Connect [DeepSeek Harness](https://github.com/deepseek-ai/dsh) (`dsh`) to a local [Obsidian](https://obsidian.md) vault. Your `dsh` agent can search, read, write, move, and trash notes directly — no MCP server, no OAuth, because an Obsidian vault is just Markdown files on disk.

## Features

- **Zero server** — reads/writes the vault filesystem directly; no Local REST API plugin, no MCP server.
- **Optional Obsidian-aware ops** — when the `obsidian` CLI is available, `backlinks` and `move` delegate to it (link-aware moves); otherwise everything runs on the filesystem.
- **Safe by default** — deletes move notes into `.trash/` (reversible), paths can't escape the vault, and `.obsidian/` is never touched.

## Install

```sh
dsh plugin --profile web add dsh-obsidian
```

## Configure

In your profile's plugin config, set the vault path (optional — auto-detected from `obsidian.json` if left empty):

```yaml
dsh-obsidian:
  vaultPath: /Users/you/MyVault   # optional
  useCli: true                    # optional, default true
  excludeDirs: [".obsidian", ".git", ".trash"]
```

## Tools

- `obsidian_list` — list notes under a directory
- `obsidian_search` — full-text search with context
- `obsidian_read` — read a note (body + parsed frontmatter)
- `obsidian_frontmatter` — read only a note's YAML properties
- `obsidian_backlinks` — find notes linking to a note
- `obsidian_write` — create or overwrite a note
- `obsidian_append` — append text to a note
- `obsidian_move` — move/rename a note
- `obsidian_delete` — trash a note (reversible)

## Requirements

- Node >= 22.12.0
- Obsidian CLI (optional, for link-aware moves and CLI backlinks)

## License

MIT
