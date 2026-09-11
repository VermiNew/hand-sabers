# Contributing to Hand Sabers

Thanks for considering a contribution. Hand Sabers is an MIT-licensed rhythm
game built with TypeScript, Three.js, Vite and Express.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- For a large feature or behavior change, open an issue first and describe the
  user problem, proposed behavior and verification plan.
- Report vulnerabilities according to [SECURITY.md](SECURITY.md), not in a
  public issue.
- Do not include copyrighted game assets, songs, credentials, camera frames or
  other private user data in a contribution.

## Local setup

Requirements: Node.js 22.18 or newer, npm, and Chrome or Edge for camera flows.

```bash
npm install --package-lock=false
npm run dev
```

The Vite client runs at `http://localhost:5173` and the API at
`http://localhost:3000`. Use `npm start` to build and serve the complete app on
port 3000.

## Making a change

1. Keep the change focused and preserve existing behavior outside its scope.
2. Use English for code, variable names and comments. User-facing interface
   text must have Polish and English translations.
3. Do not add dependencies unless the change genuinely requires one and the
   maintainer agrees to it.
4. Never commit secrets, generated certificates, `dist/`, `dist-server/` or
   local map/audio data.
5. Run the quality gate before submitting:

```bash
npm run verify
```

For a UI or gameplay change, also describe the browser, viewport, interaction
tested and visual result. Hardware-dependent camera, phone and audio behavior
must be labelled as unverified until it has been exercised on real devices.

## Commits and pull requests

Use Conventional Commits in the form `type(scope): description`, for example:

```text
fix(camera): explain unavailable video input
feat(multiplayer): add spectator role
```

A pull request should explain what changed, why it changed, how it was verified
and any known limitations. Include screenshots for visible UI changes, but crop
or blur camera images and personal information first.

By contributing, you agree that your contribution is provided under the
project's [MIT License](LICENSE).
