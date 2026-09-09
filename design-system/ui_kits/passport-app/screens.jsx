const { Button, Card, Fig, Notice, TabBar, Stamp, Icon, Crest, Spinner, ScrapLabel } = window.MFUInternationalFestival2026DesignSystem_f3c3aa;

const BOOTHS = [
  { id: 'b1', short: 'SAB', name: 'Study Abroad Exhibition', host: 'Office of International Affairs', loc: 'Hall A · entrance', points: 10, accent: 'var(--booth-2)', days: 'Day 1 · Day 2 · Day 3' },
  { id: 'b2', short: 'FOOD', name: 'International Food Festival', host: 'Student Union', loc: 'Hall A · middle', points: 15, accent: 'var(--booth-1)', days: 'Day 1 · Day 2' },
  { id: 'b3', short: 'YTH', name: 'Youth Booth', host: 'School of Applied Digital Technology', loc: 'Hall B · middle', points: 15, accent: 'var(--booth-3)', days: 'Day 2 · Day 3' },
  { id: 'b4', short: 'WKS', name: 'Cultural Workshops', host: 'School of Liberal Arts', loc: 'Hall B · far corner', points: 20, accent: 'var(--booth-8)', days: 'Day 1 · Day 3' },
  { id: 'b5', short: 'PRF', name: 'Cultural Performances', host: 'MFU Cultural Centre', loc: 'Main stage', points: 20, accent: 'var(--booth-5)', days: 'Day 3' },
  { id: 'b6', short: 'TLK', name: 'Special Talks and Seminars', host: 'Graduate School', loc: 'Hall C · far corner', points: 20, accent: 'var(--booth-6)', days: 'Day 2' },
];
const TIERS = [
  { id: 't1', name: 'Explorer', threshold: 50, reward: 'Festival tote bag', left: 240, total: 400 },
  { id: 't2', name: 'Voyager', threshold: 100, reward: 'Enamel pin set', left: 62, total: 300 },
  { id: 't3', name: 'Globetrotter', threshold: 150, reward: 'Zero-waste bottle + stage draw entry', left: 8, total: 120, draw: true },
];
const TILT = { b1: -4, b2: 3, b3: -2, b4: 5, b5: -6, b6: 2 };

const eyebrow = { fontSize: 11, fontWeight: 600, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--app-ink-soft)' };
const panel = { background: 'var(--app-panel)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', boxShadow: 'var(--shadow-card)' };
const fig = { fontVariantNumeric: 'tabular-nums', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontFamily: 'var(--font-display)' };

function Ring({ remaining, pct, size = 112 }) {
  const r = 54, c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 128 128" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="8" />
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--app-foil)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 600ms ease-out' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div><div style={{ ...fig, fontSize: 20 }}>{remaining == null ? '✓' : remaining}</div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--app-ink-on-chrome-soft)' }}>{remaining == null ? 'top tier' : 'to go'}</div></div>
      </div>
    </div>
  );
}

