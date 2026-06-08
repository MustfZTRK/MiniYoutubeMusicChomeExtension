(function () {
  if (window.__ytm_ext_hooked) return;
  window.__ytm_ext_hooked = true;

  window.addEventListener('__ytm_ext_req', function (e) {
    var detail = e.detail || {};
    var action = detail.action || '';

    if (action === 'getPageData') {
      var result = {};
      try {
        if (window.ytcfg && typeof window.ytcfg.get === 'function') {
          result.apiKey = window.ytcfg.get('INNERTUBE_API_KEY') || '';
          result.context = window.ytcfg.get('INNERTUBE_CONTEXT') || null;
          result.clientVersion = window.ytcfg.get('INNERTUBE_CLIENT_VERSION') || '';
        }
      } catch (ex) { result.error = ex.message; }
      window.dispatchEvent(new CustomEvent('__ytm_ext_res', { detail: result }));
    }

    if (action === 'fetchPlaylistsPage') {
      var url = detail.url || 'https://music.youtube.com/library/playlists';

      // Önce browse API'yi dene (sayfa bağlamında, cookie'ler otomatik)
      var apiKey = '';
      var context = null;
      try {
        if (window.ytcfg && typeof window.ytcfg.get === 'function') {
          apiKey = window.ytcfg.get('INNERTUBE_API_KEY') || '';
          context = window.ytcfg.get('INNERTUBE_CONTEXT') || null;
        }
      } catch (ex) {}

      if (apiKey && context) {
        // Doğrudan playlist endpoint'lerini dene
        var browseIds = ['FEmusic_library_playlists', 'FEmusic_playlists', 'VLplaylists'];
        var attemptIdx = 0;

        function tryNextBrowseId() {
          if (attemptIdx >= browseIds.length) {
            doHtmlFetch();
            return;
          }
          var bid = browseIds[attemptIdx];
          attemptIdx++;
          window.fetch('https://music.youtube.com/youtubei/v1/browse?key=' + apiKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context: context, browseId: bid }),
            credentials: 'include',
          }).then(function (resp) {
            if (!resp.ok) return tryNextBrowseId();
            return resp.json();
          }).then(function (data) {
            if (!data) return;
            // Boş mu kontrol et
            var str = JSON.stringify(data);
            if (str.length < 500) return tryNextBrowseId();
            window.dispatchEvent(new CustomEvent('__ytm_ext_res_playlists', { detail: { data: data, source: bid } }));
          }).catch(function () {
            tryNextBrowseId();
          });
        }

        tryNextBrowseId();
      } else {
        doHtmlFetch();
      }

      function doHtmlFetch() {
        window.fetch(url, { credentials: 'include' }).then(function (resp) {
          return resp.text();
        }).then(function (html) {
          var result = {};

          // Yöntem 1: var ytInitialData
          var idx = html.indexOf('var ytInitialData');
          if (idx !== -1) {
            var eqIdx = html.indexOf('=', idx);
            var jsonStart = html.indexOf('{', eqIdx);
            if (jsonStart !== -1) {
              var depth = 0, jsonEnd = -1;
              for (var i = jsonStart; i < html.length && i < jsonStart + 2000000; i++) {
                if (html[i] === '{') depth++;
                else if (html[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
              }
              if (jsonEnd !== -1) {
                try { result.data = JSON.parse(html.substring(jsonStart, jsonEnd + 1)); } catch (ex) {}
              }
            }
          }

          // Yöntem 2: window["ytInitialData"]
          if (!result.data) {
            idx = html.indexOf('window["ytInitialData"]');
            if (idx === -1) idx = html.indexOf("window['ytInitialData']");
            if (idx !== -1) {
              var eqIdx2 = html.indexOf('=', idx);
              var jsonStart2 = html.indexOf('{', eqIdx2);
              if (jsonStart2 !== -1) {
                var depth2 = 0, jsonEnd2 = -1;
                for (var j = jsonStart2; j < html.length && j < jsonStart2 + 2000000; j++) {
                  if (html[j] === '{') depth2++;
                  else if (html[j] === '}') { depth2--; if (depth2 === 0) { jsonEnd2 = j; break; } }
                }
                if (jsonEnd2 !== -1) {
                  try { result.data = JSON.parse(html.substring(jsonStart2, jsonEnd2 + 1)); } catch (ex) {}
                }
              }
            }
          }

          if (!result.data) {
            result.error = 'no data in html, len=' + html.length;
          }

          window.dispatchEvent(new CustomEvent('__ytm_ext_res_playlists', { detail: result }));
        }).catch(function (ex) {
          window.dispatchEvent(new CustomEvent('__ytm_ext_res_playlists', { detail: { error: ex.message } }));
        });
      }
    }
  });
})();
