<div align="center">
   
# 🎵 BardBoard & Dragons 🐉

**Your personal soundboard, right inside Discord.**

Play sound effects, ambient music, and voice lines directly into your voice channel — all from a single, clean web interface. Perfect for D&D sessions, watch parties, or anything in between.

[![License](https://img.shields.io/badge/License-GPL%203.0-B91C1C.svg)](LICENSE.md)
[![Discord](https://img.shields.io/badge/Made%20for-Discord-5865F2.svg)](https://discord.com)
[![Docker](https://img.shields.io/badge/Runs%20on-Docker-0EA5E9.svg)](https://docker.com)

[![Release](https://img.shields.io/github/v/release/giabb/BardBoard)](https://github.com/giabb/BardBoard/releases)
[![Issues](https://img.shields.io/github/issues/giabb/BardBoard)](https://github.com/giabb/BardBoard/issues)
[![Discussions](https://img.shields.io/github/discussions/giabb/BardBoard)](https://github.com/giabb/BardBoard/discussions)
<!--[![Stars](https://img.shields.io/github/stars/giabb/BardBoard?style=flat)](https://github.com/giabb/BardBoard/stargazers)-->

[![Node 24](https://img.shields.io/badge/node-24-16A34A?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-orange?logo=next.js&logoColor=white)](https://nextjs.org)



</div>

---

## 📋 Table of Contents
- [✨ What is BardBoard?](#-what-is-bardboard)
- [📋 What You'll Need](#-what-youll-need)
- [🚀 Getting Started](#-getting-started)
- [🎵 Adding Your Sounds](#-adding-your-sounds)
- [🎮 How to Use It](#-how-to-use-it)
- [⚠️ Troubleshooting](#-troubleshooting)
- [⚙️ Advanced Configuration](#-advanced-configuration)
- [🗺️ What's Coming Next](#-whats-coming-next)
- [🤝 Contributing](#-contributing)
- [👥 Contributors](#-contributors)
- [📄 License](#-license)

---

## ✨ What is BardBoard?

BardBoard is a Discord bot with a built-in web soundboard. You open it in your browser, see all your sounds laid out as buttons, and tap one — it plays instantly in your Discord voice channel. Everyone in the channel hears it.

![BardBoard GUI](https://i.ibb.co/TqYC52jD/bardboard21.png)

It's designed with tabletop RPG sessions in mind (think ambient tavern music, dramatic battle effects, NPC voices), but it works great for anything where you want to drop sounds into a group call.

**What makes it nice to use:**
- One-tap playback — no typing commands, just click
- Organise sounds into categories with folders — they show up as sections automatically
- Volume control, repeat, and a seekable progress bar
- A "Now Playing" bar that highlights which sound is active
- Works on desktop and mobile browsers

---

## 📋 What You'll Need

Before you start, make sure you have these:

- **A Discord account** and a server where you want to use it
- **Docker Desktop** installed on your computer — [download it here](https://docs.docker.com/get-docker/) (it's free)
- **A Discord Bot Token** — don't worry, I'll walk you through creating one below

That's it. No coding required.

---

## 🚀 Getting Started

### Step 1 — Get a Discord Bot Token

1. You can follow [this guide](https://www.writebots.com/discord-bot-token/) to create a Discord Bot and get a Discord Bot Token

### Step 2 — Invite the Bot to Your Server

1. From your bot page in the [Discord Developer page](https://discord.com/developers/applications), go to the **OAuth2** tab → **OAuth2 URL Generator**
2. Under Scopes, tick **bot**
3. Under Bot Permissions tick **Connect** and **Speak**
4. Copy the URL at the bottom and open it in your browser
5. Pick your server and click **Authorize**

### Step 3 — Download and Configure BardBoard

1. Download or clone this repository to a folder on your computer
2. Inside that folder, copy the file `.env.sample` and rename it to `.env`
3. Open it and replace the values with your own Discord Bot Token.
4. (Optional) Enable the login screen by setting:
   - `AUTH_ADMIN_USER` / `AUTH_ADMIN_PASS` for admin credentials
   - `AUTH_READONLY_USER` / `AUTH_READONLY_PASS` for standard user credentials
   - `SESSION_SECRET` to a long random string (32+ chars)
   - `SESSION_DIR` (optional) if you want to store sessions outside the container (Docker mounts `./sessions`)

### Step 4 — Start It Up (With Docker)

1. Open a terminal (or PowerShell on Windows) in the BardBoard folder
2. Run this single command: `docker compose up --build -d`
3. Wait a few seconds for it to start up
4. Open your browser and go to **http://localhost:<WEB_PORT>** (default `http://localhost:3000`)

If you change `BOT_PORT`, `WEB_PORT`, or `BACKEND_URL`, rebuild with `docker compose up --build -d` so the web proxy config is regenerated.

You should see the BardBoard interface. If the bot is in your server and you select a voice channel from the header, you're all set! 🎉

### Optional — Run Locally (without Docker)

If you prefer running directly on your machine:

1. Install Node.js (v24 recommended) and make sure `ffmpeg` is in your PATH.
2. Install dependencies: `npm install`
3. Copy `.env.sample` to `.env` and fill in the required values.
4. Start both processes: `npm run dev`
5. Open **http://localhost:<WEB_PORT>** (default `http://localhost:3000`)

Useful local scripts:
- `npm run dev` — start bot + web in development mode.
- `npm run start` — start bot + web in production mode (after `npm run build`).
- `npm run dev:bot` / `npm run dev:web` — run only one side while debugging.
- `npm run lint` / `npm run test` — lint and tests.

---

## 🎵 Adding Your Sounds

You can add sounds in two ways:

- **In-browser upload:** Click **Add Song**, drag & drop files (or browse), pick a category or create a new one, then upload. The modal supports multi-file queues, shows upload progress, and stays scrollable for large batches.
- **Manual:** Drop audio files into the `audio-files` folder inside the project directory. Refresh the page to see them.

**Supported formats:** MP3, WAV, OGG, M4A

### Organising with Categories

Want to keep things tidy? Put sounds into subfolders — each subfolder becomes its own labelled section on the soundboard.

```
audio-files/
├── Tavern.mp3
├── Intro.ogg
├── Combat/
│   ├── Clash.mp3
│   ├── Bash.wav
│   └── Roar.ogg
└── NPCs/
    ├── Merchant.mp3
    └── Guard.mp3
```

This would give you a soundboard with a few loose sounds at the top, then a **Combat** section, then an **NPCs** section — each with their own buttons.

The categories can be collapsed and expanded, and each category has its own colour!
You can also delete songs or entire categories directly from the web UI (with a confirmation prompt).
You can drag songs between categories to move the underlying file on disk, including moving songs back to the root (no category).
You can create categories in two ways: the **Add Category** button, or by dragging a song to the **+ New Category** drop zone that appears during drag.

---

## 🎮 How to Use It

Open `http://localhost:<WEB_PORT>` in any browser on your network (default **http://localhost:3000**). Here's what you'll find:

### The Soundboard

The main area of the page is your soundboard — a grid of buttons, one per sound, optionally divided by categories. Just **tap or click** a button and it plays in your Discord voice channel immediately. The button for the currently playing sound lights up so you always know what's on.


### The Controls (top bar)

- 🔊 **Volume slider** — Drag it left or right to adjust how loud the sound plays in Discord, then release to apply.
- 🧭 **Channel selector** — Grouped by server. Picking a channel switches the bot connection to that channel.
- 🔈 **Speaker icon (mute toggle)** — Click once to mute (set volume to 0), click again to restore your last non-zero volume.
- ⏸️ **Pause / ▶️ Resume** — Tap this to pause the current sound and to enable resume button. Tap again to resume the song.
- 🔁 **Repeat** — Tap this to loop the current sound. It'll keep playing on repeat until you stop it or play something else. Tap again to turn it off.
- ⏹️ **Stop** — Stops whatever is currently playing.

### Now Playing Bar

Right below the controls you'll see a strip that shows you what's playing right now, along with a **progress bar**. You can **click or drag** anywhere on that bar to jump to a different part of the sound — handy if you want to skip to a specific moment in a longer track.

### Search Bar

Below the playing bar, you can find a search bar. This bar filters songs and categories.

### Add Song (Upload)

Click **Add Song** next to the search bar to open the upload modal. You can drag multiple files, remove them before uploading, and choose a category (or create a new one). The upload overlay shows a progress bar and percentage while files are being sent.

### Playlist Panel

Use the playlist panel to manage queued tracks for your selected voice channel.
- Queue tracks from the soundboard.
- Drag songs from the soundboard directly into the playlist panel to queue them without moving/deleting the original file.
- Reorder the queue with drag and drop.
- Shuffle, clear, play next, or skip directly from playlist controls.
- Keep track of what is coming after the current track.

### Using It on Mobile

The soundboard works on phones and tablets too. The progress bar supports touch dragging, so seeking works just as well on mobile as on desktop.

---

## ⚠️ Troubleshooting

**Nothing is playing when I tap a button**
- Make sure the bot is in your Discord server and has the **Connect** and **Speak** permissions in the voice channel
- Select a voice channel from the channel dropdown in the app header

**The soundboard is empty**
- Make sure there are audio files in the `audio-files/` folder
- Supported formats are MP3, WAV, OGG, and M4A — other formats won't show up

**The bot isn't online in Discord**
- Double-check your `DISCORD_TOKEN` in the `.env` file — make sure there are no extra spaces or line breaks
- Try restarting with `docker compose restart`

**I don't see the login screen**
- Make sure at least one full credential pair is set: `AUTH_ADMIN_USER` + `AUTH_ADMIN_PASS` or `AUTH_READONLY_USER` + `AUTH_READONLY_PASS` (auth is off if both pairs are missing)
- Restart the container after changing `.env`

**I changed my sounds but they didn't update**
- The soundboard reads files live, so new files should appear on the next page refresh. If they don't, make sure the files are inside the `audio-files/` folder or a first level subfolder (not a subfolder of a subfolder and so on)

**I changed login credentials in Settings and behavior changed**
- Updating auth credentials can invalidate current sessions. Log in again with the new credentials.

**Something else is wrong**
- You can check what's happening behind the scenes by running `docker compose logs -f` in your terminal — it'll show you any error messages from the bot
- If you're still stuck, open an [issue](https://github.com/giabb/BardBoard/issues) and I'll help! If you can attach the result of the previous command it will be much easier to understand the issue for me! 

**I want to inspect available API endpoints**
- Open `http://localhost:<WEB_PORT>/api-docs` for Swagger UI.
- Open `http://localhost:<WEB_PORT>/api-docs.json` for raw OpenAPI JSON.

---

## ⚙️ Advanced Configuration

If you want to tweak behavior, auth, network, and limits, these env vars are available:
The **Settings** page is admin-only and only shows runtime-editable values.

| Variable | Required | Default | Description | Where to change | Apply method |
|---|---|---|---|---|---|
| **DISCORD_TOKEN** | Yes | - | Discord bot token. | Settings UI or .env | Restart |
| **AUTH_ADMIN_USER** | No* | empty | Admin username. | Settings UI or .env | Restart |
| **AUTH_ADMIN_PASS** | No* | empty | Admin password. | Settings UI or .env | Restart |
| **AUTH_READONLY_USER** | No | empty | Optional readonly username. | Settings UI or .env | Restart |
| **AUTH_READONLY_PASS** | No | empty | Optional readonly password. | Settings UI or .env | Restart |
| **SESSION_SECRET** | Recommended | empty | Session signing secret (use 32+ chars). | Settings UI or .env | Restart |
| **LOGIN_REMEMBER_DAYS** | No | 30 | "Remember me" duration in days. | Settings UI or .env | Restart |
| **SESSION_DIR** | No | ./sessions | Session file storage directory. | Settings UI or .env | Restart |
| **NOISES_FOLDER** | No | !noises | Category folder used for overlay noises. | Settings UI or .env | Restart |
| **RATE_LIMIT_AUDIO** | No | 120 | Requests/minute for audio actions. | Settings UI or .env | Restart |
| **RATE_LIMIT_FILES** | No | 60 | Requests/minute for file actions. | Settings UI or .env | Restart |
| **RATE_LIMIT_AUDIO_STATUS** | No | 600 | Requests/minute for status polling. | Settings UI or .env | Restart |
| **RATE_LIMIT_PLAYLIST** | No | 120 | Requests/minute for playlist actions. | Settings UI or .env | Restart |
| **CORS_ORIGINS** | No | empty | Comma-separated allowed origins. | Settings UI or .env | Restart |
| **SESSION_FILE_RETRIES** | No | 5 | Session file-store retry attempts. | Settings UI or .env | Restart |
| **SESSION_FILE_RETRY_FACTOR** | No | 1 | Session file-store retry backoff factor. | Settings UI or .env | Restart |
| **SESSION_FILE_RETRY_MIN_MS** | No | 50 | Session file-store min retry delay (ms). | Settings UI or .env | Restart |
| **SESSION_FILE_RETRY_MAX_MS** | No | 200 | Session file-store max retry delay (ms). | Settings UI or .env | Restart |
| **SESSION_WRITE_RETRIES** | No | 6 | Extra write retries for transient file-lock races. | Settings UI or .env | Restart |
| **WEB_PORT** | No | 3000 | Web UI port. | .env only | docker compose up --build -d |
| **BOT_PORT** | No | 3001 | Bot/API port. | .env only | docker compose up --build -d |
| **BACKEND_URL** | No | http://localhost:3001 | Next.js API proxy target (set explicitly in .env; no variable expansion). | .env only | docker compose up --build -d |
| **UPLOAD_MAX_MB** | No | 50 | Max upload size per file (MB). | .env only | docker compose up --build -d |

\*Auth is enabled when at least one complete credential pair is configured (AUTH_ADMIN_* and/or AUTH_READONLY_*).
**Local (non-Docker) run**
- `ffmpeg` must be installed and available in your PATH for seek to work.
- Audio dependencies like `libsodium` are required for Discord voice support.

---

## 🗺️ What's Coming Next

Here's what's on the horizon for BardBoard:

- [ ] 💬 **Discord slash commands** — Play sounds with `/play` directly in chat, in addition to the web UI (considering if actually makes sense to do it).
- [ ] ✨ **Make things simpler** — I know the whole setup can be a lot for most of the users, so I hope to make things easier in the future! 

---

## 🤝 Contributing

BardBoard is open source and contributions are welcome! Whether it's a bug fix, a new feature, or just a typo in the docs — it all helps.

### 🐛 Found a Bug?
Open an [issue](https://github.com/giabb/BardBoard/issues) and describe what happened. Include any error messages you see (you can get them with `docker compose logs -f`).

### 💡 Got an Idea?
Open an issue and describe the feature! Explain what problem it solves and how you imagine it working.

### 💻 Want to Write Code?
1. Fork the repository
2. Create a branch for your change (`git checkout -b feature/your-feature`)
3. Make your changes and commit them with a clear message
4. Push to your fork and open a Pull Request

### 📖 Docs & Typos
Even small improvements to the README or documentation are appreciated — just fork, edit, and open a PR.

---

## 👥 Contributors

<div align="center">

**Project Creator & Maintainer**

[![Giovanbattista Abbate](https://github.com/giabb.png?size=100)](https://github.com/giabb)

**[Giovanbattista Abbate](https://github.com/giabb)**

</div>

---

*Want to contribute? See the [Contributing](#-contributing) section above!*

## 📄 License

This project is licensed under the **GNU General Public License v3.0**.

This means you can:
- ✅ Use the software for any purpose
- ✅ Study and modify the source code
- ✅ Distribute copies of the software
- ✅ Distribute modified versions

**Requirements:**
- 📋 Include the original license
- 📋 State changes made to the code
- 📋 Make source code available when distributing

See the [LICENSE.md](LICENSE.md) file for complete details.

---

<div align="center">

**Built for tabletop adventurers and Discord groups everywhere**

[⭐ Star this repo](https://github.com/giabb/BardBoard) • [🐛 Report Issues](https://github.com/giabb/BardBoard/issues) • [💬 Discussions](https://github.com/giabb/BardBoard/discussions)

</div>


