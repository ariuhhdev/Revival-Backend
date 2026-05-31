import { Hono } from "hono";
import { cors } from "hono/cors";
import fs from "node:fs";
import path from "node:path";
import { ensureConfigFile } from "./config/config";
import {
  atlasDataPath,
  atlasInstallPath,
  ensureAtlasDataLayout,
} from "./config/paths";
import { Atlas } from "./utils/handlers/errors";
import logger from "./utils/logger/logger";
import { loadRoutes } from "./utils/startup/loadRoutes";

const resolvedPortEnv = process.env.ATLAS_PORT ?? process.env.PORT ?? "3551";
const parsedPort = Number(resolvedPortEnv);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3551;
const DEFAULT_CURVE_PATH = "/Game/Athena/Balance/DataTables/AthenaGameData";

export const app = new Hono({ strict: false });
export default app;

ensureAtlasDataLayout();
ensureConfigFile();
ensureCurveDefaults();
ensureDataTableDefaults();

function parseJsonObject(filePath: string): Record<string, any> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

function getCurveSignature(curve: any): string {
  if (!curve || typeof curve !== "object") {
    return "";
  }

  const key = typeof curve.key === "string" ? curve.key.trim().toLowerCase() : "";
  if (!key) {
    return "";
  }

  const rawPathPart = typeof curve.pathPart === "string" ? curve.pathPart.trim() : "";
  const pathPart = (rawPathPart || DEFAULT_CURVE_PATH).toLowerCase();
  return `${pathPart}|||${key}`;
}

function getDataTableSignature(dataTable: any): string {
  if (!dataTable || typeof dataTable !== "object") {
    return "";
  }

  const rawPath = typeof dataTable.weaponPath === "string" ? dataTable.weaponPath.trim() : "";
  const weaponPath = rawPath.toLowerCase();
  const rawWeaponId =
    typeof dataTable.weaponId === "string" ? dataTable.weaponId.trim().toLowerCase() : "";
  if (weaponPath && rawWeaponId) {
    return `${weaponPath}|||${rawWeaponId}`;
  }

  if (!Array.isArray(dataTable.variants) || dataTable.variants.length === 0) {
    return "";
  }

  const variantIds = dataTable.variants
    .map((variant: any) =>
      typeof variant?.weaponId === "string" ? variant.weaponId.trim().toLowerCase() : "",
    )
    .filter(Boolean)
    .sort();
  if (variantIds.length === 0) {
    return "";
  }

  return `${weaponPath}|||${variantIds.join("||")}`;
}

function resolveShippedDefaultsPath(fileName: string): string {
  const installPath = atlasInstallPath("responses", fileName);
  if (fs.existsSync(installPath)) {
    return installPath;
  }

  return atlasDataPath("responses", fileName);
}

