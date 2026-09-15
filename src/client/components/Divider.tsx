import { TimeAgo } from './TimeAgo.js'

/**
 * Subtle time divider for turn/step boundaries — a thin rule with small
 * centered gray text. Replaces the old yellow "system card".
 */
export function Divider({ label, time }: { label: string; time?: number }) {
  return (
    <div className="t-divider" role="separator">
      <span className="t-divider-line" />
      <span className="t-divider-label">
        {label}
        {time !== undefined ? (
          <>
            {' · '}
            <TimeAgo time={time} />
          </>
        ) : null}
      </span>
      <span className="t-divider-line" />
    </div>
  )
}
