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
      case 'saveToPlaylist':
        clickSaveToPlaylist();
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

  function clickSaveToPlaylist() {
    const moreBtn = document.querySelector('ytmusic-player-bar button#button-shape-more') ||
                    document.querySelector('ytmusic-player-bar [aria-label="Daha fazla"]') ||
                    document.querySelector('ytmusic-player-bar [aria-label="More"]') ||
                    document.querySelector('ytmusic-player-bar [aria-label="Diğer"]') ||
                    document.querySelector('ytmusic-player-bar button[aria-label="Actions"]');
    if (moreBtn) {
      moreBtn.click();
      setTimeout(() => {
        const menuItems = document.querySelectorAll('tp-yt-paper-listbox ytmusic-menu-navigation-item-renderer, ytmusic-menu-navigation-item-renderer');
        for (const item of menuItems) {
          const text = item.textContent.toLowerCase();
          if (text.includes('kaydet') || text.includes('save') || text.includes('playlist') || text.includes('şarkı listesi')) {
            item.click();
            return;
          }
        }
        document.body.click();
      }, 500);
    }
  }

  function clickAddToQueue() {
    const moreBtn = document.querySelector('ytmusic-player-bar button#button-shape-more') ||
                    document.querySelector('ytmusic-player-bar [aria-label="Daha fazla"]') ||
                    document.querySelector('ytmusic-player-bar [aria-label="More"]') ||
                    document.querySelector('ytmusic-player-bar [aria-label="Diğer"]') ||
                    document.querySelector('ytmusic-player-bar button[aria-label="Actions"]');
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
