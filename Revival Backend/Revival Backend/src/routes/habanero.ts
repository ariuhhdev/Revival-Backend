import app from "..";

export default function () {
  app.get("/api/v1/games/fortnite/trackprogress/:accountId", async (c) => {
    return c.json([]);
  });
}
