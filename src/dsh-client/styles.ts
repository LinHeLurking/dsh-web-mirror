/**
 * Card styles, injected as a <style> tag on first materialization — the
 * same delivery DSH's own client bundles use for their css modules, kept
 * as a plain TS module so the bundle stays single-file with no css plugin.
 * Class names are prefixed to avoid colliding with the host app.
 *
 * Colors track the DSH web theme through its alias custom properties, with
 * neutral fallbacks when a property is absent.
 */
export const MIRROR_CARD_CSS = `
.dshm-card { border: 0.5px solid var(--dsw-alias-border-l4, #d1d9e0); background: var(--dsw-alias-bg-layer-3, #f6f8fa); border-radius: 16px; list-style: none; transition: border-color 0.16s, background 0.16s; }
.dshm-card:hover { border-color: var(--dsw-alias-label-dimmed, #8c959f); }
.dshm-cardOpen { background: var(--dsw-alias-bg-layer-2, #fff); border-color: var(--dsw-alias-label-dimmed, #8c959f); }
.dshm-header { appearance: none; width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer; background: none; border: 0; border-radius: 12px; align-items: center; gap: 12px; padding: 14px 16px; display: flex; }
.dshm-header:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #0969da); outline-offset: -2px; }
.dshm-headText { display: flex; flex-direction: column; flex: 1; gap: 4px; min-width: 0; }
.dshm-name { color: var(--dsw-alias-label-primary, #1f2328); font-size: 15px; font-weight: 600; line-height: 1.4; }
.dshm-description { color: var(--dsw-alias-label-tertiary, #59636e); font-size: 13px; line-height: 1.5; }
.dshm-chevron { color: var(--dsw-alias-label-tertiary, #59636e); flex: none; transition: transform 0.16s; font-size: 12px; }
.dshm-chevronOpen { transform: rotate(180deg); }
.dshm-pending { flex: none; font-size: 11px; line-height: 1.5; padding: 1px 8px; border-radius: 999px; background: var(--dsw-alias-bg-layer-4, #eff1f3); color: var(--dsw-alias-label-secondary, #59636e); }
.dshm-body { border-top: 0.5px solid var(--dsw-alias-border-l2, #e5e7eb); margin: 0 16px; padding-bottom: 8px; }
.dshm-readOnly { color: var(--dsw-alias-label-tertiary, #59636e); margin: 12px 0 0; font-size: 12px; line-height: 1.5; }
.dshm-footer { border-top: 0.5px solid var(--dsw-alias-border-l2, #e5e7eb); display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 0 4px; }
.dshm-failed { flex: 1; min-width: 0; margin: 0; color: var(--dsw-alias-label-error, #d1242f); font-size: 12px; line-height: 1.5; }
.dshm-discard, .dshm-save { appearance: none; font: inherit; cursor: pointer; border: 1px solid transparent; border-radius: 8px; padding: 5px 14px; font-size: 13px; line-height: 1.5; }
.dshm-discard { border-color: var(--dsw-alias-border-l2, #e5e7eb); color: var(--dsw-alias-label-secondary, #59636e); background: none; }
.dshm-discard:hover:not(:disabled) { color: var(--dsw-alias-label-primary, #1f2328); border-color: var(--dsw-alias-label-dimmed, #8c959f); }
.dshm-save { background: var(--dsw-alias-label-primary, #1f2328); color: var(--dsw-alias-bg-layer-3, #fff); }
.dshm-discard:disabled, .dshm-save:disabled { opacity: 0.4; cursor: default; }
.dshm-field { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.dshm-field + .dshm-field { border-top: 0.5px solid var(--dsw-alias-border-l2, #e5e7eb); }
.dshm-head { display: flex; align-items: center; gap: 8px; }
.dshm-label { flex: 1; min-width: 0; color: var(--dsw-alias-label-primary, #1f2328); font-size: 13px; font-weight: 500; line-height: 1.5; }
.dshm-badge { font-size: 11px; line-height: 1.5; padding: 0 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-4, #eff1f3); color: var(--dsw-alias-label-secondary, #59636e); }
.dshm-reset { font: inherit; font-size: 12px; line-height: 1.5; padding: 0; border: none; background: none; cursor: pointer; color: var(--dsw-alias-label-secondary, #59636e); }
.dshm-reset:hover:not(:disabled) { color: var(--dsw-alias-label-primary, #1f2328); }
.dshm-reset:disabled { cursor: default; opacity: 0.5; }
.dshm-textarea { box-sizing: border-box; width: 100%; min-height: 56px; padding: 6px 8px; border: 0.5px solid var(--dsw-alias-border-l4, #d1d9e0); border-radius: 6px; background: var(--dsw-alias-bg-layer-3, #f6f8fa); color: var(--dsw-alias-label-primary, #1f2328); font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; resize: vertical; }
.dshm-textarea:focus { outline: 2px solid var(--dsw-alias-border-accent, #54aeff); outline-offset: -1px; }
.dshm-textarea[aria-invalid='true'] { border-color: var(--dsw-alias-border-danger, #d1242f); }
.dshm-hint { margin: 0; color: var(--dsw-alias-label-secondary, #59636e); font-size: 12px; line-height: 1.5; }
.dshm-hint[data-invalid='true'] { color: var(--dsw-alias-label-danger, #d1242f); }
.dshm-check { display: flex; gap: 8px; align-items: flex-start; padding: 12px 0; cursor: pointer; }
.dshm-check input { margin-top: 2px; }
.dshm-check .dshm-label { flex: none; }
.dshm-defaults { margin: 0 0 4px; padding: 8px 10px; border: 0.5px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 6px; background: var(--dsw-alias-bg-layer-2, #f6f8fa); font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #59636e); }
.dshm-defaults summary { cursor: pointer; color: var(--dsw-alias-label-primary, #1f2328); font-weight: 500; }
.dshm-defaults ul { margin: 6px 0 0; padding-left: 18px; }
.dshm-defaults code { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 11px; }
.dshm-redact-row { display: flex; gap: 6px; align-items: center; }
.dshm-redact-row + .dshm-redact-row { margin-top: 6px; }
.dshm-input { box-sizing: border-box; flex: 1; min-width: 0; height: 28px; padding: 0 8px; border: 0.5px solid var(--dsw-alias-border-l4, #d1d9e0); border-radius: 6px; background: var(--dsw-alias-bg-layer-3, #f6f8fa); color: var(--dsw-alias-label-primary, #1f2328); font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.dshm-input:focus { outline: 2px solid var(--dsw-alias-border-accent, #54aeff); outline-offset: -1px; }
.dshm-icon-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0.5px solid var(--dsw-alias-border-l4, #d1d9e0); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary, #59636e); cursor: pointer; font-size: 14px; line-height: 1; }
.dshm-icon-btn:hover { color: var(--dsw-alias-label-primary, #1f2328); }
.dshm-link { font: inherit; font-size: 12px; padding: 0; border: none; background: none; cursor: pointer; color: var(--dsw-alias-label-accent, #0550ae); }
.dshm-link:hover { text-decoration: underline; }
.dshm-note { margin: 0; padding: 12px 0; color: var(--dsw-alias-label-secondary, #59636e); font-size: 12px; line-height: 1.5; }
`

/** Inject the css once per document; idempotent across HMR re-materializations. */
export function injectMirrorCardStyles(): void {
  const tagId = 'dshm-card'
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@moonshot-ai/dsh-web-mirror'
  tag.dataset.pluginCss = tagId
  tag.textContent = MIRROR_CARD_CSS
  document.head.appendChild(tag)
}
