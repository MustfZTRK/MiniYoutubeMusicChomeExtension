(function () {
  'use strict';
  if (window.__YTM__) return;
  window.__YTM__ = true;

  let lastCmdTs = 0;
  let lastHash = '';

  function getVideo() { return document.querySelector('video'); }

  function waitForVideo(cb) {
    const check = () => {
      if (getVideo() && document.querySelector('ytmusic-player-bar')) cb();
      else setTimeout(check, 300);
    };
    check();
  }

  // ========================================
  // Video ID
  // ========================================
  function getVideoId() {
    // 1) URL'den
    try {
      const u = new URL(window.location.href);
      const v = u.searchParams.get('v');
      if (v) return v;
    } catch (e) {}

    // 2) Watch URL'den
    const links = document.querySelectorAll('a[href*="watch?v="]');
    for (const a of links) {
      const m = a.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }

    // 3) Video element src'ten
    const vid = getVideo();
    if (vid && vid.src) {
      const m = vid.src.match(/\/videoplayback\?.*?v=([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }

    // 4) Player bar song info link
    const bar = document.querySelector('ytmusic-player-bar');
    if (bar) {
      const songLink = bar.querySelector('a[href*="watch"]');
      if (songLink) {
        const m2 = songLink.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (m2) return m2[1];
      }
    }

    return null;
  }

  // ========================================
  // InnerTube API - sayfa bağlamından ytcfg çek (inject.js ile)
  // ========================================
  function getPageData() {
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(null); }
      }, 2000);

      function handler(e) {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          window.removeEventListener('__ytm_ext_res', handler);
          resolve(e.detail);
        }
      }
      window.addEventListener('__ytm_ext_res', handler);

      // inject.js dosyasını sayfaya enjekte et (dış dosya, inline değil)
      const existing = document.getElementById('__ytm_ext_inject__');
      if (!existing) {
        const s = document.createElement('script');
        s.id = '__ytm_ext_inject__';
        s.src = chrome.runtime.getURL('content/inject.js');
        (document.head || document.documentElement).appendChild(s);
        s.onload = () => {
          window.dispatchEvent(new CustomEvent('__ytm_ext_req'));
        };
        s.onerror = () => {
          clearTimeout(timeout);
          if (!resolved) { resolved = true; window.removeEventListener('__ytm_ext_res', handler); resolve(null); }
        };
      } else {
        window.dispatchEvent(new CustomEvent('__ytm_ext_req'));
      }
    });
  }

  let cachedPageData = null;

  async function ensurePageData() {
    if (cachedPageData && cachedPageData.apiKey) return cachedPageData;

    const pageData = await getPageData();
    if (pageData && pageData.apiKey) {
      cachedPageData = {
        apiKey: pageData.apiKey,
        context: pageData.context || null,
        clientVersion: pageData.clientVersion || '',
      };
    } else {
      // Fallback: HTML'den çek
      try {
        const resp = await fetch(location.href, { credentials: 'include' });
        const html = await resp.text();
        const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
        const apiKey = keyMatch ? keyMatch[1] : null;
        const cvMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
        const context = apiKey ? {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: cvMatch ? cvMatch[1] : '1.20240101.00.00',
            hl: 'tr', gl: 'TR',
          },
        } : null;
        cachedPageData = { apiKey, context, clientVersion: cvMatch ? cvMatch[1] : '' };
      } catch (e) {
        cachedPageData = { apiKey: null, context: null, clientVersion: '' };
      }
    }
    return cachedPageData;
  }

  function getApiKey() {
    return cachedPageData && cachedPageData.apiKey ? cachedPageData.apiKey : null;
  }

  function getContext() {
    return cachedPageData && cachedPageData.context ? cachedPageData.context : null;
  }

  let debugLog = [];
  function pushDebug(info) {
    debugLog.push(info);
    if (debugLog.length > 40) debugLog.shift();
    try { chrome.storage.local.set({ ytm_debug: debugLog.join(' → ') }); } catch (e) {}
  }

  async function apiPost(endpoint, body) {
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(null); }
      }, 5000);

      function handler(e) {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          window.removeEventListener('__ytm_ext_res', handler);
          const d = e.detail || {};
          if (d.error) { pushDebug('API ' + endpoint + ': ' + d.error); resolve(null); }
          else { resolve(d.data || null); }
        }
      }
      window.addEventListener('__ytm_ext_res', handler);
      window.dispatchEvent(new CustomEvent('__ytm_ext_req', {
        detail: { action: 'apiPost', endpoint, body },
      }));
    });
  }

  // Playlist listesini çek

  async function htmlFetchPlaylists() {
    // Sayfa HTML'inden ytInitialData veya ytcfg.playlistData çek
    try {
      const resp = await fetch('https://music.youtube.com/library/playlists', { credentials: 'include' });
      if (!resp.ok) { pushDebug('HTML HTTP ' + resp.status); return []; }
      const html = await resp.text();

      // Yöntem 1: var ytInitialData marker
      const marker = 'var ytInitialData';
      const idx = html.indexOf(marker);
      if (idx !== -1) {
        const jsonStart = html.indexOf('{', idx);
        if (jsonStart !== -1) {
          let depth = 0, jsonEnd = -1;
          for (let i = jsonStart; i < html.length && i < jsonStart + 500000; i++) {
            if (html[i] === '{') depth++;
            else if (html[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
          }
          if (jsonEnd !== -1) {
            try {
              const data = JSON.parse(html.substring(jsonStart, jsonEnd + 1));
              const playlists = [];
              findPlaylistsRecursive(data, playlists);
              if (playlists.length > 0) return playlists;
            } catch (e) { pushDebug('HTML JSON parse err'); }
          }
        }
      }

      // Yöntem 2: window["ytInitialData"]
      const marker2 = 'window["ytInitialData"]';
      const idx2 = html.indexOf(marker2);
      if (idx2 !== -1) {
        const eqSign = html.indexOf('=', idx2);
        const jsonStart = html.indexOf('{', eqSign);
        if (jsonStart !== -1) {
          let depth = 0, jsonEnd = -1;
          for (let i = jsonStart; i < html.length && i < jsonStart + 500000; i++) {
            if (html[i] === '{') depth++;
            else if (html[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
          }
          if (jsonEnd !== -1) {
            try {
              const data = JSON.parse(html.substring(jsonStart, jsonEnd + 1));
              const playlists = [];
              findPlaylistsRecursive(data, playlists);
              if (playlists.length > 0) return playlists;
            } catch (e) {}
          }
        }
      }

      // Yöntem 3: ytInitialData objesi HTML içinde
      const idx3 = html.indexOf('ytInitialData');
      if (idx3 !== -1) {
        pushDebug('HTML: ytInitialData bulundu ama parse edilemedi');
      } else {
        pushDebug('HTML: ytInitialData yok');
      }
      return [];
    } catch (e) {
      pushDebug('HTML: ' + e.message);
      return [];
    }
  }

  function findPlaylistsRecursive(obj, result) {
    if (!obj || typeof obj !== 'object' || result.length > 50) return;

    // musicResponsiveListItemRenderer (klasik format)
    if (obj.musicResponsiveListItemRenderer) {
      const r = obj.musicResponsiveListItemRenderer;
      let title = '';
      let plId = '';

      if (r.flexColumns) {
        for (const col of r.flexColumns) {
          const txt = col.musicResponsiveListItemFlexColumnRenderer;
          if (txt && txt.text && txt.text.runs) {
            title = txt.text.runs.map(x => x.text).join('');
            if (title) break;
          }
        }
      }

      if (r.playlistItemData && r.playlistItemData.playlistId) {
        plId = r.playlistItemData.playlistId;
      } else if (r.navigationEndpoint) {
        const nav = r.navigationEndpoint;
        if (nav.watchPlaylistEndpoint) plId = nav.watchPlaylistEndpoint.playlistId || '';
        if (nav.browseEndpoint) plId = nav.browseEndpoint.browseId || '';
      }

      if (title && plId) {
        result.push({ id: plId, title: title, isChecked: false });
      }
      return;
    }

    // musicTwoRowItemRenderer (browse grid format)
    if (obj.musicTwoRowItemRenderer) {
      const r = obj.musicTwoRowItemRenderer;
      let title = '';
      let plId = '';
      if (r.title && r.title.runs) title = r.title.runs.map(x => x.text).join('');
      if (r.navigationEndpoint && r.navigationEndpoint.watchPlaylistEndpoint) {
        plId = r.navigationEndpoint.watchPlaylistEndpoint.playlistId || '';
      } else if (r.navigationEndpoint && r.navigationEndpoint.browseEndpoint) {
        plId = r.navigationEndpoint.browseEndpoint.browseId || '';
      }
      if (title && plId) {
        result.push({ id: plId, title: title, isChecked: false });
      }
      return;
    }

    //usicShelfRenderer → contents → musicResponsiveListItemRenderer
    if (obj.musicShelfRenderer) {
      const shelf = obj.musicShelfRenderer;
      if (shelf.contents) {
        for (const item of shelf.contents) findPlaylistsRecursive(item, result);
      }
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) findPlaylistsRecursive(item, result);
    } else {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object') findPlaylistsRecursive(obj[key], result);
      }
    }
  }

  function parseAddToPlaylistResponse(data) {
    const playlists = [];
    try {
      // Yöntem 1: actions → addToPlaylistAddToOptionRenderer
      const actions = data.actions || [];
      for (const action of actions) {
        const renderer = action.addToPlaylistAddToOptionRenderer || action.playlistAddToOptionRenderer;
        if (!renderer) continue;
        const plId = renderer.playlistId || '';
        const title = renderer.title || renderer.playlistName || '';
        if (plId && title) playlists.push({ id: plId, title, isChecked: !!renderer.isSelected });
      }
      if (playlists.length > 0) return playlists;

      // Yöntem 2: contents → sectionListRenderer → items (traverse)
      findPlaylistsRecursive(data, playlists);
    } catch (e) {}
    return playlists;
  }

  // DOM fallback
  function domFallbackPlaylists() {
    const playlists = [];
    const entries = document.querySelectorAll('ytmusic-guide-entry-renderer');
    entries.forEach((entry) => {
      const titleEl = entry.querySelector('yt-formatted-string.title');
      const subtitleEl = entry.querySelector('yt-formatted-string.subtitle');
      const title = titleEl ? titleEl.textContent.trim() : '';
      const subtitle = subtitleEl ? subtitleEl.textContent.trim() : '';

      if (subtitle && subtitle.includes('Otomatik')) return;
      if (!title || title.length === 0) return;
      if (['Ana Sayfa', 'Keşfet', 'Kitaplık'].includes(title)) return;

      // Playlist ID'yi tp-yt-paper-item'in href'inden veya navigation endpoint'ten al
      let plId = '';
      const paperItem = entry.querySelector('tp-yt-paper-item');
      if (paperItem) {
        // href attribute
        const href = paperItem.getAttribute('href') || '';
        const match = href.match(/list=([^&]+)/);
        if (match) plId = match[1];
        // data-url attribute
        if (!plId) {
          const dataUrl = paperItem.getAttribute('data-url') || '';
          const match2 = dataUrl.match(/list=([^&]+)/);
          if (match2) plId = match2[1];
        }
        // Polymer data
        if (!plId && paperItem.__data) {
          const nav = paperItem.__data.navigationEndpoint || {};
          if (nav.watchPlaylistEndpoint) plId = nav.watchPlaylistEndpoint.playlistId || '';
          if (!plId && nav.browseEndpoint) plId = nav.browseEndpoint.browseId || '';
        }
        // entry自身のdata
        if (!plId && entry.__data) {
          const ep = entry.__data.navigationEndpoint || {};
          if (ep.watchPlaylistEndpoint) plId = ep.watchPlaylistEndpoint.playlistId || '';
          if (!plId && ep.browseEndpoint) plId = ep.browseEndpoint.browseId || '';
        }
      }

      if (title) {
        playlists.push({ id: plId || ('sidebar_' + title), title, isChecked: false });
      }
    });
    return playlists;
  }

  // YouTube Music'in kendi menüsünü açarak playlistleri çek
  function triggerNativeMenuAndScrape() {
    return new Promise((resolve) => {
      const bar = document.querySelector('ytmusic-player-bar');
      if (!bar) { pushDebug('bar yok'); resolve([]); return; }

      // Tüm butonları ve aria-label'leri logla
      const allBtns = bar.querySelectorAll('button, [role="button"]');
      const btnInfo = [];
      allBtns.forEach((b, i) => {
        const label = b.getAttribute('aria-label') || '';
        const id = b.id || '';
        const cls = b.getAttribute('class') ? b.getAttribute('class').substring(0, 30) : '';
        const tag = b.tagName;
        btnInfo.push(i + ':' + tag + '#' + id + '[' + label + '].' + cls);
      });
      pushDebug('btns(' + allBtns.length + '): ' + btnInfo.join(' | '));

      // Menü/more butonunu ara
      let moreBtn = null;
      for (const b of allBtns) {
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('more') || label.includes('daha fazla') || label.includes('menü') ||
            label.includes('diğer') || label.includes('actions') || label.includes(' fazla')) {
          moreBtn = b;
          break;
        }
      }

      // ID ile de dene
      if (!moreBtn) moreBtn = bar.querySelector('button#button-shape-more, button#button-shape button');
      if (!moreBtn) moreBtn = bar.querySelector('#button-shape-more');

      // Son çare: son 3 butondan biri
      if (!moreBtn && allBtns.length > 3) {
        moreBtn = allBtns[allBtns.length - 1];
        pushDebug('son buton deneniyor');
      }

      if (!moreBtn) { pushDebug('moreBtn hala yok'); resolve([]); return; }

      pushDebug('moreBtn bulundu: ' + (moreBtn.getAttribute('aria-label') || moreBtn.id));
      moreBtn.click();

      setTimeout(() => {
        // Tüm menü popup'larını ara
        const menuItems = document.querySelectorAll('tp-yt-paper-listbox ytmusic-menu-navigation-item-renderer, ytmusic-menu-navigation-item-renderer, tp-yt-paper-listbox [role="menuitem"]');
        pushDebug('menu items: ' + menuItems.length);

        const texts = [];
        menuItems.forEach((item) => {
          texts.push(item.textContent.trim().substring(0, 30));
        });
        if (texts.length > 0) pushDebug('menü metinleri: ' + texts.join(' | '));

        // "Oynatma listesine kaydet" butonunu bul ve tıkla
        let addBtn = null;
        let addBtnIdx = -1;
        for (let i = 0; i < menuItems.length; i++) {
          const text = menuItems[i].textContent.toLowerCase();
          if (text.includes('oynatma listesine kaydet') || text.includes('save to playlist') || text.includes('playliste kaydet')) {
            addBtn = menuItems[i];
            addBtnIdx = i;
            break;
          }
        }

        if (!addBtn) {
          pushDebug('ekle butonu yok');
          resolve([]);
          return;
        }

        pushDebug('tıklanıyor: ' + addBtn.textContent.trim().substring(0, 30));

        // Shadow DOM içindeki gerçek tıklanabilir elementi bul
        let clicked = false;
        if (addBtn.shadowRoot) {
          pushDebug('shadow var!');
          const inner = addBtn.shadowRoot.querySelector('a, button, [role="link"], [role="button"]');
          if (inner) {
            pushDebug('inner: ' + inner.tagName + ' href=' + (inner.href || ''));
            inner.click();
            clicked = true;
          }
        }
        // Yöntem 2: parent container'a tıkla
        if (!clicked) {
          const container = addBtn.closest('tp-yt-paper-listbox') || addBtn.parentElement;
          if (container && container.shadowRoot) {
            pushDebug('container shadow var');
          }
          // PointerEvent ile tıkla
          const rect = addBtn.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          pushDebug('coords: ' + x.toFixed(0) + ',' + y.toFixed(0) + ' size=' + rect.width.toFixed(0) + 'x' + rect.height.toFixed(0));

          // Element at point
          const target = document.elementFromPoint(x, y);
          if (target) {
            pushDebug('target: ' + target.tagName + '.' + (target.getAttribute('class') || '').substring(0, 30));
            target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
            target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
            clicked = true;
          }
          if (!clicked) {
            addBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
            addBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
            addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
            addBtn.click();
          }
        }

        pushDebug('tıklama tamamlandı');

        // Dialog'un açılıp açılmadığını izle
        let dialogOpened = false;
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1) {
                const tag = node.tagName ? node.tagName.toLowerCase() : '';
                if (tag.includes('dialog') || tag.includes('playlist') || tag.includes('add-to') || tag.includes('overlay') || tag.includes('popup')) {
                  pushDebug('yeni el: ' + tag + ' text=' + node.textContent.trim().substring(0, 50));
                  dialogOpened = true;
                }
                // children'da da kontrol et
                if (node.querySelectorAll) {
                  const els = node.querySelectorAll('*');
                  els.forEach(el => {
                    const t = el.tagName.toLowerCase();
                    if (t.includes('playlist') || t.includes('add-to')) {
                      pushDebug('yeni child el: ' + t);
                      dialogOpened = true;
                    }
                  });
                }
              }
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 5000);

        let attempts = 0;
        const checkDialog = setInterval(() => {
          attempts++;
          const playlists = [];

          const items = document.querySelectorAll('ytmusic-playlist-add-to-option-renderer');

          if (attempts <= 3) {
            pushDebug('items(' + attempts + '): ' + items.length);
            if (items.length > 0 && attempts === 1) {
              const first = items[0];
              pushDebug('first HTML: ' + first.outerHTML.substring(0, 500));
              pushDebug('first text: ' + first.textContent.trim());
              pushDebug('first shadow: ' + !!first.shadowRoot);
            }
          }

          if (items.length > 0) {
            items.forEach((item, i) => {
              let title = item.textContent.trim().replace(/\s+/g, ' ');
              if (title && title.length > 1 && title.length < 60 &&
                  !title.includes('Yeni playlist') && !title.includes('New playlist')) {
                // YouTube Music real playlist IDs aren't exposed in HTML attributes
                // We use synthetic pl_X IDs and match by title/index when saving
                playlists.push({ id: 'pl_' + i, title, isChecked: false, index: i });
              }
            });
            pushDebug('pl count: ' + playlists.length + ' → ' + playlists.map(p => p.title.substring(0,10)).join(', '));
          }

          if (playlists.length > 0 || attempts > 15) {
            clearInterval(checkDialog);
            pushDebug('Playlists: ' + playlists.length);
            resolve(playlists);
          }
        }, 500);
      }, 800);
    });
  }

  // Playlist'e kaydet (menu index ile)
  function saveToPlaylistByIndex(index) {
    const dialogItems = document.querySelectorAll('tp-yt-paper-listbox ytmusic-toggle-menu-option-renderer');
    if (dialogItems[index]) {
      dialogItems[index].click();
      return true;
    }
    return false;
  }

  // Playlist'e kaydet
  async function apiSaveToPlaylist(playlistId, videoId) {
    if (!videoId || !playlistId) return false;

    const data = await apiPost('playlist/add', {
      playlistId: playlistId,
      videoIds: [videoId],
    });
    return data !== null;
  }

  // ========================================
  // State → storage
  // ========================================
  function getState() {
    const v = getVideo();
    const bar = document.querySelector('ytmusic-player-bar');

    let title = '';
    for (const s of ['.title yt-formatted-string', '.title']) {
      const el = bar && bar.querySelector(s);
      if (el && el.textContent.trim()) { title = el.textContent.trim(); break; }
    }

    let artist = '';
    const secCols = bar ? bar.querySelectorAll('.secondary-flex-columns yt-formatted-string') : [];
    if (secCols.length > 0) artist = secCols[0].textContent.trim();

    let album = '';
    if (secCols.length > 1) album = secCols[secCols.length - 1].textContent.trim();

    let art = '';
    if (bar) {
      const img = bar.querySelector('img');
      if (img && img.src && !img.src.startsWith('data:')) art = img.src;
    }

    let isLiked = false;
    for (const s of [
      'like-button-view-model button[aria-pressed="true"]',
      'ytmusic-like-button-renderer #button-shape-like button[aria-pressed="true"]',
      'button[aria-label="Beğen"][aria-pressed="true"]',
      'button[aria-label="Like"][aria-pressed="true"]',
    ]) {
      if (bar && bar.querySelector(s)) { isLiked = true; break; }
    }

    return {
      title: title || 'Bilinmeyen Şarkı',
      artist, album, albumArt: art,
      isPlaying: v ? !v.paused : false,
      currentTime: v ? v.currentTime : 0,
      duration: v ? (v.duration || 0) : 0,
      volume: v ? v.volume : 0.7,
      isLiked,
      videoId: getVideoId() || '',
    };
  }

  function pushState() {
    const state = getState();
    const vInt = Math.round(state.volume * 100);
    const hash = state.title + '|' + state.artist + '|' + state.isPlaying + '|' + Math.floor(state.currentTime) + '|' + vInt + '|' + state.isLiked;
    if (hash === lastHash) return;
    lastHash = hash;
    try { chrome.storage.local.set({ ytm_state: state }); } catch (e) {}
  }

  function pullCommand() {
    try {
      chrome.storage.local.get({ ytm_commands: [] }, (res) => {
        const cmds = res.ytm_commands || [];
        const latest = cmds[cmds.length - 1];
        if (latest && latest.ts > lastCmdTs) {
          lastCmdTs = latest.ts;
          execCmd(latest.cmd);
        }
      });
    } catch (e) {}
  }

  function execCmd(c) {
    const v = getVideo();

    if (typeof c === 'object') {
      if (c.type === 'seek' && v && v.duration) v.currentTime = v.duration * c.percent;
      if (c.type === 'setVolume' && v) v.volume = c.volume;
      if (c.type === 'fetchPlaylists') { cmdFetchPlaylists(); return; }
      if (c.type === 'saveToPlaylistById') { cmdSaveToPlaylist(c.playlistId); return; }
      setTimeout(pushState, 100);
      return;
    }

    switch (c) {
      case 'playPause':
        if (v) v.paused ? v.play() : v.pause();
        break;
      case 'next':
        clickBtn('next');
        break;
      case 'previous':
        clickBtn('previous');
        break;
      case 'mute':
        if (v) v.muted = !v.muted;
        break;
      case 'like':
        clickLike();
        break;
      case 'addToQueue':
        clickAddToQueue();
        break;
    }
    setTimeout(pushState, 200);
  }

  function clickBtn(name) {
    const map = {
      next: ['#next-button', 'button[aria-label="Sonraki"]', 'button[aria-label="Next"]'],
      previous: ['#previous-button', 'button[aria-label="Önceki"]', 'button[aria-label="Previous"]'],
    };
    for (const s of (map[name] || [])) {
      const b = document.querySelector('ytmusic-player-bar ' + s) || document.querySelector(s);
      if (b) { b.click(); return; }
    }
  }

  function clickLike() {
    const selectors = [
      'like-button-view-model button',
      'ytmusic-like-button-renderer #button-shape-like button',
      'button[aria-label="Beğen"]',
      'button[aria-label="Like"]',
    ];
    for (const s of selectors) {
      const b = document.querySelector(s);
      if (b) { b.click(); return; }
    }
  }

  function clickAddToQueue() {
    const moreBtn = document.querySelector('ytmusic-player-bar button#button-shape-more') ||
                    document.querySelector('ytmusic-player-bar [aria-label="Daha fazla"]') ||
                    document.querySelector('ytmusic-player-bar [aria-label="More actions"]') ||
                    document.querySelector('ytmusic-player-bar [aria-label="More"]');
    if (moreBtn) {
      moreBtn.click();
      setTimeout(() => {
        const menuItems = document.querySelectorAll('tp-yt-paper-listbox ytmusic-menu-navigation-item-renderer, ytmusic-menu-navigation-item-renderer');
        for (const item of menuItems) {
          const text = item.textContent.toLowerCase();
          if (text.includes('kuyruk') || text.includes('queue') || text.includes('sıraya')) {
            item.click();
            return;
          }
        }
        document.body.click();
      }, 500);
    }
  }

  // ========================================
  // Playlist komutları
  // ========================================
  async function cmdFetchPlaylists() {
    debugLog = [];

    pushDebug('DOM deniyor...');
    const domPls = domFallbackPlaylists();
    pushDebug('DOM:' + domPls.length + ' pl');
    if (domPls.length > 0) { savePlaylists(domPls); return; }

    // Fallback: menü ile dene
    pushDebug('Menü açılıyor...');
    const menuPls = await triggerNativeMenuAndScrape();
    pushDebug('Menü:' + menuPls.length + ' pl');
    savePlaylists(menuPls);
  }

  function fetchPlaylistsPage() {
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; resolve({ error: 'timeout' }); }
      }, 10000);

      function handler(e) {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          window.removeEventListener('__ytm_ext_res_playlists', handler);
          resolve(e.detail || { error: 'empty event' });
        }
      }
      window.addEventListener('__ytm_ext_res_playlists', handler);

      const existing = document.getElementById('__ytm_ext_inject__');
      if (!existing) {
        const s = document.createElement('script');
        s.id = '__ytm_ext_inject__';
        s.src = chrome.runtime.getURL('content/inject.js');
        s.onload = () => {
          pushDebug('inject yüklendi, fetch isteği gönderiliyor');
          window.dispatchEvent(new CustomEvent('__ytm_ext_req', { detail: { action: 'fetchPlaylistsPage' } }));
        };
        s.onerror = (err) => {
          clearTimeout(timeout);
          if (!resolved) { resolved = true; window.removeEventListener('__ytm_ext_res_playlists', handler); resolve({ error: 'inject load failed' }); }
        };
        (document.head || document.documentElement).appendChild(s);
      } else {
        pushDebug('inject zaten var, fetch isteği gönderiliyor');
        window.dispatchEvent(new CustomEvent('__ytm_ext_req', { detail: { action: 'fetchPlaylistsPage' } }));
      }
    });
  }

  function savePlaylists(playlists) {
    try {
      chrome.storage.local.set({
        ytm_playlists: playlists || [],
        ytm_playlists_ts: Date.now(),
      });
    } catch (e) {}
  }

  function clickEl(el, x, y) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cx = x !== undefined ? x : r.left + r.width / 2;
    const cy = y !== undefined ? y : r.top + r.height / 2;
    const t = document.elementFromPoint(cx, cy) || el;
    ['pointerdown', 'pointerup', 'click'].forEach((type) => {
      t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: cy }));
    });
    return true;
  }

  async function cmdSaveToPlaylist(playlistId) {
    const videoId = getVideoId();
    if (!videoId || !playlistId) return;

    pushDebug('cmdSave: ' + playlistId);

    // Playlist title'ı storage'dan al
    let targetTitle = '';
    try {
      const res = await new Promise(r => chrome.storage.local.get({ ytm_playlists: [] }, r));
      const pls = res.ytm_playlists || [];
      const found = pls.find(p => p.id === playlistId);
      if (found) targetTitle = found.title;
    } catch(e) {}
    pushDebug('hedef: ' + targetTitle);

    // 1) "Oynatma listesine kaydet" dialog'unu aç
    const bar = document.querySelector('ytmusic-player-bar');
    if (!bar) { pushDebug('bar yok'); return; }

    // TriggerNativeMenuAndScrape ile aynı geniş arama
    const allBtns = bar.querySelectorAll('button, [role="button"]');
    let moreBtn = null;
    for (const b of allBtns) {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('more') || label.includes('daha fazla') || label.includes('menü') ||
          label.includes('diğer') || label.includes('actions') || label.includes(' fazla')) {
        moreBtn = b;
        break;
      }
    }
    if (!moreBtn) moreBtn = bar.querySelector('button#button-shape-more, button#button-shape button');
    if (!moreBtn) moreBtn = bar.querySelector('#button-shape-more');
    if (!moreBtn && allBtns.length > 3) moreBtn = allBtns[allBtns.length - 1];

    if (!moreBtn) { pushDebug('moreBtn yok, btns: ' + allBtns.length); return; }

    moreBtn.click();
    pushDebug('moreBtn tıklandı');

    // Menü items'ı bekle - tüm document'ta ara
    let saveBtn = null;
    for (let wait = 0; wait < 5; wait++) {
      await new Promise(r => setTimeout(r, 800));
      const menuItems = document.querySelectorAll('tp-yt-paper-listbox ytmusic-menu-navigation-item-renderer, ytmusic-menu-navigation-item-renderer, tp-yt-paper-listbox [role="menuitem"], ytmusic-menu-service-item-renderer');
      pushDebug('menu(' + wait + '): ' + menuItems.length);
      for (const item of menuItems) {
        const text = item.textContent.toLowerCase();
        if (text.includes('oynatma listesine kaydet') || text.includes('save to playlist') || text.includes('playliste kaydet')) {
          saveBtn = item;
          break;
        }
      }
      if (saveBtn) break;
    }

    if (!saveBtn) {
      pushDebug('kaydet menüsü yok');
      document.body.click();
      return;
    }

    clickEl(saveBtn);
    pushDebug('kaydet menüsü tıklandı');
    await new Promise(r => setTimeout(r, 1200));

    // 2) Dialog açıldı, playlist item'larını tıkla
    let attempts = 0;
    const checkDialog = setInterval(() => {
      attempts++;
      const dialogItems = document.querySelectorAll('ytmusic-playlist-add-to-option-renderer');
      pushDebug('dialog check(' + attempts + '): ' + dialogItems.length + ' items');

      if (dialogItems.length > 0 || attempts >= 15) {
        clearInterval(checkDialog);

        if (dialogItems.length === 0) {
          pushDebug('dialog açılmadı');
          document.body.click();
          setTimeout(pushState, 500);
          return;
        }

        let targetItem = null;

        // 1) Title eşleştirmesi
        if (targetTitle) {
          for (const item of dialogItems) {
            const titleEl = item.querySelector('yt-formatted-string#title');
            const itemTitle = titleEl ? titleEl.textContent.trim() : '';
            if (itemTitle && itemTitle.toLowerCase() === targetTitle.toLowerCase()) {
              targetItem = item;
              pushDebug('eşleşti: ' + itemTitle);
              break;
            }
          }
        }

        // 2) Index ile (pl_X format)
        if (!targetItem && playlistId.startsWith('pl_')) {
          const idx = parseInt(playlistId.replace('pl_', ''), 10);
          if (dialogItems[idx]) {
            targetItem = dialogItems[idx];
            pushDebug('index: pl_' + idx);
          }
        }

        // 3) İlk item (fallback - "Beğendiğim müzikler" genelde ilk sırada)
        if (!targetItem && dialogItems.length > 0) {
          targetItem = dialogItems[0];
          pushDebug('fallback ilk item');
        }

        if (targetItem) {
          const btn = targetItem.querySelector('button') || targetItem;
          clickEl(btn);
          pushDebug('kaydedildi!');
        } else {
          pushDebug('hedef yok');
          document.body.click();
        }
        setTimeout(pushState, 500);
      }
    }, 400);
  }

  // ========================================
  // Başlat
  // ========================================
  waitForVideo(() => {
    try {
      chrome.storage.local.get({ ytm_commands: [] }, (res) => {
        const cmds = res.ytm_commands || [];
        if (cmds.length > 0) lastCmdTs = cmds[cmds.length - 1].ts;
        pushState();
      });
    } catch (e) { pushState(); }

    const v = getVideo();
    ['play', 'pause', 'ended'].forEach(e => v.addEventListener(e, pushState));
    v.addEventListener('volumechange', () => { lastHash = ''; pushState(); });
    v.addEventListener('timeupdate', pushState);
    setInterval(() => { pushState(); pullCommand(); }, 1000);
  });
})();
