(function () {
  'use strict';

  let isDraggingVol = false;
  let volCooldown = false;

  function sendCmd(cmd) {
    chrome.storage.local.get({ ytm_commands: [] }, (res) => {
      const list = res.ytm_commands;
      list.push({ cmd: cmd, ts: Date.now() });
      chrome.storage.local.set({ ytm_commands: list.slice(-20) });
    });
  }

  document.getElementById('cPrev').onclick = () => sendCmd('previous');
  document.getElementById('cNext').onclick = () => sendCmd('next');
  document.getElementById('cPlay').onclick = () => sendCmd('playPause');
  document.getElementById('cLike').onclick = () => sendCmd('like');
  document.getElementById('cSave').onclick = () => sendCmd('saveToPlaylist');
  document.getElementById('cQueue').onclick = () => sendCmd('addToQueue');
  document.getElementById('cMute').onclick = () => sendCmd('mute');

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

  // Dikey ses slider
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
    // 800ms boyunca storage'dan gelen ses değerlerini yoksay
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

  function updateUI(data) {
    if (!data) return;
    const $ = id => document.getElementById(id);

    if (data.title) $('cTitle').textContent = data.title;
    if (data.artist) $('cArtist').textContent = data.artist;
    if (data.albumArt) $('cArt').src = data.albumArt;

    if (data.isPlaying !== undefined) {
      $('cPlayIco').classList.toggle('hidden', data.isPlaying);
      $('cPauseIco').classList.toggle('hidden', !data.isPlaying);
    }

    if (data.isLiked !== undefined) {
      $('cLike').classList.toggle('liked', data.isLiked);
    }

    // Ses: sürükleme veya cooldown sırasında yoksay
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.ytm_state) {
      updateUI(changes.ytm_state.newValue);
    }
  });

  poll();
  setInterval(poll, 1000);
})();
