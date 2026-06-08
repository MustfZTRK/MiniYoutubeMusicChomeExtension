# 🎵 Mini Youtube Music

YouTube Music'i Chrome tarayıcınızın side panel'inde çalıştırın. Ayrı bir sekme açmaya gerek yok!

---

## 🇹🇷 Türkçe

### Özellikler

- 🎧 YouTube Music'i side panel'de çalıştır
- ⏯️ Oynat/Duraklat, Önceki, Sonraki kontrolleri
- 🔊 Dikey ses slider'ı (mute butonu dahil)
- ❤️ Beğen butonu
- ➕ Şarkı listesine kaydet
- 📋 Kuyruğa ekle

### Kurulum

1. Bu repoyu indirin veya `git clone` ile klonlayın:
   ```bash
   git clone https://github.com/MustfZTRK/MiniYoutubeMusicChomeExtension.git
   ```

2. Chrome'da `chrome://extensions` adresine gidin

3. Sağ üstteki **Geliştirici modu**'nu etkinleştirin

4. **Yüklenmemiş uzantıları yükle** butonuna tıklayın

5. Klonladığınız klasörü seçin

6. Extension yüklenmeye hazır! Side panel'i açmak için extension simgesine tıklayın

### Kullanım

- Extension simgesine tıklayın → Side panel açılır
- YouTube Music otomatik olarak iframe içinde yüklenir
- Alt kısımdaki kontrollerle müziği yönetin
- 🔊 butonuna tıklayarak dikey ses slider'ını açın

### Ekran Görüntüleri
<a href="https://ibb.co/mF8wF51S"><img src="https://i.ibb.co/vvYGv4gD/Ekran-g-r-nt-s-2026-06-08-113556.png" alt="Ekran görüntüsü 2026 06 08 113556" border="0"></a>

## 🇬🇧 English

### Features

- 🎧 Run YouTube Music in the side panel
- ⏯️ Play/Pause, Previous, Next controls
- 🔊 Vertical volume slider (with mute button)
- ❤️ Like button
- ➕ Save to playlist
- 📋 Add to queue

### Installation

1. Download this repo or clone it:
   ```bash
   git clone https://github.com/MustfZTRK/MiniYoutubeMusicChomeExtension.git
   ```

2. Go to `chrome://extensions` in Chrome

3. Enable **Developer mode** in the top right

4. Click **Load unpacked**

5. Select the cloned folder

6. The extension is ready! Click the extension icon to open the side panel

### Usage

- Click the extension icon → Side panel opens
- YouTube Music loads automatically inside an iframe
- Use the bottom controls to manage playback
- Click the 🔊 button to open the vertical volume slider

### Screenshots

<a href="https://ibb.co/mF8wF51S"><img src="https://i.ibb.co/vvYGv4gD/Ekran-g-r-nt-s-2026-06-08-113556.png" alt="Ekran görüntüsü 2026 06 08 113556" border="0"></a>

## 🛠️ Tech Stack

- Chrome Extension Manifest V3
- Side Panel API
- declarativeNetRequest (iframe header bypass)
- Chrome Storage API (communication)
- Vanilla JavaScript

## 📁 Project Structure

```
mini-youtube-music/
├── manifest.json          # Extension configuration
├── rules.json             # Network request rules for iframe
├── background/
│   └── service-worker.js  # Background service worker
├── content/
│   └── content.js         # Content script (injected into YTM)
├── sidepanel/
│   ├── sidepanel.html     # Side panel UI
│   └── sidepanel.js       # Side panel logic
├── options/
│   ├── options.html       # Settings page
│   └── options.js         # Settings logic
├── popup/
│   ├── popup.html         # Popup UI
│   └── popup.js           # Popup logic
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── styles/
    └── global.css         # Global styles
```

## 📄 License

MIT License

---

**Made with ❤️ for YouTube Music lovers**
