/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lessons'],
  testMatch: ['**/*.test.ts', '**/*.test.js'],
  // webhook-template is a separate project with its own package.json and Jest setup
  testPathIgnorePatterns: ['/node_modules/', '/webhook-template/'],
  modulePathIgnorePatterns: ['/webhook-template/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['dotenv/config'],
};
