module.exports = {
  parser: 'babel-eslint',
  extends: ['fbjs'],
  globals: {
    waitsForPromise: false,
    atom: false,
    advanceClock: false,
    ffit: false,
    fffit: false,
    ffdescribe: false,
    fffdescribe: false,
  }
};
