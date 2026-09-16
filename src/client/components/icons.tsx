/** Inline SVG icons — no icon library. 16×16 grid, stroke 1.5 (GitHub/Linear feel). */

interface IconProps {
  size?: number
  className?: string
  title?: string
}

function Svg({ size = 16, className, title, children, filled }: IconProps & { filled?: boolean; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="3.25" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
    </Svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" />
    </Svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </Svg>
  )
}

export function ChevronIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 4 4 4-4 4" />
    </Svg>
  )
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" />
    </Svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m3 8.5 3.5 3.5L13 4.5" />
    </Svg>
  )
}

export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Svg>
  )
}

export function SpinnerIcon(props: IconProps) {
  return (
    <Svg {...props} className={`spin${props.className ? ` ${props.className}` : ''}`}>
      <path d="M8 1.75a6.25 6.25 0 1 0 6.25 6.25" />
    </Svg>
  )
}

/** Tool-wrench glyph for tool rows. */
export function ToolIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.8 2.2a3 3 0 0 0-3.6 4L2.5 10a1.8 1.8 0 0 0 2.6 2.6l3.8-3.8a3 3 0 0 0 4-3.6l-2 2-1.8-.4-.4-1.8 2-2Z" />
    </Svg>
  )
}

/** Filled status dot (live indicator). */
export function DotIcon(props: IconProps) {
  return (
    <Svg {...props} filled>
      <circle cx="8" cy="8" r="4" />
    </Svg>
  )
}

export function InboxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 9.5V12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9.5M2 9.5 3.8 3.6A1.5 1.5 0 0 1 5.2 2.5h5.6a1.5 1.5 0 0 1 1.4 1.1L14 9.5M2 9.5h3l1 1.5h4l1-1.5h3" />
    </Svg>
  )
}


