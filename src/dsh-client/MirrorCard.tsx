import { useMemo, useState } from 'react'
import type { MirrorSettings } from '../settings.js'

/**
 * The mirror's card in the DSH web settings page (Plugins section).
 *
 * The component is intentionally framework-plain: it receives the bound
 * settings scope snapshot + actions as props from the slot face (see
 * index.tsx), stages edits locally, and writes through scope.mutate on
 * save — the same staged-edit contract the built-in plugin cards follow
 * (drafts on screen are exactly what a save would store).
 *
 * Regex lists are edited as one-pattern-per-line textareas: regexes
 * routinely contain commas, so comma-splitting would corrupt them.
 */

/** Reactive snapshot the controller publishes (subset of the scope snapshot + form state). */
export interface MirrorCardState {
  status: 'loading' | 'ready' | 'unavailable'
  writable: boolean
  /** Last accepted settings value (schema-resolved). */
  value: MirrorSettings | undefined
  /** Raw user layer; a field's presence here marks it overridden. */
  user: unknown
  saving: boolean
  failed: boolean
}

export interface MirrorCardProps {
  state: MirrorCardState
  onSave: (next: MirrorSettings) => void
}

interface DraftState {
  include: string
  exclude: string
  eventsHide: string
  eventsShow: string
  toolsHide: string
  toolsHideCalls: string
  toolsHideResults: string
  redact: Array<{ pattern: string; replace: string }>
  sensitiveDefaults: boolean
}

const EMPTY_SETTINGS: MirrorSettings = {
  include: [],
  exclude: [],
  events: { hide: [], show: [] },
  tools: { hide: [], hideCalls: [], hideResults: [] },
  redact: [],
  sensitiveDefaults: true,
}

