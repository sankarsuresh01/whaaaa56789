/* Hearth: random memories from a shared Google Drive folder, a "thinking of you" ember, and two clocks.
   Everything lives in your Drive. This page only holds the code. */
(function () {
'use strict';

var C = window.HEARTH_CONFIG || {};
var SCOPE = 'https://www.googleapis.com/auth/drive';
var API = 'https://www.googleapis.com/drive/v3';
var UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
var FILE_FIELDS = 'id,name,mimeType,description,createdTime,thumbnailLink,size,imageMediaMetadata(time),videoMediaMetadata(durationMillis),owners(me,displayName)';
var DEMO = /[?&]demo\b/.test(location.search);

/* ---------------- small helpers ---------------- */
function $(id) { return document.getElementById(id); }
var store = {
  get: function (k) { try { return JSON.parse(localStorage.getItem('hearth.' + k)); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem('hearth.' + k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem('hearth.' + k); } catch (e) {} }
};
function show(id) {
  ['screen-loading', 'screen-setup', 'screen-welcome', 'screen-error', 'screen-main'].forEach(function (s) { $(s).hidden = s !== id; });
}
var toastTimer;
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
}
function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
function configured() {
  return C.CLIENT_ID && C.FOLDER_ID && !/PASTE/.test(C.CLIENT_ID) && !/PASTE/.test(C.FOLDER_ID);
}

/* ---------------- sign-in (Google OAuth, redirect flow: works in home-screen apps) ---------------- */
function redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
function signIn(chooseAccount) {
  var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set('state', state);
  store.set('authAttempt', Date.now());
  var p = new URLSearchParams({
    client_id: C.CLIENT_ID, redirect_uri: redirectUri(), response_type: 'token',
    scope: SCOPE, include_granted_scopes: 'true', state: state
  });
  var hint = store.get('hint');
  if (chooseAccount) p.set('prompt', 'select_account');
  else if (hint) p.set('login_hint', hint);
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
}
function readRedirect() {
  var h = location.hash;
  if (h.indexOf('access_token=') < 0 && h.indexOf('error=') < 0) return null;
  var q = new URLSearchParams(h.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  var expected = store.get('state'); store.del('state');
  if (q.get('error')) return { error: q.get('error') };
  if (!expected || expected !== q.get('state')) return { error: 'state_mismatch' };
  var secs = parseInt(q.get('expires_in') || '3600', 10);
  store.set('token', { v: q.get('access_token'), exp: Date.now() + (secs - 120) * 1000 });
  store.set('signedIn', true);
  return { ok: true };
}
function token() { var t = store.get('token'); return t && t.exp > Date.now() ? t.v : null; }
function signOut() { store.del('token'); store.del('signedIn'); store.del('hint'); }

/* ---------------- Google Drive ---------------- */
function AuthError() { this.code = 'auth'; }
function api(path, opts) {
  opts = opts || {};
  var t = token();
  if (!t) return Promise.reject(new AuthError());
  var headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + t });
  return fetch(path.indexOf('http') === 0 ? path : API + path, { method: opts.method || 'GET', headers: headers, body: opts.body })
    .then(function (r) {
      if (r.status === 401) { store.del('token'); throw new AuthError(); }
      if (!r.ok) {
        return r.json().catch(function () { return null; }).then(function (j) {
          var e = (j && j.error) || {};
          var reason = (e.errors && e.errors[0] && e.errors[0].reason) || e.status || '';
          throw { code: 'http', status: r.status, reason: reason, message: e.message || '' };
        });
      }
      return opts.raw ? r : r.json();
    });
}
function q(s) { return encodeURIComponent(s); }

var drive = {
  thoughtsId: null,
  init: function () {
    return Promise.all([
      api('/about?fields=' + q('user(displayName,emailAddress)')),
      api('/files/' + C.FOLDER_ID + '?supportsAllDrives=true&fields=' + q('id,owners(me,displayName),capabilities(canAddChildren)'))
    ]).then(function (r) {
      var me = r[0].user || {}, folder = r[1];
      if (me.emailAddress) store.set('hint', me.emailAddress);
      var owner = folder.owners && folder.owners[0];
      return {
        myName: me.displayName || '',
        isOwner: !!(owner && owner.me),
        ownerName: owner ? owner.displayName : '',
        canAdd: !!(folder.capabilities && folder.capabilities.canAddChildren)
      };
    });
  },
  listMemories: function () {
    var out = [];
    var query = q("'" + C.FOLDER_ID + "' in parents and trashed=false and (mimeType contains 'image/' or mimeType contains 'video/')");
    function page(tok) {
      return api('/files?pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&q=' + query +
        '&fields=' + q('nextPageToken,files(' + FILE_FIELDS + ')') + (tok ? '&pageToken=' + q(tok) : ''))
        .then(function (j) { out = out.concat(j.files || []); return j.nextPageToken ? page(j.nextPageToken) : out; });
    }
    return page(null);
  },
  fetchBlob: function (f, onProgress) {
    return new Promise(function (res, rej) {
      var t = token(); if (!t) return rej(new AuthError());
      var x = new XMLHttpRequest();
      x.open('GET', API + '/files/' + f.id + '?alt=media&supportsAllDrives=true');
      x.setRequestHeader('Authorization', 'Bearer ' + t);
      x.responseType = 'blob';
      x.onprogress = function (e) { var total = e.lengthComputable ? e.total : +f.size; if (onProgress && total) onProgress(e.loaded / total); };
      x.onload = function () {
        if (x.status === 401) { store.del('token'); return rej(new AuthError()); }
        if (x.status >= 200 && x.status < 300) res(URL.createObjectURL(x.response)); else rej({ code: 'http', status: x.status });
      };
      x.onerror = function () { rej({ code: 'network' }); };
      x.send();
    });
  },
  thoughtsFolder: function () {
    var self = this;
    if (self.thoughtsId) return Promise.resolve(self.thoughtsId);
    var query = q("'" + C.FOLDER_ID + "' in parents and trashed=false and name='thoughts' and mimeType='application/vnd.google-apps.folder'");
    return api('/files?supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=createdTime&q=' + query + '&fields=' + q('files(id)'))
      .then(function (j) {
        if (j.files && j.files.length) return (self.thoughtsId = j.files[0].id);
        return api('/files?supportsAllDrives=true&fields=id', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'thoughts', mimeType: 'application/vnd.google-apps.folder', parents: [C.FOLDER_ID] })
        }).then(function (f) { return (self.thoughtsId = f.id); });
      });
  },
  listThoughts: function () {
    return this.thoughtsFolder().then(function (id) {
      return api('/files?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=60&orderBy=' + q('createdTime desc') +
        '&q=' + q("'" + id + "' in parents and trashed=false") + '&fields=' + q('files(id,createdTime,owners(me,displayName))'));
    }).then(function (j) { return j.files || []; });
  },
  sendThought: function () {
    return this.thoughtsFolder().then(function (id) {
      return api('/files?supportsAllDrives=true&fields=' + q('id,createdTime,owners(me,displayName)'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'thinking of you ' + new Date().toISOString(), mimeType: 'text/plain', parents: [id] })
      });
    });
  },
  upload: function (file, note, onProgress) {
    var t = token();
    if (!t) return Promise.reject(new AuthError());
    var meta = { name: file.name || ('memory ' + new Date().toISOString()), parents: [C.FOLDER_ID] };
    if (note) meta.description = note;
    var type = file.type || 'application/octet-stream';
    return fetch(UPLOAD + '?uploadType=resumable&supportsAllDrives=true&fields=' + q(FILE_FIELDS), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(file.size) },
      body: JSON.stringify(meta)
    }).then(function (r) {
      if (r.status === 401) { store.del('token'); throw new AuthError(); }
      if (!r.ok) throw { code: 'http', status: r.status };
      var loc = r.headers.get('Location');
      if (!loc) throw { code: 'no_session' };
      return new Promise(function (res, rej) {
        var x = new XMLHttpRequest();
        x.open('PUT', loc);
        x.setRequestHeader('Content-Type', type);
        x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
        x.onload = function () {
          if (x.status >= 200 && x.status < 300) { try { res(JSON.parse(x.responseText)); } catch (e) { res(null); } }
          else rej({ code: 'http', status: x.status });
        };
        x.onerror = function () { rej({ code: 'network' }); };
        x.send(file);
      });
    });
  }
};

