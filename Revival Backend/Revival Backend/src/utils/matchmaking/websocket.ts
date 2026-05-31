import { setStatusMessage } from "../../index";
import { getConfiguredMatchmakerPort } from "./config";

interface MatchmakingPayload {
  region?: string;
  playlist?: string;
  type?: string;
  key?: string;
  bucket?: string;
  version?: string;
}

interface WsSession {
  id: string;
  accountId: string;
  playlist: string;
  region: string;
  state: string;
}

const wsSessions: Map<string, WsSession> = new Map();

export function startMatchmakingWebSocket(port: number = getConfiguredMatchmakerPort()) {
  Bun.serve({
    port,
    fetch(req, server) {
      const success = server.upgrade(req);
      if (success) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    },
    websocket: {
      open(ws) {
        setStatusMessage(`[MATCHMAKING] Connected`);
        wsSessions.set(ws.data.id || crypto.randomUUID(), {
          id: ws.data.id || crypto.randomUUID(),
          accountId: "unknown",
          playlist: "Playlist_DefaultSolo",
          region: "NAE",
          state: "Connecting",
        });
      },
      message(ws, message) {
        try {
          const payload = JSON.parse(message as string);
          setStatusMessage(`[MATCHMAKING] Received: ${payload.name || "unknown"}`);

          const sessionId = crypto.randomUUID().replace(/-/gi, "").toUpperCase();
          const matchId = crypto.randomUUID().replace(/-/gi, "").toUpperCase();

          switch (payload.name) {
            case "StartMatchmaking":
            case "UpdateMatchmaking":
              ws.send(JSON.stringify({
                name: "StatusUpdate",
                payload: { state: "Queued", queuedPlayers: 0, estimatedWaitSec: 0 },
              }));
              setTimeout(() => {
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({
                    name: "StatusUpdate",
                    payload: { state: "SessionAssignment", matchId },
                  }));
                }
              }, 2000);
              setTimeout(() => {
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({
                    name: "Play",
                    payload: { matchId, sessionId, joinDelaySec: 1 },
                  }));
                }
              }, 4000);
              break;
            case "RemoveFromMatchmaking":
            case "CancelMatchmaking":
              ws.send(JSON.stringify({
                name: "StatusUpdate",
                payload: { state: "Removed" },
              }));
              break;
            default:
              ws.send(JSON.stringify({
                name: "StatusUpdate",
                payload: { state: "Ready" },
              }));
              break;
          }
        } catch (error) {
          console.error(`[Matchmaking] Error processing message: ${error}`);
        }
      },
      close(ws) {
        setStatusMessage(`[MATCHMAKING] Disconnected`);
      },
    },
  });
}
