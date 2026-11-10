/* Lightweight full-screen photo/video viewer shared by the /photos "รูปภาพ" tab and the public share page.
   PhotosViewer.open({
       items, index,
       src(item, variant)      -> URL for 'thumb' | 'sd' | 'medium' | 'original'
       caption(item)           -> short text under the counter (optional)
       downloadUrl(item)       -> URL, or null to hide the download button (optional)
       actions: [{ icon, label, run(item) }]  extra top-bar buttons (optional)
       loadMore()              -> Promise<array of more items | null> near the end (optional)
   }) */
(function () {
    'use strict';
    if (window.PhotosViewer) return;
    const V = window.PhotosViewer = {};

    let root = null, stage = null, state = null;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function build() {
        const style = document.createElement('style');
        style.textContent = `
.pv{position:fixed;inset:0;z-index:99970;background:#000;display:none;flex-direction:column;font-family:'Prompt',sans-serif;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none}
.pv.show{display:flex;animation:pvIn .18s ease-out}
@keyframes pvIn{from{opacity:0}to{opacity:1}}
.pv-top{position:absolute;left:0;right:0;top:0;z-index:3;display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 12px 24px;background:linear-gradient(rgba(0,0,0,.65),transparent);transition:opacity .2s}
.pv.ui-hidden .pv-top,.pv.ui-hidden .pv-nav{opacity:0;pointer-events:none}
.pv-btn{width:42px;height:42px;flex-shrink:0;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:1.05rem;cursor:pointer;display:grid;place-items:center}
.pv-btn:hover{background:rgba(255,255,255,.24)}
.pv-info{flex:1;min-width:0}
.pv-count{font-size:.9rem;font-weight:600}
.pv-caption{font-size:.76rem;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-stage{position:relative;flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center}
.pv-media{max-width:100%;max-height:100%;object-fit:contain;transition:transform .2s ease;will-change:transform}
.pv-media.dragging{transition:none}
.pv-nav{position:absolute;top:50%;z-index:3;transform:translateY(-50%);width:48px;height:48px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:1.1rem;cursor:pointer;transition:opacity .2s}
.pv-nav:hover{background:rgba(255,255,255,.26)}
.pv-prev{left:14px}.pv-next{right:14px}
.pv-spinner{position:absolute;inset:auto;font-size:1.6rem;opacity:.6}
@media (hover:none){.pv-nav{display:none}}`;
        document.head.appendChild(style);
        root = document.createElement('div');
        root.className = 'pv';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.innerHTML = `
            <div class="pv-top">
                <button class="pv-btn" data-pv="close" aria-label="ปิด"><i class="fas fa-xmark"></i></button>
                <div class="pv-info"><div class="pv-count"></div><div class="pv-caption"></div></div>
                <div class="pv-actions" style="display:flex;gap:8px"></div>
            </div>
            <div class="pv-stage"></div>
            <button class="pv-nav pv-prev" data-pv="prev" aria-label="ก่อนหน้า"><i class="fas fa-chevron-left"></i></button>
            <button class="pv-nav pv-next" data-pv="next" aria-label="ถัดไป"><i class="fas fa-chevron-right"></i></button>`;
        document.body.appendChild(root);
        stage = root.querySelector('.pv-stage');

        root.addEventListener('click', e => {
            const b = e.target.closest('[data-pv]');
            if (b) {
                const act = b.dataset.pv;
                if (act === 'close') V.close();
                else if (act === 'prev') go(-1);
                else if (act === 'next') go(1);
                else if (act.startsWith('action:')) {
                    const a = state && state.opts.actions[+act.slice(7)];
                    if (a) a.run(state.items[state.index]);
                } else if (act === 'download') {
                    const url = state.opts.downloadUrl(state.items[state.index]);
                    if (url) { const link = document.createElement('a'); link.href = url; link.download = ''; document.body.appendChild(link); link.click(); link.remove(); }
                }
            }
        });
        document.addEventListener('keydown', e => {
            if (!state) return;
            if (e.key === 'Escape') V.close();
            else if (e.key === 'ArrowLeft') go(-1);
            else if (e.key === 'ArrowRight') go(1);
        });
        window.addEventListener('popstate', () => { if (state && state.pushed) { state.pushed = false; V.close(true); } });
        bindGestures();
    }

    // Swipe left/right to change, swipe down to close, tap to toggle the bars, double-tap to zoom 2x.
    function bindGestures() {
        let start = null, lastTap = 0;
        stage.addEventListener('pointerdown', e => {
            const media = stage.querySelector('.pv-media');
            start = { x: e.clientX, y: e.clientY, t: Date.now(), media, zoomX: state ? state.panX : 0, zoomY: state ? state.panY : 0 };
            if (media && media.tagName !== 'VIDEO') media.classList.add('dragging');
        });
        stage.addEventListener('pointermove', e => {
            if (!start || !start.media || start.media.tagName === 'VIDEO') return;
            const dx = e.clientX - start.x, dy = e.clientY - start.y;
            if (state.zoom > 1) {
                state.panX = start.zoomX + dx;
                state.panY = start.zoomY + dy;
            } else {
                state.panX = dx;
                state.panY = Math.max(0, dy);
            }
            applyTransform();
        });
        const end = e => {
            if (!start) return;
            const s = start;
            start = null;
            if (s.media) s.media.classList.remove('dragging');
            const dx = e.clientX - s.x, dy = e.clientY - s.y;
            const moved = Math.hypot(dx, dy) > 12;
            if (state && state.zoom === 1) {
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { resetZoom(); go(dx < 0 ? 1 : -1); return; }
                if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { V.close(); return; }
                state.panX = 0; state.panY = 0; applyTransform();
            }
            if (!moved && e.type === 'pointerup' && !(s.media && s.media.tagName === 'VIDEO')) {
                const now = Date.now();
                if (now - lastTap < 280) { toggleZoom(e); lastTap = 0; }
                else { lastTap = now; setTimeout(() => { if (lastTap === now) root.classList.toggle('ui-hidden'); }, 290); }
            }
        };
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);
    }

    function applyTransform() {
        const media = stage.querySelector('.pv-media');
        if (media && media.tagName !== 'VIDEO') media.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    }
    function resetZoom() { if (state) { state.zoom = 1; state.panX = 0; state.panY = 0; applyTransform(); } }
    function toggleZoom(e) {
        if (state.zoom > 1) { resetZoom(); return; }
        const rect = stage.getBoundingClientRect();
        state.zoom = 2;
        state.panX = (rect.width / 2 - (e.clientX - rect.left));
        state.panY = (rect.height / 2 - (e.clientY - rect.top));
        applyTransform();
        const item = state.items[state.index];
        const media = stage.querySelector('.pv-media');
        const full = state.opts.src(item, 'original');
        if (media && full && media.dataset.tier !== 'original') {
            const img = new Image();
            img.onload = () => { if (state && state.items[state.index] === item) { media.src = full; media.dataset.tier = 'original'; } };
            img.src = full;
        }
    }

    function render() {
        const { items, index, opts } = state;
        const item = items[index];
        root.querySelector('.pv-count').textContent = `${index + 1} / ${items.length}${state.more ? '+' : ''}`;
        root.querySelector('.pv-caption').textContent = opts.caption ? opts.caption(item) : '';
        const actions = (opts.actions || []).map((a, i) => `<button class="pv-btn" data-pv="action:${i}" title="${esc(a.label)}" aria-label="${esc(a.label)}"><i class="${esc(a.icon)}"></i></button>`);
        if (opts.downloadUrl && opts.downloadUrl(item)) actions.push('<button class="pv-btn" data-pv="download" title="ดาวน์โหลด" aria-label="ดาวน์โหลด"><i class="fas fa-download"></i></button>');
        root.querySelector('.pv-actions').innerHTML = actions.join('');
        root.querySelector('.pv-prev').style.visibility = index > 0 ? 'visible' : 'hidden';
        root.querySelector('.pv-next').style.visibility = index < items.length - 1 || state.more ? 'visible' : 'hidden';

        stage.innerHTML = '';
        resetZoom();
        if (item.file_type === 'video') {
            const v = document.createElement('video');
            v.className = 'pv-media';
            v.controls = true;
            v.playsInline = true;
            v.preload = 'metadata';
            v.poster = opts.src(item, 'thumb');
            v.src = opts.src(item, 'original');
            stage.appendChild(v);
        } else {
            const img = document.createElement('img');
            img.className = 'pv-media';
            img.alt = '';
            img.draggable = false;
            // Blurred inline preview first (instant, no request), then sd, then medium as each arrives.
            img.src = item.preview_b64 || opts.src(item, 'sd');
            img.dataset.tier = item.preview_b64 ? 'preview' : 'sd';
            if (item.preview_b64) img.style.filter = 'blur(12px)';
            stage.appendChild(img);
            const upgrade = (variant, from) => {
                const next = new Image();
                next.onload = () => {
                    if (!state || state.items[state.index] !== item || !from.includes(img.dataset.tier)) return;
                    img.src = next.src;
                    img.dataset.tier = variant;
                    img.style.filter = '';
                };
                next.src = opts.src(item, variant);
            };
            if (item.preview_b64) upgrade('sd', ['preview']);
            upgrade('medium', ['preview', 'sd']);
        }
        // Warm the neighbours so swiping feels instant.
        [index - 1, index + 1].forEach(i => { const n = items[i]; if (n && n.file_type !== 'video') new Image().src = opts.src(n, 'sd'); });
        if (opts.loadMore && state.more && index >= items.length - 4 && !state.loading) loadMore();
    }

    async function loadMore() {
        state.loading = true;
        try {
            const extra = await state.opts.loadMore();
            if (!state) return;
            if (extra && extra.length) state.items = state.items.concat(extra);
            else state.more = false;
        } catch (e) { if (state) state.more = false; }
        if (state) { state.loading = false; root.querySelector('.pv-count').textContent = `${state.index + 1} / ${state.items.length}${state.more ? '+' : ''}`; root.querySelector('.pv-next').style.visibility = state.index < state.items.length - 1 ? 'visible' : 'hidden'; }
    }

    function go(d) {
        if (!state) return;
        const n = state.index + d;
        if (n < 0 || n >= state.items.length) return;
        const v = stage.querySelector('video');
        if (v) v.pause();
        state.index = n;
        render();
    }

    V.open = opts => {
        if (!root) build();
        state = { opts, items: opts.items.slice(), index: Math.max(0, Math.min(opts.index || 0, opts.items.length - 1)), zoom: 1, panX: 0, panY: 0, more: !!opts.loadMore, loading: false, pushed: false };
        root.classList.add('show');
        root.classList.remove('ui-hidden');
        document.documentElement.style.overflow = 'hidden';
        try { history.pushState({ photosViewer: true }, ''); state.pushed = true; } catch (e) {}
        render();
        root.querySelector('[data-pv="close"]').focus({ preventScroll: true });
    };

    V.close = fromPopstate => {
        if (!state) return;
        const v = stage.querySelector('video');
        if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
        const pushed = state.pushed;
        state = null;
        root.classList.remove('show');
        stage.innerHTML = '';
        document.documentElement.style.overflow = '';
        if (pushed && !fromPopstate) history.back();
    };
})();
