const { app, BrowserWindow, Menu, MenuItem, ipcMain } = require('electron');

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });
    win.loadFile('index.html');
    win.webContents.openDevTools();

    win.on('close', () => {
        win = null;
    });

}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (win === null) {
        createWindow();
    }
});

app.setUserTasks([
    {
        program: process.execPath,
        arguments: process.argv + '--new-window',
        iconPath: process.execPath,
        iconIndex: 0,
        title: 'New Window',
        description: 'Create a new window'
    }
]);

function openFile() {
    const { dialog } = require('electron');
    dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Markdown Files (.md)', extensions: ['md'] },
            { name: 'All Files (*)', extensions: ['*'] }
        ]
    }).then(({canceled, filePaths}) => {
        if (canceled === true) {
            return;
        }
        win.webContents.send('open-tab', { path: filePaths[0] });
    });
}

let men = new Menu();
men.append(new MenuItem({
    label: 'File',
    type: 'submenu',
    submenu: [
        new MenuItem({
            label: 'New...',
            accelerator: 'CommandOrControl+N',
            click: () => win.webContents.send('new-file')
        }),
        new MenuItem({
            label: 'Open...',
            accelerator: 'CommandOrControl+O',
            click: openFile
        }),
        new MenuItem({
            type: 'separator'
        }),
        new MenuItem({
            id: 'save',
            label: 'Save',
            accelerator: 'CommandOrControl+S',
            enabled: false,
            click: () => win.webContents.send('save')
        }),
        new MenuItem({
            id: 'save-as',
            label: 'Save as...',
            accelerator: 'CommandOrControl+ALT+S',
            click: () => win.webContents.send('save-as')
        }),
        new MenuItem({
            id: 'close-file',
            label: 'Close file',
            click: () => win.webContents.send('close-file')
        }),
        new MenuItem({
            type: 'separator'
        }),
        new MenuItem({
            label: 'Exit',
            accelerator: 'CommandOrControl+Q',
            click: () => {
                app.quit();
            }
        })
    ]
}));

Menu.setApplicationMenu(men);

ipcMain.on('open-file', openFile);

