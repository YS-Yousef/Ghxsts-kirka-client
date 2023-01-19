const { BrowserWindow } = require('electron');
const path = require('path');

function sendPrompt(args) {
    const label = args.label;
    const placeholder = args.placeholder;
    const title = args.title;
    const isPassword = args.isPassword;

    const promptWindow = new BrowserWindow({
        width: 450,
        height: 160,
        backgroundColor: '#ECECEC',
        show: false,
        resizable: false,
        autoHideMenuBar: true,
        modal: true,
        title: title,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, '../prompt/prompt.js')
        }
    });
    const promptPath = path.join(__dirname, '../prompt/prompt.html');

    promptWindow.loadURL(promptPath);

    const options = {
        label: label.toString(),
        placeholder: placeholder.toString(),
        icon: path.join(__dirname, '../media/icon.png').toString(),
        isPassword: isPassword
    };

    promptWindow.webContents.on('did-finish-load', () => {
        promptWindow.webContents.send('prompt-settings', options);
    });

    promptWindow.once('ready-to-show', () => {
        promptWindow.show();
    });

    return promptWindow;
}

module.exports.sendPrompt = sendPrompt;
