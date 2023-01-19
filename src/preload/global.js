/* eslint-disable prefer-const */
/* eslint-disable no-unused-vars */
const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const config = new Store();
const performanceMode = config.get('performanceMode', false);
let pluginLoader;
if (!performanceMode)
    pluginLoader = require('../features/plugins').pluginLoader;
const log = require('electron-log');
const fs = require('fs');
const path = require('path');

let badgesData;
let settings;
let isChatFocus = false;
let matchCache = {};
let oldState;
let homeBadgeLoop;
let inGameBadgeLoop;
let regionLoop;
let scene;
let scoped = false;
const weaponCache = {
    'MAC-10': 5,
    'Weatie': 5,
    'AR-9': 3,
};

window.addEventListener('mousedown', (e) => {
    if (e.button === 2) scoped = true;
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) scoped = false;
});

window.addEventListener('DOMContentLoaded', (event) => {
    if (document.getElementById('do-not-load'))
        return;
    setInterval(() => {
        const newState = currentState();
        if (oldState != newState) {
            oldState = newState;
            doOnLoad();
        }
        commaFormat();
    }, 1000);
});

async function getDirectories(source) {
    return (await fs.promises.readdir(source, { withFileTypes: true }))
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
        .map(dirent => dirent.name);
}

WeakMap.prototype.set = new Proxy(WeakMap.prototype.set, {
    apply(target, thisArg, argArray) {
        if (argArray[0] && argArray[0].type === 'Scene' && argArray[0].children[0].type === 'AmbientLight')
            scene = argArray[0];

        return Reflect.apply(...arguments);
    }
});

async function loadPlugins(ensure) {
    if (ensure)
        await ipcRenderer.invoke('ensureIntegrity');
    const filenames = [];
    const fileDir = await ipcRenderer.invoke('scriptPath');
    const dirs = await getDirectories(fileDir);

    for (const dir of dirs) {
        const packageFile = path.join(fileDir, dir, 'package.json');
        if (fs.existsSync(packageFile)) {
            const packageJson = JSON.parse(fs.readFileSync(packageFile));
            filenames.push([dir, packageJson]);
        } else {
            log.info('No package.json');
            continue;
        }
    }

    for (const [dir, packageJson] of filenames) {
        try {
            const script = await pluginLoader(packageJson.uuid, dir, packageJson, true);
            if (Array.isArray(script))
                continue;

            if (script.isLocationMatching(currentState())) {
                script.launchRenderer();
                log.info(`Loaded script: ${script.scriptName}- v${script.ver}`);
            }
        } catch (err) {
            log.error(err);
        }
    }
}

