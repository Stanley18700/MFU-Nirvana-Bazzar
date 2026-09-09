import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useEvent } from '../../lib/data'
import { eventDateLine } from '../../lib/eventText'

// DarkNotice moved to components/ui so the booth screen and shared notices can use it; kept here for the auth pages.
export { Notice } from '../../components/ui'

/**
 * The paper-cut mountains from the key visual, in three layers.
 *
 * Drawn rather than placed because `illus-campus-papercut.png` could not be pulled from the design
 * tool (see .design-sync/NOTES.md) — swap this for that image when it arrives. It is a separate
 * component because the admin rail and the passport cover both set it behind their own ground at
 * low opacity, exactly as the design system's UI kits do.
 */
export function PaperHills({ className = '', opacity = 1 }: { className?: string; opacity?: number }) {
  const layers: Array<[string, string]> = [
    ['M0 110C140 70 260 60 400 90 540 120 640 40 800 70 960 100 1060 30 1200 60 1320 85 1400 70 1440 80V320H0Z', '#8FC08C'],
    ['M0 190C160 150 280 170 420 150 560 130 660 100 820 140 980 180 1080 110 1220 140 1340 165 1400 150 1440 160V320H0Z', '#6E9E6B'],
    ['M0 250C200 220 340 240 480 225 640 208 720 190 900 220 1060 248 1200 205 1440 240V320H0Z', '#4C764F'],
  ]
  return (
    <svg className={className} style={{ opacity }} viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
      {layers.map(([d, fill]) => <path key={fill} d={d} fill={fill} />)}
    </svg>
  )
}

/**
 * The festival set behind the signed-out screens and the passport pages, after the key visual: a
 * sky ground with wave bands, white paper-cut clouds, a paper sun, the line-art globe, and layered
 * green paper hills at the foot. The hills are drawn in SVG because the supplied
 * `illus-campus-papercut.png` could not be pulled from the design tool (see .design-sync/NOTES.md);
 * swap them for that image when it arrives. `hills={false}` for pages with a bottom tab bar.
 */
export function FestivalBackdrop({ hills = true }: { hills?: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-page" aria-hidden>
      {/* The design system's own sky wave field, in place of the two SVG sheets that stood in for
          it. `object-cover` because it is a field, not a picture: it may be cropped anywhere. */}
      <img src="/brand/bg-sky-waves.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <svg className="sun-drift absolute right-[5%] top-[3%] h-12 w-12 sm:right-[8%] sm:top-[7%] sm:h-24 sm:w-24" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#fff" opacity=".9" /></svg>
      {/* Paper clouds: flat white bumps on a straight base, three sizes, never symmetrical. */}
      <svg className="cloud-a absolute left-[-4%] top-[14%] w-[52%] max-w-[380px]" viewBox="0 0 380 130" fill="#fff" opacity=".92">
        <circle cx="90" cy="86" r="44" /><circle cx="160" cy="62" r="58" /><circle cx="250" cy="76" r="50" /><circle cx="320" cy="94" r="36" /><rect x="46" y="86" width="310" height="44" rx="22" />
      </svg>
      <svg className="cloud-b absolute right-[-6%] top-[66%] w-[44%] max-w-[300px] sm:top-[36%]" viewBox="0 0 380 130" fill="#fff" opacity=".85">
        <circle cx="110" cy="80" r="40" /><circle cx="190" cy="60" r="54" /><circle cx="280" cy="84" r="42" /><rect x="70" y="84" width="260" height="46" rx="23" />
      </svg>
      {/* The poster's rocket, cut from flat paper: coral body, cream porthole, deep-sky fins, an orange
          flame. Drawn in SVG because `illus-rocket.png` could not be pulled from the design tool; on a
          phone it keeps to the one text-free row beside the seal, from `sm` it climbs top-right. */}
      <PaperRocket className={`drift absolute ${hills
        ? 'right-[-9%] top-[21%] w-[27vw] sm:right-[13%] sm:top-[21%] sm:w-[150px]'
        : 'right-[4%] bottom-[max(16vh,130px)] w-[min(24vw,130px)]'}`} />
      {/*
        * The horizon is the design system's own paper-cut campus now, not the SVG mountains that
        * stood in for it while the asset could not be pulled. Cropped to a band of ridge and
        * canopy, at the height the mountains held: at its natural proportion it is two thirds of a
        * laptop screen, and every line of small print on this page then sits on rooftops.
        */}
      {hills && (
        <img
          src="/brand/illus-campus-papercut.webp" alt=""
          className="absolute bottom-0 left-0 h-[min(24vh,190px)] w-full object-cover object-[50%_6%] sm:h-[min(34vh,300px)]"
        />
      )}
    </div>
  )
}

