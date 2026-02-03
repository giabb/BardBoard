<div align="center">

# 🎵 BardBoard & Dragons 🐉

**Your personal soundboard, right inside Discord.**

Play sound effects, ambient music, and voice lines directly into your voice channel — all from a single, clean web interface. Perfect for D&D sessions, watch parties, or anything in between.

[![License](https://img.shields.io/badge/License-GPL%203.0-red.svg)](LICENSE.md) [![Discord](https://img.shields.io/badge/Made%20for-Discord-5865F2.svg)](https://discord.com) [![Docker](https://img.shields.io/badge/Runs%20on-Docker-2496ED.svg)](https://docker.com)

</div>

---

## 📋 Table of Contents
- [✨ What is BardBoard?](#-what-is-bardboard)
- [📋 What You'll Need](#-what-youll-need)
- [🚀 Getting Started](#-getting-started)
- [🎵 Adding Your Sounds](#-adding-your-sounds)
- [🎮 How to Use It](#-how-to-use-it)
- [⚠️ Troubleshooting](#-troubleshooting)
- [🗺️ What's Coming Next](#-whats-coming-next)
- [🤝 Contributing](#-contributing)
- [👥 Contributors](#-contributors)
- [📄 License](#-license)

---

## ✨ What is BardBoard?

BardBoard is a Discord bot with a built-in web soundboard. You open it in your browser, see all your sounds laid out as buttons, and tap one — it plays instantly in your Discord voice channel. Everyone in the channel hears it.

![BardBoard GUI](https://i.ibb.co/GQqJvB2z/bardboard.png)

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
- **A Discord Bot Token** — don't worry, we'll walk you through creating one below

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

### Step 3 — Find Your Voice Channel ID

1. Enable [Developer Mode](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID#h_01HRSTXPS5CRSRTWYCGPHZQ37H)
2. Retrieve your [Channel ID](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID#h_01HRSTXPS5FMK2A5SMVSX4JW4E)

### Step 4 — Download and Configure BardBoard

1. Download or clone this repository to a folder on your computer
2. Inside that folder, copy the file `.env.sample` and rename it to `.env`
3. Open it and replace the values with your own Discord Bot Token and Voice Channel ID retrieved in Step 1 and 3.

### Step 5 — Start It Up

1. Open a terminal (or PowerShell on Windows) in the BardBoard folder
2. Run this single command:

```
docker compose up --build -d
```

3. Wait a few seconds for it to start up
4. Open your browser and go to **http://localhost:3000**

You should see the BardBoard interface. If your voice channel ID is set correctly and the bot is in your server, you're all set! 🎉

---

## 🎵 Adding Your Sounds

BardBoard reads audio files from the `audio-files` folder inside the project directory. Just drop your files in there, and they will appear on the soundboard after a browser refresh.

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

---

## 🎮 How to Use It

Open **http://localhost:3000** in any browser on your network. Here's what you'll find:

### The Soundboard

The main area of the page is your soundboard — a grid of buttons, one per sound. Just **tap or click** a button and it plays in your Discord voice channel immediately. The button for the currently playing sound lights up so you always know what's on.

### The Controls (top bar)

- 🔊 **Volume slider** — Drag it left or right to adjust how loud the sound plays in Discord. Changes apply instantly.
- 🔁 **Repeat** — Tap this to loop the current sound. It'll keep playing on repeat until you stop it or play something else. Tap again to turn it off.
- ⏹️ **Stop** — Stops whatever is currently playing.

### Now Playing Bar

Right below the controls you'll see a strip that shows you what's playing right now, along with a **progress bar**. You can **click or drag** anywhere on that bar to jump to a different part of the sound — handy if you want to skip to a specific moment in a longer track.

### Using It on Mobile

The soundboard works on phones and tablets too. The progress bar supports touch dragging, so seeking works just as well on mobile as on desktop.

---

## ⚠️ Troubleshooting

**Nothing is playing when I tap a button**
- Make sure the bot is in your Discord server and has the **Connect** and **Speak** permissions in the voice channel
- Check that `CHANNEL_ID` in your `.env` file matches the voice channel you want the bot to join

**The soundboard is empty**
- Make sure there are audio files in the `audio-files/` folder
- Supported formats are MP3, WAV, OGG, and M4A — other formats won't show up

**The bot isn't online in Discord**
- Double-check your `DISCORD_TOKEN` in the `.env` file — make sure there are no extra spaces or line breaks
- Try restarting with `docker compose restart`

**I changed my sounds but they didn't update**
- The soundboard reads files live, so new files should appear on the next page refresh. If they don't, make sure the files are inside the `audio-files/` folder or a first level subfolder (not a subfolder of a subfolder and so on)

**Something else is wrong**
- You can check what's happening behind the scenes by running `docker compose logs -f` in your terminal — it'll show you any error messages from the bot
- If you're still stuck, open an [issue](https://github.com/giabb/BardBoard/issues) and I'll help! If you can attach the result of the previous command it will be much easier to understand the issue for me! 

---

## 🗺️ What's Coming Next

Here's what's on the horizon for BardBoard:

- [ ] 🎶 **Playlist mode** — Queue up multiple sounds and let them play one after another
- [ ] 💬 **Discord slash commands** — Play sounds with `/play` directly in chat, in addition to the web UI
- [ ] 🌐 **Multi-channel support** — Run separate soundboards for different voice channels at the same time
- [ ] 🎨 **Category colours** — Give each category its own colour theme on the soundboard
- [ ] 📤 **In-browser uploads** — Add sounds by dragging and dropping files right onto the web UI
- [ ] 🔍 **Search** — Filter your sounds in real time as your library grows
- [ ] ✨ **Make things simpler** — I know the whole setup can be a lot for most of the users, so I hope to make things easier in the future! 

---

## 🤝 Contributing

BardBoard is open source and we welcome contributions! Whether it's a bug fix, a new feature, or just a typo in the docs — it all helps.

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