function ensureCurveDefaults() {
  const curvesPath = atlasDataPath("responses", "curves.json");
  const defaultsPath = resolveShippedDefaultsPath("curves.defaults.json");

  if (!fs.existsSync(defaultsPath)) {
    return;
  }

  try {
    if (!fs.existsSync(curvesPath)) {
      fs.mkdirSync(path.dirname(curvesPath), { recursive: true });
      fs.copyFileSync(defaultsPath, curvesPath);
      logger.info("[STARTUP] Initialized curves.json from curves.defaults.json");
      return;
    }

    const curves = parseJsonObject(curvesPath);
    const defaults = parseJsonObject(defaultsPath);
    if (!curves || !defaults) {
      return;
    }

    const existingSignatures = new Set<string>();
    Object.values(curves).forEach((curve) => {
      const signature = getCurveSignature(curve);
      if (signature) {
        existingSignatures.add(signature);
      }
    });

    let maxId = Math.max(
      0,
      ...Object.keys(curves)
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => Number.isFinite(id)),
    );

    let addedCount = 0;
    const defaultEntries = Object.entries(defaults).sort((a, b) => {
      const aId = Number.parseInt(a[0], 10);
      const bId = Number.parseInt(b[0], 10);
      const safeA = Number.isFinite(aId) ? aId : Number.MAX_SAFE_INTEGER;
      const safeB = Number.isFinite(bId) ? bId : Number.MAX_SAFE_INTEGER;
      return safeA - safeB;
    });

    defaultEntries.forEach(([, curve]) => {
      const signature = getCurveSignature(curve);
      if (!signature || existingSignatures.has(signature)) {
        return;
      }

      maxId += 1;
      curves[String(maxId)] = JSON.parse(JSON.stringify(curve));
      existingSignatures.add(signature);
      addedCount += 1;
    });

    if (addedCount > 0) {
      fs.writeFileSync(curvesPath, JSON.stringify(curves, null, 2));
      logger.info(`[STARTUP] Added ${addedCount} missing CurveTable default(s)`);
    }
  } catch (error) {
    logger.warning(
      `[STARTUP] Failed to merge CurveTable defaults: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function ensureDataTableDefaults() {
  const dataTablesPath = atlasDataPath("responses", "datatables.json");
  const defaultsPath = resolveShippedDefaultsPath("datatables.defaults.json");

  if (!fs.existsSync(defaultsPath)) {
    return;
  }

  try {
    if (!fs.existsSync(dataTablesPath)) {
      fs.mkdirSync(path.dirname(dataTablesPath), { recursive: true });
      fs.copyFileSync(defaultsPath, dataTablesPath);
      logger.info("[STARTUP] Initialized datatables.json from datatables.defaults.json");
      return;
    }

    const dataTables = parseJsonObject(dataTablesPath);
    const defaults = parseJsonObject(defaultsPath);
    if (!dataTables || !defaults) {
      return;
    }

    const existingSignatures = new Set<string>();
    Object.values(dataTables).forEach((dataTable) => {
      const signature = getDataTableSignature(dataTable);
      if (signature) {
        existingSignatures.add(signature);
      }
    });

    let maxId = Math.max(
      0,
      ...Object.keys(dataTables)
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => Number.isFinite(id)),
    );

    let addedCount = 0;
    const defaultEntries = Object.entries(defaults).sort((a, b) => {
      const aId = Number.parseInt(a[0], 10);
      const bId = Number.parseInt(b[0], 10);
      const safeA = Number.isFinite(aId) ? aId : Number.MAX_SAFE_INTEGER;
      const safeB = Number.isFinite(bId) ? bId : Number.MAX_SAFE_INTEGER;
      return safeA - safeB;
    });

    defaultEntries.forEach(([, dataTable]) => {
      const signature = getDataTableSignature(dataTable);
      if (!signature || existingSignatures.has(signature)) {
        return;
      }

      maxId += 1;
      dataTables[String(maxId)] = JSON.parse(JSON.stringify(dataTable));
      existingSignatures.add(signature);
      addedCount += 1;
    });

    if (addedCount > 0) {
      fs.writeFileSync(dataTablesPath, JSON.stringify(dataTables, null, 2));
      logger.info(`[STARTUP] Added ${addedCount} missing DataTable default(s)`);
    }
  } catch (error) {
    logger.warning(
      `[STARTUP] Failed to merge DataTable defaults: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

let lastDisplayedMessage = "";
let hasLoggedLauncherPing = false;

export function setStatusMessage(message: string) {
  const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, "").trim();
  if (!cleanMessage) {
    return;
  }

  if (cleanMessage !== lastDisplayedMessage) {
    lastDisplayedMessage = cleanMessage;
    logger.info(cleanMessage);
  }
}

app.use("*", cors());

app.notFound((c) => c.json(Atlas.basic.notFound, 404));

app.use(async (c, next) => {
  await next();

  if (c.req.path === "/unknown" && c.req.method === "GET") {
    if (!hasLoggedLauncherPing) {
      hasLoggedLauncherPing = true;
      setStatusMessage("[BACKEND] Elestia Backend was pinged by Launcher");
    }
    return c.text("OK");
  }

  if (c.req.path === "/images/icons/gear.png" || c.req.path === "/favicon.ico") {
    return;
  }

  logger.backend(`${c.req.path} | ${c.req.method} | Status ${c.res.status}`);
});

await loadRoutes(path.join(__dirname, "routes"), app);

const startServer = async () => {
  const server = Bun.serve({
    port: PORT,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/fortnite/api/game/v2/matchmakingservice/ws") {
        const upgraded = server.upgrade(req);
        if (upgraded) {
          return undefined;
        }
      }
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        setStatusMessage(`[MATCHMAKING] WebSocket connected`);
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
              }, 500);
              setTimeout(() => {
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({
                    name: "Play",
                    payload: { matchId, sessionId, joinDelaySec: 0 },
                  }));
                }
              }, 1000);
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
        setStatusMessage(`[MATCHMAKING] WebSocket disconnected`);
      },
    },
  });

  logger.backend(`Elestia Backend started on Port ${PORT}`);
  logger.info("Backend is running. Control via GUI application.");
};

startServer();
