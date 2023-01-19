require('v8-compile-cache');
const { app, BrowserWindow, clipboard, dialog, ipcMain, protocol } = require('electron');
const electronLocalshortcut = require('electron-localshortcut');
const Store = require('electron-store');
const config = new Store();
const path = require('path');

if (config.get('skipLauncher', false))
    config.set('launcherMode', false);
const launcherMode = config.get('launcherMode', true);
const performanceMode = config.get('performanceMode', false);

const si = require('systeminformation');
const { autoUpdate, sendBadges, updateRPC, initRPC, closeRPC } = require('./features');
const fse = require('fs-extra');
const fs = require('fs');
const https = require('https');
const log = require('electron-log');
const WebSocket = require('ws');

let JSZip, pluginLoader, initBadges;
if (!performanceMode || launcherMode) {
    JSZip = require('jszip');
    pluginLoader = require('./features/plugins').pluginLoader;
    initBadges = require('./features/badges').initBadges;
}
log.transports.file.getFile().clear();

const gamePreload = path.join(__dirname, 'preload', 'global.js');
const splashPreload = path.join(__dirname, 'preload', 'splash.js');
const settingsPreload = path.join(__dirname, 'preload', 'settings.js');
const launcherPreload = path.join(__dirname, 'preload', 'launcher.js');

const md5File = require('md5-file');
const pluginHash = md5File.sync(path.join(__dirname, 'features/plugins.js'));
const preloadHash = md5File.sync(path.join(__dirname, 'preload/settings.js'));
const abcFile = path.join(app.getPath('appData'), '.lock');
const launcherCache = path.join(app.getPath('appData'), 'launcherCache-304.client');

// process.env.ELECTRON_ENABLE_LOGGING = true;

log.info(`
------------------------------------------
Starting KirkaClient ${app.getVersion()}.

Epoch Time: ${Date.now()}
User: ${config.get('user')}
UserID: ${config.get('userID')}
Directory: ${__dirname}

`);

let win;
let splash;
let setwin;
let launcherwin;
let launchMainClient = false;
let canDestroy = false;
let CtrlW = false;
let updateContent;
let errTries = 0;
let changeLogs;
let uniqueID = '';
const allowedScripts = [];
const installedPlugins = [];
const scriptCol = [];
const pluginIdentifier = {};
const pluginIdentifier2 = {};
let pluginsLoaded = false;
let socket;

protocol.registerSchemesAsPrivileged([{
    scheme: 'kirkaclient',
    privileges: { secure: true, corsEnabled: true },
}]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms * 1000));

async function initSocket() {
    try {
        socket = new WebSocket('wss://client.kirka.io/ws', { perMessageDeflate: false });
    } catch (err) {
        console.error(err);
        await retryConnection();
    }

    function send(data) {
        if (socket)
            socket.send(JSON.stringify(data));
    }

    async function retryConnection() {
        await sleep(5);
        log.info('Retrying to connect to socket');
        await initSocket();
    }

    socket.on('open', () => {
        log.info('WebSocket Connected!');
        const channel = config.get('betaTester', false) ? 'beta' : 'stable';
        si.baseboard().then(info => {
            uniqueID = info.serial;
            send({
                type: 5,
                channel: channel,
                version: app.getVersion(),
                userID: config.get('userID'),
                nickname: config.get('user'),
                uniqueID: uniqueID
            });
        });
    });

    socket.on('error', (err) => {
        log.error(err);
    });

    socket.on('close', async function() {
        log.info('WebSocket Disconnected!');
        await retryConnection();
    });

    socket.on('message', (data_) => {
        const data = JSON.parse(data_);
        try {
            switch (data.type) {
            case 1:
                send({ type: 1, data: 'pong' });
                break;
            case 3:
                updateRPC(data.data);
                break;
            case 4:
                sendBadges(data.data);
                if (win && !win.destroyed)
                    win.webContents.send('badges', data.data);
                break;
            case 5:
                updateContent = data.data.updates;
                changeLogs = data.data.changelogs;
                if (launcherMode)
                    launcherwin.webContents.send('changeLogs', changeLogs);
                break;
            case 6:
                if (win && data.userid == config.get('userID', ''))
                    win.webContents.send('msg', data.msg, data.icon);
                break;
            case 7:
                if (data.userid == config.get('userID', '')) {
                    dialog.showErrorBox(data.title, data.msg);
                    app.quit();
                }
                break;
            case 8:
                if (data.uniqueID == uniqueID) {
                    dialog.showErrorBox(data.title, data.msg);
                    app.quit();
                }
                break;
            case 9:
                send({
                    type: 9,
                    userID: config.get('userID'),
                    uniqueID: uniqueID
                });
                break;
            case 12:
                if (!fse.existsSync(abcFile)) {
                    fse.writeFileSync(abcFile, 'PATH=LOCAL_MACHINE/Defender/Programs/StartMenu/config');
                    dialog.showErrorBox('Banned!', 'You are banned from using the client.');
                    app.quit();
                }
            }
        } catch (err) {
            console.error(err);
        }
    });
}

