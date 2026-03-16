/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  // Stub out React Native modules that the pure-utility modules don't actually use
  // at runtime, but whose import of "react-native" would otherwise fail in Node.
  moduleNameMapper: {
    "^react-native$": "<rootDir>/__mocks__/react-native.js",
    "^react-native/(.*)$": "<rootDir>/__mocks__/react-native.js",
  },
};
