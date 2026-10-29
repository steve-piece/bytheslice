<!-- skills/open-the-shop/references/provider-provisioning.md -->
<!-- The provider-provisioned path of /open-the-shop, used only under run.unattended: true. Read-only authorization checks per provider, the tooling that writes values into .env.local without the agent seeing them, and the local substitutes for a required service with no authorized provider. No provider is a default or a recommendation. -->

# Provider-Provisioned Path

Used only when `bytheslice.config.json` sets `run.unattended: true`. The operator authorized some providers before the run (their CLIs are logged in, or an MCP for them is connected) and named in the order ticket's **Answers** which host, database and auth to use. This path lets that provider tooling write `.env.local` itself. No provider here is a default or a recommendation; the tables are alphabetical and list examples, not a closed set.

## Rules that never bend

- **The agent never sees a value.** Every command that emits a secret writes to a pipe or to a temp file that only [`../scripts/merge-env.js`](../scripts/merge-env.js) reads. Never `cat`, `echo`, `grep` without `-q`, `head`, `printenv` or `Read` a file or stream holding a value. `merge-env.js` prints key names only.
- **Detection is read-only and silent.** Run each check with its output discarded (`>/dev/null 2>&1`) and use only the exit code. A `whoami` style command that prints only the account identity may be shown.
- **Temp files live outside the repo** (`mktemp` under `$TMPDIR`, mode 600) and are removed by `merge-env.js --consume`, or with `rm -f` on any failure path.
- **Fill only what is missing.** `merge-env.js` writes a key only when the `.env.example` lists it and the `.env.local` has it missing, empty or placeholder. An operator-set value is never replaced.
- **Public values from an MCP are fine; secrets are not.** An MCP result lands in the agent's context, so take only non-secret values from one (a project URL, a publishable or anon key). A secret key comes only from a CLI piped into `merge-env.js`. With only an MCP and a secret to fill, treat that key as having no authorized provider.
- **Only what the ticket names.** Link to, read from, or create only the projects, sites and databases the ticket's **Answers** name. Creating anything else on a shared account, and every destructive command (`db reset`, deleting a project, rotating keys), is skipped and recorded.

## Authorization checks (read-only)

| Provider | Kind | Check (exit code only) | Also counts as authorized |
|---|---|---|---|
| Cloudflare | host, DB (D1), storage | `wrangler whoami` | a connected Cloudflare MCP |
| Fly | host, DB | `fly auth whoami` | |
| Neon | DB | `neonctl me` | a connected Neon MCP |
| Netlify | host, env store | `netlify status` | a connected Netlify MCP |
| Railway | host, DB, env store | `railway whoami` | |
| Render | host, DB | `render whoami` | a connected Render MCP |
| Stripe | payments | `stripe config --list >/dev/null 2>&1` (it prints keys, so never show its output) | |
| Supabase | DB, auth, storage | `supabase projects list` | a connected Supabase MCP |
| Turso | DB | `turso auth whoami` | |
| Vercel | host, env store | `vercel whoami` | a connected Vercel MCP |
| Secret managers (1Password `op`, Doppler, Infisical) | any key | `op whoami`, `doppler me`, `infisical user get token >/dev/null` | |

A provider counts as authorized for a key only when its check passes AND the ticket's **Answers** chose it for that service (or, for a service the interview did not cover, it is the only authorized provider of that kind; record that pick as a decision).

## Writing values (examples)

Replace `<...>` with the ticket's project names, and `merge-env.js` with `"${CLAUDE_PLUGIN_ROOT}/skills/open-the-shop/scripts/merge-env.js"`. Each line ends in `merge-env.js`, which reports `written` and `still_missing` key names. Linking writes only local config; it is not a write on the shared account. Check each CLI's current flags before running (they change between versions); the shape stays the same: provider output in, key names out.

