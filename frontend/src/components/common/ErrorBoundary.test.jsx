// A crashing screen shows the fallback instead of a blank page, and recovers when the
// route key changes.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function Boom() {
  throw new Error('patient jane@example.com blew it up');
}

test('shows a way out instead of a blank page, without printing the error', () => {
  act(() => root.render(<ErrorBoundary><Boom /></ErrorBoundary>));
  expect(container.textContent).toContain('Something went wrong');
  expect(container.textContent).not.toContain('jane@example.com');
  expect(container.querySelector('a[href="/"]')).not.toBeNull();
});

test('renders its children when nothing is wrong, and recovers on a new key', () => {
  act(() => root.render(<ErrorBoundary resetKey="/a"><Boom /></ErrorBoundary>));
  expect(container.textContent).toContain('Something went wrong');
  act(() => root.render(<ErrorBoundary resetKey="/b"><p>fine now</p></ErrorBoundary>));
  expect(container.textContent).toBe('fine now');
});
