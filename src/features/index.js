const { autoUpdate } = require('./autoUpdate');
const { checkBadge, initBadges, sendBadges } = require('./badges');
const { initRPC, updateRPC, closeRPC } = require('./discordRPC');

module.exports = {
    autoUpdate,
    checkBadge,
    initBadges,
    updateRPC,
    sendBadges,
    initRPC,
    closeRPC
};
