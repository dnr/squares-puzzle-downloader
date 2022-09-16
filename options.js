var ctxmenubox = document.getElementById('ctxmenu');

function restore() {
    chrome.storage.sync.get({ctxmenu: true}, function(st) {
        ctxmenubox.checked = st.ctxmenu;
    });
}

function save() {
    chrome.storage.sync.set({ctxmenu: ctxmenubox.checked});
}

document.addEventListener('DOMContentLoaded', restore);
ctxmenubox.addEventListener('change', save);
