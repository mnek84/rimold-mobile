module.exports = ({ config }) => {
  const androidConfig = config.android?.config ?? {};
  const apiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

  // react-native-maps 1.29 arrastra WorkManager 2.9.1 y Room 2.5.0. En el
  // release de SDK 58, R8 (AGP 9, full mode) borra el constructor sin
  // argumentos que WorkManager instancia por reflexión. El proceso muere en
  // InitializationProvider, antes de que arranque React. Hay que conservar
  // esos constructores; si no, el APK se abre y se cierra.
  const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
  plugins.push([
    'expo-build-properties',
    {
      android: {
        extraProguardRules: [
          '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
          '-keep class * extends androidx.work.InputMerger { <init>(); }',
        ].join('\n'),
      },
    },
  ]);

  return {
    ...config,
    plugins,
    android: {
      ...config.android,
      config: {
        ...androidConfig,
        ...(apiKey
          ? { googleMaps: { ...(androidConfig.googleMaps ?? {}), apiKey } }
          : {}),
      },
    },
  };
};
