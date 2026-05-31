import app from "..";
import getVersion from "../utils/handlers/getVersion";

export default function () {
    app.get("/api/v1/events/Fortnite/download/:accountId", async (c) => {
        return c.json([]);
    });

    app.post("/api/v1/events/Fortnite/:eventId/:eventWindowId/:accountId", async (c) => {
        return c.json({ success: true });
    });

    app.get("/api/v1/events/Fortnite/:eventId/history/:accountId", async (c) => {
        return c.json([]);
    });

    app.get("/api/v1/leaderboards/Fortnite/:eventId/:eventWindowId/:accountId", async (c) => {
        return c.json({ entries: [], gameId: "Fortnite" });
    });
}
