const fs = require('fs');
const path = require('path');
const { sha512 } = require('js-sha512');

const lineContainer = document.getElementById('lines');
const raw = document.getElementById('raw');
const preview = document.getElementById('preview');
const tabs = document.getElementById('tabs');
const noOpenFiles = document.getElementById('noopenfiles');
const controls = document.getElementById('controls');

const newFileEl = document.getElementById('newfile');
const openFileEl = document.getElementById('openfile');  

let nextId = 1; 
const { ipcRenderer } = require('electron');

const { app, Menu, dialog, shell } = require('electron').remote;

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
    let links = preview.getElementsByTagName('a');
    for (let i = 0; i < links.length; i++) {
        let current = links.item(i);
        current.addEventListener('click', e => {
            e.preventDefault();
            shell.openExternal(current.getAttribute('href'));
        });
    }
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
    controls.style.display = display;

    noOpenFiles.style.display = tabsState.length > 0 ? 'none' : 'initial';

    if (tabsState.length > 0 && tabsState.every(tab => tab.active === false)) {
        setActiveTab(tabsState[0].id);
    }

    if (tabsState.length > 0) {
        raw.style.height = (raw.scrollHeight + 15) + 'px';
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

raw.addEventListener('input', e => {
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
    if (after && typeof(after) === Function) {
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

let lastSelected;

document.addEventListener('selectionchange', (e) => {
    const target = e.target.activeElement;
    if (target.id !== 'raw') {
        lastSelected = undefined;
        return;
    }
    const { selectionStart, selectionEnd } = target;

    lastSelected = [selectionStart, selectionEnd];

});

function inject({before = '', after = '', preserveNewLine = false, inline = false, padded = false}) {

    if (!lastSelected) {
        return;
    }

    const [first, second] = lastSelected;
    const { value } = raw;

    let beforeText = value.substring(0, first);
    let afterText = value.substring(second, value.length);
    let selectionText = value.substring(first, second);

    if (inline === true) {
        before = (hasLeadingSpace(first) === true ? '' : ' ') + before;
    } else {
        before = (hasLeadingNewLine(first) === true ? '' : '\n') + before;
        after = after + (hasTrailingNewLine(second) === true ? '' : '\n');
    }

    if (preserveNewLine === true && selectionText.length > 0) {
        selectionText = selectionText.replace(/\n+/g, after + '\n' + before).replace(/\n+/g, before + '\n');
    } else if (preserveNewLine === false && selectionText.length > 0) {
        selectionText = selectionText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    raw.value = beforeText + before + (padded === true ? ' ' : '') + selectionText + after + afterText;

    if (raw.value.startsWith('\n')) {
        raw.value = raw.value.substring(1);
    }
    raw.dispatchEvent(new Event('input'));

    raw.selectionStart = second + before.length;
    raw.selectionEnd = second + before.length;
    raw.focus();

}

function hasLeadingNewLine(index) {
    return index !== 0 ? raw.value.charAt(index - 1) === '\n' : false;
}

function hasTrailingNewLine(index) {
    return index !== raw.value.length - 1 ? raw.value.charAt(index + 1) === '\n' : false;
}

function hasLeadingSpace(index) {
    return index !== 0 ? raw.value.charAt(index - 1) === ' ' : false;
}

function injectImage() {
    dialog.showOpenDialog({
        filters: [
            { name: 'Images (.png, .jpeg, .jpg, .gif)', extensions: ['png', 'jpeg', 'jpg', 'gif', 'jfif'] },
            { name: 'All Files (*)', extensions: ['*'] }
        ]
    }).then(({canceled, filePaths}) => {
        if (canceled === true) {
            return;
        }
        fs.copyFileSync(filePaths[0], __dirname + '\\' + path.win32.basename(filePaths[0]));
        inject({before: '![', after: '](' + path.win32.basename(filePaths[0]) + ')', inline: true})
    });

}

const searchContainer = document.getElementById('search');

ipcRenderer.on('search', () => {
    searchContainer.style.visibility = 'visible';
});

const searchBtn = document.getElementById('searchBtn');
const replaceBtn = document.getElementById('replaceBtn');

const searchBox = document.getElementById('searchBox');
const replaceBox = document.getElementById('replaceBox');
const error = document.getElementById('error');
const status = document.getElementById('status');

let current = 1;
let occureneces = [];

searchBox.addEventListener('input', (e) => {
    const { value } = e.target;

    if (value.trim().length === 0) {
        status.innerHTML = '';
        return;
    }

    occureneces = [];
    let lines = raw.value.split('\n');
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        let index = 0;
        let foundIndex;
        do  {
            foundIndex = line.indexOf(value, index);
            if (foundIndex !== -1) {
                occureneces.push({
                    line: i + 1,
                    index: offset + foundIndex,
                });
            }
            index = foundIndex + 1;
        } while (foundIndex !== -1);
        offset += line.length;
    }

    status.innerHTML = "Found " + occureneces.length + " times";

});

searchBtn.addEventListener('click', search);
replaceBtn.addEventListener('click', replace);

function search() {
    let { value } = searchBox;

    if (value.trim().length === 0) {
        return 0;
    }

    searchBox.dispatchEvent(new Event('input'));

    let startPos = raw.selectionEnd | 0;
    let index = raw.value.indexOf(value, startPos);

    if (!index || index === -1) {
        startPos = 0;
        index = raw.value.indexOf(value, startPos);
        if (index === -1) {
            return;
        }
    }

    raw.focus()
    raw.selectionStart = index;
    raw.selectionEnd = index + value.length;

    let lines = raw.value.match(/\n/g).length;
    let lineHeight = raw.clientHeight / lines;
    let occurenece = occureneces.find(occ => index === occ.index + (occ.line - 1));
    if (!occurenece) {
        return;
    }
    document.getElementById('write').scrollTop = lineHeight * (occurenece.line - 1);
 
    return 0;
}

function replace() {
    let searchTerm = searchBox.value;
    let replaceWith = replaceBox.value;
    let current = raw.value.substring(raw.selectionStart, raw.selectionEnd);
    
    if (searchTerm.length === 0 || replaceWith.length === 0) {
        return;
    }

    if (current !== searchTerm) {
        search();
    } 

    raw.value = raw.value.substring(0, raw.selectionStart) + replaceWith + raw.value.substring(raw.selectionEnd, raw.value.length);
    raw.dispatchEvent(new Event('input'));
    search();

}