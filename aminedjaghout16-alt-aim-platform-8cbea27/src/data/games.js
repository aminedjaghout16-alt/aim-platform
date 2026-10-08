/* =========================================================
   AIMFORGE — Supported games
   Each game defines sensitivity conversion + reference FOV.
   Add more games here without touching UI code.
   ========================================================= */

export const GAMES = {
  valorant: {
    id: "valorant",
    name: "Valorant",
    studio: "Riot Games",
    defaultSens: 0.42,
    yaw: 0.07,            // degrees per dot
    fov: 103,
    palette: "#FF4655"
  },
  cs2: {
    id: "cs2",
    name: "Counter-Strike 2",
    studio: "Valve",
    defaultSens: 2.0,
    yaw: 0.022,
    fov: 106,
    palette: "#F0A020"
  },
  apex: {
    id: "apex",
    name: "Apex Legends",
    studio: "Respawn",
    defaultSens: 1.6,
    yaw: 0.022,
    fov: 110,
    palette: "#DA292A"
  },
  overwatch: {
    id: "overwatch",
    name: "Overwatch 2",
    studio: "Blizzard",
    defaultSens: 5.0,
    yaw: 0.0066,
    fov: 103,
    palette: "#F99E1A"
  },
  generic: {
    id: "generic",
    name: "Universal",
    studio: "—",
    defaultSens: 1.0,
    yaw: 0.022,
    fov: 100,
    palette: "#B9FF3D"
  }
};

export const GAME_LIST = Object.values(GAMES);
