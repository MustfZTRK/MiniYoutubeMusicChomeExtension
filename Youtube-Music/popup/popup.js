/* ========================================
   Mini Youtube Music - Popup Script
   ======================================== */

class YTMPopup {
  constructor() {
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = 0; // 0: off, 1: all, 2: one
    this.volume = 0.7;
    this.isMuted = false;
    this.currentProgress = 0;
    this.currentLyrics = [];
    this.activeLyricsIndex = -1;
    this.selectedSleepMinutes = null;
    this.ytmTabId = null;

    this.init();
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.loadTheme();
    await this.connectToYTM();
    this.startProgressUpdate();
  }

  cacheElements() {
    // Buttons
    this.playBtn = document.getElementById('playBtn');
    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.shuffleBtn = document.getElementById('shuffleBtn');
    this.repeatBtn = document.getElementById('repeatBtn');
    this.muteBtn = document.getElementById('muteBtn');
    this.likeBtn = document.getElementById('likeBtn');
    this.dislikeBtn = document.getElementById('dislikeBtn');
    this.lyricsBtn = document.getElementById('lyricsBtn');
    this.queueBtn = document.getElementById('queueBtn');
    this.sleepBtn = document.getElementById('sleepBtn');
    this.themeToggle = document.getElementById('themeToggle');
    this.settingsBtn = document.getElementById('settingsBtn');

    // Icons
    this.playIcon = document.getElementById('playIcon');
    this.pauseIcon = document.getElementById('pauseIcon');
    this.volumeIcon = document.getElementById('volumeIcon');

    // Progress
    this.progressBar = document.getElementById('progressBar');
    this.progressFill = document.getElementById('progressFill');
    this.progressThumb = document.getElementById('progressThumb');
    this.currentTimeEl = document.getElementById('currentTime');
    this.totalTimeEl = document.getElementById('totalTime');

    // Volume
    this.volumeBar = document.getElementById('volumeBar');
    this.volumeFill = document.getElementById('volumeFill');
    this.volumeThumb = document.getElementById('volumeThumb');

    // Song Info
    this.albumArt = document.getElementById('albumArt');
    this.songTitle = document.getElementById('songTitle');
    this.songArtist = document.getElementById('songArtist');
    this.songAlbum = document.getElementById('songAlbum');

    // Views
    this.mainView = document.getElementById('mainView');
    this.lyricsView = document.getElementById('lyricsView');
    this.queueView = document.getElementById('queueView');
    this.lyricsContent = document.getElementById('lyricsContent');
    this.queueList = document.getElementById('queueList');

    // Modal
    this.sleepModal = document.getElementById('sleepModal');

    // Status
    this.statusDot = document.getElementById('statusDot');
    this.statusText = document.getElementById('statusText');
  }