/* ---------------- preview mode (sample data, no Google) ---------------- */
function sampleImage(a, b, label) {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">' +
    '<defs><radialGradient id="g" cx="40%" cy="35%" r="80%"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></radialGradient></defs>' +
    '<rect width="800" height="1000" fill="url(#g)"/>' +
    '<circle cx="560" cy="300" r="120" fill="#fff" opacity=".12"/><circle cx="250" cy="720" r="200" fill="#000" opacity=".12"/>' +
    '<text x="400" y="520" fill="#fff" fill-opacity=".85" font-family="Georgia,serif" font-size="46" text-anchor="middle">' + label + '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
var demo = {
  thoughts: [{ id: 't1', createdTime: new Date(Date.now() - 2.5 * 3600e3).toISOString(), owners: [{ me: false, displayName: 'Her' }] }],
  files: [
    { id: 'd1', mimeType: 'image/jpeg', description: 'The first photo you ever sent me. I still look at it.', imageMediaMetadata: { time: '2024:11:02 21:14:00' }, owners: [{ me: true }], _src: sampleImage('#e98b54', '#3d1a2e', 'sample photo 1') },
    { id: 'd2', mimeType: 'image/jpeg', description: 'Airport, finally. Neither of us could stop smiling.', imageMediaMetadata: { time: '2025:06:19 08:40:00' }, owners: [{ me: false, displayName: 'Her' }], _src: sampleImage('#6a8fd8', '#1b1d3f', 'sample photo 2') },
    { id: 'd3', mimeType: 'image/jpeg', description: '', createdTime: '2025-02-14T20:00:00Z', owners: [{ me: true }], _src: sampleImage('#d8b15e', '#4a2412', 'sample photo 3') },
    { id: 'd4', mimeType: 'image/jpeg', description: 'That call where we both fell asleep and woke up to the other one snoring.', imageMediaMetadata: { time: '2025:09:03 02:10:00' }, owners: [{ me: true }], _src: sampleImage('#b56fb0', '#21142b', 'sample photo 4') }
  ],
  init: function () { return Promise.resolve({ myName: 'You', isOwner: true, ownerName: 'You', canAdd: true }); },
  listMemories: function () { return Promise.resolve(this.files.slice()); },
  fetchBlob: function (f) { return Promise.resolve(f._src); },
  listThoughts: function () { return Promise.resolve(this.thoughts.slice()); },
  sendThought: function () { var t = { id: 'n' + Date.now(), createdTime: new Date().toISOString(), owners: [{ me: true }] }; this.thoughts.unshift(t); return Promise.resolve(t); },
  upload: function (file, note, onProgress) {
    var self = this;
    return new Promise(function (res) {
      var p = 0, iv = setInterval(function () {
        p += 0.2; onProgress && onProgress(Math.min(p, 1));
        if (p >= 1) { clearInterval(iv); var f = { id: 'u' + Date.now(), mimeType: file.type, description: note, createdTime: new Date().toISOString(), owners: [{ me: true }], _src: URL.createObjectURL(file) }; self.files.push(f); res(f); }
      }, 150);
    });
  }
};
var D = DEMO ? demo : drive;

/* ---------------- app state ---------------- */
var who = null;          // {isOwner, myName, ownerName, canAdd}
var memories = [];
var current = null;
var currentUrl = null;   // object URL to revoke

function otherIsHer() { return who ? who.isOwner : true; }
function otherPronoun() { return otherIsHer() ? 'her' : 'him'; }
function otherSubject() { return otherIsHer() ? 'she' : 'he'; }
function nameFor(owner) {
  // owner: Drive owner object of a file
  if (!owner) return '';
  if (owner.me) return 'you';
  var nick = otherIsHer() ? C.HER_NICKNAME : C.YOUR_NICKNAME;
  return nick || firstName(owner.displayName) || otherPronoun();
}
function otherName(fallbackOwner) {
  var nick = otherIsHer() ? C.HER_NICKNAME : C.YOUR_NICKNAME;
  if (nick) return nick;
  if (fallbackOwner && !fallbackOwner.me && fallbackOwner.displayName) return firstName(fallbackOwner.displayName);
  if (!otherIsHer() && who && who.ownerName) return firstName(who.ownerName);
  return otherIsHer() ? 'She' : 'He';
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* ---------------- clocks ---------------- */
function validTz(tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } }
function timeIn(tz) { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); }
function hourIn(tz) { return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()), 10) % 24; }
function partOfDay(h) {
  if (h < 5) return 'late night';
  if (h < 8) return 'early morning';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}
