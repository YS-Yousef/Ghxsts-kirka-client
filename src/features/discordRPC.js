const { version } = require('./const');
const DiscordRPC = require('discord-rpc');
const ClientID = '871730144836976650';
const starttime = Date.now();
const { checkBadge } = require('./badges');
const Store = require('electron-store');
const log = require('electron-log');
const config = new Store();

let userBadges = { type: 'anything', role: 'KirkaClient User' };
let socket;
let discordOpen = false;

DiscordRPC.register(ClientID);
const client = new DiscordRPC.Client({ transport: 'ipc' });
client.login({ clientId: ClientID }).catch((error) => {
    log.info(error);
});


client.on('ready', () => {
    log.info(`RPC Ready! Username: ${client.user.username}#${client.user.discriminator}`);
    discordOpen = true;
});

function initRPC(socket_, webContents) {
    if (!config.get('discordRPC', true))
        return;
    socket = socket_;
    setInterval(() => {
        if (!discordOpen)
            return;

        const userID = config.get('userID', '000000');

        userBadges = checkBadge(userID);
        if (!userBadges)
            userBadges = { type: 'anything', role: 'KirkaClient User' };
        else {
            userBadges['type'] = {
                'Developer': 'dev',
                'Contributor': 'con',
                'Staff': 'staff',
                'Patreon': 'patreon',
                'GFX Artist': 'gfx',
                'V.I.P': 'vip',
                'Kirka Dev': 'kdev',
                'Server Booster': 'nitro',
                'Custom Badge': 'custom',
                'None': null
            }[userBadges['role']];
        }
        if (userBadges.id)
            userBadges.type = userBadges.id.toLowerCase();
        const gameURL = webContents.getURL();
        const state = getGameState(gameURL);
        if (state == 'game') {
            const gamecode = gameURL.replace('https://kirka.io/games/', '');
            socket.send(JSON.stringify({ type: 3, data: gamecode }));
        } else
            notPlaying(state);
    }, 2000);
}

function getGameState(url) {
    if (url == 'https://kirka.io/store')
        return 'store';
    else if (url == 'https://kirka.io/')
        return 'home';
    else if (url.includes('https://kirka.io/games/'))
        return 'game';
    else if (url == 'https://kirka.io/hub/leaderboard')
        return 'leaderboard';
    else if (url.includes('https://kirka.io/hub/clans'))
        return 'clans';
    else if (url == 'https://kirka.io/hub/market')
        return 'market';
    else if (url.includes('https://kirka.io/server'))
        return 'servers';
}

function notPlaying(state) {
    const message = {
        'home': 'Home Page',
        'store': 'Browsing Store',
        'leaderboard': 'Checking Leaderboards',
        'clans': 'Browsing Clans',
        'market': 'Looking at Market',
        'servers': 'Browsing Servers',
    };
    client.setActivity({
        state: message[state],
        smallImageKey: userBadges.type,
        smallImageText: userBadges.role,
        largeImageKey: 'client_logo',
        largeImageText: `KirkaClient ${version}`,
        instance: true,
        startTimestamp: starttime,
        buttons: [
            { label: 'Get KirkaClient', url: 'https://client.kirka.io' }
        ]
    });
}

async function updateRPC(data) {
    if (!discordOpen)
        return;

    if (!data.success) {
        updateClient(
            { mode: 'In a private match' },
            'private'
        );
        return;
    }

    const finalData = {
        mode: data.shortMode,
        map: data.map,
        cap: data.players,
        url: data.link
    };
    updateClient(finalData, 'game');
}

function updateClient(data, type) {
    const updateData = {
        smallImageKey: userBadges.type,
        smallImageText: userBadges.role,
        largeImageKey: 'client_logo',
        largeImageText: `KirkaClient ${version}`,
        instance: true,
        startTimestamp: starttime,
    };

    switch (type) {
    case 'game':
        updateData['buttons'] = [
            { label: 'Join Game', url: data.url },
            { label: 'Get KirkaClient', url: 'https://client.kirka.io' }
        ];
        updateData['details'] = `Playing ${data.mode}`;
        updateData['state'] = `${data.map} (${data.cap})`;
        break;
    case 'private':
        updateData['buttons'] = [
            { label: 'Get KirkaClient', url: 'https://client.kirka.io' }
        ];
        updateData['details'] = data.mode;
        break;
    }
    client.setActivity(updateData);
}

function closeRPC() {
    if (discordOpen)
        client.clearActivity();
}

module.exports.initRPC = initRPC;
module.exports.closeRPC = closeRPC;
module.exports.updateRPC = updateRPC;
