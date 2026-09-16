import { useCallback, useEffect, useState } from 'react'
import { fetchConfig, resetConfig, saveConfig } from '../api.js'
import type { ConfigResponse } from '../types.js'
import { SpinnerIcon, XIcon } from './icons.js'

/**
 * Settings modal for the mirror's runtime-editable filter config.
 *
 * All regex-list fields are edited as one-pattern-per-line textareas —
 * regexes routinely contain commas, so comma-splitting would corrupt them.
 * Saving applies on the server immediately and persists to a JSON file;
 * the page reloads afterwards so the sidebar and any open timeline
 * re-fetch through the new rules.
 */
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<ConfigResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Form state — textareas keep newline-joined regex lists.
  const [includeText, setIncludeText] = useState('')
  const [excludeText, setExcludeText] = useState('')
  const [eventsHideText, setEventsHideText] = useState('')
  const [eventsShowText, setEventsShowText] = useState('')
  const [toolsHideText, setToolsHideText] = useState('')
  const [toolsHideCallsText, setToolsHideCallsText] = useState('')
  const [toolsHideResultsText, setToolsHideResultsText] = useState('')
  const [redactRows, setRedactRows] = useState<Array<{ pattern: string; replace: string }>>([])
  const [sensitiveDefaults, setSensitiveDefaults] = useState(true)
  const [showDefaults, setShowDefaults] = useState(false)

  useEffect(() => {
    if (!open) return
    let disposed = false
    setData(null)
    setLoadError(null)
    setSaveErrors([])
    fetchConfig()
      .then((cfg) => {
        if (disposed) return
        setData(cfg)
        setIncludeText(cfg.config.include.join('\n'))
        setExcludeText(cfg.config.exclude.join('\n'))
        setEventsHideText(cfg.config.events.hide.join('\n'))
        setEventsShowText(cfg.config.events.show.join('\n'))
        setToolsHideText(cfg.config.tools.hide.join('\n'))
        setToolsHideCallsText(cfg.config.tools.hideCalls.join('\n'))
        setToolsHideResultsText(cfg.config.tools.hideResults.join('\n'))
        setRedactRows(cfg.config.redact.map((r) => ({ ...r })))
        setSensitiveDefaults(cfg.config.sensitiveDefaults)
      })
      .catch((e) => {
        if (!disposed) setLoadError(String(e))
      })
    return () => {
      disposed = true
    }
  }, [open])

  // Escape closes the modal (but not while a save is in flight).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const lines = (text: string) =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

  const onSave = useCallback(async () => {
    setSaving(true)
    setSaveErrors([])
    const result = await saveConfig({
      include: lines(includeText),
      exclude: lines(excludeText),
      events: { hide: lines(eventsHideText), show: lines(eventsShowText) },
      tools: {
        hide: lines(toolsHideText),
        hideCalls: lines(toolsHideCallsText),
        hideResults: lines(toolsHideResultsText),
      },
      redact: redactRows
        .map((r) => ({ pattern: r.pattern.trim(), replace: r.replace }))
        .filter((r) => r.pattern.length > 0),
      sensitiveDefaults,
    })
    setSaving(false)
    if (!result.ok) {
      setSaveErrors(result.errors)
      return
    }
    // Reload so the sidebar and any open timeline re-fetch through the
    // new rules — cheaper than wiring a global invalidation event.
    window.location.reload()
  }, [includeText, excludeText, eventsHideText, eventsShowText, toolsHideText, toolsHideCallsText, toolsHideResultsText, redactRows, sensitiveDefaults])

  const onReset = useCallback(async () => {
    if (!window.confirm('Reset all filter settings to the values from cordis.patch.yml?')) return
    setSaving(true)
    setSaveErrors([])
    const result = await resetConfig()
    setSaving(false)
    if (!result.ok) {
      setSaveErrors(result.errors)
      return
    }
    window.location.reload()
  }, [])

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal settings-modal" role="dialog" aria-label="Mirror settings">
        <header className="modal-header">
          <h2>Mirror settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            <XIcon size={14} />
          </button>
        </header>

        <div className="modal-body">
          {loadError ? <p className="error-text">Failed to load config: {loadError}</p> : null}
          {!data && !loadError ? (
            <p className="settings-note">
              <SpinnerIcon size={13} /> Loading…
            </p>
          ) : null}

          {data ? (
            <>
              <section className="settings-section">
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={sensitiveDefaults}
                    onChange={(e) => setSensitiveDefaults(e.target.checked)}
                  />
                  <span>
                    Built-in sensitive defaults
                    <small>
                      Hide reasoning / approval / internal event kinds and redact common API-key shapes.
                    </small>
                  </span>
                </label>
                {sensitiveDefaults ? (
                  <button type="button" className="settings-link" onClick={() => setShowDefaults((v) => !v)}>
                    {showDefaults ? 'Hide built-in rules' : 'Show built-in rules'}
                  </button>
                ) : null}
                {sensitiveDefaults && showDefaults ? (
                  <div className="settings-defaults">
                    <p className="settings-caption">Hidden event kinds:</p>
                    <ul>
                      {data.defaults.hiddenEventKinds.map((k) => (
                        <li key={k}><code>{k}</code></li>
                      ))}
                    </ul>
                    <p className="settings-caption">Redaction rules:</p>
                    <ul>
                      {data.defaults.redactRules.map((r) => (
                        <li key={r.pattern}>
                          <code>{r.pattern}</code> → <code>{r.replace}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>

              <section className="settings-section">
                <h3>Sessions</h3>
                <RegexField
                  label="Include (allowlist)"
                  hint="Only session ids matching one of these are shown. Empty = all sessions."
                  value={includeText}
                  onChange={setIncludeText}
                />
                <RegexField
                  label="Exclude (blocklist)"
                  hint="Session ids matching one of these are hidden. Applied after include."
                  value={excludeText}
                  onChange={setExcludeText}
                />
              </section>

              <section className="settings-section">
                <h3>Event kinds</h3>
                <RegexField
                  label="Hide"
                  hint={'Extra event-kind regexes to hide, e.g. ^step/ hides step/start and step/end.'}
                  value={eventsHideText}
                  onChange={setEventsHideText}
                />
                <RegexField
                  label="Show"
                  hint="Force-show kinds, overriding both Hide above and the built-in defaults."
                  value={eventsShowText}
                  onChange={setEventsShowText}
                />
              </section>

              <section className="settings-section">
                <h3>Tools</h3>
                <RegexField
                  label="Hide tools"
                  hint="Fully hide matching tool rows (no call, no result)."
                  value={toolsHideText}
                  onChange={setToolsHideText}
                />
                <RegexField
                  label="Hide call payloads"
                  hint="Keep the row but blank the call arguments."
                  value={toolsHideCallsText}
                  onChange={setToolsHideCallsText}
                />
                <RegexField
                  label="Hide results"
                  hint="Keep the row but blank the result body."
                  value={toolsHideResultsText}
                  onChange={setToolsHideResultsText}
                />
              </section>

              <section className="settings-section">
                <h3>Redaction</h3>
                <p className="settings-caption">
                  Regex replacements applied to every text payload (messages, tool calls, results).
                </p>
                {redactRows.map((row, i) => (
                  <div className="redact-row" key={i}>
                    <input
                      type="text"
                      className="redact-pattern"
                      placeholder="pattern"
                      value={row.pattern}
                      spellCheck={false}
                      onChange={(e) =>
                        setRedactRows((rows) => rows.map((r, j) => (j === i ? { ...r, pattern: e.target.value } : r)))
                      }
                    />
                    <input
                      type="text"
                      className="redact-replace"
                      placeholder="replacement"
                      value={row.replace}
                      spellCheck={false}
                      onChange={(e) =>
                        setRedactRows((rows) => rows.map((r, j) => (j === i ? { ...r, replace: e.target.value } : r)))
                      }
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Remove rule"
                      onClick={() => setRedactRows((rows) => rows.filter((_, j) => j !== i))}
                    >
                      <XIcon size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="settings-link"
                  onClick={() => setRedactRows((rows) => [...rows, { pattern: '', replace: '[REDACTED]' }])}
                >
                  + Add redaction rule
                </button>
              </section>

              <section className="settings-section settings-meta">
                <p>
                  Listening on <code>http://{data.host}:{data.port}</code> — change host/port in{' '}
                  <code>cordis.patch.yml</code> and restart dsh.
                </p>
                <p>
                  Settings are saved to <code>{data.configFile}</code>.
                </p>
              </section>
            </>
          ) : null}
        </div>

        <footer className="modal-footer">
          {saveErrors.length > 0 ? (
            <ul className="settings-errors">
              {saveErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onReset} disabled={saving || !data}>
              Reset to defaults
            </button>
            <span className="modal-actions-spacer" />
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving || !data}>
              {saving ? 'Saving…' : 'Save & reload'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function RegexField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="settings-field">
      <span className="settings-label">{label}</span>
      <textarea
        rows={2}
        value={value}
        spellCheck={false}
        placeholder="One regular expression per line"
        onChange={(e) => onChange(e.target.value)}
      />
      <small>{hint}</small>
    </label>
  )
}
