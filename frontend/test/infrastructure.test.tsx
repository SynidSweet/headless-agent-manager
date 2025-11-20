import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Smoke test to verify testing infrastructure
 * This test should pass if Vitest, jsdom, and React Testing Library are configured correctly
 */
describe('Testing Infrastructure', () => {
  it('should run basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect(true).toBe(true);
  });

  it('should render React components', () => {
    const TestComponent = () => <div>Hello Testing</div>;
    render(<TestComponent />);

    expect(screen.getByText('Hello Testing')).toBeInTheDocument();
  });

  it('should have WebSocket mock available', () => {
    expect(global.WebSocket).toBeDefined();

    const ws = new WebSocket('ws://localhost:3000');
    expect(ws).toBeDefined();
    expect(ws.url).toBe('ws://localhost:3000');
  });

  it('should support jest-dom matchers', () => {
    const element = document.createElement('button');
    element.textContent = 'Click me';
    element.disabled = false;
    document.body.appendChild(element);

    expect(element).toBeInTheDocument();
    expect(element).not.toBeDisabled();

    document.body.removeChild(element);
  });
});
