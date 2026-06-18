module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['server.js'],
  coverageThreshold: {
    global: {
      statements: 100,
      functions: 100,
      lines: 100,
    },
  },
  forceExit: true,
  maxWorkers: 1,
  testSequencer: './test/testSequencer.js',
};
