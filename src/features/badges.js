const Store = require('electron-store');
const config = new Store();

let badgesData;

function initBadges(socket) {
    if (config.get('clientBadges', true)) {
        setInterval(() => {
            socket.send(JSON.stringify({ type: 8 }));
        }, 2000);
    }
}

function sendBadges(data) {
    badgesData = data;
}

function getBadge(type, confirmID) {
    const data = badgesData['data'][type];
    for (let j = 0; j < data.length; j++) {
        const badgeData = data[j];
        if (type != 'custom')
            badgeData['url'] = badgesData.url[type];
        if (badgeData.id === confirmID)
            return badgeData;
    }
}

function checkBadge() {
    if (!badgesData || Object.keys(badgesData).length == 0)
        return;

    const confirmID = config.get('userID');
    const preferred = badgesData['pref'][confirmID];
    let searchBadge = null;
    if (preferred && confirmID == config.get('userID'))
        searchBadge = preferred;

    const allPossible = [];
    const allTypes = Object.keys(badgesData['data']);
    for (let i = 0; i < allTypes.length; i++) {
        const badgeType = allTypes[i];
        if (searchBadge && badgeType != searchBadge)
            continue;
        const data = badgesData['data'][badgeType];
        for (let j = 0; j < data.length; j++) {
            const badgeData = data[j];
            if (badgeData.id === confirmID)
                allPossible.push(badgeType);
        }
    }
    if (allPossible.length > 0) {
        if (allPossible.includes('custom'))
            return getBadge('custom', confirmID);
        return getBadge(allPossible[0], confirmID);
    }
}

module.exports.checkBadge = checkBadge;
module.exports.sendBadges = sendBadges;
module.exports.initBadges = initBadges;
