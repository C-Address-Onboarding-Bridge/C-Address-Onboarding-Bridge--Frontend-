# User-Facing Status and Incident Visibility

This document explains how the C-Address Bridge surfaces service health and incident status to users (#498).

## Overview

When the API is degraded or dependencies are unhealthy, users need to know:
1. That there's a problem (not blaming their wallet or network)
2. Which parts of the service are affected
3. When it recovers

The status system automatically polls the API health endpoint and shows contextual errors based on what actually failed.

## Architecture

### Components

1. **API Client** (`src/lib/api.ts`) — Fetches health status and classifies errors
2. **Health Hook** (`src/hooks/useHealthStatus.ts`) — Polls at regular intervals
3. **Status Banner** (`src/components/status-banner.tsx`) — Displays user-facing messages
4. **Error Classification** — Distinguishes service, wallet, network, and user errors

### Health Endpoint

The backend exposes a health check at:

```
GET /health
```

Response format:

```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2026-08-27T12:00:00Z",
  "services": {
    "horizon": "up" | "down" | "degraded",
    "soroban_rpc": "up" | "down" | "degraded",
    "api": "up" | "down" | "degraded"
  },
  "circuitBreakers": {
    "transaction_submission": {
      "state": "closed" | "open" | "half-open",
      "failures": 5,
      "lastFailure": "2026-08-27T11:55:00Z"
    }
  }
}
```

## User-Facing Behavior

### Status Banner

A banner at the top of the page shows:

- **Degraded service:** Yellow banner with "Service Degradation" heading and affected services
- **Unhealthy service:** Red banner with "Service Unavailable" heading
- **Recovered:** Banner automatically dismisses after 5 seconds of stable health

### Banner Messaging

Contextual messages based on which services are down:

- **Horizon down:** "Network service is experiencing issues"
- **Soroban RPC down:** "Smart contract service is experiencing issues"
- **Circuit breaker open:** "Submissions are temporarily paused for safety"

### Error Classification

When an operation fails, the error message differs by cause:

**Service Error:**
```
"Service is experiencing issues. Please try again soon."
```
Shown when timeouts, connection errors, or network issues occur during degradation.

**Wallet Error:**
```
"Please check your wallet connection and try again."
```
Shown for wallet-related failures (not connected, signature rejected, etc).

**Network Error:**
```
"Network issue detected. Please check your connection."
```
Shown for network connectivity problems.

**User Error:**
```
"Invalid address" / "Insufficient balance" / etc.
```
Shown for validation failures (user's problem, not service problem).

## Implementation

### Polling Strategy

The health hook:
1. Starts polling 2 seconds after page load (avoids startup noise)
2. Polls every 30 seconds during normal operation
3. Automatically stops on unmount (no leak)
4. Retains degraded status for 5 seconds after recovery (prevents flashing)

### Transient Blips

To avoid alarming users with brief outages:
- A single failed health check doesn't show the banner immediately
- The banner appears when the API returns `degraded` or `unhealthy` status
- Once shown, the banner remains for 5 seconds even after recovery
- This filters out transient failures while remaining responsive to real incidents

### Configuration

In `src/hooks/useHealthStatus.ts`:

```typescript
const DEFAULT_POLL_INTERVAL = 30000; // 30 seconds
const DEFAULT_INITIAL_DELAY = 2000; // 2 seconds before first poll
const DEFAULT_RETAIN_TIME = 5000; // Keep banner for 5 seconds after recovery
```

Adjust these for different detection/response times:
- **Faster detection:** Lower `DEFAULT_INITIAL_DELAY` and `DEFAULT_POLL_INTERVAL`
- **Less flashing:** Raise `DEFAULT_RETAIN_TIME`

## Usage

### In Components

The status is available everywhere via the hook:

```typescript
import { useHealthStatus } from '@/hooks/useHealthStatus';
import { classifyError } from '@/lib/api';

export function MyComponent() {
  const { health, isDegraded } = useHealthStatus();

  try {
    // ... API call
  } catch (error) {
    const classified = classifyError(error, health);
    showError(classified.message); // User-friendly message
  }

  if (isDegraded) {
    return <div>Service is slow right now...</div>;
  }
}
```

### In Error Messages

Always use the `classifyError` utility:

```typescript
import { classifyError } from '@/lib/api';
import { useHealthStatus } from '@/hooks/useHealthStatus';

const { health } = useHealthStatus();

try {
  await submitTransaction();
} catch (error) {
  const { type, message } = classifyError(error, health);
  // type: 'service' | 'wallet' | 'network' | 'user' | 'unknown'
  // message: user-friendly explanation
}
```

## Testing

### Manual Testing

1. **Simulate degraded service:**
   ```bash
   # In browser console:
   window.__MOCK_HEALTH__ = {
     status: 'degraded',
     services: { horizon: 'degraded', soroban_rpc: 'up', api: 'up' }
   };
   ```

2. **Test banner dismissal:**
   - Trigger degradation, see yellow banner
   - Click X to dismiss
   - Wait 5 seconds for auto-recovery
   - Banner should stay gone until next poll shows degradation

3. **Test error messages:**
   - Trigger different error types (timeout, invalid address, etc.)
   - Verify message matches error cause

### Automated Tests

The `useHealthStatus` hook has comprehensive tests in `src/__tests__/useHealthStatus.test.ts`:

- Detects degraded and unhealthy states
- Retains status after recovery
- Handles fetch errors as degraded
- Respects poll interval and initial delay
- Cleans up timers on unmount
- Allows manual refetch

Run tests:

```bash
npm run test -- useHealthStatus.test.ts
```

## Monitoring

To observe health status in production:

1. **Browser DevTools Console:**
   ```javascript
   // Check latest health status
   window.__HEALTH_STATUS__
   
   // Manually refetch
   window.__HEALTH_REFETCH__()
   ```

2. **Network Tab:**
   Look for `GET /health` requests every 30 seconds

3. **Analytics:**
   Track `isDegraded` events in your analytics tool

4. **Logs:**
   Health status changes are logged to console in development

## Future Improvements

- [ ] Per-feature status (wallet connectivity, transaction submission, etc.)
- [ ] Countdown timers ("maintenance window ends in...")
- [ ] Status page link ("Learn more" → status.example.com)
- [ ] Different banners for scheduled maintenance vs. incidents
- [ ] Persistent storage of recent incidents (for post-mortem)

