/**
 * Test configuration
 * Contains test credentials and common settings
 */

export const testConfig = {
  baseUrl: 'http://localhost:3000',
  testUser: {
    email: 'claude-test@snapsonic.test',
    password: 'testpass123'
  },
  timeouts: {
    navigation: 15000,
    element: 10000,
    poll: 5000
  }
};
