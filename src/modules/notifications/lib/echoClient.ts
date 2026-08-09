/**
 * Cliente Reverb (Pusher-compatible) para el mobile.
 *
 * Requiere `laravel-echo` y `pusher-js` instalados (declarados en package.json
 * a nivel proyecto). Devuelve null si:
 *  - las envs de Reverb no están seteadas (fallback a polling)
 *  - los paquetes no se pueden cargar (dev/expo-go sin bundling completo)
 *
 * Configuración esperada en `.env` (leídas via `EXPO_PUBLIC_*` para que las
 * incluya el bundle):
 *  - EXPO_PUBLIC_REVERB_APP_KEY
 *  - EXPO_PUBLIC_REVERB_HOST
 *  - EXPO_PUBLIC_REVERB_PORT (default 443/8080 según scheme)
 *  - EXPO_PUBLIC_REVERB_SCHEME (default https)
 *  - EXPO_PUBLIC_API_URL (para /broadcasting/auth)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EchoLike = any;

export function createMobileEcho(jwt: string): EchoLike | null {
  const key = process.env.EXPO_PUBLIC_REVERB_APP_KEY;
  const host = process.env.EXPO_PUBLIC_REVERB_HOST;
  const rawScheme = process.env.EXPO_PUBLIC_REVERB_SCHEME;
  const rawPort = process.env.EXPO_PUBLIC_REVERB_PORT;
  const rawApiUrl = process.env.EXPO_PUBLIC_API_URL;

  console.log('[realtime] envs', {
    key: key ?? '(missing)',
    host: host ?? '(missing)',
    scheme: rawScheme ?? '(default https)',
    port: rawPort ?? '(default per scheme)',
    apiUrl: rawApiUrl ?? '(missing)',
    jwtPresent: Boolean(jwt),
  });

  if (!key || !host) {
    console.warn(
      '[realtime] cliente Echo NO creado: falta EXPO_PUBLIC_REVERB_APP_KEY o EXPO_PUBLIC_REVERB_HOST. La app cae a polling.',
    );
    return null;
  }

  const scheme = rawScheme ?? 'https';
  const port = Number(rawPort ?? (scheme === 'https' ? 443 : 8080));
  const apiBase = rawApiUrl?.replace(/\/api\/v1\/?$/, '') ?? '';
  const authEndpoint = `${apiBase}/broadcasting/auth`;

  console.log('[realtime] conectando', {
    wsHost: host,
    wsPort: port,
    scheme,
    forceTLS: scheme === 'https',
    authEndpoint,
  });

  try {
    // Dynamic require: evita que Metro falle si los paquetes aún no están instalados.
    // Los paquetes exponen la clase de formas distintas según su bundle (CJS con
    // .default, ESM interop, o UMD con export nombrado), así que probamos las
    // tres alternativas en orden.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const echoModule = require('laravel-echo') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Echo: any = echoModule?.default ?? echoModule?.Echo ?? echoModule;

    // Sin subpath: Metro resuelve al bundle `react-native` de pusher-js via el
    // campo "react-native" del package.json. `pusher-js/react-native` como
    // subpath no existe en v8.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const pusherModule = require('pusher-js') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Pusher: any = pusherModule?.Pusher ?? pusherModule?.default ?? pusherModule;

    if (typeof Echo !== 'function') {
      console.warn('[realtime] laravel-echo no expuso una clase — export shape inesperado:', Object.keys(echoModule ?? {}));
      return null;
    }
    if (typeof Pusher !== 'function') {
      console.warn('[realtime] pusher-js no expuso una clase — export shape inesperado:', Object.keys(pusherModule ?? {}));
      return null;
    }

    // Log detallado del transporte Pusher — hace visibles handshake, ping/pong,
    // 4xxx codes de cierre, etc. Solo en dev.
    if (__DEV__) {
      Pusher.logToConsole = true;
    }

    // laravel-echo requiere Pusher expuesto globalmente cuando broadcaster='reverb'
    // (mismo patrón que el admin web).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Pusher = Pusher;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const echo: any = new Echo({
      broadcaster: 'reverb',
      key,
      wsHost: host,
      wsPort: port,
      wssPort: port,
      forceTLS: scheme === 'https',
      enabledTransports: scheme === 'https' ? ['wss'] : ['ws', 'wss'],
      disableStats: true,
      authEndpoint,
      auth: {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/json',
        },
      },
    });

    // Hooks al connector Pusher: nos dicen cuándo abre/cae/reintenta el WS.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pusher = echo.connector?.pusher;
    if (pusher?.connection) {
      pusher.connection.bind('state_change', (states: { previous: string; current: string }) => {
        console.log('[realtime] state', states.previous, '->', states.current);
      });
      pusher.connection.bind('connected', () => {
        console.log('[realtime] CONECTADO — socket_id:', pusher.connection.socket_id);
      });
      pusher.connection.bind('error', (err: unknown) => {
        console.warn('[realtime] error de conexión', err);
      });
      pusher.connection.bind('unavailable', () => {
        console.warn('[realtime] WS unavailable — chequeá que reverb:start esté corriendo y que el host/puerto sean alcanzables desde el device.');
      });
      pusher.connection.bind('failed', () => {
        console.warn('[realtime] WS failed — el transport no está disponible.');
      });
      pusher.connection.bind('disconnected', () => {
        console.log('[realtime] desconectado');
      });
    } else {
      console.warn('[realtime] echo.connector.pusher no expuesto — no puedo enganchar logs de estado.');
    }

    return echo;
  } catch (err) {
    console.warn('[realtime] excepción creando Echo:', err);
    return null;
  }
}
