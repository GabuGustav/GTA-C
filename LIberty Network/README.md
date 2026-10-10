# Liberty Network RP

A fresh, ground-up Roleplay system for the **Liberty Network** GTA IV server
(GTAC-Server-Win64). Built as a clean alternative to the older `jobs_rp` /
`JobsRPOG` resources.

## Folder layout

```
LIberty Network/
├── Configs/
│   └── config.json      # Server-side config (deep-merged over defaults)
├── Core/
│   ├── Client/
│   │   └── Init.js      # Client bootstrap + server<->client bridge (ln:greet)
│   └── Server/
│       └── Init.js      # Server bootstrap: config, player tracking, greeting
└── meta.xml             # Declares the server + client core scripts
```

## Configuring & enabling

Add the resource to `server.xml`:

```xml
<resource src="LIberty Network" />
```

Everything is under the `LN` global namespace on both server and client.

## Phase 1 - foundation (implemented)

- Resource skeleton that boots cleanly on server + client.
- `LN.loadConfig()` - server-side `Configs/config.json` deep-merged over defaults.
- Battle-tested player join/quit tracking by diffing `getClients()`
  (see `resources/CustomSync` for the reference pattern).
- Working server -> client bridge (`ln:greet`) and client -> server helpers
  (`LN.sendToClient` / `LN.broadcast`).
- `/help` command and GTA IV spawn + camera-fade once authenticated.

## Phase 2 - central Authorization & Account Service (implemented)

A reusable auth foundation decoupled from gameplay. One account can be used
across multiple GTA Connected RP servers.

```
Core/Server/Auth/
  Util.js       LN.U        encoders, secure RNG, const-time compare, deepMerge
  Hash.js       LN.Crypto   pure-JS SHA-256, HMAC-SHA256, PBKDF2 (verified vs vectors)
  Store.js      LN.Store    JSON persistence under data/
  Throttle.js   LN.Auth.Throttle    brute-force lockout (account + IP)
  Accounts.js   LN.Auth.Accounts    registration, hashing/verify, roles/bans
  Characters.js LN.Characters       multi-characters (separate data file)
  Sessions.js   LN.Auth.Sessions    device sessions, token rotation, revocation
  Service.js    LN.Auth.Service     orchestration, security log, RP-server tickets
  Network.js    LN.Auth.Network     event + command handlers
  API.js        LN.Auth.API         exportFunction() API for RP servers
Core/Client/Auth/Init.js   client token store + auto session restore
data/ account.json, characters.json, sessions.json, devices.json, security_log.json
```

### Security posture
- Passwords hashed with **PBKDF2-HMAC-SHA256** (per-account random salt, 60k iters).
  The old `jobs_rp` "hash" (`len*31 + first byte`) was broken and is NOT used.
- **Never plaintext**: `data/accounts.json` stores only `{alg, iterations, salt, hash}`.
- Access + refresh tokens are opaque; only their **SHA-256 hashes** are stored.
  Raw tokens return to the client once. Refresh tokens **rotate** on every use.
- Devices tracked per account; sessions revocable individually or all-at-once.
- Brute-force protection (per account + per IP) plus a security event log that
  never records passwords or raw tokens.
- RP servers receive a **single-use, short-lived ticket** exchanged for verified
  identity (`{authenticated, accountId, roles, permissions, sessionValid, banned,
  characterIds}`) - no password, no tokens. Character selection happens later in
  the RP layer; characters are stored separately from credentials.

### Commands (server-side handlers)
`/register <user> <pass> [email]` · `/login <user> <pass>` · `/logout` ·
`/logoutall` (console/admin only) · `/sessions` · `/revoke <sessionId>` · `/help`

### Getting started (player experience)
1. Join. Server keeps you unspawned (camera faded) until you authenticate.
2. First time: `/register name password` (or `/login` if you have an account).
3. Returning players sign in again. The GTAC API exposes ordinary file I/O but
   no verified secure credential store, so Liberty Network never writes
   long-lived bearer tokens to the client disk.
