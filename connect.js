var SQUARES = "https://squares.io";

// fetching:

// we can only request permissions to new origins from a user interaction.
// a message from a page load when the page was loaded by our context menu
// handler counts as an interaction. just to be sure, we pass the url from the
// context menu handler through here also, so we don't try to request
// permissions without a real interaction.
var contextMenuUrls = [];

function checkUrl(url) {
    // rewrite rules in the app might change the url (e.g. from a preview page
    // to a direct download). so don't require an exact match here, just some
    // interaction.
    if (contextMenuUrls.pop()) {
        return [true, false];
    }
    var nyt = new RegExp("^https://www[.]nytimes[.]com/(svc/)?crosswords/.*");
    if (nyt.test(url)) return [true, true];
    return false;
}

function getPermissions(url, cb) {
    // some sites (notably beq) link to an http url that redirects to https.
    // we need to ask for both here because we don't get another chance.
    // for nyt we can just ask for https (to avoid prompting for new
    // permissions, since the manifest says https).
    var hostname = new URL(url).hostname;
    var scheme = hostname === "www.nytimes.com" ? "https" : "*";
    var origins = [scheme+"://"+hostname+"/"];
    var perm = {origins: origins};
    chrome.permissions.contains(perm, function(result) {
        if (result) // have permissions already
            cb(true);
        else
            chrome.permissions.request(perm, cb);
    });
}

function onMessage(req, sender, reply) {
    if (req.ping) {
        reply({pong: req.ping});
        return false;
    } else if (req.fetchurl) {
        var url = req.fetchurl;
        var checkRes = checkUrl(url);
        if (!checkRes || !checkRes[0]) {
            reply({error: true, code: 'allow', text: "URL is not allowed"});
            return false;
        }
        var needCreds = checkRes[1];

        function havePerms(have) {
            if (!have) {
                reply({error: true, code: 'perms', text: "Permission request was denied by the user"});
                return false;
            }
            var opts = {
                mode: 'cors',
                credentials: needCreds ? 'include' : 'omit',
            };
            var p = fetch(url, opts);
            p.catch(function(err) {
                reply({error: true, code: 'fetch', text: "Fetch error: "+err});
            });
            p.then(function(res) {
                if (res.status != 200) {
                    reply({error: true, code: 'fetch',
                           text: "HTTP error: "+res.status+": "+res.statusText});
                    return;
                }
                var p2 = res.arrayBuffer();
                p2.catch(function(err) {
                    reply({error: true, code: 'fetch', text: "Read error: "+err});
                });
                p2.then(function(buf) {
                    var cdhdr = res.headers.get('Content-Disposition');
                    var puz64 = btoa(
                        new Uint8Array(buf)
                        .reduce((data, b) => data + String.fromCharCode(b), '')
                    );
                    reply({puz64: puz64, cdhdr: cdhdr});
                });
            });
        }

        getPermissions(url, havePerms);
        return true;
    }
}
chrome.runtime.onMessageExternal.addListener(onMessage);


// context menu handler:

function onContextMenuClick(info, tab) {
    var url;
    if (info.menuItemId === lnkmenuid) {
        url = info.linkUrl;
    } else if (info.menuItemId === frmmenuid) {
        url = info.frameUrl;
    }

    // tell the message handler to expect this url
    contextMenuUrls.push(url);
    // navigate to the site and let it handle it
    var navurl = SQUARES + "/fetch/url?url=" + encodeURIComponent(url) + "&from=" + encodeURIComponent(tab.url);
    chrome.tabs.create({
        windowId: tab.windowId,
        index: tab.index+1,
        url: navurl,
        active: true,
        openerTabId: tab.id,
    });
}
chrome.contextMenus.onClicked.addListener(onContextMenuClick);

// context menu control:

var lnkmenuid = "openinsquares";
var frmmenuid = "openinsquaresfrm";
function ignoreErr() { var _ = chrome.runtime.lastError; }
function menuOnOff(show) {
    if (show) {
        chrome.contextMenus.create({
            id: lnkmenuid,
            title: "Open link in squares.io",
            contexts: ["link"],
        }, ignoreErr);
        chrome.contextMenus.create({
            id: frmmenuid,
            title: "Open this puzzle in squares.io",
            contexts: ["frame"],
            documentUrlPatterns: ["*://*.amuselabs.com/*"],
        }, ignoreErr);
    } else {
        chrome.contextMenus.remove(lnkmenuid, ignoreErr);
        chrome.contextMenus.remove(frmmenuid, ignoreErr);
    }
}
chrome.storage.sync.get({'ctxmenu': true}, function(items) {
    menuOnOff(items.ctxmenu);
});
chrome.storage.sync.onChanged.addListener(function(changes) {
    if (changes.ctxmenu) {
        menuOnOff(changes.ctxmenu.newValue);
    }
});
