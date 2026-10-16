# Adding your game to the STEM Day Arcade

Every CSC member can add a game. You build it in your own folder, send it in as a pull request, and once an officer approves it, it shows up on the arcade site automatically.

You don't need to be an experienced programmer. Lots of people build their game with Claude's help, and that's completely fine. Just make sure you understand how it plays and can explain it to a visitor.

## Game rules

1. **It runs in a web browser.** Plain HTML, CSS, and JavaScript. No installs, no downloads, no build steps.
2. **No logins or outside websites.** Everything the game needs (images, sounds, code) lives in your game's folder. Visitors might be on school Wi-Fi or an offline laptop.
3. **Easy to pick up.** Someone who's never seen it should understand it within about 2 minutes. Put the instructions on the start screen.
4. **STEM-themed.** Math, physics, chemistry, biology, engineering, computing, space: anything that ties to STEM.
5. **School-appropriate.** Remember that families and high school students will be playing.
6. **Stay in your folder.** Don't edit other people's games or the arcade's main files in your pull request. If you think the arcade itself needs a change, open an issue instead.

Good games for STEM Day usually take 1–3 minutes per round and work with a mouse, keyboard, or both.

## What your folder looks like

```
games/
  your-game-name/
    index.html      ← the game itself (required)
    game.json       ← title, your name, description, controls (required)
    thumbnail.png   ← cover image, 16:10 shape like 800×500 (optional)
    ...             ← any other files your game uses
```

The folder name becomes part of your game's web address, so use lowercase words joined by dashes: `orbit-catcher`, `circuit-builder`, `periodic-match`.

### game.json

Copy `games/_template/game.json` and fill it in:

```json
{
  "title": "Orbit Catcher",
  "author": "Your Name",
  "github": "your-github-username",
  "description": "One sentence a visitor reads to decide whether to play (under 160 characters).",
  "controls": "Arrow keys to steer, Space to fire thrusters.",
  "tags": ["physics", "space"],
  "thumbnail": "thumbnail.png"
}
```

`github`, `tags`, and `thumbnail` are optional. If you skip the thumbnail, the arcade draws a cover for you. Try to reuse tags other games already have (like `math`, `physics`, `chemistry`, `biology`, `space`, `computer engineering`) so the filters stay useful.

### Links inside your game

Use relative paths: `src="sprites/ship.png"`, not `src="/sprites/ship.png"` and not a link to another website.

## Building your game with Claude

A prompt like this gets you a solid first version:

> Make a single-file HTML/CSS/JavaScript browser game for a STEM Day arcade. Theme: **[your idea, e.g. "keep a satellite in orbit by firing thrusters"]**. Requirements: no external libraries or network requests, a start screen with one-paragraph instructions, a round that lasts about 1–2 minutes, a score and a "Play again" button, works with keyboard and mouse, and fits a laptop screen. Keep all the code in one index.html file.

Then play it, and keep asking for changes until it feels right. Read through the code too. At STEM Day, people will ask you how it works.

## Sending in your game

### Option A: All on the GitHub website (no git needed)

1. Go to [github.com/oakton-csc/stem-day-arcade](https://github.com/oakton-csc/stem-day-arcade) and click **Fork** (top right). This makes your own copy.
2. In your fork, open the `games` folder, then click **Add file → Upload files**.
3. Drag your whole game folder (for example `orbit-catcher/`, with `index.html` and `game.json` inside) onto the page. Check that the file paths shown start with `games/orbit-catcher/`.
4. Write a short message like "Add Orbit Catcher" and click **Commit changes**.
5. Back on your fork's main page, click **Contribute → Open pull request**. Fill in the checklist and submit.

### Option B: Using git on your computer

```bash
# 1. Fork the repo on GitHub first, then:
git clone https://github.com/YOUR-USERNAME/stem-day-arcade.git
cd stem-day-arcade
git checkout -b add-orbit-catcher

# 2. Start from the template
cp -r games/_template games/orbit-catcher
# ...build your game in games/orbit-catcher/

# 3. Check it and preview the arcade (needs Node.js)
node scripts/build-manifest.mjs
npx serve
# open the address it prints, e.g. http://localhost:3000

# 4. Send it in
git add games/orbit-catcher
git commit -m "Add Orbit Catcher"
git push -u origin add-orbit-catcher
# then open a pull request on GitHub
```

To just test your game by itself, you can double-click its `index.html` and it opens in your browser.

## After you open a pull request

- An automatic check makes sure your `game.json` is filled in correctly. If it fails, click **Details** to see what to fix, update your files, and the check runs again.
- An officer will play your game and either approve it or leave comments.
- Once it's merged, it appears on the arcade site within a few minutes.

Questions? Ask in the club chat or at a meeting.
