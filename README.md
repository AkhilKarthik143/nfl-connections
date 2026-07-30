# NFL Connections

A room-based multiplayer browser game. The server owns room state, turn order, strikes, repeat checking, and move validation; players can join from separate devices with a four-character room code.

The player pool is generated from nflverse's public roster-data release. Refresh it each season with `npm run update-data` (or pass a season, such as `node scripts/import-nflverse-rosters.js 2025`).

For historical connections, import an all-time CSV in the supplied nflverse-style format:

```powershell
npm run import-all-time -- C:\path\to\nfl_players_all_time.csv
```

That data becomes the primary local lookup, including every player's career teams and jersey numbers.

## Run locally

```powershell
cd C:\Users\Akhil\OneDrive\Documents\TCU\nfl-connections
npm install
npm start
```

Open `http://localhost:3000`. To use separate devices on the same Wi-Fi, open the computer's LAN IP with port `3000` instead. The starter includes a deliberately curated NFL player pool so validation is dependable; expand `PLAYERS` in `server.js` to broaden gameplay.
