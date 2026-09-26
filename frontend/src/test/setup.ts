import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetMockAuthStore } from '../mocks/fixtures/auth';
import { resetInventoryMockStore } from '../mocks/fixtures/inventory';
import { resetOperationsMockStore } from '../mocks/fixtures/operations';
import { server } from '../mocks/server';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockAuthStore();
  resetInventoryMockStore();
  resetOperationsMockStore();
  localStorage.clear();
});

afterAll(() => {
  server.close();
});
