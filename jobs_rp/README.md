# jobs_rp

Lua-first roleplay jobs framework for GTA Connected with account auth, password login, and server-authoritative job progression.

## Highlights

- Jobs: `taxi`, `robbery`, `police`
- Register + password login required before `/job` gameplay commands
- First-time auth panel UI (register/login) with command fallback
- Anti-impersonation account binding (profiles keyed by authenticated account id)
- JSON persistence split by account/profile
- Optional MySQL backend with automatic JSON fallback
- `/job`, `/jobauth`, `/jobadmin` command suites
- Blip + proximity prompt interaction and `E` key actions

## Resource Structure

```text
jobs_rp/
  meta.xml
  shared/
    config.lua
    job_defs.lua
    json.lua
    character_defs.lua
  server/
    db.lua
    store.lua
    economy.lua
    auth/                    # Modular authentication system
      init.lua            # Auth module loader
      core.lua            # Basic auth functions
      session_manager.lua  # Session & token management
      commands.lua         # Auth commands
    jobs.lua
    commands/               # Modular command system
      init.lua            # Commands module loader
      core.lua            # Shared utilities
      admin.lua           # Administrative commands
      xp.lua              # XP-related commands
    network.lua
    character_manager.lua
    universal_sync.lua
    backup_system.lua
    gamemode_setup.lua
    phone_events.lua
    http_client.lua
    job_stats.lua
    account_data_store.lua
    sync_scheduler.lua
    web_integration.lua
    xp.lua                  # Dedicated XP system
    achievement.lua          # Achievement system
    time_stats.lua          # Time-based statistics
    role_commands.lua
    jobadmin.lua
    security.lua
    vehicles.lua
  client/
    ui.js
    auth_ui.js
    zones.lua
    main.js
    jobsrpui/
      mexui/             # UI framework
    callouts.js
    police_menu.js
    character_selector.js
    character_controller.js
    keyboard_service.js
    shared_utils.js
    backup_system.js
    police_scanner.js
    phone.js
    world_events.js
    callout_ui.js
  data/
    accounts/
    profiles/
    players/    (legacy, no longer loaded)
```

## Install

1. Place folder under server resources: `resources/jobs_rp`
2. Ensure `meta.xml` exists.
3. Start/enable resource in `server.xml` after base resources.
4. Configure `admin_accounts` in `shared/config.lua` to your account id.

## Auth Flow

1. Join server.
2. If not authenticated, Jobs Auth panel opens automatically.
3. Register once using panel or command:
   - panel mode `REGISTER`, fill account id, press `Enter`
   - command: `/jobauth register <accountId> <password>`
4. Next sessions: login via panel (`LOGIN`) or command:
   - `/jobauth login <accountId> <password>`
5. Optional: legacy token login still works for older accounts, then set a password:
   - `/jobauth setpass <newPassword>`
6. After login, `/job` commands and hub interactions are enabled.

## Auth Panel Controls

- `F7` or `F3` or `Home`: switch `REGISTER`/`LOGIN` mode
- `Tab`: switch active field
- `Double-Tab`: switch `REGISTER`/`LOGIN` mode (fallback)
- `Backspace`: delete character
- `Enter`: submit
- `Esc`: close only when already authenticated

## Commands

### Auth

- `/jobauth help`
- `/jobauth register <accountId> <password>`
- `/jobauth login <accountId> <password>`
- `/jobauth setpass <newPassword>`
- `/jobauth logout`
- `/jobauth whoami`

### Jobs

All of these require successful auth when `auth_required=true`:

- `/job help`
- `/job list`
- `/job join <taxi|robbery|police>`
- `/job leave`
- `/job start`
- `/job stop`
- `/job status`
- `/job paycheck`
- `/job next` (debug quick-test)
- `/job finish` (debug quick-test)

### Admin

Admin access is account-id based (`config.admin_accounts`) and also requires login.

- `/jobadmin help`
- `/jobadmin whoami`
- `/jobadmin save`
- `/jobadmin reload`
- `/jobadmin dbstatus`
- `/jobadmin authreset <accountId>`
- `/jobadmin authinfo <accountId>`
- `/jobadmin setcash <playerName> <amount>`
- `/jobadmin setxp <playerName> <jobId> <amount>`
- `/jobadmin reset <playerName>`

### Testing & Debug

- `/testxp` - Add 50 test XP to current job
- `/fillxp` - Fill XP bar to next level
- `/session` - Show current session status
- `/logout` - Logout from current session

## Config

Tune values in `shared/config.lua`:

- Gameplay:
  - `switch_cooldown_sec`
  - `run_timeout_sec`
  - `action_rate_limit_ms`
  - `action_distance`
  - `hub_interact_distance`
  - `payout_cap_amount`
  - `payout_cap_window_sec`
  - `grade_thresholds`
  - `grade_bonus_per_level`
- Map/UI:
  - `hub_blip_sprite`
  - `route_blip_sprite`
  - `route_blips_show_all`
- Auth/security:
  - `storage_backend` (`json` or `mysql`)
  - `auth_required`
  - `accounts_dir`
  - `profiles_dir`
  - `db_driver`
  - `db_host`
  - `db_port`
  - `db_name`
  - `db_user`
  - `db_password`
  - `db_charset`
  - `db_table_prefix`
  - `db_connect_options`
  - `auth_token_prefix`
  - `auth_token_hex_len`
  - `auth_fail_window_sec`
  - `auth_fail_max`
  - `auth_lock_sec`
  - `auth_reserved_ids`
  - `auth_ui_enabled`
  - `auth_ui_force_modal`
  - `auth_ui_max_account_len`
  - `auth_ui_max_password_len`
  - `auth_ui_show_token_once`
- Admin:
  - `admin_accounts`
  - `admin_allow_all` (debug only)
- Debug:
  - `debug_quick_test`
  - `debug`

## Persistence

- Accounts: `data/accounts/<accountId>.json`
- Profiles: `data/profiles/<accountId>.json`
- MySQL (optional): `<db_table_prefix>accounts` and `<db_table_prefix>profiles` tables
- Autosave every 90s
- Save on player quit and on resource stop
- Corrupt JSON is quarantined as `.bad.<timestamp>`
- Legacy `data/players/*.json` is intentionally ignored (fresh start mode)
- If MySQL backend init fails, resource falls back to JSON automatically

## MySQL Setup

1. Enable DB in `shared/config.lua`:
   - `storage_backend = "mysql"`
   - fill `db_host`, `db_port`, `db_name`, `db_user`, `db_password`
2. Ensure your server has DB API support (`dbConnect`, `dbExec`, `dbQuery`, `dbPoll`).
3. Restart `jobs_rp`.
4. Check status: `/jobadmin dbstatus`.

## Troubleshooting

- Login fails after migrating from token-only account:
  - Login once with legacy token, then run `/jobauth setpass <newPassword>`.
  - Check private auth chat output.
  - Confirm account file exists in `data/accounts`.
- Auth panel not opening:
  - Confirm `auth_ui_enabled=true` and `auth_required=true`.
  - Verify client events are loading (`meta.xml` includes `client/auth_ui.js`).
  - Use command fallback: `/jobauth register ...` or `/jobauth login ...`.
- Permission denied for `/jobadmin`:
  - Verify logged-in account with `/jobadmin whoami`.
  - Add that account id to `admin_accounts` and restart resource.
- Login lockout:
  - Too many failed passwords. Wait lock timer and retry.
- No old progress after update:
  - Expected in fresh-start mode; old `data/players` files are not migrated.