function doOnLoad() {
    resetVars();
    if (!performanceMode) {
        ipcRenderer.invoke('canLoadPlugins').then(answer => {
            if (answer)
                loadPlugins(true);
        });
    }
    const link = document.createElement('script');
    link.src = 'https://kit.fontawesome.com/2342144b1a.js';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
    const html = `
    <link rel="stylesheet" href="${config.get('css')}">
    <script defer src="https://use.fontawesome.com/releases/v5.0.8/js/all.js" integrity="sha384-SlE991lGASHoBfWbelyBPLsUlwY1GwNDJo3jSJO04KZ33K2bwfV9YBauFfnzvynJ" crossorigin="anonymous"></script>
    <style>

    #show-clientNotif{
        position: absolute;
        transform: translate(-50%,-50%);
        top: 50%;
        left: 50%;
        background-color: #101020;
        color: #ffffff;
        padding: 20px;
        border-radius: 5px;
        cursor: pointer;
    }
    #clientNotif{
        width: 380px;
        height: 80px;
        padding-left: 20px;
        background-color: #ffffff;
        box-shadow: 0 10px 20px rgba(75, 50, 50, 0.05);
        border-left: 8px solid #47d764;
        border-radius: 7px;
        display: grid;
        grid-template-columns: 1.2fr 6fr 0.5fr;
        transform: translate(-400px);
        transition: 1s;
    }
    .container-1,.container-2{
        align-self: center;
    }
    .container-1 i{
        font-size: 40px;
        color: #47d764;
    }
    .container-2 {
        text-shadow: 0px 0px #000000;
        font-size: 18px;
        border: none;
        text-align: left;
        padding: 0;
        margin: 0;
        box-sizing: border-box;
    }
    .container-2 p:first-child{
        color: #101020;
    }
    .container-2 p:last-child{
        color: #656565;
    }
    #clientNotif button{
        align-self: flex-start;
        background-color: transparent;
        font-size: 25px;
        line-height: 0;
        color: #656565;
        cursor: pointer;
    }
    </style>
    <div class="wrapper" style="width: 420px;
    padding: 30px 20px;
    position: absolute;
    bottom: 50px;
    left: 0;
    overflow: hidden;">
    <div id="clientNotif">
        <div class="container-1">
        </div>
        <div class="container-2">
        </div>
    </div>
    </div>`;
    const state = currentState();
    if (state === 'unknown')
        return;
    log.info('DOM Content loaded for:', state);
    let promo;
    const div = document.createElement('div');
    div.className = 'clientNotifDIV';
    div.innerHTML = html;

    function setPromo() {
        promo = document.getElementsByClassName('info')[0];
        if (!promo) {
            setTimeout(setPromo, 1000);
            return;
        }
        promo.appendChild(div);
    }

    switch (state) {
    case 'home':
        settings = document.getElementById('clientSettings');
        setUsername();
        promo = document.getElementsByClassName('left-interface')[0];
        promo.appendChild(div);
        createHomePageSettings();
        addButton();
        regionLoop = setInterval(setRegion, 500);
        if (config.get('clientBadges', true) && !performanceMode)
            homeBadge();
        if (performanceMode && config.get('useAdBlocker', true)) {
            document.getElementById('ad-left').style = 'none !important';
            document.getElementById('ad-bottom').style = 'none !important';
        }
        break;
    case 'game':
        addSettingsButton();
        setPromo();
        if (config.get('clientBadges', true) && !performanceMode)
            inGameBadge();
        if (config.get('hideWeaponOnAds', false))
            animationLoop();
        break;
    }

    if (state != 'game')
        return;

    if (config.get('showHP', true))
        observeHp();

    updateChatState();
}

ipcRenderer.on('msg', (e, msg, icon) => {
    createBalloon(msg, icon);
});