function Cover({ points, stamped, onScan }) {
  const next = TIERS.find((t) => points < t.threshold);
  const prev = [...TIERS].reverse().find((t) => points >= t.threshold);
  const pct = next ? Math.min(1, (points - (prev ? prev.threshold : 0)) / (next.threshold - (prev ? prev.threshold : 0))) : 1;
  return (
    <main style={{ padding: '20px 20px 0' }}>
      <img src="../../assets/logo-festival.png" alt="MFU International Festival 2026" style={{ display: 'block', width: 208, height: 'auto', margin: '0 auto 16px' }} />
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-2xl)', background: 'var(--app-cover)', color: 'var(--app-ink-on-chrome)', padding: '28px 24px', boxShadow: 'var(--shadow-float)' }}>
        <img src="../../assets/illus-campus-papercut.png" alt="" style={{ position: 'absolute', bottom: -20, left: -40, width: 480, opacity: .22, pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ ...eyebrow, color: 'var(--app-foil)' }}>Mae Fah Luang University</div>
          <div style={{ marginTop: 4, fontSize: 17, fontWeight: 600, fontFamily: 'var(--font-display)' }}>Bridging cultures, building global citizens</div>
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ color: 'var(--app-foil)', flexShrink: 0 }}><Crest size={72} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...eyebrow, color: 'var(--app-ink-on-chrome-soft)' }}>Passport</div>
              <div style={{ fontSize: 25, fontWeight: 700, fontFamily: 'var(--font-display)' }}>Sasithorn P.</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, letterSpacing: '.18em', color: 'var(--app-foil)' }}>MFU-2026-0417</div>
            </div>
          </div>
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...fig, fontSize: 54, color: 'var(--app-foil)' }}>{points}</div>
              <div style={{ ...eyebrow, color: 'var(--app-ink-on-chrome-soft)' }}>points · {stamped.length} of {BOOTHS.length} stamps</div>
            </div>
            <Ring pct={pct} remaining={next ? next.threshold - points : null} />
          </div>
          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
            {TIERS.map((t) => {
              const on = points >= t.threshold;
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: on ? 'var(--app-foil)' : 'rgba(255,255,255,.25)' }} />
                  <span style={{ fontSize: 12, color: on ? 'var(--app-foil)' : 'var(--app-ink-on-chrome-soft)' }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: t.left <= 0 ? 'var(--scrap-pink)' : 'var(--app-ink-on-chrome-soft)' }}>{t.left} left</span>
                </div>
              );
            })}
          </div>
          <p style={{ marginTop: 12, fontSize: 14, color: 'var(--app-ink-on-chrome-soft)', lineHeight: 1.5 }}>
            {next ? <><b>{next.threshold - points} more points</b> to {next.name} — {next.reward.toLowerCase()}.</> : 'You have reached every tier. Show your Prize page at the desk.'}
          </p>
        </div>
      </section>
      <section style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button onClick={onScan} style={{ ...panel, textAlign: 'left', border: 'none', cursor: 'pointer', font: 'inherit', display: 'flex', flexDirection: 'column', gap: 3, color: 'var(--app-ink)' }}>
          <span style={eyebrow}>Next</span><span style={{ fontWeight: 600 }}>Scan a booth</span>
          <span style={{ fontSize: 12, color: 'var(--app-ink-soft)' }}>Point your camera at the booth screen</span>
        </button>
        <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={eyebrow}>Route</span><span style={{ fontWeight: 600 }}>See what's worth most</span>
          <span style={{ fontSize: 12, color: 'var(--app-ink-soft)' }}>Far-corner booths pay 20 points</span>
        </div>
      </section>
    </main>
  );
}

