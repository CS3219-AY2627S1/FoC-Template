# Timestamp: 2026-11-03

# Key Prompt:

The Credit Estimation implementation is complete. Using the existing implementation and as the source of truth, help me draft tests for:

- request validation
- missing baselines
- estimation flow
- adjustment of min/max credits based on time and available balance
- estimation response max string limits
- environment parsing
- rate limiting. Do not change the implementation or invent new estimation rules.

Specifically, draft tests for the following:

- Test required user identity, name, description, service type, start time, and deadline.
- Test the exact 200-character name and 5,000-character description/instruction limits, including valid boundary values and rejected oversized values.
- Accept zero and fractional non-negative available-credit balances but reject negative, non-numeric values.
- Reject a deadline before the selected start, equal to the effective start, or already in the past.
- Verify that every shared Supplier service type has a baseline and that a clear error identifies any missing type.
- Verify the configured global rate limit and its default of 300 requests per minute, including fallback for invalid configuration.
- Return service unavailable when no provider client is configured or when the provider fails generically.
- Ensure that provider failures, timeouts, malformed responses, and missing provider configuration produce service unavailable. A rate-limit decision produces 429 error.
- If a `-1/-1` estimator result is provided, preserve it without applying time or balance adjustments.
- Errand availability is calculated from the later of the selected start and the current time. Verify that the time adjustment formula is applied correctly, including the +40% and -30% caps. "Errand Availability section contains more details.
- If available credits fall between minimum and maximum, cap at the available credits. If balance is below the minimum, keep the fair range so the UI can warn the user.
- Verify the explanation string is truncated at a clause or word boundary to fit within 160 characters

Errand Availability

- An availability window within the standard range should not produce any adjustment.
- Being half the standard range should increases credits by 20% of the baseline base value.
- Being twice the standard range should reduce credits by 20% of the baseline base value.
- Both extremes should be capped at +40% and -30% of the baseline base value.
- If the selected start is in the past, calculate from the current time. Reject if deadline is before the effective start.

RATE-LIMITER TESTS

- For the local sliding window, allow requests up to the configured maximum, reject the next request, remove expired entries, reset after the window, and report remaining requests and next reset time.
- For the Redis limiter, allow requests up to the configured maximum, reject the next request, remove expired entries, reset after the window, and report remaining requests and next reset time.
- Test user-limit rejection, global-limit rejection, malformed Redis responses, and Redis failure.
- Use controlled clocks and a mocked Redis client.

TEST SETUP AND EXCLUSIONS

- Use the existing Vitest configuration and shared environment setup.
- Mock the provider client and Redis only at their existing interfaces. Assert public results, defined errors, and meaningful dependency inputs.
- Do not change baselines, formulas, limits, reason text, environment defaults, contracts, or production code to satisfy generated tests.

# Usage Scenario:

Generated and debugged tests for the author-defined Credit Estimation validation, baselines, orchestration, time and balance adjustment, explanation limits, configuration, and local and Redis rate limiting.
