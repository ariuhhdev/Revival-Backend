import app, { setStatusMessage } from "..";
import jwt from "jsonwebtoken";
import getVersion from "../utils/handlers/getVersion";
import {
  getConfiguredGameServer,
  getConfiguredMatchmakerUrl,
  parseHostPort,
} from "../utils/matchmaking/config";

interface MatchmakingSessionInfo {
  buildUniqueId: string;
  serverAddress: string;
  serverPort: number;
  playlistName: string;
  region: string;
}

const matchmakingSessions: Record<string, MatchmakingSessionInfo> = {};
const activeSessions: Record<string, any> = {};

function getAccountIdFromRequest(c: any): string {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return "default";
  }

  const token = authHeader.replace(/^bearer\s+/i, "").replace(/^eg1~/, "");
  if (!token) {
    return "default";
  }

  try {
    const decoded = jwt.verify(token, "ElestiaKey") as any;
    return decoded.accountId || decoded.email || decoded.sub || "default";
  } catch {
    return "default";
  }
}

function getStoredSessionInfo(accountId: string): MatchmakingSessionInfo {
  const stored = matchmakingSessions[accountId];
  if (stored) {
    return stored;
  }

  const configuredServer = getConfiguredGameServer();
  return {
    buildUniqueId: "0",
    serverAddress: configuredServer.host,
    serverPort: configuredServer.port,
    playlistName: "Playlist_DefaultSolo",
    region: "NAE",
  };
}

