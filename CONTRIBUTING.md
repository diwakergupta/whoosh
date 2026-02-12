# Contributing

## Prerequisites

- Bun 1.3+

## Local setup

```bash
bun install
cp .env.example .env
```

Populate `.env` with your Whoop OAuth credentials before running `login` or `server`.

## Development commands

```bash
bun run src/cli.ts --help
bun run typecheck
bun test
bun run check
bun run build
```

## Change requirements

- Keep TypeScript strict and avoid `any` in core paths.
- Add/adjust tests for behavior changes.
- If schema changes, update docs and query examples.
- Preserve boundary: sqlite/json only unless explicitly expanding scope.
