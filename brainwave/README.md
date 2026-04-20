# BRAINWAVE — MVP Setup Guide

A real-time multiplayer trivia game where only **correct AND unique** answers score points.

**Zero cost to run. Zero build tools. Just HTML + JavaScript + Supabase.**

---

## What You'll Do (≈30 minutes, first time)

1. Create a free Supabase account
2. Run one SQL script to set up the database
3. Paste 2 keys into `app.js`
4. Open `index.html` in your browser — game works locally
5. (Optional) Drag the folder to Vercel to get a public URL to share

---

## STEP 1 — Create a Supabase Project (5 min)

1. Go to [supabase.com](https://supabase.com) → click **Start your project**
2. Sign up with GitHub or email (free — no credit card)
3. Click **New Project**
   - Name: `brainwave`
   - Database password: anything strong (you won't need it for MVP)
   - Region: pick closest to you
4. Wait ~2 minutes for your project to provision

---

## STEP 2 — Set Up the Database (3 min)

1. In your Supabase dashboard, click **SQL Editor** in the left menu
2. Click **New Query**
3. Open `schema.sql` (in this folder), copy everything, paste into the editor
4. Click **Run** (bottom right)
5. You should see: `Success. No rows returned` — you're done

---

## STEP 3 — Enable Realtime (1 min)

1. Left menu → **Database** → **Replication**
2. Under **supabase_realtime**, toggle ON these tables:
   - `rooms`
   - `players`
   - `answers`

---

## STEP 4 — Get Your API Keys (2 min)

1. Left menu → **Project Settings** (gear icon) → **API**
2. Copy **Project URL** (looks like `https://xxxxx.supabase.co`)
3. Copy **anon public key** (the long `eyJhbGciOiJIUz...` string)
4. Open `app.js` in any text editor (Notepad is fine)
5. Replace these two lines near the top:
   ```js
   const SUPABASE_URL = 'PASTE_YOUR_PROJECT_URL_HERE';
   const SUPABASE_KEY = 'PASTE_YOUR_ANON_KEY_HERE';
   ```
6. Save the file

---

## STEP 5 — Run the Game Locally (1 min)

1. Double-click `index.html` — it opens in your browser
2. Click **Create Room** → enter your name → you're the host
3. Copy the link shown at the top
4. Open that link in a **different browser** (or incognito window) → enter a different name → you're now a second player
5. Back in the host tab, click **Start Game**
6. Play!

> **Tip:** To test with friends, skip to Step 6 to deploy publicly.

---

## STEP 6 — Deploy Public Link (Optional, 3 min)

1. Go to [vercel.com](https://vercel.com) → sign up (free)
2. Click **Add New** → **Project** → **Deploy**
3. Drag-and-drop the entire `brainwave` folder
4. Vercel gives you a URL like `brainwave-xyz.vercel.app`
5. Share that link with friends — they all join the same game in real time

---

## How the Game Works

**Host flow:**
1. Creates room → gets 6-character code
2. Shares link with friends
3. Sees lobby fill with players
4. Starts game when ready

**Every round:**
1. **Preview (4 sec):** Question shown, no input yet
2. **Answer (10 sec):** Everyone types their answer, submits (or time runs out)
3. **Results:** 🟢 BRAVO if correct AND unique / 🔴 NEXT TIME otherwise
4. Auto-advance to next question

**Scoring:**
- Correct + unique answer = **1 point**
- Correct but matched by another player = **0 points** (both lose!)
- Wrong answer = **0 points**

---

## MVP Scope (What's In / What's Not)

**✅ Included in this MVP:**
- Real-time multiplayer (up to 12 players tested)
- Create/join rooms with shareable code
- 10 hardcoded questions (General Knowledge)
- 10-second answer timer
- BRAVO / NEXT TIME result screens
- Live leaderboard
- Final winner announcement
- Fuzzy typo tolerance (Fuse.js)

**❌ Cut for MVP (add later if validated):**
- Multiple categories
- Configurable timer/question count
- "Too Hard?" voting
- Adaptive difficulty
- Pause/resume
- AI question generation
- AI answer evaluation
- 5,000 questions per category

---

## File Structure

```
brainwave/
├── README.md        ← this file
├── schema.sql       ← database setup (paste into Supabase)
├── index.html       ← the entire game UI
├── style.css        ← styling
├── app.js           ← game logic (edit this for your keys)
└── questions.json   ← starter questions
```

---

## Troubleshooting

**"Failed to create room"**
→ Check your SUPABASE_URL and SUPABASE_KEY in `app.js` are correct

**Players don't see each other in real time**
→ Step 3 (Enable Realtime) was skipped. Go back and toggle those tables.

**Game works locally but not on Vercel**
→ Supabase free tier blocks some domains. In Supabase: **Authentication → URL Configuration** → add your Vercel URL to allowed list.

**Want more questions?**
→ Edit `questions.json`. Or replace with a fetch from [OpenTDB](https://opentdb.com/api_config.php).

---

## Next Steps After Validation

Once 5–10 real friends play it and say "this is fun, I'd play again":

1. Add category selection (multiple question pools)
2. Add configurable timer/question count (host setup screen)
3. Add "Too Hard?" voting
4. Generate 500+ more questions from OpenTDB API
5. Polish mobile UI
6. Consider adding AI evaluation (costs $0.04/game)

**Do not add any of these until you have proof the core game is fun.**