if (config.get('unlimitedFPS', false) && !launcherMode) {
    app.commandLine.appendSwitch('disable-frame-rate-limit');
    app.commandLine.appendSwitch('disable-gpu-vsync');
}

// app.commandLine.appendSwitch('ignore-gpu-blacklist');
// app.commandLine.appendSwitch('ignore-gpu-blocklist');
// app.commandLine.appendSwitch('disable-breakpad');
// app.commandLine.appendSwitch('disable-print-preview');
// app.commandLine.appendSwitch('disable-metrics');
// app.commandLine.appendSwitch('disable-metrics-repo');
// app.commandLine.appendSwitch('enable-javascript-harmony');
// app.commandLine.appendSwitch('no-referrers');
// app.commandLine.appendSwitch('enable-quic');
// app.commandLine.appendSwitch('high-dpi-support', 1);
// app.commandLine.appendSwitch('disable-2d-canvas-clip-aa');
// app.commandLine.appendSwitch('disable-bundled-ppapi-flash');
// app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.allowRendererProcessReuse = true;

if (config.get('experimentalFlags', false)) {
    app.commandLine.appendSwitch('enable-future-v8-vm-features');
    if (config.get('captureMode', 'Window capture') == 'Window capture') {
        app.commandLine.appendSwitch('use-angle', 'd3d9');
        app.commandLine.appendSwitch('enable-webgl2-compute-context');
    }
}

if (config.get('gameCapture', false)) {
    const os = require('os');
    if (os.cpus()[0].model.indexOf('AMD') > -1)
        app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('in-process-gpu');
    app.commandLine.appendSwitch('disable-direct-composition');
}

if (config.get('acceleratedCanvas', true))
    app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 720,
        backgroundColor: '#000000',
        titleBarStyle: 'hidden',
        show: false,
        title: `KirkaClient v${app.getVersion()}`,
        acceptFirstMouse: true,
        icon: icon,
        webPreferences: {
            preload: gamePreload,
            devTools: !app.isPackaged
        },
    });
    win.removeMenu();
    createShortcutKeys();

    win.on('close', function(e) {
        if (CtrlW) {
            e.preventDefault();
            CtrlW = false;
            return;
        }
        app.quit();
    });

    win.webContents.on('new-window', function(event, url_) {
        event.preventDefault();
        win.loadURL(url_);
    });

    const contents = win.webContents;
    win.loadFile('splash/fake.html');

    win.once('ready-to-show', () => {
        console.log('can show now');
        showWin();
        initRPC(socket, contents);
        if (!performanceMode)
            initBadges(socket);
        ensureDirs();
    });

    ipcMain.on('getContents', () => {
        setwin.webContents.send('contentsID', win.id);
    });

    ipcMain.on('toggleRPC', () => {
        const state = config.get('discordRPC');
        if (state)
            initRPC(socket, contents);
        else
            closeRPC();
    });

    function showWin() {
        if (!canDestroy) {
            setTimeout(showWin, 500);
            return;
        }
        splash.destroy();
        if (config.get('fullScreenStart', true))
            win.setFullScreen(true);
        win.loadURL('https://kirka.io/');
        win.show();
    }
}

