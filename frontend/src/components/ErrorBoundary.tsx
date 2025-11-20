import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.errorBox}>
            <h1 style={styles.title}>⚠️ Something went wrong</h1>
            <p style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {import.meta.env.DEV && this.state.errorInfo && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details (Development Only)</summary>
                <pre style={styles.stackTrace}>
                  {this.state.error?.stack}
                  {'\n\nComponent Stack:'}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <button onClick={this.handleReset} style={styles.button}>
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#f8f9fa',
    padding: '20px',
  },
  errorBox: {
    maxWidth: '600px',
    padding: '40px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
  },
  title: {
    color: '#dc3545',
    margin: '0 0 20px 0',
  },
  message: {
    color: '#333',
    fontSize: '16px',
    marginBottom: '20px',
  },
  details: {
    textAlign: 'left' as const,
    margin: '20px 0',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '4px',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 'bold',
    marginBottom: '10px',
  },
  stackTrace: {
    fontSize: '12px',
    overflowX: 'auto' as const,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};
