import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { VaultAccess } from './access.js'

export function registerTools(ctx: Context, access: VaultAccess): void {
  ctx.tools.register(defineTool({
    name: 'obsidian_list',
    description: 'List notes in the Obsidian vault, optionally under a subdirectory.',
    parameters: {
      dir: { type: 'string', description: 'Subdirectory relative to the vault root.' },
      limit: { type: 'integer', description: 'Maximum notes to return (default 200).' },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            title: { type: 'string', required: true },
          },
        },
      },
      render: (_args: any, value: any) => value.length === 0
        ? [{ type: 'text', text: 'No notes found.' }]
        : [{ type: 'text', text: value.map((n: any) => `${n.path} (${n.title})`).join('\n') }],
    },
    execute: (args) => access.list(args.dir, args.limit),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_search',
    description: 'Full-text search the Obsidian vault. Returns matching lines with surrounding context.',
    parameters: {
      query: { type: 'string', required: true, description: 'Case-insensitive substring to search for.' },
      dir: { type: 'string', description: 'Subdirectory to limit the search to.' },
      context: { type: 'integer', description: 'Lines of context before/after each match (default 1).' },
      limit: { type: 'integer', description: 'Maximum matches to return (default 50).' },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            line: { type: 'integer', required: true },
            lineText: { type: 'string', required: true },
            contextBefore: { type: 'array', required: true, items: { type: 'string' } },
            contextAfter: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
      },
      render: (_args: any, value: any) => value.length === 0
        ? [{ type: 'text', text: 'No matches.' }]
        : [{ type: 'text', text: value.map((h: any) => `${h.path}:${h.line}: ${h.lineText}`).join('\n') }],
    },
    execute: (args) => access.search(args.query, { dir: args.dir, context: args.context, limit: args.limit }),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_read',
    description: 'Read a note by its path relative to the vault root (e.g. "Folder/Note.md").',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          title: { type: 'string', required: true },
          frontmatter: { type: 'json', required: true },
          content: { type: 'string', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: value.content }],
    },
    execute: (args) => access.read(args.path),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_frontmatter',
    description: 'Read only the YAML frontmatter (properties) of a note.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          data: { type: 'json', required: true },
          raw: { type: 'json', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: typeof value.raw === 'string' ? value.raw : JSON.stringify(value.raw) }],
    },
    execute: (args) => access.frontmatter(args.path),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_backlinks',
    description: 'Find notes that link to the given note via [[wikilinks]].',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            title: { type: 'string', required: true },
            snippet: { type: 'string', required: true },
          },
        },
      },
      render: (_args: any, value: any) => value.length === 0
        ? [{ type: 'text', text: 'No backlinks.' }]
        : [{ type: 'text', text: value.map((b: any) => `${b.path}: ${b.snippet}`).join('\n') }],
    },
    execute: (args) => access.backlinks(args.path),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_write',
    description: 'Create or overwrite a note at the given path. Parent directories are created as needed.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root, ending in .md.' },
      content: { type: 'string', required: true, description: 'Full Markdown content to write.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          created: { type: 'boolean', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: `${value.created ? 'Created' : 'Updated'} ${value.path}` }],
    },
    execute: (args) => access.write(args.path, args.content),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_append',
    description: 'Append text to the end of a note, creating it if it does not exist.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
      content: { type: 'string', required: true, description: 'Text to append.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: `Appended to ${value.path}` }],
    },
    execute: (args) => access.append(args.path, args.content),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_move',
    description: 'Move or rename a note. When the Obsidian CLI is available, backlinks are updated automatically.',
    parameters: {
      from: { type: 'string', required: true, description: 'Current path relative to the vault root.' },
      to: { type: 'string', required: true, description: 'Destination path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          from: { type: 'string', required: true },
          to: { type: 'string', required: true },
          linksUpdated: { type: 'boolean', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: `Moved ${value.from} to ${value.to}${value.linksUpdated ? ' (links updated)' : ''}` }],
    },
    execute: (args) => access.move(args.from, args.to),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_delete',
    description: 'Move a note to the vault trash (.trash/). Reversible; never permanently deletes.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          trashedTo: { type: 'string', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: `Trashed ${value.path} to ${value.trashedTo}` }],
    },
    execute: (args) => access.delete(args.path),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_set_property',
    description: 'Set or update a single frontmatter property (YAML) on a note.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
      key: { type: 'string', required: true, description: 'Property name.' },
      value: { type: 'json', required: true, description: 'Property value (string, number, boolean, or list).' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          data: { type: 'json', required: true },
          raw: { type: 'json', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: typeof value.raw === 'string' ? value.raw : JSON.stringify(value.raw) }],
    },
    execute: (args) => access.setProperty(args.path, args.key, args.value),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_delete_property',
    description: 'Remove a frontmatter property from a note.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
      key: { type: 'string', required: true, description: 'Property name.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          data: { type: 'json', required: true },
          raw: { type: 'json', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: typeof value.raw === 'string' ? value.raw : JSON.stringify(value.raw) }],
    },
    execute: (args) => access.deleteProperty(args.path, args.key),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_tags',
    description: 'List all tags in the vault with usage counts.',
    parameters: {
      dir: { type: 'string', description: 'Subdirectory relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            tag: { type: 'string', required: true },
            count: { type: 'integer', required: true },
          },
        },
      },
      render: (_args: any, value: any) => value.length === 0
        ? [{ type: 'text', text: 'No tags found.' }]
        : [{ type: 'text', text: value.map((t: any) => `${t.tag} (${t.count})`).join('\n') }],
    },
    execute: (args) => access.listTags({ dir: args.dir }),
  }))
}
