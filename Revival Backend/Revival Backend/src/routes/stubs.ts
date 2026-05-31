import app from "..";

export default function () {
  app.post("/publickey/v1/publickey", (c) => c.json([]));

  app.get("/party/api/v1/Fortnite/user/:accountId", (c) => c.json({}));
  app.get("/party/api/v1/Fortnite/user/:accountId/notifications/undelivered/count", (c) => c.json({ count: 0 }));
  app.get("/party/api/v1/Fortnite/user/:accountId/settings/privacy", (c) => c.json({}));

  app.put("/profile/play_region", (c) => c.json({}));
  app.put("/profile/languages", (c) => c.json({}));
  app.put("/profile/privacy_settings", (c) => c.json({}));

  app.get("/api/v1/lfg/Fortnite/users/:accountId/settings", (c) => c.json({}));

  app.get("/statsproxy/api/statsv2/account/:accountId", (c) => c.json({}));

  app.get("/api/v1/links/history/:accountId", (c) => c.json([]));

  app.get("/api/v1/public/accounts", (c) => c.json([]));

  app.get("/api/content/v2/launch-data", (c) => c.json({}));

  app.post("/epic/oauth/v2/tokenInfo", (c) => c.json({}));

  app.get("/region", (c) => c.json({ region: "EU" }));

  app.get("/app_installation/status", (c) => c.json({}));

  app.get("/fortnite/api/game/v2/br-inventory/account/:accountId", (c) => c.json({}));

  app.get("/friends/api/v1/:accountId/summary", (c) => c.json({
    friends: [],
    incoming: [],
    outgoing: [],
    suggested: [],
    blocklist: [],
  }));

  app.get("/api/v2/interactions/latest/Fortnite/:accountId", (c) => c.json({}));
  app.get("/api/v2/interactions/aggregated/Fortnite/:accountId", (c) => c.json({}));

  app.get("/presence/api/v1/_/:accountId/last-online", (c) => c.json({ last_online: new Date().toISOString() }));

  app.get("/socialban/api/public/v1/:accountId", (c) => c.json({ bans: [] }));

  app.get("/epic/friends/v1/:accountId/blocklist", (c) => c.json({ friends: [] }));
}
