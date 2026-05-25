module.exports = {
  projects: [
    {
      displayName: 'utils',
      testEnvironment: 'node',
      testMatch: ['**/tests/utils.test.js'],
    },
    {
      displayName: 'content',
      testEnvironment: 'jsdom',
      testEnvironmentOptions: {
        url: 'https://example.com',
      },
      testMatch: ['**/tests/content.test.js'],
    },
  ],
};