4. A default character is created for you; character selection/spawning is the
   next phase's job.

### RP-server integration (later phase / other resources)
```js
// After the client is authenticated, request a one-time handoff ticket:
var t = call("LIberty Network", "ln_auth_issueTicket", client, "server1");
// Redeem it for verified, secret-free identity:
var id = call("LIberty Network", "ln_auth_redeemTicket", t.ticket, "server1");
```
Exported: `ln_auth_isAuthenticated`, `ln_auth_identity`, `ln_auth_issueTicket`,
`ln_auth_redeemTicket`, `ln_auth_characters`.

### Deferred (seams reserved, not built)
Email verification, OTP/MFA on new devices, password recovery, admin account
management, account linking/social auth, server-specific permissions, purchasable
character slots, web account portal.

## Phase 3 - spawn / lifecycle subsystem (implemented)

Reliable spawn **and** death-respawn in the sandbox, built as a pluggable
framework so future modules (map, jobs, economy) can hook in instead of
re-implementing spawn logic.

```
Core/Server/Subsystems.js   LN.Subsystems  hook dispatcher (register/emit/resolve)
Core/Server/Spawn.js        LN.Spawn       single world-entry point + death->respawn
Core/Server/SpawnNet.js     LN.SpawnNet    OnPedWasted + ln:requestRespawn wiring
Core/Client/Spawn/Init.js   LN.SpawnClient client death detection (2 belts)
```

### How it works
- **Initial spawn** still gated behind auth, but routed through `LN.Spawn.spawnPlayer`.
- **Death respawn** - two belts so sandbox quirks can't strand you forever:
  1. server `OnPedWasted` (own player),
  2. client `OnPedWasted` + a health poll that keeps sending `ln:requestRespawn`
     until the server confirms with `ln:spawnState`.
- **Respawn** schedules after `config.spawn.respawnDelaySec`, dedupes repeated
  death events, and cancels pending respawns if the player quits.

### Plug-in points (subsystems)
```js
LN.Subsystems.register("police", {
    resolveSpawnPoint: (client, cur) => newPosOrNull,  // override spawn position
    beforeSpawn:       (client, opts) => false,        // return false to veto
    afterSpawn:        (client, opts) => {},
    onDeath:           (client, info) => {}
});
```
Hooks run in registration order; `resolveSpawnPoint` lets multiple subsystems
compete and pick the best spawn.

### Commands
`/respawn` (manual; respects cooldown) · `/kill` (sandbox test).

### RP-resource exports
`ln_spawn_player`, `ln_spawn_respawn`, `ln_spawn_onDeath`, `ln_spawn_state`.

## Roadmap (next phases)

- **Phase 3 — Persistence layer**: shared data API + save/load helpers used by
  every future module (embryonic `LN.Store` already in place).
- **Phase 4 — Economy**: money, banks, wallets, item inventory.
- **Phase 5 — Jobs & Activities**: civilian/taxi/trucking/police job framework.
- **Phase 6 — Social & Comms**: RP chat (me/do/ooc), phone, radio, factions.
- **Phase 7 — World & Property**: vehicles, properties, businesses, markers/zones.

## Conventions to follow when extending

- Namespace everything under `LN` (client and server contexts are separate).
- **Network marshalling**: this GTAC build **cannot pass JS objects** as network
  event arguments (`CArgument::Create(ARGUMENT_JSVALUE)` fails). Always send
  **positional primitives** (strings/numbers) and JSON-stringify structured
  data; client handlers read them from `arguments[0..]`.
- Client -> server: `addEvent(name)` (server) + `triggerNetworkEvent(name, ...args)`
  (client) + `addNetworkHandler(name, (client, ...args) => ...)` (server).
- Server -> client (one): `triggerNetworkEvent(name, client, ...args)`.
- Server -> client (all): `triggerNetworkEvent(name, null, ...args)`.
- Keep account/credentials separate from character/gameplay data (separate files).
- Add new scripts to `meta.xml` in dependency order (server auth primitives
  load before `Service.js`, which loads before `Init.js`).
