import app from "..";
import getVersion from "../utils/handlers/getVersion";
import { Atlas } from "../utils/handlers/errors";
import { atlasDataReadPath } from "../config/paths";
import fs from "node:fs";
import crypto from "crypto";

const DEFAULT_DISCOVERY_IMAGE =
  "https://raw.githubusercontent.com/cipherfps/ATLAS-Backend/refs/heads/gui/public/playlists/Late-Game-Arena.png";
const SEASON_29_PLUS_PRIMARY_PLAYLISTS = [
  "playlist_defaultsolo",
] as const;

type DiscoveryLink = Record<string, any>;
type DiscoverySurface = Record<string, any>;

function readJsonFile(...parts: string[]): any {
  return JSON.parse(fs.readFileSync(atlasDataReadPath(...parts), "utf-8"));
}

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function getNormalDiscoverySurface(): DiscoverySurface {
  return readJsonFile("static", "discovery", "menu.json");
}

function buildImageUrls(imageUrl: string): Record<string, string> {
  return {
    url_s: imageUrl,
    url_xs: imageUrl,
    url_m: imageUrl,
    url: imageUrl,
  };
}

function getLatestDiscoveryLinks(): DiscoveryLink[] {
  const latestMenu = readJsonFile("static", "discovery", "latest", "menu.json");
  const brPlaylist = readJsonFile("static", "discovery", "latest", "brplaylist.json");

  const links = [
    ...(Array.isArray(latestMenu) ? latestMenu : [latestMenu]),
    ...(Array.isArray(brPlaylist) ? brPlaylist : [brPlaylist]),
  ]
    .filter(Boolean)
    .map((link) => cloneDeep(link));

  return links;
}

function getSurfaceResults(surface: DiscoverySurface): any[] {
  const results = surface?.Panels?.[0]?.Pages?.[0]?.results;
  return Array.isArray(results) ? results : [];
}

function makeSurfaceEntry(link: DiscoveryLink): Record<string, any> {
  return {
    linkData: link,
    lastVisited: null,
    linkCode: link.mnemonic || link.linkCode || "",
    isFavorite: false,
  };
}

function findLinkByMnemonic(links: DiscoveryLink[], mnemonic: string): DiscoveryLink | null {
  return links.find((link) => link?.mnemonic === mnemonic) ?? null;
}

function populateModeSets(surface: DiscoverySurface, latestLinks: DiscoveryLink[]): DiscoverySurface {
  surface.ModeSets = {};

  for (const link of latestLinks) {
    if (link?.linkType === "ModeSet" && typeof link.mnemonic === "string") {
      surface.ModeSets[link.mnemonic] = cloneDeep(link);
    }
  }

  return surface;
}

function makeSurfaceEntry(link: DiscoveryLink): Record<string, any> {
  return {
    linkData: link,
    lastVisited: null,
    linkCode: link.mnemonic || link.linkCode || "",
    isFavorite: false,
  };
}

function findLinkByMnemonic(links: DiscoveryLink[], mnemonic: string): DiscoveryLink | null {
  return links.find((link) => link?.mnemonic === mnemonic) ?? null;
}

function findSurfaceLinkByMnemonic(surface: DiscoverySurface, mnemonic: string): DiscoveryLink | null {
  for (const result of getSurfaceResults(surface)) {
    if (result?.linkData?.mnemonic === mnemonic) {
      return result.linkData;
    }
  }

  return null;
}

function buildDiscoverySurfaceResponse(ver: ReturnType<typeof getVersion>): DiscoverySurface {
  const normalSurface = getNormalDiscoverySurface();
  if (ver.season < 23) {
    return normalSurface;
  }

  const latestLinks = getLatestDiscoveryLinks();
  const surface = cloneDeep(normalSurface);

  if (ver.season >= 27) {
    const populatedSurface = populateModeSets(surface, latestLinks);
    return populatedSurface;
  }

  surface.ModeSets = {};
  return surface;
}

function getMnemonicLinks(ver: ReturnType<typeof getVersion>): DiscoveryLink[] {
  const links =
    ver.season >= 27
      ? getLatestDiscoveryLinks()
      : getSurfaceResults(buildDiscoverySurfaceResponse(ver))
    .map((result) => result?.linkData)
    .filter(Boolean);

  return links;
}

