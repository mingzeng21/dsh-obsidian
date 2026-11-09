import { Button, Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type FormEvent, type ReactNode } from 'react'

const slot = 'plugins.row.config'
const namespace = 'dshObsidian'
const en = {
  summary: 'Connect DSH to a local Obsidian vault.',
  vaultPath: 'Vault path',
  vaultHint: 'Leave blank to auto-detect a vault. See the DSH host log for the resolved path.',
  useCli: 'Use Obsidian CLI for note properties',
  workspaceOnly: 'Show tools only in vault workspaces',
  excludeDirs: 'Excluded directories',
  excludeHint: 'One directory per line. Leave blank to exclude none.',
  unavailable: 'Configuration is unavailable for this profile.',
  loading: 'Loading configuration…',
  readOnly: 'This profile is read-only.',
  save: 'Save configuration',
  saving: 'Saving…',
  saved: 'Configuration saved.',
  failed: 'Could not save the configuration.',
  conflict: 'The configuration changed. Discard your edits to load the latest values.',
  discard: 'Discard edits',
}
const zh: typeof en = {
  summary: '将 DSH 连接到本地 Obsidian vault。',
  vaultPath: 'Vault 路径',
  vaultHint: '留空会自动探测 vault。实际路径见 DSH 宿主日志。',
  useCli: '使用 Obsidian CLI 修改笔记属性',
  workspaceOnly: '仅在 vault 工作区中提供工具',
  excludeDirs: '排除目录',
  excludeHint: '每行填写一个目录。留空则不排除任何目录。',
  unavailable: '当前 profile 的配置不可用。',
  loading: '正在加载配置…',
  readOnly: '当前 profile 为只读。',
  save: '保存配置',
  saving: '正在保存…',
  saved: '配置已保存。',
  failed: '配置保存失败。',
  conflict: '配置已发生变化。请放弃当前编辑以加载最新值。',
  discard: '放弃编辑',
}
type Translate = (key: keyof typeof en) => string
type ConfigValue = { vaultPath?: string; useCli: boolean; vaultWorkspaceOnly: boolean; excludeDirs: string[] }
type Operation = { op: 'set'; path: string[]; value: string | boolean | string[] }
interface HostForm {
  state: {
    status: 'loading' | 'ready' | 'unavailable'
    value?: ConfigValue
    revision?: number
    writable: boolean
  }
  mutate(ops: Operation[], revision: number): Promise<boolean>
}
interface SlotProps {
  view: 'summary' | 'page'
  form?: HostForm
  t: Translate
}
interface ClientContext {
  effect(setup: () => () => void): void
  locale: { register(name: string, dictionaries: { en: typeof en; zh: typeof zh }): () => void }
  slots: {
    inject(name: typeof slot, register: () => () => void): void
    register(options: { name: typeof slot; key: string; locale: string }, render: (props: SlotProps) => ReactNode): () => void
  }
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(namespace, { en, zh }))
  ctx.slots.inject(slot, () => ctx.slots.register(
    { name: slot, key: 'dsh-obsidian#obsidian', locale: namespace },
    ({ view, form, t }) => view === 'summary' ? t('summary') : <Settings form={form} t={t} />,
  ))
}

type Fields = Omit<ConfigValue, 'excludeDirs'> & { excludeDirs: string }
type Draft = { revision: number; changes: Partial<Fields> }

function Settings({ form, t }: { form?: HostForm; t: Translate }) {
  const [draft, setDraft] = useState<Draft>()
  const [status, setStatus] = useState<'saving' | 'saved' | 'failed'>()
  const state = form?.state
  if (state?.status === 'loading') return <p role="status">{t('loading')}</p>
  if (form === undefined || state?.status !== 'ready' || state.value === undefined || state.revision === undefined) {
    return <p role="status">{t('unavailable')}</p>
  }

  const { revision, value } = state
  const fields: Fields = { ...value, vaultPath: value.vaultPath ?? '', excludeDirs: value.excludeDirs.join('\n'), ...draft?.changes }
  const conflict = draft !== undefined && draft.revision !== revision
  const disabled = !state.writable || status === 'saving'

  function edit<K extends keyof Fields>(field: K, value: Fields[K]): void {
    setDraft(previous => ({ revision: previous?.revision ?? revision, changes: { ...previous?.changes, [field]: value } }))
    setStatus(undefined)
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (draft === undefined || conflict || disabled || form === undefined) return
    const ops: Operation[] = Object.entries(draft.changes).map(([key, value]) => ({
      op: 'set', path: [key], value: key === 'excludeDirs' ? fields.excludeDirs.split(/\r?\n/).filter(Boolean) : value,
    }))
    setStatus('saving')
    try {
      if (await form.mutate(ops, draft.revision)) {
        setDraft(undefined)
        setStatus('saved')
      } else {
        setStatus('failed')
      }
    } catch {
      setStatus('failed')
    }
  }

  const fieldStyle = { display: 'grid', gap: 6 }
  const switchStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
  return <form onSubmit={event => { void save(event) }} style={{ display: 'grid', gap: 16 }}>
    <label style={fieldStyle}>
      <span>{t('vaultPath')}</span>
      <Input value={fields.vaultPath} disabled={disabled} onChange={event => edit('vaultPath', event.target.value)} />
      <small>{t('vaultHint')}</small>
    </label>
    <div style={switchStyle}>
      <span>{t('useCli')}</span>
      <Switch label={t('useCli')} checked={fields.useCli} disabled={disabled} onChange={value => edit('useCli', value)} />
    </div>
    <div style={switchStyle}>
      <span>{t('workspaceOnly')}</span>
      <Switch label={t('workspaceOnly')} checked={fields.vaultWorkspaceOnly} disabled={disabled} onChange={value => edit('vaultWorkspaceOnly', value)} />
    </div>
    <label style={fieldStyle}>
      <span>{t('excludeDirs')}</span>
      <textarea rows={4} value={fields.excludeDirs} disabled={disabled} onChange={event => edit('excludeDirs', event.target.value)}
        style={{
          resize: 'vertical', padding: 8, font: 'inherit', color: 'inherit',
          background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l4)',
          borderRadius: 'var(--dsw-radius-md)',
        }} />
      <small>{t('excludeHint')}</small>
    </label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Button type="submit" variant="primary" disabled={disabled || draft === undefined || conflict}>
        {t(status === 'saving' ? 'saving' : 'save')}
      </Button>
      {draft !== undefined && <Button variant="outline" disabled={status === 'saving'} onClick={() => {
        setDraft(undefined)
        setStatus(undefined)
      }}>{t('discard')}</Button>}
    </div>
    {(!state.writable || conflict || status === 'saved' || status === 'failed') && <p role="status">
      {t(!state.writable ? 'readOnly' : conflict ? 'conflict' : status === 'saved' ? 'saved' : 'failed')}
    </p>}
  </form>
}
