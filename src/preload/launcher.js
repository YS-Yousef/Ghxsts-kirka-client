const { ipcRenderer, shell } = require('electron');
const config = new (require('electron-store'))();

ipcRenderer.on('changeLogs', (event, changeLogs) => {
    makeChangeLogs(changeLogs);
});

function makeChangeLogs(changeLogs) {
    let html = '';
    const versions = Object.keys(changeLogs);
    for (let i = 0; i < versions.length; i++) {
        const version = versions[i];
        const data = changeLogs[version];
        const changes = data.changes;
        const releaseDate = data.releaseDate;
        const isNewest = i === 0;
        html += `<div class="patch-notes-wrapper">
            <div class="patch-info">
                <div class="update-v">Version ${version}</div>
                <span>-</span>
                <div class="update-date">${releaseDate}</div>
                ${isNewest ? '<div class="newest">Newest</div>' : ''}
            </div>
            <div class="patch-notes-content">
                <ul>`;
        for (let j = 0; j < changes.length; j++) {
            const change = changes[j];
            html += `<li>${change}</li>`;
        }
        html += `</ul>
            </div>
        </div>`;
    }
    const notes = document.getElementById('patch-notes');
    notes.innerHTML += html;
}

window.addEventListener('DOMContentLoaded', () => {
    const performanceModeInput = document.getElementsByTagName('input')[0];
    performanceModeInput.checked = config.get('performanceMode', false);
    performanceModeInput.addEventListener('change', (event) => {
        const checked = event.target.checked;
        config.set('performanceMode', checked);
    });
    document.getElementById('client-website-btn').onclick = () => openExternal('client.kirka.io');
    document.getElementById('client-discord-btn').onclick = () => openExternal('discord.gg/bD9JNv6GFS');
    document.getElementById('launch-client').onclick = () => ipcRenderer.send('launchClient');
    document.getElementById('launch-settings').onclick = () => ipcRenderer.send('launchSettings');
    document.getElementById('clear-cache').onclick = () => ipcRenderer.send('clearCache');
});

function openExternal(url) {
    shell.openExternal(`https://${url}`);
}

ipcRenderer.on('copying', () => {
    document.getElementById('progress-text').innerText = 'Configuring Plugins...';
});

ipcRenderer.on('copyProgress', () => {
    document.getElementById('progress-text').innerText = 'Copying complete.';
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('progress-amount').innerText = '';
});

ipcRenderer.on('pluginProgress', (ev, count, loaded, progress) => {
    console.log(`pluginProgress: ${count}/${loaded} ${progress}`);
    document.getElementById('progress-text').innerText = `[${loaded}/${count}] Loading Plugins...`;
    document.getElementById('progress-bar').style.width = `${progress}%`;
    document.getElementById('progress-amount').innerText = `${progress}%`;

    if (count === loaded) {
        document.getElementById('progress-text').innerText = 'Launcher Ready!';
        document.getElementById('progress-bar').style.width = '100%';
        document.getElementById('progress-amount').innerText = '100%';
    }
});

ipcRenderer.on('progress', (ev, progress) => {
    document.getElementById('progress-text').innerText = 'Downloading Update...';
    document.getElementById('progress-bar').style.width = `${progress}%`;
    document.getElementById('progress-amount').innerText = `${progress}%`;
});

ipcRenderer.on('warning', (ev, text) => {
    document.getElementById('progress-warning').innerText = text;
});
