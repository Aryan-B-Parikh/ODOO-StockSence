import type { CurrentUser } from '@stocksense/shared';

/**
 * Phase 1 MSW fixtures for 05_API_CONTRACTS.md §1 (Auth).
 * Contract-first: the UI is built against these while the real backend lands.
 */

export interface MockUser extends CurrentUser {
  password: string;
}

export const MOCK_TOKEN = 'mock-jwt-token';
export const MOCK_OTP = '123456';

const seedUsers: MockUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    loginId: 'demo01',
    email: 'demo@example.com',
    displayName: 'Demo User',
    role: 'INVENTORY_MANAGER',
    password: 'Demo@123',
  },
];

let users: MockUser[] = seedUsers.map((user) => ({ ...user }));

export function resetMockAuthStore(): void {
  users = seedUsers.map((user) => ({ ...user }));
}

export function findMockUser(loginIdOrEmail: string): MockUser | undefined {
  return users.find((user) => user.loginId === loginIdOrEmail || user.email === loginIdOrEmail);
}

export function findMockUserByLoginId(loginId: string): MockUser | undefined {
  return users.find((user) => user.loginId === loginId);
}

export function addMockUser(user: MockUser): void {
  users.push(user);
}

export function updateMockUser(loginId: string, patch: Partial<MockUser>): MockUser | undefined {
  const user = findMockUserByLoginId(loginId);
  if (!user) return undefined;
  Object.assign(user, patch);
  return user;
}

export function toCurrentUser(user: MockUser): CurrentUser {
  const { password: _password, ...safe } = user;
  return safe;
}

export function currentMockUser(): MockUser {
  return users[0];
}
