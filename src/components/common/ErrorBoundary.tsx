'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Enterprise error boundary catching client rendering errors
 * with graceful recovery and accessibility alerts.
 */
export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error in Domino Sky component tree:', error, errorInfo);
  }

  public handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center p-8 bg-surface rounded-card border border-border shadow-card m-4 text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-full bg-[#FAF0EE] text-[#8C2F2A] flex items-center justify-center">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-sm text-ink">Operational Rendering Interrupted</h3>
            <p className="text-xs text-ink-muted max-w-md">
              {this.state.error?.message ?? 'An unexpected error occurred while rendering the dashboard.'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary text-white rounded-input text-xs font-medium hover:bg-primary-hover transition-colors shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Component</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