function toDraft(value: MirrorSettings | undefined): DraftState {
  const v = value ?? EMPTY_SETTINGS
  return {
    include: v.include.join('\n'),
    exclude: v.exclude.join('\n'),
    eventsHide: v.events.hide.join('\n'),
    eventsShow: v.events.show.join('\n'),
    toolsHide: v.tools.hide.join('\n'),
    toolsHideCalls: v.tools.hideCalls.join('\n'),
    toolsHideResults: v.tools.hideResults.join('\n'),
    redact: v.redact.map((r) => ({ ...r })),
    sensitiveDefaults: v.sensitiveDefaults,
  }
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/** Validate every draft regex; returns the first error label or null. */
function firstInvalid(draft: DraftState): string | null {
  const check = (patterns: string[], label: string): string | null => {
    for (const pattern of patterns) {
      try {
        new RegExp(pattern)
      } catch {
        return `${label}: invalid regex: ${pattern}`
      }
    }
    return null
  }
  return (
    check(lines(draft.include), 'include') ??
    check(lines(draft.exclude), 'exclude') ??
    check(lines(draft.eventsHide), 'events.hide') ??
    check(lines(draft.eventsShow), 'events.show') ??
    check(lines(draft.toolsHide), 'tools.hide') ??
    check(lines(draft.toolsHideCalls), 'tools.hideCalls') ??
    check(lines(draft.toolsHideResults), 'tools.hideResults') ??
    check(draft.redact.map((r) => r.pattern), 'redact')
  )
}

function fromDraft(draft: DraftState): MirrorSettings {
  return {
    include: lines(draft.include),
    exclude: lines(draft.exclude),
    events: { hide: lines(draft.eventsHide), show: lines(draft.eventsShow) },
    tools: {
      hide: lines(draft.toolsHide),
      hideCalls: lines(draft.toolsHideCalls),
      hideResults: lines(draft.toolsHideResults),
    },
    redact: draft.redact
      .map((r) => ({ pattern: r.pattern.trim(), replace: r.replace }))
      .filter((r) => r.pattern.length > 0),
    sensitiveDefaults: draft.sensitiveDefaults,
  }
}

export function MirrorCard(props: MirrorCardProps) {
  const { state } = props
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DraftState | null>(null)

  // Seed the draft from the last accepted value whenever the user has no
  // staged edits — including after a save lands (value changes underneath).
  const effectiveDraft = useMemo(() => draft ?? toDraft(state.value), [draft, state.value])
  const invalid = useMemo(() => firstInvalid(effectiveDraft), [effectiveDraft])
  const dirty = draft !== null

  if (state.status === 'unavailable') return null

  const edit = (patch: Partial<DraftState>) => setDraft({ ...effectiveDraft, ...patch })
  const onSave = () => {
    if (invalid) return
    props.onSave(fromDraft(effectiveDraft))
    setDraft(null)
  }
  const onDiscard = () => setDraft(null)

  const blocked = !dirty || invalid !== null || state.saving || state.status !== 'ready'

  return (
    <li className={`dshm-card${open ? ' dshm-cardOpen' : ''}`}>
      <button
        type="button"
        className="dshm-header"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="dshm-headText">
          <span className="dshm-name">Web Mirror</span>
          <span className="dshm-description">
            Content filters for the read-only session mirror: hidden event kinds, tool filters, redaction.
          </span>
        </span>
        {dirty ? <span className="dshm-pending">Unsaved</span> : null}
        <span className={`dshm-chevron${open ? ' dshm-chevronOpen' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="dshm-body">
          {!state.writable ? (
            <p className="dshm-readOnly" role="status">
              This settings document is read-only from the current connection.
            </p>
          ) : null}
          {state.status !== 'ready' ? <p className="dshm-note">Loading…</p> : null}

          <label className="dshm-check">
            <input
              type="checkbox"
              checked={effectiveDraft.sensitiveDefaults}
              disabled={!state.writable}
              onChange={(e) => edit({ sensitiveDefaults: e.target.checked })}
            />
            <span>
              <span className="dshm-label">Built-in sensitive defaults</span>
              <p className="dshm-hint">
                Hide reasoning / approval / internal event kinds and redact common API-key shapes.
              </p>
            </span>
          </label>

          <RegexField
            label="Include sessions"
            hint="Only session ids matching one of these are mirrored. Empty = all sessions."
            value={effectiveDraft.include}
            disabled={!state.writable}
            onChange={(v) => edit({ include: v })}
          />
          <RegexField
            label="Exclude sessions"
            hint="Session ids matching one of these are hidden. Applied after include."
            value={effectiveDraft.exclude}
            disabled={!state.writable}
            onChange={(v) => edit({ exclude: v })}
          />
          <RegexField
            label="Hide event kinds"
            hint="Extra event-kind regexes to hide, e.g. ^step/ hides step/start and step/end."
            value={effectiveDraft.eventsHide}
            disabled={!state.writable}
            onChange={(v) => edit({ eventsHide: v })}
          />
          <RegexField
            label="Show event kinds"
            hint="Force-show kinds, overriding both the hide list and the built-in defaults."
            value={effectiveDraft.eventsShow}
            disabled={!state.writable}
            onChange={(v) => edit({ eventsShow: v })}
          />
          <RegexField
            label="Hide tools"
            hint="Fully hide matching tool rows (no call, no result)."
            value={effectiveDraft.toolsHide}
            disabled={!state.writable}
            onChange={(v) => edit({ toolsHide: v })}
          />
          <RegexField
            label="Hide tool call payloads"
            hint="Keep the row but blank the call arguments."
            value={effectiveDraft.toolsHideCalls}
            disabled={!state.writable}
            onChange={(v) => edit({ toolsHideCalls: v })}
          />
          <RegexField
            label="Hide tool results"
            hint="Keep the row but blank the result body."
            value={effectiveDraft.toolsHideResults}
            disabled={!state.writable}
            onChange={(v) => edit({ toolsHideResults: v })}
          />

          <div className="dshm-field">
            <div className="dshm-head">
              <span className="dshm-label">Redaction rules</span>
            </div>
            <p className="dshm-hint">
              Regex replacements applied to every text payload (messages, tool calls, results).
            </p>
            {effectiveDraft.redact.map((row, i) => (
              <div className="dshm-redact-row" key={i}>
                <input
                  type="text"
                  className="dshm-input"
                  placeholder="pattern"
                  value={row.pattern}
                  spellCheck={false}
                  disabled={!state.writable}
                  onChange={(e) =>
                    edit({
                      redact: effectiveDraft.redact.map((r, j) => (j === i ? { ...r, pattern: e.target.value } : r)),
                    })
                  }
                />
                <input
                  type="text"
                  className="dshm-input"
                  placeholder="replacement"
                  value={row.replace}
                  spellCheck={false}
                  disabled={!state.writable}
                  onChange={(e) =>
                    edit({
                      redact: effectiveDraft.redact.map((r, j) => (j === i ? { ...r, replace: e.target.value } : r)),
                    })
                  }
                />
                <button
                  type="button"
                  className="dshm-icon-btn"
                  aria-label="Remove rule"
                  disabled={!state.writable}
                  onClick={() => edit({ redact: effectiveDraft.redact.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            ))}
            <div>
              <button
                type="button"
                className="dshm-link"
                disabled={!state.writable}
                onClick={() => edit({ redact: [...effectiveDraft.redact, { pattern: '', replace: '[REDACTED]' }] })}
              >
                + Add redaction rule
              </button>
            </div>
          </div>

          <div className="dshm-footer">
            {invalid !== null ? (
              <p className="dshm-failed" role="status">
                {invalid}
              </p>
            ) : null}
            {state.failed && invalid === null ? (
              <p className="dshm-failed" role="status">
                Save failed — the settings document rejected the write.
              </p>
            ) : null}
            <button type="button" className="dshm-discard" disabled={!dirty || state.saving} onClick={onDiscard}>
              Discard
            </button>
            <button type="button" className="dshm-save" disabled={blocked} onClick={onSave}>
              {state.saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function RegexField({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="dshm-field">
      <div className="dshm-head">
        <span className="dshm-label">{label}</span>
      </div>
      <textarea
        className="dshm-textarea"
        rows={2}
        value={value}
        spellCheck={false}
        placeholder="One regular expression per line"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="dshm-hint">{hint}</p>
    </div>
  )
}
