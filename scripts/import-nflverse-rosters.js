/* Downloads nflverse's season roster data and creates the game's compact player pool. */
const fs = require('fs');
const path = require('path');

const season = process.argv[2] || new Date().getFullYear();
const url = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`;

function parseLine(line) {
  const values = []; let current = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) { current += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(current); current = ''; }
    else current += char;
  }
  values.push(current); return values;
}

async function main() {
  console.log(`Downloading nflverse roster data for ${season}…`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`nflverse returned HTTP ${response.status}`);
  const [header, ...rows] = (await response.text()).trim().split(/\r?\n/);
  const columns = parseLine(header);
  const records = rows.map(parseLine).map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i] || ''])));
  const seen = new Set();
  const players = records.map((row) => ({
    name: row.full_name,
    teams: [row.team],
    college: (row.college || '').split(';').map((college) => college.trim()).filter(Boolean),
    number: String(row.jersey_number || '').replace(/\.0$/, '')
  })).filter((player) => player.name && player.teams[0] && player.college.length && player.number && !seen.has(player.name.toLowerCase()) && seen.add(player.name.toLowerCase()));
  const output = path.join(__dirname, '..', 'data', 'nflverse-players.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(players));
  console.log(`Wrote ${players.length} NFL players to ${output}`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