| Provider | How the values reach `.env.local` |
|---|---|
| Vercel | `T=$(mktemp); vercel link --yes --project <project> >/dev/null && vercel env pull "$T" --environment=development --yes >/dev/null && node merge-env.js --example <ex> --target <local> --source "$T" --consume` |
| Netlify | `netlify link --name <site> >/dev/null && netlify env:list --plain --context dev \| node merge-env.js --example <ex> --target <local> --source -` |
| Railway | `railway link --project <project> >/dev/null && railway variables --kv \| node merge-env.js ... --source -` |
| Supabase (hosted) | `supabase projects api-keys --project-ref <ref> -o env \| node merge-env.js ... --source - --map <CLI_NAME>=<ENV_EXAMPLE_NAME>`; the URL is `https://<ref>.supabase.co`, written the same way (`printf 'NEXT_PUBLIC_SUPABASE_URL=https://%s.supabase.co\n' <ref> \| node merge-env.js ... --source -`). Map each CLI key name onto the `.env.example` name (publishable, secret). |
| Supabase (MCP only) | `get_project_url` and `get_publishable_keys` give the URL and publishable key (public values); pipe them into `merge-env.js` the same way. The secret key is not taken from an MCP. |
| Neon | `neonctl connection-string --project-id <id> \| sed 's/^/DATABASE_URL=/' \| node merge-env.js ... --source -` |
| Turso | `turso db show <db> --url \| sed 's/^/TURSO_DATABASE_URL=/' \| node merge-env.js ... --source -`, then `turso db tokens create <db> \| sed 's/^/TURSO_AUTH_TOKEN=/' \| node merge-env.js ... --source -` (the token is for the database the ticket named) |
| Stripe (test mode) | a short script that reads `stripe config --list` and pipes `STRIPE_SECRET_KEY=<test key>` lines into `merge-env.js`; the webhook secret from `stripe listen --print-secret` the same way. Test mode only. |
| Secret managers | `op inject`, `doppler secrets download --no-file --format env`, or `infisical export --format=dotenv`, each piped into `merge-env.js` |

Where a provider cannot read a secret back (Cloudflare and Fly secrets, for example), it covers only the non-secret values; the rest go through the no-provider rule below.

## No authorized provider

For each key still missing after the provider pass:

| The key's service | Under `run.unattended: true` |
|---|---|
| **Optional** (the `.env.example` line or the comment above it says optional, or the code guards it, or it is analytics, error tracking or similar the main flow does not need) | Leave it out. Record it under "Decisions made without you" and pass it to `env-verifier` as an excused key. |
| **Required, with a local substitute** | Use the substitute, write its local, non-secret values with `merge-env.js`, record it. The slices build against the substitute; the ticket line says which service it replaces. |
| **Required, no local substitute** | The app cannot run without it. Mark every slice that needs it deferred in the master checklist (row stays `[ ]`, `**Status:** deferred: needs <service> credentials`), record the blocker under **Deferred**, excuse its keys, and return `status: complete_with_deferrals`. |

Local substitutes (pick the one closest to the authorized stack, and record which):

| Service kind | Local substitutes |
|---|---|
| Database | SQLite file (`file:./dev.db`); a local Postgres (Docker or a native install); the provider's own local stack when its CLI has one (`supabase start`, then `supabase status -o env` piped into `merge-env.js`; `turso dev`; `wrangler d1` with `--local`) |
| Auth | a local session (signed cookie with a generated dev secret) or magic-link-to-console (the link is logged instead of emailed) |
| Email | a console logger, or a local SMTP catcher if one is installed |
| File storage | the local filesystem under a gitignored folder |
| Payments | the provider's test mode only when its CLI is authorized; otherwise none (defer) |
| LLM / AI APIs | none (defer the slices that need it) |

A generated local secret (a session signing key, for example) is created by a command piped into `merge-env.js` (`printf 'AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" \| node merge-env.js ... --source -`), never typed by the agent.

## GitHub Actions secrets

Set only secrets a workflow under `.github/workflows/` references (`github-secrets-scanner` lists them). Under ship-once only the app's final PR runs CI, so set them any time before that PR. Pipe each value from the same provider tooling, never through the agent:

```bash
T=$(mktemp); vercel env pull "$T" --environment=development --yes >/dev/null
node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").split(/\r?\n/).find(x=>x.startsWith(process.argv[2]+"="));if(l)process.stdout.write(l.slice(process.argv[2].length+1).replace(/^"|"$/g,""))' "$T" KEY_NAME | gh secret set KEY_NAME
rm -f "$T"
```

Use the `gh` wrapper form the operator's environment requires, if any. A referenced secret with no provider path is recorded; the final PR's CI will show it.