  bindEvents() {
    // Playback Controls
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.prevBtn.addEventListener('click', () => this.sendCommand('previous'));
    this.nextBtn.addEventListener('click', () => this.sendCommand('next'));
    this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    this.repeatBtn.addEventListener('click', () => this.toggleRepeat());

    // Volume
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.volumeBar.addEventListener('click', (e) => this.seekVolume(e));

    // Progress Bar
    this.progressBar.addEventListener('click', (e) => this.seekProgress(e));

    // Action Buttons
    this.likeBtn.addEventListener('click', () => this.sendCommand('like'));
    this.dislikeBtn.addEventListener('click', () => this.sendCommand('dislike'));
    this.lyricsBtn.addEventListener('click', () => this.showLyrics());
    this.queueBtn.addEventListener('click', () => this.showQueue());
    this.sleepBtn.addEventListener('click', () => this.showSleepModal());

    // Back Buttons
    document.getElementById('lyricsBackBtn').addEventListener('click', () => this.hideViews());
    document.getElementById('queueBackBtn').addEventListener('click', () => this.hideViews());

    // Theme Toggle
    this.themeToggle.addEventListener('click', () => this.toggleTheme());

    // Settings
    this.settingsBtn.addEventListener('click', () => this.openSettings());

    // Sleep Modal
    document.querySelectorAll('.modal-option').forEach(btn => {
      btn.addEventListener('click', (e) => this.selectSleepOption(e));
    });
    document.getElementById('sleepCancel').addEventListener('click', () => this.hideSleepModal());
    document.getElementById('sleepStart').addEventListener('click', () => this.startSleepTimer());

    // Progress Bar Drag
    this.progressBar.addEventListener('mousedown', (e) => this.startProgressDrag(e));

    // Volume Bar Drag
    this.volumeBar.addEventListener('mousedown', (e) => this.startVolumeDrag(e));

    // Listen for messages from content script (via service worker relay)
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'YTM_STATE_UPDATE' && msg._fromServiceWorker) {
        console.log('[Mini Youtube Music Popup] State received:', msg.data);
        this.updatePlayerState(msg.data);
      }
    });

    // Re-request state when popup opens
    setTimeout(() => this.connectToYTM(), 200);
  }

  // ========================================
  // Theme Management
  // ========================================

  async loadTheme() {
    const result = await chrome.storage.sync.get(['theme']);
    const theme = result.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }

  async toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    await chrome.storage.sync.set({ theme: next });
  }

  // ========================================
  // YouTube Music Connection
  // ========================================

  async connectToYTM() {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
      console.log('[Mini Youtube Music Popup] Found YTM tabs:', tabs.length);
      if (tabs.length > 0) {
        this.ytmTabId = tabs[0].id;
        this.updateStatus(true);
        this.requestState();
      } else {
        this.updateStatus(false);
      }
    } catch (err) {
      console.error('[Mini Youtube Music Popup] Connection error:', err);
      this.updateStatus(false);
    }
  }

  updateStatus(connected) {
    this.statusDot.classList.toggle('connected', connected);
    this.statusText.textContent = connected
      ? 'YouTube Music bağlı'
      : 'YouTube Music bağlı değil';
  }

  async requestState() {
    if (!this.ytmTabId) return;
    try {
      console.log('[Mini Youtube Music Popup] Requesting state from tab:', this.ytmTabId);
      await chrome.tabs.sendMessage(this.ytmTabId, { type: 'GET_STATE' });
    } catch (err) {
      console.error('[Mini Youtube Music Popup] State request failed:', err.message);
      // Tab might have refreshed, try reconnecting
      this.updateStatus(false);
    }
  }

  // ========================================
  // Player Controls
  // ========================================

  async sendCommand(command) {
    if (!this.ytmTabId) return;
    try {
      await chrome.tabs.sendMessage(this.ytmTabId, { type: 'COMMAND', command });
    } catch (err) {
      console.error('Command error:', err);
    }
  }

  togglePlay() {
    this.sendCommand('playPause');
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    this.shuffleBtn.classList.toggle('active', this.isShuffle);
    this.sendCommand('shuffle');
  }

  toggleRepeat() {
    this.repeatMode = (this.repeatMode + 1) % 3;
    this.repeatBtn.classList.toggle('active', this.repeatMode > 0);
    if (this.repeatMode === 2) {
      this.repeatBtn.querySelector('.icon').style.opacity = '0.6';
    } else {
      this.repeatBtn.querySelector('.icon').style.opacity = '1';
    }
    this.sendCommand('repeat');
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.updateVolumeIcon();
    this.sendCommand('mute');
  }

  updateVolumeIcon() {
    if (this.isMuted || this.volume === 0) {
      this.volumeIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (this.volume < 0.5) {
      this.volumeIcon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
    } else {
      this.volumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
  }

  // ========================================
  // Progress & Volume Seeking
  // ========================================

  seekProgress(e) {
    const rect = this.progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    this.sendCommand({ type: 'seek', percent: Math.max(0, Math.min(1, percent)) });
  }

  seekVolume(e) {
    const rect = this.volumeBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    this.volume = Math.max(0, Math.min(1, percent));
    this.isMuted = false;
    this.updateVolumeUI();
    this.updateVolumeIcon();
    this.sendCommand({ type: 'setVolume', volume: this.volume });
  }

  startProgressDrag(e) {
    e.preventDefault();
    const onMove = (ev) => this.seekProgress(ev);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  startVolumeDrag(e) {
    e.preventDefault();
    const onMove = (ev) => this.seekVolume(ev);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  updateVolumeUI() {
    const percent = this.volume * 100;
    this.volumeFill.style.width = `${percent}%`;
    this.volumeThumb.style.left = `${percent}%`;
  }

  // ========================================
  // Player State Update
  // ========================================

  updatePlayerState(data) {
    // Song info
    if (data.title) this.songTitle.textContent = data.title;
    if (data.artist) this.songArtist.textContent = data.artist;
    if (data.album) this.songAlbum.textContent = data.album;
    if (data.albumArt) this.albumArt.src = data.albumArt;

    // Play state
    if (data.isPlaying !== undefined) {
      this.isPlaying = data.isPlaying;
      this.playIcon.classList.toggle('hidden', this.isPlaying);
      this.pauseIcon.classList.toggle('hidden', !this.isPlaying);
    }

    // Progress
    if (data.currentTime !== undefined && data.duration) {
      this.currentTimeEl.textContent = this.formatTime(data.currentTime);
      this.totalTimeEl.textContent = this.formatTime(data.duration);
      const percent = (data.currentTime / data.duration) * 100;
      this.progressFill.style.width = `${percent}%`;
      this.progressThumb.style.left = `${percent}%`;
      this.currentProgress = data.currentTime;
    }

    // Volume
    if (data.volume !== undefined) {
      this.volume = data.volume;
      this.updateVolumeUI();
      this.updateVolumeIcon();
    }

    // Shuffle & Repeat
    if (data.shuffle !== undefined) {
      this.isShuffle = data.shuffle;
      this.shuffleBtn.classList.toggle('active', this.isShuffle);
    }
    if (data.repeat !== undefined) {
      this.repeatMode = data.repeat;
      this.repeatBtn.classList.toggle('active', this.repeatMode > 0);
    }

    // Like state
    if (data.isLiked !== undefined) {
      this.likeBtn.classList.toggle('active', data.isLiked);
    }
    if (data.isDisliked !== undefined) {
      this.dislikeBtn.classList.toggle('active', data.isDisliked);
    }

    // Queue
    if (data.queue) {
      this.renderQueue(data.queue);
    }

    // Lyrics
    if (data.lyrics) {
      this.currentLyrics = data.lyrics;
      this.renderLyrics();
    }
  }

  // ========================================
  // Lyrics
  // ========================================

  showLyrics() {
    this.mainView.classList.add('hidden');
    this.lyricsView.classList.remove('hidden');
    this.fetchLyrics();
  }

  async fetchLyrics() {
    this.lyricsContent.innerHTML = '<p class="lyrics-loading">Şarkı sözleri yükleniyor...</p>';
    this.sendCommand('getLyrics');
  }

  renderLyrics() {
    if (!this.currentLyrics.length) {
      this.lyricsContent.innerHTML = '<p class="lyrics-loading">Şarkı sözleri bulunamadı</p>';
      return;
    }

    this.lyricsContent.innerHTML = this.currentLyrics
      .map((line, i) => `<div class="lyrics-line" data-index="${i}">${line.text || '...'}</div>`)
      .join('');

    this.updateActiveLyric();
  }

  updateActiveLyric() {
    if (!this.currentLyrics.length) return;

    const lines = this.lyricsContent.querySelectorAll('.lyrics-line');
    lines.forEach((line, i) => {
      line.classList.remove('active', 'past');
      if (i === this.activeLyricsIndex) {
        line.classList.add('active');
        line.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (i < this.activeLyricsIndex) {
        line.classList.add('past');
      }
    });
  }

  // ========================================
  // Queue
  // ========================================

  showQueue() {
    this.mainView.classList.add('hidden');
    this.queueView.classList.remove('hidden');
    this.sendCommand('getQueue');
  }

  renderQueue(queue) {
    if (!queue || !queue.length) {
      this.queueList.innerHTML = '<p class="lyrics-loading">Kuyruk boş</p>';
      return;
    }

    this.queueList.innerHTML = queue
      .map(
        (item, i) => `
      <div class="queue-item ${item.active ? 'active' : ''}" data-index="${i}">
        <img class="queue-item-art" src="${item.art || ''}" alt="">
        <div class="queue-item-info">
          <div class="queue-item-title">${item.title || 'Bilinmeyen Şarkı'}</div>
          <div class="queue-item-artist">${item.artist || ''}</div>
        </div>
        <span class="queue-item-duration">${item.duration || ''}</span>
      </div>
    `
      )
      .join('');

    // Click to play
    this.queueList.querySelectorAll('.queue-item').forEach((el) => {
      el.addEventListener('click', () => {
        const index = parseInt(el.dataset.index);
        this.sendCommand({ type: 'playFromQueue', index });
      });
    });
  }

  hideViews() {
    this.lyricsView.classList.add('hidden');
    this.queueView.classList.add('hidden');
    this.mainView.classList.remove('hidden');
  }

  // ========================================
  // Sleep Timer
  // ========================================

  showSleepModal() {
    this.sleepModal.classList.remove('hidden');
  }

  hideSleepModal() {
    this.sleepModal.classList.add('hidden');
    this.selectedSleepMinutes = null;
    document.querySelectorAll('.modal-option').forEach((btn) => {
      btn.classList.remove('selected');
    });
  }

  selectSleepOption(e) {
    document.querySelectorAll('.modal-option').forEach((btn) => {
      btn.classList.remove('selected');
    });
    e.target.classList.add('selected');
    this.selectedSleepMinutes = parseInt(e.target.dataset.minutes);
  }

  async startSleepTimer() {
    if (this.selectedSleepMinutes === null) return;
    await chrome.runtime.sendMessage({
      type: 'START_SLEEP_TIMER',
      minutes: this.selectedSleepMinutes,
    });
    this.hideSleepModal();
  }

  // ========================================
  // Settings
  // ========================================

  openSettings() {
    chrome.runtime.openOptionsPage();
  }

  // ========================================
  // Utilities
  // ========================================

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  startProgressUpdate() {
    // Auto-refresh state every 2 seconds
    setInterval(() => {
      if (this.ytmTabId) {
        this.requestState();
      }
    }, 2000);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new YTMPopup();
});
