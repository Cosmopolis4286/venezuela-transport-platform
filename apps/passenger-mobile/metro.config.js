// Expo's default Metro config detects the pnpm workspace automatically
// (watchFolders + nodeModulesPaths), so no manual monorepo wiring is needed.
// Customise here only when a concrete need appears.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
