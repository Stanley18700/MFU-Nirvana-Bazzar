const { Button, Card, Fig, Notice, QRFrame, CsvButton, ScrapLabel } = window.MFUInternationalFestival2026DesignSystem_f3c3aa;

const BOOTH = { short: 'WKS', name: 'Cultural Workshops', host: 'School of Liberal Arts', loc: 'Hall B · far corner', points: 20, accent: 'var(--booth-8)' };
const eyebrow = { fontSize: '.55em', fontWeight: 600, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase' };
const lbl = { fontSize: 11, fontWeight: 600, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--app-ink-soft)', margin: 0 };
const fig = { fontVariantNumeric: 'tabular-nums', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontFamily: 'var(--font-display)' };

function BoothScreen() {
  const PERIOD = 20000;
  const [msLeft, setMsLeft] = React.useState(PERIOD);
  const [code, setCode] = React.useState('4821 9037');
  React.useEffect(() => {
    const i = setInterval(() => setMsLeft((m) => {
      if (m <= 120) { setCode(String(Math.floor(1000 + Math.random() * 8999)) + ' ' + String(Math.floor(1000 + Math.random() * 8999))); return PERIOD; }
      return m - 100;
    }), 100);
    return () => clearInterval(i);
  }, []);
  return (
    <main style={{ position: 'relative', minHeight: 720, display: 'flex', flexDirection: 'column', background: 'var(--app-chrome)', color: 'var(--app-ink-on-chrome)', fontSize: 30, overflow: 'hidden' }}>
      <img src="../../assets/illus-campus-papercut.png" alt="" style={{ position: 'absolute', bottom: -60, left: '50%', transform: 'translateX(-50%)', width: 1400, opacity: .16, pointerEvents: 'none' }} />
      <header style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '3vh 4vw 0' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...eyebrow, color: BOOTH.accent }}>{BOOTH.loc} · This badge is worth {BOOTH.points} points</div>
          <h1 style={{ margin: '4px 0 0', fontSize: '1.6em', fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 1.08 }}>{BOOTH.name}</h1>
          <div style={{ fontSize: '.6em', color: 'var(--app-ink-on-chrome-soft)' }}>{BOOTH.host}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.5em', color: 'var(--app-ink-on-chrome-soft)', flexShrink: 0 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--app-live)' }} />
          <span>Live</span>
          <button style={{ borderRadius: 'var(--radius-pill)', border: '1px solid var(--app-rule-on-chrome)', background: 'none', color: 'inherit', padding: '4px 12px', font: 'inherit', cursor: 'pointer' }}>⛶</button>
          <button style={{ borderRadius: 'var(--radius-pill)', border: '1px solid var(--app-rule-on-chrome)', background: 'none', color: 'inherit', padding: '4px 12px', font: 'inherit', cursor: 'pointer' }}>Print card</button>
        </div>
      </header>
      <section style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3vh', padding: '4vh 16px' }}>
        <QRFrame size={320} accent={BOOTH.accent} progress={msLeft / PERIOD} urgent={msLeft <= 3000}>
          <div key={code} style={{ animation: 'qrswap 260ms cubic-bezier(.2,.9,.3,1) both', width: 320, height: 320, display: 'grid', placeItems: 'center', background: 'var(--sky-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, letterSpacing: '.2em', fontWeight: 700, color: 'var(--app-ink-soft)', fontFamily: 'var(--font-body)' }}>QR CODE 320 × 320</div>
        </QRFrame>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...eyebrow, color: 'var(--app-ink-on-chrome-soft)' }}>Manual code</div>
          <div key={code} style={{ ...fig, fontSize: '2em', letterSpacing: '.18em', color: BOOTH.accent, animation: 'codeswap 260ms ease-out both' }}>{code}</div>
          <div style={{ fontSize: '.5em', color: 'var(--app-ink-on-chrome-soft)' }}>Rotates in <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.ceil(msLeft / 1000)}</span> s</div>
        </div>
      </section>
      <footer style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, borderTop: '1px solid var(--app-rule-on-chrome)', padding: '2.5vh 4vw' }}>
        <div><div style={{ ...fig, fontSize: '1.8em' }}>184</div><div style={{ ...eyebrow, fontSize: '.5em', color: 'var(--app-ink-on-chrome-soft)' }}>Visitors here</div></div>
        <div><div style={{ ...fig, fontSize: '1.8em' }}>1,248</div><div style={{ ...eyebrow, fontSize: '.5em', color: 'var(--app-ink-on-chrome-soft)' }}>Event total</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ ...fig, fontSize: '1.8em', color: 'var(--app-foil)' }}>#3</div><div style={{ ...eyebrow, fontSize: '.5em', color: 'var(--app-ink-on-chrome-soft)' }}>Rank of 12 booths</div></div>
      </footer>
      <style>{'@keyframes qrswap{from{opacity:.55;transform:scale(.98)}to{opacity:1;transform:none}}@keyframes codeswap{from{opacity:0;transform:translateY(-.14em)}to{opacity:1;transform:none}}'}</style>
    </main>
  );
}

