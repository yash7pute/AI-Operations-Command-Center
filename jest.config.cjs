module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts','**/tests/**/*.spec.ts','**/tests/**/*.ts','**/tests/**/?(*.)+(spec|test).ts','**/tests/**/?(*.)+(spec|test).tsx','**/tests/**/?(*.)+(spec|test).js'],
  rootDir: '.',
  verbose: true,
  collectCoverage: false,
};
