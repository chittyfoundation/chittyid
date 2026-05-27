/**
 * Debug script to test request interceptor behavior
 */

import { createRequestInterceptor } from './src/middleware/request-interceptor.js';

// Mock environment
const mockEnv = {
  AUTH_CACHE: {
    get: async () => null,
    put: async () => {},
    delete: async () => {}
  }
};

const interceptor = createRequestInterceptor(mockEnv);

// Test URLs and headers that should be blocked
const testUrls = [
  '/api/user/generate-id',
  '/some/path/generate',
  '/api/get-chittyid?bypass=true',
  '/api/get-chittyid?skip-pipeline=yes'
];

const testHeaders = [
  { 'X-Bypass-Pipeline': 'true' },
  { 'X-Direct-Access': 'allow' },
  { 'X-Emergency-Generate': 'true' },
  { 'X-Force-Generate': 'yes' }
];

console.log('🔍 Testing Request Interceptor...\n');

// Test URLs
for (const url of testUrls) {
  const request = new Request(`https://id.chitty.cc${url}`);
  const result = await interceptor(request);

  console.log(`URL: ${url}`);
  console.log(`Result: ${result ? 'BLOCKED' : 'ALLOWED'}`);
  if (result) {
    console.log(`Status: ${result.status}`);
    const body = await result.json();
    console.log(`Reason: ${body.reason}`);
  }
  console.log('---');
}

// Test headers
for (const headers of testHeaders) {
  const request = new Request('https://id.chitty.cc/api/get-chittyid', {
    method: 'GET',
    headers
  });
  const result = await interceptor(request);

  console.log(`Headers: ${JSON.stringify(headers)}`);
  console.log(`Result: ${result ? 'BLOCKED' : 'ALLOWED'}`);
  if (result) {
    console.log(`Status: ${result.status}`);
    const body = await result.json();
    console.log(`Reason: ${body.reason}`);
  }
  console.log('---');
}