function buildApiV2SurfaceResponse(ver: ReturnType<typeof getVersion>): Record<string, any> {
  const links = getMnemonicLinks(ver);
  const availableMnemonics = new Set(
    links
      .map((link) => (typeof link?.mnemonic === "string" ? link.mnemonic : ""))
      .filter(Boolean),
  );

  const curatedHomebar = availableMnemonics.has("reference_byepicnocompetitive_5")
    ? ["reference_byepicnocompetitive_5"]
    : [];

  const preferredPanelCodes = (
    ver.season >= 29
      ? [...SEASON_29_PLUS_PRIMARY_PLAYLISTS]
      : [
          "set_br_playlists",
          "playlist_defaultsolo",
        ]
  ).filter((mnemonic) => availableMnemonics.has(mnemonic));

  const fallbackCodes = links
    .map((link) => (typeof link?.mnemonic === "string" ? link.mnemonic : ""))
    .filter(
      (mnemonic) =>
        mnemonic &&
        mnemonic !== "reference_byepicnocompetitive_5" &&
        !preferredPanelCodes.includes(mnemonic),
    );

  const panelCodes = [...preferredPanelCodes, ...fallbackCodes].slice(0, 8);
  const makeSurfaceResult = (linkCode: string, globalCCU = 1) => ({
    lastVisited: null,
    linkCode,
    isFavorite: false,
    favoriteStatus: "NONE",
    globalCCU,
    lockStatus: "UNLOCKED",
    lockStatusReason: "NONE",
    isVisible: true,
  });

  return {
    panels: [
      {
        panelName: "Homebar_V3",
        panelDisplayName: "Test_EpicsPicksHomebar",
        featureTags: ["col:5", "homebar"],
        firstPage: {
          results: curatedHomebar.map((linkCode) => makeSurfaceResult(linkCode, -1)),
          hasMore: false,
          panelTargetName: null,
        },
        panelType: "CuratedList",
        playHistoryType: null,
      },
      {
        panelName: "ByEpicNoCompetitive",
        panelDisplayName: "By Epic",
        featureTags: ["col:5"],
        firstPage: {
          results: panelCodes.map((linkCode) => makeSurfaceResult(linkCode)),
          hasMore: false,
          panelTargetName: null,
        },
        panelType: "AnalyticsList",
        playHistoryType: null,
      },
    ],
  };
}

function buildGenericPlaylistLink(mnemonic: string): DiscoveryLink {
  return {
    namespace: "fn",
    accountId: "epic",
    creatorName: "Epic",
    mnemonic,
    linkType: "BR:Playlist",
    metadata: {
      image_url: "",
      image_urls: buildImageUrls(""),
      matchmaking: {
        override_playlist: mnemonic,
      },
    },
    version: 95,
    active: true,
    disabled: false,
    created: "2021-10-01T00:56:45.010Z",
    published: "2021-08-03T15:27:20.251Z",
    descriptionTags: [],
    moderationStatus: "Approved",
  };
}

function getDiscoveryLinkResponse(
  ver: ReturnType<typeof getVersion>,
  mnemonic: string,
): DiscoveryLink {
  const links = getMnemonicLinks(ver);
  const existing = findLinkByMnemonic(links, mnemonic);

  if (existing) {
    return existing;
  }

  return buildGenericPlaylistLink(mnemonic);
}

