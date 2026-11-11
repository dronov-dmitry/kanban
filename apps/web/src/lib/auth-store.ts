import type { User, UserSettings } from '@kanban/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SessionPayload {
  user: User;
  settings: UserSettings;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

interface AuthState {
  user: User | null;
  settings: UserSettings | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (payload: SessionPayload) => void;
  updateUser: (user: Partial<User>) => void;
  setSettings: (settings: UserSettings) => void;
  clear: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      settings: null,
      accessToken: null,
      refreshToken: null,
      setSession: (payload) =>
        set({
          user: payload.user,
          settings: payload.settings,
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
        }),
      updateUser: (patch) =>
        set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user })),
      setSettings: (settings) => set({ settings }),
      clear: () => set({ user: null, settings: null, accessToken: null, refreshToken: null }),
      isAuthenticated: () => Boolean(get().user && get().refreshToken),
    }),
    {
      name: 'kanban.session',
      version: 1,
      partialize: (state) => ({
        user: state.user,
        settings: state.settings,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);
