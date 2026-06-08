/* ========================================
   Mini Youtube Music - Options Script
   ======================================== */

class YTMOptions {
  constructor() {
    this.elements = {
      themeSelect: document.getElementById('themeSelect'),
      pillBarToggle: document.getElementById('pillBarToggle'),
      defaultVolume: document.getElementById('defaultVolume'),
      lyricsSource: document.getElementById('lyricsSource'),
      autoScroll: document.getElementById('autoScroll'),
      notifications: document.getElementById('notifications'),
      saveBtn: document.getElementById('saveBtn'),
      savedMessage: document.getElementById('savedMessage'),
    };

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
    this.setupThemeDetection();
  }

  // ========================================
  // Load Settings
  // ========================================

  async loadSettings() {
    const result = await chrome.storage.sync.get([
      'theme',
      'showPillBar',
      'defaultVolume',
      'lyricsSource',
      'autoScroll',
      'showNotifications',
    ]);

    // Apply values
    this.elements.themeSelect.value = result.theme || 'dark';
    this.elements.pillBarToggle.checked = result.showPillBar !== false;
    this.elements.defaultVolume.value = String(result.defaultVolume || 0.75);
    this.elements.lyricsSource.value = result.lyricsSource || 'lrclib';
    this.elements.autoScroll.checked = result.autoScroll !== false;
    this.elements.notifications.checked = result.showNotifications !== false;

    // Apply theme to page
    this.applyTheme(result.theme || 'dark');
  }

  // ========================================
  // Save Settings
  // ========================================

  async saveSettings() {
    const settings = {
      theme: this.elements.themeSelect.value,
      showPillBar: this.elements.pillBarToggle.checked,
      defaultVolume: parseFloat(this.elements.defaultVolume.value),
      lyricsSource: this.elements.lyricsSource.value,
      autoScroll: this.elements.autoScroll.checked,
      showNotifications: this.elements.notifications.checked,
    };

    await chrome.storage.sync.set(settings);

    // Apply theme immediately
    this.applyTheme(settings.theme);

    // Show saved message
    this.showSavedMessage();
  }

  showSavedMessage() {
    this.elements.savedMessage.classList.add('show');
    setTimeout(() => {
      this.elements.savedMessage.classList.remove('show');
    }, 2000);
  }

  // ========================================
  // Theme
  // ========================================

  applyTheme(theme) {
    let effectiveTheme = theme;
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }

  setupThemeDetection() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (this.elements.themeSelect.value === 'system') {
        this.applyTheme('system');
      }
    });
  }

  // ========================================
  // Event Binding
  // ========================================

  bindEvents() {
    this.elements.saveBtn.addEventListener('click', () => this.saveSettings());

    // Live theme preview
    this.elements.themeSelect.addEventListener('change', (e) => {
      this.applyTheme(e.target.value);
    });
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new YTMOptions();
});
