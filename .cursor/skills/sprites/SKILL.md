---
name: sprites
description: Use Sprites to create, list, inspect, operate, and clean up isolated cloud development environments from Cursor.
---

# Sprites

Use this skill when the user asks Cursor to work with Sprites, sprite environments, remote development environments, cloud sandboxes, or the Sprites MCP server.

Sprites are remote, isolated development environments with their own filesystem, URL, services, checkpoints, and network policy. This skill runs in Cursor, outside the sprite. Use the Sprites MCP tools provided by the installed plugin as the control plane.

## Golden Path

For normal Sprites tasks, call the Sprites MCP tools directly. Do not use shell commands, curl, or local config inspection as part of the normal flow.

If Sprites MCP tools are not available in the current tool list, say that the Sprites plugin MCP tools are not loaded in this session and ask the user to reload the plugin or restart Cursor. Do not try to work around missing plugin tools by registering another MCP server from the shell.

OAuth is handled by Cursor when the Sprites MCP tools are invoked. If Cursor prompts for authorization, wait for the user to complete it, then retry the original MCP tool call once. Do not start a second login path from the shell.

Keep user-facing progress concise. Report the result, not MCP registration details, local config checks, or CLI noise.

## Tool Map

Use the smallest direct tool for the request:

- List sprites: `list_sprites`.
- Create a sprite: `create_sprite`, then `list_sprites` only if the user asked to see the updated list.
- Delete a sprite: `destroy_sprite`, only after explicit delete/destroy/remove intent.
- Run a one-off command in a sprite: `exec`. Inspect or stop exec sessions with `exec_list` and `exec_kill`.
- Inspect services: `service_list` and `service_get`.
- Manage services: `service_create`, `service_start`, `service_stop`.
- Inspect service logs: `service_logs`.
- Manage checkpoints: `checkpoint_create`, `checkpoint_list`, `checkpoint_get`, `checkpoint_restore`.
- Inspect or change network policy: `policy_network_get`, `policy_network_update`.

Sprite-scoped tools require a `sprite` argument. If the user did not name a sprite and the task needs one, call `list_sprites` and choose the obvious match; ask a short clarification only when there is no clear choice.

## Common Flows

List sprites:

1. Call `list_sprites`.
2. If the list is empty, say no sprites were found for the authenticated organization.
3. If sprites exist, summarize name, status, URL, and any useful identifiers. Do not dump raw JSON unless asked.

Create a sprite:

1. Call `create_sprite` with a descriptive task-scoped name.
2. Report the created sprite name, id, status, and URL.
3. If the user asked to list after creation, call `list_sprites` and summarize the updated list.

Inspect or operate a sprite:

1. Identify the target sprite.
2. Use `service_list`, `service_logs`, or targeted `exec` based on the task.
3. Prefer MCP service tools for service inspection and lifecycle work.
4. Use services for long-running processes and `exec` for short commands.

## Cursor vs Sprite Context

Keep these contexts distinct:

- Cursor local workspace: the repository and shell where this conversation is running.
- Sprites MCP server: the API Cursor uses to operate sprites.
- Sprite filesystem: the remote environment reached only through sprite-scoped tools.

Do not assume Cursor's local shell is inside a sprite. To inspect or change a sprite, use Sprites MCP tools.

## Safety

Treat any HTTP service in a sprite as potentially internet-accessible. Sprite URLs can be switched from authenticated access to public access.

Never create HTTP endpoints that expose:

- Environment variables, secrets, tokens, credentials, or API keys.
- Arbitrary file contents without explicit user approval and access controls.
- Debug, admin, status, or process endpoints that dump internals.
- Unfiltered logs, stack traces, system paths, or user data.

Destroying a sprite is irreversible. It deletes the environment state, services, checkpoints, and URL. Only call `destroy_sprite` when the user explicitly asks to delete, destroy, or remove a sprite, or when they approve cleanup.

For risky filesystem changes, package installs, migrations, or broad refactors inside a sprite, create a checkpoint first with `checkpoint_create` and mention the checkpoint id.

If network access fails, use `policy_network_get` first. Update network policy with `policy_network_update` only when the user has asked to allow or block domains, or when the required access is clearly part of the requested work and you can explain it.
