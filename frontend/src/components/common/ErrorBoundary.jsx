import React from "react";

// Catches a crash in any screen below it and shows a way out, instead of letting React
// unmount the whole app to a blank white page. The error itself is only logged: it can
// contain a person's data, so it is never shown on screen.
//
// `resetKey` lets a parent clear the error when something changes, for example the route,
// so leaving the broken screen is enough to recover without reloading.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[ErrorBoundary] a screen crashed:", error);
  }

  componentDidUpdate(prevProps) {
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main role="alert" className="min-h-screen w-full flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-[440px] rounded-[20px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            This page hit a problem. Your records are safe. Try reloading, or go back to the start.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Reload page
            </button>
            <a
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Go to home
            </a>
          </div>
        </div>
      </main>
    );
  }
}
