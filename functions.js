const fs = require('fs');
const path = require('path');
const { sha512 } = require('js-sha512');

const lineContainer = document.getElementById('lines');
const raw = document.getElementById('raw');
const preview = document.getElementById('preview');
const tabs = document.getElementById('tabs');
const noOpenFiles = document.getElementById('noopenfiles');

const newFileEl = document.getElementById('newfile');
const openFileEl = document.getElementById('openfile');  

let nextId = 1; 
const { ipcRenderer } = require('electron');

const { app, Menu, dialog } = require('electron').remote;

let tabsState = [];
let activeTab;

function loadFile(fullPath) {
    app.addRecentDocument(fullPath);
    let id = nextId++;
    let content =  fs.readFileSync(fullPath, { encoding: 'utf-8'});
    tabsState.push({
        id,
        title: path.win32.basename(fullPath),
        file: fullPath,
        active: false,
        content,
        hash: sha512(content)
    });
    return id;
}

function fillLines() {
    lineContainer.innerHTML = '';
    for (let i = 0; i < (raw.value.match(/\n/g) || []).length + 1; i++) {
        let tmp = document.createElement('label');
        tmp.innerHTML = i + 1;
        lineContainer.appendChild(tmp);
    }
}

function generateMarkdown() {
    const marked = require('marked');
    const rendered = marked(raw.value);
    preview.innerHTML = rendered;
}

function refreshTabs() {
    tabs.innerHTML = '';
    tabsState.forEach(obj => {
        const el = document.createElement('section');
        el.classList.add('tab');
        el.addEventListener('click', e => {
            setActiveTab(obj.id);
            updateUI();
        });
        let changed = obj.hash !== sha512(obj.content);
        el.innerHTML = (changed ? '* ' : '') + obj.title;
        tabs.appendChild(el);
        if (obj.active === true) {
            el.classList.add('active');
            const close = document.createElement('i');
            close.classList.add('fas', 'fa-times', 'close');
            close.addEventListener('click', closeFile);
            el.append(close);
        }
    });
}

function updateUI() {
    fillLines();
    generateMarkdown();
    refreshTabs();
        
    let display = tabsState.length === 0 ? 'none' : 'initial';

    lineContainer.style.display = display;
    raw.style.display = display;
    preview.style.display = display;
    tabs.style.display = display;

    noOpenFiles.style.display = tabsState.length > 0 ? 'none' : 'initial';

    if (tabsState.length > 0 && tabsState.every(tab => tab.active === false)) {
        setActiveTab(tabsState[0].id);
    }

}

function setActiveTab(id) {
    activeTab = id;
    tabsState.forEach(tab => {
        tab.active = tab.id === id;
        if (tab.active) {
            raw.value = tab.content;            
            let changed = tab.hash !== sha512(tab.content);
            Menu.getApplicationMenu().getMenuItemById('save').enabled = changed;
        }
    });
    updateUI();
}

raw.addEventListener('keyup', e => {
    let at = tabsState.find(tab => tab.id === activeTab);
    at.content = e.target.value;
    at.changed = true;
    Menu.getApplicationMenu().getMenuItemById('save').enabled = at.changed,
    updateUI();
});
raw.addEventListener('paste', e => {
    const data = e.clipboardData.getData('text/plain');
    if (!data) {
        e.stopPropagation();
        e.preventDefault();
        return;
    }

});

ipcRenderer.on('open-tab', (e, msg) => {
    let id = loadFile(msg.path, true);
    setActiveTab(id);
    updateUI();
});

ipcRenderer.on('save', save);
ipcRenderer.on('save-as', saveAs);
ipcRenderer.on('new-file', newFile);
ipcRenderer.on('close-file', closeFile);

function save(after) {
    let tab = tabsState.find(tab => tab.id === activeTab);
    if (!tab.file) {
        saveAs(after);
        return;
    }
    fs.writeFileSync(tab.file, tab.content);
    tab.hash = sha512(tab.content);
    updateUI();
    if (after) {
        after();
    }
}

function saveAs(after) {
    dialog.showSaveDialog({
        filters: [
            { name: 'Markdown File (.md)', extensions: ['md'] },
            { name: 'All Files (*)', extensions: ['*'] }
        ]
    }).then(({canceled, filePath}) => {
        if (canceled === true) {
            return;
        }
        let tab = tabsState.find(tab => tab.id === activeTab);
        tab.file = filePath;
        tab.title = path.win32.basename(filePath);
        save(after);
    });
}

function newFile() {
    let id = nextId++;
    tabsState.push({
        id,
        title: 'New File',
        file: undefined,
        active: false,
        content: '',
        hash: sha512('')
    });
    setActiveTab(id);
}

function closeFile() {

    let tab = tabsState.find(tab => tab.id === activeTab);

    if (!tab) {
        return;
    }

    if (tab.hash === sha512(tab.content)) {
        tabsState = tabsState.filter(t => t.id !== tab.id);
        updateUI();
        return;
    }

    dialog.showMessageBox({
        title: 'Save changes?',
        type: 'question',
        message: 'You have unsaved changes. Would you like to save them?',
        buttons: ['Yes', 'No', 'Cancel']
    }).then(({ response }) => {
        switch (response) {
            case 0:
                save(() => {
                    tabsState = tabsState.filter(t => t.id !== tab.id);  
                    updateUI();    
                });
                return;
            case 1:  
                tabsState = tabsState.filter(t => t.id !== tab.id); 
                setActiveTab(tabsState[0].id);    
                break;      
            case 2:      
                updateUI();  
                break;
        }
    });

}

updateUI();

openFileEl.addEventListener('click', () => ipcRenderer.send('open-file'));
newFileEl.addEventListener('click', newFile);