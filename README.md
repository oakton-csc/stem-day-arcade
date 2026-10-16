# STEM Day Arcade

Browser games built by members of the Oakton College Computer Science Club, played by visitors at STEM Day.

**Play:** https://oakton-csc.github.io/stem-day-arcade/

**Add a game:** see [CONTRIBUTING.md](CONTRIBUTING.md)

## How it works

- Each game lives in its own folder under `games/`, with an `index.html` and a `game.json` describing it.
- `scripts/build-manifest.mjs` reads every `game.json`, checks it, and writes `games.json`.
- The arcade page (`index.html`) loads `games.json` and shows every game as a card. Clicking a card opens the game full-screen with a "Back to games" button.
- A GitHub Action runs the check on every pull request, and publishes the site to GitHub Pages whenever something is merged into `main`.

```
index.html                 the arcade page
games/
  _template/               copy this to start a new game
  binary-blitz/            sample game
scripts/build-manifest.mjs builds and checks games.json
.github/workflows/         pull request check + Pages publishing
```

## Preview locally

Needs Node.js.

```bash
node scripts/build-manifest.mjs
npx serve
```

## One-time setup for officers

1. **Turn on Pages:** repo **Settings → Pages → Source: GitHub Actions**.
2. **Protect main:** **Settings → Branches → Add rule** for `main`. Turn on "Require a pull request before merging" with 1 approval, and "Require status checks to pass" (pick the `build` check once it has run once).
3. **Member access:** in the org's **Settings → Member privileges**, set base permissions to **Read**. Members contribute through forks and pull requests, and officers review and merge.

## For STEM Day

- Open the arcade in a browser and press F11 (Windows) or Ctrl+Cmd+F (Mac) for full screen on each kiosk laptop.
- Do a test run of every game on the actual laptops a day or two before.
