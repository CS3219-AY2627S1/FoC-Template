# Timestamp: 2026-10-13

# Key Prompt:

I have already defined the Errand creation UI, validation rules, credit-estimation interaction, and notification update flow. Help me scaffold and draft these changes inside the existing `CreateErrandCard` component and `useErrandNotifications` hook. Keep the current component boundaries, shared UI controls, contracts, and callback interfaces.

CREATE ERRAND CARD

- Load Suppliers through the supplied Supplier API. When a Supplier is selected, select its first supported service type by default and copy the Supplier's location into the pickup fields.
- The form contains name, Supplier, service type, pickup and target locations, description, optional instructions, reward credits, start time, and deadline.
- Set the default start time to the current time and the default deadline to two hours later.
- Name is required and limited to 200 characters. Description is required and limited to 5,000 characters. Instructions are optional and limited to 5,000 characters.
- Reward credits must be a whole number that is 0 or more. Start time must be valid and the deadline must be in the future and after the start time.
- The selected service type must be offered by the selected Supplier. If the Supplier changes, reset the service type to the first type offered by that Supplier.
- Show field errors for the invalid inputs and do not submit if there are errors.
- Submit the existing `CreateErrandRequest` using the supplied Errand API. Keep the existing loading state, error handling, close callback, and successful creation callback.

# Key Prompt 2:

You are now integrating the Credit Estimation Service with the Errand creation form. The frontend should call the Errand backend, which will call the Credit Estimation backend. Do not call the Credit Estimation Service directly from the browser.

- Require an authenticated user and a loaded available credit balance before allowing estimation.
- Require name, description, service type, valid start time, and a future deadline before sending the request.
- Send name, description, service type, trimmed instructions, ISO start time, ISO deadline, and available credit to `POST /api/errands/estimate-credit`.
- Display the returned minimum and maximum credits and the reason.
- If `minCredits = -1` and `maxCredits = -1`, show that the errand cannot be estimated and do not use the response to fill the reward credits.
- If the available balance is below the minimum estimate, show `You have _ credits; the suggested minimum is _ credits.`
- If the suggested credits are within the user's available balance, allow the suggested value to fill the reward credit field. Do not put a value above the available balance into the field.
- Show separate states for rate limited, invalid, and unavailable estimation responses. If estimation is unavailable, the user must still be able to enter the reward credits manually.

# Key Prompt 3:

You are now implementing the frontend Errand notification hook using the existing Errand Notification Service SSE endpoint.

- Keep one authenticated `EventSource` connected to `/api/notifications/stream` and close it when the user changes or the hook is cleaned up.
- Keep the latest callback values in a ref so that the stream does not reconnect whenever a callback changes.
- Refetch the Errand list when the stream opens.
- Parse the SSE message as an `ErrandNotification`. Ignore comments, malformed JSON, and payloads that do not match the contract.
- Deduplicate notifications using `eventId`.
- For every valid notification, update the local notification state and refetch the Errand list.
- For `ERRAND_STATUS_CHANGED`, also refetch the details for that Errand.
- Let the browser `EventSource` handle reconnection. Do not add a separate retry loop.

Please implement the above using the existing React state, effects, contracts, API props, and shared components. Do not introduce a new state-management library, service contract, component architecture, or user flow.

# Usage Scenario:

Drafted the author-defined Errand creation, estimation, validation, and frontend SSE update behaviour inside the existing component and hook, then assisted with integration debugging.
