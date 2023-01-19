/* eslint-disable no-unused-vars */
const { ipcRenderer } = require('electron');

ipcRenderer.on('prompt-settings', (event, options) => {
    document.getElementById('label').innerHTML = options.label;
    document.getElementById('input').placeholder = options.placeholder;
    document.getElementById('input').type = options.isPassword ? 'password' : '';
    document.getElementById('prompt-img').src = options.icon;
});

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('input').focus();
});

function Ok() {
    const returnValue = document.getElementById('input').value.toString();
    ipcRenderer.send('prompt-return-value', returnValue);
}

function Cancel() {
    ipcRenderer.send('prompt-return-value', null);
}
