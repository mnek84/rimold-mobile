module.exports = ({ config }) => {
  const androidConfig = config.android?.config ?? {};
  const apiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

  return {
    ...config,
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
