import { Link } from 'react-router-dom'
import { useBooths } from '../../lib/data'
import { Stamp } from '../../components/Stamp'
import { Notice } from '../../components/ui'
import type { ScanResult } from '../../../shared/model'

export function ScanResultView({ result, onRetry }: { result: ScanResult; onRetry: () => void }) {
  const booths = useBooths()
  const booth = 'boothId' in result ? booths.find((b) => b.id === result.boothId) : undefined

  if (result.status === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center page-in">
        {booth && <Stamp booth={booth} collected animate tilt={(Math.random() * 8 - 4) | 0 || 5} size={160} />}
        <div>
          <div className="stamp-text" style={{ color: booth?.accentColor }}>Stamp collected</div>
          <div className="fig mt-1 text-4xl" style={{ color: booth?.accentColor }}>+{result.pointsAwarded} points</div>
          <div className="mt-1 text-sm text-navy-soft">{booth?.nameEn} · {result.points} points total · {result.stampCount} stamps</div>
        </div>
        {result.unlockedTierIds.length > 0 && <Notice tone="green">You just unlocked a prize tier. Check the Prize page.</Notice>}
        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={onRetry}>Scan another</button>
          <Link to="/passport/stamps" className="btn-primary flex-1">My stamps</Link>
        </div>
      </div>
    )
  }
  if (result.status === 'already') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center page-in">
        {booth && <Stamp booth={booth} collected size={120} className="pulse-once" />}
        <div className="font-semibold">Already stamped here</div>
        <div className="text-sm text-navy-soft">{booth?.nameEn} is in your passport. Try a booth you have not visited.</div>
        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={onRetry}>Scan another</button>
          <Link to="/passport/stamps" className="btn-primary flex-1">See what's left</Link>
        </div>
      </div>
    )
  }
  const map = {
    expired: { tone: 'amber' as const, text: 'That code has expired — the booth screen changes every 20 seconds. Scan it again.' },
    invalid: { tone: 'red' as const, text: 'Invalid code. Point your camera at the booth screen, or type the 6 characters shown under the QR.' },
    rate_limited: { tone: 'amber' as const, text: 'Too fast — give it a few seconds and try again.' },
    not_registered: { tone: 'amber' as const, text: 'Create your passport first, then scan.' },
  }[result.status]
  return (
    <div className="flex flex-col gap-4 p-6 page-in">
      <Notice tone={map.tone}>{map.text}</Notice>
      {result.status === 'not_registered' ? <Link to="/join" className="btn-primary">Create my passport</Link> : <button className="btn-primary" onClick={onRetry}>Try again</button>}
    </div>
  )
}
