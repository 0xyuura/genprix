import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * A React error thrown during render or inside a state updater unmounts the whole
 * tree, and what the player is left looking at is an unexplained black rectangle
 * mid-race. That happened for real: the hint button called maskAnswer on an
 * answer the server had quite correctly never sent.
 *
 * The bug is fixed, but "any future mistake takes the room down silently" is not
 * a property worth keeping. This turns it into a panel that says what broke and
 * offers the way back.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is the only place a host can look mid-event; keep it useful.
    console.error("GenPrix crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <section className="panel-kerb p-6">
          <h1 className="font-display font-bold uppercase tracking-[0.12em] text-bad text-xl">
            Red flag
          </h1>
          <p className="mt-3 text-sm text-ceramic/70">
            Something in the app threw and the screen stopped. Your run is still on the server —
            reloading rejoins it where it stands.
          </p>
          <p className="num mt-4 border border-line bg-sunken/40 p-3 text-xs text-ceramic/55 break-words">
            {error.message || String(error)}
          </p>
          <div className="mt-5 flex gap-3">
            <button className="btn-arcade" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button className="btn-ghost" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </section>
      </div>
    );
  }
}
