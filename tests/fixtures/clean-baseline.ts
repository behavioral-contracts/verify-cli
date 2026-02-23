/**
 * Test fixture with CORRECT axios usage
 *
 * This file demonstrates code that properly handles all behavioral contracts.
 * The analyzer should produce ZERO violations for this file.
 */

import axios, { AxiosError } from 'axios';

// CORRECT: Proper error handling with response existence check
export async function properErrorHandling() {
  try {
    const response = await axios.get('https://api.example.com/data', {
      timeout: 5000, // Good practice: explicit timeout
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Check if response exists (network errors don't have response)
      if (error.response) {
        console.error('HTTP error:', error.response.status);
      } else if (error.request) {
        console.error('Network error: no response received');
      } else {
        console.error('Request setup error:', error.message);
      }
    }
    throw error;
  }
}

// CORRECT: Explicit 429 handling with retry logic
export async function handles429WithRetry() {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.get('https://api.example.com/data');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Explicitly handle rate limiting
        if (error.response?.status === 429) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error('Rate limit exceeded after retries');
          }

          // Exponential backoff
          const delayMs = Math.pow(2, attempts) * 1000;
          console.log(`Rate limited, retrying in ${delayMs}ms`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        // Handle other errors
        if (error.response) {
          throw new Error(`HTTP ${error.response.status}: ${error.message}`);
        } else {
          throw new Error(`Network error: ${error.message}`);
        }
      }
      throw error;
    }
  }

  throw new Error('Max retry attempts reached');
}

// CORRECT: 429 handled as terminal error (no retry)
export async function handles429AsTerminalError() {
  try {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      // Explicitly handle 429 as a terminal error
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    // Handle other errors
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Request failed with status ${error.response.status}`);
    }

    throw error;
  }
}

// CORRECT: Using optional chaining for safe access
export async function safeErrorAccessWithOptionalChaining() {
  try {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Safe: uses optional chaining
      const status = error.response?.status;
      const data = error.response?.data;

      console.error('Error:', { status, data, message: error.message });
    }
    throw error;
  }
}

// CORRECT: POST with idempotency key for safe retries
export async function postWithIdempotencyKey(data: any, idempotencyKey: string) {
  try {
    const response = await axios.post(
      'https://api.example.com/items',
      data,
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error('Rate limited - please retry later');
      }

      if (error.response) {
        throw new Error(`HTTP ${error.response.status}`);
      }

      throw new Error('Network error');
    }
    throw error;
  }
}

// CORRECT: Comprehensive error categorization
export async function comprehensiveErrorHandling() {
  try {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      throw error; // Not an axios error
    }

    // Network errors (no response)
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout');
      }
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Network error - check connectivity');
      }
      throw new Error('Request failed without response');
    }

    // HTTP errors (has response)
    const status = error.response.status;

    if (status === 429) {
      throw new Error('Rate limited');
    }

    if (status >= 400 && status < 500) {
      throw new Error(`Client error: ${status}`);
    }

    if (status >= 500) {
      throw new Error(`Server error: ${status}`);
    }

    throw error;
  }
}

// CORRECT: Multiple calls with proper error handling
export async function multipleCallsWithProperHandling() {
  try {
    const [usersResponse, settingsResponse] = await Promise.all([
      axios.get('/api/users'),
      axios.get('/api/settings'),
    ]);

    return {
      users: usersResponse.data,
      settings: settingsResponse.data,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error('Rate limited on batch request');
      }

      if (error.response) {
        throw new Error(`Batch request failed: HTTP ${error.response.status}`);
      }

      throw new Error('Network error in batch request');
    }
    throw error;
  }
}

// CORRECT: Using axios error type guard
export async function withTypeGuard() {
  try {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (axios.isAxiosError(error)) {
        // Type-safe access to axios error properties
        const status = error.response?.status;
        const message = error.message;

        if (status === 429) {
          throw new Error('Rate limited');
        }

        if (status) {
          throw new Error(`HTTP error ${status}: ${message}`);
        }

        throw new Error(`Network error: ${message}`);
      }
    }
    throw error;
  }
}