export default function () {
  app.get("/waitingroom/api/waitingroom", async (c) => {
    return c.json([]);
  });
  app.get("/fortnite/api/matchmaking/session/findPlayer/:id", async (c) => {
    const sessions = Object.values(activeSessions).filter((s: any) =>
      s.publicPlayers?.some((p: any) => p.accountId === c.req.param("id"))
    );
    return c.json(sessions);
  });

  app.post("/fortnite/api/matchmaking/session", async (c) => {
    const sessionId = crypto.randomUUID().replace(/-/gi, "").toUpperCase();
    const accountId = getAccountIdFromRequest(c);
    const body = await c.req.json().catch(() => ({}));

    const playlist = body.attributes?.PLAYLISTNAME_s || "Playlist_DefaultSolo";
    const region = body.attributes?.REGION_s || "NAE";
    const configuredServer = getConfiguredGameServer();
    const serverAddress = body.serverAddress || configuredServer.host;
    const serverPort = body.serverPort || configuredServer.port;

    activeSessions[sessionId] = {
      id: sessionId,
      ownerId: accountId,
      ownerName: body.ownerName || `[DS]${accountId}`,
      serverName: body.serverName || `[DS]${accountId}`,
      serverAddress,
      serverPort,
      maxPublicPlayers: body.maxPublicPlayers || 100,
      openPublicPlayers: body.maxPublicPlayers || 100,
      maxPrivatePlayers: 0,
      openPrivatePlayers: 0,
      attributes: {
        REGION_s: region,
        GAMEMODE_s: "FORTATHENA",
        ALLOWBROADCASTING_b: true,
        SUBREGION_s: "GB",
        DCID_s: "FORTNITE-LIVEEUGCEC1C2E30UBRCORE0A-14840880",
        tenant_s: "Fortnite",
        MATCHMAKINGPOOL_s: "Any",
        STORMSHIELDDEFENSETYPE_i: 0,
        HOTFIXVERSION_i: 0,
        PLAYLISTNAME_s: playlist,
        SESSIONKEY_s: crypto.randomUUID().replace(/-/gi, "").toUpperCase(),
        TENANT_s: "Fortnite",
        BEACONPORT_i: 15009,
        ...body.attributes,
      },
      publicPlayers: [],
      privatePlayers: [],
      totalPlayers: 0,
      allowJoinInProgress: true,
      shouldAdvertise: true,
      isDedicated: true,
      usesStats: false,
      allowInvites: false,
      usesPresence: false,
      allowJoinViaPresence: true,
      allowJoinViaPresenceFriendsOnly: false,
      buildUniqueId: body.buildUniqueId || "0",
      lastUpdated: new Date().toISOString(),
      started: true,
    };

    matchmakingSessions[accountId] = {
      buildUniqueId: body.buildUniqueId || "0",
      serverAddress,
      serverPort,
      playlistName: playlist,
      region,
    };

    setStatusMessage(`\x1b[33m[MATCHMAKING]\x1b[0m Session created: ${sessionId} by ${accountId} (${playlist})`);
    return c.json(activeSessions[sessionId], 201);
  });

  app.get("/fortnite/api/matchmaking/session/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = activeSessions[sessionId];
    if (!session) {
      const accountId = getAccountIdFromRequest(c);
      const sessionInfo = getStoredSessionInfo(accountId);
      return c.json({
        id: sessionId,
        ownerId: crypto.randomUUID().replace(/-/gi, "").toUpperCase(),
        ownerName: "[DS]fortnite-liveeugcec1c2e30ubrcore0a-z8hj-1968",
        serverName: "[DS]fortnite-liveeugcec1c2e30ubrcore0a-z8hj-1968",
        serverAddress: sessionInfo.serverAddress,
        serverPort: sessionInfo.serverPort,
        maxPublicPlayers: 220,
        openPublicPlayers: 175,
        maxPrivatePlayers: 0,
        openPrivatePlayers: 0,
        attributes: {
          REGION_s: sessionInfo.region,
          GAMEMODE_s: "FORTATHENA",
          ALLOWBROADCASTING_b: true,
          SUBREGION_s: "GB",
          DCID_s: "FORTNITE-LIVEEUGCEC1C2E30UBRCORE0A-14840880",
          tenant_s: "Fortnite",
          MATCHMAKINGPOOL_s: "Any",
          STORMSHIELDDEFENSETYPE_i: 0,
          HOTFIXVERSION_i: 0,
          PLAYLISTNAME_s: sessionInfo.playlistName,
          SESSIONKEY_s: crypto.randomUUID().replace(/-/gi, "").toUpperCase(),
          TENANT_s: "Fortnite",
          BEACONPORT_i: 15009,
        },
        publicPlayers: [],
        privatePlayers: [],
        totalPlayers: 45,
        allowJoinInProgress: false,
        shouldAdvertise: false,
        isDedicated: false,
        usesStats: false,
        allowInvites: false,
        usesPresence: false,
        allowJoinViaPresence: true,
        allowJoinViaPresenceFriendsOnly: false,
        buildUniqueId: sessionInfo.buildUniqueId,
        lastUpdated: new Date().toISOString(),
        started: true,
      });
    }
    return c.json(session);
  });

  app.put("/fortnite/api/matchmaking/session/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await c.req.json().catch(() => ({}));
    if (activeSessions[sessionId]) {
      activeSessions[sessionId] = { ...activeSessions[sessionId], ...body, lastUpdated: new Date().toISOString() };
      setStatusMessage(`\x1b[33m[MATCHMAKING]\x1b[0m Session updated: ${sessionId}`);
    }
    return c.json(activeSessions[sessionId] || {});
  });

  app.delete("/fortnite/api/matchmaking/session/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    delete activeSessions[sessionId];
    setStatusMessage(`\x1b[33m[MATCHMAKING]\x1b[0m Session deleted: ${sessionId}`);
    return c.json({});
  });

  app.post("/fortnite/api/matchmaking/session/:sessionId/remove", async (c) => {
    const sessionId = c.req.param("sessionId");
    delete activeSessions[sessionId];
    return c.json({});
  });

  app.post("/fortnite/api/matchmaking/session/:sessionId/refresh", async (c) => {
    const sessionId = c.req.param("sessionId");
    if (activeSessions[sessionId]) {
      activeSessions[sessionId].lastUpdated = new Date().toISOString();
    }
    return c.json(activeSessions[sessionId] || {});
  });

  app.post("/fortnite/api/matchmaking/session/:sessionId/updatePlayer", async (c) => {
    return c.json({});
  });

  app.post("/fortnite/api/matchmaking/session/:sessionId/join", async (c) => {
    const sessionId = c.req.param("sessionId");
    if (activeSessions[sessionId]) {
      activeSessions[sessionId].totalPlayers = (activeSessions[sessionId].totalPlayers || 0) + 1;
      activeSessions[sessionId].openPublicPlayers = Math.max(0, (activeSessions[sessionId].openPublicPlayers || 0) - 1);
    }
    return c.json([]);
  });

  app.get("/fortnite/api/matchmaking/session/matchMakingRequest", async (c) => {
    setStatusMessage("\x1b[33m[MATCHMAKING]\x1b[0m Request received");
    return c.json(Object.values(activeSessions));
  });

  app.get("/fortnite/api/game/v2/matchmakingservice/ticket/player/*", async (c) => {
    const bucketId = c.req.query("bucketId") ?? "";
    const playerMatchmakingKey = c.req.query("player.option.customKey");
    const bucketParts = bucketId.split(":");
    const playerPlaylist = bucketParts[3] || "Playlist_DefaultSolo";
    const playerRegion = bucketParts[2] || "NAE";
    const ver = getVersion(c);
    const accountId = getAccountIdFromRequest(c);

    const configuredServer = getConfiguredGameServer();
    const customServer =
      typeof playerMatchmakingKey === "string" ? parseHostPort(playerMatchmakingKey) : null;
    const selectedServer = customServer ?? configuredServer;

    matchmakingSessions[accountId] = {
      buildUniqueId: bucketParts[0] || "0",
      serverAddress: selectedServer.host,
      serverPort: selectedServer.port,
      playlistName: playerPlaylist,
      region: playerRegion,
    };

    setStatusMessage(`\x1b[33m[MATCHMAKING]\x1b[0m Ticket created for ${accountId}`);

    const mmData = jwt.sign(
      {
        region: playerRegion,
        playlist: playerPlaylist,
        type: customServer ? "custom" : "normal",
        key: customServer ? playerMatchmakingKey : undefined,
        bucket: bucketId,
        version: `${ver.build}`,
        accountId: accountId,
      },
      "LVe51Izk03lzceNf1ZGZs0glGx5tKh7f",
    );
    var data = mmData.split(".");
    return c.json({
      serviceUrl: getConfiguredMatchmakerUrl(),
      ticketType: "mms-player",
      payload: data[0],
      signature: "account",
    });
  });

  app.get("/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId", async (c) => {
    const accountId = c.req.param("accountId");
    const sessionId = c.req.param("sessionId");
    setStatusMessage(`\x1b[33m[MATCHMAKING]\x1b[0m Session validation`);
    
    const sessionKey = crypto.randomUUID().replace(/-/gi, "");
    return c.json({
      accountId: accountId,
      sessionId: sessionId,
      key: sessionKey,
    });
  });

  app.post("/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId", async (c) => {
    const accountId = c.req.param("accountId");
    const sessionId = c.req.param("sessionId");
    setStatusMessage(`\x1b[33m[MATCHMAKING]\x1b[0m Session confirmed`);
    
    return c.json({
      accountId: accountId,
      sessionId: sessionId,
      key: "none",
    });
  });

  app.get("/fortnite/api/game/v2/matchmaking/session/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = activeSessions[sessionId];
    if (session) {
      return c.json(session);
    }
    return c.json({});
  });
}
