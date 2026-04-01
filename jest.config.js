module.exports = {
  projects: [
    {
      displayName: 'utils',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/utils.test.js'],
    },
    {
      displayName: 'content',
      testEnvironment: 'jsdom',
      testEnvironmentOptions: {
        url: 'https://example.com',
      },
      testMatch: ['**/__tests__/content.test.js'],
    },
  ],
};