async function createLauncherWindow() {
    launcherwin = new BrowserWindow({
        width: 1280,
        height: 720,
        backgroundColor: '#000000',
        titleBarStyle: 'hidden',
        show: true,
        title: 'KirkaClient Launcher',
        acceptFirstMouse: true,
        icon: icon,
        webPreferences: {
            preload: launcherPreload,
            devTools: !app.isPackaged
        },
    });
    launcherwin.removeMenu();
    launcherwin.loadFile(path.join(__dirname, 'launcher/launcher.html'));
    launcherwin.webContents.openDevTools();
    launcherwin.webContents.on('dom-ready', async function() {
        await initPlugins(launcherwin.webContents);
        initAutoUpdater(launcherwin.webContents);
        ipcMain.on('launchClient', () => {
            launchMainClient = true;
            app.quit();
        });
        ipcMain.on('launchSettings', createSettings);
    });
}

ipcMain.on('updatePreferred', async(event, data) => {
    const request = {
        method: 'POST',
        hostname: 'client.kirka.io',
        path: '/api/preferred',
        headers: {
            'Content-Type': 'application/json'
        },
    };
    const req = https.request(request, res => {
        log.info(`Preferred Badge POST: ${res.statusCode} with payload ${data}`);
    });
    req.on('error', error => {
        log.error(`Preferred Badge Error: ${error}`);
    });
    req.write(JSON.stringify(data));
    req.end();
});

function ensureDirs() {
    const documents = app.getPath('documents');
    const appPath = path.join(documents, 'KirkaClient');
    const recorderPath = path.join(appPath, 'videos');
    const fileDir = path.join(appPath, 'plugins');
    // const node_modules = path.join(fileDir, 'node_modules');

    if (!fse.existsSync(appPath))
        fse.mkdirSync(appPath);
    if (!fse.existsSync(recorderPath))
        fse.mkdirSync(recorderPath);
    if (!fse.existsSync(fileDir))
        fse.mkdirSync(fileDir);
    ipcMain.handle('logDir', () => { return appPath; });
}

ipcMain.on('clearCache', () => clearCache(true));

function createShortcutKeys() {
    const contents = win.webContents;

    electronLocalshortcut.register(win, 'Escape', () => contents.executeJavaScript('document.exitPointerLock()', true));
    electronLocalshortcut.register(win, 'F4', () => clipboard.writeText(contents.getURL()));
    electronLocalshortcut.register(win, 'F5', () => contents.reload());
    electronLocalshortcut.register(win, 'Shift+F5', () => contents.reloadIgnoringCache());
    electronLocalshortcut.register(win, 'F6', () => joinByURL());
    electronLocalshortcut.register(win, 'F8', () => win.loadURL('https://kirka.io/'));
    electronLocalshortcut.register(win, 'F11', () => win.setFullScreen(!win.isFullScreen()));
    electronLocalshortcut.register(win, 'F12', () => toggleDevTools());
    electronLocalshortcut.register(win, 'Control+Shift+I', () => toggleDevTools());
    electronLocalshortcut.register(win, 'Control+Alt+C', () => clearCache());
    if (config.get('controlW', true))
        electronLocalshortcut.register(win, 'Control+W', () => { CtrlW = true; });
}

ipcMain.on('joinLink', joinByURL);

function ensureDev(password) {
    if (!password)
        return;
    const options = {
        method: 'POST',
        hostname: 'client.kirka.io',
        path: '/api/v2/token',
        headers: {
            'Content-Type': 'application/json'
        },
    };
    const req = https.request(options, res => {
        res.on('data', d => {
            const response = JSON.parse(d.toString());
            if (response.success)
                win.webContents.openDevTools();
            else
                dialog.showErrorBox('Incorrect Token', 'The token you entered is incorrect. Don\'t try to access things you aren\'t sure of.');
        });
    });
    req.on('error', error => {
        log.error(`Dev Error: ${error}`);
    });
    req.write(JSON.stringify({ token: password }));
    req.end();
}

let promptWindow;