function Stamps({ stamped, onOpen }) {
  const have = BOOTHS.filter((b) => stamped.includes(b.id));
  const left = BOOTHS.filter((b) => !stamped.includes(b.id)).sort((a, b) => b.points - a.points);
  const remainingPoints = left.reduce((s, b) => s + b.points, 0);
  const Slot = ({ b, collected }) => (
    <button onClick={() => onOpen(b)} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%',
      borderRadius: 'var(--radius-lg)', padding: 8, textAlign: 'center', cursor: 'pointer', font: 'inherit',
      color: 'var(--app-ink)',
      background: collected ? 'var(--app-panel)' : 'rgba(255,255,255,.45)',
      boxShadow: collected ? 'var(--shadow-card)' : 'none',
      border: collected ? '1px solid transparent' : '1px dashed var(--app-rule-strong)',
    }}>
      <Stamp shortName={b.short} validFor={b.name} collected={collected} tilt={collected ? TILT[b.id] : 0} points={b.points} size={148} accent={b.accent} markTop="MFU INTER FEST" markBottom="2026 · CHIANG RAI" />
      <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.25 }}>{b.name}</span>
      {collected
        ? <span style={{ fontSize: 11, color: 'var(--app-ink-soft)' }}>✓ +{b.points} pts</span>
        : <span style={{ ...eyebrow, color: 'var(--app-ink)' }}>{b.points} pts</span>}
    </button>
  );
  return (
    <main style={{ padding: '24px 20px 0' }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div><div style={{ ...eyebrow, color: 'var(--app-ink)' }}>Stamps</div>
          <h1 style={{ margin: 0, fontSize: 27, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--app-ink)' }}>{have.length} of {BOOTHS.length}</h1></div>
        <div style={{ fontSize: 13, color: 'var(--app-ink)', textAlign: 'right', fontWeight: 500 }}>{remainingPoints} points still on the floor</div>
      </header>
      {left.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ ...eyebrow, margin: 0, color: 'var(--app-ink)' }}>Still to collect · highest value first</h2>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {left.map((b) => <Slot key={b.id} b={b} collected={false} />)}
          </div>
        </section>
      )}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ ...eyebrow, margin: 0, color: 'var(--app-ink)' }}>Collected</h2>
        {have.length === 0
          ? <p style={{ marginTop: 12, ...panel, textAlign: 'center', fontSize: 14, color: 'var(--app-ink-soft)' }}>No stamps yet. Tap <b>Scan</b> at your first booth.</p>
          : <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              {have.map((b) => <Slot key={b.id} b={b} collected />)}
            </div>}
      </section>
    </main>
  );
}