function renderClocks() {
  var mine = { place: C.YOUR_PLACE || 'Berlin', tz: validTz(C.YOUR_TIMEZONE) ? C.YOUR_TIMEZONE : 'Europe/Berlin' };
  var hers = { place: C.HER_PLACE || 'India', tz: validTz(C.HER_TIMEZONE) ? C.HER_TIMEZONE : 'Asia/Kolkata' };
  var here = who && !who.isOwner ? hers : mine;
  var there = who && !who.isOwner ? mine : hers;
  $('here-place').textContent = here.place;
  $('here-time').textContent = timeIn(here.tz);
  $('here-part').textContent = cap(partOfDay(hourIn(here.tz))) + ' for you';
  $('there-place').textContent = there.place;
  $('there-time').textContent = timeIn(there.tz);
  $('there-part').textContent = cap(partOfDay(hourIn(there.tz))) + ' for ' + (otherIsHer() ? (C.HER_NICKNAME || 'her') : (C.YOUR_NICKNAME || 'him'));
}

/* ---------------- memories ---------------- */
function memoryDate(f) {
  var t = f.imageMediaMetadata && f.imageMediaMetadata.time;
  var d = null;
  if (t) { var m = /^(\d{4}):(\d{2}):(\d{2})/.exec(t); if (m && m[1] !== '0000') d = new Date(+m[1], +m[2] - 1, +m[3]); }
  if (!d && f.createdTime) d = new Date(f.createdTime);
  return d && !isNaN(d) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}
