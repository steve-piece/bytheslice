<!-- skills/sell-slice/references/ui-sources.md -->
<!-- Where the UI phase finds pre-built pages, blocks and components: the operator's own registry preferences first, else the public shadcn registry directory. Shared by block-composer, component-crafter, the implementer, modern-ux-expert and set-display-case. -->

# UI sources

Before anything is hand-written, the UI phase installs pre-built pages, blocks and components. Where it looks:

1. **The operator's own registry preferences, when they have any.** In order: `ui.registries` in the project's `bytheslice.config.json`, then in `~/.bytheslice/defaults.json`, then the `registries` the project's `components.json` already declares. An entry is a namespace (`"@magicui"`) or an object `{ name, item, catalog?, theme?, notes? }` for a registry that is not in the public directory (a private kit, for example). Follow each entry's `notes`.
2. **Otherwise, and after them, the public shadcn registry directory** (`https://ui.shadcn.com/r/registries.json`): every public shadcn-compatible registry, with a health score and an item count. The plugin keeps its healthy, highest-ranked React registries (health 90 or more, 30 items or more). `ui.useDirectory: false` turns it off; `ui.directoryTop` (default 25) sets how many it keeps.

No registry is a plugin default, and no one operator's kit is assumed: a registry only one person can reach belongs in that person's preferences, never in the plugin.

## Resolve, search, install

```bash
# 1. The ordered sources and the search command (cached one day; --match biases the directory toward the slice's surfaces)
node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-sources.js" "<project root>" --match "<surface words, e.g. login form data table>"

# 2. Search them (namespaced sources; one query per surface, short and literal)
npx shadcn@latest search @ns-a @ns-b ... -q "login" -t block,ui --json

# 3. Install what fits, by the search result's addCommandArgument (or an object entry's full item URL)
yes n | npx shadcn@latest add @ns-a/login-04 --yes
```

- **Tier.** Prefer a page when the item is the whole route, a block when it is a section of one, a component when it is a primitive. Take the first source, in order, with an item that fits; never re-create an item a source offers.
- **Read the item before installing.** `npx shadcn@latest view <addCommandArgument>` shows its files and dependencies: reject an item that pulls a framework the app does not use, a paid or license-restricted source, or a dependency that clashes with the app's.
- **Install rules.** Always `yes n |` in front and `--yes`, never `--overwrite` (a no-TTY overwrite prompt on `lib/utils.ts` otherwise aborts the install). The project must be shadcn-initialized (`components.json`) first.
- **Mock data.** A block that ships sample data gets real data through its props; delete its mock file and any import of it.
- **Theme.** Installed items read the project's own tokens. A source's theme item is installed only when the operator's preference names it (`theme` on an object entry) on a greenfield project.
- **Unreachable source.** A source whose search errors is skipped and named in the report, never a stop.
- **Record** per surface which source and item covered it (`registry_sources`).