function commaFormat() {
    if (!config.get('commaFormat', true))
        return;
    const href = window.location.href;

    if (href == 'https://kirka.io/hub/clans/my-clan') {
        // Clan Page formatter: war score
        let elem = document.getElementsByClassName('champions-score');
        if (elem.length > 0) {
            elem = document.getElementsByClassName('champions-score')[0];
            elem = document.getElementsByClassName('champions-score')[0].innerText;
            const elem2 = new Intl.NumberFormat().format(elem);
            if (!elem2.includes(','))
                return;
            if (!document.getElementsByClassName('champions-score')[0].innerText.includes('.'))
                document.getElementsByClassName('champions-score')[0].innerText = elem2;
        }
        // Clan Page formatter: full score
        elem = document.getElementsByClassName('all-scores-value');
        if (elem) {
            elem = document.getElementsByClassName('all-scores-value')[0];
            if (elem) {
                elem = document.getElementsByClassName('all-scores-value')[0].innerText;
                const elem2 = new Intl.NumberFormat().format(elem);
                if (!elem2.includes(','))
                    return;
                if (!document.getElementsByClassName('all-scores-value')[0].innerText.includes('.'))
                    document.getElementsByClassName('all-scores-value')[0].innerText = elem2;
            }
        }
        // Clan Page formatter: user scores
        for (let i = 0; i < 2000; i++) {
            elem = document.getElementsByClassName('stat');
            if (elem.length > 0) {
                elem = document.getElementsByClassName('stat')[i];
                elem = document.getElementsByClassName('stat')[i].innerText;
                const elem2 = new Intl.NumberFormat().format(elem);
                if (!elem2.includes(','))
                    continue;
                if (!document.getElementsByClassName('stat')[i].innerText.includes('.'))
                    document.getElementsByClassName('stat')[i].innerText = elem2;
            }
        }
    } else if (href == 'https://kirka.io/hub/clans/champions-league') {
        // ClanWar Number formatter
        for (let i = 0; i < 73; i++) {
            let elem = document.getElementsByClassName('stat');
            if (elem.length > 0) {
                elem = document.getElementsByClassName('stat')[i];
                if (elem) {
                    elem = document.getElementsByClassName('stat')[i].innerText;
                    const elem2 = new Intl.NumberFormat().format(elem);
                    if (!elem2.includes(','))
                        continue;
                    if (!document.getElementsByClassName('stat')[i].innerText.includes('.')) {
                        if (document.getElementsByClassName('stat')[i].innerText.length > 3)
                            document.getElementsByClassName('stat')[i].innerText = elem2;
                    }
                }
            }
        }
    } else if (href.includes('https://kirka.io/profile')) {
        // Profile page number formatter: stats
        for (let i = 0; i < 7; i++) {
            let elem = document.getElementsByClassName('stat-value text-2');
            if (elem.length > 0) {
                elem = document.getElementsByClassName('stat-value text-2')[i].innerText;
                const elem2 = new Intl.NumberFormat().format(elem);
                if (!elem2.includes(','))
                    continue;
                if (!document.getElementsByClassName('stat-value text-2')[i].innerText.includes('.'))
                    document.getElementsByClassName('stat-value text-2')[i].innerText = elem2;
            }
        }
        let elem = document.getElementsByClassName('progress-exp text-2');
        if (elem.length > 0) {
            elem = document.getElementsByClassName('progress-exp text-2')[0].innerText;
            const numbers = elem.split(' / ');
            const nubmer1form = new Intl.NumberFormat().format(numbers[0]);
            const nubmer2form = new Intl.NumberFormat().format(numbers[1]);
            if (!nubmer1form.includes(',') || !nubmer2form.includes(','))
                return;
            const numberoutput = nubmer1form + ' / ' + nubmer2form;
            if (!elem.includes('.'))
                document.getElementsByClassName('progress-exp text-2')[0].innerText = numberoutput;
        }
    } else if (href == 'https://kirka.io/hub/leaderboard') {
        // DailyWar number formatter
        for (let i = 0; i < 40; i++) {
            let elem = document.getElementsByClassName('value');
            if (elem.length > 0) {
                elem = document.getElementsByClassName('value')[i].innerText;
                const elem2 = new Intl.NumberFormat().format(elem);
                if (!elem2.includes(','))
                    continue;
                if (!document.getElementsByClassName('value')[i].innerText.includes('.'))
                    document.getElementsByClassName('value')[i].innerText = elem2;
            }
        }
    } else if (href == 'https://kirka.io/') {
        let elem = document.getElementsByClassName('exp-values');
        if (elem.length > 0) {
            elem = document.getElementsByClassName('exp-values')[0].innerText;
            const numbers = elem.split(' / ');
            const nubmer1form = new Intl.NumberFormat().format(numbers[0]);
            const nubmer2form = new Intl.NumberFormat().format(numbers[1]);
            if (!nubmer1form.includes(',') || !nubmer2form.includes(','))
                return;
            const numberoutput = nubmer1form + ' / ' + nubmer2form;
            if (!elem.includes('.'))
                document.getElementsByClassName('exp-values')[0].innerText = numberoutput;
        }
        elem = document.getElementsByClassName('card-cont money');
        if (elem.length > 0) {
            for (let count = 0; count < 2; count += 1) {
                elem = document.getElementsByClassName('card-cont money')[count].childNodes[1].textContent;
                const elem2 = new Intl.NumberFormat().format(elem);
                if (!elem2.includes(','))
                    continue;
                document.getElementsByClassName('card-cont money')[count].childNodes[1].textContent = elem2;
            }
        }
    }
}

function createHomePageSettings() {
    const downloadBtn = document.querySelector('#right-interface > div.settings-and-socicons > div:nth-child(2)');
    const settingsBtn = downloadBtn.cloneNode(true);
    settingsBtn.childNodes[0].childNodes[1].innerText = 'SETTINGS';
    settingsBtn.onclick = () => {
        ipcRenderer.send('show-settings');
    };
    settingsBtn.childNodes[1].outerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 0 24 24" width="48px" fill="#FFFFFF"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M23 2H1v16h9v2H8v2h8v-2h-2v-2h9V2zm-2 14H3V4h18v12z"/></svg>';
    downloadBtn.parentNode.replaceChild(settingsBtn, downloadBtn);
}

