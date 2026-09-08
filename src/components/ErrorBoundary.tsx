import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State { error: Error | null }

/**
 * A render error used to leave a blank page with the only clue in the browser console. This shows
 * what went wrong and a way back. Data errors from listeners are handled separately by
 * `<DataErrors/>`; this is for the bugs.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="grid min-h-full place-items-center bg-paper p-6 text-navy">
        <div className="card w-full min-w-0 max-w-md">
          <div className="stamp-text text-vermilion">Something went wrong</div>
          <h1 className="mt-1 text-xl font-bold">This page hit an error</h1>
          <p className="mt-2 text-sm text-navy-soft">Reloading usually clears it. If it keeps happening, tell the admin what you were doing and quote the line below.</p>
          {/* Long single-token messages must wrap, or the card grows past a phone screen. */}
          <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-white/60 p-3 font-mono text-xs text-[#8f2a1c]">{this.state.error.message}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => window.location.reload()}>Reload</button>
            <a className="btn-ghost" href="/">Home</a>
          </div>
        </div>
      </main>
    )
  }
}