const HOURS = [4, 9, 14, 22, 31, 27, 19, 24, 18, 11, 6, 3];
function BoothStats() {
  const max = Math.max(...HOURS);
  return (
    <main style={{ minHeight: 720, background: 'var(--app-page-quiet)', color: 'var(--app-ink)', padding: 28 }}>
      <div style={lbl}>Your booth · live</div>
      <h1 style={{ margin: '4px 0 0', fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 800 }}>{BOOTH.name}</h1>
      <section style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <Card elevation="card" padding="18px"><Fig value="184" label="Visitors here" size="sm" /></Card>
        <Card elevation="card" padding="18px"><Fig value="#3" label="Rank of 12" size="sm" accent="var(--sky-800)" /></Card>
        <Card elevation="card" padding="18px"><Fig value="3,680" label="Points issued" size="sm" /></Card>
        <Card elevation="card" padding="18px"><Fig value="31" label="Busiest hour" size="sm" accent="var(--app-warn-text)" /></Card>
      </section>
      <Card elevation="card" padding="20px" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={lbl}>Stamps per hour · Day 2</div>
          <CsvButton name="booth-hourly" rows={HOURS.map((v, i) => ({ hour: i, stamps: v }))} />
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 8, height: 180 }}>
          {HOURS.map((v, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: (v / max) * 150, background: v === max ? 'var(--orange-400)' : 'var(--sky-600)', borderRadius: '4px 4px 0 0' }} />
              <div style={{ fontSize: 10, color: 'var(--app-ink-soft)', marginTop: 6 }}>{9 + i}:00</div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ marginTop: 16 }}><Notice tone="warning">Two booths in your row have fewer than 40 visitors. Sending a runner to the entrance row usually helps them more than it costs you.</Notice></div>
    </main>
  );
}

function PrizeDesk() {
  const [state, setState] = React.useState('idle');
  return (
    <main style={{ minHeight: 720, background: 'var(--app-page-quiet)', color: 'var(--app-ink)', padding: 28 }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <div style={lbl}>Prize desk</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 800 }}>Scan a visitor's code</h1>
        {state === 'idle' && (
          <>
            <div style={{ margin: '22px 0', background: 'var(--app-chrome)', borderRadius: 'var(--radius-2xl)', height: 300, display: 'grid', placeItems: 'center', color: 'var(--app-ink-on-chrome)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 190, height: 190, border: '3px solid rgba(255,255,255,.35)', borderRadius: 'var(--radius-lg)', position: 'relative', margin: '0 auto' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: 'var(--sky-500)', boxShadow: '0 0 18px var(--sky-500)' }} />
                </div>
                <div style={{ marginTop: 14, fontSize: 14, color: 'var(--app-ink-on-chrome-soft)' }}>Hold the visitor's screen in the frame</div>
              </div>
            </div>
            <Button tone="primary" size="lg" block onClick={() => setState('found')}>Simulate a scan</Button>
          </>
        )}
        {state === 'found' && (
          <>
            <Card elevation="card" padding="20px" style={{ marginTop: 22 }}>
              <ScrapLabel color="var(--orange-400)" textColor="var(--ink-900)" index={1} size="sm">Voyager · 100 points</ScrapLabel>
              <h2 style={{ margin: '16px 0 0', fontSize: 25, fontFamily: 'var(--font-display)', fontWeight: 800 }}>Sasithorn P.</h2>
              <div style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '.16em', color: 'var(--app-ink-soft)' }}>MFU-2026-0417</div>
              <div style={{ marginTop: 14, fontSize: 15 }}>Reward: <b>Enamel pin set</b> · 62 left in stock</div>
            </Card>
            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <Button tone="secondary" size="lg" onClick={() => setState('done')}>Confirm handover</Button>
              <Button tone="ghost" size="lg" onClick={() => setState('idle')}>Cancel</Button>
              <Button tone="danger" size="lg" onClick={() => setState('void')}>Void</Button>
            </div>
          </>
        )}
        {state === 'done' && (
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Notice tone="success">Collected — thank you. Enamel pin set handed to Sasithorn P. at 14:22.</Notice>
            <Button tone="primary" size="lg" block onClick={() => setState('idle')}>Next visitor</Button>
          </div>
        )}
        {state === 'void' && (
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Notice tone="danger">Unlock voided. The visitor keeps their points and can redeem again once stock returns.</Notice>
            <Button tone="ghost" size="lg" block onClick={() => setState('idle')}>Back to the scanner</Button>
          </div>
        )}
      </div>
    </main>
  );
}

Object.assign(window, { BoothScreen, BoothStats, PrizeDesk });
