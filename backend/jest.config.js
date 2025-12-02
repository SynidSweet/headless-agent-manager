module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/src'],
  testMatch: [
    '**/*.spec.ts',
    '**/*.integration.spec.ts',
    '**/*.e2e.spec.ts',
    '**/*.smoke.spec.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    // Exclude smoke tests from regular test runs
    // Run them explicitly with: npm run test:smoke
    ...(process.env.SMOKE_TESTS !== 'true' ? ['test/e2e/smoke'] : [])
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@application/(.*)$': '<rootDir>/src/application/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@presentation/(.*)$': '<rootDir>/src/presentation/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
    '!src/**/*.port.ts',
    '!src/main.ts',
    '!src/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 64,
      functions: 78,
      lines: 84,
      statements: 84
    },
    './src/domain/': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 10000,
  verbose: true,
  // Run tests serially to avoid database conflicts in integration tests
  // Set TEST_PARALLEL=true to enable parallel execution for faster unit tests
  maxWorkers: process.env.TEST_PARALLEL === 'true' ? undefined : 1
};
