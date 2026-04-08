import { create } from 'zustand';

import { refreshSessionUser } from '@core/api/auth';
import type { AuthUser } from '@core/auth/types';
import { getJSON, removeItem, setJSON } from '@core/storage/storage';
import { useColectaSelectionStore } from '@modules/colecta/colectaSelectionStore';
import { useColectaSessionStore } from '@modules/colecta/colectaSessionStore';

const SESSION_KEY = 'auth_session';

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  /** true mientras se restaura la sesión guardada al arrancar la app */
  isLoading: boolean;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
  /** Lee el token guardado, valida contra /auth/me y restaura la sesión o va a login. */
  restoreSession: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  setSession: (token, user) => {
    set({ token, user, isAuthenticated: true });
    void setJSON(SESSION_KEY, { token, user });
  },

  clearSession: () => {
    useColectaSelectionStore.getState().clearSelection();
    useColectaSessionStore.getState().clearSession();
    set({ token: null, user: null, isAuthenticated: false });
    void removeItem(SESSION_KEY);
  },

  restoreSession: async () => {
    try {
      const saved = await getJSON<{ token: string; user: AuthUser }>(SESSION_KEY);
      if (saved?.token) {
        // Poner el token en el store para que el interceptor de axios lo use
        set({ token: saved.token });
        const user = await refreshSessionUser();
        set({ token: saved.token, user, isAuthenticated: true, isLoading: false });
        return;
      }
    } catch {
      // Token inválido o expirado — limpiar storage y pedir login
      void removeItem(SESSION_KEY);
    }
    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },
}));
