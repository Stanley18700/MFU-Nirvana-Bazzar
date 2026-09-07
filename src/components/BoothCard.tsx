import { QR } from './QR'
import type { BoothDoc } from '../../shared/model'

/**
 * A printable table card for a booth (§5.1). The live QR rotates every period, so it cannot be
 * printed; this card carries a static code that opens the visitor's own scanner, plus the
 * two-step instruction, so a booth still has something to stand on the table.
 */
export function BoothCard({ booth, origin, period = 20 }: { booth: BoothDoc; origin: string; period?: number }) {
  const host = origin.replace(/^https?:\/\//, '')
  return (
    <article className="mx-auto flex min-h-[250mm] max-w-[180mm] flex-col items-center gap-8 bg-white p-10 text-center text-[#17263F]">
      <div className="h-3 w-full rounded-full" style={{ background: booth.accentColor }} />
      <div>
        <div className="text-sm uppercase tracking-[0.2em] text-[#4A5872]">
          {booth.location}{booth.hostUnit ? ` · ${booth.hostUnit}` : ''}
        </div>
        <h1 className="mt-2 text-4xl font-bold leading-tight">{booth.nameEn}</h1>
        {booth.nameTh && <div className="mt-1 text-xl text-[#4A5872]">{booth.nameTh}</div>}
        <div className="mt-4 inline-block rounded-full px-5 py-1.5 text-lg font-semibold text-white" style={{ background: booth.accentColor }}>
          Worth {booth.points} points
        </div>
      </div>
      <QR value={`${origin}/scan`} size={220} />
      <ol className="max-w-[130mm] text-left text-base leading-relaxed">
        <li><b>1.</b> Scan this code to open your passport scanner, or go to <b>{host}/scan</b>.</li>
        <li className="mt-2"><b>2.</b> Point it at the live screen on this table, or type the 6-character code shown under it. The code changes every {period} seconds.</li>
      </ol>
      <footer className="mt-auto w-full border-t border-[#17263F]/20 pt-3 text-xs text-[#4A5872]">
        Staff: the live screen is at {host}/booth — sign in with your invited account.
      </footer>
    </article>
  )
}
