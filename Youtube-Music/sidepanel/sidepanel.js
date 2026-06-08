(function () {
  'use strict';

  let isDraggingVol = false;
  let volCooldown = false;
  let plOpen = false;

  function sendCmd(cmd) {
    chrome.storage.local.get({ ytm_commands: [] }, (res) => {
      const list = res.ytm_commands;
      list.push({ cmd: cmd, ts: Date.now() });
      chrome.storage.local.set({ ytm_commands: list.slice(-20) });
    });
  }

  const cPrev = document.getElementById('cPrev');
  const cNext = document.getElementById('cNext');
  const cPlay = document.getElementById('cPlay');
  const cLike = document.getElementById('cLike');
  const cQueue = document.getElementById('cQueue');
  if (cPrev) cPrev.onclick = () => sendCmd('previous');
  if (cNext) cNext.onclick = () => sendCmd('next');
  if (cPlay) cPlay.onclick = () => sendCmd('playPause');
  if (cLike) cLike.onclick = () => sendCmd('like');
  if (cQueue) cQueue.onclick = () => sendCmd('addToQueue');

  // Ses paneli aç/kapa
  const volBtn = document.getElementById('cVolBtn');
  const volPanel = document.getElementById('volPanel');

  volBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    volPanel.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!volPanel.contains(e.target) && e.target !== volBtn) {
      volPanel.classList.remove('open');
    }
  });

  // ==========================================
  // Playlist popup
  // ==========================================
  const plOverlay = document.getElementById('plOverlay');
  const plList = document.getElementById('plList');
  const plLoading = document.getElementById('plLoading');
  const plClose = document.getElementById('plClose');

  document.getElementById('cSave').onclick = () => {
    if (plOpen) return;
    plOpen = true;
    plList.innerHTML = '';
    plList.appendChild(plLoading);
    plLoading.style.display = '';
    plOverlay.classList.add('open');
    sendCmd({ type: 'fetchPlaylists' });

    // Backup: poll storage for playlist data
    let pollCount = 0;
    const poll = setInterval(() => {
      pollCount++;
      if (!plOpen || pollCount > 30) { clearInterval(poll); return; }
      chrome.storage.local.get(['ytm_playlists', 'ytm_playlists_ts'], (res) => {
        const pls = res.ytm_playlists || [];
        if (pls.length > 0 && plOpen && plLoading.parentNode) {
          clearInterval(poll);
          renderPlaylists(pls);
        }
      });
    }, 1000);

    // 30 saniyede kapanmazsa kapat
    setTimeout(() => {
      clearInterval(poll);
      if (plOpen && plLoading.parentNode) {
        renderPlaylists([]);
      }
    }, 30000);
  };

  plClose.addEventListener('click', closePlPopup);
  plOverlay.addEventListener('click', (e) => {
    if (e.target === plOverlay) closePlPopup();
  });

  function closePlPopup() {
    plOverlay.classList.remove('open');
    plOpen = false;
  }

  // Playlist verisi geldiğinde
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.ytm_playlists) {
      const playlists = changes.ytm_playlists.newValue || [];
      renderPlaylists(playlists);
    }

    if (changes.ytm_state) {
      updateUI(changes.ytm_state.newValue);
    }
  });

  function renderPlaylists(playlists) {
    plList.innerHTML = '';

    if (playlists.length === 0) {
      chrome.storage.local.get(['ytm_debug'], (res) => {
        const dbg = res.ytm_debug || 'Bilgi yok';
        plList.innerHTML = `
          <div class="pl-loading">
            <svg viewBox="0 0 24 24" style="width:32px;height:32px;fill:#555;margin-bottom:8px">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <div>Şarkı listesi bulunamadı</div>
            <div style="font-size:10px;color:#666;margin-top:8px;word-break:break-all;padding:0 8px">${escHtml(dbg)}</div>
          </div>`;
      });
      return;
    }

    playlists.forEach((pl) => {
      const item = document.createElement('div');
      item.className = 'pl-item';
      item.innerHTML = `
        <div class="pl-item-icon">
          <svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
        </div>
        <span class="pl-item-title">${escHtml(pl.title)}</span>
        <div class="pl-item-check${pl.isChecked ? ' checked' : ''}">
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
      `;
      item.addEventListener('click', () => {
        sendCmd({ type: 'saveToPlaylistById', playlistId: pl.id });
        // Show saving status instead of closing
        item.style.opacity = '0.5';
        item.querySelector('.pl-item-title').textContent = pl.title + ' - kaydediliyor...';
        // Check debug after a few seconds
        setTimeout(() => {
          chrome.storage.local.get(['ytm_debug'], (res) => {
            const dbg = res.ytm_debug || '';
            item.style.opacity = '1';
            if (dbg.includes('kaydedildi')) {
              item.querySelector('.pl-item-title').textContent = pl.title + ' - kaydedildi!';
              item.style.color = '#4caf50';
            } else {
              item.querySelector('.pl-item-title').textContent = pl.title + ' - hata: ' + dbg.substring(dbg.lastIndexOf('→') + 1).trim();
              item.style.color = '#f44336';
            }
          });
        }, 5000);
      });
      plList.appendChild(item);
    });
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ==========================================
  // Ses slider
  // ==========================================
  const volWrap = document.getElementById('cVolWrap');
  const volThumb = document.getElementById('cVolThumb');
  const volFill = document.getElementById('cVolFill');
  const volLabel = document.getElementById('cVolLabel');
  let currentVal = 50;

  function setVisual(val) {
    const pct = val / 100;
    const h = volWrap.offsetHeight - 12;
    volThumb.style.bottom = (pct * h) + 'px';
    volFill.style.height = (pct * 100) + '%';
  }

  function valFromY(clientY) {
    const rect = volWrap.getBoundingClientRect();
    const h = rect.height - 12;
    let pct = 1 - (clientY - rect.top - 6) / h;
    pct = Math.max(0, Math.min(1, pct));
    return Math.round(pct * 100);
  }

  volThumb.addEventListener('mousedown', startDrag);
  volThumb.addEventListener('touchstart', startDrag, { passive: false });

  function startDrag(e) {
    e.preventDefault();
    isDraggingVol = true;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
  }

  function onDrag(e) {
    if (!isDraggingVol) return;
    e.preventDefault();
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const v = valFromY(y);
    currentVal = v;
    volLabel.textContent = v;
    setVisual(v);
    updateVolIcon(v / 100);
  }

  function endDrag() {
    if (!isDraggingVol) return;
    isDraggingVol = false;
    volCooldown = true;
    sendCmd({ type: 'setVolume', volume: currentVal / 100 });
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchend', endDrag);
    setTimeout(() => { volCooldown = false; }, 800);
  }

  volWrap.addEventListener('click', (e) => {
    if (e.target === volThumb) return;
    const v = valFromY(e.clientY);
    currentVal = v;
    volLabel.textContent = v;
    setVisual(v);
    updateVolIcon(v / 100);
    volCooldown = true;
    sendCmd({ type: 'setVolume', volume: v / 100 });
    setTimeout(() => { volCooldown = false; }, 800);
  });

  document.getElementById('cMute').onclick = () => sendCmd('mute');

  // ==========================================
  // UI güncelle
  // ==========================================
  function updateUI(data) {
    if (!data) return;

    if (data.title) {
      const el = document.getElementById('cTitle');
      if (el) el.textContent = data.title;
    }
    const art = document.getElementById('cArtist');
    if (art) art.textContent = data.artist || '';
    const img = document.getElementById('cArt');
    if (img && data.albumArt && img.getAttribute('data-src') !== data.albumArt) {
      img.setAttribute('data-src', data.albumArt);
      img.src = data.albumArt;
    }

    const playIco = document.getElementById('cPlayIco');
    const pauseIco = document.getElementById('cPauseIco');
    if (playIco && pauseIco && data.isPlaying !== undefined) {
      playIco.classList.toggle('hidden', data.isPlaying);
      pauseIco.classList.toggle('hidden', !data.isPlaying);
    }

    const like = document.getElementById('cLike');
    if (like && data.isLiked !== undefined) {
      like.classList.toggle('liked', data.isLiked);
    }

    if (data.volume !== undefined && !isDraggingVol && !volCooldown) {
      const v = Math.round(data.volume * 100);
      if (v !== currentVal) {
        currentVal = v;
        volLabel.textContent = v;
        setVisual(v);
        updateVolIcon(data.volume);
      }
    }
  }

  function updateVolIcon(vol) {
    const ico = document.getElementById('cVolIco');
    const btnIco = document.getElementById('cVolBtnIco');
    let path;
    if (vol === 0) {
      path = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (vol < 50) {
      path = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
    } else {
      path = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
    if (ico) ico.innerHTML = path;
    if (btnIco) btnIco.innerHTML = path;
  }

  function poll() {
    chrome.storage.local.get(['ytm_state'], (res) => {
      if (res.ytm_state) updateUI(res.ytm_state);
    });
  }

  // Also update from onChanged (backup)
  poll();
  setInterval(poll, 1000);
})();