function toggleDevTools() {
    if (config.get('devToken', '') === '') {
        const prompt = require('./features/promptManager');
        promptWindow = prompt.sendPrompt({
            title: 'Provide Authentication',
            label: 'Enter developer token to connect to devTools:',
            placeholder: 'Token here',
            isPassword: true
        });
    } else
        ensureDev(config.get('devToken', ''));
}

ipcMain.handle('show-info', async(ev, title, details) => {
    await dialog.showMessageBox({
        title: title,
        message: title,
        detail: details,
        type: 'info'
    });
    return 0;
});

ipcMain.on('prompt-return-value', (event, value) => {
    promptWindow.close();
    ensureDev(value);
});

function joinByURL() {
    const urld = clipboard.readText();
    if (urld.includes('kirka.io/games/'))
        win.loadURL(urld);
}

let icon;

if (process.platform === 'linux')
    icon = path.join(__dirname, 'media', 'icon.png');
else
    icon = path.join(__dirname, 'media', 'icon.ico');

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});

app.on('will-quit', () => {
    win = null;
    if (socket)
        socket.close(1000, `Quitting app. Mode: ${launcherMode ? 'launcher' : 'client'}`);
    closeRPC();
    scriptCol.forEach(script => {
        try {
            script.exitMain();
        } catch (e) {
            console.error(e);
        }
    });
    if (launcherMode && launchMainClient) {
        config.set('launcherMode', false);
        console.log('Rebooting');
        rebootClient();
    } else {
        config.set('launcherMode', true);
        console.log('Quitting');
        app.quit();
    }
});