export default function () {
  app.get("/fortnite/api/discovery/accessToken/*", async (c) => {
    const useragent: any = c.req.header("user-agent");
    if (!useragent) return c.json(Atlas.internal.invalidUserAgent);
    const regex = useragent.match(/\+\+Fortnite\+Release-\d+\.\d+/);
    return c.json({
      branchName: regex[0],
      appId: "Fortnite",
      token: `${crypto.randomBytes(10).toString("hex")}=`,
    });
  });

  app.post("/api/v2/discovery/surface/*", async (c) => {
    return c.json(buildApiV2SurfaceResponse(getVersion(c)));
  });

  app.post("/api/v1/assets/Fortnite/*", async (c) => {
    const assets = {
      FortCreativeDiscoverySurface: {
        meta: {
          promotion: 26,
        },
        assets: {
          CreativeDiscoverySurface_Frontend: {
            meta: {
              revision: 32,
              headRevision: 32,
              revisedAt: "2023-04-25T19:30:52.489Z",
              promotion: 26,
              promotedAt: "2023-04-25T19:31:12.618Z",
            },
            assetData: {
              AnalyticsId: "v538",
              TestCohorts: [
                {
                  AnalyticsId: "c-1v2_v2_c727",
                  CohortSelector: "PlayerDeterministic",
                  PlatformBlacklist: [],
                  CountryCodeBlocklist: [],
                  ContentPanels: [
                    {
                      NumPages: 1,
                      AnalyticsId: "p1114",
                      PanelType: "AnalyticsList",
                      AnalyticsListName: "ByEpicNoBigBattle",
                      CuratedListOfLinkCodes: [],
                      ModelName: "",
                      PageSize: 7,
                      PlatformBlacklist: [],
                      PanelName: "ByEpicNoBigBattle6Col",
                      MetricInterval: "",
                      CountryCodeBlocklist: [],
                      SkippedEntriesCount: 0,
                      SkippedEntriesPercent: 0,
                      SplicedEntries: [],
                      PlatformWhitelist: [],
                      MMRegionBlocklist: [],
                      EntrySkippingMethod: "None",
                      PanelDisplayName: {
                        Category: "Game",
                        NativeCulture: "",
                        Namespace: "CreativeDiscoverySurface_Frontend",
                        LocalizedStrings: [],
                        bIsMinimalPatch: false,
                        NativeString: "LTMS",
                        Key: "ByEpicNoBigBattle6Col",
                      },
                      PlayHistoryType: "RecentlyPlayed",
                      bLowestToHighest: false,
                      PanelLinkCodeBlacklist: [],
                      CountryCodeAllowlist: [],
                      PanelLinkCodeWhitelist: [],
                      FeatureTags: [],
                      MMRegionAllowlist: [],
                      MetricName: "",
                    },
                    {
                      NumPages: 2,
                      AnalyticsId: "p969|88dba0c4e2af76447df43d1e31331a3d",
                      PanelType: "AnalyticsList",
                      AnalyticsListName: "EventPanel",
                      CuratedListOfLinkCodes: [],
                      ModelName: "",
                      PageSize: 25,
                      PlatformBlacklist: [],
                      PanelName: "EventPanel",
                      MetricInterval: "",
                      CountryCodeBlocklist: [],
                      SkippedEntriesCount: 0,
                      SkippedEntriesPercent: 0,
                      SplicedEntries: [],
                      PlatformWhitelist: [],
                      MMRegionBlocklist: [],
                      EntrySkippingMethod: "None",
                      PanelDisplayName: {
                        Category: "Game",
                        NativeCulture: "",
                        Namespace: "CreativeDiscoverySurface_Frontend",
                        LocalizedStrings: [],
                        bIsMinimalPatch: false,
                        NativeString: "Event LTMS",
                        Key: "EventPanel",
                      },
                      PlayHistoryType: "RecentlyPlayed",
                      bLowestToHighest: false,
                      PanelLinkCodeBlacklist: [],
                      CountryCodeAllowlist: [],
                      PanelLinkCodeWhitelist: [],
                      FeatureTags: ["col:6"],
                      MMRegionAllowlist: [],
                      MetricName: "",
                    },
                  ],
                  PlatformWhitelist: [],
                  SelectionChance: 0.1,
                  TestName: "testing",
                },
              ],
              GlobalLinkCodeBlacklist: [],
              SurfaceName: "CreativeDiscoverySurface_Frontend",
              TestName: "20.10_4/11/2022_hero_combat_popularConsole",
              primaryAssetId: "FortCreativeDiscoverySurface:CreativeDiscoverySurface_Frontend",
              GlobalLinkCodeWhitelist: [],
            },
          },
        },
      },
    };

    return c.json(assets);
  });

  app.post("/fortnite/api/game/v2/creative/discovery/surface/*", async (c) => {
    return c.json(buildDiscoverySurfaceResponse(getVersion(c)));
  });

  app.post("/api/v1/discovery/surface/*", async (c) => {
    return c.json(buildDiscoverySurfaceResponse(getVersion(c)));
  });

  app.post("/links/api/fn/mnemonic", async (c) => {
    const ver = getVersion(c);
    return c.json(getMnemonicLinks(ver));
  });

  app.get("/links/api/fn/mnemonic/:playlistId", async (c) => {
    const playlistId = c.req.param("playlistId");
    return c.json(getDiscoveryLinkResponse(getVersion(c), playlistId));
  });

  app.get("/links/api/fn/mnemonic/:playlistId/related", async (c) => {
    const playlistId = c.req.param("playlistId");
    const ver = getVersion(c);

    const links: Record<string, DiscoveryLink> = {
      [playlistId]: getDiscoveryLinkResponse(ver, playlistId),
    };

    return c.json({
      parentLinks: [],
      links,
    });
  });
}
