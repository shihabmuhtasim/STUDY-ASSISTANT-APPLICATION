'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

type State = { hasError: boolean };

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Clarivo render failed', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-slate-50 grid place-items-center p-6">
        <section className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-6 shadow-sm text-center">
          <AlertTriangle className="mx-auto text-amber-500 mb-3" size={28} />
          <h1 className="text-lg font-semibold text-slate-900">The workspace could not load</h1>
          <p className="mt-2 text-sm text-slate-600">Your local documents are still stored on this device. Reload the workspace to try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
          >
            <RotateCcw size={16} />
            Reload workspace
          </button>
        </section>
      </main>
    );
  }
}
