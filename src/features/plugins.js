/* eslint-disable no-unused-vars */
/* eslint-disable quotes */

const fs = require('fs');
const log = require('electron-log');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PluginManager } = require('live-plugin-manager');
const { app, ipcRenderer } = require('electron');
let manager;
require('bytenode');

class KirkaClientScript {

    constructor(scriptData) {
        this.scriptName = scriptData.scriptName;
        this.scriptUUID = scriptData.scriptUUID;
        this.ver = scriptData.ver;
        this.desc = scriptData.desc;
        this.allowedLoc = scriptData.allowedLoc;
        this.allowedPlat = scriptData.allowedPlat;
        this.sett = scriptData.sett;
        this.launchMain = scriptData.launchMain;
        this.launchRenderer = scriptData.launchRenderer;
        this.exitMain = scriptData.exitMain;

        if (
            !this.scriptName ||
            !this.ver ||
            !this.desc ||
            !this.allowedLoc ||
            !this.allowedPlat ||
            !this.sett ||
            !this.launchMain ||
            !this.launchRenderer ||
            !this.scriptUUID
        )
            throw 'Invalid Script';
    }

    isLocationMatching(current) {
        return this.allowedLoc.some(location => ['all', current].includes(location));
    }

    isPlatformMatching() {
        return this.allowedPlat.some(platform => ['all', process.platform].includes(platform));
    }

}

module.exports.pluginLoader = async function(uuid, dir, packageJSON, skipInstall = false, force = false) {
    log.info('call to load', uuid, 'with skipInstall as', skipInstall);
    let fileDir;
    if (!app)
        fileDir = await ipcRenderer.invoke('scriptPath');
    else
        fileDir = path.join(app.getPath('appData'), 'KirkaClient', 'plugins');
    const scriptPath = path.join(fileDir, dir, packageJSON.main);
    if (!manager) {
        manager = new PluginManager({
            pluginsPath: path.join(fileDir, 'node_modules')
        });
    }

    if (!skipInstall) {
        const modules = packageJSON.modules;

        log.info('Modules to install:', modules);
        for (const mod of modules) {
            if (manager.alreadyInstalled(mod) && !force) {
                log.info(mod, 'is already installed. Skipping.');
                continue;
            }
            let need = {};
            if (!force) {
                log.info('Trying to check if', mod, 'is already installed via code.');
                const code = `
                const data = { success: true, path: '' };
                try {
                    require('${mod}');
                    data['path'] = require.resolve('${mod}');
                } catch(err) {
                    data['success'] = false;
                }
                module.exports = data;
                `;
                const fileName = `${uuidv4()}_${mod}_check.js`;
                const filePath = path.join(fileDir, fileName);
                await fs.promises.writeFile(filePath, code);
                need = require(filePath);
                await fs.promises.unlink(filePath);
            }
            if (!need.success || force) {
                log.info('Installing', mod);
                await manager.install(mod);
                log.info(mod, 'installed successfully.');
            }
        }
    }
    try {
        log.info('Trying to load', scriptPath);
        const script = require(scriptPath);
        const clientScript = new KirkaClientScript(script('token'));
        return clientScript;
    } catch (err) {
        log.error('Found some error.', err);
        return [];
    }
};