function pickNext() {
  if (!memories.length) return null;
  if (memories.length === 1) return memories[0];
  var seen = store.get('seen') || [];
  var ids = memories.map(function (m) { return m.id; });
  seen = seen.filter(function (id) { return ids.indexOf(id) >= 0; });
  var fresh = memories.filter(function (m) { return seen.indexOf(m.id) < 0 && (!current || m.id !== current.id); });
  if (!fresh.length) { seen = []; fresh = memories.filter(function (m) { return !current || m.id !== current.id; }); }
  var pick = fresh[Math.floor(Math.random() * fresh.length)];
  seen.push(pick.id);
  store.set('seen', seen);
  return pick;
}
function thumbUrl(f, size) { return f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, '=s' + size) : null; }
function frameMsg(html) { var m = $('frame-msg'); if (html == null) { m.hidden = true; m.innerHTML = ''; } else { m.hidden = false; m.innerHTML = html; } }
function releaseUrl() { if (currentUrl && currentUrl.indexOf('blob:') === 0) URL.revokeObjectURL(currentUrl); currentUrl = null; }
function driveLink(f) { return 'https://drive.google.com/file/d/' + encodeURIComponent(f.id) + '/view'; }

function setBackdrop(media, src) {
  var bg = document.createElement('div'); bg.className = 'bg'; bg.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
  media.appendChild(bg);
}
function showImage(f, src) {
  var media = $('media');
  var img = new Image();
  img.alt = f.description || 'A memory of us';
  img.className = 'fade';
  img.onload = function () {
    if (current !== f) return;
    media.innerHTML = ''; setBackdrop(media, src); media.appendChild(img); frameMsg(null);
  };
  img.onerror = function () {
    if (current !== f) return;
    if (src.indexOf('blob:') !== 0 && src.indexOf('data:') !== 0) { loadOriginal(f); return; }
    frameMsg('<p>This photo can’t be shown here. HEIC photos from iPhones sometimes do this.</p><a href="' + driveLink(f) + '" target="_blank" rel="noopener">Open it in Google Drive</a>');
  };
  img.src = src;
}
function loadOriginal(f) {
  frameMsg('<div class="spinner"></div>');
  D.fetchBlob(f).then(function (url) {
    if (current !== f) { if (url.indexOf('blob:') === 0) URL.revokeObjectURL(url); return; }
    currentUrl = url; showImage(f, url);
  }).catch(function (e) {
    if (e && e.code === 'auth') return handleSoftError(e);
    if (current === f) frameMsg('<p>Couldn’t load this photo.</p><a href="' + driveLink(f) + '" target="_blank" rel="noopener">Open it in Google Drive</a>');
  });
}
function showVideo(f) {
  var media = $('media');
  media.innerHTML = '';
  var poster = thumbUrl(f, 1200);
  if (poster) { setBackdrop(media, poster); var pi = new Image(); pi.src = poster; pi.alt = ''; pi.className = 'fade'; pi.onerror = function () { pi.remove(); }; media.appendChild(pi); }
  var mb = f.size ? Math.round(+f.size / 1048576) : 0;
  var play = document.createElement('button');
  play.className = 'play'; play.type = 'button'; play.setAttribute('aria-label', 'Play video');
  play.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';
  var info = document.createElement('div'); info.className = 'play-info';
  info.textContent = 'Video' + (mb ? ' · ' + mb + ' MB' : '');
  media.appendChild(play); media.appendChild(info);
  frameMsg(null);
  play.addEventListener('click', function () {
    play.remove();
    info.textContent = 'Loading…';
    D.fetchBlob(f, function (p) { info.textContent = 'Loading… ' + Math.round(p * 100) + '%'; }).then(function (url) {
      if (current !== f) { URL.revokeObjectURL(url); return; }
      currentUrl = url;
      var v = document.createElement('video');
      v.src = url; v.controls = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.className = 'fade';
      info.remove(); media.appendChild(v);
      v.play().catch(function () {});
    }).catch(function (e) {
      if (e && e.code === 'auth') return handleSoftError(e);
      info.innerHTML = 'Couldn’t load this video. <a href="' + driveLink(f) + '" target="_blank" rel="noopener" style="color:var(--flame)">Open in Drive</a>';
    });
  });
}
function showMemory(f) {
  releaseUrl();
  current = f;
  $('media').innerHTML = '';
  if (!f) {
    frameMsg(who && who.isOwner
      ? '<p>No memories yet.</p><p>Drop photos and videos into your Hearth folder in Google Drive, or tap “Add a memory”.</p>'
      : '<p>No memories here yet.</p>');
    $('note').textContent = ''; $('meta').textContent = '';
    $('next').disabled = true;
    return;
  }
  $('next').disabled = memories.length < 2;
  $('note').textContent = f.description || '';
  var bits = [memoryDate(f)];
  var owner = f.owners && f.owners[0];
  if (owner && !owner.me) bits.push('added by ' + nameFor(owner));
  $('meta').textContent = bits.filter(Boolean).join(' · ');
  if (/^video\//.test(f.mimeType)) { showVideo(f); return; }
  frameMsg('<div class="spinner"></div>');
  if (f._src) { showImage(f, f._src); return; }
  var t = thumbUrl(f, 1600);
  if (t) showImage(f, t); else loadOriginal(f);
}
function nextMemory() { showMemory(pickNext()); prefetch(); }
var prefetched = null;
function prefetch() {
  // warm the browser cache for a likely next photo (thumbnails only, small)
  var c = memories.filter(function (m) { return !current || m.id !== current.id; }).filter(function (m) { return /^image\//.test(m.mimeType) && m.thumbnailLink; });
  if (!c.length) return;
  prefetched = new Image(); prefetched.src = thumbUrl(c[Math.floor(Math.random() * c.length)], 1600);
}
function loadMemories() {
  return D.listMemories().then(function (list) {
    memories = list.filter(function (f) { return /^(image|video)\//.test(f.mimeType); });
    nextMemory();
  });
}

/* ---------------- thinking of you ---------------- */
function ago(iso) {
  var s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  var rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
function renderThoughts(list) {
  var el = $('thought-status');
  var theirs = list.filter(function (t) { return t.owners && t.owners[0] && !t.owners[0].me; });
  var dayAgo = Date.now() - 86400e3;
  var latest = theirs[0];
  if (latest && Date.now() - new Date(latest.createdTime).getTime() < 30 * 86400e3) {
    var today = theirs.filter(function (t) { return new Date(t.createdTime).getTime() > dayAgo; }).length;
    el.innerHTML = '';
    var b = document.createElement('b'); b.textContent = otherName(latest.owners[0]);
    el.appendChild(b);
    el.appendChild(document.createTextNode(' thought of you ' + ago(latest.createdTime) + (today > 1 ? ' (' + today + ' times today)' : '') + '.'));
  } else {
    el.textContent = 'Tap it whenever ' + otherPronoun() + ' crosses your mind. No message needed.';
  }
}
function refreshThoughts() { return D.listThoughts().then(renderThoughts).catch(function () {}); }
var sending = false;
function sendThought() {
  if (sending) return;
  sending = true;
  var btn = $('thought-btn');
  btn.classList.remove('sent'); void btn.offsetWidth; btn.classList.add('sent');
  if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
  D.sendThought().then(function () {
    $('thought-status').textContent = 'Sent. ' + cap(otherSubject()) + '’ll see it next time ' + otherSubject() + ' opens Hearth.';
  }).catch(function (e) {
    if (e && e.code === 'auth') return handleSoftError(e);
    $('thought-status').textContent = 'Couldn’t send that. Check your connection and tap again.';
  }).then(function () { setTimeout(function () { sending = false; btn.classList.remove('sent'); }, 1500); });
}

/* ---------------- add a memory ---------------- */
var picked = [];
function openSheet() {
  picked = []; $('file').value = ''; $('note-in').value = ''; $('picker-text').textContent = 'Choose photos or videos';
  $('upload').disabled = true; $('sheet-msg').textContent = ''; $('progress').hidden = true; $('progress-bar').style.width = '0';
  $('sheet').hidden = false;
  setTimeout(function () { $('file').focus(); }, 50);
}
function closeSheet() { if (uploading) return; $('sheet').hidden = true; $('add').focus(); }
var uploading = false;
function onPick() {
  picked = Array.prototype.slice.call($('file').files || []);
  var big = picked.filter(function (f) { return /^video\//.test(f.type) && f.size > 150 * 1048576; });
  $('picker-text').textContent = picked.length ? picked.length + (picked.length > 1 ? ' files chosen' : ' file chosen') + ' · tap to change' : 'Choose photos or videos';
  $('sheet-msg').textContent = big.length ? 'Big videos take a long time to load on a phone. Short clips work best.' : '';
  $('upload').disabled = !picked.length;
}
function doUpload() {
  if (!picked.length || uploading) return;
  uploading = true;
  var note = $('note-in').value.trim();
  var total = picked.reduce(function (s, f) { return s + f.size; }, 0) || 1, done = 0, i = 0, added = [], failed = 0;
  $('upload').disabled = true; $('cancel').disabled = true; $('progress').hidden = false;
  function step() {
    if (i >= picked.length) {
      uploading = false; $('cancel').disabled = false;
      if (added.length) {
        memories = memories.concat(added);
        $('sheet').hidden = true;
        toast(failed ? added.length + ' added, ' + failed + ' couldn’t be added.' : (added.length > 1 ? 'Added. They’re in Hearth now.' : 'Added. It’s in Hearth now.'));
        showMemory(added[0]);
      } else {
        $('sheet-msg').textContent = 'Couldn’t add that. Check your connection and try again.';
        $('upload').disabled = false;
      }
      return;
    }
    var f = picked[i++];
    $('sheet-msg').textContent = 'Adding ' + i + ' of ' + picked.length + '…';
    D.upload(f, note, function (p) { $('progress-bar').style.width = Math.round((done + f.size * p) / total * 100) + '%'; })
      .then(function (meta) { if (meta) added.push(meta); })
      .catch(function (e) { failed++; if (e && e.code === 'auth') { uploading = false; handleSoftError(e); throw e; } })
      .then(function () { done += f.size; step(); }, function () {});
  }
  step();
}

/* ---------------- errors & boot ---------------- */
function explain(e) {
  if (e && e.code === 'network') return ['No connection', 'Hearth needs the internet to reach Google Drive. Try again when you’re back online.'];
  if (e && e.code === 'http') {
    if (e.reason === 'accessNotConfigured' || /has not been used|disabled/i.test(e.message)) return ['Drive isn’t switched on yet', 'In Google Cloud, enable the Google Drive API for this project (setup guide, step 3).'];
    if (e.status === 404) return ['Can’t find the Hearth folder', 'This Google account can’t see the folder. Make sure it was shared with this account, or sign in with the one it was shared with.'];
    if (e.status === 403) return ['No access', 'This Google account doesn’t have access to Hearth. Try the account the folder was shared with.'];
  }
  return ['Something went wrong', 'Hearth couldn’t reach Google Drive. Try again in a moment.'];
}
function showError(e) {
  var x = explain(e);
  $('err-title').textContent = x[0]; $('err-text').textContent = x[1];
  show('screen-error');
}
function handleSoftError(e) {
  if (e && e.code === 'auth') {
    // token expired mid-session: quietly get a fresh one, unless we just tried
    var last = store.get('authAttempt') || 0;
    if (Date.now() - last > 20000) { signIn(false); return; }
    show('screen-welcome'); return;
  }
  toast('Couldn’t reach Google Drive just now.');
}
function startMain() {
  show('screen-loading');
  D.init().then(function (w) {
    who = w;
    $('add').hidden = !w.canAdd;
    renderClocks();
    show('screen-main');
    maybeInstallHint();
    return Promise.all([loadMemories(), refreshThoughts()]);
  }).catch(function (e) {
    if (e && e.code === 'auth') return handleSoftError(e);
    showError(e);
  });
}
function maybeInstallHint() {
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || store.get('installDismissed')) return;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('install-how').textContent = ios ? 'In Safari, tap Share, then “Add to Home Screen”.' : 'Open your browser menu (⋮), then tap “Install app” or “Add to Home screen”.';
  $('install').hidden = false;
}

function wire() {
  $('signin').addEventListener('click', function () { signIn(false); });
  $('err-retry').addEventListener('click', startMain);
  $('err-switch').addEventListener('click', function () { signOut(); signIn(true); });
  $('next').addEventListener('click', nextMemory);
  $('add').addEventListener('click', openSheet);
  $('cancel').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
  $('file').addEventListener('change', onPick);
  $('upload').addEventListener('click', doUpload);
  $('thought-btn').addEventListener('click', sendThought);
  $('install-x').addEventListener('click', function () { store.set('installDismissed', true); $('install').hidden = true; });
  var menu = $('menu'), mb = $('menu-btn');
  function closeMenu() { menu.hidden = true; mb.setAttribute('aria-expanded', 'false'); }
  mb.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; mb.setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMenu(); closeSheet(); } });
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('[data-menu]'); if (!b) return; closeMenu();
    var act = b.getAttribute('data-menu');
    if (act === 'refresh') { loadMemories().then(function () { toast(memories.length + (memories.length === 1 ? ' memory' : ' memories') + ' in Hearth.'); }).catch(handleSoftError); refreshThoughts(); }
    if (DEMO) { if (act !== 'refresh') toast('That works once Hearth is set up.'); return; }
    if (act === 'switch') { signOut(); signIn(true); }
    if (act === 'signout') { signOut(); show('screen-welcome'); }
  });
  setInterval(function () { if (!$('screen-main').hidden) renderClocks(); }, 15000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || $('screen-main').hidden) return;
    renderClocks();
    if (!DEMO && !token()) { handleSoftError(new AuthError()); return; }
    refreshThoughts();
  });
}

function boot() {
  wire();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  if (DEMO) { $('demo-tag').hidden = false; startMain(); return; }
  if (!configured()) { show('screen-setup'); return; }
  var r = readRedirect();
  if (r && r.error) {
    show('screen-welcome');
    var msg = r.error === 'access_denied' ? 'Sign-in was cancelled. Tap the button to try again.' : 'Sign-in didn’t finish. Tap the button to try again.';
    $('welcome-err').textContent = msg; $('welcome-err').hidden = false;
    return;
  }
  if (token()) { startMain(); return; }
  if (store.get('signedIn')) {
    // returning visitor whose hour-long pass ran out: renew quietly
    var last = store.get('authAttempt') || 0;
    if (Date.now() - last > 20000) { signIn(false); return; }
  }
  show('screen-welcome');
}
boot();
})();