function createSplashWindow() {
    splash = new BrowserWindow({
        width: 600,
        height: 350,
        center: true,
        resizable: false,
        frame: false,
        show: true,
        icon: icon,
        title: 'Loading Client',
        transparent: true,
        webPreferences: {
            preload: splashPreload,
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    splash.loadFile(`${__dirname}/splash/splash.html`);
    splash.webContents.on('dom-ready', async function() {
        if (config.get('skipLauncher', false))
            await initAutoUpdater(splash.webContents);
        createWindow();
        if (!performanceMode)
            await initPlugins(splash.webContents);
        canDestroy = true;
    });

    splash.once('closed', () => {
        if (!win)
            app.quit();
    });
}

async function initAutoUpdater(webContents) {
    if (!updateContent) {
        setTimeout(() => {
            if (socket.readyState !== 1)
                errTries = errTries + 1;
            if (errTries >= 40) {
                log.error('WebSocket connection failed.');
                dialog.showErrorBox('Websocket Error', 'Client is experiencing issues connecting to the WebSocket. ' +
                'Check your internet connection.\nIf your connection seems good, please report this issue to the support server.');
                // createLauncherWindow();
                return;
            }
            initAutoUpdater(webContents);
        }, 500);
        return;
    }

    const didUpdate = await autoUpdate(webContents, updateContent);
    log.info(didUpdate);
    if (didUpdate) {
        config.set('update', true);
        const options = {
            buttons: ['Ok'],
            message: 'Update Complete! Client will now restart.'
        };
        await dialog.showMessageBox(options);
        rebootClient();
    }
}

ipcMain.on('show-settings', () => {
    if (setwin) {
        setwin.focus();
        return;
    }
    createSettings();
});

ipcMain.on('reboot', () => {
    rebootClient();
});

ipcMain.handle('downloadPlugin', async(ev, uuid) => {
    log.info('Need to download', uuid);
    return await downloadPlugin(uuid);
});

ipcMain.handle('uninstallPlugin', async(ev, uuid) => {
    log.info('Need to remove', uuid);

    if (!pluginIdentifier[uuid])
        return { success: false };

    const scriptPath = pluginIdentifier[uuid][1];
    await fse.remove(scriptPath);
    installedPlugins.splice(installedPlugins.indexOf(uuid), 1);
    return { success: true };
});

ipcMain.on('installedPlugins', (ev) => {
    ev.returnValue = JSON.stringify(installedPlugins);
});

function createSettings() {
    setwin = new BrowserWindow({
        width: 1920,
        height: 1080,
        show: true,
        frame: true,
        icon: icon,
        title: 'KirkaClient Settings',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            preload: settingsPreload,
            devTools: !app.isPackaged,
        }
    });

    setwin.removeMenu();
    setwin.loadFile(path.join(__dirname, 'settings/settings.html'));
    setwin.maximize();
    setwin.webContents.openDevTools();
    // setwin.setResizable(false)

    setwin.on('close', () => {
        setwin = null;
    });
}

ipcMain.handle('allowedScripts', () => {
    return JSON.stringify(pluginIdentifier);
});

ipcMain.handle('scriptPath', () => {
    return path.join(app.getPath('appData'), '/KirkaClient/plugins');
});

ipcMain.handle('ensureIntegrity', () => {
    ensureIntegrity();
    return JSON.stringify(allowedScripts);
});

ipcMain.handle('canLoadPlugins', () => {
    return pluginsLoaded;
});

async function installUpdate(pluginPath, uuid) {
    try {
        await fse.remove(pluginPath);
    } catch (e) {
        log.info(e);
    }
    await downloadPlugin(uuid);
}

async function unzipFile(zip) {
    const fileBuffer = await fse.readFile(zip);
    const pluginPath = path.join(app.getPath('appData'), '/KirkaClient/plugins');
    const newZip = new JSZip();

    const contents = await newZip.loadAsync(fileBuffer);
    for (const filename of Object.keys(contents.files)) {
        const content = await newZip.file(filename).async('nodebuffer');
        const dest = path.join(pluginPath, filename);
        await fse.ensureDir(path.dirname(dest));
        await fse.writeFile(dest, content);
    }
}

async function downloadPlugin(uuid) {
    return await new Promise(resolve => {
        const req = https.get(`https://client.kirka.io/api/v2/plugins/download/${uuid}?token=${encodeURIComponent(config.get('devToken'))}`, (res) => {
            res.setEncoding('binary');
            let chunks = '';
            log.info(`Update GET: ${res.statusCode}`);
            if (res.statusCode !== 200)
                return resolve(false);
            const filename = res.headers['filename'];
            res.on('data', (chunk) => {
                chunks += chunk;
            });
            res.on('end', async() => {
                try {
                    const pluginsDir = path.join(app.getPath('appData'), '/KirkaClient/plugins/', filename);
                    await fse.writeFile(pluginsDir, chunks, 'binary');
                    await unzipFile(pluginsDir);
                    await fse.remove(pluginsDir);
                    log.info(`Plugin ${filename} downloaded`);
                    resolve(true);
                } catch (e) {
                    log.error(e);
                    resolve(false);
                }
            });
        });
        req.on('error', error => {
            log.error(`Download Error: ${error}`);
            resolve(false);
        });
        req.end();
    });
}

function ensureScriptIntegrity(filePath, scriptUUID) {
    if (!app.isPackaged)
        return { success: true };
    return new Promise((resolve, reject) => {
        const hash = md5File.sync(filePath + 'c');
        const data = { hash: hash, uuid: scriptUUID };
        const request = {
            method: 'POST',
            hostname: 'client.kirka.io',
            path: '/api/v2/plugins/updates',
            headers: {
                'Content-Type': 'application/json'
            },
        };

        const req = https.request(request, res => {
            res.setEncoding('utf-8');
            let chunks = '';
            log.info(`POST: ${res.statusCode} with payload ${JSON.stringify(data)}`);
            if (res.statusCode != 200) {
                if (!app.isPackaged)
                    resolve({ success: false });
                else
                    reject();
            } else {
                res.on('data', (chunk) => {
                    chunks += chunk;
                });
                res.on('end', () => {
                    const response = JSON.parse(chunks);
                    const success = response.success;
                    log.info(`Response on ${scriptUUID}: ${JSON.stringify(response, null, 2)}`);
                    if (!success)
                        reject();

                    resolve(response);
                });
            }
        });
        req.on('error', error => {
            log.error(`POST Error: ${error}`);
            reject();
        });

        req.write(JSON.stringify(data));
        req.end();
    });
}

async function ensureIntegrity() {
    const oldAllowed = allowedScripts;
    allowedScripts.length = 0;
    const fileDir = path.join(app.getPath('appData'), '/KirkaClient/plugins');
    try {
        fse.mkdirSync(fileDir, { recursive: true });
    // eslint-disable-next-line no-empty
    } catch (err) {}

    for (const scriptPath in oldAllowed) {
        try {
            const scriptUUID = pluginIdentifier2[scriptPath];
            await ensureScriptIntegrity(scriptPath, scriptUUID);
            allowedScripts.push(scriptPath);
            log.info(`Ensured script: ${scriptPath}`);
        } catch (err) {
            log.info(err);
        }
    }
}

async function copyFolder(from, to, webContents) {
    let files;
    try {
        await fse.mkdir(to);
    } catch (err) {
        // EEXISTS
    }
    try {
        files = await fs.promises.readdir(from);
    } catch (err) {
        console.log(err);
        console.log(from, to);
        return;
    }
    for (const file of files) {
        const fromPath = path.join(from, file);
        const toPath = path.join(to, file);
        const stat = await fse.stat(fromPath);
        if (stat.isDirectory())
            await copyFolder(fromPath, toPath, webContents);
        else {
            try {
                await fse.copyFile(fromPath, toPath);
            } catch (err) {
                console.log(err);
            }
        }
    }
}

async function copyNodeModules(srcDir, node_modules, incomplete_init, webContents) {
    // if (!app.isPackaged)
    //     return;
    try {
        await fse.remove(node_modules);
    } catch (err) {
        console.log(err);
    }
    await fse.mkdir(node_modules, { recursive: true });
    await fse.writeFile(incomplete_init, 'DO NOT DELETE THIS!');
    log.info('copying from', srcDir, 'to', node_modules);
    webContents.send('copying');
    await copyFolder(srcDir, node_modules, webContents);
    log.info('copying done');
    webContents.send('copyProgress');
    await fse.unlink(incomplete_init);
}

async function getDirectories(source) {
    return (await fse.readdir(source, { withFileTypes: true }))
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
        .map(dirent => dirent.name);
}

async function initPlugins(webContents) {
    const fileDir = path.join(app.getPath('appData'), 'KirkaClient', 'plugins');
    log.info('fileDir', fileDir);
    const node_modules = path.join(fileDir, 'node_modules');
    const srcDir = path.join(__dirname, '../node_modules');
    const incomplete_init = path.join(fileDir, 'node_modules.lock');
    try {
        await fse.mkdir(fileDir);
    } catch (err) {
        console.log(err);
    }

    if (!fse.existsSync(node_modules) || fse.existsSync(incomplete_init)) {
        webContents.send('message', 'Configuring Plugins...');
        await copyNodeModules(srcDir, node_modules, incomplete_init, webContents);
    }
    log.info('node_modules stuff done.');
    log.info(fse.readdirSync(fileDir));
    const filenames = [];
    // get all directories inside a direcotry
    const dirs = await getDirectories(fileDir);
    console.log(dirs);

    for (const dir of dirs) {
        log.info(dir);
        const packageFile = path.join(fileDir, dir, 'package.json');
        if (fse.existsSync(packageFile)) {
            const packageJson = JSON.parse(fse.readFileSync(packageFile));
            filenames.push([dir, packageJson]);
        } else {
            log.info('No package.json');
            continue;
        }
    }
    log.info('filenames', filenames);
    if (filenames.length === 0)
        webContents.send('pluginProgress', 0, 0, 0);
    let count = 0;
    for (const [dir, packageJson] of filenames) {
        try {
            count += 1;
            const pluginName = packageJson.name;
            const pluginPath = path.join(fileDir, dir);
            const scriptPath = path.join(pluginPath, packageJson.main);
            const pluginUUID = packageJson.uuid;
            const pluginVer = packageJson.version;

            webContents.send('message', `Loading ${pluginName} v${pluginVer} (${count}/${filenames.length})`);
            log.info('scriptPath:', scriptPath);
            const data = await ensureScriptIntegrity(scriptPath, pluginUUID);
            log.debug(data);
            if (data) {
                if (data.update) {
                    webContents.send('message', 'Updating Plugin');
                    await installUpdate(pluginPath, pluginUUID);
                    webContents.send('message', `Reloading Plugin: ${count}/${filenames.length}`);
                }
            }
            log.debug(packageJson);
            let script = await pluginLoader(pluginUUID, dir, packageJson);
            if (Array.isArray(script)) {
                webContents.send('message', 'Cache corrupted. Rebuilding...');
                await copyNodeModules(srcDir, node_modules, incomplete_init, webContents);
                script = await pluginLoader(pluginUUID, dir, packageJson, false, true);
            }
            if (Array.isArray(script))
                continue;
            if (!script.isPlatformMatching())
                log.info(`Script ignored, platform not matching: ${script.scriptName}`);
            else {
                allowedScripts.push(scriptPath);
                installedPlugins.push(script.scriptUUID);
                pluginIdentifier[script.scriptUUID] = [script.scriptName, pluginPath];
                pluginIdentifier2[script.scriptName] = script.scriptUUID;
                scriptCol.push(script);
                try {
                    log.debug('[PLUGIN]:', script.scriptName, 'launching main');
                    script.launchMain(win);
                } catch (err) {
                    log.info(err);
                    dialog.showErrorBox(`Error in ${script.scriptName}`, err);
                }
                log.info(`Loaded script: ${script.scriptName}- v${script.ver}`);
                webContents.send('pluginProgress', filenames.length, count, ((count / filenames.length) * 100).toFixed(0));
            }
        } catch (err) {
            log.info(err);
        }
    }
    pluginsLoaded = true;
}

function rebootClient() {
    app.relaunch();
    app.quit();
}

app.once('ready', async function() {
    if (fse.existsSync(abcFile)) {
        dialog.showErrorBox('Banned!', 'You are banned from using the client.');
        app.quit();
    }
    if (!config.has('terms')) {
        const res = await dialog.showMessageBox({
            type: 'info',
            title: 'Terms of Service',
            message: 'By using this client, you agree to our terms and services.\nThey can be found at https://client.kirka.io/terms',
            buttons: ['I agree', 'I disagree'],
        });
        if (res.response == 1)
            app.quit();
        else
            config.set('terms', true);
    }
    log.info(pluginHash, preloadHash);
    if ((pluginHash !== 'a816980fe23b9d07d87a42902f0ad5c2' || preloadHash !== 'c88de521996bc4e08f7ec318a0dc4ddc') && app.isPackaged) {
        dialog.showErrorBox(
            'Client tampered!',
            'It looks like the client is tampered with. Please install new from https://client.kirka.io. This is for your own safety!'
        );
        app.quit();
        return;
    }
    if (launcherMode && !fse.existsSync(launcherCache)) {
        fse.writeFileSync(launcherCache, '1');
        await clearCache(true);
    }
    await initSocket();
    if (launcherMode) {
        log.info('Launcher mode');
        await createLauncherWindow();
    } else {
        log.info('Client mode');
        createSplashWindow();
    }
});

async function clearCache() {
    log.info('Clearing cache');
    const bat = path.join(__dirname, 'clear_cache.bat');
    const bat_args = [
        path.join(app.getPath('appData'), 'KirkaClient'),
        path.join(app.getAppPath(), '../', 'KirkaClient.exe')
    ];
    await dialog.showMessageBox({
        type: 'info',
        title: 'Clearing cache',
        message: 'A new window will open to clear the cache. Please do not close it. This window will close when the cache is cleared and client will relaunch.',
        buttons: ['OK'],
    });
    const new_bat = path.join(app.getPath('cache'), 'clear_cache.bat');
    await fse.copyFile(bat, new_bat);
    const out = fs.openSync(path.join(app.getPath('cache'), 'clear_cache_out.log'), 'a');
    const spawn = require('child_process').spawn;
    log.info(`"${new_bat}" "${bat_args.join('" "')}"`);
    // eslint-disable-next-line quotes
    spawn(`"${new_bat}" "${bat_args.join('" "')}"`, { shell: true, stdio: ['ignore', out, out], detached: true }).unref();
    app.quit();
}
