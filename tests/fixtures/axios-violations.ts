/**
 * Test fixture containing KNOWN axios violations
 *
 * This file demonstrates code that violates behavioral contracts.
 * The analyzer should detect these violations.
 */

import axios from 'axios';

// VIOLATION: No error handling at all
// Should detect: missing try-catch for network failures
export async function noErrorHandling() {
  const response = await axios.get('https://api.example.com/data');
  return response.data;
}

// VIOLATION: Generic catch that doesn't check error.response exists
// Should detect: accessing error.response.status without checking if error.response exists
export async function unsafeErrorAccess() {
  try {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  } catch (error: any) {
    // This will crash on network errors where error.response is undefined
    console.log('Error status:', error.response.status);
    throw error;
  }
}

// VIOLATION: Catches 429 but ignores it
// Should detect: 429 status code not explicitly handled
export async function ignoresRateLimiting() {
  try {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  } catch (error: any) {
    // Generic catch - no 429 handling
    console.error('Request failed:', error.message);
    return null;
  }
}

// VIOLATION: Checks status but doesn't handle 429 specifically
// Should detect: 429 not in handled status codes and no retry logic
export async function handlesErrorsButNot429() {
  try {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  } catch (error: any) {
    if (error.response) {
      if (error.response.status === 404) {
        return null; // OK, handles 404
      }
      if (error.response.status >= 500) {
        throw new Error('Server error'); // OK, handles 5xx
      }
      // But what about 429? Falls through
    }
    throw error;
  }
}

// VIOLATION: POST without idempotency consideration for retries
// Should detect: POST with retry logic but no idempotency handling
export async function postWithNaiveRetry(data: any) {
  let attempts = 0;
  while (attempts < 3) {
    try {
      const response = await axios.post('https://api.example.com/items', data);
      return response.data;
    } catch (error: any) {
      attempts++;
      if (attempts >= 3) throw error;
      // Retrying POST without idempotency key - can create duplicates
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// VIOLATION: Network error not distinguished from HTTP error
// Should detect: doesn't check error.response exists
export async function doesNotDistinguishNetworkErrors() {
  try {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  } catch (error: any) {
    // Assumes all errors have response property
    if (error.response.status >= 500) {
      console.log('Server error');
    } else {
      console.log('Client error');
    }
    // Network errors will crash here
    throw error;
  }
}

// VIOLATION: Multiple calls, no error handling
// Should detect: multiple violations in same function
export async function multipleViolations() {
  const users = await axios.get('/api/users');
  const posts = await axios.post('/api/posts', { title: 'Test' });
  const settings = await axios.get('/api/settings');

  return { users: users.data, posts: posts.data, settings: settings.data };
}

// VIOLATION: Swallows all errors
// Should detect: catch block doesn't actually handle errors
export async function swallowsErrors() {
  try {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  } catch (error) {
    // Silent failure - just returns null
    return null;
  }
}
