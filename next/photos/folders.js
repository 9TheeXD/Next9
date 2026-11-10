/* Shared folder UI for /photos and /photos/album: folder tiles, the right-click / long-press menu,
   album actions (pin, rename, move, copy, delete) and the Drive-style folder picker.
   Pages provide their dialogs through window.__photosUI = { prompt, confirm, toast }. */
(function () {
    'use strict';
    if (window.PhotosFolders) return;

    const CACHE_KEY = 'photos_albums_cache_v2';
    const LONG_PRESS_MS = 450;
    const PF = window.PhotosFolders = {};

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const enc = encodeURIComponent;
    const fmt = n => Number(n || 0).toLocaleString('th-TH');
    PF.esc = esc;
    PF.fmt = fmt;

    function getCookie(name) {
        const m = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
        return m ? decodeURIComponent(m[2]) : null;
    }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const authToken = () => getCookie('photos_token') || lsGet('photos_token') || '';
    const ui = () => window.__photosUI || {};
    const toast = (m, t) => { const f = ui().toast; if (f) f(m, t); };
    const vibrate = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

    /* ================= Data ================= */
    // A page that already holds the album list (the /photos list page) plugs itself in with
    // configure({ getAlbums, reload }); otherwise the list is fetched here, cached with its ETag.
    let provider = null;
    let albums = null, etag = null, cachedBody = null, inflight = null;
    try {
        const c = JSON.parse(lsGet(CACHE_KEY) || 'null');
        if (c && c.body) { albums = JSON.parse(c.body); etag = c.etag || null; cachedBody = c.body; }
    } catch (e) {}

    PF.configure = opts => { provider = opts || null; };
    PF.getAlbums = () => (provider && provider.getAlbums ? provider.getAlbums() : albums) || [];

    PF.refresh = function (force) {
        if (provider && provider.reload) return Promise.resolve(provider.reload(force)).then(() => PF.getAlbums());
        if (inflight) return force ? inflight.then(() => PF.refresh(true)) : inflight;
        inflight = (async () => {
            const headers = {};
            if (!force && etag && albums) headers['If-None-Match'] = etag;
            const res = await fetch('/api/photos/albums', { credentials: 'include', cache: 'no-store', headers });
            if (res.status === 304) return albums;
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const body = await res.text();
            etag = res.headers.get('ETag');
            if (body !== cachedBody) { cachedBody = body; albums = JSON.parse(body); }
            lsSet(CACHE_KEY, JSON.stringify({ etag, body, at: Date.now() }));
            return albums;
        })().finally(() => { inflight = null; });
        return inflight;
    };
    const ensureAlbums = async () => { if (!PF.getAlbums().length) await PF.refresh(); };

    const T = PF.tree = {
        children: (list, parentId) => list.filter(a => (a.parent_id || null) === (parentId || null)),
        path(list, id) {
            const byId = new Map(list.map(a => [a.id, a]));
            const out = [], seen = new Set();
            let cur = byId.get(id);
            while (cur && !seen.has(cur.id)) { out.unshift(cur); seen.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : null; }
            return out;
        },
        descendants(list, id) {
            const ids = new Set([id]);
            let grew = true;
            while (grew) {
                grew = false;
                for (const a of list) if (a.parent_id && ids.has(a.parent_id) && !ids.has(a.id)) { ids.add(a.id); grew = true; }
            }
            return ids;
        },
        totals(list, id) {
            const ids = T.descendants(list, id);
            let photos = 0, videos = 0;
            for (const a of list) if (ids.has(a.id)) { photos += a.photo_count || 0; videos += a.video_count || 0; }
            return { folders: ids.size - 1, photos, videos };
        }
    };

    PF.sortAlbums = list => list.slice().sort((a, b) =>
        (b.event_date || b.created_at || 0) - (a.event_date || a.created_at || 0) || (b.updated_at || 0) - (a.updated_at || 0));
    const pinnedFirst = list => {
        const sorted = PF.sortAlbums(list);
        return sorted.filter(a => a.pinned_at).sort((a, b) => b.pinned_at - a.pinned_at).concat(sorted.filter(a => !a.pinned_at));
    };
    PF.metaText = a => {
        const parts = [];
        if (a.child_count) parts.push(fmt(a.child_count) + ' โฟลเดอร์');
        if (a.photo_count) parts.push(fmt(a.photo_count) + ' รูป');
        if (a.video_count) parts.push(fmt(a.video_count) + ' วิดีโอ');
        return parts.length ? parts.join(' · ') : 'ว่าง';
    };
    PF.albumUrl = id => '/photos/album/?id=' + enc(id);
    // Overridable so a shared (no-password) view can route thumbnails through its share link.
    PF.imageUrl = (id, variant) => '/api/image/' + enc(id) + '/' + variant;

    /* ================= Folder tile ================= */
    PF.tileHTML = (a, opts) => {
        opts = opts || {};
        let cover;
        if (!a.has_access) cover = '<div class="pf-cover pf-cover-locked"><i class="fas fa-lock"></i></div>';
        else if (a.cover_image_id) cover = `<div class="pf-cover"><img src="${esc(a.cover_preview || '')}" data-thumb="${esc(PF.imageUrl(a.cover_image_id, 'thumb'))}" alt="" draggable="false"></div>`;
        else cover = '<div class="pf-cover pf-cover-empty"><i class="fas fa-folder"></i></div>';
        const cls = ['pf-tile'];
        if (opts.disabled) cls.push('is-disabled');
        if (a.pinned_at) cls.push('is-pinned');
        return `<div class="${cls.join(' ')}" data-id="${esc(a.id)}" tabindex="0" role="button" aria-label="${esc(a.name)}">
            ${cover}
            <div class="pf-tile-body">
                <div class="pf-tile-name">${a.pinned_at ? '<i class="fas fa-thumbtack pf-pin"></i>' : ''}${a.is_locked ? '<i class="fas fa-lock pf-lock"></i>' : ''}<span>${esc(a.name)}</span></div>
                <div class="pf-tile-meta">${esc(opts.note || PF.metaText(a))}</div>
            </div>
            ${opts.menu ? '<button class="pf-more" type="button" data-more aria-label="ตัวเลือกเพิ่มเติม"><i class="fas fa-ellipsis-vertical"></i></button>' : ''}
        </div>`;
    };

    let thumbObs = null;
    PF.upgradeThumbs = root => {
        const imgs = root.querySelectorAll('img[data-thumb]');
        if (!imgs.length) return;
        if (!('IntersectionObserver' in window)) { imgs.forEach(swapThumb); return; }
        if (!thumbObs) thumbObs = new IntersectionObserver(entries => entries.forEach(en => {
            if (en.isIntersecting) { thumbObs.unobserve(en.target); swapThumb(en.target); }
        }), { rootMargin: '200px' });
        imgs.forEach(img => thumbObs.observe(img));
    };
    function swapThumb(img) {
        const src = img.dataset.thumb;
        if (!src) return;
        delete img.dataset.thumb;
        const full = new Image();
        full.onload = () => { img.src = src; };
        full.src = src;
    }

    /* ================= API + actions ================= */
    async function api(url, method, body, albumId) {
        const headers = { Authorization: authToken() };
        if (body) headers['Content-Type'] = 'application/json';
        const t = albumId && lsGet('album_token_' + albumId);
        if (t) headers['X-Album-Token'] = t;
        const res = await fetch(url, { method, headers, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
        let data = {};
        try { data = await res.json(); } catch (e) {}
        if (!res.ok || data.success === false) {
            const err = new Error(data.message || (res.status === 404 ? 'ไม่พบข้อมูล หรือเซิร์ฟเวอร์ยังไม่อัปเดต' : 'เกิดข้อผิดพลาด'));
            err.status = res.status;
            throw err;
        }
        return data;
    }
    PF.api = api;

    PF.saveAlbumToken = (albumId, token) => {
        lsSet('album_token_' + albumId, token);
        document.cookie = 'album_token_' + albumId + '=' + enc(token) + '; path=/; max-age=315360000; SameSite=Lax';
    };

    async function unlockAlbum(a) {
        const gateId = a.lock_gate_id || a.id;
        const prompt = ui().prompt;
        if (!prompt) return false;
        const pw = await prompt({
            title: 'โฟลเดอร์นี้ถูกล็อก',
            message: gateId !== a.id ? 'อยู่ในโฟลเดอร์ที่ถูกล็อก กรอกรหัสผ่านของโฟลเดอร์นั้น' : 'กรอกรหัสผ่านเพื่อเปิด "' + a.name + '"',
            isPassword: true,
            placeholder: 'รหัสผ่าน',
            confirmText: 'ปลดล็อก'
        });
        if (!pw) return false;
        let d = {};
        try {
            const res = await fetch('/api/photos/albums/' + enc(gateId) + '/verify', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw })
            });
            d = await res.json();
        } catch (e) {}
        if (!d.success || !d.token) { toast(esc(d.message || 'รหัสผ่านไม่ถูกต้อง'), 'error'); return false; }
        PF.saveAlbumToken(d.album_id || gateId, d.token);
        return true;
    }

    PF.unlockAlbum = unlockAlbum;

    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); return true; } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (err) {}
            ta.remove();
            return ok;
        }
    }

    // Each action resolves to a change descriptor ({ kind, ... }) or null when nothing changed.
    PF.actions = {
        open(a) { location.href = PF.albumUrl(a.id) + '&_t=' + Date.now(); return null; },
        newTab(a) { window.open(PF.albumUrl(a.id), '_blank', 'noopener'); return null; },
        async copyLink(a) {
            const ok = await copyText(location.origin + PF.albumUrl(a.id));
            toast(ok ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกไม่สำเร็จ', ok ? 'success' : 'error');
            return null;
        },
        async pin(a) {
            const pinned = !a.pinned_at;
            await api('/api/photos/albums/' + enc(a.id) + '/pin', 'POST', { pinned });
            a.pinned_at = pinned ? Date.now() : null;
            toast(pinned ? 'ปักหมุดแล้ว' : 'เลิกปักหมุดแล้ว', 'success');
            return { kind: 'pin', id: a.id };
        },
        async rename(a) {
            const name = await ui().prompt({ title: 'เปลี่ยนชื่อ', defaultValue: a.name, placeholder: 'ชื่ออัลบั้ม', confirmText: 'บันทึก' });
            if (!name || !name.trim() || name.trim() === a.name) return null;
            await api('/api/photos/albums/' + enc(a.id), 'PUT', { name: name.trim() }, a.id);
            a.name = name.trim();
            toast('เปลี่ยนชื่อแล้ว', 'success');
            return { kind: 'rename', id: a.id };
        },
        async move(a) {
            await ensureAlbums();
            const res = await PF.openPicker({
                title: 'ย้าย "' + a.name + '" ไปที่',
                confirmText: 'ย้ายมาที่นี่',
                allowRoot: true,
                startId: a.parent_id || null,
                disabledIds: T.descendants(PF.getAlbums(), a.id),
                disabledHint: 'ย้ายเข้าไปในตัวเองไม่ได้',
                blockedTargetId: a.parent_id || null,
                blockedHint: 'อยู่ในโฟลเดอร์นี้อยู่แล้ว'
            });
            if (!res) return null;
            await api('/api/photos/albums/' + enc(a.id), 'PUT', { parent_id: res.targetId }, a.id);
            a.parent_id = res.targetId;
            toast('ย้ายไปที่ ' + esc(res.label) + ' แล้ว', 'success');
            return { kind: 'move', id: a.id, targetId: res.targetId };
        },
        async copy(a) {
            await ensureAlbums();
            const res = await PF.openPicker({
                title: 'ทำสำเนา "' + a.name + '" ไปที่',
                confirmText: 'ทำสำเนาที่นี่',
                allowRoot: true,
                startId: a.parent_id || null,
                disabledIds: T.descendants(PF.getAlbums(), a.id),
                disabledHint: 'ทำสำเนาเข้าไปในตัวเองไม่ได้'
            });
            if (!res) return null;
            toast('<i class="fas fa-circle-notch fa-spin"></i> กำลังทำสำเนา...', 'success');
            const d = await api('/api/photos/albums/' + enc(a.id) + '/copy', 'POST', { parentId: res.targetId }, a.id);
            toast('ทำสำเนาแล้ว ' + fmt(d.albums) + ' อัลบั้ม ' + fmt(d.copied) + ' รายการ' + (d.skipped ? ' (ข้าม ' + fmt(d.skipped) + ' ที่ยังประมวลผลไม่เสร็จ)' : ''), 'success');
            return { kind: 'copy', id: a.id, newId: d.album_id, targetId: res.targetId };
        },
        async remove(a) {
            const t = T.totals(PF.getAlbums(), a.id);
            const inside = [];
            if (t.folders) inside.push(fmt(t.folders) + ' โฟลเดอร์ย่อย');
            if (t.photos) inside.push(fmt(t.photos) + ' รูป');
            if (t.videos) inside.push(fmt(t.videos) + ' วิดีโอ');
            const ok = await ui().confirm({
                title: 'ย้ายไปถังขยะ?',
                message: '"' + a.name + '"' + (inside.length ? ' รวมถึง ' + inside.join(', ') + ' ที่อยู่ข้างใน' : '') + ' จะอยู่ในถังขยะ กู้คืนได้ภายใน 30 วัน',
                isDanger: true,
                confirmText: 'ย้ายไปถังขยะ',
                cancelText: 'ยกเลิก'
            });
            if (!ok) return null;
            await api('/api/photos/albums/' + enc(a.id), 'DELETE', null, a.id);
            toast('ย้ายไปถังขยะแล้ว', 'success');
            return { kind: 'delete', id: a.id };
        },
        share(a) {
            PF.openShareDialog({ kind: 'album', id: a.id, name: a.name, locked: !!a.is_locked });
            return null;
        },
        zip(a) {
            const hook = ui().downloadFolderZip;
            if (hook) hook(a);
            else location.href = PF.albumUrl(a.id) + '&download=zip';
            return null;
        }
    };

    PF.run = async (cmd, album, onChanged) => {
        try {
            const r = await PF.actions[cmd](album);
            if (r && onChanged) onChanged(r);
        } catch (e) {
            toast(esc(e && e.message ? e.message : 'เกิดข้อผิดพลาด'), 'error');
        }
    };

    /* ================= Context menu ================= */
    let menuEl = null, backdropEl = null, menuState = null;

    function buildMenu() {
        backdropEl = document.createElement('div');
        backdropEl.className = 'pf-menu-backdrop';
        menuEl = document.createElement('div');
        menuEl.className = 'pf-menu';
        menuEl.setAttribute('role', 'menu');
        document.body.append(backdropEl, menuEl);
        // A long-press opens the menu while the finger is still down, and the backdrop appears right
        // under it. The phone then delivers the tail of that same gesture to the backdrop: Android
        // Chrome fires contextmenu during the hold and a click when the finger lifts. Treating those
        // as "tap outside" closed the menu the instant it opened, so they are ignored until the
        // opening touch has ended (plus a short settle time).
        backdropEl.addEventListener('click', e => {
            if (isOpeningGestureTail()) { e.preventDefault(); e.stopPropagation(); return; }
            closeMenu();
        });
        backdropEl.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (!isOpeningGestureTail()) closeMenu();
        });
        document.addEventListener('touchend', () => {
            if (menuState && menuState.fromTouch && !menuState.touchReleasedAt) menuState.touchReleasedAt = Date.now();
        }, { capture: true, passive: true });
        document.addEventListener('touchcancel', () => {
            if (menuState && menuState.fromTouch && !menuState.touchReleasedAt) menuState.touchReleasedAt = Date.now();
        }, { capture: true, passive: true });
        menuEl.addEventListener('click', e => {
            const b = e.target.closest('button[data-cmd]');
            if (!b || !menuState) return;
            const { album, onChanged } = menuState;
            closeMenu();
            PF.run(b.dataset.cmd, album, onChanged);
        });
        menuEl.addEventListener('keydown', e => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const items = [...menuEl.querySelectorAll('button[data-cmd]')];
            const i = items.indexOf(document.activeElement);
            const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
            if (next) next.focus();
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuState) closeMenu(); });
        // Scrolling the page closes the menu so it can never stay stranded on screen — but only once the
        // scroll is real, so the long-press that opened it does not immediately dismiss it.
        window.addEventListener('resize', () => { if (menuState && !menuState.sheet) closeMenu(); });
        window.addEventListener('scroll', requestCloseMenu, { passive: true, capture: true });
        backdropEl.addEventListener('touchmove', requestCloseMenu, { passive: true });
        backdropEl.addEventListener('wheel', requestCloseMenu, { passive: true });
    }

    // A menu opened by a long-press must survive the finger still resting on the screen, and small
    // scrolls: it closes on a real scroll or drag, and fades rather than vanishing mid-frame.
    const MENU_GRACE_MS = 500;
    const MENU_SCROLL_SLOP = 16;
    const MENU_DRAG_SLOP = 26;
    let menuCloseTimer = null;

    function closeMenu() {
        if (!menuEl) return;
        menuState = null;
        if (!menuEl.classList.contains('show')) return;
        menuEl.classList.add('closing');
        backdropEl.classList.add('closing');
        clearTimeout(menuCloseTimer);
        menuCloseTimer = setTimeout(() => {
            menuEl.classList.remove('show', 'closing');
            backdropEl.classList.remove('show', 'dim', 'closing');
        }, 170);
    }
    PF.closeMenu = closeMenu;

    // True while events still belong to the gesture that opened the menu: the finger has not lifted
    // yet, or lifted less than RELEASE_SETTLE_MS ago.
    const RELEASE_SETTLE_MS = 350;
    function isOpeningGestureTail() {
        if (!menuState) return false;
        if (Date.now() - menuState.openedAt < MENU_GRACE_MS) return true;
        if (!menuState.fromTouch) return false;
        return !menuState.touchReleasedAt || Date.now() - menuState.touchReleasedAt < RELEASE_SETTLE_MS;
    }

    // Close requests coming from scrolling/dragging, which have to clear the grace period and a
    // movement threshold first. Scrolling inside the menu itself never closes it.
    function requestCloseMenu(e) {
        if (!menuState) return;
        const t = e && e.target;
        if (t && t.nodeType === 1 && t.closest && t.closest('.pf-menu')) return;
        if (Date.now() - menuState.openedAt < MENU_GRACE_MS) return;
        if (e && (e.type === 'scroll' || e.type === 'touchmove')) {
            const scrolled = Math.abs(window.scrollY - menuState.scrollY) + Math.abs(window.scrollX - menuState.scrollX);
            const touch = e.touches && e.touches[0];
            const dragged = touch ? Math.hypot(touch.clientX - menuState.touchX, touch.clientY - menuState.touchY) : 0;
            if (scrolled < MENU_SCROLL_SLOP && dragged < MENU_DRAG_SLOP) return;
        }
        closeMenu();
    }
    PF.requestCloseMenu = requestCloseMenu;

    PF.openMenu = ({ album, x, y, sheet, onChanged, fromTouch }) => {
        if (!album) return;
        if (!menuEl) buildMenu();
        const ok = album.has_access;
        const item = (cmd, icon, label, cls) => `<button type="button" role="menuitem" data-cmd="${cmd}"${cls ? ` class="${cls}"` : ''}><i class="${icon}"></i><span>${label}</span></button>`;
        menuEl.innerHTML =
            `<div class="pf-menu-head"><div class="pf-menu-grip"></div><div class="pf-menu-title">${esc(album.name)}</div><div class="pf-menu-sub">${esc(ok ? PF.metaText(album) : 'ถูกล็อก')}</div></div>` +
            item('open', 'fas fa-folder-open', 'เปิด') +
            item('newTab', 'fas fa-arrow-up-right-from-square', 'เปิดในแท็บใหม่') +
            item('pin', 'fas fa-thumbtack', album.pinned_at ? 'เลิกปักหมุด' : 'ปักหมุด') +
            item('copyLink', 'fas fa-link', 'คัดลอกลิงก์') +
            (ok ? '<div class="pf-menu-sep"></div>' +
                item('rename', 'fas fa-pen', 'เปลี่ยนชื่อ') +
                item('move', 'fas fa-folder-tree', 'ย้ายไปที่…') +
                item('copy', 'fas fa-copy', 'ทำสำเนาไปที่…') +
                item('share', 'fas fa-share-nodes', 'แชร์โฟลเดอร์…') +
                item('zip', 'fas fa-file-zipper', 'ดาวน์โหลดเป็น ZIP') +
                '<div class="pf-menu-sep"></div>' +
                item('remove', 'fas fa-trash', 'ลบ', 'danger') : '');
        const useSheet = !!sheet || window.matchMedia('(max-width: 640px)').matches;
        clearTimeout(menuCloseTimer);
        menuEl.classList.remove('closing');
        backdropEl.classList.remove('closing');
        menuState = {
            album, onChanged, sheet: useSheet,
            openedAt: Date.now(),
            // Opened by a long-press: the finger is still on the screen (see isOpeningGestureTail).
            fromTouch: !!fromTouch,
            touchReleasedAt: 0,
            scrollY: window.scrollY, scrollX: window.scrollX,
            touchX: x, touchY: y
        };
        menuEl.classList.toggle('sheet', useSheet);
        menuEl.style.left = '';
        menuEl.style.top = '';
        backdropEl.classList.add('show');
        backdropEl.classList.toggle('dim', useSheet);
        menuEl.classList.add('show');
        if (!useSheet) {
            const r = menuEl.getBoundingClientRect();
            menuEl.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
            menuEl.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
        }
        const first = menuEl.querySelector('button[data-cmd]');
        if (first) first.focus({ preventScroll: true });
    };

    /* ================= Gestures: right-click, long-press, ⋮ button, keyboard ================= */
    let suppressClickUntil = 0;
    PF.shouldSuppressClick = () => Date.now() < suppressClickUntil;

    // The page keeps handling plain clicks (open); this adds the menu entry points.
    PF.bindGestures = (container, opts) => {
        const selector = opts.selector || '[data-id]';
        const { getAlbum, onChanged, onOpen } = opts;
        let lp = null, lastTouch = 0;
        const hitOf = el => {
            const tile = el && el.closest && el.closest(selector);
            const album = tile && getAlbum(tile.dataset.id);
            return album ? { tile, album } : null;
        };
        const cancel = () => {
            if (!lp) return;
            clearTimeout(lp.timer);
            lp.tile.classList.remove('pf-pressing');
            lp = null;
        };

        container.addEventListener('click', e => {
            const more = e.target.closest('[data-more]');
            if (!more) return;
            const hit = hitOf(more);
            if (!hit) return;
            e.preventDefault();
            e.stopPropagation();
            const r = more.getBoundingClientRect();
            PF.openMenu({ album: hit.album, x: r.right - 230, y: r.bottom + 6, onChanged });
        }, true);

        container.addEventListener('contextmenu', e => {
            const hit = hitOf(e.target);
            if (!hit) return;
            e.preventDefault();
            if (Date.now() - lastTouch < 900) return; // the long-press timer already owns touch gestures
            PF.openMenu({ album: hit.album, x: e.clientX, y: e.clientY, onChanged });
        });

        container.addEventListener('touchstart', e => {
            lastTouch = Date.now();
            if (e.touches.length !== 1 || e.target.closest('[data-more]')) { cancel(); return; }
            const hit = hitOf(e.target);
            if (!hit) return;
            const t = e.touches[0];
            cancel();
            hit.tile.classList.add('pf-pressing');
            const state = { tile: hit.tile, x: t.clientX, y: t.clientY };
            state.timer = setTimeout(() => {
                if (lp !== state) return;
                lp = null;
                state.tile.classList.remove('pf-pressing');
                suppressClickUntil = Date.now() + 700;
                vibrate(40);
                PF.openMenu({ album: getAlbum(state.tile.dataset.id), x: state.x, y: state.y, sheet: true, onChanged, fromTouch: true });
            }, LONG_PRESS_MS);
            lp = state;
        }, { passive: true });
        container.addEventListener('touchmove', e => {
            if (!lp) return;
            const t = e.touches[0];
            if (Math.hypot(t.clientX - lp.x, t.clientY - lp.y) > 10) cancel();
        }, { passive: true });
        container.addEventListener('touchend', () => { lastTouch = Date.now(); cancel(); }, { passive: true });
        container.addEventListener('touchcancel', cancel, { passive: true });

        container.addEventListener('keydown', e => {
            const hit = hitOf(e.target);
            if (!hit || e.target !== hit.tile) return;
            if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
                e.preventDefault();
                const r = hit.tile.getBoundingClientRect();
                PF.openMenu({ album: hit.album, x: r.left + 24, y: r.top + 24, onChanged });
            } else if ((e.key === 'Enter' || e.key === ' ') && onOpen) {
                e.preventDefault();
                onOpen(hit.album);
            }
        });
    };

    /* ================= Folder picker ================= */
    // Resolves { targetId (null = top level), label } or null when cancelled.
    PF.openPicker = opts => new Promise(resolve => {
        opts = Object.assign({
            title: 'เลือกโฟลเดอร์', confirmText: 'เลือก', allowRoot: false, startId: null,
            disabledIds: new Set(), disabledHint: 'เลือกโฟลเดอร์นี้ไม่ได้', blockedTargetId: undefined, blockedHint: ''
        }, opts);
        const old = document.querySelector('.pf-picker-overlay');
        if (old) old.remove();

        const el = document.createElement('div');
        el.className = 'pf-picker-overlay';
        el.innerHTML = `
            <div class="pf-picker" role="dialog" aria-modal="true" aria-labelledby="pfPickerTitle">
                <div class="pf-picker-head">
                    <div class="pf-picker-top">
                        <div class="pf-picker-title" id="pfPickerTitle"></div>
                        <button type="button" class="pf-icon-btn" data-close aria-label="ปิด"><i class="fas fa-xmark"></i></button>
                    </div>
                    <nav class="pf-crumbs" aria-label="ตำแหน่ง"></nav>
                    <div class="pf-picker-tools">
                        <label class="pf-search"><i class="fas fa-magnifying-glass"></i><input type="search" placeholder="ค้นหาโฟลเดอร์ทั้งหมด" autocomplete="off" enterkeyhint="search"></label>
                        <button type="button" class="pf-btn pf-btn-glass" data-new><i class="fas fa-folder-plus"></i><span>โฟลเดอร์ใหม่</span></button>
                    </div>
                </div>
                <div class="pf-picker-body"><div class="pf-grid"></div></div>
                <div class="pf-picker-foot">
                    <div class="pf-target"></div>
                    <div class="pf-actions">
                        <button type="button" class="pf-btn pf-btn-ghost" data-close>ยกเลิก</button>
                        <button type="button" class="pf-btn pf-btn-primary" data-ok></button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(el);
        const $ = s => el.querySelector(s);
        $('.pf-picker-title').textContent = opts.title;
        $('[data-ok]').textContent = opts.confirmText;
        const searchInput = $('.pf-search input');

        let currentId = opts.startId || null;
        let query = '';
        let loading = true;

        const findAlbum = id => PF.getAlbums().find(a => a.id === id);
        const label = id => { if (!id) return 'หน้าหลัก'; const a = findAlbum(id); return a ? a.name : 'โฟลเดอร์'; };

        function blockReason() {
            if (!currentId && !opts.allowRoot) return 'เปิดอัลบั้มที่ต้องการ แล้วกดยืนยัน';
            if (currentId && opts.disabledIds.has(currentId)) return opts.disabledHint;
            if (opts.blockedTargetId !== undefined && (opts.blockedTargetId || null) === (currentId || null)) return opts.blockedHint || 'เลือกโฟลเดอร์อื่น';
            const a = currentId && findAlbum(currentId);
            if (a && !a.has_access) return 'ปลดล็อกโฟลเดอร์นี้ก่อน';
            return '';
        }

        function render() {
            const list = PF.getAlbums();
            if (!loading && currentId && !findAlbum(currentId)) currentId = null;

            const path = currentId ? T.path(list, currentId) : [];
            const crumbs = $('.pf-crumbs');
            crumbs.innerHTML = `<button type="button" data-crumb=""${path.length ? '' : ' class="current"'}><i class="fas fa-house"></i> หน้าหลัก</button>` +
                path.map((a, i) => `<i class="fas fa-chevron-right pf-crumb-sep"></i><button type="button" data-crumb="${esc(a.id)}"${i === path.length - 1 ? ' class="current"' : ''}>${esc(a.name)}</button>`).join('');
            crumbs.scrollLeft = crumbs.scrollWidth;

            const grid = $('.pf-grid');
            if (loading && !list.length) {
                grid.innerHTML = Array.from({ length: 6 }, () =>
                    '<div class="pf-tile pf-skel"><div class="pf-cover"></div><div class="pf-tile-body"><div class="pf-skel-line"></div><div class="pf-skel-line short"></div></div></div>').join('');
            } else {
                const q = query.toLowerCase();
                const items = pinnedFirst(q ? list.filter(a => a.name.toLowerCase().includes(q)) : T.children(list, currentId));
                if (!items.length) {
                    const hint = !q && !blockReason() ? `<small>กด “${esc(opts.confirmText)}” เพื่อเลือกที่นี่</small>` : '';
                    grid.innerHTML = `<div class="pf-empty"><i class="fas fa-folder-open"></i><div>${q ? 'ไม่พบโฟลเดอร์ที่ค้นหา' : 'ไม่มีโฟลเดอร์ย่อยในนี้'}</div>${hint}</div>`;
                } else {
                    grid.innerHTML = items.map(a => {
                        const note = q ? (T.path(list, a.id).slice(0, -1).map(x => x.name).join(' › ') || 'หน้าหลัก') : '';
                        return PF.tileHTML(a, { disabled: opts.disabledIds.has(a.id), note });
                    }).join('');
                    PF.upgradeThumbs(grid);
                }
            }

            const reason = blockReason();
            $('[data-ok]').disabled = !!reason;
            $('.pf-target').innerHTML = reason
                ? `<i class="fas fa-circle-info"></i> ${esc(reason)}`
                : `<i class="fas fa-location-dot"></i> ปลายทาง: <b>${esc(label(currentId))}</b>`;
        }

        async function go(id) {
            const a = id ? findAlbum(id) : null;
            if (a && !a.has_access) {
                if (!(await unlockAlbum(a))) return;
                try { await PF.refresh(true); } catch (e) {}
            }
            currentId = id || null;
            query = '';
            searchInput.value = '';
            render();
            $('.pf-picker-body').scrollTop = 0;
        }

        async function createHere() {
            const here = currentId && findAlbum(currentId);
            if (here && !here.has_access) return;
            const name = await ui().prompt({ title: 'สร้างโฟลเดอร์ใหม่', message: 'ใน ' + label(currentId), placeholder: 'ชื่อโฟลเดอร์', confirmText: 'สร้าง' });
            if (!name || !name.trim()) return;
            try {
                const d = await api('/api/photos/albums', 'POST', { name: name.trim(), parent_id: currentId }, currentId);
                try { await PF.refresh(true); } catch (e) {}
                currentId = d.album.id;
                query = '';
                searchInput.value = '';
                render();
                toast('สร้างโฟลเดอร์แล้ว', 'success');
            } catch (e) { toast(esc(e.message), 'error'); }
        }

        function onKey(e) {
            if (e.key !== 'Escape') return;
            if (document.querySelector('.custom-modal-overlay.show')) return; // a prompt on top handles its own Escape
            e.stopPropagation();
            close(null);
        }
        function close(result) {
            document.removeEventListener('keydown', onKey, true);
            el.classList.remove('show');
            setTimeout(() => el.remove(), 180);
            resolve(result);
        }

        el.addEventListener('click', e => {
            if (e.target === el || e.target.closest('[data-close]')) return close(null);
            const crumb = e.target.closest('[data-crumb]');
            if (crumb) return go(crumb.dataset.crumb);
            if (e.target.closest('[data-ok]')) {
                if (!blockReason()) close({ targetId: currentId, label: label(currentId) });
                return;
            }
            if (e.target.closest('[data-new]')) return createHere();
            const tile = e.target.closest('.pf-tile[data-id]');
            if (!tile) return;
            if (tile.classList.contains('is-disabled')) { toast(esc(opts.disabledHint)); return; }
            go(tile.dataset.id);
        });
        el.addEventListener('keydown', e => {
            const tile = e.target.closest && e.target.closest('.pf-tile[data-id]');
            if (tile && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tile.click(); }
        });
        searchInput.addEventListener('input', () => { query = searchInput.value.trim(); render(); });

        document.addEventListener('keydown', onKey, true);
        requestAnimationFrame(() => el.classList.add('show'));
        render();
        PF.refresh()
            .catch(() => { if (!PF.getAlbums().length) toast('โหลดรายการโฟลเดอร์ไม่สำเร็จ', 'error'); })
            .finally(() => { loading = false; if (el.isConnected) render(); });
    });

    /* ================= Share dialog ================= */
    // Separate wording for a folder link (everything inside, optionally sub-folders) and a file link
    // (that one file only), so it's always clear exactly what a link exposes.
    const SHARE_EXPIRY = [[1, '1 วัน'], [7, '7 วัน'], [30, '30 วัน'], [90, '90 วัน'], [0, 'ไม่หมดอายุ']];
    const thDate = ts => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    PF.shareUrl = id => location.origin + '/s/?t=' + enc(id);

    // Editing a link changes what it allows while keeping the same URL, so a link already sent out keeps
    // working with the new rules. Expiry is optional here: leaving it on "คงเดิม" never restarts the clock.
    PF.openShareEditor = (share, onSaved) => {
        const isAlbum = share.kind === 'album';
        document.querySelectorAll('.pf-share-overlay.is-editor').forEach(n => n.remove());
        const el = document.createElement('div');
        el.className = 'pf-share-overlay is-editor';
        el.innerHTML = `
            <div class="pf-share" role="dialog" aria-modal="true" aria-labelledby="pfShareEditTitle">
                <div class="pf-share-head">
                    <div class="pf-share-ico ${isAlbum ? 'is-album' : 'is-file'}"><i class="fas fa-sliders"></i></div>
                    <div class="pf-share-heading"><div class="pf-share-title" id="pfShareEditTitle">แก้ไขสิทธิ์ของลิงก์</div><div class="pf-share-name">${esc(share.target ? share.target.name : 'ลิงก์นี้')}</div></div>
                    <button type="button" class="pf-icon-btn pf-dark" data-close aria-label="ปิด"><i class="fas fa-xmark"></i></button>
                </div>
                <div class="pf-share-body">
                    <div class="pf-scope"><i class="fas fa-link"></i><div><b>ลิงก์เดิมไม่เปลี่ยน</b><div class="pf-scope-text">${esc(PF.shareUrl(share.id).replace(/^https?:\/\//, ''))}</div><small>คนที่ได้ลิงก์ไปแล้วจะใช้สิทธิ์ใหม่ทันที</small></div></div>
                    ${isAlbum ? `<label class="pf-switch-row"><span><b>รวมโฟลเดอร์ย่อย</b><small>โฟลเดอร์ย่อยที่ล็อกไว้จะยังล็อกอยู่</small></span><input type="checkbox" data-opt="sub"${share.include_subfolders ? ' checked' : ''}><i class="pf-switch"></i></label>` : ''}
                    <label class="pf-switch-row"><span><b>อนุญาตให้ดาวน์โหลด</b><small>ถ้าปิด จะดูได้อย่างเดียวที่ขนาดมาตรฐาน</small></span><input type="checkbox" data-opt="dl"${share.allow_download ? ' checked' : ''}><i class="pf-switch"></i></label>
                    <div class="pf-field-label">อายุลิงก์${share.expired ? ' (ตอนนี้หมดอายุแล้ว)' : ''}</div>
                    <div class="pf-chips">
                        <button type="button" class="pf-chip active" data-days="keep">คงเดิม</button>
                        ${SHARE_EXPIRY.map(([d, l]) => `<button type="button" class="pf-chip" data-days="${d}">${l}</button>`).join('')}
                    </div>
                    <div class="pf-share-hint">เลือกช่วงเวลาใหม่ = เริ่มนับใหม่จากวันนี้</div>
                    <button type="button" class="pf-btn pf-btn-primary pf-share-create" data-save><i class="fas fa-check"></i> บันทึกการแก้ไข</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        let days = 'keep';
        function close() {
            document.removeEventListener('keydown', onKey, true);
            el.remove();
        }
        function onKey(e) {
            if (e.key === 'Escape' && !document.querySelector('.custom-modal-overlay.show')) { e.stopPropagation(); close(); }
        }
        document.addEventListener('keydown', onKey, true);
        el.addEventListener('click', async e => {
            if (e.target === el || e.target.closest('[data-close]')) return close();
            const chip = e.target.closest('[data-days]');
            if (chip) {
                days = chip.dataset.days;
                el.querySelectorAll('[data-days]').forEach(c => c.classList.toggle('active', c === chip));
                return;
            }
            if (!e.target.closest('[data-save]')) return;
            const btn = el.querySelector('[data-save]');
            btn.disabled = true;
            const body = { allowDownload: el.querySelector('[data-opt="dl"]').checked };
            if (isAlbum) body.includeSubfolders = el.querySelector('[data-opt="sub"]').checked;
            if (days !== 'keep') body.expiresInDays = Number(days);
            try {
                const d = await api('/api/photos/shares/' + enc(share.id), 'PATCH', body);
                toast('บันทึกสิทธิ์ใหม่แล้ว', 'success');
                close();
                if (onSaved) onSaved(d.share);
            } catch (err) {
                toast(esc(err.message), 'error');
                btn.disabled = false;
            }
        });
    };

    PF.openShareDialog = opts => {
        const isAlbum = opts.kind === 'album';
        const old = document.querySelector('.pf-share-overlay');
        if (old) old.remove();
        const el = document.createElement('div');
        el.className = 'pf-share-overlay';
        el.innerHTML = `
            <div class="pf-share" role="dialog" aria-modal="true" aria-labelledby="pfShareTitle">
                <div class="pf-share-head">
                    <div class="pf-share-ico ${isAlbum ? 'is-album' : 'is-file'}"><i class="fas ${isAlbum ? 'fa-folder' : 'fa-image'}"></i></div>
                    <div class="pf-share-heading"><div class="pf-share-title" id="pfShareTitle">${isAlbum ? 'แชร์โฟลเดอร์' : 'แชร์ไฟล์'}</div><div class="pf-share-name"></div></div>
                    <button type="button" class="pf-icon-btn pf-dark" data-close aria-label="ปิด"><i class="fas fa-xmark"></i></button>
                </div>
                <div class="pf-share-body">
                    <div class="pf-scope"><i class="fas fa-eye"></i><div><b>คนที่มีลิงก์จะเห็น</b><div class="pf-scope-text"></div><small>ไม่ต้องใส่รหัสเว็บ และมองไม่เห็นอัลบั้มอื่น</small></div></div>
                    ${opts.locked ? '<div class="pf-share-warn"><i class="fas fa-lock"></i> อัลบั้มนี้ถูกล็อก คนที่มีลิงก์จะดูได้โดยไม่ต้องใส่รหัสอัลบั้ม</div>' : ''}
                    ${isAlbum ? '<label class="pf-switch-row"><span><b>รวมโฟลเดอร์ย่อย</b><small>โฟลเดอร์ย่อยที่ล็อกไว้จะยังล็อกอยู่</small></span><input type="checkbox" data-opt="sub" checked><i class="pf-switch"></i></label>' : ''}
                    <label class="pf-switch-row"><span><b>อนุญาตให้ดาวน์โหลด</b><small>ถ้าปิด จะดูได้อย่างเดียวที่ขนาดมาตรฐาน</small></span><input type="checkbox" data-opt="dl" checked><i class="pf-switch"></i></label>
                    <div class="pf-field-label">ลิงก์หมดอายุใน</div>
                    <div class="pf-chips">${SHARE_EXPIRY.map(([d, l]) => `<button type="button" class="pf-chip${d === 7 ? ' active' : ''}" data-days="${d}">${l}</button>`).join('')}</div>
                    <button type="button" class="pf-btn pf-btn-primary pf-share-create" data-create><i class="fas fa-link"></i> สร้างลิงก์</button>
                    <div class="pf-links-head">ลิงก์ที่ใช้งานอยู่</div>
                    <div class="pf-links"><div class="pf-links-empty">กำลังโหลด…</div></div>
                </div>
            </div>`;
        document.body.appendChild(el);
        const $ = sel => el.querySelector(sel);
        $('.pf-share-name').textContent = opts.name || '';
        let days = 7;
        let freshId = null;

        const updateScope = () => {
            const sub = isAlbum && $('[data-opt="sub"]').checked;
            $('.pf-scope-text').textContent = isAlbum
                ? (sub ? `ทุกไฟล์ใน "${opts.name}" รวมโฟลเดอร์ย่อย` : `เฉพาะไฟล์ใน "${opts.name}" (ไม่รวมโฟลเดอร์ย่อย)`)
                : `เฉพาะไฟล์ "${opts.name}" ไฟล์เดียว`;
        };
        updateScope();

        let linkList = [];
        function renderLinks(list) {
            linkList = list;
            const box = $('.pf-links');
            if (!list.length) { box.innerHTML = '<div class="pf-links-empty">ยังไม่มีลิงก์</div>'; return; }
            box.innerHTML = list.map(sh => `
                <div class="pf-link${sh.id === freshId ? ' is-new' : ''}${sh.expired ? ' is-expired' : ''}" data-share="${esc(sh.id)}">
                    <div class="pf-link-main">
                        <div class="pf-link-url">${esc(PF.shareUrl(sh.id).replace(/^https?:\/\//, ''))}</div>
                        <div class="pf-link-meta">
                            <span>${sh.expired ? 'หมดอายุแล้ว' : sh.expires_at ? 'ถึง ' + thDate(sh.expires_at) : 'ไม่หมดอายุ'}</span>
                            <span>${sh.allow_download ? 'ดาวน์โหลดได้' : 'ดูอย่างเดียว'}</span>
                            ${sh.kind === 'album' ? `<span>${sh.include_subfolders ? 'รวมโฟลเดอร์ย่อย' : 'เฉพาะโฟลเดอร์นี้'}</span>` : ''}
                            <span><i class="fas fa-eye"></i> ${fmt(sh.view_count)}</span>
                        </div>
                    </div>
                    <button type="button" class="pf-mini" data-copy title="คัดลอกลิงก์" aria-label="คัดลอกลิงก์"><i class="far fa-copy"></i></button>
                    <button type="button" class="pf-mini" data-edit title="แก้ไขสิทธิ์" aria-label="แก้ไขสิทธิ์"><i class="fas fa-sliders"></i></button>
                    <button type="button" class="pf-mini pf-danger" data-revoke title="ยกเลิกลิงก์" aria-label="ยกเลิกลิงก์"><i class="fas fa-link-slash"></i></button>
                </div>`).join('');
        }
        async function loadLinks() {
            try {
                const d = await api('/api/photos/shares?targetId=' + enc(opts.id), 'GET');
                renderLinks(d.shares || []);
            } catch (e) { $('.pf-links').innerHTML = `<div class="pf-links-empty">${esc(e.message)}</div>`; }
        }

        function close() {
            document.removeEventListener('keydown', onKey, true);
            el.remove();
        }
        function onKey(e) {
            if (e.key === 'Escape' && !document.querySelector('.custom-modal-overlay.show')) { e.stopPropagation(); close(); }
        }
        document.addEventListener('keydown', onKey, true);

        el.addEventListener('change', e => { if (e.target.matches('[data-opt="sub"]')) updateScope(); });
        el.addEventListener('click', async e => {
            if (e.target === el || e.target.closest('[data-close]')) return close();
            const chip = e.target.closest('[data-days]');
            if (chip) {
                days = +chip.dataset.days;
                el.querySelectorAll('[data-days]').forEach(c => c.classList.toggle('active', c === chip));
                return;
            }
            if (e.target.closest('[data-create]')) {
                const btn = $('[data-create]');
                btn.disabled = true;
                try {
                    const d = await api('/api/photos/shares', 'POST', {
                        kind: opts.kind, targetId: opts.id, expiresInDays: days,
                        allowDownload: $('[data-opt="dl"]').checked,
                        includeSubfolders: isAlbum ? $('[data-opt="sub"]').checked : false
                    });
                    freshId = d.share.id;
                    const copied = await copyText(PF.shareUrl(freshId));
                    toast(copied ? 'สร้างลิงก์และคัดลอกแล้ว' : 'สร้างลิงก์แล้ว', 'success');
                    await loadLinks();
                } catch (err) { toast(esc(err.message), 'error'); }
                btn.disabled = false;
                return;
            }
            const row = e.target.closest('[data-share]');
            if (!row) return;
            const id = row.dataset.share;
            if (e.target.closest('[data-copy]')) {
                const ok = await copyText(PF.shareUrl(id));
                toast(ok ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกไม่สำเร็จ', ok ? 'success' : 'error');
            } else if (e.target.closest('[data-edit]')) {
                const share = linkList.find(sh => sh.id === id);
                if (share) PF.openShareEditor(share, () => loadLinks());
            } else if (e.target.closest('[data-revoke]')) {
                const yes = await ui().confirm({ title: 'ยกเลิกลิงก์นี้?', message: 'คนที่มีลิงก์นี้จะเปิดไม่ได้อีก', isDanger: true, confirmText: 'ยกเลิกลิงก์', cancelText: 'ย้อนกลับ', icon: 'fas fa-link-slash' });
                if (!yes) return;
                try { await api('/api/photos/shares/' + enc(id), 'DELETE'); toast('ยกเลิกลิงก์แล้ว', 'success'); loadLinks(); }
                catch (err) { toast(esc(err.message), 'error'); }
            }
        });
        loadLinks();
    };

    /* ================= Drag & drop (desktop) ================= */
    // Drag album tiles or photos onto a folder tile / breadcrumb to move them. Touch devices use the menu.
    const DND_TYPE = 'application/x-next9-photos';
    const canDrag = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let dragPayload = null;
    let lastUndo = null;

    PF.dnd = {
        type: DND_TYPE,
        // payload: { type: 'albums' | 'images', ids: [...], label, sourceAlbumId }
        begin(e, payload) {
            dragPayload = payload;
            try {
                e.dataTransfer.setData(DND_TYPE, JSON.stringify(payload));
                e.dataTransfer.setData('text/plain', payload.label || '');
                e.dataTransfer.effectAllowed = 'move';
                const ghost = document.createElement('div');
                ghost.className = 'pf-drag-ghost';
                ghost.innerHTML = `<i class="fas ${payload.type === 'albums' ? 'fa-folder' : 'fa-images'}"></i> ${esc(payload.label || fmt(payload.ids.length) + ' รายการ')}`;
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 18, 18);
                setTimeout(() => ghost.remove(), 0);
            } catch (err) {}
            document.documentElement.classList.add('pf-is-dragging');
        },
        end() {
            dragPayload = null;
            document.documentElement.classList.remove('pf-is-dragging');
            document.querySelectorAll('.pf-drop-over, .pf-dragging').forEach(n => n.classList.remove('pf-drop-over', 'pf-dragging'));
        },
        active: () => dragPayload,
        isInternal: e => !!(e && e.dataTransfer && [...e.dataTransfer.types].includes(DND_TYPE))
    };
    document.addEventListener('dragend', () => PF.dnd.end());

    PF.makeAlbumsDraggable = (container, opts) => {
        if (!canDrag()) return;
        const mark = () => container.querySelectorAll(opts.selector).forEach(t => {
            if (!t.classList.contains('pf-skel') && t.getAttribute('draggable') !== 'true') t.setAttribute('draggable', 'true');
        });
        mark();
        new MutationObserver(mark).observe(container, { childList: true });
        container.addEventListener('dragstart', e => {
            const tile = e.target.closest && e.target.closest(opts.selector);
            if (!tile) return;
            const a = opts.getAlbum(tile.dataset.id);
            if (!a || !a.has_access) { e.preventDefault(); return; }
            tile.classList.add('pf-dragging');
            PF.dnd.begin(e, { type: 'albums', ids: [a.id], label: a.name, albums: [{ id: a.id, parent_id: a.parent_id || null }] });
        });
    };

    // opts: { selector, targetOf(el) -> { id (album id, null = top level), name } | null, onChanged(change) }
    PF.enableDropTargets = (container, opts) => {
        if (!canDrag()) return;
        const hitFor = e => {
            const p = dragPayload;
            if (!p) return null;
            const el = e.target.closest && e.target.closest(opts.selector);
            if (!el || !container.contains(el)) return null;
            const t = opts.targetOf(el);
            if (!t) return null;
            if (!t.id && p.type !== 'albums') return null; // photos always live inside an album
            if (p.type === 'albums') {
                const list = PF.getAlbums();
                if (p.ids.some(id => id === t.id || (t.id && list.length && T.descendants(list, id).has(t.id)))) return null;
                if (p.albums && p.albums.every(a => (a.parent_id || null) === (t.id || null))) return null;
            } else if (p.sourceAlbumId === t.id) return null;
            return { el, t };
        };
        container.addEventListener('dragover', e => {
            const hit = hitFor(e);
            if (!hit) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            container.querySelectorAll('.pf-drop-over').forEach(n => { if (n !== hit.el) n.classList.remove('pf-drop-over'); });
            hit.el.classList.add('pf-drop-over');
        });
        container.addEventListener('dragleave', e => {
            const el = e.target.closest && e.target.closest(opts.selector);
            if (el && !el.contains(e.relatedTarget)) el.classList.remove('pf-drop-over');
        });
        container.addEventListener('drop', e => {
            const hit = hitFor(e);
            if (!hit) return;
            e.preventDefault();
            e.stopPropagation();
            const payload = dragPayload;
            PF.dnd.end();
            PF.moveInto(payload, hit.t, opts.onChanged);
        });
    };

    PF.moveInto = async (payload, target, onChanged) => {
        // The album page may not have fetched the folder list yet; it's needed to spot locked targets.
        if (target.id && !PF.getAlbums().some(a => a.id === target.id)) { try { await PF.refresh(); } catch (e) {} }
        const list = PF.getAlbums();
        const targetAlbum = target.id ? list.find(a => a.id === target.id) : null;
        if (targetAlbum && !targetAlbum.has_access && !(await unlockAlbum(targetAlbum))) return;
        try {
            if (payload.type === 'albums') {
                const previous = payload.ids.map(id => {
                    const known = list.find(a => a.id === id) || (payload.albums || []).find(a => a.id === id);
                    return { id, parent_id: known ? (known.parent_id || null) : undefined };
                });
                for (const id of payload.ids) await api('/api/photos/albums/' + enc(id), 'PUT', { parent_id: target.id || null }, id);
                lastUndo = previous.every(p => p.parent_id !== undefined)
                    ? async () => { for (const p of previous) await api('/api/photos/albums/' + enc(p.id), 'PUT', { parent_id: p.parent_id }, p.id); }
                    : null;
            } else {
                await api('/api/photos/images/move', 'POST', { ids: payload.ids, targetAlbumId: target.id }, payload.sourceAlbumId);
                lastUndo = payload.sourceAlbumId
                    ? () => api('/api/photos/images/move', 'POST', { ids: payload.ids, targetAlbumId: payload.sourceAlbumId }, target.id)
                    : null;
            }
            PF._undoChanged = onChanged;
            const what = payload.type === 'albums' ? '"' + (payload.label || 'โฟลเดอร์') + '"' : fmt(payload.ids.length) + ' รายการ';
            toast('ย้าย ' + esc(what) + ' ไปที่ ' + esc(target.name || 'หน้าหลัก') + ' แล้ว' +
                (lastUndo ? ' <button type="button" class="pf-undo" onclick="PhotosFolders.undoLast()">เลิกทำ</button>' : ''), 'success');
            if (onChanged) onChanged({ kind: 'dnd-move', type: payload.type, ids: payload.ids, targetId: target.id || null });
        } catch (e) { toast(esc(e.message), 'error'); }
    };

    PF.undoLast = async () => {
        const undo = lastUndo;
        lastUndo = null;
        if (!undo) return;
        try {
            await undo();
            toast('เลิกทำแล้ว', 'success');
            if (PF._undoChanged) PF._undoChanged({ kind: 'undo' });
        } catch (e) { toast(esc(e.message), 'error'); }
    };

    /* ================= Styles ================= */
    const css = `
.pf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.pf-tile{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:transform .18s ease,box-shadow .18s ease,border-color .18s;outline:none;text-align:left}
.pf-tile:hover{box-shadow:0 8px 22px rgba(0,0,0,.10);border-color:#d1d5db;transform:translateY(-2px)}
.pf-tile:focus-visible{box-shadow:0 0 0 3px rgba(176,9,9,.35)}
.pf-tile.is-pinned{border-color:rgba(176,9,9,.4)}
.pf-tile.is-disabled{opacity:.45;cursor:not-allowed;transform:none!important;box-shadow:none!important}
.pf-tile.pf-pressing,.pf-pressing{transform:scale(.96)!important;transition:transform .45s ease!important}
.pf-cover{position:relative;aspect-ratio:16/10;background:#e5e7eb;overflow:hidden}
.pf-cover img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;-webkit-user-drag:none}
.pf-cover-empty,.pf-cover-locked{display:grid;place-items:center;font-size:1.7rem}
.pf-cover-empty{background:linear-gradient(135deg,#fdeaea,#f8d3d3);color:#b00909}
.pf-cover-locked{background:#374151;color:#f59e0b}
.pf-tile-body{padding:9px 11px 10px;min-width:0}
.pf-tile-name{display:flex;align-items:center;gap:6px;font-weight:600;font-size:.88rem;color:#111827;min-width:0;line-height:1.35}
.pf-tile-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-pin{color:#b00909;font-size:.7rem;transform:rotate(35deg);flex-shrink:0}
.pf-lock{color:#f59e0b;font-size:.7rem;flex-shrink:0}
.pf-tile-meta{font-size:.74rem;color:#6b7280;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-more{position:absolute;top:6px;right:6px;width:32px;height:32px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;display:grid;place-items:center;opacity:0;transition:opacity .15s,background .15s}
.pf-more:hover{background:rgba(0,0,0,.75)}
.pf-tile:hover .pf-more,.pf-tile:focus-within .pf-more{opacity:1}
@media (hover:none){.pf-more{opacity:1}}
.pf-skel{cursor:default;pointer-events:none}
.pf-skel .pf-cover,.pf-skel-line{background:linear-gradient(90deg,#eceef1 25%,#f6f7f9 37%,#eceef1 63%);background-size:400% 100%;animation:pfShimmer 1.3s ease infinite}
.pf-skel-line{height:10px;border-radius:5px;margin:5px 0}
.pf-skel-line.short{width:55%}
@keyframes pfShimmer{0%{background-position:100% 0}100%{background-position:0 0}}

.pf-menu-backdrop{position:fixed;inset:0;z-index:99980;display:none}
.pf-menu-backdrop.show{display:block}
.pf-menu-backdrop.dim{background:rgba(15,23,42,.45)}
.pf-menu{position:fixed;z-index:99981;min-width:230px;max-width:290px;background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.05);padding:6px;display:none;font-family:'Prompt',sans-serif}
.pf-menu.show{display:block;animation:pfPop .14s ease-out}
@keyframes pfPop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
/* Never taller than the screen: a long menu scrolls inside itself instead of running off the edge. */
.pf-menu{max-height:min(70vh,430px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
/* The thumb sits inside a transparent border so it never paints over the menu's rounded corner. */
.pf-menu,.pf-picker-body,.pf-links{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.2) transparent}
.pf-menu::-webkit-scrollbar,.pf-picker-body::-webkit-scrollbar,.pf-links::-webkit-scrollbar,.pf-share-body::-webkit-scrollbar{width:9px}
.pf-menu::-webkit-scrollbar-track,.pf-picker-body::-webkit-scrollbar-track,.pf-links::-webkit-scrollbar-track,.pf-share-body::-webkit-scrollbar-track{background:transparent;margin:6px 0}
.pf-menu::-webkit-scrollbar-thumb,.pf-picker-body::-webkit-scrollbar-thumb,.pf-links::-webkit-scrollbar-thumb,.pf-share-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.2);border:3px solid transparent;background-clip:padding-box;border-radius:999px}
.pf-menu::-webkit-scrollbar-thumb:hover,.pf-picker-body::-webkit-scrollbar-thumb:hover,.pf-links::-webkit-scrollbar-thumb:hover,.pf-share-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.34);background-clip:padding-box}
.pf-menu.closing{animation:pfFadeOut .17s ease-in forwards}
@keyframes pfFadeOut{to{opacity:0;transform:scale(.97)}}
.pf-menu-backdrop.closing{opacity:0;transition:opacity .17s ease-in}
@media (prefers-reduced-motion:reduce){.pf-menu.closing,.pf-menu.sheet.closing{animation-duration:.01s}}
.pf-menu-head{display:none}
.pf-menu button{display:flex;align-items:center;gap:12px;width:100%;min-height:40px;padding:8px 12px;border:0;border-radius:9px;background:none;font:inherit;font-size:.9rem;color:#1f2937;cursor:pointer;text-align:left}
.pf-menu button i{width:18px;text-align:center;color:#6b7280}
.pf-menu button:hover,.pf-menu button:focus-visible{background:#f3f4f6;outline:none}
.pf-menu button.danger,.pf-menu button.danger i{color:#dc2626}
.pf-menu-sep{height:1px;background:#e5e7eb;margin:5px 8px}
.pf-menu.sheet{left:0!important;right:0;bottom:0;top:auto!important;min-width:0;max-width:none;border-radius:18px 18px 0 0;padding:6px 10px calc(12px + env(safe-area-inset-bottom))}
.pf-menu.sheet.show{animation:pfSheet .22s cubic-bezier(.2,.8,.2,1)}
@keyframes pfSheet{from{transform:translateY(100%)}to{transform:none}}
.pf-menu.sheet{max-height:min(72vh,540px)}
.pf-menu.sheet.closing{animation:pfSheetOut .18s ease-in forwards}
@keyframes pfSheetOut{to{transform:translateY(100%);opacity:.5}}
.pf-menu.sheet button{min-height:50px;font-size:.95rem}
.pf-menu.sheet .pf-menu-head{display:block;padding:4px 8px 10px;border-bottom:1px solid #f0f0f0;margin-bottom:4px}
.pf-menu-grip{width:40px;height:4px;border-radius:2px;background:#d1d5db;margin:2px auto 10px}
.pf-menu-title{font-weight:600;font-size:.98rem;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-menu-sub{font-size:.78rem;color:#6b7280}

.pf-picker-overlay{position:fixed;inset:0;z-index:99990;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .18s;font-family:'Prompt',sans-serif}
.pf-picker-overlay.show{opacity:1}
.pf-picker{width:min(900px,100%);height:min(660px,100%);background:#f5f5f5;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35);transform:translateY(12px) scale(.98);transition:transform .2s ease}
.pf-picker-overlay.show .pf-picker{transform:none}
.pf-picker-head{background:linear-gradient(135deg,#b00909 0%,#9a0707 50%,#7a0606 100%);color:#fff;padding:14px 18px;display:flex;flex-direction:column;gap:10px}
.pf-picker-top{display:flex;align-items:center;gap:10px}
.pf-picker-title{flex:1;min-width:0;font-weight:600;font-size:1.02rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-icon-btn{width:38px;height:38px;flex-shrink:0;border-radius:50%;border:0;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:grid;place-items:center;font-size:1rem}
.pf-icon-btn:hover{background:rgba(255,255,255,.28)}
.pf-crumbs{display:flex;align-items:center;gap:4px;overflow-x:auto;scrollbar-width:none;white-space:nowrap}
.pf-crumbs::-webkit-scrollbar{display:none}
.pf-crumbs button{border:0;background:rgba(255,255,255,.12);color:rgba(255,255,255,.88);font:inherit;font-size:.82rem;padding:5px 10px;border-radius:8px;cursor:pointer;flex-shrink:0;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.pf-crumbs button:hover{background:rgba(255,255,255,.24);color:#fff}
.pf-crumbs button.current{background:#fff;color:#b00909;font-weight:600}
.pf-crumb-sep{font-size:.6rem;color:rgba(255,255,255,.55)}
.pf-picker-tools{display:flex;gap:8px}
.pf-search{flex:1;position:relative;display:flex}
.pf-search i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,.65);font-size:.8rem;pointer-events:none}
.pf-search input{flex:1;min-width:0;height:40px;border:0;border-radius:10px;background:rgba(255,255,255,.16);color:#fff;font:inherit;font-size:.88rem;padding:0 12px 0 34px;outline:none}
.pf-search input::placeholder{color:rgba(255,255,255,.7)}
.pf-search input:focus{background:rgba(255,255,255,.24)}
.pf-btn{height:40px;padding:0 16px;border-radius:10px;border:0;font:inherit;font-size:.88rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap}
.pf-btn-glass{background:rgba(255,255,255,.16);color:#fff}
.pf-btn-glass:hover{background:rgba(255,255,255,.28)}
.pf-btn-ghost{background:#f3f4f6;color:#374151}
.pf-btn-ghost:hover{background:#e5e7eb}
.pf-btn-primary{background:#b00909;color:#fff}
.pf-btn-primary:hover{background:#930707}
.pf-btn-primary:disabled{background:#d1d5db;color:#fff;cursor:not-allowed}
.pf-picker-body{flex:1;overflow-y:auto;padding:16px 18px;overscroll-behavior:contain}
.pf-empty{grid-column:1/-1;text-align:center;color:#6b7280;padding:48px 12px;display:flex;flex-direction:column;align-items:center;gap:8px}
.pf-empty i{font-size:2.2rem;color:#d1d5db}
.pf-empty small{color:#9ca3af}
.pf-picker-foot{display:flex;align-items:center;gap:12px;padding:12px 18px calc(12px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #e5e7eb}
.pf-target{flex:1;min-width:0;font-size:.85rem;color:#4b5563;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-target i{color:#b00909;margin-right:4px}
.pf-actions{display:flex;gap:8px}
@media (max-width:640px){
 .pf-picker-overlay{padding:0;align-items:flex-end}
 .pf-picker{height:92vh;height:92dvh;border-radius:18px 18px 0 0}
 .pf-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
 .pf-picker-tools .pf-btn span{display:none}
 .pf-picker-foot{flex-direction:column;align-items:stretch;gap:10px}
 .pf-actions .pf-btn{flex:1}
}
.pf-dark{background:#f3f4f6!important;color:#374151!important}
.pf-dark:hover{background:#e5e7eb!important}
.pf-share-overlay{position:fixed;inset:0;z-index:99985;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Prompt',sans-serif;animation:pfFade .15s ease-out}
@keyframes pfFade{from{opacity:0}to{opacity:1}}
.pf-share{width:min(520px,100%);max-height:min(720px,100%);background:#fff;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.pf-share-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #f0f0f0}
.pf-share-ico{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:1.2rem;flex-shrink:0}
.pf-share-ico.is-album{background:#fdeaea;color:#b00909}
.pf-share-ico.is-file{background:#e0f2fe;color:#0369a1}
.pf-share-heading{flex:1;min-width:0}
.pf-share-title{font-weight:600;font-size:1.02rem;color:#111827}
.pf-share-name{font-size:.82rem;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-share-body{padding:16px 18px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.pf-scope{display:flex;gap:12px;padding:12px 14px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;font-size:.86rem;color:#374151}
.pf-scope>i{color:#b00909;margin-top:3px}
.pf-scope b{display:block;font-weight:600}
.pf-scope small{display:block;color:#9ca3af;margin-top:2px}
.pf-share-warn{padding:10px 12px;border-radius:10px;background:#fffbeb;color:#92400e;font-size:.82rem}
.pf-switch-row{display:flex;align-items:center;gap:12px;cursor:pointer}
.pf-switch-row span{flex:1;font-size:.88rem;color:#111827}
.pf-switch-row small{display:block;font-size:.74rem;color:#9ca3af}
.pf-switch-row input{position:absolute;opacity:0;pointer-events:none}
.pf-switch{width:42px;height:24px;border-radius:12px;background:#d1d5db;position:relative;flex-shrink:0;transition:background .2s}
.pf-switch::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}
.pf-switch-row input:checked+.pf-switch{background:#b00909}
.pf-switch-row input:checked+.pf-switch::after{transform:translateX(18px)}
.pf-switch-row input:focus-visible+.pf-switch{box-shadow:0 0 0 3px rgba(176,9,9,.3)}
.pf-field-label{font-size:.84rem;font-weight:600;color:#374151;margin-top:4px}
.pf-share-hint{font-size:.76rem;color:#6b7280;margin-top:-4px}
.pf-chips{display:flex;flex-wrap:wrap;gap:6px}
.pf-chip{height:34px;padding:0 12px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;font:inherit;font-size:.82rem;color:#374151;cursor:pointer}
.pf-chip.active{background:#b00909;border-color:#b00909;color:#fff}
.pf-share-create{height:44px;margin-top:4px}
.pf-links-head{font-size:.84rem;font-weight:600;color:#374151;margin-top:6px;padding-top:12px;border-top:1px solid #f0f0f0}
.pf-links{display:flex;flex-direction:column;gap:8px}
.pf-links-empty{font-size:.84rem;color:#9ca3af;text-align:center;padding:10px}
.pf-link{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px}
.pf-link.is-new{border-color:#b00909;background:#fff7f7}
.pf-link.is-expired{opacity:.55}
.pf-link-main{flex:1;min-width:0}
.pf-link-url{font-size:.84rem;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,monospace}
.pf-link-meta{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:.72rem;color:#6b7280;margin-top:2px}
.pf-mini{width:36px;height:36px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;color:#4b5563;cursor:pointer;flex-shrink:0}
.pf-mini:hover{background:#f3f4f6}
.pf-mini.pf-danger:hover{color:#dc2626;border-color:#fecaca;background:#fef2f2}
@media (max-width:640px){.pf-share-overlay{padding:0;align-items:flex-end}.pf-share{border-radius:18px 18px 0 0;max-height:92vh}}
.pf-drag-ghost{position:fixed;top:-100px;left:-100px;padding:8px 14px;border-radius:999px;background:#b00909;color:#fff;font:600 .85rem 'Prompt',sans-serif;white-space:nowrap;box-shadow:0 8px 20px rgba(0,0,0,.25)}
.pf-dragging{opacity:.45}
.pf-drop-over{outline:3px solid #b00909!important;outline-offset:2px;background-color:rgba(176,9,9,.06)!important;transform:scale(1.02)}
.pf-undo{margin-left:10px;padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.6);background:transparent;color:#fff;font:600 .82rem 'Prompt',sans-serif;cursor:pointer}
.pf-undo:hover{background:rgba(255,255,255,.18)}`;
    const style = document.createElement('style');
    style.id = 'photos-folders-css';
    style.textContent = css;
    document.head.appendChild(style);

    // Pages bind their grids as soon as this fires (it can run before DOMContentLoaded).
    window.dispatchEvent(new Event('photos-folders-ready'));
})();
