/**
 * Elestia Launcher API Routes
 *
 * Handles Discord OAuth2 authentication and all launcher ↔ backend
 * communication required by the Elestia WPF launcher.
 *
 * Setup:
 *  1. Create a Discord application at https://discord.com/developers/applications
 *  2. Add redirect URI: http://26.59.51.222:3551/launcher/discord/callback
 *  3. Set these environment variables (or edit the constants below):
 *       DISCORD_CLIENT_ID      – your app's client id
 *       DISCORD_CLIENT_SECRET  – your app's client secret
 *       DISCORD_REDIRECT_URI   – http://26.59.51.222:3551/launcher/discord/callback
 *       ELESTIA_JWT_SECRET     – secret used to sign launcher tokens (any long string)
 *
 * Authentication flow:
 *  Launcher → GET /launcher/discord/login → redirect to Discord
 *  Discord  → GET /launcher/discord/callback?code=… → exchange code → save user → return token
 *  Launcher stores token locally and uses it for all subsequent calls.
 */

import app, { setStatusMessage } from "..";
import axios from "axios";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import { atlasDataPath } from "../config/paths";
import logger from "../utils/logger/logger";
import { v4 as uuidv4 } from "uuid";

// ─── Configuration ────────────────────────────────────────────────────────────

const DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID ?? "";
const DISCORD_CLIENT_SECRET =
  process.env.DISCORD_CLIENT_SECRET ?? "";
const DISCORD_REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI ??
  "";
const JWT_SECRET = process.env.ELESTIA_JWT_SECRET ?? "ElestiaLauncherSecret";

// ─── User Database (JSON file store) ─────────────────────────────────────────

const usersDir = atlasDataPath("launcher");
const usersFile = path.join(usersDir, "users.json");

interface LauncherUser {
  discordId: string;
  username: string;
  avatar: string | null;
  accountId: string;
  token: string;
  hwid: string | null;
  banned: boolean;
  createdAt: string;
}

function ensureUsersFile(): void {
  if (!fs.existsSync(usersDir)) {
    fs.mkdirSync(usersDir, { recursive: true });
  }
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify({}, null, 2));
  }
}

function readUsers(): Record<string, LauncherUser> {
  ensureUsersFile();
  try {
    return JSON.parse(fs.readFileSync(usersFile, "utf-8"));
  } catch {
    return {};
  }
}

function writeUsers(users: Record<string, LauncherUser>): void {
  ensureUsersFile();
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function getUserByDiscordId(discordId: string): LauncherUser | null {
  const users = readUsers();
  return users[discordId] ?? null;
}

function getUserByToken(token: string): LauncherUser | null {
  const users = readUsers();
  return Object.values(users).find((u) => u.token === token) ?? null;
}

function getUserByHwid(hwid: string): LauncherUser | null {
  const users = readUsers();
  return Object.values(users).find((u) => u.hwid === hwid) ?? null;
}

function upsertUser(user: LauncherUser): void {
  const users = readUsers();
  users[user.discordId] = user;
  writeUsers(users);
}

// ─── Exchange Codes (in-memory, same as Flipped original) ────────────────────

if (!global.exchangeCodes) {
  (global as any).exchangeCodes = [];
}

// ─── Pending Discord Auth Sessions (in-memory) ───────────────────────────────

interface PendingAuth {
  token?: string;
  discordId?: string;
  username?: string;
  avatar?: string | null;
  accountId?: string;
  error?: string;
  timestamp: number;
}

const pendingAuthSessions = new Map<string, PendingAuth>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingAuthSessions.entries()) {
    if (now - val.timestamp > 300_000) pendingAuthSessions.delete(key);
  }
}, 60_000);

// ─── Routes ──────────────────────────────────────────────────────────────────

