---
name: open-kitchen
description: Open the project's approved 3D kitchen in the native Browser pane with a verified localhost state connection.
user-invocable: true
---
<!-- skills/open-kitchen/SKILL.md -->
<!-- Open the approved local 3D kitchen in the native Browser pane after verifying its project-specific server. -->

# Open Kitchen

Open the current project's kitchen in Claude's native Browser pane. The host bridge probe returned `server_not_connected` for both `host:plugin_bytheslice_kitchen` and `host:kitchen`, so the selected integration uses the localhost viewer. Do not publish an artifact or try the artifact host bridge again.

## Resolve the project and local viewer

1. Use the explicitly requested project root, otherwise `CLAUDE_PROJECT_DIR`, otherwise the current project working directory. Resolve it to an absolute directory. Use the installed plugin's root for the bundled helper, never a similarly named script in the consumer project.
2. If the registered kitchen MCP tool is available, call its actual discovered `kitchen_state` tool with `{}`. Read `project.root` and the top-level `port` from its snapshot. Do not print the full snapshot. Use the result only when its absolute resolved project root matches the requested project and the port is an integer from 1 through 65535. Do not invent a tool name or assume the server belongs to the current project.
3. When the MCP tool is absent, disconnected, or belongs to another project, run the bundled helper using the actual plugin root and project root as separate, safely quoted arguments:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/skills/open-kitchen/open-kitchen.js" --project "<absolute-project-root>"
   ```

   Resolve the example placeholder before executing. If the host does not supply `CLAUDE_PLUGIN_ROOT`, locate the installed skill directory from its actual loaded path and use its `open-kitchen.js`. Do not search or edit authentication or user configuration files to locate it.

   The helper reuses an existing server only when `GET /state` matches the requested project. Otherwise it starts the plugin's server as a detached, loopback-only process and waits at most eight seconds. Its stdout is only the verified localhost URL; stderr contains a safe error. On failure, report that error and stop.
4. The only allowed viewer address is `http://127.0.0.1:<validated-port>/`. For a URL derived from MCP, verify `GET /state` at this address before opening it, checking that `project.root` and the top-level `port` still match. If that verification fails, use the bundled helper once. Do not navigate to a URL supplied by an activity row or any other snapshot field.

## Open the native Browser pane

1. Inspect the host's available tools and current browser documentation for the native Browser pane opener. If tools are deferred, use the host's supported tool search or discovery mechanism to load the native Browser tools and read their returned schemas. Documented Claude Browser candidates use the `mcp__Claude_Browser__` or `mcp__remote-devices__Claude_Browser__` prefix and expose `preview_start` with a `url` argument, but use them only when this host actually supplies their schemas. An in-app browser tab API is usable only if the current host documents that it opens its native Browser pane. Follow the actual schema, not a guessed namespace or argument list.
2. Open the verified localhost URL in a new visible native Browser tab, leaving existing tabs intact. If a matching native tab already exists, reuse it with the host's documented navigation or reveal API.
3. Use the native Browser tools to confirm the page loads. Confirm a successful same-origin `/state` response and the read-only `window.kitchenLive.snapshot` hook when the host supports that inspection. The hook's project root must match the requested project. Do not print or log the snapshot, activity rows, prompts, environment values, secrets, or agent final messages. If the host cannot inspect JavaScript state, a successful page load plus the independently verified `/state` response is sufficient; state the limit.
4. If no native Browser opener exists, or it refuses local addresses, report that the local server is ready but the native pane opening is blocked. Include the verified localhost link as a manual recovery path. Do not claim `/open-kitchen` completed, silently switch to Chrome, open the OS browser from the shell, publish a remote artifact, change user settings, or launch a real Claude session to work around the missing capability.

## Viewer behavior and completion

The viewer polls same-origin `GET /state` every three seconds while visible with caching disabled, retaining the latest valid full snapshot. It emits `kitchen:state`, applies snapshots to the live scene driver, and exposes the latest snapshot through the read-only `window.kitchenLive.snapshot` hook for inspection.

Projects without setup evidence show the sample demo shop and its lighting controls. Partial setup shows live construction, with each fixture driven by its own presence and applicability evidence. Completed setup shows live service. Registered agents use their named characters, a second implementer uses Dom, additional plugin instances use division helpers, and non-plugin agents use temporary helpers. Session phase drives the lighting, active work drives the cooking and inspection stations, and checklist pies and slices drive the tickets, customer line and finished-pie shelf. The Orders, People and Log panels describe that state: the Orders sheet shows each active slice's step and tasks committed of its plan (never an estimated percent) and opens any served or planned pie's details; the Log says who did what in plain words; the People sheet has Crew and Town tabs and opens a profile for anyone. While a pie is open a base crew (Dom, Ollie, Sal, Chef Nico) stays on ambient duty, running agents wear a gold work tag, and the rest of the crew live in town until their agent starts, when they run in. In live mode the time of day follows the real session and its buttons are locked. Demo orders and activity remain illustrative rather than evidence about the project.

The page loads Three.js from unpkg and fonts from Google Fonts, so rendering requires those external resources.

The header's accessible browser icon stays disabled until a valid snapshot arrives. A user click opens `http://127.0.0.1:<snapshot.port>/` with `_blank` and `noopener`, using the native pane's external-browser behavior. It never opens another URL automatically. If that host treats `_blank` as another pane tab, describe that limitation truthfully rather than promising an OS-browser launch.

The command completes only after the native Browser pane has opened the correct project's page and the project/state checks above succeed. Briefly report the opened project, local link and observed mode: demo, live construction or live service. A ready localhost server alone does not complete the native command. Native `/open-kitchen` invocation and production discovery remain unverified until observed in the actual host; local fixtures and direct helper checks do not establish a production `/sell-pie` or `/sell-slice` acceptance run. No checklist edits, remote publishing, authentication changes, or user configuration writes are part of this command.