function PaperRocket({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 200" aria-hidden style={{ transform: 'rotate(28deg)' }}>
      {/* flame */}
      <path d="M46 156c-4 14 2 30 14 40 12-10 18-26 14-40z" fill="#F0A445" />
      <path d="M52 158c-2 9 2 18 8 24 6-6 10-15 8-24z" fill="#F5C63C" />
      {/* fins */}
      <path d="M32 112 12 148c14-2 26-6 34-16z" fill="#12708A" />
      <path d="M88 112l20 36c-14-2-26-6-34-16z" fill="#12708A" />
      {/* body */}
      <path d="M60 8c-26 26-34 60-30 96l4 34c2 10 8 16 26 16s24-6 26-16l4-34c4-36-4-70-30-96z" fill="#EF5F5F" />
      <path d="M60 8c14 30 20 62 16 96l-4 34c-1 8-4 14-12 16 18 0 24-6 26-16l4-34c4-36-4-70-30-96z" fill="#D94A48" />
      <path d="M60 8c-26 26-34 60-30 96l4 34c2 10 8 16 26 16v-18c-8-2-12-8-13-18l-3-30c-3-30 4-56 16-80z" fill="#FF919C" opacity=".55" />
      {/* porthole */}
      <circle cx="60" cy="86" r="18" fill="#F4E4C4" />
      <circle cx="60" cy="86" r="11" fill="#7EDFF2" />
      <circle cx="56" cy="82" r="3.5" fill="#fff" opacity=".85" />
      {/* nose band */}
      <path d="M60 8c-8 8-14 18-18 28h36c-4-10-10-20-18-28z" fill="#F4E4C4" />
    </svg>
  )
}

/** The Global MFU seal — the one real university mark supplied with the design system. */
export function UniversityMark({ className = 'h-14 w-14' }: { className?: string }) {
  return <img src="/brand/logo-global-mfu.png" alt="Global MFU" className={`${className} shrink-0 rounded-full shadow-float`} width={183} height={180} />
}

/**
 * A torn-paper label, as the poster names each activity: flat colour, 2px corner, a small fixed
 * tilt, a hard offset shadow. Text is ink on the light scraps and white only on the two dark ones.
 */
const SCRAP = {
  ink: 'bg-chrome text-white', forest: 'bg-green-700 text-white', red: 'bg-danger text-white',
  orange: 'bg-orange-400 text-ink', sky: 'bg-sky-300 text-ink', cream: 'bg-panel-warm text-ink',
} as const
export function ScrapLabel({ tone = 'forest', tilt = -2.5, className = '', children }: { tone?: keyof typeof SCRAP; tilt?: number; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-[2px] px-3 py-1.5 text-sm font-semibold shadow-paper ${SCRAP[tone]} ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>{children}</span>
  )
}

/** The white paper card every signed-out screen sits in, on the same sky as the landing page. */
export function AuthShell({ title, lead, children, foot, back = '/' }: {
  title: string
  lead?: ReactNode
  children: ReactNode
  foot?: ReactNode
  back?: string | null
}) {
  const event = useEvent()
  return (
    <>
      <FestivalBackdrop />
      <main className="relative mx-auto flex min-h-full max-w-md flex-col px-5 pb-[max(15vh,130px)] pt-6 text-ink sm:pb-12">
        <div className="flex items-center justify-between gap-3">
          {back ? <Link to={back} className="link text-sm text-ink-soft hover:text-ink">← Back</Link> : <span />}
          <UniversityMark className="h-11 w-11" />
        </div>
        <div className="haze mt-5 self-start">
          <div className="stamp-text text-ink">{event.nameEn}</div>
          <div className="text-xs text-ink-soft">{eventDateLine(event, false)}</div>
        </div>

        <section className="page-in mt-5 rounded-[28px] bg-white p-6 shadow-float">
          <h1 className="text-2xl font-bold">{title}</h1>
          {lead && <p className="mt-2 text-sm text-ink-soft">{lead}</p>}
          {children}
        </section>

        {foot && <div className="mt-6 text-center text-sm text-ink">{foot}</div>}
      </main>
    </>
  )
}

export function GoogleButton({ onClick, busy, label }: { onClick: () => void; busy?: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-ink/15 bg-white px-4 py-3.5 font-semibold text-ink transition hover:bg-sky-100 active:scale-[0.98] disabled:opacity-50">
      <GoogleMark />
      {busy ? 'Opening Google…' : label}
    </button>
  )
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.3 15.5 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3.1.7-4.4v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.5z" />
      <path fill="#EA4335" d="M24 10.5c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.5 2 8.1 6.7 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.3 12.2-9.3z" />
    </svg>
  )
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-ink-soft">
      <span className="h-px flex-1 bg-ink/15" />{children}<span className="h-px flex-1 bg-ink/15" />
    </div>
  )
}

export function Field({ label, hint, ...input }: { label: string; hint?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="stamp-text text-ink-soft">{label}</span>
      <input className="field mt-1" {...input} />
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  )
}