async function addButton() {
    const addbtn = document.createElement('button');
    addbtn.innerText = 'Join using URL';
    addbtn.className = 'join-using-link text-2';
    addbtn.style.float = 'right';
    addbtn.style.fontWeight = '700';
    addbtn.style.border = '4px solid #26335b';
    addbtn.style.borderRadius = '6.4px';
    addbtn.style.padding = '4px 8px';
    addbtn.style.cursor = 'pointer';
    addbtn.style.marginBottom = '3px';
    addbtn.style.color = 'white';
    addbtn.style.transition = 'background-color .3s';
    addbtn.style.transitionTimingFunction = 'linear';
    addbtn.onclick = () => {
        ipcRenderer.send('joinLink');
    };
    addbtn.onmouseover = () => {
        addbtn.style.backgroundColor = 'var(--secondary-2)';
    };
    addbtn.onmouseleave = () => {
        addbtn.style.backgroundColor = '#3b4975';
    };
    addbtn.onmouseleave();
    const play = document.getElementsByClassName('select-region')[0];
    play.after(addbtn);
}

function setRegion() {
    const region = document.querySelector('#app > div.interface.text-2 > div.play > div > div.select-region');
    if (!region || region.innerText.length == 0) {
        setTimeout(setRegion, 100);
        return;
    }
    const re = new RegExp(' ', 'g');
    const finalRegion = region.innerText.replace(re, '');
    localStorage.setItem('region', finalRegion);
}

function addSettingsButton() {
    const canvas = document.querySelector('#app > div.game-interface > div.esc-interface > div.right-container > div.head > div.head-right');
    if (canvas) {
        if (document.getElementById('clientSettingsGame'))
            return;
        canvas.insertAdjacentHTML('afterbegin', '<button data-v-02c36fca="" id = "clientSettingsGame" data-v-b427fee8="" class="button right-btn rectangle" style="background-color: var(--secondary-5); --hover-color:#5C688F; --top:#5C688F; --bottom:#252E4B; width: 5vw;; padding: 0px; margin: 0px;"><div data-v-02c36fca="" class="triangle"></div><div data-v-02c36fca="" class="text"><img data-v-b8de1e14="" data-v-b427fee8="" src="https://media.discordapp.net/attachments/912303941449039932/913787350738407434/client_icon.png" width="100%" height="auto"></div><div data-v-02c36fca="" class="borders"><div data-v-02c36fca="" class="border-top border"></div><div data-v-02c36fca="" class="border-bottom border"></div></div></button>');
        settings = document.querySelector('#app > div.game-interface > div.esc-interface > div.right-container > div.head > div.head-right > button:nth-child(1)');
        settings.addEventListener('click', () => {
            ipcRenderer.send('show-settings');
        });
    } else
        setTimeout(addSettingsButton, 500);
}

async function setUsername() {
    const nicknameDiv = document.querySelector('#app > div.interface.text-2 > div.team-section > div.player > div > div.head-right > div.nickname');
    const userIDdiv = document.querySelector('#auth-user > div > div.card-cont.avatar-info > div.username');

    if (nicknameDiv === null || userIDdiv === null) {
        config.set('userID', '000000');
        config.set('user', 'Newbie');
        setTimeout(setUsername, 100);
        return;
    }
    const re = new RegExp(' ', 'g');
    const re2 = new RegExp('\\n', 'g');
    const re3 = new RegExp('#', 'g');
    const user = nicknameDiv.innerText.replace(re, '');
    const userID = userIDdiv.innerText.replace(re2, '').replace(re3, '');
    config.set('user', user);
    config.set('userID', userID);
    log.info('User set as:', user, 'with ID:', userID);
}

function resetVars() {
    settings = null;
    matchCache = {};
    scene = null;
    scoped = false;
    if (homeBadgeLoop)
        clearInterval(homeBadgeLoop);
    if (inGameBadgeLoop)
        clearInterval(inGameBadgeLoop);
    if (regionLoop)
        clearInterval(regionLoop);
}

