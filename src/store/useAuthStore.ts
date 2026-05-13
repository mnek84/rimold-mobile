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
    let saved: { token: string; user: AuthUser } | null = null;
    try {
      saved = await getJSON<{ token: string; user: AuthUser }>(SESSION_KEY);
    } catch {
      // Storage ilegible — caer al flujo de login.
    }

    if (saved?.token != null && saved.token !== '' && saved.user != null) {
      // Restauración optimista: el token móvil no expira por tiempo, así que mostramos la app
      // inmediatamente con la última sesión guardada. La validación contra /auth/me se hace en
      // background; el interceptor del apiClient se encarga de limpiar la sesión si el servidor
      // devuelve 401 (token revocado/usuario eliminado) o 403 (cuenta inactiva). Errores de red
      // o 5xx no descartan la sesión: la app sigue funcionando hasta que el operario cierre
      // sesión manualmente o el servidor confirme que la cuenta ya no es válida.
      set({
        token: saved.token,
        user: saved.user,
        isAuthenticated: true,
        isLoading: false,
      });

      try {
        const user = await refreshSessionUser();
        const state = useAuthStore.getState();
        if (state.isAuthenticated && state.token === saved.token) {
          set({ user });
          void setJSON(SESSION_KEY, { token: saved.token, user });
        }
      } catch {
        // 401/403 ya fueron manejados por el interceptor del apiClient (clearSession).
        // Cualquier otro error (red, timeout, 5xx) se ignora para preservar la sesión.
      }
      return;
    }

    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },
}));
