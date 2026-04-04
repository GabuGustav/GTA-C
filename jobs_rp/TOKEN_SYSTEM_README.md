# JobsRP Secure Dual-Token Authentication System

## Overview

This implementation adds a secure dual-token authentication system to JobsRP, providing automatic login convenience during development while maintaining strong security measures.

## Architecture

### Token Types

1. **Server Token** (`SRV-xxxx`)
   - Generated per server session
   - Sent to clients on join
   - Used to identify the current server session

2. **Session Token** (`SES-xxxx`)
   - Short-lived (2 hours default, 24 hours in dev mode)
   - Bound to IP address and device fingerprint
   - Used for fast authentication within current session

3. **Refresh Token** (`REF-xxxx`)
   - Long-lived (7 days default, 30 days in dev mode)
   - Bound to device fingerprint
   - Used to generate new session tokens

### Security Features

- **Device Fingerprinting**: Tokens bound to IP + name + index combination
- **IP Binding**: Session tokens validate client IP address
- **Expiration**: Both token types have configurable expiration times
- **Rate Limiting**: Refresh token attempts limited to 5 per minute per IP
- **Token Cleanup**: Automatic cleanup of expired tokens every 5 minutes
- **Secure Storage**: Tokens stored in encrypted client-side JSON file

## File Structure

### Server-Side (`auth.lua`)
- Token generation and validation
- Device fingerprinting
- Rate limiting
- Session management
- Network handlers

### Client-Side (`auth_ui.js`)
- Token storage in `jobs_auth_tokens.json`
- Auto-login attempts
- Network event handlers
- Token expiration checking

### Configuration (`auth_tokens_config.lua`)
- Token lifetime settings
- Development vs production modes
- Security parameters
- Debug options

## Usage

### For Development

1. Enable development mode in config:
   ```lua
   JobsRP.Config.auth_development_mode = true
   ```

2. This gives you:
   - 24-hour session tokens
   - 30-day refresh tokens
   - No IP binding (for convenience)

### For Production

1. Keep development mode disabled (default)
2. This provides:
   - 2-hour session tokens
   - 7-day refresh tokens
   - IP binding enabled
   - Full rate limiting

## How It Works

### First Login
1. User registers/logs in normally
2. Server generates session + refresh tokens
3. Client stores tokens in `jobs_auth_tokens.json`
4. User authenticated immediately

### Subsequent Joins
1. Client receives server token on join
2. Client attempts auto-login with stored tokens
3. Server validates tokens and fingerprints
4. User authenticated automatically (if tokens valid)

### Token Refresh
1. When session token expires, refresh token used
2. Server generates new session token
3. Client updates stored tokens
4. User stays authenticated

## Security Considerations

### What's Secure
- **Per-session server tokens** (prevents replay attacks)
- **Device fingerprinting** (prevents token theft)
- **IP binding** (prevents token sharing)
- **Rate limiting** (prevents token abuse)
- **Expiration** (limits token lifetime)
- **Automatic cleanup** (prevents token accumulation)

### Remaining Risks
- **Client-side storage** (tokens can be extracted from client machine)
- **No encryption** (tokens stored in plaintext JSON)
- **Device fingerprint** (can be spoofed with same IP/name/index)

## Configuration Options

```lua
-- Enable/disable token system
JobsRP.Config.auth_tokens_enabled = true

-- Token lifetimes
JobsRP.Config.auth_session_token_expire_sec = 7200  -- 2 hours
JobsRP.Config.auth_refresh_token_expire_sec = 604800 -- 7 days

-- Security settings
JobsRP.Config.auth_session_token_bind_ip = true
JobsRP.Config.auth_token_refresh_rate_limit = 5
JobsRP.Config.auth_token_refresh_window_sec = 60

-- Development mode
JobsRP.Config.auth_development_mode = false
```

## Network Events

### Server → Client
- `jobs.authServerToken` - Server token on join
- `jobs.authTokens` - Full token set after login
- `jobs.authSessionToken` - New session token after refresh

### Client → Server
- `jobs.authWithTokens` - Auto-login attempt
- `jobs.authRequestTokens` - Request token refresh

## Files Modified

### Server
- `resources/jobs_rp/server/auth.lua` - Core token system

### Client
- `resources/jobs_rp/client/auth_ui.js` - Token storage and auto-login

### New Files
- `resources/jobs_rp/auth_tokens_config.lua` - Configuration
- `resources/jobs_rp/TOKEN_SYSTEM_README.md` - This documentation

## Troubleshooting

### Auto-login Not Working
1. Check `jobs_auth_tokens.json` exists and has valid tokens
2. Verify server token is received (check console logs)
3. Ensure device fingerprint matches (same IP, name, index)

### Tokens Expired
1. Session tokens expire every 2 hours (24h in dev)
2. Refresh tokens expire every 7 days (30 days in dev)
3. Re-login to generate new tokens

### Rate Limiting
1. Max 5 refresh attempts per minute per IP
2. Wait for rate limit window to reset
3. Check configuration for custom limits

## Migration Notes

This system is **additive** - it doesn't break existing authentication:
- Existing login/register commands work unchanged
- Traditional password authentication still available
- Tokens are only generated after successful login/register
- Users can opt out by deleting `jobs_auth_tokens.json`

## Future Improvements

1. **Token Encryption**: Encrypt stored tokens with device-specific key
2. **Hardware Fingerprinting**: Add hardware ID to fingerprint
3. **Token Revocation**: Admin command to revoke specific tokens
4. **Audit Logging**: Log all token authentication attempts
5. **Web Integration**: Sync tokens with web authentication system