function observeHp() {
    const hpNode = document.querySelector('#app > div.game-interface > div.desktop-game-interface > div.state > div.hp > div.cont-hp > div');
    if (!hpNode) {
        setTimeout(observeHp, 100);
        return;
    }
    hpObserver.observe(hpNode, {
        attributes: true,
        attributeFilter: ['style']
    });
    document.querySelector('#app > div.game-interface > div.desktop-game-interface > div.state > div.hp > div.hp-title.text-1').innerText = '100';
}

function updateChatState() {
    const chatState = config.get('chatType', 'Show');
    switch (chatState) {
    case 'Hide':
        setChatState(false);
        break;
    case 'Show':
        setChatState(true);
        break;
    case 'While Focused':
        setChatState(false, true);
        break;
    }
}

function setChatState(state, isFocusActive = false) {
    const chat = document.getElementsByClassName('chat chat-position')[0];
    isChatFocus = isFocusActive;
    if (chat === undefined) {
        setTimeout(() => { setChatState(state, isFocusActive); }, 1000);
        return;
    }
    if (state)
        chat.style = 'display: flex;';
    else
        chat.style = 'display: none;';
}

function showNotification() {
    let x = document.getElementById('clientNotif');
    clearTimeout(x);
    const toast = document.getElementById('clientNotif');
    toast.style.transform = 'translateX(0)';
    x = setTimeout(() => {
        toast.style.transform = 'translateX(-400px)';
    }, 3000);
}

function createBalloon(text, icon = 'info') {
    const types = {
        error: 'fas fa-circle-exclamation',
        success: 'fas fa-circle-check',
        info: 'fas fa-circle-info',
        chat: 'fas fa-message'
    };

    const colors = {
        error: 'FF5A5A',
        success: '51FF4E',
        info: '4C6CFF',
        chat: '2EF7FF'
    };

    const border = `<i class="${types[icon]}" style="color: #${colors[icon]};"></i>`;
    const style = `border-left: 8px solid #${colors[icon]};`;

    const d1 = document.getElementsByClassName('container-1')[0];
    d1.innerHTML = border;
    const toast = document.getElementById('clientNotif');
    toast.style = style;
    const d2 = document.getElementsByClassName('container-2')[0];
    d2.innerHTML = `<p>${text}</p>`;
    showNotification();
}

function toggleChat() {
    const chat = document.getElementsByClassName('chat chat-position')[0];
    const input = document.getElementById('WMNn');
    if (document.activeElement == input) {
        setTimeout(toggleChat, 100);
        return;
    }
    if (chat.style.display == 'flex') {
        chat.blur();
        chat.style = 'display: none;';
    } else {
        chat.style = 'display: flex;';
        chat.focus();
        input.focus();
    }
}

window.addEventListener('keydown', function(event) {
    switch (event.key) {
    case 'Escape':
        addSettingsButton();
        break;
    case 'Enter':
        if (isChatFocus)
            toggleChat();
        break;
    }
});

ipcRenderer.on('updateChat', () => {
    updateChatState();
});

if (config.get('preventM4andM5', true)) {
    window.addEventListener('mouseup', (e) => {
        if (e.button === 3 || e.button === 4)
            e.preventDefault();
    });
}

async function homeBadge() {
    homeBadgeLoop = setInterval(() => {
        const allpossible = document.getElementsByClassName('nickname');
        const id = config.get('userID', null);
        if (!id)
            return;

        for (let key = 0; key < allpossible.length; key++) {
            const nickname = allpossible[key];
            if (nickname.innerText.replace(new RegExp(' ', 'g'), '') != config.get('user'))
                continue;
            const children = nickname.children;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.tagName != 'IMG')
                    continue;
                if (String(child.src).includes('discord'))
                    child.remove();
            }
            const badge = checkbadge('home', id);
            if (badge == undefined)
                continue;

            nickname.insertAdjacentHTML('beforeend', `<img data-v-e6e1daf8 clientbadge src="${badge.url}" height=20 title="${badge.role}">`);
        }
    }, 1000);
}

