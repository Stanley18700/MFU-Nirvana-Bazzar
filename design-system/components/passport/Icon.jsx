import React from 'react'

const PATHS = {
  cover: <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M8 17h8" /></>,
  stamps: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  prize: <path d="M12 3l2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9L6.6 19.6l1.1-6L3.3 9.4l6-.9z" />,
  scan: <><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" /><path d="M4 12h16" /></>,
}

/** The app's four icons, as one component. Line only, 1.8 stroke, currentColor. */
export function Icon({ name, size = 22, strokeWidth = 1.8, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {PATHS[name] ?? null}
    </svg>
  )
}
export const iconNames = Object.keys(PATHS)