export default function () {
    app.get("/launcher/discord/login", (c) => {
      const session = c.req.query("session") || uuidv4().replace(/-/g, "");
      pendingAuthSessions.set(session, { timestamp: Date.now() });
      const url = new URL("https://discord.com/api/oauth2/authorize");
      url.searchParams.set("client_id", DISCORD_CLIENT_ID);
      url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "identify email guilds.join");
      url.searchParams.set("state", session);
      return c.redirect(url.toString());
    });

  /**
   * GET /launcher/discord/callback?code=…
   * Discord redirects here after user authorizes.
   * Exchanges code → access_token → fetches user info → issues launcher token.
   */
  app.get("/launcher/discord/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state") || "";
    if (!code) {
      if (state) pendingAuthSessions.set(state, { error: "Missing authorization code", timestamp: Date.now() });
      return c.text("Missing authorization code", 400);
    }

    try {
      const tokenRes = await axios.post(
        "https://discord.com/api/oauth2/token",
        new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: DISCORD_REDIRECT_URI,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const discordToken: string = tokenRes.data.access_token;

      const userRes = await axios.get("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${discordToken}` },
      });

      const discordUser = userRes.data;
      const discordId: string = discordUser.id;
      const username: string =
        discordUser.global_name ?? discordUser.username ?? discordId;
      const avatarHash: string | null = discordUser.avatar ?? null;
      const avatarUrl = avatarHash
        ? `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`;

      let user = getUserByDiscordId(discordId);
      if (!user) {
        user = {
          discordId,
          username,
          avatar: avatarUrl,
          accountId: uuidv4().replace(/-/g, ""),
          token: uuidv4().replace(/-/g, ""),
          hwid: null,
          banned: false,
          createdAt: new Date().toISOString(),
        };
      } else {
        user.username = username;
        user.avatar = avatarUrl;
      }
      upsertUser(user);

      logger.info(`[LAUNCHER] Discord login: ${username} (${discordId})`);
      setStatusMessage(`[LAUNCHER] ${username} authenticated via Discord`);

      if (state && pendingAuthSessions.has(state)) {
        pendingAuthSessions.set(state, {
          token: user.token,
          discordId: user.discordId,
          username: user.username,
          avatar: user.avatar,
          accountId: user.accountId,
          timestamp: Date.now(),
        });
      }

      return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lunestia — Login Successful</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#0f0f0f 0%,#1a1a2e 50%,#16213e 100%);
      font-family:'Segoe UI',system-ui,sans-serif;color:#fff;overflow:hidden
    }
    body::before{
      content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;
      background:radial-gradient(circle at 30% 40%,rgba(88,101,242,.15) 0%,transparent 50%),
                 radial-gradient(circle at 70% 60%,rgba(114,137,218,.1) 0%,transparent 50%);
      animation:bgShift 20s ease-in-out infinite alternate
    }
    @keyframes bgShift{0%{transform:translate(0,0)}100%{transform:translate(-5%,5%)}}
    .card{
      position:relative;background:rgba(255,255,255,.04);backdrop-filter:blur(24px);
      -webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.08);
      border-radius:28px;padding:3rem 2.5rem;text-align:center;max-width:420px;width:90%;
      animation:slideUp .7s cubic-bezier(.4,0,.2,1);box-shadow:0 24px 80px rgba(0,0,0,.4)
    }
    @keyframes slideUp{from{opacity:0;transform:translateY(40px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
    .badge{
      display:inline-flex;align-items:center;gap:6px;
      background:rgba(88,101,242,.15);border:1px solid rgba(88,101,242,.3);
      border-radius:100px;padding:6px 14px;font-size:.75rem;font-weight:600;
      color:#7289da;margin-bottom:1.5rem;letter-spacing:.5px;text-transform:uppercase
    }
    .badge::before{content:'';width:6px;height:6px;border-radius:50%;background:#7289da;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .avatar{
      width:96px;height:96px;border-radius:50%;margin:0 auto 1.25rem;
      border:3px solid rgba(88,101,242,.4);box-shadow:0 0 30px rgba(88,101,242,.2);
      object-fit:cover
    }
    h1{font-size:1.6rem;font-weight:700;margin-bottom:.25rem}
    h1 span{
      background:linear-gradient(135deg,#5865F2,#7289da);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text
    }
    .subtitle{color:#72767d;font-size:.85rem;margin-bottom:2rem}
    .token-box{
      background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);
      border-radius:12px;padding:12px 16px;margin:16px 0;
      font-family:'Courier New',monospace;font-size:.85rem;
      color:#b3b3b3;word-break:break-all;text-align:left;user-select:all
    }
    .copy-btn{
      display:inline-flex;align-items:center;gap:8px;
      background:linear-gradient(135deg,#5865F2,#7289da);
      color:#fff;font-weight:600;font-size:.95rem;
      padding:14px 32px;border:none;border-radius:14px;cursor:pointer;
      transition:all .2s;text-decoration:none;
      box-shadow:0 4px 20px rgba(88,101,242,.3)
    }
    .copy-btn:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(88,101,242,.4)}
    .copy-btn:active{transform:translateY(0)}
    .footer{margin-top:1.5rem;font-size:.75rem;color:#4a4d55}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Authenticated</div>
    <img class="avatar" src="${avatarUrl}" alt="${username}" />
    <h1>Logged in as <span>${username}</span></h1>
    <p class="subtitle">Copy this token and paste it into Lunestia Launcher</p>
    <div class="token-box">${user.token}</div>
    <button class="copy-btn" onclick="navigator.clipboard.writeText('${user.token}').then(()=>{this.textContent='Copied!'}).catch(()=>{})">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copy Token
    </button>
    <p class="footer">Paste this token in the Lunestia Launcher login field</p>
  </div>
</body>
</html>`);
    } catch (err: any) {
      logger.error(`[LAUNCHER] Discord OAuth error: ${err.message}`);
      if (state) pendingAuthSessions.set(state, { error: err.message, timestamp: Date.now() });
      return c.text(`OAuth error: ${err.message}`, 500);
    }
  });

  app.get("/launcher/discord/poll", async (c) => {
    const session = c.req.query("session");
    if (!session) return c.json({ error: "Missing session" }, 400);
    const pending = pendingAuthSessions.get(session);
    if (!pending) return c.json({ pending: true });
    if (pending.error) return c.json({ error: pending.error });
    if (!pending.token) return c.json({ pending: true });
    pendingAuthSessions.delete(session);
    return c.json({
      pending: false,
      token: pending.token,
      user: {
        id: pending.discordId,
        display_name: pending.username,
        profile_picture: pending.avatar,
        account_id: pending.accountId,
      },
    });
  });

  // ─── Launcher token / HWID endpoints (called by the C# launcher) ───────────

  /**
   * GET /launcher/loginToken?token=…
   * Validates a launcher token. Returns 200 if valid, 500 if not.
   */
  app.get("/launcher/loginToken", async (c) => {
    const token = c.req.query("token");
    const user = token ? getUserByToken(token) : null;
    if (!user) {
      return c.json({ error: "Invalid token" }, 500);
    }
    return c.body(null, 200);
  });

  /**
   * GET /launcher/getDiscordId?token=…
   * Returns the Discord ID for a given token.
   */
  app.get("/launcher/getDiscordId", async (c) => {
    const token = c.req.query("token");
    const user = token ? getUserByToken(token) : null;
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json(user.discordId);
  });

  /**
   * GET /launcher/loginHWID?discordId=…&hwid=…
   * Associates a HWID with a Discord account.
   */
  app.get("/launcher/loginHWID", async (c) => {
    const discordId = c.req.query("discordId");
    const hwid = c.req.query("hwid");
    if (!discordId || !hwid) {
      return c.json({ error: "Missing parameters" }, 400);
    }
    const user = getUserByDiscordId(discordId);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    user.hwid = hwid;
    upsertUser(user);
    return c.body(null, 200);
  });

  /**
   * GET /launcher/checkhwid?hwid=…
   * Returns the Discord ID for a given HWID, or "banned" if user is banned.
   */
  app.get("/launcher/checkhwid", async (c) => {
    const hwid = c.req.query("hwid");
    if (!hwid) {
      return c.json({ error: "Missing hwid" }, 400);
    }
    const user = getUserByHwid(hwid);
    if (!user) {
      return c.json(null, 404);
    }
    if (user.banned) {
      return c.json("banned");
    }
    return c.json(user.discordId);
  });

  /**
   * GET /launcher/getUsername?discordId=…
   */
  app.get("/launcher/getUsername", async (c) => {
    const discordId = c.req.query("discordId");
    const user = discordId ? getUserByDiscordId(discordId) : null;
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.text(user.username);
  });

  /**
   * GET /launcher/getAvatar?discordId=…
   */
  app.get("/launcher/getAvatar", async (c) => {
    const discordId = c.req.query("discordId");
    const user = discordId ? getUserByDiscordId(discordId) : null;
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json(user.avatar ?? `https://cdn.discordapp.com/embed/avatars/0.png`);
  });

  /**
   * GET /launcher/user?token=…
   * Returns full user info for a launcher token.
   */
  app.get("/launcher/user", async (c) => {
    const token = c.req.query("token");
    if (!token) return c.json({ error: "Missing token" }, 400);
    const user = getUserByToken(token);
    if (!user) return c.json({ error: "Invalid token" }, 401);
    return c.json({
      id: user.discordId,
      display_name: user.username,
      profile_picture: user.avatar,
      account_id: user.accountId,
    });
  });

  /**
   * GET /fetch/exchange_code?discordId=…&hwid=…
   * Generates an exchange code for game authentication.
   */
  app.get("/fetch/exchange_code", async (c) => {
    const discordId = c.req.query("discordId");

    if (!discordId) {
      return c.text("Missing discordId", 400);
    }

    const user = getUserByDiscordId(discordId);
    if (!user) {
      logger.warning(`[LAUNCHER] Exchange code requested for unknown user: ${discordId}`);
      return c.body(null, 404);
    }

    logger.info(`[LAUNCHER] Exchange code issued for ${user.username}`);

    const exchange_code = uuidv4().replace(/-/g, "");

    (global as any).exchangeCodes.push({
      accountId: user.accountId,
      exchange_code,
      creatingClientId: "",
    });

    // Expire after 5 minutes
    setTimeout(() => {
      const codes: any[] = (global as any).exchangeCodes;
      const idx = codes.findIndex((i) => i.exchange_code === exchange_code);
      if (idx !== -1) codes.splice(idx, 1);
    }, 300_000);

    return c.text(exchange_code);
  });

/**
 * GET /launcher/update
 * Returns the latest launcher version and download URL for auto-updates.
 */
  app.get("/launcher/update", (c) => {
    return c.json({
      latestVersion: "1.1.0",
      downloadUrl: "https://xxiyiwguhxxexlnjacyc.supabase.co/storage/v1/object/public/elestiamp/Elestia%20Launcher_1.1.0_x64_en-US.msi",
      releaseNotes: "Complete UI redesign with premium glassmorphism, animated backgrounds, and enhanced interactions.",
    });
  });

/**
    * GET /fetch/version
    * Returns the backend version for launcher update checks.
    */
   app.get("/fetch/version", (c) => {
     return c.text("1.0.0");
   });

  /**
   * GET /fetch/news1  /fetch/news2  /fetch/news3
   * In-launcher news panels.
   */
  app.get("/fetch/news1", (c) =>
    c.json({
      header: "Elestia",
      date: new Date().toISOString().split("T")[0],
      desc: "Welcome to Elestia! Join our community and enjoy the best private server experience.",
    })
  );

  app.get("/fetch/news2", (c) =>
    c.json({
      header: "Version 1.0.0",
      date: new Date().toISOString().split("T")[0],
      desc: "Elestia has officially launched. Jump in and start playing!",
    })
  );

  app.get("/fetch/news3", (c) =>
    c.json({
      header: "XP & Quests",
      date: new Date().toISOString().split("T")[0],
      desc: "Complete quests and earn XP to level up your Battle Pass.",
    })
  );

  /**
   * GET /selectedSkin?discordId=…
   * Returns the icon URL of the player's selected skin via fortnite-api.com.
   */
  app.get("/selectedSkin", async (c) => {
    const discordId = c.req.query("discordId");
    if (!discordId) {
      return c.text("Missing discordId", 400);
    }

    // Default skin if no profile data is available
    const defaultCid = "CID_001_Athena_Commando_F_Default";
    try {
      const res = await axios.get(
        `https://fortnite-api.com/v2/cosmetics/br/${defaultCid}`
      );
      return c.json(res.data?.data?.images?.icon ?? "");
    } catch {
      return c.json("");
    }
  });

  /**
   * GET /profile/vbucks?discordId=…
   */
  app.get("/profile/vbucks", async (c) => {
    return c.json(0);
  });

  /**
   * GET /api/launcher/shop
   * Returns current item shop rotation with cosmetic images via fortnite-api.com.
   */
  app.get("/api/launcher/shop", async (c) => {
    const shopItems = [
      { id: "CID_028_Athena_Commando_F", name: "Recon Expert" },
      { id: "CID_69420_Athena_Commando_F_Grind", name: "Grind" },
      { id: "Pickaxe_ID_123_FiveShapes", name: "Five Shapes" },
      { id: "Wrap_ID_456_Toxic", name: "Toxic Wrap" },
      { id: "CID_017_Athena_Commando_M", name: "Renegade Raider" },
      { id: "CID_116_Athena_Commando_F_StreetRacer", name: "Crystal" },
    ];

    const enrich = async (items: { id: string; name: string }[]) => {
      const results = [];
      for (const item of items) {
        try {
          const res = await axios.get(`https://fortnite-api.com/v2/cosmetics/br/${item.id}`);
          const data = res.data?.data;
          results.push({
            id: item.id,
            name: data?.name ?? item.name,
            icon: data?.images?.icon ?? "",
            itemGrants: [item.id],
          });
        } catch {
          results.push({ id: item.id, name: item.name, icon: "", itemGrants: [item.id] });
        }
      }
      return results;
    };

    return c.json({
      featured: await enrich(shopItems.slice(0, 3)),
      daily: await enrich(shopItems.slice(3)),
    });
  });

  /**
   * GET /api/launcher/leaderboard
   * Returns all registered users ranked by join order (placeholder hype division).
   */
  app.get("/api/launcher/leaderboard", async (c) => {
    const users = readUsers();
    const divisions = ["Bronze", "Silver", "Gold", "Diamond", "Elite", "Champion", "Unreal"];
    const entries = Object.values(users)
      .filter((u) => !u.banned)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((u, i) => ({
        username: u.username,
        division: divisions[Math.min(Math.floor(i / 2), divisions.length - 1)],
        hype: Math.max(0, 5000 - i * 200 + Math.floor(Math.random() * 500)),
      }));
    return c.json(entries);
  });

  /**
   * POST /launcher/admin/ban?discordId=…&banned=true
   * Simple admin endpoint – protect this in production!
   */
  app.post("/launcher/admin/ban", async (c) => {
    const discordId = c.req.query("discordId");
    const banned = c.req.query("banned") !== "false";
    if (!discordId) return c.json({ error: "Missing discordId" }, 400);
    const user = getUserByDiscordId(discordId);
    if (!user) return c.json({ error: "User not found" }, 404);
    user.banned = banned;
    upsertUser(user);
    logger.info(`[LAUNCHER] ${discordId} banned=${banned}`);
    return c.json({ success: true, discordId, banned });
  });
}
