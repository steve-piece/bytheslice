<!-- commands/open-kitchen.md -->
<!-- Open the project kitchen, or with --lobby the machine-level lobby, in the host application's native Browser pane using the local viewer skill. -->
---
description: Open the project's 3D kitchen in the native Browser pane with a verified local state connection, or with --lobby the lobby of every ByTheSlice project on this machine.
argument-hint: [--lobby]
---

# /open-kitchen

Load and follow the complete [open-kitchen skill](../skills/open-kitchen/SKILL.md).

Open the verified localhost page in the host application's native Browser pane. Returning a URL alone does not complete this command. Follow the skill's current-tool discovery steps and report clearly if the host has no native Browser opener.

With `--lobby`, open the machine-level lobby instead of this project's kitchen, following the skill's "Open the lobby" section.
