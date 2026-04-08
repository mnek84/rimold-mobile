module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@core': './src/core',
            '@modules': './src/modules',
            '@navigation': './src/navigation',
            '@components': './src/components',
            '@store': './src/store',
            '@hooks': './src/hooks',
            '@theme': './src/theme',
          },
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