async function inGameBadge() {
    inGameBadgeLoop = setInterval(() => {
        const allPossible = [];
        allPossible.push(...document.getElementsByClassName('nickname'));
        allPossible.push(...document.getElementsByClassName('player-name'));
        generateCache();

        for (let i = 0; i < allPossible.length; i++) {
            const element = allPossible[i];
            const re = new RegExp(' ', 'g');
            const userid = matchCache[element.innerText.replace(re, '')];
            const children = element.children;
            for (let j = 0; j < children.length; j++) {
                const child = children[j];
                if (child.tagName != 'IMG')
                    continue;
                if (String(child.src).includes('discord'))
                    child.remove();
            }
            const badge = checkbadge('game', userid);
            if (badge == undefined)
                continue;
            element.style.display = 'flex';
            element.insertAdjacentHTML('beforeend', `<img data-v-e6e1daf8 clientbadge src="${badge.url}" height=20 title="${badge.role}" style="margin-left: 2px;">`);
        }
    }, 1000);
}

function generateCache() {
    const ele = document.getElementsByClassName('player-left');
    if (ele.length == 0) {
        setTimeout(generateCache, 100);
        return;
    }

    for (let k = 0; k < ele.length; k++) {
        const children = ele[k].children;
        if (children.length != 3)
            continue;
        const re = new RegExp(' ', 'g');
        const re2 = new RegExp('\\n', 'g');
        const re3 = new RegExp('#', 'g');
        const userid = children[2].innerText.replace(re2, '').replace(re3, '');
        if (userid.length != 6)
            continue;
        matchCache[children[1].innerText.replace(re, '')] = userid;
    }
}

const hpObserver = new MutationObserver((data, observer) => {
    data.forEach(ele => {
        const width = parseInt(ele.target.style.width.replace('%', ''));
        document.querySelector('#app > div.game-interface > div.desktop-game-interface > div.state > div.hp > div.hp-title.text-1').innerText = width;
    });
});

ipcRenderer.on('twitch-msg', (event, userName, userColor, msg) => {
    genChatMsg(msg, userName, userColor);
});

function genChatMsg(text, sender = '[KirkaClient]', style = null) {
    const chatHolder = document.getElementsByClassName('messages messages-cont')[0];
    if (chatHolder === undefined)
        return;

    const chatItem = document.createElement('div');
    const chatUser = document.createElement('span');
    const chatMsg = document.createElement('span');

    chatItem.className = 'message';
    chatMsg.className = 'chatMsg_client';
    chatMsg.innerText = text;
    chatUser.className = 'name';
    chatUser.innerText = `${sender}: `;
    if (style)
        chatUser.style.color = style;

    chatItem.appendChild(chatUser);
    chatItem.appendChild(chatMsg);
    chatHolder.appendChild(chatItem);
    chatHolder.scrollTop = chatHolder.scrollHeight;
    return chatMsg;
}

function currentState() {
    const gameUrl = document.location.href;
    if (!gameUrl.includes('kirka.io'))
        return 'unknown';
    if (gameUrl.includes('games'))
        return 'game';
    else
        return 'home';
}

ipcRenderer.on('badges', (event, data) => {
    badgesData = data;
});

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

function checkbadge(state, confID = 'ABX') {
    if (!badgesData)
        return;
    if (Object.keys(badgesData).length === 0)
        return;
    const confirmID = (state === 'home') ? config.get('userID') : confID;
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
        const data = badgesData.data[badgeType];
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

// Taken from 42infi/better-kirka-client
function animationLoop() {
    window.requestAnimationFrame(animationLoop);
    const crosshair = document.getElementById('crosshair-static');
    if (crosshair && config.get('hideWeaponOnAds', false))
        crosshair.style = 'visibility: visible !important; opacity: 1 !important; display: block !important;';
    let weap;
    try {
        weap = document.getElementsByClassName('list-weapons')[0].children[0].children[0].innerText;
    } catch (e) {
        return;
    }
    const num = weaponCache[weap] || 4;
    try {
        const weaponModel = scene.entity._entityManager.mWnwM.systemManager._systems['0']._queries.player.entities['0']._components['35'].weapons[weap].model;
        const armsMaterial = weaponModel.parent.children['0'].material;
        const weaponMaterial = weaponModel.children[num].material;
        armsMaterial.visible = !scoped;
        weaponMaterial.visible = !scoped;
    } catch (err) {
        // pass
    }
}
