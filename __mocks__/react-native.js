// Minimal React Native mock for Jest (Node environment).
// Only the symbols actually used by the lib/ pure-utility files are stubbed.
module.exports = {
  Platform: {
    OS: "ios",
    select: (obj) => obj.ios ?? obj.default ?? Object.values(obj)[0],
  },
  Linking: {
    openURL: () => Promise.resolve(),
  },
};