function Prize({ points }) {
  const unlocked = TIERS.filter((t) => points >= t.threshold);
  return (
    <main style={{ padding: '24px 20px 0' }}>
      <div style={{ ...eyebrow, color: 'var(--app-ink)' }}>Prize</div>
      <h1 style={{ margin: 0, fontSize: 27, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--app-ink)' }}>{points} points</h1>
      {unlocked.length > 0 ? (
        <section style={{ position: 'relative', overflow: 'hidden', marginTop: 18, borderRadius: 'var(--radius-2xl)', border: 'var(--border-medium) solid var(--app-foil)', background: 'var(--app-panel)', padding: 20, textAlign: 'center', boxShadow: 'var(--shadow-float)' }}>
          <div style={{ ...eyebrow, color: 'var(--app-warn-text)' }}>Entry visa · show this at the prize desk</div>
          <div style={{ margin: '14px auto 0', width: 168, height: 168, display: 'grid', placeItems: 'center', background: 'var(--sky-100)', borderRadius: 'var(--radius-sm)', color: 'var(--app-ink-soft)', fontSize: 11, letterSpacing: '.18em', fontWeight: 700 }}>QR CODE</div>
          <div style={{ ...fig, marginTop: 16, fontSize: 26, letterSpacing: '.22em', color: 'var(--app-ink)' }}>4821 9037</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--app-ink-soft)' }}>Refreshes in 14 s — a screenshot will not work</div>
          <svg style={{ position: 'absolute', bottom: -24, right: -24, width: 128, height: 128, color: 'var(--app-foil)', opacity: .5, pointerEvents: 'none' }} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="36" />
          </svg>
        </section>
      ) : (
        <div style={{ marginTop: 18 }}><Notice>Reach 50 points and your redemption code appears here.</Notice></div>
      )}
      <ul style={{ listStyle: 'none', margin: '20px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TIERS.map((t) => {
          const on = points >= t.threshold;
          const low = t.left / t.total < 0.2;
          return (
            <li key={t.id} style={{ ...panel, display: 'flex', alignItems: 'center', gap: 16, boxShadow: on ? '0 0 0 2px var(--app-foil), var(--shadow-card)' : 'var(--shadow-card)', opacity: on ? 1 : .82 }}>
              <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: on ? 'var(--app-foil)' : 'var(--app-well)', color: on ? 'var(--ink-900)' : 'var(--app-ink-soft)' }}>
                <span style={{ ...fig, fontSize: 14 }}>{t.threshold}</span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--app-ink)' }}>{t.name} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--app-ink-soft)' }}>· {t.threshold} pts</span></div>
                <div style={{ fontSize: 14, color: 'var(--app-ink-soft)' }}>{t.reward}</div>
                <div style={{ fontSize: 12, color: low ? 'var(--app-warn-text)' : 'var(--app-ink-soft)' }}>{t.left} left</div>
                {!on && <div style={{ fontSize: 12, color: 'var(--app-ink-soft)' }}>{t.threshold - points} more points</div>}
                {t.draw && <div style={{ fontSize: 12, color: 'var(--app-warn-text)', fontWeight: 600 }}>+ entry to the closing stage draw</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function ScanResult({ booth, onDone }) {
  return (
    <main style={{ padding: '44px 24px', textAlign: 'center', minHeight: 460 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <ScrapLabel color="var(--green-700)" index={1}>Stamp added</ScrapLabel>
      </div>
      <h1 style={{ margin: '20px 0 0', fontSize: 27, fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 1.14, color: 'var(--app-ink)' }}>{booth.name}</h1>
      <div style={{ fontSize: 14, color: 'var(--app-ink)' }}>{booth.host}</div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '26px 0' }}>
        <Stamp shortName={booth.short} validFor={booth.name} collected animate tilt={TILT[booth.id]} size={300} accent={booth.accent} markTop="MFU INTER FEST" markBottom="2026 · CHIANG RAI" />
      </div>
      <div style={{ ...fig, fontSize: 42, color: 'var(--app-ink)' }}>+{booth.points}</div>
      <div style={{ ...eyebrow, color: 'var(--app-ink)' }}>points</div>
      <div style={{ marginTop: 26 }}><Button tone="primary" size="lg" block onClick={onDone}>Back to my stamps</Button></div>
    </main>
  );
}

function Scanning({ onFound }) {
  React.useEffect(() => { const t = setTimeout(onFound, 1400); return () => clearTimeout(t); }, [onFound]);
  return (
    <main style={{ background: 'var(--app-chrome)', minHeight: 460, display: 'grid', placeItems: 'center', color: 'var(--app-ink-on-chrome)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 200, height: 200, margin: '0 auto', border: '3px solid rgba(255,255,255,.35)', borderRadius: 'var(--radius-xl)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: 'var(--sky-500)', boxShadow: '0 0 18px var(--sky-500)' }} />
        </div>
        <div style={{ marginTop: 18 }}><Spinner dark label="Looking for a booth code…" /></div>
      </div>
    </main>
  );
}

function BoothSheet({ booth, collected, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(23,65,78,.6)', display: 'flex', alignItems: 'flex-end', padding: 14 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...panel, width: '100%', animation: 'mfu-page-in var(--dur-page) var(--ease-out) both' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <Stamp shortName={booth.short} validFor={booth.name} collected={collected} size={124} points={booth.points} accent={booth.accent} markTop="MFU INTER FEST" markBottom="2026 · CHIANG RAI" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...eyebrow, color: 'var(--app-ink-soft)' }}>{booth.loc} · {booth.points} points</div>
            <h3 style={{ margin: '2px 0 0', fontSize: 19, fontFamily: 'var(--font-display)', fontWeight: 700, lineHeight: 1.2, color: 'var(--app-ink)' }}>{booth.name}</h3>
            <div style={{ fontSize: 14, color: 'var(--app-ink-soft)' }}>{booth.host}</div>
          </div>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--app-ink-soft)' }}>Present: {booth.days}</p>
        <div style={{ marginTop: 16 }}><Button tone="ghost" block onClick={onClose}>Close</Button></div>
      </div>
    </div>
  );
}

Object.assign(window, { BOOTHS, TIERS, Cover, Stamps, Prize, ScanResult, Scanning, BoothSheet });
