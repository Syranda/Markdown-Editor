const fs = require('fs');
const path = require('path');

const lineContainer = document.getElementById('lines');
const raw = document.getElementById('raw');
const preview = document.getElementById('preview');
const tabs = document.getElementById('tabs');
let nextId = 1;

let tabsState = [];

function loadFile(fullPath, active) {
    tabsState.push({
        id: nextId++,
        title: path.win32.basename(fullPath),
        file: fullPath,
        active
    });
    const content = fs.readFileSync(fullPath, { encoding: 'utf-8'});
    raw.value = content;
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
    const md = require('markdown-it')('commonmark');
    const rendered = md.render(raw.value);
    preview.innerHTML = rendered;
}

function refreshTabs() {
    tabs.innerHTML = '';
    tabsState.forEach(obj => {
        const el = document.createElement('section');
        el.classList.add('tab');
        if (obj.active === true) {
            el.classList.add('active');
        }
        el.innerHTML = obj.title;
        tabs.appendChild(el);
    });
}

function updateUI() {
    fillLines();
    generateMarkdown();
    refreshTabs();
}

loadFile('test.md', true);
updateUI();

raw.addEventListener('keyup', updateUI);
raw.addEventListener('paste', e => {
    const data = e.clipboardData.getData('text/plain');
    if (!data) {
        e.stopPropagation();
        e.preventDefault();
        return;
    }

});