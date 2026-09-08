import { Link } from 'react-router-dom'
import { BoothCard } from '../../components/BoothCard'
import { Icon } from '../../components/ui'
import { useBooths, useEvent } from '../../lib/data'
import { APP_ORIGIN } from '../../lib/firebase'

/** Every active booth's table card (components/BoothCard), one per A4 page, printed through the browser. */
export default function BoothCards() {
  const booths = useBooths()
  const event = useEvent()
  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-[190mm] p-6 print:p-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy/5 p-3 text-sm print:hidden">
          <span>{booths.length} card{booths.length === 1 ? '' : 's'}, one per page. Print on A4, or choose “Save as PDF”.</span>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => window.print()}>{Icon.print}Print all</button>
            <Link to="/admin/booths" className="btn-ghost">Back</Link>
          </div>
        </div>
        {booths.map((b) => (
          <div key={b.id} className="print-page mb-8 border-b rule pb-8 last:border-0 print:mb-0 print:border-0 print:pb-0">
            <BoothCard booth={b} origin={APP_ORIGIN} period={event.qrPeriodSeconds} />
          </div>
        ))}
        {booths.length === 0 && <p className="text-sm text-navy-soft">No active booths.</p>}
      </div>
    </div>
  )
}
