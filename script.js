/**
 * AuthManager — Local-only authentication system
 *
 * Stores users + sessions in localStorage.
 * Passwords are hashed with SHA-256 (Web Crypto API) before storage.
 * Each user gets their own IndexedDB and localStorage namespace.
 *
 * API (exposed as window.AUTH):
 *   AUTH.register(email, password, displayName) → Promise<{ok, error}>
 *   AUTH.login(email, password)                 → Promise<{ok, error}>
 *   AUTH.loginAsGuest()                         → {ok}
 *   AUTH.logout()                               → void (redirects to login.html)
 *   AUTH.getCurrentUser()                       → session object | null
 *   AUTH.isAuthenticated()                      → boolean
 *   AUTH.requireAuth()                          → boolean (redirects if false)
 *   AUTH.getDbName()                            → string  (per-user IndexedDB name)
 *   AUTH.getStorageKey(key)                     → string  (per-user localStorage key)
 *   AUTH.updateDisplayName(name)               → void
 *   AUTH.updatePassword(oldPw, newPw)          → Promise<{ok, error}>
 *   AUTH.deleteAccount()                        → Promise<void>
 */

class AuthManager {
    constructor() {
        this.SESSION_KEY  = 'nb_auth_session';
        this.USERS_KEY    = 'nb_auth_users';
        this.LOGIN_PAGE   = 'login.html';
        this.APP_PAGE     = 'index.html';
        this._session     = null; // in-memory cache
    }

    // ─────────────────────────────────────────────
    //  CRYPTO
    // ─────────────────────────────────────────────

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data    = encoder.encode(password + 'nb_salt_v1');
        const hashBuf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    _generateId() {
        return 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    // ─────────────────────────────────────────────
    //  USER STORE  (localStorage)
    // ─────────────────────────────────────────────

    _getUsers() {
        try {
            return JSON.parse(localStorage.getItem(this.USERS_KEY) || '[]');
        } catch {
            return [];
        }
    }

    _saveUsers(users) {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    }

    _findUserByEmail(email) {
        return this._getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
    }

    // ─────────────────────────────────────────────
    //  SESSION
    // ─────────────────────────────────────────────

    getCurrentUser() {
        if (this._session) return this._session;
        try {
            const raw = localStorage.getItem(this.SESSION_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            // Guest sessions expire after 24 h; regular sessions after 30 days
            if (session.expiresAt && Date.now() > session.expiresAt) {
                this.clearSession();
                return null;
            }
            this._session = session;
            return session;
        } catch {
            return null;
        }
    }

    _setSession(user, isGuest = false) {
        const ttl = isGuest
            ? 24 * 60 * 60 * 1000          // 24 hours
            : 30 * 24 * 60 * 60 * 1000;    // 30 days

        const session = {
            userId:      user.id,
            email:       user.email,
            displayName: user.displayName,
            avatarColor: user.avatarColor,
            isGuest,
            createdAt:   Date.now(),
            expiresAt:   Date.now() + ttl,
        };
        this._session = session;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        return session;
    }

    clearSession() {
        this._session = null;
        localStorage.removeItem(this.SESSION_KEY);
    }

    isAuthenticated() {
        return !!this.getCurrentUser();
    }

    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.replace(this.LOGIN_PAGE);
            return false;
        }
        return true;
    }

    // ─────────────────────────────────────────────
    //  REGISTER
    // ─────────────────────────────────────────────

    async register(email, password, displayName) {
        email       = (email || '').trim();
        displayName = (displayName || '').trim();
        password    = (password || '');

        // Validation
        if (!email || !email.includes('@'))
            return { ok: false, error: 'Please enter a valid email address.' };
        if (password.length < 6)
            return { ok: false, error: 'Password must be at least 6 characters.' };
        if (!displayName)
            return { ok: false, error: 'Please enter a display name.' };

        const users = this._getUsers();
        if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
            return { ok: false, error: 'An account with this email already exists.' };

        const passwordHash = await this.hashPassword(password);
        const avatarColor  = this._randomAvatarColor();

        const user = {
            id:           this._generateId(),
            email,
            displayName,
            passwordHash,
            avatarColor,
            createdAt:    new Date().toISOString(),
        };

        users.push(user);
        this._saveUsers(users);
        this._setSession(user, false);

        return { ok: true, user };
    }

    // ─────────────────────────────────────────────
    //  LOGIN
    // ─────────────────────────────────────────────

    async login(email, password) {
        email    = (email || '').trim();
        password = (password || '');

        if (!email || !password)
            return { ok: false, error: 'Please fill in all fields.' };

        const user = this._findUserByEmail(email);
        if (!user)
            return { ok: false, error: 'No account found with this email.' };

        const passwordHash = await this.hashPassword(password);
        if (passwordHash !== user.passwordHash)
            return { ok: false, error: 'Incorrect password.' };

        this._setSession(user, false);
        return { ok: true, user };
    }

    // ─────────────────────────────────────────────
    //  GUEST
    // ─────────────────────────────────────────────

    loginAsGuest() {
        const guestUser = {
            id:           'guest_' + Math.random().toString(36).slice(2, 10),
            email:        'guest@local',
            displayName:  'Guest',
            avatarColor:  '#7f8c8d',
        };
        this._setSession(guestUser, true);
        return { ok: true, user: guestUser };
    }

    // ─────────────────────────────────────────────
    //  LOGOUT
    // ─────────────────────────────────────────────

    logout() {
        this.clearSession();
        window.location.replace(this.LOGIN_PAGE);
    }

    // ─────────────────────────────────────────────
    //  ACCOUNT MANAGEMENT
    // ─────────────────────────────────────────────

    updateDisplayName(name) {
        name = (name || '').trim();
        if (!name) return;

        const session = this.getCurrentUser();
        if (!session || session.isGuest) return;

        const users = this._getUsers();
        const idx   = users.findIndex(u => u.id === session.userId);
        if (idx !== -1) {
            users[idx].displayName = name;
            this._saveUsers(users);
        }

        // Update session
        session.displayName = name;
        this._session = session;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    }

    async updatePassword(oldPassword, newPassword) {
        const session = this.getCurrentUser();
        if (!session || session.isGuest)
            return { ok: false, error: 'Not available for guest accounts.' };
        if ((newPassword || '').length < 6)
            return { ok: false, error: 'New password must be at least 6 characters.' };

        const users = this._getUsers();
        const user  = users.find(u => u.id === session.userId);
        if (!user) return { ok: false, error: 'User not found.' };

        const oldHash = await this.hashPassword(oldPassword);
        if (oldHash !== user.passwordHash)
            return { ok: false, error: 'Current password is incorrect.' };

        user.passwordHash = await this.hashPassword(newPassword);
        this._saveUsers(users);
        return { ok: true };
    }

    async deleteAccount() {
        const session = this.getCurrentUser();
        if (!session) return;

        const users   = this._getUsers().filter(u => u.id !== session.userId);
        this._saveUsers(users);

        // Drop per-user IndexedDB
        try {
            indexedDB.deleteDatabase(this.getDbName());
        } catch (_) {}

        this.logout();
    }

    // ─────────────────────────────────────────────
    //  PER-USER NAMESPACING
    // ─────────────────────────────────────────────

    getDbName() {
        const session = this.getCurrentUser();
        return session
            ? `NotebookDB_vSeq_${session.userId}`
            : 'NotebookDB_vSeq_anonymous';
    }

    getStorageKey(key) {
        const session = this.getCurrentUser();
        return session
            ? `${key}_${session.userId}`
            : key;
    }

    // ─────────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────────

    _randomAvatarColor() {
        const palette = [
            '#2980b9','#27ae60','#8e44ad','#c0392b',
            '#16a085','#d35400','#2c3e50','#f39c12',
        ];
        return palette[Math.floor(Math.random() * palette.length)];
    }

    getInitials(displayName) {
        return (displayName || 'G')
            .split(' ')
            .map(w => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    }

    /** Builds an SVG avatar circle with initials */
    getAvatarHTML(size = 32) {
        const session = this.getCurrentUser();
        if (!session) return '';
        const initials = this.getInitials(session.displayName);
        const color    = session.avatarColor || '#2c3e50';
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${color}"/>
                <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
                      fill="white" font-size="${Math.round(size * 0.38)}"
                      font-family="Caveat, cursive" font-weight="700">
                    ${initials}
                </text>
            </svg>`;
    }
}

// ─────────────────────────────────────────────
//  GLOBAL SINGLETON
// ─────────────────────────────────────────────
window.AUTH = new AuthManager();
/**
 * SharedLibrary — Local shared notes library
 *
 * Stores published notes in a shared localStorage key accessible
 * by all users on the same device/browser.
 *
 * Share format: exported as .json files that other users can import.
 *
 * API (exposed as window.LIBRARY):
 *   LIBRARY.publish(chapter, user)     → {ok, error, entry}
 *   LIBRARY.getAll()                   → entry[]
 *   LIBRARY.search(query)              → entry[]
 *   LIBRARY.getById(id)                → entry | null
 *   LIBRARY.deleteEntry(id, userId)    → {ok, error}
 *   LIBRARY.exportNote(id)             → void  (triggers download)
 *   LIBRARY.importFromFile(file)       → Promise<{ok, error, entry}>
 *   LIBRARY.isPublished(chapterId)     → boolean
 *   LIBRARY.getByChapterId(chapterId)  → entry | null
 */

class SharedLibrary {
    constructor() {
        this.STORAGE_KEY = 'nb_shared_library';
    }

    // ─────────────────────────────────────────────
    //  INTERNAL STORE
    // ─────────────────────────────────────────────

    _load() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    }

    _save(entries) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
    }

    // ─────────────────────────────────────────────
    //  PUBLISH
    // ─────────────────────────────────────────────

    publish(chapter, user) {
        if (!chapter || !chapter.title)
            return { ok: false, error: 'Note has no title. Please add a title before publishing.' };
        if (!user)
            return { ok: false, error: 'You must be logged in to publish.' };
        if (user.isGuest)
            return { ok: false, error: 'Guest accounts cannot publish notes.' };

        const entries = this._load();

        // Prevent duplicate (same chapter already published)
        const existing = entries.find(e => e.originalId === chapter.id && e.authorId === user.userId);
        if (existing)
            return { ok: false, error: 'This note is already in the library. Unpublish it first to re-publish.' };

        // Build snippet — strip HTML tags from content
        const raw = (chapter.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const snippet = raw.length > 200 ? raw.slice(0, 200) + '…' : raw;

        const entry = {
            id:          'lib_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
            originalId:  chapter.id,
            title:       chapter.title || 'Untitled',
            snippet,
            tags:        chapter.tags || [],
            category:    chapter.category || chapter.metadata?.discipline || 'General',
            author:      user.displayName || 'Anonymous',
            authorId:    user.userId,
            publishedAt: new Date().toISOString(),
            content:     chapter.content || '',
            metadata:    chapter.metadata || {},
        };

        entries.unshift(entry);
        this._save(entries);
        return { ok: true, entry };
    }

    // ─────────────────────────────────────────────
    //  READ
    // ─────────────────────────────────────────────

    getAll() {
        return this._load();
    }

    getById(id) {
        return this._load().find(e => e.id === id) || null;
    }

    getByChapterId(chapterId) {
        return this._load().find(e => e.originalId === chapterId) || null;
    }

    isPublished(chapterId) {
        return !!this.getByChapterId(chapterId);
    }

    search(query, category) {
        const q = (query || '').toLowerCase().trim();
        let entries = this._load();

        // Category filter
        if (category && category !== 'all') {
            entries = entries.filter(e =>
                (e.category || '').toLowerCase() === category.toLowerCase() ||
                (e.metadata?.discipline || '').toLowerCase() === category.toLowerCase()
            );
        }

        // Text search
        if (!q) return entries;

        return entries.filter(e => {
            const inTitle = (e.title || '').toLowerCase().includes(q);
            const inTags  = (e.tags || []).some(t => t.toLowerCase().includes(q.replace('#', '')));
            const inAuthor = (e.author || '').toLowerCase().includes(q);
            return inTitle || inTags || inAuthor;
        });
    }

    // ─────────────────────────────────────────────
    //  DELETE
    // ─────────────────────────────────────────────

    deleteEntry(id, userId) {
        const entries = this._load();
        const idx = entries.findIndex(e => e.id === id);
        if (idx === -1) return { ok: false, error: 'Note not found.' };
        if (entries[idx].authorId !== userId)
            return { ok: false, error: 'You can only remove your own notes.' };

        entries.splice(idx, 1);
        this._save(entries);
        return { ok: true };
    }

    // ─────────────────────────────────────────────
    //  EXPORT (download as .json share file)
    // ─────────────────────────────────────────────

    exportNote(id) {
        const entry = this.getById(id);
        if (!entry) return;

        const shareData = {
            _type:      'nb_shared_note_v1',
            id:          entry.id,
            title:       entry.title,
            snippet:     entry.snippet,
            tags:        entry.tags,
            category:    entry.category,
            author:      entry.author,
            publishedAt: entry.publishedAt,
            content:     entry.content,
            metadata:    entry.metadata,
        };

        const blob = new Blob([JSON.stringify(shareData, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${entry.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_shared.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─────────────────────────────────────────────
    //  IMPORT (from .json share file)
    // ─────────────────────────────────────────────

    importFromFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data._type !== 'nb_shared_note_v1')
                        return resolve({ ok: false, error: 'Invalid share file format.' });

                    const entries = this._load();

                    // Check for duplicate
                    if (entries.find(en => en.id === data.id))
                        return resolve({ ok: false, error: 'This note is already in your library.' });

                    // Strip internal id-based originalId to avoid confusion
                    const entry = {
                        id:          data.id,
                        originalId:  null, // imported — no local original
                        title:       data.title || 'Untitled',
                        snippet:     data.snippet || '',
                        tags:        data.tags || [],
                        category:    data.category || 'General',
                        author:      data.author || 'Unknown',
                        authorId:    null, // imported — not owner
                        publishedAt: data.publishedAt || new Date().toISOString(),
                        content:     data.content || '',
                        metadata:    data.metadata || {},
                    };

                    entries.unshift(entry);
                    this._save(entries);
                    resolve({ ok: true, entry });
                } catch {
                    resolve({ ok: false, error: 'Could not read the file. Is it a valid share file?' });
                }
            };
            reader.onerror = () => resolve({ ok: false, error: 'File read error.' });
            reader.readAsText(file);
        });
    }

    // ─────────────────────────────────────────────
    //  CLONE — returns a chapter object ready to save
    // ─────────────────────────────────────────────

    buildClone(id) {
        const entry = this.getById(id);
        if (!entry) return null;
        return {
            id:       'ch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
            title:    entry.title + ' (clone)',
            category: entry.category || 'General',
            tags:     entry.tags || [],
            content:  entry.content || '',
            tool:     'pen',
            sketch:   null,
            paperStyle: 'grid',
            lastEdited: new Date().toISOString(),
            metadata: { ...entry.metadata, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        };
    }
}

// ─────────────────────────────────────────────
//  GLOBAL SINGLETON
// ─────────────────────────────────────────────
window.LIBRARY = new SharedLibrary();
/**
 * LassoSelector — Professional Multi-Select System
 * 
 * Two selection modes:
 *   BOX mode  — rectangular marquee selection
 *   FREE mode — freeform lasso drawing (any shape)
 * 
 * Supports: plain text blocks, outline items, images, headers, divs, and all
 * block-level content within content areas.
 * 
 * API:
 *   const lasso = new LassoSelector();
 *   lasso.initialize();
 *   lasso.toggleLassoMode();  // returns boolean
 *   lasso.setSelectionMode('box' | 'free');
 *   lasso.destroy();
 */
class LassoSelector {
    constructor() {
        this.isActive = false;
        this.isDrawing = false;
        this.isDraggingGroup = false;
        this.selectedElements = [];
        this.selectionRect = null;      // Box mode overlay div
        this.freeformCanvas = null;     // Freeform mode overlay canvas
        this.freeformCtx = null;
        this.actionBar = null;
        this.startX = 0;
        this.startY = 0;

        // Selection mode: 'box' or 'free'
        this.selectionMode = 'box';

        // Freeform path (array of {x, y} page-coords)
        this._freeformPath = [];

        // Group drag state
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._dragOffsets = [];

        // Bound handlers
        this._onMouseDown = this._handleMouseDown.bind(this);
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onMouseUp = this._handleMouseUp.bind(this);
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onGroupDragMove = this._handleGroupDragMove.bind(this);
        this._onGroupDragEnd = this._handleGroupDragEnd.bind(this);
    }

    // ================================================================
    //  INITIALIZATION
    // ================================================================

    initialize() {
        // Box mode overlay div
        this.selectionRect = document.createElement('div');
        this.selectionRect.className = 'lasso-selection-rect';
        this.selectionRect.style.display = 'none';
        document.body.appendChild(this.selectionRect);

        // Freeform mode overlay canvas (covers full page)
        this.freeformCanvas = document.createElement('canvas');
        this.freeformCanvas.className = 'lasso-freeform-canvas';
        this.freeformCanvas.style.display = 'none';
        document.body.appendChild(this.freeformCanvas);
        this.freeformCtx = this.freeformCanvas.getContext('2d');

        // Action bar
        this._createActionBar();

        console.log('LassoSelector: initialized');
    }

    destroy() {
        this.exitLassoMode();
        [this.selectionRect, this.freeformCanvas, this.actionBar].forEach(el => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        this.selectionRect = null;
        this.freeformCanvas = null;
        this.freeformCtx = null;
        this.actionBar = null;
    }

    // ================================================================
    //  MODE CONTROL
    // ================================================================

    toggleLassoMode() {
        if (this.isActive) {
            this.exitLassoMode();
        } else {
            this.enterLassoMode();
        }
        return this.isActive;
    }

    /**
     * Switch between 'box' and 'free' selection modes.
     */
    setSelectionMode(mode) {
        if (mode !== 'box' && mode !== 'free') return;
        this.selectionMode = mode;

        // Update toggle button visuals
        const boxBtn = document.querySelector('[data-lasso-mode="box"]');
        const freeBtn = document.querySelector('[data-lasso-mode="free"]');
        if (boxBtn) boxBtn.classList.toggle('active', mode === 'box');
        if (freeBtn) freeBtn.classList.toggle('active', mode === 'free');

        if (typeof showToast === 'function') {
            showToast(mode === 'box' ? '▭ Box Selection Mode' : '✏️ Freeform Selection Mode');
        }
    }

    enterLassoMode() {
        if (this.isActive) return;
        this.isActive = true;

        window._interactionMode = 'lasso';

        // Exit sketch mode if active
        if (typeof window.isSketchMode !== 'undefined' && window.isSketchMode) {
            if (typeof window.toggleSketchMode === 'function') {
                window.toggleSketchMode();
            }
        }

        // Disable contenteditable
        document.querySelectorAll('.content-area').forEach(el => {
            el.setAttribute('data-lasso-prev-editable', el.contentEditable);
            el.contentEditable = 'false';
        });

        document.body.classList.add('lasso-mode');

        // Attach listeners on workspace
        const workspace = document.getElementById('workspace') || document.body;
        workspace.addEventListener('mousedown', this._onMouseDown, true);
        document.addEventListener('mousemove', this._onMouseMove, true);
        document.addEventListener('mouseup', this._onMouseUp, true);
        document.addEventListener('keydown', this._onKeyDown, true);

        // Touch
        workspace.addEventListener('touchstart', this._onMouseDown, { passive: false, capture: true });
        document.addEventListener('touchmove', this._onMouseMove, { passive: false, capture: true });
        document.addEventListener('touchend', this._onMouseUp, { passive: false, capture: true });

        const btn = document.getElementById('lassoBtn');
        if (btn) btn.classList.add('active');
    }

    exitLassoMode() {
        if (!this.isActive) return;
        this.isActive = false;

        window._interactionMode = 'default';

        // Restore contenteditable
        document.querySelectorAll('.content-area').forEach(el => {
            const prev = el.getAttribute('data-lasso-prev-editable');
            el.contentEditable = prev === 'false' ? 'false' : 'true';
            el.removeAttribute('data-lasso-prev-editable');
        });

        this.clearSelection();
        document.body.classList.remove('lasso-mode');

        const workspace = document.getElementById('workspace') || document.body;
        workspace.removeEventListener('mousedown', this._onMouseDown, true);
        document.removeEventListener('mousemove', this._onMouseMove, true);
        document.removeEventListener('mouseup', this._onMouseUp, true);
        document.removeEventListener('keydown', this._onKeyDown, true);
        workspace.removeEventListener('touchstart', this._onMouseDown, true);
        document.removeEventListener('touchmove', this._onMouseMove, true);
        document.removeEventListener('touchend', this._onMouseUp, true);

        if (this.selectionRect) this.selectionRect.style.display = 'none';
        this._hideFreeformCanvas();
        this._hideActionBar();

        const btn = document.getElementById('lassoBtn');
        if (btn) btn.classList.remove('active');
    }

    // ================================================================
    //  SELECTABLE ELEMENT DETECTION — works on ALL block content
    // ================================================================

    _detectTemplateContext() {
        if (document.querySelector('#outlineContent')) return 'outline';
        if (document.querySelector('.mindmap-container')) return 'mindmap';
        if (document.querySelector('.cornell-container')) return 'cornell';
        if (document.querySelector('.flashcard-container')) return 'flashcard';
        return 'default';
    }

    /**
     * Get all selectable elements. For plain text pages, this returns every
     * direct child block of every .content-area (p, div, h1-h6, blockquote,
     * table, ul, ol, pre, etc.) plus any images, checklist items, etc.
     */
    getSelectableElements() {
        const context = this._detectTemplateContext();
        const elements = [];
        const seen = new Set();

        const addElement = (el) => {
            if (seen.has(el) || this._isUIElement(el)) return;
            seen.add(el);
            elements.push(el);
        };

        if (context === 'outline') {
            // Select outline items
            document.querySelectorAll('#outlineContent .outline-item').forEach(addElement);
            document.querySelectorAll('.content-area .rd-image-wrapper').forEach(addElement);
        } else if (context === 'mindmap') {
            document.querySelectorAll('.mindmap-container [class*="node"]').forEach(addElement);
            document.querySelectorAll('.content-area .rd-image-wrapper').forEach(addElement);
        } else {
            // DEFAULT + CORNELL + FLASHCARD: select all direct child blocks
            document.querySelectorAll('.content-area').forEach(area => {
                // All direct children that are block-level elements
                Array.from(area.children).forEach(child => {
                    const tag = child.tagName.toLowerCase();
                    // Skip if it's purely a spacer/break
                    if (tag === 'br') return;
                    // Skip empty elements with no meaningful content
                    if (!child.textContent.trim() && !child.querySelector('img, canvas, svg, .rd-image-wrapper')) return;
                    addElement(child);
                });

                // Also catch any images that might be nested deeper
                area.querySelectorAll('.rd-image-wrapper, .uploaded-container, img').forEach(el => {
                    // Don't add if a parent is already added (avoid double-select)
                    let dominated = false;
                    for (const existing of seen) {
                        if (existing !== el && existing.contains(el)) { dominated = true; break; }
                    }
                    if (!dominated) addElement(el);
                });
            });
        }

        return elements;
    }

    _isUIElement(el) {
        if (!el || !el.tagName) return true;
        const tag = el.tagName.toLowerCase();
        if (['button', 'input', 'select', 'textarea', 'nav', 'aside', 'script', 'style', 'link'].includes(tag)) return true;

        const uiClasses = [
            'tool-btn', 'tool-tray', 'sidebar', 'outline-label',
            'outline-toggle-btn', 'rd-resize-handle', 'lasso-action-bar',
            'lasso-selection-rect', 'lasso-freeform-canvas',
            'continuation-break', 'continuation-label', 'lasso-mode-toggle'
        ];
        for (const cls of uiClasses) {
            if (el.classList && el.classList.contains(cls)) return true;
        }

        if (el.closest && el.closest('.tool-tray, #sidebar, .lasso-action-bar, .lasso-mode-toggle')) return true;

        return false;
    }

    // ================================================================
    //  MOUSE / TOUCH HANDLERS — dispatches to box or freeform
    // ================================================================

    _handleMouseDown(e) {
        if (!this.isActive) return;
        if (this.actionBar && this.actionBar.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.lasso-mode-toggle, .lasso-action-bar')) return;
        if (this._isUIElement(e.target)) return;
        if (e.target.closest && e.target.closest('.tool-tray, #sidebar, .tool-btn')) return;

        const ev = e.touches ? e.touches[0] : e;

        // Group drag if clicking a selected element
        const clickedSelected = this._findSelectedAncestor(e.target);
        if (clickedSelected) {
            e.preventDefault();
            e.stopPropagation();
            this._startGroupDrag(ev, clickedSelected);
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (!e.shiftKey) this.clearSelection();

        this.isDrawing = true;
        this.startX = ev.pageX;
        this.startY = ev.pageY;

        if (this.selectionMode === 'box') {
            this._startBox();
        } else {
            this._startFreeform(ev);
        }
    }

    _handleMouseMove(e) {
        if (!this.isActive || !this.isDrawing) return;
        e.preventDefault();
        const ev = e.touches ? e.touches[0] : e;

        if (this.selectionMode === 'box') {
            this._moveBox(ev);
        } else {
            this._moveFreeform(ev);
        }
    }

    _handleMouseUp(e) {
        if (!this.isActive || !this.isDrawing) return;
        this.isDrawing = false;

        const ev = e.changedTouches ? e.changedTouches[0] : e;

        if (this.selectionMode === 'box') {
            this._endBox(ev, e.shiftKey);
        } else {
            this._endFreeform(e.shiftKey);
        }
    }

    _handleKeyDown(e) {
        if (!this.isActive) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.exitLassoMode();
            if (typeof showToast === 'function') showToast('Lasso Selection Disabled');
            return;
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedElements.length > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.deleteSelected();
            return;
        }

        if (e.key === 'd' && (e.ctrlKey || e.metaKey) && this.selectedElements.length > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.duplicateSelected();
            return;
        }

        if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this._selectAll();
            return;
        }

        // M key — toggle between Box and Free modes
        if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            this.setSelectionMode(this.selectionMode === 'box' ? 'free' : 'box');
            return;
        }

        if (e.key === 'Tab') e.preventDefault();
    }

    // ================================================================
    //  BOX MODE — rectangular marquee
    // ================================================================

    _startBox() {
        this.selectionRect.style.left = this.startX + 'px';
        this.selectionRect.style.top = this.startY + 'px';
        this.selectionRect.style.width = '0px';
        this.selectionRect.style.height = '0px';
        this.selectionRect.style.display = 'block';
    }

    _moveBox(ev) {
        const currentX = ev.pageX;
        const currentY = ev.pageY;
        const left = Math.min(this.startX, currentX);
        const top = Math.min(this.startY, currentY);
        const width = Math.abs(currentX - this.startX);
        const height = Math.abs(currentY - this.startY);

        this.selectionRect.style.left = left + 'px';
        this.selectionRect.style.top = top + 'px';
        this.selectionRect.style.width = width + 'px';
        this.selectionRect.style.height = height + 'px';

        this._previewByRect(left, top, width, height);
    }

    _endBox(ev, additive) {
        this.selectionRect.style.display = 'none';

        const endX = ev.pageX;
        const endY = ev.pageY;
        const left = Math.min(this.startX, endX);
        const top = Math.min(this.startY, endY);
        const width = Math.abs(endX - this.startX);
        const height = Math.abs(endY - this.startY);

        if (width > 5 || height > 5) {
            this._selectByRect(left, top, width, height, additive);
        } else {
            if (!this._findSelectedAncestor(document.elementFromPoint(ev.clientX, ev.clientY))) {
                this.clearSelection();
            }
        }
    }

    // ================================================================
    //  FREEFORM MODE — draw any shape
    // ================================================================

    _showFreeformCanvas() {
        const c = this.freeformCanvas;
        // Size to full document (not just viewport)
        c.width = Math.max(document.documentElement.scrollWidth, window.innerWidth);
        c.height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
        c.style.display = 'block';
    }

    _hideFreeformCanvas() {
        if (this.freeformCanvas) {
            this.freeformCanvas.style.display = 'none';
            if (this.freeformCtx) {
                this.freeformCtx.clearRect(0, 0, this.freeformCanvas.width, this.freeformCanvas.height);
            }
        }
    }

    _startFreeform(ev) {
        this._freeformPath = [{ x: ev.pageX, y: ev.pageY }];
        this._showFreeformCanvas();

        const ctx = this.freeformCtx;
        ctx.clearRect(0, 0, this.freeformCanvas.width, this.freeformCanvas.height);
        ctx.beginPath();
        ctx.moveTo(ev.pageX, ev.pageY);
        ctx.strokeStyle = 'rgba(52, 152, 219, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    _moveFreeform(ev) {
        const x = ev.pageX;
        const y = ev.pageY;
        this._freeformPath.push({ x, y });

        const ctx = this.freeformCtx;
        ctx.lineTo(x, y);
        ctx.stroke();

        // Draw fill preview
        ctx.save();
        ctx.beginPath();
        this._freeformPath.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(52, 152, 219, 0.06)';
        ctx.fill();
        ctx.restore();

        // Live preview
        this._previewByPolygon(this._freeformPath);
    }

    _endFreeform(additive) {
        this._hideFreeformCanvas();

        if (this._freeformPath.length < 5) {
            // Too few points — treat as a click
            this.clearSelection();
            return;
        }

        this._selectByPolygon(this._freeformPath, additive);
        this._freeformPath = [];
    }

    // ================================================================
    //  SELECTION COMPUTATION
    // ================================================================

    _previewByRect(left, top, width, height) {
        const selRect = { left, top, right: left + width, bottom: top + height };
        this.getSelectableElements().forEach(el => {
            const elRect = this._getPageRect(el);
            el.classList.toggle('lasso-preview', this._rectsOverlap(selRect, elRect));
        });
    }

    _selectByRect(left, top, width, height, additive) {
        const selRect = { left, top, right: left + width, bottom: top + height };
        const selectables = this.getSelectableElements();
        selectables.forEach(el => el.classList.remove('lasso-preview'));

        const hits = selectables.filter(el => this._rectsOverlap(selRect, this._getPageRect(el)));

        if (additive) {
            hits.forEach(el => { if (!this.selectedElements.includes(el)) this.selectedElements.push(el); });
        } else {
            this.selectedElements = hits;
        }

        this._applySelectionStyles();
        this.selectedElements.length > 0 ? this._showActionBar() : this._hideActionBar();
    }

    _previewByPolygon(polygon) {
        this.getSelectableElements().forEach(el => {
            const elRect = this._getPageRect(el);
            const center = {
                x: (elRect.left + elRect.right) / 2,
                y: (elRect.top + elRect.bottom) / 2
            };
            // Element selected if its center is inside the polygon
            // OR if its bounding rect overlaps the polygon's bounding rect significantly
            const insidePoly = this._pointInPolygon(center, polygon);
            el.classList.toggle('lasso-preview', insidePoly);
        });
    }

    _selectByPolygon(polygon, additive) {
        const selectables = this.getSelectableElements();
        selectables.forEach(el => el.classList.remove('lasso-preview'));

        const hits = selectables.filter(el => {
            const elRect = this._getPageRect(el);
            // Check if center is inside the polygon
            const center = {
                x: (elRect.left + elRect.right) / 2,
                y: (elRect.top + elRect.bottom) / 2
            };
            if (this._pointInPolygon(center, polygon)) return true;

            // Also check if any corner of the element is inside
            const corners = [
                { x: elRect.left, y: elRect.top },
                { x: elRect.right, y: elRect.top },
                { x: elRect.left, y: elRect.bottom },
                { x: elRect.right, y: elRect.bottom }
            ];
            return corners.some(c => this._pointInPolygon(c, polygon));
        });

        if (additive) {
            hits.forEach(el => { if (!this.selectedElements.includes(el)) this.selectedElements.push(el); });
        } else {
            this.selectedElements = hits;
        }

        this._applySelectionStyles();
        this.selectedElements.length > 0 ? this._showActionBar() : this._hideActionBar();
    }

    // ================================================================
    //  GEOMETRY HELPERS
    // ================================================================

    _getPageRect(el) {
        const r = el.getBoundingClientRect();
        return {
            left: r.left + window.scrollX,
            top: r.top + window.scrollY,
            right: r.right + window.scrollX,
            bottom: r.bottom + window.scrollY
        };
    }

    /**
     * Check if selection rect overlaps element rect by ≥20% of element area.
     */
    _rectsOverlap(selRect, elRect) {
        if (selRect.right < elRect.left || selRect.left > elRect.right) return false;
        if (selRect.bottom < elRect.top || selRect.top > elRect.bottom) return false;

        const oL = Math.max(selRect.left, elRect.left);
        const oT = Math.max(selRect.top, elRect.top);
        const oR = Math.min(selRect.right, elRect.right);
        const oB = Math.min(selRect.bottom, elRect.bottom);
        const overlap = Math.max(0, oR - oL) * Math.max(0, oB - oT);

        const elArea = (elRect.right - elRect.left) * (elRect.bottom - elRect.top);
        if (elArea === 0) return false;
        return (overlap / elArea) >= 0.2;
    }

    /**
     * Ray-casting point-in-polygon test.
     */
    _pointInPolygon(point, polygon) {
        let inside = false;
        const n = polygon.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    _selectAll() {
        this.selectedElements = this.getSelectableElements();
        this._applySelectionStyles();
        if (this.selectedElements.length > 0) {
            this._showActionBar();
            if (typeof showToast === 'function') showToast(`Selected ${this.selectedElements.length} elements`);
        }
    }

    // ================================================================
    //  SELECTION VISUAL STYLES
    // ================================================================

    _applySelectionStyles() {
        document.querySelectorAll('.lasso-selected').forEach(el => el.classList.remove('lasso-selected'));
        this.selectedElements.forEach(el => el.classList.add('lasso-selected'));
    }

    clearSelection() {
        document.querySelectorAll('.lasso-selected, .lasso-preview').forEach(el => {
            el.classList.remove('lasso-selected', 'lasso-preview');
        });
        this.selectedElements = [];
        this._hideActionBar();
    }

    _findSelectedAncestor(target) {
        let el = target;
        while (el && el !== document.body) {
            if (this.selectedElements.includes(el)) return el;
            el = el.parentElement;
        }
        return null;
    }

    // ================================================================
    //  ACTION BAR
    // ================================================================

    _createActionBar() {
        this.actionBar = document.createElement('div');
        this.actionBar.className = 'lasso-action-bar';
        this.actionBar.style.display = 'none';
        this.actionBar.setAttribute('contenteditable', 'false');

        this.actionBar.innerHTML = `
            <div class="lasso-mode-toggle" title="Press M to toggle">
                <button class="lasso-mode-btn active" data-lasso-mode="box" title="Box select">▭</button>
                <button class="lasso-mode-btn" data-lasso-mode="free" title="Freeform select">✏️</button>
            </div>
            <span class="lasso-action-divider">|</span>
            <span class="lasso-action-count">0 selected</span>
            <button class="lasso-action-btn" data-action="duplicate" title="Duplicate (Ctrl+D)">📋 Duplicate</button>
            <button class="lasso-action-btn lasso-action-delete" data-action="delete" title="Delete (Del)">🗑️ Delete</button>
            <button class="lasso-action-btn" data-action="clear" title="Clear Selection">✖ Clear</button>
        `;

        // Prevent bar clicks from triggering lasso drawing
        this.actionBar.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        // Action buttons
        this.actionBar.addEventListener('click', (e) => {
            e.stopPropagation();

            // Mode toggle buttons
            const modeBtn = e.target.closest('[data-lasso-mode]');
            if (modeBtn) {
                this.setSelectionMode(modeBtn.getAttribute('data-lasso-mode'));
                // Update active state in toggle
                this.actionBar.querySelectorAll('[data-lasso-mode]').forEach(b => {
                    b.classList.toggle('active', b === modeBtn);
                });
                return;
            }

            // Action buttons
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn) return;
            switch (actionBtn.getAttribute('data-action')) {
                case 'duplicate': this.duplicateSelected(); break;
                case 'delete': this.deleteSelected(); break;
                case 'clear': this.clearSelection(); break;
            }
        });

        document.body.appendChild(this.actionBar);
    }

    _showActionBar() {
        if (!this.actionBar || this.selectedElements.length === 0) return;

        const countEl = this.actionBar.querySelector('.lasso-action-count');
        if (countEl) countEl.textContent = `${this.selectedElements.length} selected`;

        // Update mode toggle state
        this.actionBar.querySelectorAll('[data-lasso-mode]').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-lasso-mode') === this.selectionMode);
        });

        const bounds = this._getGroupBounds();
        if (!bounds) return;

        const barWidth = 420;
        let barLeft = bounds.left + (bounds.right - bounds.left) / 2 - barWidth / 2;
        let barTop = bounds.top - 55;

        barLeft = Math.max(10, Math.min(barLeft, window.innerWidth - barWidth - 10));
        barTop = Math.max(10, barTop);

        this.actionBar.style.left = barLeft + 'px';
        this.actionBar.style.top = barTop + 'px';
        this.actionBar.style.display = 'flex';
        this.actionBar.style.position = 'fixed';
    }

    _hideActionBar() {
        if (this.actionBar) this.actionBar.style.display = 'none';
    }

    _getGroupBounds() {
        if (this.selectedElements.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.selectedElements.forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.left < minX) minX = r.left;
            if (r.top < minY) minY = r.top;
            if (r.right > maxX) maxX = r.right;
            if (r.bottom > maxY) maxY = r.bottom;
        });
        return { left: minX, top: minY, right: maxX, bottom: maxY };
    }

    // ================================================================
    //  GROUP ACTIONS
    // ================================================================

    deleteSelected() {
        if (this.selectedElements.length === 0) return;
        const count = this.selectedElements.length;
        const context = this._detectTemplateContext();

        this.selectedElements.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
        this.selectedElements = [];
        this._applySelectionStyles();
        this._hideActionBar();

        if (context === 'outline') {
            const container = document.getElementById('outlineContent');
            if (container && typeof renumberOutline === 'function') renumberOutline(container);
        }

        this._triggerSave();
        if (typeof showToast === 'function') showToast(`Deleted ${count} element${count > 1 ? 's' : ''}`);
    }

    duplicateSelected() {
        if (this.selectedElements.length === 0) return;
        const context = this._detectTemplateContext();
        const newElements = [];

        this.selectedElements.forEach(el => {
            const clone = el.cloneNode(true);
            clone.classList.remove('lasso-selected');

            if (getComputedStyle(el).position === 'absolute') {
                clone.style.left = (parseInt(el.style.left || '0') + 20) + 'px';
                clone.style.top = (parseInt(el.style.top || '0') + 20) + 'px';
            }

            el.nextSibling
                ? el.parentNode.insertBefore(clone, el.nextSibling)
                : el.parentNode.appendChild(clone);

            // Re-hydrate resizable images
            if (clone.classList.contains('rd-image-wrapper') && typeof window.createResizableDraggableImage === 'function') {
                const img = clone.querySelector('img');
                if (img) {
                    const fresh = window.createResizableDraggableImage(img.src);
                    fresh.style.left = clone.style.left;
                    fresh.style.top = clone.style.top;
                    fresh.style.width = clone.style.width;
                    fresh.style.height = clone.style.height;
                    clone.parentNode.replaceChild(fresh, clone);
                    newElements.push(fresh);
                    return;
                }
            }
            newElements.push(clone);
        });

        this.clearSelection();
        this.selectedElements = newElements;
        this._applySelectionStyles();
        this._showActionBar();

        if (context === 'outline') {
            const container = document.getElementById('outlineContent');
            if (container && typeof renumberOutline === 'function') renumberOutline(container);
        }

        this._triggerSave();
        if (typeof showToast === 'function') showToast(`Duplicated ${newElements.length} element${newElements.length > 1 ? 's' : ''}`);
    }

    // ================================================================
    //  GROUP DRAG — converts flow elements to absolute on first drag
    // ================================================================

    _startGroupDrag(ev, clickedElement) {
        this.isDraggingGroup = true;
        this._dragStartX = ev.clientX;
        this._dragStartY = ev.clientY;

        // Convert every selected element to absolute positioning so it can
        // be freely dragged around the paper.
        this._dragOffsets = this.selectedElements.map(el => {
            const style = getComputedStyle(el);
            const wasAbsolute = style.position === 'absolute' || style.position === 'fixed';

            if (!wasAbsolute) {
                // Capture current position relative to offsetParent before
                // switching to absolute — this keeps the element in the same
                // visual spot.
                const rect = el.getBoundingClientRect();
                const parent = el.offsetParent || el.parentElement;
                const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
                const startLeft = rect.left - parentRect.left + parent.scrollLeft;
                const startTop = rect.top - parentRect.top + parent.scrollTop;

                // Preserve original width so a full-width paragraph doesn't
                // collapse when removed from flow.
                const origWidth = rect.width;

                // Switch to absolute
                el.style.position = 'absolute';
                el.style.left = startLeft + 'px';
                el.style.top = startTop + 'px';
                el.style.width = origWidth + 'px';
                el.style.margin = '0';
                el.style.zIndex = '50';

                return { el, startLeft, startTop };
            }

            return {
                el,
                startLeft: parseInt(el.style.left || '0'),
                startTop: parseInt(el.style.top || '0'),
            };
        });

        document.addEventListener('mousemove', this._onGroupDragMove, true);
        document.addEventListener('mouseup', this._onGroupDragEnd, true);
        document.addEventListener('touchmove', this._onGroupDragMove, { passive: false, capture: true });
        document.addEventListener('touchend', this._onGroupDragEnd, { passive: false, capture: true });

        this.selectedElements.forEach(el => el.classList.add('lasso-dragging'));
        this._hideActionBar();
    }

    _handleGroupDragMove(e) {
        if (!this.isDraggingGroup) return;
        e.preventDefault();
        const ev = e.touches ? e.touches[0] : e;
        const dx = ev.clientX - this._dragStartX;
        const dy = ev.clientY - this._dragStartY;

        this._dragOffsets.forEach(({ el, startLeft, startTop }) => {
            el.style.left = (startLeft + dx) + 'px';
            el.style.top = (startTop + dy) + 'px';
        });
    }

    _handleGroupDragEnd(e) {
        if (!this.isDraggingGroup) return;
        this.isDraggingGroup = false;

        document.removeEventListener('mousemove', this._onGroupDragMove, true);
        document.removeEventListener('mouseup', this._onGroupDragEnd, true);
        document.removeEventListener('touchmove', this._onGroupDragMove, true);
        document.removeEventListener('touchend', this._onGroupDragEnd, true);

        this.selectedElements.forEach(el => el.classList.remove('lasso-dragging'));
        this._showActionBar();
        this._triggerSave();
    }

    // ================================================================
    //  UTILITIES
    // ================================================================

    _triggerSave() {
        const contentArea = document.querySelector('.content-area');
        if (contentArea && contentArea.oninput) contentArea.oninput();
        if (typeof markUnsaved === 'function') markUnsaved();
    }
}
/**
 * AudioRecorderWidget — Record & Transcribe System
 * 
 * Uses MediaRecorder API for audio capture and Web Speech API for live
 * transcription. Saves recordings as small playback widgets pinned to
 * the bottom-right corner of the page.
 * 
 * Wired to the #audioRecordBtn button in index.html.
 */
class AudioRecorderWidget {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recognition = null;
        this.transcript = '';
        this.interimTranscript = '';
        this.startTime = null;
        this.timerInterval = null;
        this.recordingPanel = null;
        this.widgetsContainer = null;
        this.recordings = [];        // { id, blobUrl, transcript, duration, timestamp }
        this.widgetCounter = 0;
    }

    // ================================================================
    //  INITIALIZATION
    // ================================================================

    initialize() {
        this._createRecordingPanel();
        this._createWidgetsContainer();
        this._wireButton();
        console.log('AudioRecorderWidget: initialized');
    }

    _wireButton() {
        const btn = document.getElementById('audioRecordBtn');
        if (btn) {
            btn.addEventListener('click', () => this.toggle());
        }
    }

    // ================================================================
    //  TOGGLE
    // ================================================================

    toggle() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    // ================================================================
    //  START RECORDING
    // ================================================================

    async startRecording() {
        // Check browser support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (typeof showToast === 'function') showToast('Microphone not supported in this browser');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Setup MediaRecorder
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: this._getSupportedMimeType()
            });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };

            this.mediaRecorder.onstop = () => {
                // Stop all tracks
                stream.getTracks().forEach(t => t.stop());
                // Process the recording
                this._finalizeRecording();
            };

            this.mediaRecorder.start(1000); // Collect data every second

            // Setup Speech Recognition
            this.transcript = '';
            this.interimTranscript = '';
            this._startSpeechRecognition();

            // UI
            this.isRecording = true;
            this.startTime = Date.now();
            this._showRecordingPanel();
            this._startTimer();

            const btn = document.getElementById('audioRecordBtn');
            if (btn) btn.classList.add('recording-active');

            if (typeof showToast === 'function') showToast('🎤 Recording started...');

        } catch (err) {
            console.error('Microphone access denied:', err);
            if (typeof showToast === 'function') showToast('Microphone access denied — check permissions');
        }
    }

    // ================================================================
    //  STOP RECORDING
    // ================================================================

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;

        // Stop MediaRecorder
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        // Stop Speech Recognition
        if (this.recognition) {
            try { this.recognition.stop(); } catch (e) { /* ignore */ }
        }

        // UI
        this._hideRecordingPanel();
        this._stopTimer();

        const btn = document.getElementById('audioRecordBtn');
        if (btn) btn.classList.remove('recording-active');
    }

    // ================================================================
    //  SPEECH RECOGNITION
    // ================================================================

    _startSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Speech Recognition not supported — recording audio only');
            this._updateTranscriptDisplay('⚠️ Transcription unavailable: your browser doesn\'t support the Web Speech API. Try Chrome or Edge. Audio is still being recorded.');
            return;
        }

        // Web Speech API requires HTTPS (or localhost) — warn immediately if on plain http/file
        const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isSecure) {
            console.warn('Speech Recognition requires HTTPS — transcription disabled');
            this._updateTranscriptDisplay('⚠️ Transcription requires HTTPS. Open this app over https:// to enable live transcription. Audio is still being recorded.');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (event) => {
            let interim = '';
            let final = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    final += result[0].transcript + ' ';
                } else {
                    interim += result[0].transcript;
                }
            }

            if (final) {
                this.transcript += final;
            }
            this.interimTranscript = interim;

            this._updateTranscriptDisplay(this.transcript + '<span class="interim-text">' + this.interimTranscript + '</span>');
        };

        this.recognition.onerror = (event) => {
            console.warn('Speech recognition error:', event.error);
            if (event.error === 'no-speech') {
                // Restart silently
                if (this.isRecording) {
                    try { this.recognition.start(); } catch (e) { /* already running */ }
                }
            } else if (event.error === 'network') {
                this._updateTranscriptDisplay('⚠️ Transcription failed: network error. This usually means the page is not served over HTTPS. Audio is still being recorded.');
            } else if (event.error === 'not-allowed') {
                this._updateTranscriptDisplay('⚠️ Microphone permission denied. Please allow microphone access and try again.');
            } else if (event.error === 'audio-capture') {
                this._updateTranscriptDisplay('⚠️ No microphone found. Please connect a microphone and try again.');
            }
        };

        this.recognition.onend = () => {
            // Auto-restart if still recording (recognition can stop for pauses)
            if (this.isRecording) {
                try { this.recognition.start(); } catch (e) { /* ignore */ }
            }
        };

        try {
            this.recognition.start();
            this._updateTranscriptDisplay('🎤 Listening…');
        } catch (e) {
            console.warn('Could not start speech recognition:', e);
            this._updateTranscriptDisplay('⚠️ Could not start transcription: ' + e.message);
        }
    }

    // ================================================================
    //  RECORDING PANEL (live overlay while recording)
    // ================================================================

    _createRecordingPanel() {
        this.recordingPanel = document.createElement('div');
        this.recordingPanel.className = 'recording-panel';
        this.recordingPanel.style.display = 'none';
        this.recordingPanel.innerHTML = `
            <div class="recording-panel-header">
                <div class="recording-indicator">
                    <span class="recording-dot"></span>
                    <span class="recording-label">Recording</span>
                </div>
                <span class="recording-timer">00:00</span>
                <button class="recording-stop-btn" title="Stop recording">⏹ Stop</button>
            </div>
            <div class="recording-transcript-live">
                <div class="recording-transcript-text">Listening...</div>
            </div>
        `;

        // Stop button handler
        this.recordingPanel.querySelector('.recording-stop-btn').addEventListener('click', () => {
            this.stopRecording();
        });

        document.body.appendChild(this.recordingPanel);
    }

    _showRecordingPanel() {
        if (!this.recordingPanel) return;
        const textEl = this.recordingPanel.querySelector('.recording-transcript-text');
        if (textEl) textEl.innerHTML = 'Listening...';
        this.recordingPanel.style.display = 'block';
    }

    _hideRecordingPanel() {
        if (this.recordingPanel) this.recordingPanel.style.display = 'none';
    }

    _updateTranscriptDisplay(html) {
        if (!this.recordingPanel) return;
        const textEl = this.recordingPanel.querySelector('.recording-transcript-text');
        if (textEl) {
            textEl.innerHTML = html || 'Listening...';
            // Auto-scroll to bottom
            textEl.scrollTop = textEl.scrollHeight;
        }
    }

    // ================================================================
    //  TIMER
    // ================================================================

    _startTimer() {
        const timerEl = this.recordingPanel ? this.recordingPanel.querySelector('.recording-timer') : null;
        this.timerInterval = setInterval(() => {
            if (!this.startTime) return;
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            if (timerEl) timerEl.textContent = `${mins}:${secs}`;
        }, 1000);
    }

    _stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    // ================================================================
    //  FINALIZE RECORDING → create widget
    // ================================================================

    _finalizeRecording() {
        const mimeType = this._getSupportedMimeType();
        const blob = new Blob(this.audioChunks, { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);

        const elapsed = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        const duration = `${mins}:${secs}`;

        const now = new Date();
        const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const finalTranscript = this.transcript.trim();

        this.widgetCounter++;
        const recording = {
            id: this.widgetCounter,
            blobUrl,
            transcript: finalTranscript || '(No speech detected)',
            duration,
            timestamp
        };
        this.recordings.push(recording);

        this._addWidget(recording);

        // Show the container if hidden
        if (this.widgetsContainer) this.widgetsContainer.style.display = 'flex';

        if (typeof showToast === 'function') showToast(`✓ Recording saved (${duration})`);
    }

    // ================================================================
    //  RECORDING WIDGETS (bottom-right corner)
    // ================================================================

    _createWidgetsContainer() {
        this.widgetsContainer = document.createElement('div');
        this.widgetsContainer.className = 'recordings-container';
        this.widgetsContainer.style.display = 'none';

        // Header
        const header = document.createElement('div');
        header.className = 'recordings-header';
        header.innerHTML = `
            <span>🎤 Recordings</span>
            <button class="recordings-minimize-btn" title="Minimize">—</button>
        `;
        header.querySelector('.recordings-minimize-btn').addEventListener('click', () => {
            const list = this.widgetsContainer.querySelector('.recordings-list');
            if (list) {
                const isHidden = list.style.display === 'none';
                list.style.display = isHidden ? 'flex' : 'none';
                header.querySelector('.recordings-minimize-btn').textContent = isHidden ? '—' : '+';
            }
        });

        this.widgetsContainer.appendChild(header);

        // List
        const list = document.createElement('div');
        list.className = 'recordings-list';
        this.widgetsContainer.appendChild(list);

        document.body.appendChild(this.widgetsContainer);
    }

    _addWidget(recording) {
        const list = this.widgetsContainer.querySelector('.recordings-list');
        if (!list) return;

        const widget = document.createElement('div');
        widget.className = 'recording-widget';
        widget.setAttribute('data-recording-id', recording.id);

        const hasTranscript = recording.transcript && recording.transcript !== '(No speech detected)';

        widget.innerHTML = `
            <div class="recording-widget-header">
                <div class="recording-widget-info">
                    <span class="recording-widget-time">${recording.timestamp}</span>
                    <span class="recording-widget-duration">${recording.duration}</span>
                </div>
                <div class="recording-widget-controls">
                    <button class="recording-play-btn" title="Play">▶</button>
                    <button class="recording-delete-btn" title="Delete">✕</button>
                </div>
            </div>
            <audio class="recording-audio" src="${recording.blobUrl}" preload="metadata"></audio>
            ${hasTranscript ? `
                <div class="recording-widget-transcript collapsed">
                    <div class="transcript-toggle">📝 Transcript <span class="transcript-arrow">▸</span></div>
                    <div class="transcript-content">${recording.transcript}</div>
                </div>
            ` : `
                <div class="recording-widget-no-transcript">No transcript available</div>
            `}
        `;

        // Play/Pause
        const playBtn = widget.querySelector('.recording-play-btn');
        const audio = widget.querySelector('.recording-audio');

        playBtn.addEventListener('click', () => {
            if (audio.paused) {
                // Pause any other playing recordings
                document.querySelectorAll('.recording-audio').forEach(a => {
                    if (a !== audio && !a.paused) {
                        a.pause();
                        a.currentTime = 0;
                        a.closest('.recording-widget').querySelector('.recording-play-btn').textContent = '▶';
                    }
                });
                audio.play();
                playBtn.textContent = '⏸';
            } else {
                audio.pause();
                playBtn.textContent = '▶';
            }
        });

        audio.addEventListener('ended', () => {
            playBtn.textContent = '▶';
        });

        // Delete
        widget.querySelector('.recording-delete-btn').addEventListener('click', () => {
            URL.revokeObjectURL(recording.blobUrl);
            widget.remove();
            this.recordings = this.recordings.filter(r => r.id !== recording.id);
            if (this.recordings.length === 0) {
                this.widgetsContainer.style.display = 'none';
            }
            if (typeof showToast === 'function') showToast('Recording deleted');
        });

        // Transcript toggle (expand/collapse)
        const transcriptToggle = widget.querySelector('.transcript-toggle');
        if (transcriptToggle) {
            transcriptToggle.addEventListener('click', () => {
                const wrapper = widget.querySelector('.recording-widget-transcript');
                const arrow = widget.querySelector('.transcript-arrow');
                wrapper.classList.toggle('collapsed');
                arrow.textContent = wrapper.classList.contains('collapsed') ? '▸' : '▾';
            });
        }

        list.insertBefore(widget, list.firstChild); // Newest on top
    }

    // ================================================================
    //  HELPERS
    // ================================================================

    _getSupportedMimeType() {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return 'audio/webm'; // fallback
    }
}


// ─── AUTH GUARD ──────────────────────────────────────────────────────────────
// auth.js is loaded before this script. If no valid session → redirect to login.
(function () {
    if (window.AUTH && !window.AUTH.isAuthenticated()) {
        window.location.replace('login.html');
    }
})();
// ─────────────────────────────────────────────────────────────────────────────

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';



// --- CONSTANTS ---
const MATH_KEYS = {
    basic: ['+', '-', '=', '≈', '≠', '±', '×', '÷', '(', ')', '[', ']', '{', '}'],
    trig: ['\\sin', '\\cos', '\\tan', '\\cot', '\\sec', '\\csc', '\\arcsin', '\\arccos', '\\arctan'],
    calc: ['\\int', '\\iint', '\\oint', '\\partial', '\\nabla', '\\sum', '\\prod', '\\lim', '\\to', '∞', 'dx', 'dt'],
    geom: ['\\perp', '\\parallel', '∠', '△', 'π', 'θ', 'α', 'β', 'φ', 'λ', 'Δ'],
    struct: ['\\frac{}{}', '^{}', '_{}', '\\sqrt{}', '\\vec{}', '\\bar{}', '\\hat{}']
};

const DISCIPLINE_REGISTRY = {
    GENERAL: { id: 'general', name: 'General' },
    CS: { id: 'cs', name: 'Computer Science' },
    MEDICAL: { id: 'medical', name: 'Medical' },
    ENGINEERING: { id: 'engineering', name: 'Engineering' }
};

const PAGE_TYPES = {
    NOTE: 'note', CONCEPT: 'concept', ALGORITHM: 'algorithm', SYSTEM: 'system', PROJECT: 'project', WHITEBOARD: 'whiteboard',
    ANATOMY: 'anatomy', DISEASE: 'disease', DRUG: 'drug', PATHWAY: 'pathway', CLINICAL_CASE: 'clinical_case', LAB: 'lab',
    DENTAL_ANATOMY: 'dental_anatomy', ORAL_PATHOLOGY: 'oral_pathology', DENTAL_PROCEDURE: 'dental_procedure', DENTAL_CASE: 'dental_case',
    PROSTHO_PLAN: 'prosthodontic_plan', ENDO_CASE: 'endodontic_case', PERIO_CASE: 'periodontal_case', ORAL_RADIOLOGY: 'oral_radiology',
    PROBLEM_SOLUTION: 'problem_solution', CIRCUIT_ANALYSIS: 'circuit_analysis', MECHANICAL_SYSTEM: 'mechanical_system',
    STRUCTURAL_ANALYSIS: 'structural_analysis', CONTROL_SYSTEM: 'control_system', PROCESS_FLOW: 'process_flow',
    DESIGN_CALCULATION: 'design_calculation', LAB_EXPERIMENT: 'lab_experiment', LOGIC_GATES: 'logic_gates',
    // Advanced Templates
    CORNELL: 'cornell', ZETTELKASTEN: 'zettelkasten', OUTLINE: 'outline',
    MINDMAP: 'mindmap', SQ3R: 'sq3r', FEYNMAN: 'feynman'
};

// --- SVG DATA FOR ATLAS ---
const BODY_SVG = `
            <svg viewBox="0 0 300 600" class="anatomy-svg">
                <path id="Head" class="anatomy-region" d="M150,20 C180,20 190,50 190,70 C190,100 170,110 150,110 C130,110 110,100 110,70 C110,50 120,20 150,20 Z" onclick="handleRegionClick('Head')"/>
                <path id="Neck" class="anatomy-region" d="M135,110 L165,110 L170,140 L130,140 Z" onclick="handleRegionClick('Neck')"/>
                <path id="Chest" class="anatomy-region" d="M110,140 L190,140 L200,220 L100,220 Z" onclick="handleRegionClick('Chest')"/>
                <path id="Abdomen" class="anatomy-region" d="M100,220 L200,220 L190,300 L110,300 Z" onclick="handleRegionClick('Abdomen')"/>
                <path id="LeftArm" class="anatomy-region" d="M200,145 L240,180 L230,280 L210,280 L220,180 L195,160 Z" onclick="handleRegionClick('Left Arm')"/>
                <path id="RightArm" class="anatomy-region" d="M100,145 L60,180 L70,280 L90,280 L80,180 L105,160 Z" onclick="handleRegionClick('Right Arm')"/>
                <path id="Pelvis" class="anatomy-region" d="M110,300 L190,300 L180,340 L120,340 Z" onclick="handleRegionClick('Pelvis')"/>
                <path id="LeftLeg" class="anatomy-region" d="M180,340 L210,550 L180,550 L160,340 Z" onclick="handleRegionClick('Left Leg')"/>
                <path id="RightLeg" class="anatomy-region" d="M120,340 L90,550 L120,550 L140,340 Z" onclick="handleRegionClick('Right Leg')"/>
            </svg>
        `;

const TOOTH_SVG = `
            <svg viewBox="0 0 300 400" class="anatomy-svg">
                <path id="Enamel" class="anatomy-region" d="M70,120 Q150,20 230,120 L210,160 Q150,140 90,160 Z" onclick="handleRegionClick('Enamel')"/>
                <path id="Dentin" class="anatomy-region" d="M90,160 Q150,140 210,160 L200,200 L100,200 Z" onclick="handleRegionClick('Dentin')"/>
                <path id="Pulp" class="anatomy-region" d="M110,200 L190,200 L180,350 L120,350 Z" onclick="handleRegionClick('Pulp Cavity')"/>
                <path id="Root" class="anatomy-region" d="M70,120 L50,350 L120,350 L110,200 L100,200 Z M230,120 L250,350 L180,350 L190,200 L200,200 Z" onclick="handleRegionClick('Root')"/>
                <path id="Gingiva" class="anatomy-region" style="fill:#e57373; stroke:#c0392b;" d="M20,250 Q150,200 280,250 L280,380 L20,380 Z" onclick="handleRegionClick('Gingiva')"/>
            </svg>
        `;

const BRAIN_SVG = `
            <svg viewBox="0 0 400 300" class="anatomy-svg">
                <path id="Frontal" class="anatomy-region" d="M50,150 Q50,50 150,50 L150,150 Z" onclick="handleRegionClick('Frontal Lobe')"/>
                <path id="Parietal" class="anatomy-region" d="M150,50 Q250,50 250,100 L150,150 Z" onclick="handleRegionClick('Parietal Lobe')"/>
                <path id="Occipital" class="anatomy-region" d="M250,100 Q300,150 250,200 L150,150 Z" onclick="handleRegionClick('Occipital Lobe')"/>
                <path id="Temporal" class="anatomy-region" d="M150,150 L250,200 Q150,250 100,200 Z" onclick="handleRegionClick('Temporal Lobe')"/>
                <path id="Cerebellum" class="anatomy-region" d="M200,220 Q280,220 260,280 Q180,280 200,220 Z" onclick="handleRegionClick('Cerebellum')"/>
                <path id="Brainstem" class="anatomy-region" d="M150,200 L150,280 L180,280 L180,220 Z" onclick="handleRegionClick('Brainstem')"/>
            </svg>
        `;

// --- INDEXEDDB STORAGE ENGINE (DB v2) ---
// DB name is per-user — each account gets its own isolated database
const DB_NAME   = (window.AUTH && window.AUTH.isAuthenticated())
    ? window.AUTH.getDbName()
    : 'NotebookDB_vSeq_anonymous';
const STORE_NAME = 'chapters';
let db;

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 4); // Bumped version for myReferences
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            if (!db.objectStoreNames.contains('myReferences')) {
                const refStore = db.createObjectStore('myReferences', { keyPath: 'id' });
                refStore.createIndex('discipline', 'discipline', { unique: false });
                refStore.createIndex('pinned', 'pinned', { unique: false });
                refStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
            }
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(db); };
        request.onerror = (e) => reject("DB Error");
    });
}

function saveChapterToDB(chapter) {
    if (!chapter.metadata) {
        chapter.metadata = { discipline: 'general', type: PAGE_TYPES.NOTE, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    }
    chapter.updatedAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(chapter);
        tx.oncomplete = () => { updateStorageQuota(); resolve(); };
        tx.onerror = () => reject();
    });
}

function loadAllChapters() {
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
    });
}

function deleteChapterFromDB(id) {
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
    });
}

function clearDB() {
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
    });
}

async function updateStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const percent = Math.min(100, (usage / (estimate.quota || 1024 * 1024 * 1000)) * 100).toFixed(1);
        const mb = (usage / 1024 / 1024).toFixed(2);
        document.getElementById('storageBar').style.width = percent + '%';
        document.getElementById('storageText').innerText = `${mb} MB (${percent}%)`;
        if (percent > 90) document.getElementById('storageBar').style.background = '#e74c3c';
    }
}

// --- APP STATE ---
let chapters = [];
let currentId = null;
let isSketchMode = false;
let activeSketchTool = 'brush';
let customStrokeStyle = null;
let isReadMode = false;
let isListening = false;
let recognition = null;
let sketchData = null;
let undoStack = [];
let redoStack = [];
let isTrayCollapsed = false;
let isRulerActive = false;
let rulerX = 200, rulerY = 300, rulerAngle = 0;
let isDraggingRuler = false, isRotatingRuler = false;
let rulerDragStartX, rulerDragStartY, rulerStartAngle;
let isMathMode = false; // Toggles keyboard visibility
let savedRange = null; // Stores cursor position
let editingMathElement = null; // Stores reference to math element being edited

const canvas = document.getElementById('sketchCanvas');
const ctx = canvas.getContext('2d');
let drawing = false;

const markdownTriggers = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'unordered-list', '*': 'unordered-list', '1.': 'ordered-list', '>': 'blockquote', '[]': 'checkbox', '---': 'hr' };

// --- GLOBAL SELECTION HELPER FUNCTIONS ---
function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        // We need to support multiple editors now in the stream
        const stream = document.getElementById('sequentialStream');
        if (stream.contains(range.commonAncestorContainer)) {
            savedRange = range;
        }
    }
}

function restoreSelection() {
    if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
    }
}

function handleMarkdownInput(e) {
    if (e.data === ' ') {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const node = selection.anchorNode;
        if (node.nodeType !== 3) return;
        const text = node.textContent;
        const parts = text.split(/[\s\u00A0]+/);
        const trigger = parts[0];
        if (markdownTriggers[trigger]) {
            const action = markdownTriggers[trigger];
            const cleanText = text.substring(trigger.length).trim();
            node.textContent = cleanText;
            if (action === 'h1') document.execCommand('formatBlock', false, 'H1');
            else if (action === 'h2') document.execCommand('formatBlock', false, 'H2');
            else if (action === 'h3') document.execCommand('formatBlock', false, 'H3');
            else if (action === 'unordered-list') document.execCommand('insertUnorderedList');
            else if (action === 'ordered-list') document.execCommand('insertOrderedList');
            else if (action === 'blockquote') document.execCommand('formatBlock', false, 'BLOCKQUOTE');
            else if (action === 'hr') document.execCommand('insertHorizontalRule');
            else if (action === 'checkbox') insertBlock('todo');

            // Mark unsaved for the specific editor block
            const block = node.parentElement.closest('.content-area');
            if (block && block.oninput) block.oninput();
        }
    }
}

async function initApp() {
    try {
        await initDB();
        chapters = await loadAllChapters();
        chapters.sort((a, b) => new Date(b.lastEdited) - new Date(a.lastEdited));

        if (chapters.length === 0) {
            createNewChapter();
        } else {
            renderSidebar();
            loadChapter(chapters[0].id);
        }

        setupDragAndDrop();
        updateStorageQuota();

        // Initialize My References
        await initMyReferences();

        // Set default paper texture (Grid)
        const paper = document.getElementById('paper');
        if (paper && !paper.className.includes('-texture')) {
            paper.classList.add('grid-texture');
        }

        document.addEventListener('selectionchange', () => {
            saveSelection();
            handleSelectionChange();
        });

        // Event delegation for checkbox toggles
        document.getElementById('sequentialStream').addEventListener('click', function (e) {
            if (e.target.classList.contains('checkbox')) {
                e.preventDefault();
                e.target.classList.toggle('checked');
                const wrapper = e.target.parentElement;
                const textDiv = wrapper.nextElementSibling;
                if (textDiv && textDiv.classList.contains('checklist-text')) {
                    textDiv.classList.toggle('completed');
                }
                // Trigger save on the specific editor block
                const block = e.target.closest('.content-area');
                if (block && block.oninput) block.oninput();
            }
        });

        // Markdown support on stream container
        document.getElementById('sequentialStream').addEventListener('input', handleMarkdownInput);

        setupRulerEvents();
        switchMathTab('basic');

    } catch (err) {
        console.error(err);
    }
}

// --- TAGGING LOGIC ---

// This function builds the tag list in the sidebar based on ALL chapters
function renderTagsSidebar() {
    const container = document.getElementById('tagCloud');
    if (!container) return;

    const allTags = new Set();
    chapters.forEach(ch => {
        if (ch.tags && Array.isArray(ch.tags)) {
            ch.tags.forEach(t => allTags.add(t));
        }
    });

    const sortedTags = Array.from(allTags).sort();
    container.innerHTML = '';

    if (sortedTags.length === 0) {
        container.innerHTML = '<div style="font-size:0.8rem; opacity:0.5; padding:5px;">No tags yet...</div>';
        return;
    }

    sortedTags.forEach(tag => {
        const div = document.createElement('div');
        div.className = 'tag-cloud-item';
        div.innerText = '#' + tag;
        div.onclick = () => filterByTag(tag);
        container.appendChild(div);
    });
}

function filterByTag(tag) {
    const searchInput = document.getElementById('sidebarSearch');
    searchInput.value = '#' + tag;
    renderSidebar();
}

// Functions for Modal-based Tag Management
function handleMetaTagInput(e) {
    if (e.key === 'Enter') {
        addTagFromInput();
    }
}

async function addTagFromInput() {
    const input = document.getElementById('metaTagInput');
    const tag = input.value.trim().replace(/^#/, '');

    if (tag) {
        const chapter = chapters.find(c => c.id === currentId);
        if (chapter) {
            if (!chapter.tags) chapter.tags = [];
            if (!chapter.tags.includes(tag)) {
                chapter.tags.push(tag);
                await saveChapterToDB(chapter);
                input.value = '';
                openMetadataModal(); // Re-render modal to show new tag
                renderSidebar(); // Update sidebar tags list
                loadChapter(currentId); // Reload stream to reflect tag grouping
            }
        }
    }
}

async function removeTagFromModal(tag) {
    const chapter = chapters.find(c => c.id === currentId);
    if (chapter && chapter.tags) {
        chapter.tags = chapter.tags.filter(t => t !== tag);
        await saveChapterToDB(chapter);
        openMetadataModal(); // Re-render
        renderSidebar(); // Update sidebar
        loadChapter(currentId); // Reload stream to update grouping
    }
}

// --- MATH KEYBOARD LOGIC ---
function switchMathTab(category, btn) {
    document.querySelectorAll('.math-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else if (!btn && document.querySelector('.math-tab-btn')) document.querySelector('.math-tab-btn').classList.add('active');

    const container = document.getElementById('mathKeys');
    container.innerHTML = '';

    const keys = MATH_KEYS[category] || [];
    keys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'math-key';
        let label = k.replace('\\', '');

        if (category === 'basic') {
            if (k === '\\approx') label = '≈';
            else if (k === '\\neq') label = '≠';
            else if (k === '\\pm') label = '±';
            else if (k === '\\times') label = '×';
            else if (k === '\\div') label = '÷';
        } else if (category === 'calc') {
            if (k === '\\int') label = '∫';
            else if (k === '\\sum') label = 'Σ';
            else if (k === '\\prod') label = 'Π';
            else if (k === '\\partial') label = '∂';
            else if (k === '\\nabla') label = '∇';
            else if (k === '\\infty') label = '∞';
        } else if (category === 'geom') {
            if (k === '\\pi') label = 'π';
            else if (k === '\\theta') label = 'θ';
            else if (k === '\\alpha') label = 'α';
            else if (k === '\\beta') label = 'β';
            else if (k === '\\phi') label = 'φ';
            else if (k === '\\lambda') label = 'λ';
            else if (k === '\\Delta') label = 'Δ';
            else if (k === '\\perp') label = '⊥';
            else if (k === '\\parallel') label = '∥';
            else if (k === '\\angle') label = '∠';
            else if (k === '\\triangle') label = '△';
        }

        if (k.includes('frac')) label = 'a/b';
        else if (k.includes('sqrt')) label = '√';
        else if (k.includes('^')) label = 'xʸ';
        else if (k.includes('_')) label = 'xₙ';
        else if (k === '\\int_{}^{}') label = '∫ₐᵇ';
        else if (k === '\\vec{}') label = 'v⃗';
        else if (k === '\\bar{}') label = 'x̄';
        else if (k === '\\hat{}') label = 'x̂';

        btn.innerText = label;
        btn.onclick = () => {
            const buffer = document.getElementById('mathBuffer');
            const val = k.startsWith('\\') && category === 'trig' ? k + ' ' : k;
            buffer.value += val;
            updateMathPreview();
            buffer.focus();
        };
        container.appendChild(btn);
    });
}

function updateMathPreview() {
    const input = document.getElementById('mathBuffer').value;
    const preview = document.getElementById('mathPreview');
    try {
        if (window.katex) {
            preview.innerHTML = katex.renderToString(input, { throwOnError: false });
        } else {
            preview.innerText = input;
        }
    } catch (e) {
        preview.innerText = "...";
    }
}

function insertMathFromBuffer() {
    const buffer = document.getElementById('mathBuffer');
    const latex = buffer.value.trim();
    if (!latex) return;

    const isDisplay = editingMathElement && editingMathElement.classList.contains('math-display');

    let mathHtml = '';
    if (window.katex) {
        mathHtml = katex.renderToString(latex, { throwOnError: false, displayMode: isDisplay });
    } else {
        mathHtml = `<span style="font-family:monospace; background:#eee;">${latex}</span>`;
    }

    if (editingMathElement) {
        editingMathElement.setAttribute('data-latex', latex);
        editingMathElement.innerHTML = mathHtml;
        editingMathElement = null;
    } else {
        const html = `<span class="math-block" contenteditable="false" data-latex="${latex}" style="padding:0 5px; cursor:pointer;" onclick="editMathBlock(this)">${mathHtml}</span>&nbsp;`;

        // Check if active element is an editor
        if (document.activeElement && document.activeElement.classList.contains('content-area')) {
            document.execCommand('insertHTML', false, html);
        } else {
            // Fallback to primary editor
            const editor = document.querySelector('.content-area');
            editor.focus();
            document.execCommand('insertHTML', false, html);
        }
    }

    buffer.value = '';
    updateMathPreview();
}

window.editMathBlock = (el) => {
    editingMathElement = el;
    const latex = el.getAttribute('data-latex');
    document.getElementById('mathBuffer').value = latex;
    updateMathPreview();
    toggleMathMode(true);
};

window.toggleMathMode = (forceOpen = false) => {
    const keyboard = document.getElementById('mathKeyboard');
    const btn = document.getElementById('mathModeBtn');

    if (forceOpen === true) {
        isMathMode = true;
    } else {
        isMathMode = !isMathMode;
    }

    if (isMathMode) {
        keyboard.style.display = 'flex';
        if (btn) btn.classList.add('active');
        document.querySelector('.sidebar').style.bottom = '220px';
    } else {
        keyboard.style.display = 'none';
        if (btn) btn.classList.remove('active');
        document.querySelector('.sidebar').style.bottom = '0';
        editingMathElement = null;
    }
};

// --- DISCIPLINE TOOLBAR FUNCTIONS ---
window.insertAlgoStep = () => { insertHtml(`<div class="chalk-code" contenteditable="true">1. Step description...<br>   ↳ Logic/Condition</div>`); }
window.insertComplexity = () => { insertHtml(`<span class="algo-badge" contenteditable="true">Time: O(n)</span>&nbsp;`); }

window.insertTraceTable = () => {
    saveSelection();
    document.getElementById('traceModal').style.display = 'flex';
    document.getElementById('traceVarCount').focus();
}

window.closeTraceModal = () => {
    document.getElementById('traceModal').style.display = 'none';
}

window.confirmTraceTable = () => {
    const count = document.getElementById('traceVarCount').value;
    const n = parseInt(count);
    if (isNaN(n) || n < 1) return;

    let headers = "";
    let cells = "";

    for (let i = 1; i <= n; i++) {
        headers += `<th>Var ${i}</th>`;
        cells += `<td>-</td>`;
    }

    headers += "<th>Output</th>";
    cells += "<td>-</td>";

    const html = `
                <div class="trace-table-container" style="overflow-x:auto; margin:10px 0;">
                    <button contenteditable="false" onclick="addTraceColumn(this)" class="btn-trace-add" title="Add Variable">+</button>
                    <table class="trace-table" style="width:100%; min-width:100%;">
                        <thead><tr>${headers}</tr></thead>
                        <tbody>
                            <tr>${cells}</tr>
                            <tr>${cells}</tr>
                            <tr>${cells}</tr>
                        </tbody>
                    </table>
                </div>
                <p><br></p>
            `;
    restoreSelection();
    insertHtml(html);
    closeTraceModal();
}

window.addTraceColumn = (btn) => {
    const container = btn.closest('.trace-table-container');
    if (!container) return;
    const table = container.querySelector('table');
    if (!table) return;

    const headRow = table.tHead.rows[0];
    const bodyRows = table.tBodies[0].rows;

    let insertIndex = headRow.cells.length - 1;

    let maxVar = 0;
    for (let cell of headRow.cells) {
        const match = cell.innerText.trim().match(/^Var\s+(\d+)/);
        if (match) {
            const num = parseInt(match[1]);
            if (num > maxVar) maxVar = num;
        }
    }
    const newVarName = `Var ${maxVar + 1}`;

    const newTh = document.createElement('th');
    newTh.innerText = newVarName;
    headRow.insertBefore(newTh, headRow.cells[insertIndex]);

    for (let row of bodyRows) {
        const newTd = document.createElement('td');
        newTd.innerText = '-';
        row.insertBefore(newTd, row.cells[insertIndex]);
    }

    // Trigger save on the specific editor block
    const block = btn.closest('.content-area');
    if (block && block.oninput) block.oninput();
};

// Medical Tools
window.activeAnatomyPinMode = false;
window.activateAnatomyPin = () => {
    window.activeAnatomyPinMode = true;
    document.getElementById('paper').style.cursor = 'crosshair';
    showToast("Tap paper to place pin");
}

document.getElementById('paper').addEventListener('click', function (e) {
    if (!window.activeAnatomyPinMode) return;
    if (e.target.closest('.writing-tools') || e.target.closest('.tool-tray-container')) return;

    // Fix: Find the specific editor block the user clicked on
    let targetEditor = e.target.closest('.content-area');

    // If user clicked on a pin or something inside an editor, get the editor
    if (!targetEditor) {
        // Fallback: Check if we clicked an element inside the stream
        const streamItem = e.target.closest('.sequence-editor-block');
        if (streamItem) {
            targetEditor = streamItem.querySelector('.content-area');
        }
    }

    // If still no editor (e.g. clicked margin/gap), default to the closest or active one
    if (!targetEditor) {
        // Try finding the element at the click coordinates again to be sure
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        targetEditor = elements.find(el => el.classList.contains('content-area'));

        // Ultimate fallback to the primary editor if clicking dead space
        if (!targetEditor) targetEditor = document.querySelector('.content-area');
    }

    const rect = targetEditor.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const globalCount = document.querySelectorAll('.anatomy-pin').length + 1;
    const pin = document.createElement('div');
    pin.className = 'anatomy-pin';
    pin.setAttribute('contenteditable', 'false');
    pin.style.left = (x - 12) + 'px'; // Center the 24px pin
    pin.style.top = (y - 12) + 'px';
    pin.innerHTML = `<span>${globalCount}</span>`;

    targetEditor.appendChild(pin);

    const legendHtml = `<div class="checklist-item">
                <div style="background:var(--med-accent); color:white; width:20px; height:20px; border-radius:50%; text-align:center; font-size:0.7rem; line-height:20px; margin-right:10px;">${globalCount}</div>
                <div class="checklist-text" contenteditable="true">Label...</div>
            </div>`;

    // Use insertAdjacentHTML to avoid breaking existing event listeners (checkboxes, etc)
    targetEditor.insertAdjacentHTML('beforeend', legendHtml);

    window.activeAnatomyPinMode = false;
    document.getElementById('paper').style.cursor = 'default';
    if (targetEditor.oninput) targetEditor.oninput();
});

window.setHighlightPreset = (type) => {
    customStrokeStyle = (type === 'symptom') ? 'rgba(255, 235, 59, 0.4)' : 'rgba(231, 76, 60, 0.4)';
    activeSketchTool = 'custom';
    const highlighterBtn = document.querySelector('.tool-opt.highlighter');
    if (highlighterBtn) highlighterBtn.click();
}

window.insertTimeline = () => {
    const html = `
                <div class="timeline-wrapper" style="margin:15px 0;">
                    <div class="timeline-container">
                        <div class="timeline-entry">
                            <strong class="time-label" contenteditable="true">00:00</strong> - 
                            <span class="event-desc" contenteditable="true">Event...</span>
                        </div>
                    </div>
                    <button contenteditable="false" onclick="addTimelineEvent(this)" class="btn-trace-add" style="background:var(--med-accent);" title="Add Event (+10m)">+</button>
                </div>
                <p><br></p>
            `;
    insertHtml(html);
}

window.addTimelineEvent = (btn) => {
    const wrapper = btn.closest('.timeline-wrapper');
    const container = wrapper.querySelector('.timeline-container');
    const lastEntry = container.lastElementChild;
    let timeStr = "00:00";

    if (lastEntry) {
        const label = lastEntry.querySelector('.time-label');
        if (label) timeStr = label.innerText.trim();
    }

    let [h, m] = timeStr.split(':').map(n => parseInt(n) || 0);
    m += 10;
    if (m >= 60) {
        h += Math.floor(m / 60);
        m = m % 60;
    }
    if (h >= 24) h = h % 24;

    const newTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    const newEntry = document.createElement('div');
    newEntry.className = 'timeline-entry';
    newEntry.innerHTML = `<strong class="time-label" contenteditable="true">${newTime}</strong> - <span class="event-desc" contenteditable="true">...</span>`;

    container.appendChild(newEntry);

    // Trigger save
    const block = btn.closest('.content-area');
    if (block && block.oninput) block.oninput();
}

window.insertComparison = () => {
    const html = `
                <div class="comparison-wrapper" style="margin:15px 0;">
                    <table class="comparison-table">
                        <thead>
                            <tr><th contenteditable="true">Item A</th><th contenteditable="true">Item B</th></tr>
                        </thead>
                        <tbody>
                            <tr><td contenteditable="true">Value</td><td contenteditable="true">Value</td></tr>
                        </tbody>
                    </table>
                    <button contenteditable="false" onclick="addComparisonRow(this)" class="btn-trace-add" style="background:var(--med-accent);" title="Add Row">+</button>
                </div>
                <p><br></p>
            `;
    insertHtml(html);
}

window.addComparisonRow = (btn) => {
    const wrapper = btn.closest('.comparison-wrapper');
    const table = wrapper.querySelector('table tbody');
    const colCount = wrapper.querySelector('table thead tr').children.length;

    const row = document.createElement('tr');
    let cells = "";
    for (let i = 0; i < colCount; i++) cells += `<td contenteditable="true">-</td>`;
    row.innerHTML = cells;

    table.appendChild(row);

    const block = btn.closest('.content-area');
    if (block && block.oninput) block.oninput();
}

// Engineering Tools
window.insertEquation = () => {
    const latex = "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}";
    let mathHtml = "";
    if (window.katex) {
        mathHtml = katex.renderToString(latex, { throwOnError: false, displayMode: true });
    } else {
        mathHtml = latex;
    }
    const html = `<div class="math-display" contenteditable="false" data-latex="${latex}" style="text-align:center; padding:10px; cursor:pointer; background:rgba(0,0,0,0.03); border-radius:4px; margin: 10px 0;" onclick="editMathBlock(this)">${mathHtml}</div><p><br></p>`;
    insertHtml(html);
}
window.insertAssumptions = () => { insertHtml(`<h3 style="color:#7f8c8d; border-bottom:1px solid #eee;">Assumptions</h3><ul><li>Steady state</li><li>Adiabatic</li></ul>`); }

// --- CONSTANTS TOOL LOGIC ---
const ENG_CONSTANTS = {
    'g': '9.81 m/s²',
    'pi': '3.14159',
    'π': '3.14159',
    'e': '2.71828',
    'c': '3.00 × 10⁸ m/s',
    'h': '6.626 × 10⁻³⁴ J·s',
    'G': '6.674 × 10⁻¹¹ N·m²/kg²',
    'atm': '101,325 Pa',
    'R': '8.314 J/(mol·K)',
    'Na': '6.022 × 10²³ mol⁻¹',
    'k': '1.380 × 10⁻²³ J/K'
};

window.insertConstants = () => {
    saveSelection();
    document.getElementById('constantModal').style.display = 'flex';
    document.getElementById('constInput').value = '';
    document.getElementById('constValue').value = '';
    document.getElementById('constInput').focus();
}

window.closeConstantModal = () => {
    document.getElementById('constantModal').style.display = 'none';
};

window.lookupConstant = () => {
    const key = document.getElementById('constInput').value.trim();
    const valInput = document.getElementById('constValue');

    if (ENG_CONSTANTS[key]) {
        valInput.value = ENG_CONSTANTS[key];
    } else if (ENG_CONSTANTS[key.toLowerCase()]) {
        valInput.value = ENG_CONSTANTS[key.toLowerCase()];
    }
};

window.confirmConstant = () => {
    const sym = document.getElementById('constInput').value.trim();
    const val = document.getElementById('constValue').value.trim();

    if (sym && val) {
        restoreSelection();
        insertHtml(`<div class="chalk-code">${sym} = ${val}</div><p><br></p>`);
    }
    closeConstantModal();
};

window.toggleRuler = () => {
    isRulerActive = !isRulerActive;
    document.getElementById('engRuler').style.display = isRulerActive ? 'block' : 'none';
}

function setupRulerEvents() {
    const ruler = document.getElementById('engRuler');
    const rotateHandle = document.getElementById('rulerRotate');

    ruler.addEventListener('mousedown', (e) => {
        if (e.target === rotateHandle) return;
        isDraggingRuler = true;
        rulerDragStartX = e.clientX - ruler.offsetLeft;
        rulerDragStartY = e.clientY - ruler.offsetTop;
    });

    rotateHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isRotatingRuler = true;
        const rect = ruler.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        rulerStartAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) - (rulerAngle * Math.PI / 180);
    });

    window.addEventListener('mousemove', (e) => {
        if (isDraggingRuler) {
            rulerX = e.clientX - rulerDragStartX;
            rulerY = e.clientY - rulerDragStartY;
            ruler.style.left = rulerX + 'px';
            ruler.style.top = rulerY + 'px';
        }
        if (isRotatingRuler) {
            const rect = ruler.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
            rulerAngle = (angle - rulerStartAngle) * 180 / Math.PI;
            ruler.style.transform = `rotate(${rulerAngle}deg)`;
        }
    });

    window.addEventListener('mouseup', () => {
        isDraggingRuler = false;
        isRotatingRuler = false;
    });
}

// --- NEW PDF IMPORT LOGIC ---
window.importPdfToCanvas = async (input) => {
    const file = input.files[0];
    if (!file) return;

    showToast("Rendering PDF...");

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

        // Get the current content area (where user edits)
        const contentArea = document.querySelector('.content-area');
        if (!contentArea) {
            showToast("⚠️ Please create a page first");
            return;
        }

        // Clear existing content and prepare for PDF
        contentArea.innerHTML = '';
        contentArea.style.position = 'relative';

        const pdfPagesData = [];
        const pdfContainer = document.createElement('div');
        pdfContainer.style.cssText = 'position: relative; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 20px;';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const scale = 1.5;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page-render';
            canvas.style.cssText = 'max-width: 100%; height: auto; box-shadow: 0 4px 10px rgba(0,0,0,0.1); background: white;';
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Create wrapper for each page
            const pageWrapper = document.createElement('div');
            pageWrapper.style.cssText = 'position: relative; width: 100%; display: flex; justify-content: center;';
            pageWrapper.appendChild(canvas);
            pdfContainer.appendChild(pageWrapper);

            pdfPagesData.push(canvas.toDataURL('image/jpeg', 0.8));
        }

        // Inject PDF into content area
        contentArea.appendChild(pdfContainer);
        contentArea.contentEditable = 'true'; // Allow annotations on top

        const chapter = chapters.find(c => c.id === currentId);
        if (chapter) {
            chapter.pdfPages = pdfPagesData;
            chapter.content = contentArea.innerHTML; // Save the PDF-injected content
            await saveChapterToDB(chapter);
        }

        setTimeout(resizeCanvas, 100);
        showToast(`✓ PDF loaded: ${pdf.numPages} pages. Click to add annotations!`);

    } catch (err) {
        console.error(err);
        showToast("Error reading PDF");
    }
};

let pendingPdfInput = null;

window.loadLecturePdf = (input) => {
    if (!input.files || !input.files[0]) return;
    pendingPdfInput = input;
    document.getElementById('pdfModeModal').style.display = 'flex';
};

window.closePdfModeModal = () => {
    document.getElementById('pdfModeModal').style.display = 'none';
    if (pendingPdfInput) {
        pendingPdfInput.value = '';
        pendingPdfInput = null;
    }
};

window.resolvePdfMode = (mode) => {
    if (!pendingPdfInput) return;

    if (mode === 'annotate') {
        importPdfToCanvas(pendingPdfInput);
    } else {
        const file = pendingPdfInput.files[0];
        const url = URL.createObjectURL(file);
        document.getElementById('lectureFrame').src = url;
        document.body.classList.add('split-mode');
        showToast("Lecture Loaded in Split View");
    }
    document.getElementById('pdfModeModal').style.display = 'none';
    pendingPdfInput = null;
};

// --- TOOLBAR SWITCHING ---
function updateToolVisibility(chapter) {
    const csTools = document.getElementById('tools-cs');
    if (csTools) csTools.style.display = 'none';

    const medTools = document.getElementById('tools-med');
    if (medTools) medTools.style.display = 'none';

    const engTools = document.getElementById('tools-eng');
    if (engTools) engTools.style.display = 'none';

    const circuitTools = document.getElementById('tools-circuit');
    if (circuitTools) circuitTools.style.display = 'none';

    document.getElementById('engRuler').style.display = 'none';
    isRulerActive = false;
    isMathMode = false;
    const mathBtn = document.getElementById('mathModeBtn');
    if (mathBtn) mathBtn.classList.remove('active');

    const disc = chapter?.metadata?.discipline;
    const pageType = chapter?.metadata?.type;

    if (disc === 'cs' && csTools) csTools.style.display = 'flex';
    if (disc === 'medical' && medTools) medTools.style.display = 'flex';
    if (disc === 'engineering' && engTools) engTools.style.display = 'flex';

    // Show circuit components tool only for Circuit Analysis template
    if (pageType === PAGE_TYPES.CIRCUIT_ANALYSIS && circuitTools) {
        circuitTools.style.display = 'flex';
    }

    // Update Knowledge Base based on discipline
    updateKnowledgeBase(disc);
}

window.insertCSCodeBlock = () => {
    const html = `
                <div class="cs-code-container" contenteditable="false">
                    <div class="cs-code-header">
                        <div style="display:flex; align-items:center;">
                            <span style="margin-right:10px;">Code Snippet</span>
                            <select class="cs-lang-select" onchange="updateCodeLanguage(this)">
                                <option value="javascript">JS</option>
                                <option value="python">Python</option>
                                <option value="java">Java</option>
                                <option value="cpp">C++</option>
                                <option value="html">HTML</option>
                                <option value="css">CSS</option>
                                <option value="sql">SQL</option>
                            </select>
                        </div>
                        <div>
                            <span style="font-size:0.7rem; opacity:0.7; margin-right:5px;">Editable</span>
                            <button class="cs-format-btn" onclick="formatCodeBlock(this)">⚡ Format</button>
                        </div>
                    </div>
                    <div class="cs-code-editor language-javascript" contenteditable="true" onfocus="unformatCode(this)" onblur="formatCodeBlock(this)">// Write code here...</div>
                    <div class="cs-code-output" contenteditable="true">Result...</div>
                </div>
                <p><br></p>
            `;
    insertHtml(html);
};

window.updateCodeLanguage = (select) => {
    const container = select.closest('.cs-code-container');
    const editor = container.querySelector('.cs-code-editor');
    editor.classList.forEach(cls => {
        if (cls.startsWith('language-')) editor.classList.remove(cls);
    });
    editor.classList.add(`language-${select.value}`);
    if (document.activeElement !== editor) {
        formatCodeBlock(select);
    }
};

window.formatCodeBlock = (el) => {
    const container = el.closest('.cs-code-container');
    const editor = container.querySelector('.cs-code-editor');
    const langSelect = container.querySelector('.cs-lang-select');
    const lang = langSelect.value;
    const code = editor.innerText;

    if (Prism && Prism.languages[lang]) {
        const highlighted = Prism.highlight(code, Prism.languages[lang], lang);
        editor.innerHTML = highlighted;
    }
};

window.unformatCode = (editor) => {
    const code = editor.innerText;
    editor.innerText = code;
};

window.filterChapters = () => {
    renderSidebar();
}

// --- METADATA MODAL ---
window.openMetadataModal = () => {
    const chapter = chapters.find(c => c.id === currentId);
    if (!chapter) return;

    document.getElementById('metaDiscipline').value = chapter.metadata?.discipline || 'general';
    document.getElementById('metaType').value = chapter.metadata?.type || 'note';
    document.getElementById('metaDifficulty').value = chapter.metadata?.difficulty || 'medium';
    document.getElementById('metaSystem').value = chapter.metadata?.system || '';
    document.getElementById('metaCreated').innerText = new Date(chapter.metadata?.createdAt).toLocaleString();

    // Populate Tags List in Modal
    const tagsList = document.getElementById('metaTagsList');
    tagsList.innerHTML = '';
    (chapter.tags || []).forEach(tag => {
        const chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.innerHTML = `<span>#${tag}</span><span class="tag-remove" onclick="removeTagFromModal('${tag}')">×</span>`;
        tagsList.appendChild(chip);
    });

    const dentalTypes = [
        PAGE_TYPES.DENTAL_ANATOMY, PAGE_TYPES.ORAL_PATHOLOGY, PAGE_TYPES.DENTAL_PROCEDURE,
        PAGE_TYPES.DENTAL_CASE, PAGE_TYPES.PROSTHO_PLAN, PAGE_TYPES.ENDO_CASE,
        PAGE_TYPES.PERIO_CASE, PAGE_TYPES.ORAL_RADIOLOGY
    ];
    const dentalGroup = document.getElementById('dentalMetaGroup');
    if (dentalTypes.includes(chapter.metadata?.type)) {
        dentalGroup.style.display = 'block';
        document.getElementById('metaTooth').value = chapter.metadata?.toothNumber || '';
        document.getElementById('metaQuadrant').value = chapter.metadata?.quadrant || '';
        document.getElementById('metaSpecialty').value = chapter.metadata?.specialty || '';
    } else {
        dentalGroup.style.display = 'none';
    }

    const engTypes = [
        PAGE_TYPES.PROBLEM_SOLUTION, PAGE_TYPES.CIRCUIT_ANALYSIS, PAGE_TYPES.MECHANICAL_SYSTEM,
        PAGE_TYPES.STRUCTURAL_ANALYSIS, PAGE_TYPES.CONTROL_SYSTEM, PAGE_TYPES.PROCESS_FLOW,
        PAGE_TYPES.DESIGN_CALCULATION, PAGE_TYPES.LAB_EXPERIMENT
    ];
    const engGroup = document.getElementById('engineeringMetaGroup');
    if (engTypes.includes(chapter.metadata?.type) || chapter.metadata?.discipline === 'engineering') {
        engGroup.style.display = 'block';
        document.getElementById('metaEngBranch').value = chapter.metadata?.branch || 'General';
    } else {
        engGroup.style.display = 'none';
    }

    document.getElementById('metadataModal').style.display = 'flex';
};

window.closeMetadataModal = () => {
    document.getElementById('metadataModal').style.display = 'none';
};

// --- ACTIVE RECALL STICKER LOGIC ---
let isStickerMode = false;
let stickerStartX = 0;
let stickerStartY = 0;
let stickerPreview = null;

window.toggleStickerMode = () => {
    isStickerMode = !isStickerMode;
    const btn = document.getElementById('stickerBtn');
    const editor = document.querySelector('.content-area');

    if (isStickerMode) {
        btn.classList.add('active');
        if (editor) editor.contentEditable = "false";
        document.getElementById('paper').style.cursor = "crosshair";
        showToast("Draw stickers over text/images");
        if (isSketchMode) toggleSketchMode();
    } else {
        btn.classList.remove('active');
        if (editor) editor.contentEditable = "true";
        document.getElementById('paper').style.cursor = "default";
    }
};

const paper = document.getElementById('paper');

function getEventCoords(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function startSticker(e) {
    if (!isStickerMode) return;
    // Allow interactions with tools
    if (e.target.closest('.tool-tray') || e.target.closest('.writing-tools')) return;
    // Don't start drawing a new sticker if clicking an existing one (handled by drag logic)
    if (e.target.classList.contains('recall-sticker')) return;

    // Prevent scrolling on touch
    if (e.type === 'touchstart') {
        e.preventDefault();
    } else {
        e.preventDefault(); // Prevent text selection on mouse
    }

    const coords = getEventCoords(e);

    // Get active editor block in the stream to attach sticker to
    let targetEl = document.elementFromPoint(coords.x, coords.y);

    if (!targetEl) return;

    const editor = targetEl.closest('.content-area') || document.querySelector('.content-area');
    if (!editor) return;

    const rect = editor.getBoundingClientRect();
    stickerStartX = coords.x - rect.left;
    stickerStartY = coords.y - rect.top;

    stickerPreview = document.createElement('div');
    stickerPreview.className = 'recall-sticker';
    stickerPreview.style.left = stickerStartX + 'px';
    stickerPreview.style.top = stickerStartY + 'px';
    stickerPreview.style.width = '0px';
    stickerPreview.style.height = '0px';
    stickerPreview.style.opacity = '0.5';
    stickerPreview.style.pointerEvents = 'none';

    editor.appendChild(stickerPreview);
}

function moveSticker(e) {
    if (!isStickerMode || !stickerPreview) return;

    if (e.type === 'touchmove') e.preventDefault();

    const coords = getEventCoords(e);
    const editor = stickerPreview.parentElement;
    const rect = editor.getBoundingClientRect();

    const currentX = coords.x - rect.left;
    const currentY = coords.y - rect.top;

    const width = currentX - stickerStartX;
    const height = currentY - stickerStartY;

    stickerPreview.style.width = Math.abs(width) + 'px';
    stickerPreview.style.height = Math.abs(height) + 'px';
    stickerPreview.style.left = (width < 0 ? currentX : stickerStartX) + 'px';
    stickerPreview.style.top = (height < 0 ? currentY : stickerStartY) + 'px';
}

function endSticker(e) {
    if (!isStickerMode || !stickerPreview) return;

    const width = parseFloat(stickerPreview.style.width);
    const height = parseFloat(stickerPreview.style.height);

    if (width > 20 && height > 20) {
        stickerPreview.style.opacity = '1';
        stickerPreview.style.pointerEvents = 'auto';
        stickerPreview.setAttribute('contenteditable', 'false');

        // Add right click / long press handler for removal
        stickerPreview.oncontextmenu = (ev) => {
            ev.preventDefault();
            if (confirm('Remove this sticker?')) ev.target.remove();
            // Save trigger
            const block = ev.target.closest('.content-area');
            if (block && block.oninput) block.oninput();
        };

        const block = stickerPreview.closest('.content-area');
        if (block && block.oninput) block.oninput();
    } else {
        stickerPreview.remove();
    }
    stickerPreview = null;
}

paper.addEventListener('mousedown', startSticker);
paper.addEventListener('mousemove', moveSticker);
paper.addEventListener('mouseup', endSticker);

paper.addEventListener('touchstart', startSticker, { passive: false });
paper.addEventListener('touchmove', moveSticker, { passive: false });
paper.addEventListener('touchend', endSticker);

// Sticker Drag Logic
let dragItem = null;
let dragStartX = 0;
let dragStartY = 0;
let dragInitialLeft = 0;
let dragInitialTop = 0;
let isDraggingObject = false;

function handleObjectDragStart(e) {
    if (!e.target.classList.contains('recall-sticker')) return;

    e.preventDefault();
    e.stopPropagation();

    dragItem = e.target;
    const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
    const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);

    dragStartX = clientX;
    dragStartY = clientY;

    dragInitialLeft = parseFloat(dragItem.style.left) || 0;
    dragInitialTop = parseFloat(dragItem.style.top) || 0;

    isDraggingObject = false;
}

function handleObjectDragMove(e) {
    if (!dragItem) return;
    e.preventDefault();
    const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
    const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    const dx = clientX - dragStartX;
    const dy = clientY - dragStartY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDraggingObject = true;
    }
    if (isDraggingObject) {
        dragItem.style.left = (dragInitialLeft + dx) + 'px';
        dragItem.style.top = (dragInitialTop + dy) + 'px';
    }
}

function handleObjectDragEnd(e) {
    if (!dragItem) return;
    if (!isDraggingObject) {
        dragItem.classList.toggle('revealed');
    } else {
        // Save position
        const block = dragItem.closest('.content-area');
        if (block && block.oninput) block.oninput();
    }
    dragItem = null;
    isDraggingObject = false;
}

// Apply drag listeners to the stream container
const streamEl = document.getElementById('sequentialStream');
streamEl.addEventListener('mousedown', handleObjectDragStart);
window.addEventListener('mousemove', handleObjectDragMove);
window.addEventListener('mouseup', handleObjectDragEnd);

streamEl.addEventListener('touchstart', handleObjectDragStart, { passive: false });
window.addEventListener('touchmove', handleObjectDragMove, { passive: false });
window.addEventListener('touchend', handleObjectDragEnd);

window.updatePageMeta = () => {
    const chapter = chapters.find(c => c.id === currentId);
    if (chapter) {
        chapter.metadata.type = document.getElementById('metaType').value;
        chapter.metadata.difficulty = document.getElementById('metaDifficulty').value;
        chapter.metadata.system = document.getElementById('metaSystem').value;
        chapter.metadata.toothNumber = document.getElementById('metaTooth').value;
        chapter.metadata.quadrant = document.getElementById('metaQuadrant').value;
        chapter.metadata.specialty = document.getElementById('metaSpecialty').value;
        chapter.metadata.branch = document.getElementById('metaEngBranch').value;

        saveChapterToDB(chapter);
        openMetadataModal();
    }
};

// --- CORE FUNCTIONS ---

window.toggleTopTools = () => {
    document.body.classList.toggle('tools-hidden');
    const tools = document.getElementById('topTools');
    if (document.body.classList.contains('tools-hidden')) {
        tools.classList.add('collapsed');
    } else {
        tools.classList.remove('collapsed');
    }
};

window.wipeAllData = async () => {
    if (confirm("DANGER: This will delete ALL notes forever. Are you sure?")) {
        await clearDB();
        location.reload();
    }
}

window.closeLecturePane = () => {
    document.body.classList.remove('split-mode');
};

window.toggleSection = (contentId, arrowId, wrapperId = null) => {
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);
    const isCollapsed = content.classList.contains('collapsed');
    if (isCollapsed) {
        content.classList.remove('collapsed');
        arrow.style.transform = 'rotate(0deg)';
        if (wrapperId) document.getElementById(wrapperId).classList.remove('collapsed-wrapper');
    } else {
        content.classList.add('collapsed');
        arrow.style.transform = 'rotate(-90deg)';
        if (wrapperId) document.getElementById(wrapperId).classList.add('collapsed-wrapper');
    }
};

window.toggleTray = () => {
    isTrayCollapsed = !isTrayCollapsed;
    const container = document.getElementById('trayContainer');
    const toggleBtn = document.getElementById('trayToggle');
    container.classList.toggle('collapsed', isTrayCollapsed);
    toggleBtn.innerText = isTrayCollapsed ? '▶' : '◀';
};

window.toggleMobileSidebar = () => {
    document.getElementById('mainSidebar').classList.toggle('open');
};

window.toggleFocusMode = () => {
    document.body.classList.toggle('focus-mode');
};

// Paper texture cycling
let currentPaperStyle = 0;
const paperStyles = ['grid-texture', 'lined-texture', 'dotted-texture', 'plain-texture'];
const paperNames = ['Grid', 'Lines', 'Dots', 'Plain'];

window.cyclePaperStyle = () => {
    const paper = document.getElementById('paper');
    const btn = document.getElementById('paperStyleBtn');

    // Remove all texture classes
    paperStyles.forEach(style => paper.classList.remove(style));

    // Cycle to next style
    currentPaperStyle = (currentPaperStyle + 1) % paperStyles.length;

    // Apply new style
    paper.classList.add(paperStyles[currentPaperStyle]);
    btn.textContent = `📄 Page: ${paperNames[currentPaperStyle]}`;

    showToast(`Applied ${paperNames[currentPaperStyle]} to entire page`);
};

window.toggleReadMode = () => {
    isReadMode = !isReadMode;
    document.body.classList.toggle('read-mode', isReadMode);
    const btn = document.getElementById('readModeBtn');
    const editors = document.querySelectorAll('.content-area');
    if (isReadMode) {
        btn.innerText = "🔒 Unlock / Edit";
        editors.forEach(e => e.contentEditable = "false");
        showToast("Read Mode Enabled");
    } else {
        btn.innerText = "🔓 Lock / Read";
        editors.forEach(e => e.contentEditable = "true");
        showToast("Editing Enabled");
    }
};

// Share note function
window.shareNote = async () => {
    const chapter = chapters.find(c => c.id === currentId);
    if (!chapter) {
        showToast('⚠️ No note selected');
        return;
    }

    const title = chapter.title || 'Untitled Note';
    const content = chapter.content || '';

    // Create plain text version
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const textContent = tempDiv.innerText || tempDiv.textContent;

    const shareText = `${title}\n\n${textContent.substring(0, 500)}${textContent.length > 500 ? '...' : ''}`;

    // Try native share API (mobile/modern browsers)
    if (navigator.share) {
        try {
            await navigator.share({
                title: title,
                text: shareText,
            });
            showToast('✓ Shared successfully');
        } catch (err) {
            if (err.name !== 'AbortError') {
                copyToClipboardFallback(shareText);
            }
        }
    } else {
        // Fallback: copy to clipboard
        copyToClipboardFallback(shareText);
    }
};

function copyToClipboardFallback(text) {
    // Create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        showToast('✓ Copied to clipboard! Paste to share.');
    } catch (err) {
        showToast('⚠️ Could not copy to clipboard');
    }

    document.body.removeChild(textarea);
}

function handleSelectionChange() {
    const bubble = document.getElementById('textBubble');
    const selection = window.getSelection();
    const stream = document.getElementById('sequentialStream');

    if (selection.isCollapsed || !stream.contains(selection.anchorNode)) {
        bubble.classList.remove('visible');
        return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    bubble.classList.add('visible');
    bubble.style.top = (rect.top + window.scrollY - 10) + 'px';
    bubble.style.left = (rect.left + (rect.width / 2)) + 'px';
}

window.formatText = (command, value = null) => {
    document.execCommand(command, false, value);

    // Find which editor block is active to save
    const sel = window.getSelection();
    if (sel.anchorNode) {
        const block = sel.anchorNode.parentElement.closest('.content-area');
        if (block && block.oninput) block.oninput();
    }
};

function setupDragAndDrop() {
    const paper = document.getElementById('paper');
    let dragCounter = 0;

    paper.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        paper.classList.add('drag-over');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    paper.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    paper.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) paper.classList.remove('drag-over');
    });

    paper.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        paper.classList.remove('drag-over');

        let range = null;
        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(e.clientX, e.clientY);
        } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
            if (pos) {
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
            }
        }

        // Determine active editor
        const stream = document.getElementById('sequentialStream');
        let editor = document.querySelector('.content-area');

        if (range && stream.contains(range.commonAncestorContainer)) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            editor = range.commonAncestorContainer.closest('.content-area') || editor;
        } else {
            editor.focus();
        }

        // Handle Files — create resizable/draggable images
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            Array.from(files).forEach(file => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        insertResizableImage(event.target.result, editor);
                        showToast('✓ Image added');
                    };
                    reader.readAsDataURL(file);
                }
            });
            return;
        }
    });
}

window.importBackgroundFile = (input) => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const chapter = chapters.find(c => c.id === currentId);
        if (chapter) {
            chapter.backgroundImage = e.target.result;
            await saveChapterToDB(chapter);
            loadChapter(currentId);
            showToast("Background Set");
        }
    };
    reader.readAsDataURL(file);
};

window.setCustomColor = (val) => {
    customStrokeStyle = val;
    activeSketchTool = 'custom';
    document.querySelectorAll('.tool-opt').forEach(o => o.classList.remove('active'));
    if (!isSketchMode) toggleSketchMode();
};

function resizeCanvas() {
    const paper = document.getElementById('paper');
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== paper.offsetWidth * dpr || canvas.height !== paper.offsetHeight * dpr) {
        canvas.width = paper.offsetWidth * dpr;
        canvas.height = paper.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        if (sketchData) drawSavedSketch(sketchData);
    }
}
window.addEventListener('resize', resizeCanvas);

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);

canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;
    if (isSketchMode) e.preventDefault();
    startDrawing(e.touches[0]);
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (isSketchMode) e.preventDefault();
    draw(e.touches[0]);
}, { passive: false });

canvas.addEventListener('touchend', stopDrawing);

let isPanning = false;
let startPanX = 0; let startPanY = 0;
let scrollStartX = 0; let scrollStartY = 0;

function getCanvasCoordinates(inputEvent) {
    let clientX = inputEvent.clientX;
    let clientY = inputEvent.clientY;

    // RULER SNAPPING LOGIC
    if (isRulerActive && !isDraggingRuler && !isRotatingRuler) {
        const ruler = document.getElementById('engRuler');
        const rRect = ruler.getBoundingClientRect();
        const rCx = rRect.left + rRect.width / 2;
        const rCy = rRect.top + rRect.height / 2;

        // Convert degrees to radians
        const rad = rulerAngle * (Math.PI / 180);

        // Calculate position relative to ruler center
        const dx = clientX - rCx;
        const dy = clientY - rCy;

        // Rotate to local alignment (un-rotate by rulerAngle)
        // localX is along ruler length, localY is along width/height
        const localX = dx * Math.cos(-rad) - dy * Math.sin(-rad);
        const localY = dx * Math.sin(-rad) + dy * Math.cos(-rad);

        // Ruler height is 60px (top at -30, bottom at +30)
        // Snap if within 15px of an edge
        const SNAP_DIST = 20;

        // Ruler is 400px wide, so localX extends from -200 to +200
        if (Math.abs(localX) < 250) { // Allow snapping slightly beyond tips
            if (Math.abs(localY - 30) < SNAP_DIST) {
                // Snap to bottom edge
                const snappedX = localX * Math.cos(rad) - 30 * Math.sin(rad);
                const snappedY = localX * Math.sin(rad) + 30 * Math.cos(rad);
                clientX = rCx + snappedX;
                clientY = rCy + snappedY;
            } else if (Math.abs(localY + 30) < SNAP_DIST) {
                // Snap to top edge
                const snappedX = localX * Math.cos(rad) - (-30) * Math.sin(rad);
                const snappedY = localX * Math.sin(rad) + (-30) * Math.cos(rad);
                clientX = rCx + snappedX;
                clientY = rCy + snappedY;
            }
        }
    }

    const rect = canvas.getBoundingClientRect();
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function startDrawing(e) {
    if (activeSketchTool === 'hand') {
        isPanning = true;
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        startPanX = clientX; startPanY = clientY;
        const ws = document.getElementById('workspace');
        scrollStartX = ws.scrollLeft; scrollStartY = ws.scrollTop;
        ws.classList.add('grabbing');
        if (e.type === 'touchstart') e.preventDefault();
        return;
    }

    if (!isSketchMode || isReadMode) return;
    if (e.type === 'touchstart') e.preventDefault();

    saveStateToStack();
    drawing = true;

    const coords = getCanvasCoordinates(e.clientX ? e : e.touches[0]);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
}

function draw(e) {
    if (activeSketchTool === 'hand') {
        if (!isPanning) return;
        e.preventDefault();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        const walkX = (clientX - startPanX);
        const walkY = (clientY - startPanY);
        const ws = document.getElementById('workspace');
        ws.scrollLeft = scrollStartX - walkX;
        ws.scrollTop = scrollStartY - walkY;
        return;
    }

    if (!drawing || !isSketchMode || isReadMode) return;
    if (e.type === 'touchmove') e.preventDefault();

    const coords = getCanvasCoordinates(e.clientX ? e : e.touches[0]);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (activeSketchTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 30;
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
    } else if (activeSketchTool === 'highlighter') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = customStrokeStyle || 'rgba(255, 235, 59, 0.25)';
        ctx.lineWidth = 20;
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
    } else if (activeSketchTool === 'custom') {
        ctx.strokeStyle = customStrokeStyle;
        ctx.lineWidth = 2;
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
    } else {
        ctx.lineWidth = 2;
        ctx.strokeStyle = document.body.classList.contains('dark-mode') ? '#ffffff' : '#2c3e50';
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
}

function stopDrawing() {
    if (activeSketchTool === 'hand') {
        isPanning = false;
        document.getElementById('workspace').classList.remove('grabbing');
        return;
    }
    if (drawing) {
        drawing = false;
        ctx.globalCompositeOperation = 'source-over';
        saveSketchToCloud();
    }
}

function saveStateToStack() {
    if (undoStack.length > 20) undoStack.shift();
    undoStack.push(canvas.toDataURL());
    redoStack = [];
}

window.undoSketch = () => {
    if (undoStack.length === 0) return;
    redoStack.push(canvas.toDataURL());
    const prevStateUrl = undoStack.pop();
    drawSavedSketch(prevStateUrl);
    setTimeout(async () => {
        const chapter = chapters.find(c => c.id === currentId);
        if (chapter) {
            chapter.sketch = canvas.toDataURL();
            await saveChapterToDB(chapter);
        }
    }, 100);
};

window.redoSketch = () => {
    if (redoStack.length === 0) return;
    undoStack.push(canvas.toDataURL());
    const nextStateUrl = redoStack.pop();
    drawSavedSketch(nextStateUrl);
    setTimeout(async () => {
        const chapter = chapters.find(c => c.id === currentId);
        if (chapter) {
            chapter.sketch = canvas.toDataURL();
            await saveChapterToDB(chapter);
        }
    }, 100);
};

function drawSavedSketch(dataUrl) {
    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
        ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
    };
    img.src = dataUrl;
}

window.clearSketch = () => {
    if (!confirm("Are you sure you want to clear your drawing?")) return;
    saveStateToStack();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveSketchToCloud();
    showToast("Sketch cleared");
};

window.selectSketchTool = (tool) => {
    if (tool === 'hand') {
        activeSketchTool = 'hand';
        document.getElementById('handBtn').classList.add('active');
        document.getElementById('eraserBtn').classList.remove('active');
        if (!isSketchMode) toggleSketchMode();
        return;
    } else {
        document.getElementById('handBtn').classList.remove('active');
    }

    if (tool !== 'highlighter') customStrokeStyle = null;
    activeSketchTool = tool === activeSketchTool ? 'brush' : tool;

    document.getElementById('eraserBtn').classList.toggle('active', activeSketchTool === 'eraser');
    const highlighterBtn = document.querySelector('.tool-opt.highlighter');
    if (highlighterBtn) highlighterBtn.classList.toggle('active', activeSketchTool === 'highlighter');

    if (!isSketchMode) toggleSketchMode();
};

window.selectWritingTool = (tool, save = true) => {
    if (tool === 'highlighter') {
        selectSketchTool('highlighter');
        return;
    }
    document.getElementById('handBtn').classList.remove('active');
    if (activeSketchTool === 'hand') activeSketchTool = 'brush';

    // Apply class to ALL editors in the stream
    document.querySelectorAll('.content-area').forEach(e => {
        e.className = `content-area writing-tool-${tool}`;
    });

    document.querySelectorAll('.tool-opt').forEach(o => o.classList.toggle('active', o.dataset.tool === tool));
    if (save) {
        const chapter = chapters.find(c => c.id === currentId);
        if (chapter) {
            chapter.tool = tool;
            saveChapterToDB(chapter);
        }
    }
};

window.exportData = () => {
    const dataStr = JSON.stringify(chapters, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = 'notebook_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
};

window.importData = (input) => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedChapters = JSON.parse(e.target.result);
            if (Array.isArray(importedChapters)) {
                await clearDB();
                for (const chap of importedChapters) {
                    await saveChapterToDB(chap);
                }
                chapters = importedChapters;
                initApp();
                showToast("Backup Restored!");
            } else {
                alert("Invalid backup file.");
            }
        } catch (err) {
            alert("Error reading file");
        }
    };
    reader.readAsText(file);
};

// --- FLASHCARD LOGIC START ---

let flashcards = [];
let currentCardIndex = 0;

window.startFlashcardMode = () => {
    // 1. Scan for flashcards
    generateFlashcards();

    if (flashcards.length === 0) {
        document.getElementById('flashcardContainer').style.display = 'none';
        document.querySelector('.flashcard-controls').style.display = 'none';
        document.getElementById('noCardsMsg').style.display = 'block';
    } else {
        document.getElementById('flashcardContainer').style.display = 'block';
        document.querySelector('.flashcard-controls').style.display = 'flex';
        document.getElementById('noCardsMsg').style.display = 'none';
        currentCardIndex = 0;
        renderCard();
    }

    document.getElementById('flashcardOverlay').style.display = 'flex';
};

function generateFlashcards() {
    flashcards = [];

    // Scan ALL content areas in the stream
    const editors = document.querySelectorAll('#sequentialStream .content-area');

    editors.forEach(editor => {
        // Strategy A: "Question :: Answer"
        // We scan text content for '::'
        // Simplification: iterate over block elements
        const blocks = editor.querySelectorAll('p, li, h1, h2, h3, h4, div');
        blocks.forEach(block => {
            const text = block.innerText;
            if (text.includes('::')) {
                const parts = text.split('::');
                if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
                    flashcards.push({
                        q: parts[0].trim(),
                        a: parts[1].trim()
                    });
                }
            }
        });

        // Strategy B: Header (Q) -> Body (A)
        // We iterate children directly
        const children = Array.from(editor.children);
        let currentQ = null;
        let currentA = '';

        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            const tag = node.tagName.toLowerCase();

            if (['h1', 'h2', 'h3'].includes(tag)) {
                // If we have a pending card, push it
                if (currentQ && currentA.trim()) {
                    flashcards.push({ q: currentQ, a: currentA.trim() });
                }
                // Start new card
                currentQ = node.innerText;
                currentA = '';
            } else if (currentQ) {
                // Append to answer if not a new header
                // Skip empty text nodes if possible, but innerText handles it
                if (node.innerText.trim()) {
                    // Don't include lines that were already caught by "::" logic to avoid dupes?
                    // For simplicity, we include them unless they are identical.
                    if (!node.innerText.includes('::')) {
                        currentA += node.innerText + '\n';
                    }
                }
            }
        }
        // Push last card
        if (currentQ && currentA.trim()) {
            flashcards.push({ q: currentQ, a: currentA.trim() });
        }
    });
}

window.renderCard = () => {
    const card = flashcards[currentCardIndex];
    const cardEl = document.querySelector('.flashcard');

    // Reset flip state
    cardEl.classList.remove('flipped');

    // Update Text
    // Small delay to allow flip animation reset if needed, but instant is snappier
    document.getElementById('fcQuestion').innerText = card.q;
    document.getElementById('fcAnswer').innerText = card.a;

    document.getElementById('fcCounter').innerText = `${currentCardIndex + 1} / ${flashcards.length}`;
};

window.flipCard = () => {
    document.querySelector('.flashcard').classList.toggle('flipped');
};

window.nextCard = () => {
    if (currentCardIndex < flashcards.length - 1) {
        currentCardIndex++;
        renderCard();
    }
};

window.prevCard = () => {
    if (currentCardIndex > 0) {
        currentCardIndex--;
        renderCard();
    }
};

window.exitFlashcardMode = () => {
    document.getElementById('flashcardOverlay').style.display = 'none';
};

// --- FLASHCARD LOGIC END ---

// ENHANCED ID GENERATION TO PREVENT COLLISIONS
window.createNewChapter = async (title, tags) => {
    if (typeof title === 'object' || !title) title = "Untitled Page";
    if (!tags) tags = [];

    if (currentId && title === "Untitled Page" && tags.length === 0) {
        const currentChapter = chapters.find(c => c.id === currentId);
        if (currentChapter && currentChapter.tags && currentChapter.tags.length > 0) {
            tags = [...currentChapter.tags];
            title = "Untitled (Continuation)";
        }
    } else if (title === "Untitled Page") {
        title = `Note - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }

    const catElement = document.getElementById('categoryFilter');
    const currentCat = catElement ? catElement.value : 'all';
    let category = (currentCat === 'all') ? 'General' : currentCat;

    // Unique ID Generation: Timestamp + Random Suffix
    const id = "ch_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

    const newChapter = {
        id: id,
        title: title,
        category: category,
        tags: tags,
        content: "<div>Start typing...</div>",
        tool: 'pen',
        sketch: null,
        paperStyle: 'grid',
        lastEdited: new Date().toISOString(),
        metadata: {
            discipline: 'general',
            type: PAGE_TYPES.NOTE,
            difficulty: 'medium',
            topics: [],
            system: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    };

    if (['Algorithms', 'Systems', 'Projects'].includes(category)) newChapter.metadata.discipline = 'cs';
    if (['Anatomy', 'Pathology', 'Pharmacology', 'Clinical'].includes(category)) newChapter.metadata.discipline = 'medical';
    if (['Dental Anatomy', 'Procedures', 'Dental Cases'].includes(category)) newChapter.metadata.discipline = 'medical';
    if (['Electrical', 'Mechanical', 'Civil', 'Electronics', 'Mechatronics', 'Industrial'].includes(category)) {
        newChapter.metadata.discipline = 'engineering';
        newChapter.metadata.branch = category;
    }

    chapters.unshift(newChapter);
    await saveToCloud();
    loadChapter(newChapter.id);
    renderSidebar();

    // UX Enhancement: Show empty page guidance for new pages
    setTimeout(() => showEmptyPageHints(), 300);
};

// UX Enhancement: Empty Page Guidance (shows hints on truly empty pages)
window.showEmptyPageHints = () => {
    const content = document.getElementById('sequentialStream');
    const titleInput = document.getElementById('pageTitle');

    if (!content) return;

    // Only show if page is empty (no blocks and empty/default title)
    const isEmpty = content.children.length === 0 ||
        (content.children.length === 1 && content.textContent.trim() === 'Start typing...');
    const hasEmptyTitle = !titleInput || titleInput.value.trim() === '' ||
        titleInput.value === 'Untitled Page' ||
        titleInput.value.includes('Note -');

    if (isEmpty && hasEmptyTitle) {
        const hint = document.createElement('div');
        hint.className = 'empty-page-hint';
        hint.style.cssText = 'opacity: 0.25; text-align: center; margin-top: 3rem; color: var(--ink-color); pointer-events: none; user-select: none; transition: opacity 0.3s;';
        hint.innerHTML = `
                    <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">✍️ Tap to write</p>
                    <p style="font-size: 0.9rem; opacity: 0.7;">or use the toolbar to add content</p>
                `;

        content.appendChild(hint);

        // Auto-remove on first interaction
        const removeHint = () => {
            if (hint && hint.parentNode) {
                hint.style.opacity = '0';
                setTimeout(() => hint.remove(), 300);
            }
            content.removeEventListener('click', removeHint);
            content.removeEventListener('focus', removeHint, true);
            if (titleInput) titleInput.removeEventListener('input', removeHint);
        };

        setTimeout(() => {
            content.addEventListener('click', removeHint, { once: true });
            content.addEventListener('focus', removeHint, { once: true, capture: true });
            if (titleInput) titleInput.addEventListener('input', removeHint, { once: true });
        }, 100);
    }
};
window.deleteChapter = async (id, event) => {
    if (event) event.stopPropagation();
    chapters = chapters.filter(c => c.id !== id);
    await deleteChapterFromDB(id);
    if (currentId === id) {
        if (chapters.length > 0) loadChapter(chapters[0].id);
        else createNewChapter();
    } else {
        renderSidebar();
    }
    showToast("Page Deleted");
};

// ==================== RESIZABLE + DRAGGABLE IMAGE WRAPPER ====================

/**
 * Creates a resizable, draggable image container from an image source URL.
 * Returns the wrapper DOM element ready to be appended to a content area.
 * - 4 corner resize handles (nw, ne, sw, se)
 * - Drag to reposition anywhere in the content area
 * - Maintains aspect ratio during resize
 */
window.createResizableDraggableImage = function (src) {
    // Outer wrapper — positioned absolutely for free placement
    const wrapper = document.createElement('div');
    wrapper.className = 'rd-image-wrapper';
    wrapper.setAttribute('contenteditable', 'false');

    // The image itself
    const img = document.createElement('img');
    img.src = src;
    img.className = 'rd-image';
    img.draggable = false; // Prevent native browser drag
    wrapper.appendChild(img);

    // Create 4 corner resize handles
    ['nw', 'ne', 'sw', 'se'].forEach(corner => {
        const handle = document.createElement('div');
        handle.className = `rd-resize-handle rd-handle-${corner}`;
        handle.setAttribute('contenteditable', 'false');
        handle.setAttribute('data-corner', corner);
        wrapper.appendChild(handle);
    });

    // ---- DRAG logic ----
    let isDragging = false, dragStartX, dragStartY, startLeft, startTop;

    function onDragStart(e) {
        // Don't drag if clicking a resize handle
        if (e.target.classList.contains('rd-resize-handle')) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        wrapper.classList.add('rd-dragging');

        const ev = e.touches ? e.touches[0] : e;
        dragStartX = ev.clientX;
        dragStartY = ev.clientY;
        startLeft = wrapper.offsetLeft;
        startTop = wrapper.offsetTop;

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
    }

    function onDragMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const ev = e.touches ? e.touches[0] : e;
        const dx = ev.clientX - dragStartX;
        const dy = ev.clientY - dragStartY;
        wrapper.style.left = (startLeft + dx) + 'px';
        wrapper.style.top = (startTop + dy) + 'px';
    }

    function onDragEnd() {
        isDragging = false;
        wrapper.classList.remove('rd-dragging');
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        // Trigger save
        const contentArea = wrapper.closest('.content-area');
        if (contentArea && contentArea.oninput) contentArea.oninput();
    }

    wrapper.addEventListener('mousedown', onDragStart);
    wrapper.addEventListener('touchstart', onDragStart, { passive: false });

    // ---- RESIZE logic (all 4 corners, aspect-ratio-preserving) ----
    wrapper.querySelectorAll('.rd-resize-handle').forEach(handle => {
        let isResizing = false, resizeStartX, resizeStartY, startW, startH, startL, startT, corner;

        function onResizeStart(e) {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            corner = handle.getAttribute('data-corner');

            const ev = e.touches ? e.touches[0] : e;
            resizeStartX = ev.clientX;
            resizeStartY = ev.clientY;
            startW = wrapper.offsetWidth;
            startH = wrapper.offsetHeight;
            startL = wrapper.offsetLeft;
            startT = wrapper.offsetTop;

            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeEnd);
            document.addEventListener('touchmove', onResizeMove, { passive: false });
            document.addEventListener('touchend', onResizeEnd);
        }

        function onResizeMove(e) {
            if (!isResizing) return;
            e.preventDefault();
            const ev = e.touches ? e.touches[0] : e;
            const dx = ev.clientX - resizeStartX;
            const dy = ev.clientY - resizeStartY;

            // Maintain aspect ratio using the dominant axis
            const aspect = startW / startH;
            let newW, newH;

            if (corner === 'se') {
                newW = Math.max(60, startW + dx);
                newH = newW / aspect;
            } else if (corner === 'sw') {
                newW = Math.max(60, startW - dx);
                newH = newW / aspect;
                wrapper.style.left = (startL + (startW - newW)) + 'px';
            } else if (corner === 'ne') {
                newW = Math.max(60, startW + dx);
                newH = newW / aspect;
                wrapper.style.top = (startT + (startH - newH)) + 'px';
            } else if (corner === 'nw') {
                newW = Math.max(60, startW - dx);
                newH = newW / aspect;
                wrapper.style.left = (startL + (startW - newW)) + 'px';
                wrapper.style.top = (startT + (startH - newH)) + 'px';
            }

            wrapper.style.width = newW + 'px';
            wrapper.style.height = newH + 'px';
        }

        function onResizeEnd() {
            isResizing = false;
            document.removeEventListener('mousemove', onResizeMove);
            document.removeEventListener('mouseup', onResizeEnd);
            document.removeEventListener('touchmove', onResizeMove);
            document.removeEventListener('touchend', onResizeEnd);
            // Trigger save
            const contentArea = wrapper.closest('.content-area');
            if (contentArea && contentArea.oninput) contentArea.oninput();
        }

        handle.addEventListener('mousedown', onResizeStart);
        handle.addEventListener('touchstart', onResizeStart, { passive: false });
    });

    // Default size — let the image determine natural width up to a max
    img.onload = function () {
        const maxW = 400;
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        const displayW = Math.min(naturalW, maxW);
        const displayH = displayW * (naturalH / naturalW);
        wrapper.style.width = displayW + 'px';
        wrapper.style.height = displayH + 'px';
    };

    return wrapper;
};

/**
 * Inserts a resizable/draggable image into the target content area.
 * If no contentArea is provided, falls back to the active or last editor.
 */
function insertResizableImage(src, contentArea) {
    const wrapper = window.createResizableDraggableImage(src);

    if (!contentArea) {
        const stream = document.getElementById('sequentialStream');
        contentArea = document.querySelector(`#page-block-${currentId} .content-area`);
        if (!contentArea) {
            const editors = stream ? stream.querySelectorAll('.content-area') : [];
            contentArea = editors.length > 0 ? editors[editors.length - 1] : null;
        }
    }

    if (contentArea) {
        // Position near the top-left with a small offset
        const existingImages = contentArea.querySelectorAll('.rd-image-wrapper');
        const offset = existingImages.length * 20; // Stagger multiple uploads
        wrapper.style.left = (20 + offset) + 'px';
        wrapper.style.top = (20 + offset) + 'px';

        contentArea.appendChild(wrapper);

        // Add a line break after for text flow
        const spacer = document.createElement('p');
        spacer.innerHTML = '<br>';
        contentArea.appendChild(spacer);

        if (contentArea.oninput) contentArea.oninput();
    }
}

// ==================== IMAGE UPLOAD HANDLERS ====================

/**
 * Re-hydrates any rd-image-wrapper elements found inside a content area.
 * Called after loading saved content from DB to re-attach drag/resize listeners.
 */
function hydrateResizableImages(contentArea) {
    const wrappers = contentArea.querySelectorAll('.rd-image-wrapper');
    wrappers.forEach(oldWrapper => {
        const img = oldWrapper.querySelector('img');
        if (!img) return;

        // Create a fresh wrapper with proper event listeners
        const newWrapper = window.createResizableDraggableImage(img.src);

        // Preserve position and size from the saved HTML
        if (oldWrapper.style.left) newWrapper.style.left = oldWrapper.style.left;
        if (oldWrapper.style.top) newWrapper.style.top = oldWrapper.style.top;
        if (oldWrapper.style.width) newWrapper.style.width = oldWrapper.style.width;
        if (oldWrapper.style.height) newWrapper.style.height = oldWrapper.style.height;

        // Replace old static wrapper with new interactive one
        oldWrapper.parentNode.replaceChild(newWrapper, oldWrapper);
    });
}

window.triggerImageUpload = () => document.getElementById('imageInput').click();
window.handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        insertResizableImage(event.target.result);
        showToast('✓ Image added');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
};

// --- UPDATED LOAD CHAPTER ---
function loadChapter(id) {
    currentId = id;
    undoStack = []; redoStack = [];
    const chapter = chapters.find(c => c.id === id);
    if (!chapter) return;

    const stream = document.getElementById('sequentialStream');
    stream.innerHTML = '';

    const pdfContainer = document.getElementById('pdfBackground');
    pdfContainer.innerHTML = '';

    setTimeout(() => resizeCanvas(), 0);

    // SEQUENCE LOGIC with De-duplication
    let sequence = [chapter];
    if (chapter.tags && chapter.tags.length > 0) {
        const streamItems = chapters.filter(c =>
            c.tags && c.tags.some(tag => chapter.tags.includes(tag))
        );
        // Ensure unique items by ID
        const uniqueItems = Array.from(new Map(streamItems.map(item => [item.id, item])).values());
        sequence = uniqueItems;

        // Sort by creation date
        sequence.sort((a, b) => new Date(a.metadata.createdAt) - new Date(b.metadata.createdAt));
    }

    // Render Sequence
    sequence.forEach((item, idx) => {
        const block = document.createElement('div');
        block.className = 'sequence-editor-block';
        block.id = `page-block-${item.id}`; // Add ID for scrolling

        // Highlight active page
        if (item.id === id) {
            block.classList.add('active-focus');
            // Scroll into view after render
            setTimeout(() => {
                block.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }

        if (idx > 0) {
            const br = document.createElement('div');
            br.className = 'continuation-break';
            br.innerHTML = `<div class="continuation-label">${item.title}</div>`;
            stream.appendChild(br);
        }

        const editor = document.createElement('div');
        editor.className = `content-area writing-tool-${item.tool || 'pen'}`;
        editor.contentEditable = !isReadMode;
        editor.spellcheck = false;
        editor.innerHTML = item.content;

        // Re-hydrate any saved resizable/draggable images
        hydrateResizableImages(editor);

        // Scoped Save Logic
        editor.oninput = () => {
            markUnsaved();
            item.content = editor.innerHTML;
            item.lastEdited = new Date().toISOString();
            debounceSave(item);
        };

        // Focus handling to highlight active page visually
        editor.onfocus = () => {
            document.querySelectorAll('.sequence-editor-block').forEach(b => b.classList.remove('active-focus'));
            block.classList.add('active-focus');
            currentId = item.id; // Update current context to focused page
            document.getElementById('pageTitle').value = item.title; // Update title bar
            renderSidebar(); // Update sidebar highlight
        };

        block.appendChild(editor);
        stream.appendChild(block);
    });

    // Set title bar to the requested ID's title initially
    document.getElementById('pageTitle').value = chapter.title;

    // Background & Sketch Logic
    // PDFs are now stored in chapter.content as HTML with images
    if (chapter.backgroundImage) {
        document.getElementById('paper').style.backgroundImage = `url('${chapter.backgroundImage}')`;
        document.getElementById('paper').classList.add('annotate-mode');
    } else {
        document.getElementById('paper').style.backgroundImage = '';
        document.getElementById('paper').classList.remove('annotate-mode');
        // Paper texture is now controlled by user via cyclePaperStyle button
    }

    if (chapter.sketch) {
        sketchData = chapter.sketch;
        drawSavedSketch(sketchData);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        sketchData = null;
    }

    selectWritingTool(chapter.tool || 'pen', false);
    renderSidebar();
    document.getElementById('mainSidebar').classList.remove('open');
    document.getElementById('saveStatus').innerText = "All changes saved";

    // Show/Hide stream continuation button based on whether we are in a stream (have tags)
    const streamControls = document.getElementById('streamControls');
    if (chapter.tags && chapter.tags.length > 0) {
        streamControls.style.opacity = '1';
        streamControls.style.pointerEvents = 'auto';
    } else {
        streamControls.style.opacity = '0';
        streamControls.style.pointerEvents = 'none';
    }

    updateWordCount();
    updateToolVisibility(chapter);

    // Initialize Logic Gates Simulator if this is a logic gates page
    if (chapter.metadata && chapter.metadata.type === PAGE_TYPES.LOGIC_GATES) {
        setTimeout(() => initLogicGatesSimulator(), 200);
    }
}

async function addSequentialPage() {
    const current = chapters.find(c => c.id === currentId);
    const newTitle = current ? (current.title + " (Cont.)") : "New Page";
    const tags = current ? [...(current.tags || [])] : [];
    await createNewChapter(newTitle, tags);
    showToast("Page Added to Stream");
}

// IMPROVED SAVE QUEUE to prevent race conditions
let saveTimers = {};
const saveQueue = new Set();
let saveInProgress = false;

function debounceSave(chapter) {
    markUnsaved();
    updateWordCount();

    // Add to queue
    saveQueue.add(chapter.id);

    // Clear existing timeout for this chapter
    if (!saveTimers[chapter.id]) saveTimers[chapter.id] = null;
    clearTimeout(saveTimers[chapter.id]);

    // Set new timeout
    saveTimers[chapter.id] = setTimeout(async () => {
        if (!saveInProgress && saveQueue.has(chapter.id)) {
            saveInProgress = true;
            saveQueue.delete(chapter.id);
            try {
                await saveChapterToDB(chapter);
                document.getElementById('saveStatus').innerText = 'All changes saved';
                document.getElementById('saveStatus').style.color = 'var(--save-color)';
            } catch (error) {
                console.error('Save error:', error);
                document.getElementById('saveStatus').innerText = '⚠️ Save failed';
                document.getElementById('saveStatus').style.color = '#e74c3c';

                // Handle quota exceeded error
                if (error.name === 'QuotaExceededError') {
                    showToast('⚠️ Storage full! Please delete old notes.');
                }
            } finally {
                saveInProgress = false;
            }
        }
    }, 1000);
}

let saveTimeout;
window.markUnsaved = () => { document.getElementById('saveStatus').innerText = "Saving..."; }


window.saveCurrentToCloud = () => {
    const chapter = chapters.find(c => c.id === currentId);
    if (chapter) {
        chapter.title = document.getElementById('pageTitle').value;
        debounceSave(chapter);
    }
};

function updateWordCount() {
    const text = document.getElementById('sequentialStream').innerText || "";
    const count = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    document.getElementById('wordCount').innerText = count + " Words";
}

function saveSketchToCloud() {
    const chapter = chapters.find(c => c.id === currentId);
    if (chapter) {
        chapter.sketch = canvas.toDataURL();
        saveChapterToDB(chapter);
    }
}

window.toggleSketchMode = () => {
    // Exit lasso mode if active (mutual exclusion)
    if (lassoSelector && lassoSelector.isActive) {
        lassoSelector.exitLassoMode();
        const btn = document.getElementById('lassoBtn');
        if (btn) btn.classList.remove('active');
    }

    isSketchMode = !isSketchMode;
    document.body.classList.toggle('sketch-mode', isSketchMode);
    document.getElementById('sketchToggle').classList.toggle('active', isSketchMode);
    const editors = document.querySelectorAll('.content-area');
    editors.forEach(e => e.contentEditable = !isSketchMode);

    if (!isSketchMode) activeSketchTool = 'brush';
    showToast(isSketchMode ? "Sketching Enabled" : "Writing Enabled");
};

window.toggleVoiceTranscription = () => {
    if (!recognition) {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Speech) return showToast("Speech API not supported on this browser");
        recognition = new Speech();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (e) => {
            const text = e.results[e.results.length - 1][0].transcript;
            document.execCommand('insertText', false, text + " ");
        };
        recognition.onend = () => { if (isListening) recognition.start(); };
    }
    if (isListening) {
        recognition.stop();
        isListening = false;
        document.getElementById('voiceBtn').classList.remove('active-voice');
    } else {
        recognition.start();
        isListening = true;
        document.getElementById('voiceBtn').classList.add('active-voice');
        showToast("Listening...");
    }
};

window.insertBlock = (type) => {
    let html = "";
    if (type === 'header') html = "<h2 class='styled-header'>New Title</h2>";
    if (type === 'todo') html = `<div class="checklist-item" contenteditable="false"><div class="checkbox-wrapper" contenteditable="false"><div class="checkbox"></div></div><div class="checklist-text" contenteditable="true">Task Item</div></div>`;
    if (type === 'note') html = "<div class='sticky-note'>Important Note...</div>";
    if (type === 'code') html = "<div class='chalk-code'>// code here</div>";
    insertHtml(html + "<p><br></p>");
};

// GLOBAL CURSOR TRACKING
let lastCursorPosition = null;
let lastActiveContentArea = null;

// Track cursor position whenever user clicks or types in a content area
document.addEventListener('click', (e) => {
    const contentArea = e.target.closest('.content-area');
    if (contentArea) {
        lastActiveContentArea = contentArea;
        saveCursorPosition();
    }
});

document.addEventListener('keyup', (e) => {
    const contentArea = e.target.closest('.content-area');
    if (contentArea) {
        lastActiveContentArea = contentArea;
        saveCursorPosition();
    }
});

function saveCursorPosition() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        lastCursorPosition = sel.getRangeAt(0).cloneRange();
    }
}

function insertHtml(html) {
    let targetArea = null;
    let insertRange = null;

    // Priority 1: Use saved cursor position if we have one
    if (lastCursorPosition && lastActiveContentArea && document.contains(lastActiveContentArea)) {
        targetArea = lastActiveContentArea;
        insertRange = lastCursorPosition;
    }
    // Priority 2: Check current active element
    else {
        const active = document.activeElement;
        if (active && active.closest('.content-area')) {
            targetArea = active.closest('.content-area');
        } else {
            // Priority 3: Find the active-focus page
            const focusedBlock = document.querySelector('.sequence-editor-block.active-focus');
            if (focusedBlock) {
                targetArea = focusedBlock.querySelector('.content-area');
            } else {
                // Priority 4: Fallback to first content area
                targetArea = document.querySelector('.content-area');
            }
        }
    }

    if (!targetArea) return;

    // Focus the target area
    targetArea.focus();

    // If we have a saved range, restore it
    if (insertRange && document.contains(insertRange.commonAncestorContainer)) {
        try {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(insertRange);
        } catch (e) {
            console.warn('Could not restore cursor position:', e);
            // Move to end of content
            const range = document.createRange();
            range.selectNodeContents(targetArea);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    } else {
        // Move cursor to end
        const range = document.createRange();
        range.selectNodeContents(targetArea);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    // Insert the HTML
    document.execCommand('insertHTML', false, html);

    // Trigger save
    if (targetArea.oninput) targetArea.oninput();

    // Save new cursor position
    saveCursorPosition();
}

window.toggleTemplates = () => {
    const p = document.getElementById('templatePopup');
    p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
};

// NEW: TEMPLATE NAVIGATION LOGIC
window.showCSTemplates = () => {
    document.getElementById('tmpl-main-view').style.display = 'none';
    document.getElementById('tmpl-cs-view').style.display = 'block';
    document.getElementById('tmpl-med-view').style.display = 'none';
    document.getElementById('tmpl-dentistry-view').style.display = 'none';
    document.getElementById('tmpl-eng-view').style.display = 'none';
};

window.showMedTemplates = () => {
    document.getElementById('tmpl-main-view').style.display = 'none';
    document.getElementById('tmpl-cs-view').style.display = 'none';
    document.getElementById('tmpl-med-view').style.display = 'block';
    document.getElementById('tmpl-dentistry-view').style.display = 'none';
    document.getElementById('tmpl-eng-view').style.display = 'none';
};

window.showDentistryTemplates = () => {
    document.getElementById('tmpl-main-view').style.display = 'none';
    document.getElementById('tmpl-cs-view').style.display = 'none';
    document.getElementById('tmpl-med-view').style.display = 'none';
    document.getElementById('tmpl-dentistry-view').style.display = 'block';
    document.getElementById('tmpl-eng-view').style.display = 'none';
};

window.showEngineeringTemplates = () => {
    document.getElementById('tmpl-main-view').style.display = 'none';
    document.getElementById('tmpl-cs-view').style.display = 'none';
    document.getElementById('tmpl-med-view').style.display = 'none';
    document.getElementById('tmpl-dentistry-view').style.display = 'none';
    document.getElementById('tmpl-eng-view').style.display = 'block';
};

window.showMainTemplates = () => {
    document.getElementById('tmpl-main-view').style.display = 'block';
    document.getElementById('tmpl-cs-view').style.display = 'none';
    document.getElementById('tmpl-med-view').style.display = 'none';
    document.getElementById('tmpl-dentistry-view').style.display = 'none';
    document.getElementById('tmpl-eng-view').style.display = 'none';
    document.getElementById('tmpl-advanced-view').style.display = 'none';
};

window.showAdvancedTemplates = () => {
    document.getElementById('tmpl-main-view').style.display = 'none';
    document.getElementById('tmpl-cs-view').style.display = 'none';
    document.getElementById('tmpl-med-view').style.display = 'none';
    document.getElementById('tmpl-dentistry-view').style.display = 'none';
    document.getElementById('tmpl-eng-view').style.display = 'none';
    document.getElementById('tmpl-advanced-view').style.display = 'block';
};

window.applyTemplate = async (key) => {
    const chapter = chapters.find(c => c.id === currentId);
    if (!chapter) return;

    const temps = {
        default: { title: "New Note", content: "<div>Start typing...</div>", isWhiteboard: false, type: PAGE_TYPES.NOTE },
        meeting: { title: "Meeting: " + new Date().toLocaleDateString(), content: "<h2 class='styled-header'>Participants</h2><p>• </p><h2 class='styled-header'>Notes</h2><p></p><h2 class='styled-header'>Action Items</h2>", type: PAGE_TYPES.NOTE },
        journal: { title: "Entry: " + new Date().toLocaleDateString(), content: "<div class='sticky-note'>What happened today?</div>", type: PAGE_TYPES.NOTE },
        project: { title: "Project Tracker", content: "<h2 class='styled-header'>Phase 1</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Milestone</div></div>", type: PAGE_TYPES.PROJECT },
        eisenhower: {
            title: "Eisenhower Matrix",
            content: "<h2 class='styled-header' style='color:#c0392b'>1. Do First (Urgent & Important)</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Crisis / Deadline</div></div><h2 class='styled-header' style='color:#2980b9'>2. Schedule (Less Urgent, Important)</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Planning / Strategy</div></div><h2 class='styled-header' style='color:#d35400'>3. Delegate (Urgent, Less Important)</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Interruptions / Meetings</div></div><h2 class='styled-header' style='color:#7f8c8d'>4. Don't Do (Not Urgent, Not Important)</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Distractions</div></div>",
            type: PAGE_TYPES.NOTE
        },
        whiteboard: {
            title: "Infinite Whiteboard",
            content: "<div>Start Brainstorming...</div>",
            isWhiteboard: true,
            type: PAGE_TYPES.WHITEBOARD
        },
        algo: { title: "Algorithm Analysis", content: "<h2 class='styled-header'>Problem Statement</h2><p>Describe the problem...</p><h2 class='styled-header'>Complexity</h2><span class='algo-badge'>Time: O(n)</span><span class='algo-badge'>Space: O(1)</span><h2 class='styled-header'>Pseudocode</h2><div class='chalk-code'>// Logic here</div>", type: PAGE_TYPES.ALGORITHM },
        logicGates: { title: "Logic Gates Simulator", content: "<h2 class='styled-header'>Logic Circuit Design</h2><div id='logicGatesSimulator'></div><h2 class='styled-header'>Truth Table</h2><p>Document your results...</p><h2 class='styled-header'>Notes</h2><p>Analysis...</p>", type: PAGE_TYPES.LOGIC_GATES },
        sysDesign: { title: "System Design", content: "<h2 class='styled-header'>Requirements</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Scalability</div></div><h2 class='styled-header'>Architecture Diagram</h2><p>(Use Sketch Mode)</p>", isWhiteboard: true, type: PAGE_TYPES.SYSTEM },
        codeStudy: { title: "Code Study", content: "<h2 class='styled-header'>Code Snippet</h2><div class='cs-code-container' contenteditable='false'><div class='cs-code-header'><span>Main.java</span></div><div class='cs-code-editor' contenteditable='true'>public static void main(String[] args) {}</div><div class='cs-code-output' contenteditable='true'>Output...</div></div><h2 class='styled-header'>Trace / Logic</h2><p>Step 1: ...</p>", type: PAGE_TYPES.NOTE },
        anatomy: { title: "Anatomy Sheet", content: "<h2 class='styled-header'>Structure & Function</h2><p>Describe location, origin, insertion...</p><h2 class='styled-header'>Relations</h2><p>Anterior, posterior...</p><h2 class='styled-header'>Clinical Relevance</h2><div class='sticky-note'>Important clinical notes...</div><h2 class='styled-header'>Sketch Area</h2><p>(Draw below)</p>", type: PAGE_TYPES.ANATOMY },
        disease: { title: "Disease Profile", content: "<h2 class='styled-header'>Definition & Etiology</h2><p>...</p><h2 class='styled-header'>Pathophysiology</h2><p>...</p><h2 class='styled-header'>Clinical Features</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Symptom 1</div></div><h2 class='styled-header'>Management</h2><p>...</p>", type: PAGE_TYPES.DISEASE },
        drug: { title: "Drug Monograph", content: "<h2 class='styled-header'>Class & Mechanism</h2><p>...</p><h2 class='styled-header'>Indications</h2><p>...</p><h2 class='styled-header'>Contraindications & Side Effects</h2><div class='sticky-note'>Warning: ...</div><h2 class='styled-header'>Dosage</h2><p>...</p>", type: PAGE_TYPES.DRUG },
        physio: { title: "Physio Case", content: "<h2 class='styled-header'>Patient Profile</h2><p>Age, Gender, Occupation...</p><h2 class='styled-header'>Assessment (SOAP)</h2><p>Subjective: ...</p><p>Objective: ...</p><h2 class='styled-header'>Treatment Plan</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Exercise 1</div></div>", type: PAGE_TYPES.CLINICAL_CASE },
        pathway: { title: "Pathway Breakdown", content: "<h2 class='styled-header'>Overview</h2><p>...</p><h2 class='styled-header'>Steps</h2><div class='chalk-code'>1. Signal -> Receptor</div><h2 class='styled-header'>Regulation</h2><p>...</p>", type: PAGE_TYPES.PATHWAY },
        lab: { title: "Lab Interpretation", content: "<h2 class='styled-header'>Test Name</h2><p>...</p><h2 class='styled-header'>Normal Range</h2><p>...</p><h2 class='styled-header'>Interpretation</h2><p>High: ...</p><p>Low: ...</p>", type: PAGE_TYPES.LAB },
        dental_anatomy: { title: "Dental Anatomy", content: "<h2 class='styled-header'>Tooth Name / Number</h2><p>...</p><h2 class='styled-header'>Morphology & Surfaces</h2><p>...</p><h2 class='styled-header'>Root Anatomy</h2><p>...</p><h2 class='styled-header'>Clinical Notes</h2><div class='sticky-note'>Eruption: ...</div>", type: PAGE_TYPES.DENTAL_ANATOMY },
        oral_pathology: { title: "Oral Pathology", content: "<h2 class='styled-header'>Condition</h2><p>...</p><h2 class='styled-header'>Etiology</h2><p>...</p><h2 class='styled-header'>Clinical Appearance</h2><p>...</p><h2 class='styled-header'>Radiographic Features</h2><p>...</p><h2 class='styled-header'>Management</h2><p>...</p>", type: PAGE_TYPES.ORAL_PATHOLOGY },
        dental_procedure: { title: "Dental Procedure", content: "<h2 class='styled-header'>Procedure Name</h2><p>...</p><h2 class='styled-header'>Indications</h2><p>...</p><h2 class='styled-header'>Instruments Required</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Mirror/Probe</div></div><h2 class='styled-header'>Step-by-Step</h2><p>1. Anesthesia...</p>", type: PAGE_TYPES.DENTAL_PROCEDURE },
        dental_case: { title: "Dental Case", content: "<h2 class='styled-header'>Patient Profile</h2><p>...</p><h2 class='styled-header'>Chief Complaint (C/O)</h2><p>...</p><h2 class='styled-header'>Examination (O/E)</h2><p>Intraoral: ...</p><h2 class='styled-header'>Diagnosis & Plan</h2><p>...</p>", type: PAGE_TYPES.DENTAL_CASE },
        prostho_plan: { title: "Prostho Plan", content: "<h2 class='styled-header'>Edentulous Space</h2><p>...</p><h2 class='styled-header'>Abutment Evaluation</h2><p>...</p><h2 class='styled-header'>Design Components</h2><p>Major Connector: ...</p><p>Clasps: ...</p>", type: PAGE_TYPES.PROSTHO_PLAN },
        endo_case: { title: "Endo Case", content: "<h2 class='styled-header'>Tooth & Diagnosis</h2><p>...</p><h2 class='styled-header'>Access & WL</h2><p>Working Length: ...mm</p><h2 class='styled-header'>Instrumentation</h2><p>MAF: ...</p><h2 class='styled-header'>Obturation</h2><p>Technique: ...</p>", type: PAGE_TYPES.ENDO_CASE },
        perio_case: { title: "Perio Charting", content: "<h2 class='styled-header'>Periodontal Status</h2><p>Pockets > 4mm: ...</p><h2 class='styled-header'>Diagnosis</h2><p>Stage: ... Grade: ...</p><h2 class='styled-header'>Treatment Plan</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Scaling & Root Planing</div></div>", type: PAGE_TYPES.PERIO_CASE },
        oral_radiology: { title: "Radiographic Report", content: "<h2 class='styled-header'>Image Type</h2><p>IOPA / OPG / CBCT</p><h2 class='styled-header'>Findings</h2><p>Radio-opacity/lucency: ...</p><h2 class='styled-header'>Interpretation</h2><p>...</p>", type: PAGE_TYPES.ORAL_RADIOLOGY },
        prob_sol: { title: "Problem Solution", content: "<h2 class='styled-header'>Problem Statement</h2><p>...</p><h2 class='styled-header'>Given & Assumptions</h2><p>...</p><h2 class='styled-header'>Diagram</h2><p>(Use Sketch Mode)</p><h2 class='styled-header'>Governing Equations</h2><p>...</p><h2 class='styled-header'>Solution</h2><p>...</p><h2 class='styled-header'>Final Answer</h2><div class='sticky-note'>Result: ...</div>", type: PAGE_TYPES.PROBLEM_SOLUTION },
        circuit: { title: "Circuit Analysis", content: "<h2 class='styled-header'>Circuit Diagram</h2><div style='background:#e8f4f8; border-left:4px solid #3498db; padding:12px; margin:10px 0; border-radius:4px; font-size:0.85rem;'>💡 <strong>Instructions:</strong> Click the ⚡ Components button in the toolbar to open the component library. Drag components onto the canvas, then use sketch mode to draw wires between them. Double-click components to delete.</div><div id='circuitDiagramCanvas' style='position:relative; min-height:400px; background:#f8f9fa; border:2px solid #3498db; border-radius:8px; margin:15px 0;'><svg id='circuitSvg' style='position:absolute; width:100%; height:100%; pointer-events:none;'></svg><div id='circuitComponentsLayer' style='position:absolute; width:100%; height:100%;'></div></div><h2 class='styled-header'>Known Values</h2><p>R1 = ...</p><h2 class='styled-header'>Laws Applied</h2><p>KCL / KVL</p><h2 class='styled-header'>Analysis</h2><p>...</p>", isWhiteboard: true, type: PAGE_TYPES.CIRCUIT_ANALYSIS },
        mech_sys: { title: "Mechanical System", content: "<h2 class='styled-header'>System Description</h2><p>...</p><h2 class='styled-header'>Free Body Diagram</h2><p>(Draw FBD)</p><h2 class='styled-header'>Equations of Motion</h2><p>F = ma...</p><h2 class='styled-header'>Solution</h2><p>...</p>", isWhiteboard: true, type: PAGE_TYPES.MECHANICAL_SYSTEM },
        struct: { title: "Structural Analysis", content: "<h2 class='styled-header'>Structure Description</h2><p>...</p><h2 class='styled-header'>Load Diagram</h2><p>...</p><h2 class='styled-header'>Calculations</h2><p>...</p><h2 class='styled-header'>Design Checks</h2><div class='checklist-item' contenteditable='false'><div class='checkbox-wrapper' contenteditable='false'><div class='checkbox'></div></div><div class='checklist-text' contenteditable='true'>Safety Factor OK</div></div>", type: PAGE_TYPES.STRUCTURAL_ANALYSIS },
        control: { title: "Control System", content: "<h2 class='styled-header'>Block Diagram</h2><p>...</p><h2 class='styled-header'>Transfer Function</h2><p>G(s) = ...</p><h2 class='styled-header'>Stability Analysis</h2><p>...</p>", isWhiteboard: true, type: PAGE_TYPES.CONTROL_SYSTEM },
        process: { title: "Process Flow", content: "<h2 class='styled-header'>Overview</h2><p>...</p><h2 class='styled-header'>Flow Diagram</h2><p>...</p><h2 class='styled-header'>Inputs / Outputs</h2><p>...</p><h2 class='styled-header'>Bottlenecks</h2><p>...</p>", isWhiteboard: true, type: PAGE_TYPES.PROCESS_FLOW },
        lab_exp: { title: "Lab Experiment", content: "<h2 class='styled-header'>Objective</h2><p>...</p><h2 class='styled-header'>Apparatus</h2><p>...</p><h2 class='styled-header'>Procedure</h2><p>1. ...</p><h2 class='styled-header'>Observations</h2><p>...</p><h2 class='styled-header'>Calculations & Conclusion</h2><p>...</p>", type: PAGE_TYPES.LAB_EXPERIMENT },

        // ADVANCED TEMPLATES
        cornell: {
            title: "Cornell Notes",
            content: `<div class="cornell-container" id="cornellTemplate">
                        <div class="cornell-header">
                            <input type="text" placeholder="Topic / Lecture Title" id="cornellTopic" class="cornell-topic" />
                            <div class="cornell-meta">
                                <span>📅 <span id="cornellDate">${new Date().toLocaleDateString()}</span></span>
                                <input type="text" placeholder="Source (optional)" id="cornellSource" style="border:none; background:transparent; flex:1;" />
                            </div>
                        </div>
                        <div class="cornell-cues" id="cornellCues">
                            <div class="cornell-cues-title">🔑 Cues / Questions</div>
                            <div style="font-size:0.8rem; opacity:0.7; margin-bottom:10px;">Select text → "🖌️ Highlight" or "Extract Cue"</div>
                        </div>
                        <div class="cornell-notes" contenteditable="true" id="cornellNotes">
                            <p>Take your lecture notes here...</p>
                            <p>• Use bullet points</p>
                            <p>• Draw diagrams in sketch mode</p>
                            <p>• Highlight key concepts, then extract as cues</p>
                        </div>
                        <div class="cornell-summary" contenteditable="true" id="cornellSummary">
                            <div class="cornell-summary-title">📝 Summary</div>
                            <p>Summarize the key concepts in 2-3 sentences...</p>
                        </div>
                        <div class="cornell-toolbar">
                            <button class="cornell-btn cornell-highlight-btn" onclick="highlightCornellText()">🖌️ Highlight</button>
                            <button class="cornell-btn" onclick="extractCornellCue()">Extract Cue</button>
                            <button class="cornell-btn" onclick="toggleCornellStudyMode()">👁️ Study Mode</button>
                        </div>
                    </div>`,
            type: PAGE_TYPES.CORNELL
        },

        zettelkasten: {
            title: "Zettelkasten Note",
            content: `<div class="zettel-container">
                        <div class="zettel-id">ID: ${Date.now()}</div>
                        <input type="text" class="zettel-title" placeholder="Note Title (max 60 chars)" maxlength="60" id="zettelTitle" />
                        <div contenteditable="true" class="zettel-content" id="zettelContent" oninput="checkZettelWordCount()">
                            Write one atomic idea here. Keep it focused and concise (300-500 words target).
                        </div>
                        <div class="zettel-wordcount" id="zettelWordcount">0 words</div>
                        
                        <div class="zettel-section">
                            <div class="zettel-section-title">📚 Source / Context</div>
                            <input type="text" placeholder="From: Book/Lecture/Thought..." style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; margin-bottom:8px;" />
                            <div class="zettel-tag-input" id="zettelTags">
                                <span style="font-size:0.85rem; opacity:0.7;">Tags (min 2):</span>
                                <input type="text" placeholder="Add tag..." onkeypress="if(event.key==='Enter'){addZettelTag(this.value); this.value='';}" style="border:none; flex:1; padding:5px;" />
                            </div>
                        </div>
                        
                        <div class="zettel-section">
                            <div class="zettel-section-title">🔗 Links</div>
                            <div style="font-size:0.85rem; opacity:0.7; margin-bottom:8px;">Connect to other notes (bi-directional)</div>
                            <div id="zettelLinks"></div>
                        </div>
                        
                        <div class="zettel-section">
                            <div class="zettel-section-title">⚡ Permanence Rating</div>
                            <div class="zettel-permanence">
                                <label><input type="radio" name="zettelPerm" value="fleeting" /> Fleeting (raw capture)</label>
                                <label><input type="radio" name="zettelPerm" value="literature" /> Literature (paraphrased)</label>
                                <label><input type="radio" name="zettelPerm" value="permanent" checked /> Permanent (synthesized)</label>
                            </div>
                        </div>
                    </div>`,
            type: PAGE_TYPES.ZETTELKASTEN
        },

        outline: {
            title: "Outline",
            content: `<div class="outline-container">
                        <div class="outline-header">
                            <input type="text" class="outline-title" placeholder="Chapter / Topic" />
                            <div class="outline-controls">
                                <button class="cornell-btn" onclick="collapseAllOutline()">↻ Collapse All</button>
                                <button class="cornell-btn" onclick="expandAllOutline()">⊕ Expand All</button>
                            </div>
                        </div>
                        <div id="outlineContent" contenteditable="true" style="outline:none;">
                            <div class="outline-item level-1"><span class="outline-label">I.</span> Main Topic</div>
                            <div class="outline-item level-2"><span class="outline-label">A.</span> Subtopic</div>
                            <div class="outline-item level-3"><span class="outline-label">1.</span> Detail</div>
                            <div class="outline-item level-3"><span class="outline-label">2.</span> Detail</div>
                            <div class="outline-item level-2"><span class="outline-label">B.</span> Subtopic</div>
                            <div class="outline-item level-1"><span class="outline-label">II.</span> Main Topic</div>
                        </div>
                        <div style="margin-top:15px; padding:12px; background:rgba(149,165,166,0.1); border-radius:5px; font-size:0.85rem;">
                            <strong>💡 Tip:</strong> Press <b>Enter</b> to add a new item. <b>Tab</b> to indent, <b>Backspace</b> (at start) or <b>Shift+Tab</b> to outdent. Max 4 levels.
                        </div>
                    </div>`,
            type: PAGE_TYPES.OUTLINE
        },

        mindmap: {
            title: "Mind Map",
            content: `<div class="mindmap-container" id="mindmapContainer">
                        <div class="mindmap-toolbar">
                            <button class="cornell-btn" onclick="addMindmapNode()">+ Node</button>
                            <button class="cornell-btn" onclick="addMindmapLink()">🔗 Link</button>
                            <button class="cornell-btn" onclick="autoLayoutMindmap()">🎨 Organize</button>
                        </div>
                        <div class="mindmap-canvas" id="mindmapCanvas">
                            <div class="mindmap-node central" style="left:50%; top:50%; transform:translate(-50%,-50%);">
                                <input type="text" placeholder="Central Concept" maxlength="50" />
                            </div>
                        </div>
                    </div>`,
            type: PAGE_TYPES.MINDMAP
        },

        sq3r: {
            title: "SQ3R Reading Notes",
            content: `<div class="sq3r-container">
                        <div class="sq3r-header">
                            <input type="text" class="sq3r-source" placeholder="Reading Source (Title, Chapter, Pages)" />
                        </div>
                        
                        <div class="sq3r-section" id="sq3rSurvey">
                            <div class="sq3r-section-icon">📖</div>
                            <div class="sq3r-section-title">Survey (Skim First)</div>
                            <input type="text" placeholder="Headings noticed..." style="width:100%; padding:8px; margin-bottom:8px; border:1px solid #ddd; border-radius:4px;" />
                            <input type="text" placeholder="Key terms spotted..." style="width:100%; padding:8px; margin-bottom:8px; border:1px solid #ddd; border-radius:4px;" />
                            <div class="sq3r-difficulty">
                                <label><input type="radio" name="sq3rDiff" value="easy" /> Easy</label>
                                <label><input type="radio" name="sq3rDiff" value="medium" checked /> Medium</label>
                                <label><input type="radio" name="sq3rDiff" value="hard" /> Hard</label>
                            </div>
                        </div>
                        
                        <div class="sq3r-section" id="sq3rQuestion">
                            <div class="sq3r-section-icon">❓</div>
                            <div class="sq3r-section-title">Question (Pre-read questions)</div>
                            <div style="font-size:0.85rem; margin-bottom:10px; opacity:0.8;">What do I expect to learn? (Min 3 questions)</div>
                            <div class="sq3r-question-item" contenteditable="true">1. </div>
                            <div class="sq3r-question-item" contenteditable="true">2. </div>
                            <div class="sq3r-question-item" contenteditable="true">3. </div>
                        </div>
                        
                        <div class="sq3r-section locked" id="sq3rRead">
                            <div class="sq3r-section-icon">📝</div>
                            <div class="sq3r-section-title">Read (Main Notes)</div>
                            <div contenteditable="true" style="min-height:200px; padding:12px; background:white; border-radius:5px;">
                                Take comprehensive notes while reading...
                            </div>
                        </div>
                        
                        <div class="sq3r-section locked" id="sq3rRecite">
                            <div class="sq3r-section-icon">🔁</div>
                            <div class="sq3r-section-title">Recite (Answer from Memory)</div>
                            <div style="font-size:0.85rem; margin-bottom:10px; opacity:0.8;">Answer your questions without looking</div>
                            <div class="sq3r-question-item" contenteditable="true">Answer 1: </div>
                            <div class="sq3r-question-item" contenteditable="true">Answer 2: </div>
                            <div class="sq3r-question-item" contenteditable="true">Answer 3: </div>
                            <button class="sq3r-recite-compare" onclick="compareSQ3RAnswers()">Compare with Notes</button>
                        </div>
                        
                        <div class="sq3r-section locked" id="sq3rReview">
                            <div class="sq3r-section-icon">📚</div>
                            <div class="sq3r-section-title">Review (Spaced Repetition)</div>
                            <div class="sq3r-review-tracker">
                                <div>
                                    <strong>Confidence:</strong>
                                    <div class="sq3r-stars" onclick="rateSQ3RConfidence(event)">★☆☆☆☆</div>
                                </div>
                                <div>
                                    <div><strong>Last:</strong> Today</div>
                                    <div><strong>Next:</strong> 1 day</div>
                                </div>
                            </div>
                        </div>
                    </div>`,
            type: PAGE_TYPES.SQ3R
        },

        feynman: {
            title: "Feynman Technique",
            content: `<div class="feynman-container">
                        <div class="feynman-header">
                            <input type="text" class="feynman-concept" placeholder="Concept to Master" />
                        </div>
                        
                        <div class="feynman-step" id="feynmanStep1">
                            <div class="feynman-step-header">
                                <div class="feynman-step-number">1</div>
                                <div class="feynman-step-title">🎓 Study & Understand</div>
                            </div>
                            <div contenteditable="true" style="min-height:150px; padding:12px; background:rgba(230,126,34,0.05); border-radius:5px;">
                                Research and gather your initial understanding...
                            </div>
                        </div>
                        
                        <div class="feynman-step locked" id="feynmanStep2">
                            <div class="feynman-step-header">
                                <div class="feynman-step-number">2</div>
                                <div class="feynman-step-title">👶 Explain Like I'm 12</div>
                            </div>
                            <div contenteditable="true" id="feynmanSimple" oninput="checkFeynmanReadability()" style="min-height:200px; padding:12px; background:white; border-radius:5px;">
                                Explain this concept in simple terms, as if teaching a child...
                            </div>
                            <div class="feynman-readability" id="feynmanReadability">
                                <div>📊 Readability: <span id="feynmanScore">-</span></div>
                                <div style="font-size:0.85rem; opacity:0.8;">Target: Grade 6-8 level</div>
                            </div>
                        </div>
                        
                        <div class="feynman-step locked" id="feynmanStep3">
                            <div class="feynman-step-header">
                                <div class="feynman-step-number">3</div>
                                <div class="feynman-step-title">🔍 Identify Gaps</div>
                            </div>
                            <div style="font-size:0.85rem; margin-bottom:10px; opacity:0.8;">What couldn't you explain simply?</div>
                            <div class="feynman-gap-item" contenteditable="true">Gap 1: </div>
                            <div class="feynman-gap-item" contenteditable="true">Gap 2: </div>
                        </div>
                        
                        <div class="feynman-step locked" id="feynmanStep4">
                            <div class="feynman-step-header">
                                <div class="feynman-step-number">4</div>
                                <div class="feynman-step-title">📖 Review & Simplify</div>
                            </div>
                            <div contenteditable="true" style="min-height:150px; padding:12px; background:rgba(46,204,113,0.05); border-radius:5px;">
                                Return to source material, address gaps, refine your explanation...
                            </div>
                            <div class="feynman-iteration">Iteration #<span id="feynmanIterationCount">1</span></div>
                        </div>
                    </div>`,
            type: PAGE_TYPES.FEYNMAN
        }
    };

    const selected = temps[key];
    if (selected) {
        document.getElementById('pageTitle').value = selected.title;

        // Apply to the ACTIVE chapter's content area
        const activeBlock = document.getElementById(`page-block-${currentId}`);
        const contentArea = activeBlock ? activeBlock.querySelector('.content-area') : document.querySelector('.content-area');
        if (contentArea) {
            contentArea.innerHTML = selected.content;
        }

        if (selected.isWhiteboard) {
            chapter.isWhiteboard = true;
            document.getElementById('paper').classList.add('infinite');
        } else {
            chapter.isWhiteboard = false;
            document.getElementById('paper').classList.remove('infinite');
        }

        let disc = 'general';
        if (['algo', 'codeStudy', 'sysDesign', 'project', 'logicGates'].includes(key)) disc = 'cs';
        if (['anatomy', 'disease', 'drug', 'physio', 'pathway', 'lab'].includes(key)) disc = 'medical';
        if (['dental_anatomy', 'oral_pathology', 'dental_procedure', 'dental_case', 'prostho_plan', 'endo_case', 'perio_case', 'oral_radiology'].includes(key)) disc = 'medical';
        if (['prob_sol', 'circuit', 'mech_sys', 'struct', 'control', 'process', 'lab_exp'].includes(key)) disc = 'engineering';

        // Advanced templates can be used in any discipline
        if (['cornell', 'zettelkasten', 'outline', 'mindmap', 'sq3r', 'feynman'].includes(key)) {
            // Keep existing discipline or set to general
            disc = chapter.metadata?.discipline || 'general';
        }

        chapter.metadata.discipline = disc;
        chapter.metadata.type = selected.type || PAGE_TYPES.NOTE;

        if (disc === 'engineering') {
            if (key === 'circuit' || key === 'control') chapter.metadata.branch = 'Electrical';
            else if (key === 'mech_sys') chapter.metadata.branch = 'Mechanical';
            else if (key === 'struct') chapter.metadata.branch = 'Civil';
            else if (key === 'process') chapter.metadata.branch = 'Industrial';
            else chapter.metadata.branch = 'General';
        }

        await saveChapterToDB(chapter);
        renderSidebar();
        updateToolVisibility(chapter);

        // Initialize Logic Gates Simulator if this template was selected
        if (key === 'logicGates') {
            setTimeout(() => initLogicGatesSimulator(), 100);
        }

        // Initialize advanced template features
        if (['cornell', 'zettelkasten', 'sq3r', 'feynman'].includes(key)) {
            setTimeout(() => {
                const cornellNotes = document.getElementById('cornellNotes');
                if (cornellNotes) cornellNotes.addEventListener('input', checkCornellNotesLength);

                const zettelContent = document.getElementById('zettelContent');
                if (zettelContent) checkZettelWordCount();

                const feynmanSimple = document.getElementById('feynmanSimple');
                if (feynmanSimple) feynmanSimple.addEventListener('input', checkFeynmanReadability);
            }, 100);
        }

        // Initialize outline template
        if (key === 'outline') {
            setTimeout(() => {
                if (typeof initOutlineTemplate === 'function') {
                    initOutlineTemplate();
                }
            }, 100);
        }

        // Initialize mindmap template
        if (key === 'mindmap') {
            setTimeout(() => {
                if (typeof initMindmapTemplate === 'function') {
                    initMindmapTemplate();
                }
            }, 100);
        }

        // Circuit symbols tray will be toggled via Components button
        // No auto-initialization needed
    }
    toggleTemplates();
    resizeCanvas();
};

window.renderSidebar = () => {
    const list = document.getElementById('chapterList');
    const searchStr = document.getElementById('sidebarSearch').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    list.innerHTML = '';

    const filtered = chapters.filter(ch => {
        const titleMatch = (ch.title || '').toLowerCase().includes(searchStr);
        const tagMatch = (ch.tags || []).some(t => t.toLowerCase().includes(searchStr.replace('#', '')));
        const matchesSearch = titleMatch || tagMatch;

        // Smart Filtering based on Discipline or Category
        let matchesCat = true;
        if (categoryFilter !== 'all') {
            if (['Algorithms', 'Systems', 'Projects'].includes(categoryFilter)) {
                matchesCat = (ch.category === categoryFilter);
                if (ch.metadata?.type === PAGE_TYPES.ALGORITHM && categoryFilter === 'Algorithms') matchesCat = true;
                if (ch.metadata?.type === PAGE_TYPES.SYSTEM && categoryFilter === 'Systems') matchesCat = true;
                if (ch.metadata?.type === PAGE_TYPES.PROJECT && categoryFilter === 'Projects') matchesCat = true;
            } else if (['Anatomy', 'Pathology', 'Pharmacology', 'Clinical'].includes(categoryFilter)) {
                if (ch.metadata?.discipline !== 'medical') return false;
                if (categoryFilter === 'Anatomy' && ch.metadata?.type !== PAGE_TYPES.ANATOMY) matchesCat = false;
                if (categoryFilter === 'Pathology' && ch.metadata?.type !== PAGE_TYPES.DISEASE) matchesCat = false;
                if (categoryFilter === 'Pharmacology' && ch.metadata?.type !== PAGE_TYPES.DRUG) matchesCat = false;
                if (categoryFilter === 'Clinical' && ![PAGE_TYPES.CLINICAL_CASE, PAGE_TYPES.LAB].includes(ch.metadata?.type)) matchesCat = false;
            } else if (['Dental Anatomy', 'Procedures', 'Dental Cases'].includes(categoryFilter)) {
                if (ch.metadata?.discipline !== 'medical') return false;
                if (categoryFilter === 'Dental Anatomy' && ch.metadata?.type !== PAGE_TYPES.DENTAL_ANATOMY) matchesCat = false;
                if (categoryFilter === 'Procedures' && ![PAGE_TYPES.DENTAL_PROCEDURE, PAGE_TYPES.PROSTHO_PLAN].includes(ch.metadata?.type)) matchesCat = false;
                if (categoryFilter === 'Dental Cases' && ![PAGE_TYPES.DENTAL_CASE, PAGE_TYPES.ENDO_CASE, PAGE_TYPES.PERIO_CASE, PAGE_TYPES.ORAL_RADIOLOGY, PAGE_TYPES.ORAL_PATHOLOGY].includes(ch.metadata?.type)) matchesCat = false;

            } else if (['Electrical', 'Mechanical', 'Civil', 'Electronics', 'Mechatronics', 'Industrial'].includes(categoryFilter)) {
                if (ch.metadata?.discipline !== 'engineering') return false;
                if (ch.metadata?.branch !== categoryFilter) matchesCat = false;
            } else if (categoryFilter === 'General') {
                matchesCat = ch.metadata?.discipline === 'general';
            }
        }

        return matchesSearch && matchesCat;
    });

    filtered.forEach(ch => {
        const li = document.createElement('li');
        li.className = `nav-item ${ch.id === currentId ? 'active' : ''}`;

        const cleanContent = (ch.content || '').replace(/<[^>]*>?/gm, '');
        let snippet = cleanContent.substring(0, 60) + (cleanContent.length > 60 ? '...' : '');

        let tagsHtml = (ch.tags || []).map(t => `<span class="tag-mini">#${t}</span>`).join('');
        let catBadge = '';
        const disp = ch.metadata?.discipline || ch.category;
        if (disp && disp !== 'general' && categoryFilter === 'all') {
            catBadge = `<div class="cat-badge">${disp.toUpperCase()}</div>`;
        }

        li.innerHTML = `
                    <div class="nav-info" onclick="loadChapter('${ch.id}')">
                        <div class="nav-item-title">${ch.title || 'Untitled'}</div>
                        <div class="nav-item-snippet">${snippet}</div>
                        <div style="margin-top:4px; display:flex;">${tagsHtml}</div>
                        ${catBadge}
                    </div>
                    <button class="btn-delete" onclick="deleteChapter('${ch.id}', event)" title="Delete Page">🗑️</button>
                `;
        list.appendChild(li);
    });

    renderTagsSidebar(); // Refresh tags sidebar when sidebar updates
};

// ─── USER PROFILE WIDGET ─────────────────────────────────────────────────────

function renderUserProfile() {
    const bar = document.getElementById('userProfileBar');
    if (!bar || !window.AUTH) return;

    const user = window.AUTH.getCurrentUser();
    if (!user) return;

    const avatarSvg   = window.AUTH.getAvatarHTML(34);
    const isGuest     = user.isGuest;
    const guestBadge  = isGuest
        ? `<span class="up-guest-badge">Guest</span>`
        : '';

    bar.innerHTML = `
        <div class="up-avatar">${avatarSvg}</div>
        <div class="up-info">
            <div class="up-name">${user.displayName}${guestBadge}</div>
            <div class="up-email">${isGuest ? 'Temporary session' : user.email}</div>
        </div>
        <div class="up-actions">
            ${!isGuest ? `<button class="up-btn" onclick="openAccountModal()" title="Account settings">⚙️</button>` : ''}
            <button class="up-btn up-logout" onclick="window.AUTH.logout()" title="Sign out">↩️</button>
        </div>
    `;
}

// ─── ACCOUNT SETTINGS MODAL ──────────────────────────────────────────────────

function openAccountModal() {
    // Remove existing if present
    const existing = document.getElementById('accountModal');
    if (existing) existing.remove();

    const user = window.AUTH.getCurrentUser();
    if (!user) return;

    const modal = document.createElement('div');
    modal.id = 'accountModal';
    modal.className = 'floating-pane';
    modal.style.cssText = 'display:block; width:310px; z-index:3000; top:80px; left:20px;';
    modal.innerHTML = `
        <h3 style="margin-bottom:15px; font-family:'Caveat',cursive; font-size:1.3rem;">👤 Account</h3>

        <div class="meta-group" style="margin-bottom:12px;">
            <label class="meta-label">Display Name</label>
            <div style="display:flex; gap:6px; align-items:center;">
                <input class="meta-value" id="accName" type="text" value="${user.displayName}" placeholder="Your name"/>
                <button class="tool-btn" id="accNameSave"
                        style="width:auto; padding:4px 10px; font-size:0.8rem; background:var(--save-color); color:white;"
                        onclick="saveDisplayName()">Save</button>
            </div>
        </div>

        <div class="meta-group" style="border-top:1px dashed #ddd; padding-top:12px; margin-top:4px;">
            <label class="meta-label" style="margin-bottom:8px; display:block;">Change Password</label>
            <input class="meta-value" id="accOldPw" type="password" placeholder="Current password" style="margin-bottom:6px;"/>
            <input class="meta-value" id="accNewPw" type="password" placeholder="New password (min 6)" style="margin-bottom:6px;"/>
            <input class="meta-value" id="accConfPw" type="password" placeholder="Confirm new password" style="margin-bottom:8px;"/>
            <button class="tool-btn" style="background:var(--save-color); color:white; justify-content:center;"
                    onclick="savePassword()">🔒 Update Password</button>
            <div id="accMsg" style="font-size:0.8rem; margin-top:6px; display:none;"></div>
        </div>

        <div class="meta-group" style="border-top:1px dashed #ddd; padding-top:12px; margin-top:4px;">
            <button class="tool-btn btn-danger" style="justify-content:center;"
                    onclick="confirmDeleteAccount()">⚠ Delete Account & All Notes</button>
        </div>

        <button class="tool-btn" style="margin-top:10px; background:#eee;"
                onclick="document.getElementById('accountModal').remove()">Close</button>
    `;

    document.body.appendChild(modal);
}

async function saveDisplayName() {
    const input = document.getElementById('accName');
    const name  = (input.value || '').trim();
    if (!name) return;
    window.AUTH.updateDisplayName(name);
    renderUserProfile();
    showToast('✓ Name updated');
}

async function savePassword() {
    const msgEl  = document.getElementById('accMsg');
    const oldPw  = document.getElementById('accOldPw').value;
    const newPw  = document.getElementById('accNewPw').value;
    const confPw = document.getElementById('accConfPw').value;

    msgEl.style.display = 'none';

    if (newPw !== confPw) {
        msgEl.textContent = '❌ Passwords do not match.';
        msgEl.style.color = '#e74c3c';
        msgEl.style.display = 'block';
        return;
    }

    const result = await window.AUTH.updatePassword(oldPw, newPw);
    msgEl.style.display = 'block';
    if (result.ok) {
        msgEl.textContent = '✓ Password updated!';
        msgEl.style.color = '#27ae60';
        ['accOldPw','accNewPw','accConfPw'].forEach(id => document.getElementById(id).value = '');
    } else {
        msgEl.textContent = '❌ ' + result.error;
        msgEl.style.color = '#e74c3c';
    }
}

async function confirmDeleteAccount() {
    if (!confirm('⚠️ This will permanently delete your account and ALL notes. This cannot be undone.\n\nAre you sure?')) return;
    await window.AUTH.deleteAccount(); // redirects to login
}

// ─────────────────────────────────────────────────────────────────────────────

window.toggleDarkMode = () => {
    const isDark = document.body.classList.toggle('dark-mode');
    document.getElementById('darkModeToggle').innerText = isDark ? '☀️' : '🌙';
};

window.showToast = (msg) => {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
};

// --- PWA LOGIC ---
const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#2c3e50"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="300">📝</text></svg>`;
const iconUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSVG)}`;

document.getElementById('appIcon').href = iconUrl;
document.getElementById('appleIcon').href = iconUrl;

const manifest = {
    "name": "Academic Notebook",
    "short_name": "Notebook",
    "start_url": ".",
    "display": "standalone",
    "background_color": "#fdfbf7",
    "theme_color": "#2c3e50",
    "orientation": "any",
    "icons": [
        {
            "src": iconUrl,
            "sizes": "512x512",
            "type": "image/svg+xml",
            "purpose": "any maskable"
        }
    ]
};

const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
document.getElementById('appManifest').href = URL.createObjectURL(manifestBlob);

let deferredPrompt;
const installBtn = document.getElementById('installAppBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'flex';
});

window.installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        installBtn.style.display = 'none';
    }
    deferredPrompt = null;
};

window.addEventListener('appinstalled', () => {
    installBtn.style.display = 'none';
    showToast("App Installed Successfully!");
});

// ==================== POMODORO TIMER ====================
let pomodoroInterval = null;
let pomodoroTimeLeft = 25 * 60; // 25 minutes in seconds
let pomodoroTotalTime = 25 * 60;
let pomodoroMode = 'focus'; // 'focus' or 'break'
let pomodoroPaused = false;
let dndEnabled = false;
let pomodoroSessionCount = 0;
let pomodoroTodayCount = 0;
let pomodoroLastDate = null;

// Load saved stats from localStorage
function loadPomodoroStats() {
    const POMODORO_KEY = window.AUTH ? window.AUTH.getStorageKey('pomodoroStats') : 'pomodoroStats';
    const saved = localStorage.getItem(POMODORO_KEY);
    if (saved) {
        const stats = JSON.parse(saved);
        pomodoroSessionCount = stats.sessions || 0;
        pomodoroLastDate = stats.lastDate || null;

        // Reset today count if it's a new day
        const today = new Date().toDateString();
        if (pomodoroLastDate === today) {
            pomodoroTodayCount = stats.todayCount || 0;
        } else {
            pomodoroTodayCount = 0;
        }
    }
    updatePomodoroStats();
}

// Save stats to localStorage
function savePomodoroStats() {
    const POMODORO_KEY = window.AUTH ? window.AUTH.getStorageKey('pomodoroStats') : 'pomodoroStats';
    const stats = {
        sessions: pomodoroSessionCount,
        todayCount: pomodoroTodayCount,
        lastDate: new Date().toDateString()
    };
    localStorage.setItem(POMODORO_KEY, JSON.stringify(stats));
}

// Update stats display
function updatePomodoroStats() {
    document.getElementById('pomodoroSessionCount').innerText = pomodoroSessionCount;
    document.getElementById('pomodoroTodayCount').innerText = pomodoroTodayCount;
}

function updatePomodoroDisplay() {
    const minutes = Math.floor(pomodoroTimeLeft / 60);
    const seconds = pomodoroTimeLeft % 60;
    const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    document.getElementById('pomodoroDisplay').innerText = timeString;
    if (dndEnabled) {
        document.getElementById('dndTimer').innerText = timeString;
    }

    // Update progress bar
    const progress = ((pomodoroTotalTime - pomodoroTimeLeft) / pomodoroTotalTime) * 100;
    document.getElementById('pomodoroProgressBar').style.width = progress + '%';

    // Update page title if timer is running
    if (pomodoroInterval && !pomodoroPaused) {
        document.title = `${timeString} - ${pomodoroMode === 'focus' ? '🍅 Focus' : '☕ Break'}`;
    }
}

function startPomodoro() {
    if (pomodoroInterval) return; // Already running

    pomodoroPaused = false;
    document.getElementById('pomodoroStartBtn').style.display = 'none';
    document.getElementById('pomodoroPauseBtn').style.display = 'inline-block';

    // Enable DND if checkbox is checked
    if (document.getElementById('dndToggle').checked) {
        enableDnd();
    }

    // Show encouraging toast
    if (pomodoroMode === 'focus') {
        showToast("🍅 Focus session started! You've got this!");
    } else {
        showToast("☕ Break time! Relax and recharge.");
    }

    pomodoroInterval = setInterval(() => {
        if (!pomodoroPaused) {
            pomodoroTimeLeft--;
            updatePomodoroDisplay();

            if (pomodoroTimeLeft <= 0) {
                // Timer finished
                clearInterval(pomodoroInterval);
                pomodoroInterval = null;

                // Play notification sound
                playBeep();

                // Switch modes
                if (pomodoroMode === 'focus') {
                    // Focus session completed - increment counters
                    pomodoroSessionCount++;
                    pomodoroTodayCount++;
                    savePomodoroStats();
                    updatePomodoroStats();

                    pomodoroMode = 'break';
                    pomodoroTimeLeft = 5 * 60; // 5 minute break
                    pomodoroTotalTime = 5 * 60;
                    document.getElementById('pomodoroMode').innerText = 'Break Time';
                    showToast("🎉 Great work! You completed a focus session! Time for a 5-minute break.");
                    disableDnd();
                } else {
                    pomodoroMode = 'focus';
                    pomodoroTimeLeft = 25 * 60; // 25 minute focus
                    pomodoroTotalTime = 25 * 60;
                    document.getElementById('pomodoroMode').innerText = 'Focus Time';
                    showToast("☕ Break over! Ready for another focus session?");
                }

                document.getElementById('pomodoroStartBtn').style.display = 'inline-block';
                document.getElementById('pomodoroPauseBtn').style.display = 'none';
                document.title = 'Academic Notebook';
                updatePomodoroDisplay();
            }
        }
    }, 1000);
}

function pausePomodoro() {
    if (!pomodoroInterval) return;

    pomodoroPaused = !pomodoroPaused;
    const pauseBtn = document.getElementById('pomodoroPauseBtn');

    if (pomodoroPaused) {
        pauseBtn.innerHTML = '▶️ Resume';
        pauseBtn.title = 'Resume timer';
        document.title = '⏸️ Paused - Academic Notebook';
        showToast("⏸️ Timer paused");
    } else {
        pauseBtn.innerHTML = '⏸️ Pause';
        pauseBtn.title = 'Pause timer';
        showToast("▶️ Timer resumed");
    }
}

function resetPomodoro() {
    const wasRunning = pomodoroInterval !== null;

    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroPaused = false;

    pomodoroMode = 'focus';
    pomodoroTimeLeft = 25 * 60;
    pomodoroTotalTime = 25 * 60;

    document.getElementById('pomodoroMode').innerText = 'Focus Time';
    document.getElementById('pomodoroStartBtn').style.display = 'inline-block';
    document.getElementById('pomodoroPauseBtn').style.display = 'none';
    document.getElementById('pomodoroProgressBar').style.width = '0%';
    document.title = 'Academic Notebook';

    updatePomodoroDisplay();
    disableDnd();

    if (wasRunning) {
        showToast("🔄 Timer reset to 25 minutes");
    }
}

function enableDnd() {
    dndEnabled = true;
    document.getElementById('dndOverlay').classList.add('active');

    // Disable toolbar and sketch tools, but keep some navigation
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) toolbar.style.pointerEvents = 'none';

    // Keep sidebar accessible but make it semi-transparent as a hint
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.style.opacity = '0.5';
        sidebar.style.pointerEvents = 'auto'; // Allow sidebar interaction
    }

    // But allow the DND overlay to be clickable
    document.getElementById('dndOverlay').style.pointerEvents = 'auto';

    showToast("🔇 Do Not Disturb mode enabled");
}

function disableDnd() {
    dndEnabled = false;
    document.getElementById('dndOverlay').classList.remove('active');

    // Re-enable toolbar and sketch tools
    const toolbar = document.querySelector('.toolbar');
    const sidebar = document.querySelector('.sidebar');
    if (toolbar) toolbar.style.pointerEvents = 'auto';
    if (sidebar) {
        sidebar.style.pointerEvents = 'auto';
        sidebar.style.opacity = '1';
    }
}

function exitDnd() {
    disableDnd();
    // Pause the timer when exiting DND
    if (pomodoroInterval && !pomodoroPaused) {
        pausePomodoro();
    }
    showToast("Focus mode exited - timer paused");
}

function updateDndSetting() {
    // If timer is running and DND checkbox changes
    if (pomodoroInterval && !pomodoroPaused) {
        if (document.getElementById('dndToggle').checked) {
            enableDnd();
        } else {
            disableDnd();
        }
    }
}

function playBeep() {
    // Create a pleasant notification sound using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // First beep
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.frequency.value = 800;
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        osc1.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 0.2);

        // Second beep
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1000;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, audioContext.currentTime + 0.3);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        osc2.start(audioContext.currentTime + 0.3);
        osc2.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.log('Audio not supported');
    }
}

// Initialize pomodoro
loadPomodoroStats();
updatePomodoroDisplay();

// ==================== LOGIC GATES SIMULATOR ====================
let logicSimulator = {
    gates: [],
    inputs: [],
    outputs: [],
    wires: [],
    selectedGate: null,
    dragging: null,
    canvas: null,
    nextId: 1
};

function initLogicGatesSimulator() {
    const container = document.getElementById('logicGatesSimulator');
    if (!container) return;

    container.innerHTML = `
                <div class="logic-toolbar">
                    <button class="logic-gate-btn" onclick="addLogicInput()">
                        <span>🟢</span> Add Input
                    </button>
                    <button class="logic-gate-btn" onclick="addLogicGate('AND')">AND Gate</button>
                    <button class="logic-gate-btn" onclick="addLogicGate('OR')">OR Gate</button>
                    <button class="logic-gate-btn" onclick="addLogicGate('NOT')">NOT Gate</button>
                    <button class="logic-gate-btn" onclick="addLogicGate('NAND')">NAND Gate</button>
                    <button class="logic-gate-btn" onclick="addLogicGate('NOR')">NOR Gate</button>
                    <button class="logic-gate-btn" onclick="addLogicGate('XOR')">XOR Gate</button>
                    <button class="logic-gate-btn" onclick="addLogicOutput()">
                        <span>🟡</span> Add Output
                    </button>
                </div>
                <div class="logic-info">
                    💡 <strong>Instructions:</strong> Add inputs and gates, drag them to position, click inputs to toggle ON/OFF (green/red), and connect gates by clicking them in sequence. Add outputs to see final results.
                </div>
                <div class="logic-canvas-area" id="logicCanvas"></div>
                <div class="logic-controls">
                    <button class="logic-control-btn" onclick="evaluateCircuit()">▶ Evaluate Circuit</button>
                    <button class="logic-control-btn danger" onclick="clearCircuit()">🗑️ Clear All</button>
                </div>
            `;

    logicSimulator.canvas = document.getElementById('logicCanvas');
    renderLogicCanvas();
}

function addLogicInput() {
    const input = {
        id: logicSimulator.nextId++,
        type: 'input',
        x: 50,
        y: 50 + (logicSimulator.inputs.length * 60),
        state: false, // false = OFF (0), true = ON (1)
        label: `IN${logicSimulator.inputs.length + 1}`
    };
    logicSimulator.inputs.push(input);
    renderLogicCanvas();
    showToast(`Input ${input.label} added`);
}

function addLogicGate(gateType) {
    const gate = {
        id: logicSimulator.nextId++,
        type: 'gate',
        gateType: gateType,
        x: 250,
        y: 100 + (logicSimulator.gates.length * 80),
        inputs: [],
        output: null
    };
    logicSimulator.gates.push(gate);
    renderLogicCanvas();
    showToast(`${gateType} gate added`);
}

function addLogicOutput() {
    const output = {
        id: logicSimulator.nextId++,
        type: 'output',
        x: 500,
        y: 150,
        connectedTo: null,
        state: false,
        label: `OUT${logicSimulator.outputs.length + 1}`
    };
    logicSimulator.outputs.push(output);
    renderLogicCanvas();
    showToast(`Output ${output.label} added`);
}

function renderLogicCanvas() {
    if (!logicSimulator.canvas) return;

    logicSimulator.canvas.innerHTML = '';

    // Render inputs
    logicSimulator.inputs.forEach(input => {
        const el = document.createElement('div');
        el.className = `logic-input ${input.state ? 'on' : 'off'}`;
        el.style.left = input.x + 'px';
        el.style.top = input.y + 'px';
        el.innerHTML = input.state ? '1' : '0';
        el.title = `${input.label}: Click to toggle`;
        el.onclick = (e) => {
            e.stopPropagation();
            input.state = !input.state;
            renderLogicCanvas();
            evaluateCircuit();
        };
        makeDraggable(el, input);
        logicSimulator.canvas.appendChild(el);

        // Label
        const label = document.createElement('div');
        label.style.position = 'absolute';
        label.style.left = (input.x) + 'px';
        label.style.top = (input.y + 45) + 'px';
        label.style.fontSize = '0.75rem';
        label.style.fontWeight = 'bold';
        label.style.color = '#2c3e50';
        label.textContent = input.label;
        logicSimulator.canvas.appendChild(label);
    });

    // Render gates
    logicSimulator.gates.forEach(gate => {
        const el = document.createElement('div');
        el.className = `logic-gate ${logicSimulator.selectedGate === gate ? 'selected' : ''}`;
        el.style.left = gate.x + 'px';
        el.style.top = gate.y + 'px';
        el.textContent = gate.gateType;
        el.title = `${gate.gateType} Gate`;
        el.onclick = (e) => {
            e.stopPropagation();
            logicSimulator.selectedGate = gate;
            renderLogicCanvas();
        };
        makeDraggable(el, gate);
        logicSimulator.canvas.appendChild(el);
    });

    // Render outputs
    logicSimulator.outputs.forEach(output => {
        const el = document.createElement('div');
        el.className = `logic-output ${output.state ? 'on' : ''}`;
        el.style.left = output.x + 'px';
        el.style.top = output.y + 'px';
        el.innerHTML = output.state ? '1' : '0';
        el.title = output.label;
        makeDraggable(el, output);
        logicSimulator.canvas.appendChild(el);

        // Label
        const label = document.createElement('div');
        label.style.position = 'absolute';
        label.style.left = (output.x + 5) + 'px';
        label.style.top = (output.y + 55) + 'px';
        label.style.fontSize = '0.75rem';
        label.style.fontWeight = 'bold';
        label.style.color = '#2c3e50';
        label.textContent = output.label;
        logicSimulator.canvas.appendChild(label);
    });
}

function makeDraggable(element, dataObj) {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    element.addEventListener('mousedown', (e) => {
        if (e.target !== element) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = dataObj.x;
        initialY = dataObj.y;
        element.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        dataObj.x = Math.max(0, Math.min(initialX + dx, logicSimulator.canvas.offsetWidth - 100));
        dataObj.y = Math.max(0, Math.min(initialY + dy, logicSimulator.canvas.offsetHeight - 50));
        element.style.left = dataObj.x + 'px';
        element.style.top = dataObj.y + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            element.style.cursor = 'move';
        }
    });
}

function evaluateCircuit() {
    // Simple evaluation: compute gate outputs based on connected inputs
    logicSimulator.gates.forEach(gate => {
        // For demo purposes, we'll simulate simple logic
        // In a full implementation, you'd track connections and compute based on those
        const inputStates = logicSimulator.inputs.map(i => i.state);

        // Simple logic for demonstration
        switch (gate.gateType) {
            case 'AND':
                gate.output = inputStates.every(s => s === true);
                break;
            case 'OR':
                gate.output = inputStates.some(s => s === true);
                break;
            case 'NOT':
                gate.output = !inputStates[0];
                break;
            case 'NAND':
                gate.output = !inputStates.every(s => s === true);
                break;
            case 'NOR':
                gate.output = !inputStates.some(s => s === true);
                break;
            case 'XOR':
                gate.output = inputStates.filter(s => s === true).length === 1;
                break;
        }
    });

    // Update outputs (simplified - connect last gate output to first output)
    if (logicSimulator.gates.length > 0 && logicSimulator.outputs.length > 0) {
        logicSimulator.outputs[0].state = logicSimulator.gates[logicSimulator.gates.length - 1].output;
    }

    renderLogicCanvas();
    showToast("Circuit evaluated!");
}

function clearCircuit() {
    if (confirm('Clear all gates, inputs, and outputs?')) {
        logicSimulator.gates = [];
        logicSimulator.inputs = [];
        logicSimulator.outputs = [];
        logicSimulator.wires = [];
        logicSimulator.selectedGate = null;
        renderLogicCanvas();
        showToast("Circuit cleared");
    }
}

// --- ANATOMY ATLAS FUNCTIONS ---

window.openAnatomyModal = () => {
    renderAnatomyMap('body'); // Default to body
    document.getElementById('anatomyModal').style.display = 'flex';
};

window.closeAnatomyModal = () => {
    document.getElementById('anatomyModal').style.display = 'none';
};

window.renderAnatomyMap = (type) => {
    const container = document.getElementById('anatomyContainer');
    if (type === 'body') container.innerHTML = BODY_SVG;
    if (type === 'tooth') container.innerHTML = TOOTH_SVG;
    if (type === 'brain') container.innerHTML = BRAIN_SVG;
};

window.handleRegionClick = (region) => {
    // Highlight effect handled by CSS, functionality handled here
    if (confirm(`Start note for region: ${region}?`)) {
        insertHtml(`
                    <h2 class="styled-header">Anatomy: ${region}</h2>
                    <div class="sticky-note">
                        <strong>Clinical Notes:</strong><br>
                        [Add details for ${region} here...]
                    </div>
                    <p><br></p>
                `);
    }
};

// Make functions globally accessible
window.addLogicInput = addLogicInput;
window.addLogicGate = addLogicGate;
window.addLogicOutput = addLogicOutput;
window.evaluateCircuit = evaluateCircuit;
window.clearCircuit = clearCircuit;
window.initLogicGatesSimulator = initLogicGatesSimulator;

// ==================== KNOWLEDGE BASE SYSTEM ====================
const knowledgeBaseData = {
    cs: {
        title: "💻 Computer Science Reference",
        categories: [
            {
                name: "Algorithmic Complexity (Big-O)",
                content: `
                            <table class="kb-table">
                                <tr><th>Complexity</th><th>Typical Meaning</th><th>Common Examples</th></tr>
                                <tr><td>O(1)</td><td>Constant</td><td>Array access, stack push/pop</td></tr>
                                <tr><td>O(log n)</td><td>Logarithmic</td><td>Binary search</td></tr>
                                <tr><td>O(n)</td><td>Linear</td><td>Linear scan, simple loop</td></tr>
                                <tr><td>O(n log n)</td><td>Linearithmic</td><td>Merge sort, heap sort</td></tr>
                                <tr><td>O(n²)</td><td>Quadratic</td><td>Nested loops, bubble sort</td></tr>
                                <tr><td>O(2ⁿ)</td><td>Exponential</td><td>Recursive Fibonacci</td></tr>
                            </table>
                        `
            },
            {
                name: "Data Structures at a Glance",
                content: `
                            <table class="kb-table">
                                <tr><th>Structure</th><th>Access</th><th>Insert</th><th>Delete</th><th>Notes</th></tr>
                                <tr><td>Array</td><td>O(1)</td><td>O(n)</td><td>O(n)</td><td>Contiguous memory</td></tr>
                                <tr><td>Linked List</td><td>O(n)</td><td>O(1)</td><td>O(1)</td><td>Pointer overhead</td></tr>
                                <tr><td>Stack</td><td>O(1)</td><td>O(1)</td><td>O(1)</td><td>LIFO</td></tr>
                                <tr><td>Queue</td><td>O(1)</td><td>O(1)</td><td>O(1)</td><td>FIFO</td></tr>
                                <tr><td>Hash Table</td><td>O(1)*</td><td>O(1)*</td><td>O(1)*</td><td>*Amortized</td></tr>
                                <tr><td>Binary Tree</td><td>O(log n)</td><td>O(log n)</td><td>O(log n)</td><td>If balanced</td></tr>
                            </table>
                        `
            },
            {
                name: "OS & Systems Concepts",
                content: `
                            <div class="kb-section-header">Process States</div>
                            <div>New → Ready → Running → Waiting → Terminated</div>
                            
                            <div class="kb-section-header">Scheduling Algorithms</div>
                            <div>FCFS, SJF, Priority, Round Robin</div>
                            
                            <div class="kb-section-header">Memory</div>
                            <ul class="kb-list">
                                <li>Stack vs Heap</li>
                                <li>Virtual memory</li>
                                <li>Paging vs Segmentation</li>
                            </ul>
                            
                            <div class="kb-section-header">Concurrency</div>
                            <ul class="kb-list">
                                <li><strong>Race condition:</strong> Outcome depends on timing</li>
                                <li><strong>Deadlock:</strong> Mutual exclusion, Hold & wait, No preemption, Circular wait</li>
                                <li><strong>Primitives:</strong> Mutex, Semaphore, Atomic operations</li>
                            </ul>
                        `
            },
            {
                name: "HTTP Status Codes",
                content: `
                            <ul class="kb-list">
                                <li><span class="kb-code">200 OK</span> - Success</li>
                                <li><span class="kb-code">201 Created</span> - Resource created</li>
                                <li><span class="kb-code">204 No Content</span> - Success, no response body</li>
                                <li><span class="kb-code">400 Bad Request</span> - Client error</li>
                                <li><span class="kb-code">401 Unauthorized</span> - Authentication required</li>
                                <li><span class="kb-code">403 Forbidden</span> - Permissions denied</li>
                                <li><span class="kb-code">404 Not Found</span> - Resource doesn't exist</li>
                                <li><span class="kb-code">500 Internal Server Error</span> - Server failure</li>
                                <li><span class="kb-code">502 Bad Gateway</span> - Invalid upstream response</li>
                            </ul>
                        `
            },
            {
                name: "Regex Cheatsheet",
                content: `
                            <table class="kb-table">
                                <tr><td><span class="kb-code">^</span></td><td>Start of string</td></tr>
                                <tr><td><span class="kb-code">$</span></td><td>End of string</td></tr>
                                <tr><td><span class="kb-code">.</span></td><td>Any character (except newline)</td></tr>
                                <tr><td><span class="kb-code">*</span></td><td>0 or more</td></tr>
                                <tr><td><span class="kb-code">+</span></td><td>1 or more</td></tr>
                                <tr><td><span class="kb-code">?</span></td><td>0 or 1 (optional)</td></tr>
                                <tr><td><span class="kb-code">\\d</span></td><td>Digit [0-9]</td></tr>
                                <tr><td><span class="kb-code">\\w</span></td><td>Word char [a-zA-Z0-9_]</td></tr>
                                <tr><td><span class="kb-code">\\s</span></td><td>Whitespace</td></tr>
                                <tr><td><span class="kb-code">[...]</span></td><td>Character set</td></tr>
                                <tr><td><span class="kb-code">(...)</span></td><td>Capture group</td></tr>
                            </table>
                        `
            },
            {
                name: "ASCII & Encoding",
                content: `
                            <ul class="kb-list">
                                <li><strong>32:</strong> Space</li>
                                <li><strong>48-57:</strong> Digits (0-9)</li>
                                <li><strong>65-90:</strong> Uppercase (A-Z)</li>
                                <li><strong>97-122:</strong> Lowercase (a-z)</li>
                                <li><strong>10:</strong> Line Feed (LF)</li>
                                <li><strong>13:</strong> Carriage Return (CR)</li>
                                <li><strong>UTF-8:</strong> Variable-length encoding (1-4 bytes)</li>
                            </ul>
                        `
            },
            {
                name: "SQL Basics (CRUD)",
                content: `
                            <div class="kb-section-header">SELECT</div>
                            <div class="kb-code">SELECT * FROM table WHERE col = 'val' ORDER BY col;</div>
                            
                            <div class="kb-section-header">INSERT</div>
                            <div class="kb-code">INSERT INTO table (col1, col2) VALUES ('val1', 'val2');</div>
                            
                            <div class="kb-section-header">UPDATE</div>
                            <div class="kb-code">UPDATE table SET col1 = 'new' WHERE id = 1;</div>
                            
                            <div class="kb-section-header">DELETE</div>
                            <div class="kb-code">DELETE FROM table WHERE id = 1;</div>
                            
                            <div class="kb-section-header">JOINS</div>
                            <ul class="kb-list">
                                <li><strong>INNER JOIN:</strong> Matches in both</li>
                                <li><strong>LEFT JOIN:</strong> All from left, matches from right</li>
                            </ul>
                        `
            },
            {
                name: "System Design Concepts",
                content: `
                            <ul class="kb-list">
                                <li><strong>CAP Theorem:</strong> Consistency, Availability, Partition Tolerance (Pick 2)</li>
                                <li><strong>ACID:</strong> Atomicity, Consistency, Isolation, Durability</li>
                                <li><strong>Scaling:</strong> Vertical (Bigger machine) vs Horizontal (More machines)</li>
                                <li><strong>Caching:</strong> Redis/Memcached for read-heavy loads</li>
                                <li><strong>Abstraction Layers:</strong> Breaking complex systems into levels</li>
                                <li><strong>State Machines:</strong> Modeling systems as states and transitions</li>
                            </ul>
                        `
            },
            {
                name: "Common Ports",
                content: `
                            <table class="kb-table">
                                <tr><td><span class="kb-code">22</span></td><td>SSH</td></tr>
                                <tr><td><span class="kb-code">53</span></td><td>DNS</td></tr>
                                <tr><td><span class="kb-code">80</span></td><td>HTTP</td></tr>
                                <tr><td><span class="kb-code">443</span></td><td>HTTPS</td></tr>
                                <tr><td><span class="kb-code">3306</span></td><td>MySQL</td></tr>
                                <tr><td><span class="kb-code">5432</span></td><td>PostgreSQL</td></tr>
                                <tr><td><span class="kb-code">27017</span></td><td>MongoDB</td></tr>
                            </table>
                        `
            }
        ]
    },
    medical: {
        title: "⚕️ Medical & Dental Reference",
        categories: [
            {
                name: "Normal Lab Values (Adult)",
                content: `
                            <div class="kb-section-header">CBC (Complete Blood Count)</div>
                            <ul class="kb-list">
                                <li>WBC: 4,500 - 11,000 /µL</li>
                                <li>RBC: 4.5 - 5.5 M/µL (M), 4.0 - 5.0 M/µL (F)</li>
                                <li>Hemoglobin: 13.5-17.5 g/dL (M), 12.0-15.5 g/dL (F)</li>
                                <li>Hematocrit: 41-50% (M), 36-44% (F)</li>
                                <li>Platelets: 150,000 - 450,000 /µL</li>
                            </ul>
                            
                            <div class="kb-section-header">Basic Metabolic Panel (BMP)</div>
                            <ul class="kb-list">
                                <li>Sodium (Na+): 135 - 145 mEq/L</li>
                                <li>Potassium (K+): 3.5 - 5.0 mEq/L</li>
                                <li>Chloride (Cl-): 98 - 106 mEq/L</li>
                                <li>Bicarbonate (HCO3-): 22 - 29 mEq/L</li>
                                <li>BUN: 7 - 20 mg/dL</li>
                                <li>Creatinine: 0.6 - 1.2 mg/dL</li>
                                <li>Glucose: 70 - 100 mg/dL (Fasting)</li>
                            </ul>
                        `
            },
            {
                name: "Vital Signs (Resting Adult)",
                content: `
                            <ul class="kb-list">
                                <li><strong>Heart Rate:</strong> 60 - 100 bpm</li>
                                <li><strong>Blood Pressure:</strong> &lt; 120/80 mmHg</li>
                                <li><strong>Respiratory Rate:</strong> 12 - 20 breaths/min</li>
                                <li><strong>Temperature:</strong> 36.5°C - 37.2°C (97.7°F - 99°F)</li>
                                <li><strong>SpO2:</strong> 95% - 100%</li>
                            </ul>
                        `
            },
            {
                name: "Cranial Nerves",
                content: `
                            <table class="kb-table">
                                <tr><th>#</th><th>Name</th><th>Type</th><th>Function</th></tr>
                                <tr><td>I</td><td>Olfactory</td><td>S</td><td>Smell</td></tr>
                                <tr><td>II</td><td>Optic</td><td>S</td><td>Vision</td></tr>
                                <tr><td>III</td><td>Oculomotor</td><td>M</td><td>Eye movement, pupil</td></tr>
                                <tr><td>IV</td><td>Trochlear</td><td>M</td><td>Eye movement (Sup. Oblique)</td></tr>
                                <tr><td>V</td><td>Trigeminal</td><td>B</td><td>Face sensation, Mastication</td></tr>
                                <tr><td>VI</td><td>Abducens</td><td>M</td><td>Eye movement (Lateral Rectus)</td></tr>
                                <tr><td>VII</td><td>Facial</td><td>B</td><td>Face expression, Taste (ant 2/3)</td></tr>
                                <tr><td>VIII</td><td>Vestibulocochlear</td><td>S</td><td>Hearing, Balance</td></tr>
                                <tr><td>IX</td><td>Glossopharyngeal</td><td>B</td><td>Taste (post 1/3), Swallowing</td></tr>
                                <tr><td>X</td><td>Vagus</td><td>B</td><td>Viscera control, Vocal cords</td></tr>
                                <tr><td>XI</td><td>Accessory</td><td>M</td><td>Head/Shoulder movement</td></tr>
                                <tr><td>XII</td><td>Hypoglossal</td><td>M</td><td>Tongue movement</td></tr>
                            </table>
                            <div style="margin-top:5px; font-size:0.65rem; opacity:0.7;">S=Sensory, M=Motor, B=Both</div>
                        `
            }
        ]
    },
    engineering: {
        title: "⚙️ Engineering Reference",
        categories: [
            {
                name: "Material Properties",
                content: `
                            <div class="kb-section-header">Structural Steel</div>
                            <ul class="kb-list">
                                <li>Density: 7,850 kg/m³</li>
                                <li>Young's Modulus (E): 200 GPa</li>
                                <li>Yield Strength: 250 MPa</li>
                            </ul>
                            
                            <div class="kb-section-header">Aluminum (6061)</div>
                            <ul class="kb-list">
                                <li>Density: 2,700 kg/m³</li>
                                <li>Young's Modulus (E): 69 GPa</li>
                                <li>Yield Strength: ~240 MPa (T6)</li>
                            </ul>
                            
                            <div class="kb-section-header">Concrete</div>
                            <ul class="kb-list">
                                <li>Density: 2,400 kg/m³</li>
                                <li>Compressive Strength: 20 - 40 MPa</li>
                            </ul>
                            
                            <div class="kb-section-header">Water</div>
                            <ul class="kb-list">
                                <li>Density: 1,000 kg/m³</li>
                            </ul>
                        `
            },
            {
                name: "Fundamental Constants",
                content: `
                            <ul class="kb-list">
                                <li><strong>g</strong> (Gravity): 9.81 m/s²</li>
                                <li><strong>c</strong> (Speed of Light): 3.00 × 10⁸ m/s</li>
                                <li><strong>G</strong> (Gravitational): 6.674 × 10⁻¹¹ N·m²/kg²</li>
                                <li><strong>R</strong> (Gas Constant): 8.314 J/(mol·K)</li>
                                <li><strong>h</strong> (Planck): 6.626 × 10⁻³⁴ J·s</li>
                                <li><strong>k</strong> (Boltzmann): 1.380 × 10⁻²³ J/K</li>
                                <li><strong>Na</strong> (Avogadro): 6.022 × 10²³ mol⁻¹</li>
                                <li><strong>Atm. Pressure:</strong> 101,325 Pa</li>
                            </ul>
                        `
            },
            {
                name: "Common Unit Conversions",
                content: `
                            <table class="kb-table">
                                <tr><th>Category</th><th>Conversion</th></tr>
                                <tr><td>Length</td><td>1 in = 2.54 cm | 1 ft = 0.3048 m</td></tr>
                                <tr><td>Force</td><td>1 lbf ≈ 4.448 N</td></tr>
                                <tr><td>Mass</td><td>1 lb ≈ 0.4536 kg</td></tr>
                                <tr><td>Pressure</td><td>1 psi ≈ 6,895 Pa | 1 bar = 100 kPa</td></tr>
                                <tr><td>Energy</td><td>1 BTU ≈ 1,055 J | 1 cal = 4.184 J</td></tr>
                                <tr><td>Power</td><td>1 hp ≈ 746 W</td></tr>
                            </table>
                        `
            },
            {
                name: "Periodic Table (Key Elements)",
                content: `
                            <table class="kb-table">
                                <tr><th>Symbol</th><th>Element</th><th>Atomic #</th><th>Mass</th></tr>
                                <tr><td>H</td><td>Hydrogen</td><td>1</td><td>1.008</td></tr>
                                <tr><td>C</td><td>Carbon</td><td>6</td><td>12.011</td></tr>
                                <tr><td>N</td><td>Nitrogen</td><td>7</td><td>14.007</td></tr>
                                <tr><td>O</td><td>Oxygen</td><td>8</td><td>15.999</td></tr>
                                <tr><td>Al</td><td>Aluminium</td><td>13</td><td>26.982</td></tr>
                                <tr><td>Si</td><td>Silicon</td><td>14</td><td>28.085</td></tr>
                                <tr><td>Fe</td><td>Iron</td><td>26</td><td>55.845</td></tr>
                                <tr><td>Cu</td><td>Copper</td><td>29</td><td>63.546</td></tr>
                                <tr><td>Au</td><td>Gold</td><td>79</td><td>196.97</td></tr>
                                <tr><td>Pb</td><td>Lead</td><td>82</td><td>207.2</td></tr>
                            </table>
                        `
            }
        ]
    }
};

function updateKnowledgeBase(discipline) {
    const container = document.getElementById('knowledgeBaseContainer');
    if (!container) return;

    // Determine which knowledge base to show
    let kbData = null;
    if (discipline === 'cs') {
        kbData = knowledgeBaseData.cs;
    } else if (discipline === 'medical') {
        kbData = knowledgeBaseData.medical;
    } else if (discipline === 'engineering') {
        kbData = knowledgeBaseData.engineering;
    }

    if (!kbData) {
        container.innerHTML = `<div style="font-size: 0.75rem; opacity: 0.7; text-align: center; padding: 10px;">Select a CS, Medical, or Engineering page to view references</div>`;
        return;
    }

    // Build the knowledge base UI
    let html = `<div style="font-size: 0.85rem; font-weight: bold; margin-bottom: 10px; color: var(--accent-color);">${kbData.title}</div>`;

    kbData.categories.forEach((category, index) => {
        const categoryId = `kb-cat-${discipline}-${index}`;
        html += `
                    <div class="kb-category">
                        <div class="kb-category-title" onclick="toggleKbCategory('${categoryId}')">
                            <span>${category.name}</span>
                            <span class="kb-arrow" id="${categoryId}-arrow">▼</span>
                        </div>
                        <div class="kb-content" id="${categoryId}">
                            ${category.content}
                        </div>
                    </div>
                `;
    });

    container.innerHTML = html;
}

function toggleKbCategory(categoryId) {
    const content = document.getElementById(categoryId);
    const arrow = document.getElementById(categoryId + '-arrow');

    if (content && arrow) {
        content.classList.toggle('collapsed');
        arrow.classList.toggle('collapsed');
    }
}

// Make function globally accessible
window.toggleKbCategory = toggleKbCategory;
window.updateKnowledgeBase = updateKnowledgeBase;

// ==================== ENHANCED LOGIC GATES WITH WIRING ====================
let wiringMode = false;
let wiringStart = null;

// Enhanced render with connection points
function renderLogicCanvas() {
    if (!logicSimulator.canvas) return;

    // Clear and add SVG for wires
    logicSimulator.canvas.innerHTML = '<svg class="logic-wire-svg" id="logicWireSvg"></svg>';

    // Render wires first (behind components)
    renderLogicWires();

    // Render inputs with connection points
    logicSimulator.inputs.forEach(input => {
        const el = document.createElement('div');
        el.className = `logic-input ${input.state ? 'on' : 'off'}`;
        el.style.left = input.x + 'px';
        el.style.top = input.y + 'px';
        el.innerHTML = input.state ? '1' : '0';
        el.dataset.id = input.id;
        el.title = `${input.label}: Click to toggle`;
        el.onclick = (e) => {
            e.stopPropagation();
            input.state = !input.state;
            renderLogicCanvas();
            evaluateLogicCircuit();
        };
        makeDraggable(el, input);

        // Add output connection point
        const outPoint = document.createElement('div');
        outPoint.className = 'logic-connection-point output';
        outPoint.style.top = '14px';
        outPoint.dataset.componentId = input.id;
        outPoint.dataset.pointType = 'output';
        outPoint.onclick = (e) => {
            e.stopPropagation();
            handleConnectionClick(input.id, 'output');
        };
        el.appendChild(outPoint);

        logicSimulator.canvas.appendChild(el);

        const label = document.createElement('div');
        label.className = 'logic-gate-label';
        label.style.left = input.x + 'px';
        label.style.top = (input.y + 45) + 'px';
        label.style.position = 'absolute';
        label.textContent = input.label;
        logicSimulator.canvas.appendChild(label);
    });

    // Render gates with input/output connection points
    logicSimulator.gates.forEach(gate => {
        const el = document.createElement('div');
        el.className = 'logic-gate';
        el.style.left = gate.x + 'px';
        el.style.top = gate.y + 'px';
        el.textContent = gate.gateType;
        el.dataset.id = gate.id;
        makeDraggable(el, gate);

        // Add input connection points
        const numInputs = gate.gateType === 'NOT' ? 1 : 2;
        for (let i = 0; i < numInputs; i++) {
            const inPoint = document.createElement('div');
            inPoint.className = 'logic-connection-point input';
            inPoint.style.top = (15 + i * 20) + 'px';
            inPoint.dataset.componentId = gate.id;
            inPoint.dataset.pointType = 'input';
            inPoint.dataset.inputIndex = i;
            inPoint.onclick = (e) => {
                e.stopPropagation();
                handleConnectionClick(gate.id, 'input', i);
            };
            el.appendChild(inPoint);
        }

        // Add output connection point
        const outPoint = document.createElement('div');
        outPoint.className = 'logic-connection-point output';
        outPoint.style.top = '24px';
        outPoint.dataset.componentId = gate.id;
        outPoint.dataset.pointType = 'output';
        outPoint.onclick = (e) => {
            e.stopPropagation();
            handleConnectionClick(gate.id, 'output');
        };
        el.appendChild(outPoint);

        logicSimulator.canvas.appendChild(el);
    });

    // Render outputs with connection points
    logicSimulator.outputs.forEach(output => {
        const el = document.createElement('div');
        el.className = `logic-output ${output.state ? 'on' : ''}`;
        el.style.left = output.x + 'px';
        el.style.top = output.y + 'px';
        el.innerHTML = output.state ? '1' : '0';
        el.dataset.id = output.id;
        makeDraggable(el, output);

        // Add input connection point
        const inPoint = document.createElement('div');
        inPoint.className = 'logic-connection-point input';
        inPoint.style.top = '19px';
        inPoint.dataset.componentId = output.id;
        inPoint.dataset.pointType = 'input';
        inPoint.onclick = (e) => {
            e.stopPropagation();
            handleConnectionClick(output.id, 'input');
        };
        el.appendChild(inPoint);

        logicSimulator.canvas.appendChild(el);

        const label = document.createElement('div');
        label.className = 'logic-gate-label';
        label.style.left = output.x + 'px';
        label.style.top = (output.y + 55) + 'px';
        label.style.position = 'absolute';
        label.textContent = output.label;
        logicSimulator.canvas.appendChild(label);
    });
}

// Handle connection clicks for wiring
function handleConnectionClick(componentId, pointType, inputIndex = 0) {
    if (!wiringMode) {
        wiringMode = true;
        wiringStart = { componentId, pointType, inputIndex };
        showToast('🔌 Click destination to complete wire');
    } else {
        // Complete the wire
        const wireEnd = { componentId, pointType, inputIndex };

        // Validate connection (output to input)
        if (wiringStart.pointType === 'output' && wireEnd.pointType === 'input') {
            logicSimulator.wires.push({
                from: wiringStart.componentId,
                to: wireEnd.componentId,
                toInputIndex: wireEnd.inputIndex
            });
            showToast('✓ Wire connected');
        } else if (wiringStart.pointType === 'input' && wireEnd.pointType === 'output') {
            logicSimulator.wires.push({
                from: wireEnd.componentId,
                to: wiringStart.componentId,
                toInputIndex: wiringStart.inputIndex
            });
            showToast('✓ Wire connected');
        } else {
            showToast('⚠️ Connect output to input');
        }

        wiringMode = false;
        wiringStart = null;
        renderLogicCanvas();
        evaluateLogicCircuit();
    }
}

// Render wires as SVG paths
function renderLogicWires() {
    const svg = document.getElementById('logicWireSvg');
    if (!svg) return;

    svg.innerHTML = '';

    logicSimulator.wires.forEach((wire, index) => {
        const fromComp = findComponent(wire.from);
        const toComp = findComponent(wire.to);

        if (!fromComp || !toComp) return;

        // Calculate connection points
        const x1 = fromComp.x + 80; // Output point
        const y1 = fromComp.y + 25;
        const x2 = toComp.x; // Input point
        const y2 = toComp.y + 25 + (wire.toInputIndex * 20);

        // Create curved wire path
        const midX = (x1 + x2) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
        path.setAttribute('class', 'logic-wire-path');
        path.setAttribute('data-wire-index', index);
        path.onclick = () => {
            if (confirm('Delete this wire?')) {
                logicSimulator.wires.splice(index, 1);
                renderLogicCanvas();
                evaluateLogicCircuit();
            }
        };
        path.style.pointerEvents = 'auto';

        svg.appendChild(path);
    });
}

// Find component by ID
function findComponent(id) {
    return logicSimulator.inputs.find(i => i.id === id) ||
        logicSimulator.gates.find(g => g.id === id) ||
        logicSimulator.outputs.find(o => o.id === id);
}

// Enhanced circuit evaluation with wire connections
function evaluateLogicCircuit() {
    // Reset all gate and output states
    logicSimulator.gates.forEach(gate => gate.output = null);
    logicSimulator.outputs.forEach(output => output.state = false);

    // Evaluate gates based on wire connections
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 100) {
        changed = false;
        iterations++;

        logicSimulator.gates.forEach(gate => {
            const inputWires = logicSimulator.wires.filter(w => w.to === gate.id);
            if (inputWires.length === 0) return;

            const inputValues = inputWires.map(wire => {
                const fromComp = findComponent(wire.from);
                if (fromComp.type === 'input') return fromComp.state;
                if (fromComp.type === 'gate') return fromComp.output;
                return false;
            });

            let newOutput = null;
            switch (gate.gateType) {
                case 'AND':
                    newOutput = inputValues.length >= 2 ? inputValues[0] && inputValues[1] : false;
                    break;
                case 'OR':
                    newOutput = inputValues.length >= 2 ? inputValues[0] || inputValues[1] : false;
                    break;
                case 'NOT':
                    newOutput = inputValues.length >= 1 ? !inputValues[0] : false;
                    break;
                case 'NAND':
                    newOutput = inputValues.length >= 2 ? !(inputValues[0] && inputValues[1]) : true;
                    break;
                case 'NOR':
                    newOutput = inputValues.length >= 2 ? !(inputValues[0] || inputValues[1]) : true;
                    break;
                case 'XOR':
                    newOutput = inputValues.length >= 2 ? inputValues[0] !== inputValues[1] : false;
                    break;
            }

            if (gate.output !== newOutput) {
                gate.output = newOutput;
                changed = true;
            }
        });
    }

    // Update outputs
    logicSimulator.outputs.forEach(output => {
        const inputWire = logicSimulator.wires.find(w => w.to === output.id);
        if (inputWire) {
            const fromComp = findComponent(inputWire.from);
            if (fromComp.type === 'input') {
                output.state = fromComp.state;
            } else if (fromComp.type === 'gate') {
                output.state = fromComp.output || false;
            }
        }
    });

    renderLogicCanvas();
}

window.evaluateCircuit = evaluateLogicCircuit;

// ==================== CIRCUIT SYMBOLS TRAY ====================
const circuitSymbols = [
    { name: 'Resistor', svg: '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><rect x="15" y="15" width="10" height="10" fill="none" stroke="#2c3e50" stroke-width="2"/><line x1="25" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'Capacitor', svg: '<line x1="5" y1="20" x2="17" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="17" y1="10" x2="17" y2="30" stroke="#2c3e50" stroke-width="2"/><line x1="23" y1="10" x2="23" y2="30" stroke="#2c3e50" stroke-width="2"/><line x1="23" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'Inductor', svg: '<path d="M 5 20 Q 10 10, 15 20 T 25 20 T 35 20" fill="none" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'Battery', svg: '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="15" y1="12" x2="15" y2="28" stroke="#2c3e50" stroke-width="3"/><line x1="25" y1="15" x2="25" y2="25" stroke="#2c3e50" stroke-width="2"/><line x1="25" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'Ground', svg: '<line x1="20" y1="5" x2="20" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="10" y1="20" x2="30" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="13" y1="25" x2="27" y2="25" stroke="#2c3e50" stroke-width="2"/><line x1="16" y1="30" x2="24" y2="30" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'Diode', svg: '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><polygon points="15,10 15,30 25,20" fill="#2c3e50"/><line x1="25" y1="10" x2="25" y2="30" stroke="#2c3e50" stroke-width="2"/><line x1="25" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'LED', svg: '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><polygon points="15,10 15,30 25,20" fill="#e74c3c"/><line x1="25" y1="10" x2="25" y2="30" stroke="#2c3e50" stroke-width="2"/><line x1="25" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'Switch', svg: '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="15" y1="20" x2="30" y2="10" stroke="#2c3e50" stroke-width="2"/><circle cx="15" cy="20" r="2" fill="#2c3e50"/><circle cx="30" cy="20" r="2" fill="#2c3e50"/><line x1="30" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'Bulb', svg: '<line x1="5" y1="20" x2="12" y2="20" stroke="#2c3e50" stroke-width="2"/><circle cx="20" cy="20" r="8" fill="none" stroke="#2c3e50" stroke-width="2"/><line x1="14" y1="14" x2="26" y2="26" stroke="#2c3e50" stroke-width="1.5"/><line x1="26" y1="14" x2="14" y2="26" stroke="#2c3e50" stroke-width="1.5"/><line x1="28" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'Voltmeter', svg: '<circle cx="20" cy="20" r="10" fill="none" stroke="#2c3e50" stroke-width="2"/><text x="20" y="24" text-anchor="middle" font-size="12" font-weight="bold" fill="#2c3e50">V</text><line x1="5" y1="20" x2="10" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="30" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>' },
    { name: 'Ammeter', svg: '<circle cx="20" cy="20" r="10" fill="none" stroke="#2c3e50" stroke-width="2"/><text x="20" y="24" text-anchor="middle" font-size="12" font-weight="bold" fill="#2c3e50">A</text><line x1="5" y1="20" x2="10" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="30" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>' }
];

// Default electrical properties for each component type
const COMPONENT_DEFAULTS = {
    resistor: { resistance: 100, unit: 'Ω' },
    capacitor: { resistance: 1000000, unit: 'F', capacitance: 0.000001 },
    inductor: { resistance: 0.1, unit: 'H', inductance: 0.01 },
    battery: { voltage: 9, resistance: 0.01, unit: 'V' },
    ground: { resistance: 0, unit: '' },
    diode: { resistance: 5, forwardDrop: 0.7, unit: '' },
    led: { resistance: 20, forwardDrop: 2.0, unit: '' },
    switch: { closed: false, resistance: Infinity, unit: '' },
    bulb: { resistance: 50, unit: 'Ω', ratedCurrent: 0.18 },
    voltmeter: { resistance: 10000000, unit: 'V', reading: 0 },
    ammeter: { resistance: 0.001, unit: 'A', reading: 0 }
};

let circuitComponents = [];
let circuitNextId = 1;

function initCircuitSymbolsTray() {
    const canvas = document.getElementById('circuitDiagramCanvas');
    if (!canvas) return;

    // Add symbols tray
    const tray = document.createElement('div');
    tray.className = 'circuit-symbols-tray';
    tray.innerHTML = `
                <div class="circuit-symbols-title">⚡ Components</div>
                ${circuitSymbols.map(symbol => `
                    <div class="circuit-symbol-item" draggable="true" data-symbol="${symbol.name}">
                        <svg class="circuit-symbol-svg" viewBox="0 0 40 40">
                            ${symbol.svg}
                        </svg>
                        <div class="circuit-symbol-name">${symbol.name}</div>
                    </div>
                `).join('')}
            `;
    canvas.appendChild(tray);

    // Setup drag and drop
    tray.querySelectorAll('.circuit-symbol-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('symbolName', item.dataset.symbol);
        });
    });

    const componentsLayer = document.getElementById('circuitComponentsLayer');
    componentsLayer.addEventListener('dragover', (e) => e.preventDefault());
    componentsLayer.addEventListener('drop', (e) => {
        e.preventDefault();
        const symbolName = e.dataTransfer.getData('symbolName');
        const symbol = circuitSymbols.find(s => s.name === symbolName);
        if (symbol) {
            const rect = componentsLayer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            addCircuitComponent(symbol, x, y);
        }
    });
}

function addCircuitComponent(symbol, x, y) {
    const component = {
        id: circuitNextId++,
        symbol: symbol,
        x: x,
        y: y
    };
    circuitComponents.push(component);
    renderCircuitComponent(component);
}

function renderCircuitComponent(component) {
    const layer = document.getElementById('circuitComponentsLayer');
    if (!layer) return;

    const div = document.createElement('div');
    div.className = 'circuit-component';
    div.style.left = component.x + 'px';
    div.style.top = component.y + 'px';
    div.dataset.componentId = component.id;
    div.innerHTML = `
                <svg viewBox="0 0 40 40" width="60" height="60">
                    ${component.symbol.svg}
                </svg>
                <div style="position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%); font-size: 0.7rem; white-space: nowrap; color: #2c3e50; font-weight: 600;">${component.symbol.name}</div>
            `;

    // Double-click to delete
    div.ondblclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete ${component.symbol.name}?`)) {
            const index = circuitComponents.findIndex(c => c.id === component.id);
            if (index > -1) {
                circuitComponents.splice(index, 1);
                div.remove();
                showToast('✓ Component removed');
            }
        }
    };

    // Click to select
    div.onclick = (e) => {
        e.stopPropagation();
        // Deselect all others
        document.querySelectorAll('.circuit-component.selected').forEach(el => {
            if (el !== div) el.classList.remove('selected');
        });
        div.classList.toggle('selected');
    };

    makeComponentDraggable(div, component);
    layer.appendChild(div);
}

function makeComponentDraggable(element, component) {
    let isDragging = false;
    let startX, startY;

    element.addEventListener('mousedown', (e) => {
        if (e.target.closest('svg')) { // Only drag by the SVG
            isDragging = true;
            startX = e.clientX - component.x;
            startY = e.clientY - component.y;
            element.style.cursor = 'grabbing';
            element.classList.add('selected');
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        component.x = e.clientX - startX;
        component.y = e.clientY - startY;
        element.style.left = component.x + 'px';
        element.style.top = component.y + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            element.style.cursor = 'move';
        }
    });
}

window.initCircuitSymbolsTray = initCircuitSymbolsTray;

// Keyboard shortcuts for circuit components
document.addEventListener('keydown', (e) => {
    // Delete selected components with Delete or Backspace
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input, textarea, [contenteditable="true"]')) {
        const selected = document.querySelectorAll('.circuit-component.selected');
        if (selected.length > 0) {
            e.preventDefault();
            selected.forEach(el => {
                const componentId = parseInt(el.dataset.componentId);
                const index = circuitComponents.findIndex(c => c.id === componentId);
                if (index > -1) {
                    circuitComponents.splice(index, 1);
                    el.remove();
                }
            });
            showToast(`✓ ${selected.length} component(s) deleted`);
        }
    }

    // Clear all components with Ctrl/Cmd + Shift + C
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        const layer = document.getElementById('circuitComponentsLayer');
        if (layer && circuitComponents.length > 0) {
            e.preventDefault();
            if (confirm('Clear all circuit components?')) {
                circuitComponents = [];
                layer.innerHTML = '';
                showToast('✓ All components cleared');
            }
        }
    }
});

// ==================== ADVANCED TEMPLATES FUNCTIONS ====================

// CORNELL NOTES FUNCTIONS
let cornellStudyMode = false;

// Highlight selected text in Cornell Notes with a <mark> tag
window.highlightCornellText = function () {
    const cornellNotes = document.getElementById('cornellNotes');
    if (!cornellNotes) {
        showToast('⚠️ Cornell Notes area not found');
        return;
    }

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText) {
        showToast('⚠️ Select text in Notes first, then click Highlight');
        return;
    }

    // Verify the selection is inside the Cornell notes area
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!cornellNotes.contains(range.commonAncestorContainer)) {
        showToast('⚠️ Select text inside the Notes area');
        return;
    }

    // Wrap selected text in a <mark> tag
    const mark = document.createElement('mark');
    mark.className = 'cornell-highlight';
    try {
        range.surroundContents(mark);
    } catch (e) {
        // If selection spans multiple elements, use extractContents approach
        const fragment = range.extractContents();
        mark.appendChild(fragment);
        range.insertNode(mark);
    }

    selection.removeAllRanges();
    showToast('🖌️ Text highlighted! Click "Extract Cue" to add as cue');
};

window.extractCornellCue = function () {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    const cuesContainer = document.getElementById('cornellCues');
    if (!cuesContainer) return;

    // Helper to add a single cue item
    function addCueItem(text, fromHighlight) {
        const cueItem = document.createElement('div');
        cueItem.className = 'cornell-cue-item' + (fromHighlight ? ' from-highlight' : '');
        cueItem.contentEditable = true;
        cueItem.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
        cuesContainer.appendChild(cueItem);
    }

    // MODE 1: If user has text selected, extract that as a cue
    if (selectedText) {
        addCueItem(selectedText, false);
        showToast('✓ Cue extracted from selection');
        return;
    }

    // MODE 2: Extract from all un-extracted highlighted <mark> elements
    const cornellNotes = document.getElementById('cornellNotes');
    if (!cornellNotes) {
        showToast('⚠️ Select text or highlight text first');
        return;
    }

    const marks = cornellNotes.querySelectorAll('mark.cornell-highlight:not([data-cue-extracted])');
    if (marks.length === 0) {
        showToast('⚠️ Select text or use 🖌️ Highlight first');
        return;
    }

    let count = 0;
    marks.forEach(mark => {
        const text = mark.textContent.trim();
        if (text) {
            addCueItem(text, true);
            mark.setAttribute('data-cue-extracted', 'true');
            mark.classList.add('cornell-highlight-extracted');
            count++;
        }
    });

    if (count > 0) {
        showToast(`✓ ${count} cue${count > 1 ? 's' : ''} extracted from highlights`);
    }
};

window.toggleCornellStudyMode = function () {
    const container = document.querySelector('.cornell-container');
    if (!container) return;

    cornellStudyMode = !cornellStudyMode;
    container.classList.toggle('cornell-study-mode');

    if (cornellStudyMode) {
        showToast("👁️ Study Mode: Notes hidden. Test yourself!");
    } else {
        showToast("📝 Normal Mode: Notes visible");
    }
};

// Enable Cornell summary when notes have enough content
function checkCornellNotesLength() {
    const notes = document.getElementById('cornellNotes');
    const summary = document.getElementById('cornellSummary');

    if (notes && summary) {
        const notesText = notes.innerText || '';
        if (notesText.length > 100) {
            summary.contentEditable = 'true';
            summary.style.opacity = '1';
            summary.style.cursor = 'text';
            summary.innerHTML = '<div class="cornell-summary-title">📝 Summary</div><div contenteditable="true">Summarize your notes in 2-3 sentences...</div>';
        }
    }
}

// ZETTELKASTEN FUNCTIONS
let zettelTags = [];

window.checkZettelWordCount = function () {
    const content = document.getElementById('zettelContent');
    const counter = document.getElementById('zettelWordcount');

    if (content && counter) {
        const text = content.innerText || '';
        const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;

        counter.textContent = `${wordCount} words`;
        counter.className = 'zettel-wordcount';

        if (wordCount > 300 && wordCount <= 500) {
            counter.classList.add('warning');
            counter.textContent += ' (good range)';
        } else if (wordCount > 500) {
            counter.classList.add('error');
            counter.textContent += ' ⚠️ Consider splitting this note';
        }
    }
};

window.addZettelTag = function (tagText) {
    if (!tagText || tagText.trim() === '') return;

    const tagsContainer = document.getElementById('zettelTags');
    const tag = document.createElement('span');
    tag.className = 'zettel-tag';
    tag.innerHTML = `${tagText} <span class="zettel-tag-remove" onclick="this.parentElement.remove()">×</span>`;

    tagsContainer.insertBefore(tag, tagsContainer.lastElementChild);
    zettelTags.push(tagText);

    showToast("✓ Tag added");
};


// MINDMAP FUNCTIONS
let mindmapNodes = [];
let mindmapConnections = [];
let selectedNode = null;

window.addMindmapNode = function () {
    const canvas = document.getElementById('mindmapCanvas');
    if (!canvas) return;

    const node = document.createElement('div');
    node.className = 'mindmap-node';
    node.style.left = (200 + Math.random() * 400) + 'px';
    node.style.top = (100 + Math.random() * 300) + 'px';
    node.innerHTML = '<input type="text" placeholder="New idea..." maxlength="100" />';

    makeMindmapNodeDraggable(node);
    canvas.appendChild(node);

    showToast("+ Node added");
};

function makeMindmapNodeDraggable(node) {
    let isDragging = false;
    let currentX, currentY, initialX, initialY;

    node.addEventListener('mousedown', function (e) {
        if (e.target.tagName === 'INPUT') return;
        isDragging = true;
        initialX = e.clientX - node.offsetLeft;
        initialY = e.clientY - node.offsetTop;
        node.classList.add('selected');
        selectedNode = node;
    });

    document.addEventListener('mousemove', function (e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            node.style.left = currentX + 'px';
            node.style.top = currentY + 'px';
        }
    });

    document.addEventListener('mouseup', function () {
        isDragging = false;
    });
}

window.addMindmapLink = function () {
    showToast("💡 Click two nodes to link them");
};

window.autoLayoutMindmap = function () {
    showToast("🎨 Auto-layout applied");
};

// SQ3R FUNCTIONS
let sq3rCurrentStep = 1;

window.compareSQ3RAnswers = function () {
    showToast("📊 Comparing answers with notes...");
};

window.rateSQ3RConfidence = function (event) {
    const stars = event.currentTarget;
    const rect = stars.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const starWidth = rect.width / 5;
    const rating = Math.ceil(x / starWidth);

    let starHTML = '';
    for (let i = 1; i <= 5; i++) {
        starHTML += i <= rating ? '★' : '☆';
    }
    stars.innerHTML = starHTML;

    showToast(`Confidence: ${rating}/5`);
};

// FEYNMAN FUNCTIONS
let feynmanIterations = 1;

window.checkFeynmanReadability = function () {
    const content = document.getElementById('feynmanSimple');
    const readabilityDiv = document.getElementById('feynmanReadability');
    const scoreSpan = document.getElementById('feynmanScore');

    if (!content || !readabilityDiv || !scoreSpan) return;

    const text = content.innerText || '';
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    if (words.length < 10) {
        scoreSpan.textContent = '-';
        return;
    }

    // Simple readability approximation (Flesch-Kincaid inspired)
    const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
    const avgSyllablesPerWord = words.reduce((sum, word) => sum + estimateSyllables(word), 0) / words.length;

    const score = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
    const grade = Math.round(score);

    scoreSpan.textContent = `Grade ${grade}`;

    readabilityDiv.className = 'feynman-readability';
    if (grade >= 6 && grade <= 8) {
        readabilityDiv.classList.add('good');
    } else if (grade > 12) {
        readabilityDiv.classList.add('bad');
    }

    // Highlight potential jargon (words > 12 chars)
    highlightJargon(content);
};

function estimateSyllables(word) {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const syllables = word.match(/[aeiouy]{1,2}/g);
    return syllables ? syllables.length : 1;
}

function highlightJargon(element) {
    const text = element.innerText || '';
    const words = text.split(/\s+/);
    let hasJargon = false;

    words.forEach(word => {
        if (word.length > 12 && /^[a-zA-Z]+$/.test(word)) {
            hasJargon = true;
        }
    });

    if (hasJargon) {
        showToast("⚠️ Potential jargon detected - try simpler words");
    }
}

// Initialize advanced template event listeners
document.addEventListener('DOMContentLoaded', function () {
    // Cornell notes listener
    const cornellNotes = document.getElementById('cornellNotes');
    if (cornellNotes) {
        cornellNotes.addEventListener('input', checkCornellNotesLength);
    }

    // Zettelkasten listener
    const zettelContent = document.getElementById('zettelContent');
    if (zettelContent) {
        zettelContent.addEventListener('input', checkZettelWordCount);
    }

    // Feynman listener
    const feynmanSimple = document.getElementById('feynmanSimple');
    if (feynmanSimple) {
        feynmanSimple.addEventListener('input', checkFeynmanReadability);
    }
});

// ==================== MY REFERENCES SYSTEM ====================
let myReferences = [];
let currentEditingRef = null;
const MAX_PINS = 5;

// Reference type icons
const REF_ICONS = {
    definition: '📖',
    formula: '📐',
    table: '📊',
    checklist: '✅',
    code: '💻',
    fact: '🎯'
};

// Initialize My References
async function initMyReferences() {
    await loadMyReferences();
    renderMyReferences();
}

// Load from IndexedDB
async function loadMyReferences() {
    try {
        const tx = db.transaction(['myReferences'], 'readonly');
        const store = tx.objectStore('myReferences');
        const request = store.getAll();

        request.onsuccess = () => {
            myReferences = request.result || [];
            renderMyReferences();
        };
    } catch (e) {
        // First time - create the store
        myReferences = [];
        renderMyReferences();
    }
}

// Save reference to IndexedDB
async function saveMyReference(reference) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['myReferences'], 'readwrite');
        const store = tx.objectStore('myReferences');
        const request = store.put(reference);

        request.onsuccess = () => resolve();
        request.onerror = () => reject();
    });
}

// Delete reference
async function deleteMyReference(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['myReferences'], 'readwrite');
        const store = tx.objectStore('myReferences');
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject();
    });
}

// Render My References in sidebar
function renderMyReferences() {
    const container = document.getElementById('myReferencesContainer');
    if (!container) return;

    if (myReferences.length === 0) {
        container.innerHTML = `
                    <div class="my-refs-empty">
                        <div class="my-refs-empty-icon">💡</div>
                        <div class="my-refs-empty-title">Build Your Personal Cheat Sheet</div>
                        <div class="my-refs-empty-text">
                            Save important facts from notes or create custom references.
                        </div>
                        <button class="my-refs-create-btn" onclick="openRefModal('create')">
                            + Create Your First Reference
                        </button>
                        <div style="font-size: 0.75rem; opacity: 0.6; margin-top: 10px;">
                            Or highlight text in notes and click "Save to My References"
                        </div>
                    </div>
                `;
        return;
    }

    // Separate pinned and unpinned
    const pinned = myReferences.filter(r => r.pinned);
    const unpinned = myReferences.filter(r => !r.pinned);

    // Group by discipline
    const byDiscipline = {
        cs: unpinned.filter(r => r.discipline === 'cs'),
        medical: unpinned.filter(r => r.discipline === 'medical'),
        engineering: unpinned.filter(r => r.discipline === 'engineering'),
        custom: unpinned.filter(r => r.discipline === 'custom')
    };

    let html = `
                <button class="my-refs-create-btn" onclick="openRefModal('create')" style="width: 100%; margin-bottom: 15px;">
                    + New Reference
                </button>
            `;

    // Pinned section
    if (pinned.length > 0) {
        html += `
                    <div class="my-refs-section-title">
                        📌 Pinned <span class="my-refs-count">(${pinned.length})</span>
                    </div>
                `;
        pinned.forEach(ref => {
            html += renderRefItem(ref);
        });
    }

    // By Discipline
    if (unpinned.length > 0) {
        html += `<div class="my-refs-section-title" style="margin-top: 20px;">🏷️ By Discipline</div>`;

        if (byDiscipline.cs.length > 0) {
            html += `<div class="my-refs-section-title" style="font-size: 0.75rem; margin-left: 10px;">💻 Computer Science (${byDiscipline.cs.length})</div>`;
            byDiscipline.cs.forEach(ref => html += renderRefItem(ref));
        }

        if (byDiscipline.medical.length > 0) {
            html += `<div class="my-refs-section-title" style="font-size: 0.75rem; margin-left: 10px;">⚕️ Medical (${byDiscipline.medical.length})</div>`;
            byDiscipline.medical.forEach(ref => html += renderRefItem(ref));
        }

        if (byDiscipline.engineering.length > 0) {
            html += `<div class="my-refs-section-title" style="font-size: 0.75rem; margin-left: 10px;">⚙️ Engineering (${byDiscipline.engineering.length})</div>`;
            byDiscipline.engineering.forEach(ref => html += renderRefItem(ref));
        }

        if (byDiscipline.custom.length > 0) {
            html += `<div class="my-refs-section-title" style="font-size: 0.75rem; margin-left: 10px;">📝 Custom (${byDiscipline.custom.length})</div>`;
            byDiscipline.custom.forEach(ref => html += renderRefItem(ref));
        }
    }

    container.innerHTML = html;
}

// Render individual reference item
function renderRefItem(ref) {
    const icon = REF_ICONS[ref.type] || '📄';
    const preview = getRefPreview(ref);
    const pinnedClass = ref.pinned ? 'pinned' : '';
    const pinIcon = ref.pinned ? '📌' : '📍';
    const pinActive = ref.pinned ? 'active' : '';

    const tagsHtml = ref.tags && ref.tags.length > 0
        ? `<div class="ref-item-tags">${ref.tags.map(t => `<span class="ref-tag">#${t}</span>`).join('')}</div>`
        : '';

    return `
                <div class="ref-item ${pinnedClass}" onclick="viewRef('${ref.id}')">
                    <div class="ref-item-header">
                        <span class="ref-item-icon">${icon}</span>
                        <span class="ref-item-title">${ref.title}</span>
                        <span class="ref-item-pin ${pinActive}" onclick="event.stopPropagation(); togglePin('${ref.id}')">${pinIcon}</span>
                    </div>
                    <div class="ref-item-preview">${preview}</div>
                    ${tagsHtml}
                </div>
            `;
}

// Get preview text from reference
function getRefPreview(ref) {
    switch (ref.type) {
        case 'definition':
            return ref.content.definition?.substring(0, 80) + '...';
        case 'formula':
            return ref.content.latex || ref.content.when_to_use || '';
        case 'fact':
            return ref.content.fact?.substring(0, 80) + '...';
        case 'code':
            return ref.content.language + ': ' + ref.content.code?.substring(0, 50) + '...';
        case 'table':
            return `${ref.content.rows?.length || 0} rows`;
        case 'checklist':
            return `${ref.content.items?.length || 0} items`;
        default:
            return '';
    }
}

// Toggle pin
async function togglePin(id) {
    const ref = myReferences.find(r => r.id === id);
    if (!ref) return;

    const pinnedCount = myReferences.filter(r => r.pinned).length;

    if (!ref.pinned && pinnedCount >= MAX_PINS) {
        showToast(`⚠️ Maximum ${MAX_PINS} pinned items. Unpin others first.`);
        return;
    }

    ref.pinned = !ref.pinned;
    ref.metadata.lastModified = new Date().toISOString();

    await saveMyReference(ref);
    renderMyReferences();
    showToast(ref.pinned ? '📌 Pinned' : '📍 Unpinned');
}

// Open modal for create/edit/view
window.openRefModal = function (mode, refId = null) {
    const overlay = document.getElementById('refModalOverlay');
    const title = document.getElementById('refModalTitle');
    const body = document.getElementById('refModalBody');
    const footer = document.getElementById('refModalFooter');

    currentEditingRef = refId ? myReferences.find(r => r.id === refId) : null;

    if (mode === 'create' || mode === 'edit') {
        title.textContent = mode === 'create' ? 'New Reference' : 'Edit Reference';
        body.innerHTML = renderRefForm(currentEditingRef);
        footer.innerHTML = `
                    <button class="ref-btn ref-btn-secondary" onclick="closeRefModal()">Cancel</button>
                    <button class="ref-btn ref-btn-primary" onclick="saveRef()">Save Reference</button>
                `;
    } else if (mode === 'view') {
        const ref = myReferences.find(r => r.id === refId);
        if (!ref) return;

        title.textContent = ref.title;
        body.innerHTML = renderRefDetail(ref);
        footer.innerHTML = `
                    <button class="ref-btn ref-btn-danger" onclick="deleteRef('${ref.id}')">Delete</button>
                    <div style="display: flex; gap: 10px;">
                        <button class="ref-btn ref-btn-secondary" onclick="closeRefModal()">Close</button>
                        <button class="ref-btn ref-btn-primary" onclick="openRefModal('edit', '${ref.id}')">Edit</button>
                    </div>
                `;
    }

    overlay.classList.add('active');
};

window.closeRefModal = function () {
    document.getElementById('refModalOverlay').classList.remove('active');
    currentEditingRef = null;
};

// Render reference form
function renderRefForm(ref) {
    const selectedType = ref?.type || 'definition';

    return `
                <div class="ref-form-group">
                    <label class="ref-form-label">Type</label>
                    <div class="ref-type-selector">
                        ${Object.keys(REF_ICONS).map(type => `
                            <div class="ref-type-option ${type === selectedType ? 'selected' : ''}" data-type="${type}" onclick="selectRefType('${type}')">
                                <div class="ref-type-icon">${REF_ICONS[type]}</div>
                                <div class="ref-type-name">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="ref-form-group">
                    <label class="ref-form-label">Title *</label>
                    <input type="text" class="ref-form-input" id="refTitle" value="${ref?.title || ''}" maxlength="100" placeholder="e.g., F = ma (Force equation)" />
                    <div class="ref-form-hint">Keep it concise for quick scanning (max 100 chars)</div>
                </div>
                
                <div id="refContentFields">
                    ${renderContentFields(selectedType, ref)}
                </div>
                
                <div class="ref-form-group">
                    <label class="ref-form-label">Discipline</label>
                    <select class="ref-form-select" id="refDiscipline">
                        <option value="cs" ${ref?.discipline === 'cs' ? 'selected' : ''}>💻 Computer Science</option>
                        <option value="medical" ${ref?.discipline === 'medical' ? 'selected' : ''}>⚕️ Medical</option>
                        <option value="engineering" ${ref?.discipline === 'engineering' ? 'selected' : ''}>⚙️ Engineering</option>
                        <option value="custom" ${ref?.discipline === 'custom' ? 'selected' : ''}>📝 Custom</option>
                    </select>
                </div>
                
                <div class="ref-form-group">
                    <label class="ref-form-label">Tags</label>
                    <div class="ref-tag-input-container" id="refTagContainer">
                        ${ref?.tags?.map(tag => `
                            <span class="ref-tag-chip">
                                ${tag}
                                <span class="ref-tag-remove" onclick="removeTag('${tag}')">×</span>
                            </span>
                        `).join('') || ''}
                        <input type="text" class="ref-tag-input" id="refTagInput" placeholder="Add tag..." onkeypress="if(event.key==='Enter'){event.preventDefault();addTag();}" />
                    </div>
                    <div class="ref-form-hint">Use 2-5 tags for best organization</div>
                </div>
                
                <div class="ref-form-group">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="refPinned" ${ref?.pinned ? 'checked' : ''} />
                        <span>📌 Pin for quick access</span>
                    </label>
                </div>
            `;
}

// Render content fields based on type
function renderContentFields(type, ref) {
    switch (type) {
        case 'definition':
            return `
                        <div class="ref-form-group">
                            <label class="ref-form-label">Term *</label>
                            <input type="text" class="ref-form-input" id="refTerm" value="${ref?.content?.term || ''}" />
                        </div>
                        <div class="ref-form-group">
                            <label class="ref-form-label">Definition *</label>
                            <textarea class="ref-form-textarea" id="refDefinition">${ref?.content?.definition || ''}</textarea>
                        </div>
                    `;

        case 'formula':
            return `
                        <div class="ref-form-group">
                            <label class="ref-form-label">Formula *</label>
                            <input type="text" class="ref-form-input" id="refFormula" value="${ref?.content?.latex || ''}" placeholder="e.g., F = ma" />
                        </div>
                        <div class="ref-form-group">
                            <label class="ref-form-label">When to Use</label>
                            <input type="text" class="ref-form-input" id="refWhenToUse" value="${ref?.content?.when_to_use || ''}" placeholder="e.g., Calculating net force" />
                        </div>
                    `;

        case 'fact':
            return `
                        <div class="ref-form-group">
                            <label class="ref-form-label">Fact *</label>
                            <textarea class="ref-form-textarea" id="refFact">${ref?.content?.fact || ''}</textarea>
                        </div>
                        <div class="ref-form-group">
                            <label class="ref-form-label">Mnemonic (optional)</label>
                            <input type="text" class="ref-form-input" id="refMnemonic" value="${ref?.content?.mnemonic || ''}" />
                        </div>
                        <div class="ref-form-group">
                            <label class="ref-form-label">Exam Tip (optional)</label>
                            <input type="text" class="ref-form-input" id="refExamTip" value="${ref?.content?.exam_tip || ''}" />
                        </div>
                    `;

        case 'code':
            return `
                        <div class="ref-form-group">
                            <label class="ref-form-label">Language *</label>
                            <select class="ref-form-select" id="refLanguage">
                                <option value="javascript" ${ref?.content?.language === 'javascript' ? 'selected' : ''}>JavaScript</option>
                                <option value="python" ${ref?.content?.language === 'python' ? 'selected' : ''}>Python</option>
                                <option value="java" ${ref?.content?.language === 'java' ? 'selected' : ''}>Java</option>
                                <option value="cpp" ${ref?.content?.language === 'cpp' ? 'selected' : ''}>C++</option>
                                <option value="sql" ${ref?.content?.language === 'sql' ? 'selected' : ''}>SQL</option>
                            </select>
                        </div>
                        <div class="ref-form-group">
                            <label class="ref-form-label">Code *</label>
                            <textarea class="ref-form-textarea" id="refCode" style="font-family: 'Fira Code', monospace; min-height: 150px;">${ref?.content?.code || ''}</textarea>
                        </div>
                        <div class="ref-form-group">
                            <label class="ref-form-label">When to Use</label>
                            <input type="text" class="ref-form-input" id="refCodeWhen" value="${ref?.content?.when_to_use || ''}" />
                        </div>
                    `;

        case 'table':
            return `
                        <div class="ref-form-group">
                            <label class="ref-form-label">Table Data</label>
                            <textarea class="ref-form-textarea" id="refTableData" placeholder="Paste table data (CSV format)" style="min-height: 200px;">${ref?.content ? JSON.stringify(ref.content) : ''}</textarea>
                            <div class="ref-form-hint">Enter data in CSV format or JSON</div>
                        </div>
                    `;

        case 'checklist':
            return `
                        <div class="ref-form-group">
                            <label class="ref-form-label">Checklist Items *</label>
                            <textarea class="ref-form-textarea" id="refChecklistItems" placeholder="One item per line">${ref?.content?.items?.map(i => i.text).join('\n') || ''}</textarea>
                            <div class="ref-form-hint">Enter one item per line</div>
                        </div>
                    `;

        default:
            return '';
    }
}

// Select reference type
window.selectRefType = function (type) {
    document.querySelectorAll('.ref-type-option').forEach(el => el.classList.remove('selected'));
    const selectedOption = document.querySelector(`[data-type="${type}"]`);
    if (selectedOption) selectedOption.classList.add('selected');

    const contentFields = document.getElementById('refContentFields');
    if (contentFields) {
        contentFields.innerHTML = renderContentFields(type, null);
    }
};

// Add tag
window.addTag = function () {
    const input = document.getElementById('refTagInput');
    const tag = input.value.trim().toLowerCase().replace(/^#/, '');

    if (!tag) return;

    const container = document.getElementById('refTagContainer');
    const existingTags = Array.from(container.querySelectorAll('.ref-tag-chip')).map(el => el.textContent.replace('×', '').trim());

    if (existingTags.includes(tag)) {
        showToast('⚠️ Tag already added');
        return;
    }

    if (existingTags.length >= 10) {
        showToast('⚠️ Maximum 10 tags per reference');
        return;
    }

    const chip = document.createElement('span');
    chip.className = 'ref-tag-chip';
    chip.innerHTML = `${tag} <span class="ref-tag-remove" onclick="this.parentElement.remove()">×</span>`;

    container.insertBefore(chip, input);
    input.value = '';
};

// Save reference
window.saveRef = async function () {
    const selectedType = document.querySelector('.ref-type-option.selected')?.querySelector('.ref-type-name')?.textContent.toLowerCase() || 'definition';
    const title = document.getElementById('refTitle').value.trim();

    if (!title) {
        showToast('⚠️ Title is required');
        return;
    }

    // Build content based on type
    let content = {};
    switch (selectedType) {
        case 'definition':
            content = {
                term: document.getElementById('refTerm')?.value || '',
                definition: document.getElementById('refDefinition')?.value || ''
            };
            break;
        case 'formula':
            content = {
                latex: document.getElementById('refFormula')?.value || '',
                when_to_use: document.getElementById('refWhenToUse')?.value || ''
            };
            break;
        case 'fact':
            content = {
                fact: document.getElementById('refFact')?.value || '',
                mnemonic: document.getElementById('refMnemonic')?.value || '',
                exam_tip: document.getElementById('refExamTip')?.value || ''
            };
            break;
        case 'code':
            content = {
                language: document.getElementById('refLanguage')?.value || 'javascript',
                code: document.getElementById('refCode')?.value || '',
                when_to_use: document.getElementById('refCodeWhen')?.value || ''
            };
            break;
        case 'checklist':
            const items = document.getElementById('refChecklistItems')?.value.split('\n').filter(i => i.trim());
            content = {
                items: items.map(text => ({ text: text.trim(), checked: false }))
            };
            break;
        case 'table':
            try {
                content = JSON.parse(document.getElementById('refTableData')?.value || '{}');
            } catch (e) {
                content = { headers: [], rows: [] };
            }
            break;
    }

    const tags = Array.from(document.querySelectorAll('.ref-tag-chip')).map(el =>
        el.textContent.replace('×', '').trim()
    );

    const reference = {
        id: currentEditingRef?.id || Date.now().toString(),
        type: selectedType,
        title: title,
        content: content,
        discipline: document.getElementById('refDiscipline').value,
        tags: tags,
        pinned: document.getElementById('refPinned').checked,
        metadata: {
            created: currentEditingRef?.metadata?.created || new Date().toISOString(),
            lastModified: new Date().toISOString(),
            accessCount: currentEditingRef?.metadata?.accessCount || 0,
            lastAccessed: currentEditingRef?.metadata?.lastAccessed || new Date().toISOString()
        }
    };

    // Update or add
    const index = myReferences.findIndex(r => r.id === reference.id);
    if (index >= 0) {
        myReferences[index] = reference;
    } else {
        myReferences.push(reference);
    }

    await saveMyReference(reference);
    renderMyReferences();
    closeRefModal();
    showToast('✓ Reference saved');
};

// View reference
window.viewRef = function (id) {
    const ref = myReferences.find(r => r.id === id);
    if (!ref) return;

    // Update access count
    ref.metadata.accessCount++;
    ref.metadata.lastAccessed = new Date().toISOString();
    saveMyReference(ref);

    openRefModal('view', id);
};

// Render reference detail view
function renderRefDetail(ref) {
    const icon = REF_ICONS[ref.type];

    let contentHtml = '';
    switch (ref.type) {
        case 'definition':
            contentHtml = `
                        <div><strong>${ref.content.term}</strong></div>
                        <div style="margin-top: 10px;">${ref.content.definition}</div>
                    `;
            break;
        case 'formula':
            contentHtml = `
                        <div style="font-size: 1.5rem; font-weight: bold; text-align: center; padding: 20px;">
                            ${ref.content.latex}
                        </div>
                        ${ref.content.when_to_use ? `<div><strong>Use:</strong> ${ref.content.when_to_use}</div>` : ''}
                    `;
            break;
        case 'fact':
            contentHtml = `
                        <div>${ref.content.fact}</div>
                        ${ref.content.mnemonic ? `<div style="margin-top: 10px;">💡 <strong>Mnemonic:</strong> ${ref.content.mnemonic}</div>` : ''}
                        ${ref.content.exam_tip ? `<div style="margin-top: 10px;">📝 <strong>Exam Tip:</strong> ${ref.content.exam_tip}</div>` : ''}
                    `;
            break;
        case 'code':
            contentHtml = `
                        <div><strong>Language:</strong> ${ref.content.language}</div>
                        <pre style="background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 6px; margin-top: 10px; overflow-x: auto;"><code>${ref.content.code}</code></pre>
                        ${ref.content.when_to_use ? `<div style="margin-top: 10px;"><strong>Use:</strong> ${ref.content.when_to_use}</div>` : ''}
                    `;
            break;
        case 'checklist':
            contentHtml = `
                        <ul style="list-style: none; padding: 0;">
                            ${ref.content.items.map(item => `
                                <li style="padding: 8px; background: rgba(52,152,219,0.05); margin-bottom: 5px; border-radius: 4px;">
                                    ${item.checked ? '✓' : '☐'} ${item.text}
                                </li>
                            `).join('')}
                        </ul>
                    `;
            break;
        case 'table':
            if (ref.content.headers && ref.content.rows) {
                contentHtml = `
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    ${ref.content.headers.map(h => `<th style="background: var(--cs-accent); color: white; padding: 10px; text-align: left;">${h}</th>`).join('')}
                                </tr>
                                ${ref.content.rows.map(row => `
                                    <tr>
                                        ${row.map(cell => `<td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${cell}</td>`).join('')}
                                    </tr>
                                `).join('')}
                            </table>
                        `;
            }
            break;
    }

    const tagsHtml = ref.tags && ref.tags.length > 0
        ? `<div class="ref-detail-tags">${ref.tags.map(t => `<span class="ref-detail-tag">#${t}</span>`).join('')}</div>`
        : '';

    return `
                <div class="ref-detail">
                    <div class="ref-detail-header">
                        <span class="ref-detail-icon">${icon}</span>
                        <span class="ref-detail-title">${ref.title}</span>
                    </div>
                    <div class="ref-detail-meta">
                        <span>Type: ${ref.type}</span>
                        <span>Discipline: ${ref.discipline}</span>
                        <span>Views: ${ref.metadata.accessCount}</span>
                    </div>
                    <div class="ref-detail-content">
                        ${contentHtml}
                    </div>
                    ${tagsHtml}
                </div>
            `;
}

// Delete reference
window.deleteRef = async function (id) {
    if (!confirm('Delete this reference? This cannot be undone.')) return;

    await deleteMyReference(id);
    myReferences = myReferences.filter(r => r.id !== id);
    renderMyReferences();
    closeRefModal();
    showToast('✓ Reference deleted');
};

// Save from highlighted text in notes
window.saveToMyReferences = function () {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText) {
        showToast('⚠️ Select text first');
        return;
    }

    // Open modal with pre-filled content
    currentEditingRef = null;
    const overlay = document.getElementById('refModalOverlay');
    const title = document.getElementById('refModalTitle');
    const body = document.getElementById('refModalBody');
    const footer = document.getElementById('refModalFooter');

    title.textContent = 'Save to My References';

    // Pre-fill form with selected text
    body.innerHTML = renderRefForm(null);

    // Set default values
    setTimeout(() => {
        document.getElementById('refTitle').value = selectedText.substring(0, 60);

        // Auto-detect type
        if (selectedText.match(/[=+\-*/^]/)) {
            // Likely a formula
            document.querySelector('[data-type="formula"]')?.click();
            if (document.getElementById('refFormula')) {
                document.getElementById('refFormula').value = selectedText;
            }
        } else if (selectedText.length < 200) {
            // Short text = definition or fact
            document.querySelector('[data-type="definition"]')?.click();
            if (document.getElementById('refDefinition')) {
                document.getElementById('refDefinition').value = selectedText;
            }
        } else {
            // Longer text = fact
            document.querySelector('[data-type="fact"]')?.click();
            if (document.getElementById('refFact')) {
                document.getElementById('refFact').value = selectedText;
            }
        }

        // Auto-set discipline
        const chapter = chapters.find(c => c.id === currentId);
        if (chapter && document.getElementById('refDiscipline')) {
            document.getElementById('refDiscipline').value = chapter.metadata?.discipline || 'custom';
        }
    }, 50);

    footer.innerHTML = `
                <button class="ref-btn ref-btn-secondary" onclick="closeRefModal()">Cancel</button>
                <button class="ref-btn ref-btn-primary" onclick="saveRef()">Save Reference</button>
            `;

    overlay.classList.add('active');

    // Hide text bubble
    const textBubble = document.getElementById('textBubble');
    if (textBubble) textBubble.classList.remove('visible');
};

// ========== CIRCUIT COMPONENTS FUNCTIONALITY ==========
// Variables already declared earlier in the code
circuitComponentCounter = 0;
selectedComponent = null;
connectionStart = null;
isDrawingWire = false;
let circuitWires = [];

// Toggle circuit components overlay
window.toggleCircuitComponents = () => {
    const overlay = document.getElementById('circuitComponentsOverlay');
    overlay.classList.toggle('active');

    if (overlay.classList.contains('active')) {
        // Call the fix script's initialization
        if (typeof window.reinitCircuitComponents === 'function') {
            window.reinitCircuitComponents();
        }
        initCircuitDragDrop();
    }
};

// Initialize drag and drop for circuit components
let circuitDragDropInitialized = false;
function initCircuitDragDrop() {
    if (circuitDragDropInitialized) return;
    circuitDragDropInitialized = true;

    const cards = document.querySelectorAll('.circuit-component-card');

    cards.forEach(card => {
        // Drag support
        card.addEventListener('dragstart', (e) => {
            const componentType = card.dataset.component;
            e.dataTransfer.setData('componentType', componentType);
            e.dataTransfer.setData('componentName', card.querySelector('.circuit-component-name').textContent);

            // Get SVG from circuitSymbols array
            const symbol = circuitSymbols.find(s => s.name.toLowerCase() === componentType.toLowerCase());
            if (symbol) {
                e.dataTransfer.setData('componentSvg', symbol.svg);
            }
        });

        // Click-to-add support
        card.addEventListener('click', (e) => {
            // Don't trigger click if this was a drag
            if (e.detail === 0) return;

            const componentType = card.dataset.component;
            const componentName = card.querySelector('.circuit-component-name').textContent;
            const symbol = circuitSymbols.find(s => s.name.toLowerCase() === componentType.toLowerCase());
            const svgContent = symbol ? symbol.svg : '';

            const circuitCanvas = document.getElementById('circuitDiagramCanvas');
            if (!circuitCanvas) return;

            // Place at center of canvas
            const rect = circuitCanvas.getBoundingClientRect();
            const x = rect.width / 2 + (Math.random() * 80 - 40);
            const y = rect.height / 2 + (Math.random() * 80 - 40);

            addCircuitComponent(componentType, svgContent, componentName, x, y);
            toggleCircuitComponents(); // Close the overlay
        });
    });

    // Set up drop zone on circuit canvas
    const circuitCanvas = document.getElementById('circuitDiagramCanvas');
    if (!circuitCanvas) return;

    circuitCanvas.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    circuitCanvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const componentType = e.dataTransfer.getData('componentType');
        const componentName = e.dataTransfer.getData('componentName');
        const componentSvg = e.dataTransfer.getData('componentSvg');

        if (componentType) {
            const rect = circuitCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            addCircuitComponent(componentType, componentSvg || '', componentName, x, y);
            toggleCircuitComponents(); // Close the overlay
        }
    });
}

// Add circuit component to canvas
function addCircuitComponent(type, svgContent, name, x, y) {
    const circuitCanvas = document.getElementById('circuitDiagramCanvas');
    if (!circuitCanvas) return;

    const componentId = `circuit-comp-${circuitComponentCounter++}`;
    const typeLower = type.toLowerCase();
    const defaults = COMPONENT_DEFAULTS[typeLower] || { resistance: 100 };

    // Build component data with electrical properties
    const compData = {
        id: componentId,
        type: typeLower,
        name: name,
        x: x - 40,
        y: y - 40,
        svgContent: svgContent,
        // Electrical properties
        resistance: defaults.resistance,
        voltage: defaults.voltage || 0,
        current: 0,
        voltageDrop: 0,
        powered: false
    };

    // Type-specific properties
    if (typeLower === 'switch') compData.closed = false;
    if (typeLower === 'battery') compData.voltage = defaults.voltage;
    if (typeLower === 'bulb') compData.ratedCurrent = defaults.ratedCurrent;
    if (typeLower === 'led') compData.forwardDrop = defaults.forwardDrop;
    if (typeLower === 'voltmeter' || typeLower === 'ammeter') compData.reading = 0;

    circuitComponents.push(compData);

    // Render the element
    renderCircuitElement(compData);
    showToast(`${name} added to circuit`);
}

// Render a circuit element to the DOM
function renderCircuitElement(compData) {
    const circuitCanvas = document.getElementById('circuitDiagramCanvas');
    if (!circuitCanvas) return;

    const element = document.createElement('div');
    element.className = 'circuit-element';
    element.id = compData.id;
    element.style.left = `${compData.x}px`;
    element.style.top = `${compData.y}px`;
    element.dataset.type = compData.type;

    updateCircuitElementHTML(element, compData);

    // Make component draggable
    makeCircuitElementDraggable(element);

    // Add interactive behaviors
    addComponentInteraction(element, compData);

    const layer = circuitCanvas.querySelector('#circuitComponentsLayer');
    if (layer) {
        layer.appendChild(element);
    } else {
        circuitCanvas.appendChild(element);
    }
}

// Update the HTML content of a circuit element
function updateCircuitElementHTML(element, compData) {
    let svgHtml = '';
    const type = compData.type;

    if (type === 'switch') {
        // Dynamic switch SVG - open or closed
        if (compData.closed) {
            svgHtml = `<svg viewBox="0 0 40 40" width="50" height="50">
                <line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/>
                <line x1="15" y1="20" x2="30" y2="20" stroke="#27ae60" stroke-width="2"/>
                <circle cx="15" cy="20" r="2" fill="#27ae60"/>
                <circle cx="30" cy="20" r="2" fill="#27ae60"/>
                <line x1="30" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>
            </svg>`;
        } else {
            svgHtml = `<svg viewBox="0 0 40 40" width="50" height="50">
                <line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/>
                <line x1="15" y1="20" x2="30" y2="10" stroke="#e74c3c" stroke-width="2"/>
                <circle cx="15" cy="20" r="2" fill="#e74c3c"/>
                <circle cx="30" cy="20" r="2" fill="#2c3e50"/>
                <line x1="30" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>
            </svg>`;
        }
    } else if (type === 'bulb') {
        if (compData.powered && compData.voltageDrop > 0) {
            // Glowing bulb — intensity based on voltage across the bulb
            const maxVoltage = (compData.resistance || 50) * (compData.ratedCurrent || 0.18);
            const intensity = Math.min(compData.voltageDrop / maxVoltage, 1);
            const glowColor = `rgba(255, 235, 59, ${0.2 + intensity * 0.8})`;
            const glowRadius = 2 + intensity * 9;
            svgHtml = `<svg viewBox="0 0 40 40" width="50" height="50">
                <defs><filter id="bulbGlow-${compData.id}"><feGaussianBlur stdDeviation="${glowRadius}" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <circle cx="20" cy="20" r="8" fill="${glowColor}" stroke="#f39c12" stroke-width="2" filter="url(#bulbGlow-${compData.id})"/>
                <line x1="14" y1="14" x2="26" y2="26" stroke="#f39c12" stroke-width="1.5"/>
                <line x1="26" y1="14" x2="14" y2="26" stroke="#f39c12" stroke-width="1.5"/>
                <line x1="5" y1="20" x2="12" y2="20" stroke="#2c3e50" stroke-width="2"/>
                <line x1="28" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>
            </svg>`;
        } else {
            // Bulb OFF — dark, no glow
            svgHtml = `<svg viewBox="0 0 40 40" width="50" height="50">
                <circle cx="20" cy="20" r="8" fill="#e0e0e0" stroke="#999" stroke-width="2"/>
                <line x1="14" y1="14" x2="26" y2="26" stroke="#999" stroke-width="1.5"/>
                <line x1="26" y1="14" x2="14" y2="26" stroke="#999" stroke-width="1.5"/>
                <line x1="5" y1="20" x2="12" y2="20" stroke="#2c3e50" stroke-width="2"/>
                <line x1="28" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>
            </svg>`;
        }
    } else if (type === 'led' && compData.powered) {
        const intensity = Math.min(compData.current / 0.02, 1);
        const r = Math.round(231 * intensity);
        const glowRadius = 2 + intensity * 5;
        svgHtml = `<svg viewBox="0 0 40 40" width="50" height="50">
            <defs><filter id="ledGlow-${compData.id}"><feGaussianBlur stdDeviation="${glowRadius}" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
            <line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/>
            <polygon points="15,10 15,30 25,20" fill="rgb(${r},76,60)" filter="url(#ledGlow-${compData.id})"/>
            <line x1="25" y1="10" x2="25" y2="30" stroke="#2c3e50" stroke-width="2"/>
            <line x1="25" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>
        </svg>`;
    } else if (compData.svgContent) {
        svgHtml = `<svg viewBox="0 0 40 40" width="50" height="50">${compData.svgContent}</svg>`;
    } else {
        svgHtml = `<div class="circuit-element-icon">${compData.name}</div>`;
    }

    // Build value label
    let valueLabel = '';
    if (type === 'resistor') valueLabel = `${compData.resistance}Ω`;
    else if (type === 'battery') valueLabel = `${compData.voltage}V`;
    else if (type === 'bulb') valueLabel = `${compData.resistance}Ω`;
    else if (type === 'switch') valueLabel = compData.closed ? '🟢 Closed' : '🔴 Open';
    else if (type === 'voltmeter') valueLabel = `${compData.reading.toFixed(2)}V`;
    else if (type === 'ammeter') valueLabel = `${(compData.reading * 1000).toFixed(1)}mA`;

    // Status indicator for powered state
    const poweredClass = compData.powered ? ' powered' : '';
    element.className = `circuit-element${poweredClass}`;

    element.innerHTML = `
        ${svgHtml}
        <div class="circuit-element-label">${compData.name}</div>
        ${valueLabel ? `<div class="circuit-value-label">${valueLabel}</div>` : ''}
        <button class="circuit-element-delete" onclick="deleteCircuitComponent('${compData.id}')">×</button>
        <div class="circuit-connection-point top" data-point="top" onclick="startConnection(event, '${compData.id}', 'top')"></div>
        <div class="circuit-connection-point bottom" data-point="bottom" onclick="startConnection(event, '${compData.id}', 'bottom')"></div>
        <div class="circuit-connection-point left" data-point="left" onclick="startConnection(event, '${compData.id}', 'left')"></div>
        <div class="circuit-connection-point right" data-point="right" onclick="startConnection(event, '${compData.id}', 'right')"></div>
    `;
}

// Add interactive behaviors to a component
function addComponentInteraction(element, compData) {
    const type = compData.type;

    if (type === 'switch') {
        // Click to toggle switch
        element.addEventListener('click', (e) => {
            if (e.target.classList.contains('circuit-connection-point') ||
                e.target.classList.contains('circuit-element-delete')) return;
            compData.closed = !compData.closed;
            compData.resistance = compData.closed ? 0.001 : Infinity;
            updateCircuitElementHTML(element, compData);
            // Re-attach interaction since innerHTML was replaced
            addSwitchClickHandler(element, compData);
            simulateCircuit();
            showToast(compData.closed ? '🟢 Switch closed' : '🔴 Switch opened');
        });
    }

    if (type === 'resistor' || type === 'bulb') {
        // Double-click to edit resistance
        element.addEventListener('dblclick', (e) => {
            if (e.target.classList.contains('circuit-connection-point') ||
                e.target.classList.contains('circuit-element-delete')) return;
            e.stopPropagation();
            const newVal = prompt(`Set resistance (Ω):`, compData.resistance);
            if (newVal !== null && !isNaN(parseFloat(newVal)) && parseFloat(newVal) > 0) {
                compData.resistance = parseFloat(newVal);
                updateCircuitElementHTML(element, compData);
                simulateCircuit();
                showToast(`Resistance set to ${compData.resistance}Ω`);
            }
        });
    }

    if (type === 'battery') {
        // Double-click to edit voltage
        element.addEventListener('dblclick', (e) => {
            if (e.target.classList.contains('circuit-connection-point') ||
                e.target.classList.contains('circuit-element-delete')) return;
            e.stopPropagation();
            const newVal = prompt(`Set voltage (V):`, compData.voltage);
            if (newVal !== null && !isNaN(parseFloat(newVal)) && parseFloat(newVal) > 0) {
                compData.voltage = parseFloat(newVal);
                updateCircuitElementHTML(element, compData);
                simulateCircuit();
                showToast(`Voltage set to ${compData.voltage}V`);
            }
        });
    }
}

// Re-attach switch click handler after innerHTML replacement
function addSwitchClickHandler(element, compData) {
    // The main click handler is on the element itself, no need to re-add
    // But we need the connection points and delete button to work
    // They use inline onclick attributes so they're automatically re-attached
}

// ==================== CIRCUIT SIMULATION ENGINE ====================
function simulateCircuit() {
    // Reset all components
    circuitComponents.forEach(comp => {
        comp.current = 0;
        comp.voltageDrop = 0;
        comp.powered = false;
        if (comp.type === 'voltmeter') comp.reading = 0;
        if (comp.type === 'ammeter') comp.reading = 0;
    });

    // Build adjacency map from wires
    // Open switches break the circuit — exclude their connections
    const openSwitchIds = new Set(
        circuitComponents.filter(c => c.type === 'switch' && !c.closed).map(c => c.id)
    );

    const adjacency = {};
    circuitComponents.forEach(comp => {
        adjacency[comp.id] = [];
    });

    circuitWires.forEach(wire => {
        // Skip wires connected to an open switch — circuit is broken there
        if (openSwitchIds.has(wire.comp1) || openSwitchIds.has(wire.comp2)) return;

        if (adjacency[wire.comp1] && adjacency[wire.comp2]) {
            adjacency[wire.comp1].push(wire.comp2);
            adjacency[wire.comp2].push(wire.comp1);
        }
    });

    // Find all batteries
    const batteries = circuitComponents.filter(c => c.type === 'battery');
    if (batteries.length === 0) {
        updateAllComponentVisuals();
        return;
    }

    // For each battery, find loops (simple DFS-based loop detection)
    batteries.forEach(battery => {
        const loops = findLoops(battery.id, adjacency);

        loops.forEach(loop => {
            // Calculate total resistance and voltage in the loop
            let totalResistance = 0;
            let totalVoltage = 0;
            let hasOpenSwitch = false;

            const loopComponents = loop.map(id => circuitComponents.find(c => c.id === id)).filter(Boolean);

            loopComponents.forEach(comp => {
                if (comp.type === 'battery') {
                    totalVoltage += comp.voltage;
                    totalResistance += comp.resistance || 0.01;
                } else if (comp.type === 'switch' && !comp.closed) {
                    hasOpenSwitch = true;
                } else if (comp.type === 'voltmeter') {
                    // Voltmeter has very high resistance — don't add for parallel measurement
                    // but still track it
                } else {
                    totalResistance += comp.resistance || 0;
                }
            });

            if (hasOpenSwitch || totalResistance <= 0) {
                // Open circuit or short circuit protection
                if (totalResistance <= 0) totalResistance = 0.01;
                if (hasOpenSwitch) return;
            }

            // Calculate current: I = V / R
            const current = totalVoltage / totalResistance;

            // Apply current and voltage drops to each component in the loop
            loopComponents.forEach(comp => {
                if (comp.type === 'battery') {
                    comp.current = current;
                    comp.powered = true;
                } else if (comp.type === 'voltmeter') {
                    // Voltmeter measures voltage across adjacent component
                    // Find what it's connected to and measure voltage
                    const neighbors = adjacency[comp.id] || [];
                    let measuredVoltage = 0;
                    neighbors.forEach(nId => {
                        const neighbor = circuitComponents.find(c => c.id === nId);
                        if (neighbor && neighbor.type !== 'voltmeter') {
                            measuredVoltage = Math.max(measuredVoltage, Math.abs(neighbor.voltageDrop || (current * (neighbor.resistance || 0))));
                        }
                    });
                    comp.reading = measuredVoltage || (totalVoltage > 0 ? totalVoltage : 0);
                    comp.powered = current > 0.0001;
                } else {
                    comp.current = current;
                    comp.voltageDrop = current * (comp.resistance || 0);
                    comp.powered = current > 0.0001;

                    if (comp.type === 'ammeter') {
                        comp.reading = current;
                    }
                }
            });
        });
    });

    // Update all component visuals
    updateAllComponentVisuals();

    // Update wire styles
    updateWireStyles();
}

// Find loops starting from a given component using DFS
function findLoops(startId, adjacency) {
    const loops = [];
    const maxDepth = circuitComponents.length + 1;

    function dfs(currentId, visited, path) {
        if (path.length > maxDepth) return;

        const neighbors = adjacency[currentId] || [];
        for (const neighborId of neighbors) {
            if (neighborId === startId && path.length >= 2) {
                // Found a loop back to start
                loops.push([...path]);
                return;
            }
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                path.push(neighborId);
                dfs(neighborId, visited, path);
                path.pop();
                visited.delete(neighborId);
            }
        }
    }

    const visited = new Set([startId]);
    dfs(startId, visited, [startId]);

    return loops;
}

// Update all component visuals after simulation
function updateAllComponentVisuals() {
    circuitComponents.forEach(comp => {
        const element = document.getElementById(comp.id);
        if (element) {
            // Save current position
            const currentLeft = element.style.left;
            const currentTop = element.style.top;

            updateCircuitElementHTML(element, comp);

            // Restore position (innerHTML replacement may not affect style, but be safe)
            element.style.left = currentLeft;
            element.style.top = currentTop;
            element.dataset.type = comp.type;
        }
    });
}

// Update wire styles based on current flow
function updateWireStyles() {
    circuitWires.forEach(wire => {
        const path = document.getElementById(wire.id);
        if (!path) return;

        const comp1 = circuitComponents.find(c => c.id === wire.comp1);
        const comp2 = circuitComponents.find(c => c.id === wire.comp2);

        const hasCurrent = (comp1 && comp1.powered) || (comp2 && comp2.powered);
        if (hasCurrent) {
            path.classList.add('active');
        } else {
            path.classList.remove('active');
        }
    });
}

// Make circuit element draggable
function makeCircuitElementDraggable(element) {
    let isDragging = false;
    let startMouseX, startMouseY;
    let startLeft, startTop;

    element.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        if (e.target.classList.contains('circuit-connection-point') ||
            e.target.classList.contains('circuit-element-delete')) {
            return;
        }

        if (e.target === element || element.contains(e.target)) {
            isDragging = true;
            startMouseX = e.clientX;
            startMouseY = e.clientY;
            startLeft = parseInt(element.style.left) || 0;
            startTop = parseInt(element.style.top) || 0;
            element.classList.add('selected');
            e.preventDefault();
        }
    }

    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();

        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;

        element.style.left = (startLeft + dx) + 'px';
        element.style.top = (startTop + dy) + 'px';

        updateWires(element.id);
    }

    function dragEnd(e) {
        if (isDragging) {
            isDragging = false;

            // Update component position in array
            const comp = circuitComponents.find(c => c.id === element.id);
            if (comp) {
                comp.x = parseInt(element.style.left) || 0;
                comp.y = parseInt(element.style.top) || 0;
            }
        }
    }
}

// Start wire connection
window.startConnection = (event, componentId, point) => {
    event.stopPropagation();

    if (!connectionStart) {
        connectionStart = { componentId, point };
        showToast('Click another connection point to complete wire');
    } else {
        // Complete the connection
        if (connectionStart.componentId !== componentId) {
            createWire(connectionStart.componentId, connectionStart.point, componentId, point);
            connectionStart = null;
        } else {
            showToast('Cannot connect component to itself');
            connectionStart = null;
        }
    }
};

// Create wire between two components
function createWire(comp1Id, point1, comp2Id, point2) {
    const svg = document.getElementById('circuitSvg');
    if (!svg) return;

    const comp1 = document.getElementById(comp1Id);
    const comp2 = document.getElementById(comp2Id);

    if (!comp1 || !comp2) return;

    const wireId = `wire-${Date.now()}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'circuit-wire');
    path.setAttribute('id', wireId);
    path.setAttribute('data-comp1', comp1Id);
    path.setAttribute('data-point1', point1);
    path.setAttribute('data-comp2', comp2Id);
    path.setAttribute('data-point2', point2);

    updateWirePath(path, comp1, point1, comp2, point2);

    path.addEventListener('click', () => {
        if (confirm('Delete this wire?')) {
            path.remove();
            circuitWires = circuitWires.filter(w => w.id !== wireId);
            simulateCircuit();
        }
    });

    svg.appendChild(path);

    circuitWires.push({
        id: wireId,
        comp1: comp1Id,
        point1: point1,
        comp2: comp2Id,
        point2: point2
    });

    showToast('Wire connected');
    simulateCircuit();
}

// Update wire path
function updateWirePath(path, comp1, point1, comp2, point2) {
    const svg = document.getElementById('circuitSvg');
    const svgRect = svg.getBoundingClientRect();

    const comp1Rect = comp1.getBoundingClientRect();
    const comp2Rect = comp2.getBoundingClientRect();

    const pos1 = getConnectionPointPosition(comp1Rect, point1, svgRect);
    const pos2 = getConnectionPointPosition(comp2Rect, point2, svgRect);

    const d = `M ${pos1.x} ${pos1.y} L ${pos2.x} ${pos2.y}`;
    path.setAttribute('d', d);
}

// Get connection point position
function getConnectionPointPosition(compRect, point, svgRect) {
    let x, y;

    switch (point) {
        case 'top':
            x = compRect.left + compRect.width / 2 - svgRect.left;
            y = compRect.top - svgRect.top;
            break;
        case 'bottom':
            x = compRect.left + compRect.width / 2 - svgRect.left;
            y = compRect.bottom - svgRect.top;
            break;
        case 'left':
            x = compRect.left - svgRect.left;
            y = compRect.top + compRect.height / 2 - svgRect.top;
            break;
        case 'right':
            x = compRect.right - svgRect.left;
            y = compRect.top + compRect.height / 2 - svgRect.top;
            break;
    }

    return { x, y };
}

// Update all wires connected to a component
function updateWires(componentId) {
    const svg = document.getElementById('circuitSvg');
    if (!svg) return;

    circuitWires.forEach(wire => {
        if (wire.comp1 === componentId || wire.comp2 === componentId) {
            const path = document.getElementById(wire.id);
            const comp1 = document.getElementById(wire.comp1);
            const comp2 = document.getElementById(wire.comp2);

            if (path && comp1 && comp2) {
                updateWirePath(path, comp1, wire.point1, comp2, wire.point2);
            }
        }
    });
}

// Delete circuit component
window.deleteCircuitComponent = (componentId) => {
    const element = document.getElementById(componentId);
    if (!element) return;

    // Remove all wires connected to this component
    const wiresToRemove = circuitWires.filter(w => w.comp1 === componentId || w.comp2 === componentId);
    wiresToRemove.forEach(wire => {
        const wirePath = document.getElementById(wire.id);
        if (wirePath) wirePath.remove();
    });

    circuitWires = circuitWires.filter(w => w.comp1 !== componentId && w.comp2 !== componentId);
    circuitComponents = circuitComponents.filter(c => c.id !== componentId);

    element.remove();
    showToast('Component deleted');
    simulateCircuit();
};

// Create a new chapter/page (OPTIMIZED)
window.createNewChapter = async () => {
    const newChapter = {
        id: Date.now().toString(),
        title: 'New Page',
        content: '<p>Start typing...</p>',
        tags: [],
        metadata: {
            discipline: 'general',
            type: 'note',
            createdAt: new Date().toISOString(),
            lastEdited: new Date().toISOString()
        },
        lastEdited: new Date().toISOString(),
        isWhiteboard: false,
        sketchData: null
    };

    // Add to beginning of chapters array
    chapters.unshift(newChapter);
    currentId = newChapter.id;

    // Batch DOM updates for better performance
    const stream = document.getElementById('sequentialStream');
    const titleInput = document.getElementById('pageTitle');

    // Use DocumentFragment for efficient DOM manipulation
    const fragment = document.createDocumentFragment();
    const block = document.createElement('div');
    block.className = 'sequence-editor-block active-focus';
    block.id = `page-block-${newChapter.id}`;

    const contentArea = document.createElement('div');
    contentArea.className = 'content-area';
    contentArea.contentEditable = 'true';
    contentArea.innerHTML = newChapter.content;
    contentArea.oninput = () => {
        markUnsaved();
        saveCurrentToCloud();
    };

    block.appendChild(contentArea);
    fragment.appendChild(block);

    // Single DOM update
    stream.innerHTML = '';
    stream.appendChild(fragment);
    titleInput.value = newChapter.title;

    // Focus immediately for better UX
    contentArea.focus();

    // Defer non-critical operations
    requestAnimationFrame(() => {
        renderSidebar();
        updateToolVisibility(newChapter);
    });

    // Save to IndexedDB asynchronously (don't block UI)
    saveChapterToDB(newChapter).catch(err => console.error('Save failed:', err));

    showToast('✓ New page created');
};

// Add a new page to the stream with the same tag (MULTI-PAGE STREAM)
window.addPageToStream = async () => {
    const currentChapter = chapters.find(c => c.id === currentId);
    if (!currentChapter) return;

    // Create new page with same tag as current page
    const newChapter = {
        id: Date.now().toString(),
        title: 'New Page',
        content: '<p>Start typing...</p>',
        tags: currentChapter.tags ? [...currentChapter.tags] : [], // Inherit tags
        metadata: {
            discipline: currentChapter.metadata?.discipline || 'general',
            type: currentChapter.metadata?.type || 'note',
            createdAt: new Date().toISOString(),
            lastEdited: new Date().toISOString()
        },
        lastEdited: new Date().toISOString(),
        isWhiteboard: false,
        sketchData: null
    };

    // Add to chapters array
    chapters.push(newChapter);

    // Save to IndexedDB asynchronously
    saveChapterToDB(newChapter).catch(err => console.error('Save failed:', err));

    // Reload the stream to show all pages with the same tag
    loadStreamByTag(currentChapter.tags && currentChapter.tags.length > 0 ? currentChapter.tags[0] : null);

    // Update sidebar
    requestAnimationFrame(() => renderSidebar());

    showToast('✓ Page added to stream');
};

// ===== VIRTUAL SCROLLING MANAGER =====
// Manages efficient rendering of large page streams by only rendering visible pages
class VirtualScrollManager {
    constructor(container, chapters, currentId) {
        this.container = container;
        this.chapters = chapters;
        this.currentId = currentId;
        this.renderedPages = new Map();
        this.placeholders = new Map();
        this.observer = null;
        this.bufferSize = 3; // Number of pages to render before/after viewport
        this.estimatedPageHeight = 800; // Estimated height per page in pixels
    }

    init() {
        // Clear container
        this.container.innerHTML = '';

        // Create placeholders for all pages
        this.chapters.forEach((chapter, index) => {
            const placeholder = this.createPlaceholder(chapter, index);
            this.placeholders.set(chapter.id, placeholder);
            this.container.appendChild(placeholder);
        });

        // Set up Intersection Observer
        this.setupObserver();

        // Render initial visible pages (first 5-7 pages)
        const initialRenderCount = Math.min(5, this.chapters.length);
        for (let i = 0; i < initialRenderCount; i++) {
            this.renderPage(i);
        }
    }

    createPlaceholder(chapter, index) {
        const placeholder = document.createElement('div');
        placeholder.className = 'page-placeholder';
        placeholder.dataset.chapterId = chapter.id;
        placeholder.dataset.index = index;
        placeholder.style.minHeight = `${this.estimatedPageHeight}px`;
        placeholder.style.background = 'transparent';
        return placeholder;
    }

    setupObserver() {
        const options = {
            root: null, // Use viewport
            rootMargin: `${this.estimatedPageHeight * this.bufferSize}px`, // Buffer zone
            threshold: 0
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const index = parseInt(entry.target.dataset.index);

                if (entry.isIntersecting) {
                    // Page placeholder is entering viewport - render it
                    this.renderPage(index);
                } else {
                    // Page is far from viewport - can unrender to save memory
                    // Only unrender if it's far enough (not just slightly out of view)
                    const rect = entry.target.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    const distanceFromViewport = Math.min(
                        Math.abs(rect.top),
                        Math.abs(rect.bottom - viewportHeight)
                    );

                    // Only unrender if more than 3 viewport heights away
                    if (distanceFromViewport > viewportHeight * 3) {
                        this.unrenderPage(index);
                    }
                }
            });
        }, options);

        // Observe all placeholders
        this.placeholders.forEach(placeholder => {
            this.observer.observe(placeholder);
        });
    }

    renderPage(index) {
        const chapter = this.chapters[index];
        if (!chapter || this.renderedPages.has(chapter.id)) return;

        const placeholder = this.placeholders.get(chapter.id);
        if (!placeholder) return;

        // Create the actual page block
        const block = this.createPageBlock(chapter, index);

        // Replace placeholder with actual content
        placeholder.replaceWith(block);
        this.placeholders.set(chapter.id, block);
        this.renderedPages.set(chapter.id, block);

        // Continue observing the actual block
        this.observer.observe(block);
    }

    unrenderPage(index) {
        const chapter = this.chapters[index];
        if (!chapter || !this.renderedPages.has(chapter.id)) return;

        const renderedBlock = this.renderedPages.get(chapter.id);

        // Create placeholder based on actual rendered height
        const actualHeight = renderedBlock.offsetHeight;
        const placeholder = this.createPlaceholder(chapter, index);
        placeholder.style.minHeight = `${actualHeight}px`;

        // Replace rendered content with placeholder
        renderedBlock.replaceWith(placeholder);
        this.placeholders.set(chapter.id, placeholder);
        this.renderedPages.delete(chapter.id);

        // Observe the placeholder again
        this.observer.observe(placeholder);
    }

    createPageBlock(chapter, index) {
        const block = document.createElement('div');
        block.className = 'sequence-editor-block';
        if (chapter.id === this.currentId) block.classList.add('active-focus');
        block.id = `page-block-${chapter.id}`;
        block.dataset.chapterId = chapter.id;
        block.dataset.index = index;

        // Add title section for subsequent pages (index > 0)
        if (0 < index) {
            const titleSection = document.createElement('div');
            titleSection.className = 'paper-title';
            titleSection.style.marginTop = '0';
            titleSection.style.marginBottom = '0';
            titleSection.style.borderBottom = '2px solid var(--accent-color)';
            titleSection.style.borderRadius = '4px 4px 0 0';
            titleSection.style.background = 'rgba(0, 0, 0, 0.02)';

            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.value = chapter.title || 'Untitled';
            titleInput.className = 'page-title-input';
            titleInput.style.cssText = 'width: 100%; border: none; background: transparent; font-size: 2.4rem; font-weight: 400; color: var(--ink-color); outline: none; font-family: inherit; padding: 0.5rem;';
            titleInput.placeholder = "Page title...";

            titleInput.oninput = () => {
                chapter.title = titleInput.value;
                chapter.lastEdited = new Date().toISOString();
                markUnsaved();
                saveChapterContent(chapter.id);
            };

            titleSection.appendChild(titleInput);
            block.appendChild(titleSection);
        }

        // Add content area
        const contentArea = document.createElement('div');
        contentArea.className = 'content-area';
        contentArea.contentEditable = 'true';
        contentArea.innerHTML = chapter.content || '&lt;p&gt;Start typing...&lt;/p&gt;';
        contentArea.dataset.chapterId = chapter.id;

        if (index > 0) {
            contentArea.style.paddingTop = '1rem';
        }

        contentArea.oninput = () => {
            markUnsaved();
            saveChapterContent(chapter.id);
        };

        // Enable auto-checkbox functionality
        setupAutoCheckbox(contentArea);

        block.appendChild(contentArea);
        return block;
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.renderedPages.clear();
        this.placeholders.clear();
    }
}

// Store current virtual scroll manager instance
let currentVirtualScrollManager = null;


// Load all pages with the same tag into the stream (MULTI-PAGE VIEW)
window.loadStreamByTag = (tag) => {
    const stream = document.getElementById('sequentialStream');
    const titleInput = document.getElementById('pageTitle');

    // Find all chapters with this tag
    const taggedChapters = tag
        ? chapters.filter(ch => ch.tags && ch.tags.includes(tag))
        : [chapters.find(c => c.id === currentId)];

    if (taggedChapters.length === 0) return;

    // Destroy previous virtual scroll manager if it exists
    if (currentVirtualScrollManager) {
        currentVirtualScrollManager.destroy();
    }

    // Use Virtual Scrolling for performance with large page sets
    if (taggedChapters.length > 10) {
        // Enable virtual scrolling for streams with more than 10 pages
        currentVirtualScrollManager = new VirtualScrollManager(stream, taggedChapters, currentId);
        currentVirtualScrollManager.init();
    } else {
        // For small page sets, render normally (no virtual scrolling overhead)
        currentVirtualScrollManager = null;

        // Use DocumentFragment for efficient rendering
        const fragment = document.createDocumentFragment();

        taggedChapters.forEach((chapter, index) => {
            // Create page block
            const block = document.createElement('div');
            block.className = 'sequence-editor-block';
            if (chapter.id === currentId) block.classList.add('active-focus');
            block.id = `page-block-${chapter.id}`;

            // Add title section for subsequent pages (index > 0)
            if (0 < index) {
                const titleSection = document.createElement('div');
                titleSection.className = 'paper-title'; // Re-use main title class
                titleSection.style.marginTop = '0';
                titleSection.style.marginBottom = '0';
                titleSection.style.borderBottom = '2px solid var(--accent-color)';
                titleSection.style.borderRadius = '4px 4px 0 0';
                titleSection.style.background = 'rgba(0, 0, 0, 0.02)';

                const titleInput = document.createElement('input');
                titleInput.type = 'text';
                titleInput.value = chapter.title || 'Untitled';
                titleInput.className = 'page-title-input';
                titleInput.style.cssText = 'width: 100%; border: none; background: transparent; font-size: 2.4rem; font-weight: 400; color: var(--ink-color); outline: none; font-family: inherit; padding: 0.5rem;';
                titleInput.placeholder = "Page title...";

                titleInput.oninput = () => {
                    chapter.title = titleInput.value;
                    chapter.lastEdited = new Date().toISOString();
                    markUnsaved();
                    saveChapterContent(chapter.id);
                };

                titleSection.appendChild(titleInput);
                block.appendChild(titleSection);
            }

            // Add content area
            const contentArea = document.createElement('div');
            contentArea.className = 'content-area';
            contentArea.contentEditable = 'true';
            contentArea.innerHTML = chapter.content || '<p>Start typing...</p>';
            contentArea.dataset.chapterId = chapter.id;
            // Padding uses CSS default (3rem) now that title is gone

            if (0 < index) {
                contentArea.style.paddingTop = '1rem';
            }

            contentArea.oninput = () => {
                markUnsaved();
                saveChapterContent(chapter.id);
            };

            // Enable auto-checkbox functionality
            setupAutoCheckbox(contentArea);

            block.appendChild(contentArea);
            fragment.appendChild(block);
        });

        // Update DOM
        stream.innerHTML = '';
        stream.appendChild(fragment);
    }
    titleInput.value = taggedChapters[0].title || 'Untitled';

    // Update current ID to first chapter in stream
    if (taggedChapters.length > 0) {
        currentId = taggedChapters[0].id;
    }
};

// Save specific chapter content
function saveChapterContent(chapterId) {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    const contentArea = document.querySelector(`[data-chapter-id="${chapterId}"]`);
    if (contentArea) {
        chapter.content = contentArea.innerHTML;
        chapter.lastEdited = new Date().toISOString();

        // Debounced save to IndexedDB
        clearTimeout(window.saveTimeout);
        window.saveTimeout = setTimeout(() => {
            saveChapterToDB(chapter).catch(err => console.error('Save failed:', err));
        }, 1000);
    }
}


// Render tags in sidebar
function renderTagCloud() {
    const tagCloud = document.getElementById('tagCloud');
    if (!tagCloud) return;

    const tagCounts = {};
    chapters.forEach(chapter => {
        if (chapter.tags && Array.isArray(chapter.tags)) {
            chapter.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });

    const sortedTags = Object.keys(tagCounts).sort();

    if (sortedTags.length === 0) {
        tagCloud.innerHTML = '<div style="opacity:0.5; padding:10px; text-align:center;">No tags yet</div>';
        return;
    }

    tagCloud.innerHTML = sortedTags.map(tag => {
        const count = tagCounts[tag];
        return `
                    <button class="tag-chip" onclick="loadStreamByTag('${tag.replace(/'/g, "\\'")}')" 
                            style="margin:3px; cursor:pointer;" 
                            title="${count} page${count > 1 ? 's' : ''}">
                        ${tag} <span style="opacity:0.7; font-size:0.85em;">(${count})</span>
                    </button>
                `;
    }).join('');
}

// Render the sidebar chapter list
window.renderSidebar = () => {
    const list = document.getElementById('chapterList');
    if (!list) return;

    const searchStr = (document.getElementById('sidebarSearch')?.value || '').toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';

    list.innerHTML = '';

    // Filter chapters
    const filtered = chapters.filter(ch => {
        const titleMatch = (ch.title || '').toLowerCase().includes(searchStr);
        const tagMatch = (ch.tags || []).some(t => t.toLowerCase().includes(searchStr.replace('#', '')));
        const matchesSearch = titleMatch || tagMatch;

        if (!matchesSearch) return false;

        if (categoryFilter === 'all') return true;

        const disc = ch.metadata?.discipline;
        const branch = ch.metadata?.branch;

        // Match category filter
        if (categoryFilter === 'General' && disc === 'general') return true;
        if (categoryFilter === 'Projects' && ch.metadata?.type === 'project') return true;
        if (categoryFilter === 'Algorithms' && disc === 'cs') return true;
        if (categoryFilter === 'Systems' && disc === 'cs') return true;
        if (['Anatomy', 'Pathology', 'Pharmacology', 'Clinical'].includes(categoryFilter) && disc === 'medical') return true;
        if (['Dental Anatomy', 'Procedures', 'Dental Cases'].includes(categoryFilter) && disc === 'medical') return true;
        if (['Electrical', 'Mechanical', 'Civil', 'Electronics', 'Mechatronics', 'Industrial'].includes(categoryFilter)) {
            return disc === 'engineering' && (branch === categoryFilter || categoryFilter.includes(branch));
        }

        return false;
    });

    // Group chapters by their first tag (for better organization)
    const grouped = {};
    const untagged = [];

    filtered.forEach(ch => {
        if (ch.tags && ch.tags.length > 0) {
            const primaryTag = ch.tags[0];
            if (!grouped[primaryTag]) {
                grouped[primaryTag] = [];
            }
            grouped[primaryTag].push(ch);
        } else {
            untagged.push(ch);
        }
    });

    // Render grouped chapters (by tag) with visual separation
    const sortedTags = Object.keys(grouped).sort();
    sortedTags.forEach((tag, index) => {
        // Add visual separator between tag groups (except before first group)
        if (index > 0) {
            const separator = document.createElement('li');
            separator.style.cssText = 'height: 15px; list-style: none; pointer-events: none;';
            list.appendChild(separator);
        }

        grouped[tag].forEach(ch => {
            renderChapterItem(ch, list);
        });
    });

    // Add separator before untagged if there are tagged items
    if (sortedTags.length > 0 && untagged.length > 0) {
        const separator = document.createElement('li');
        separator.style.cssText = 'height: 15px; list-style: none; pointer-events: none;';
        list.appendChild(separator);
    }

    // Render untagged chapters at the end
    untagged.forEach(ch => {
        renderChapterItem(ch, list);
    });

    if (filtered.length === 0) {
        list.innerHTML = '<li style="opacity: 0.5; text-align: center; padding: 20px;">No pages found</li>';
    }

    // Update tag cloud
    renderTagCloud();
};

// Helper function to render a single chapter item
function renderChapterItem(ch, list) {
    const li = document.createElement('li');
    li.className = 'chapter-item';
    if (ch.id === currentId) li.classList.add('active');

    // Create content wrapper
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chapter-item-content';
    contentDiv.onclick = () => loadChapter(ch.id);

    // Title
    const titleDiv = document.createElement('div');
    titleDiv.className = 'chapter-item-title';
    titleDiv.textContent = ch.title || 'Untitled';
    contentDiv.appendChild(titleDiv);

    // Add tags if present
    if (ch.tags && ch.tags.length > 0) {
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'chapter-tags';
        tagsDiv.textContent = ch.tags.map(t => `#${t}`).join(' ');
        contentDiv.appendChild(tagsDiv);
    }

    li.appendChild(contentDiv);

    // Share button (publish to library)
    const shareBtn = document.createElement('button');
    shareBtn.className = 'chapter-share-btn';
    shareBtn.innerHTML = '📤';
    shareBtn.title = window.LIBRARY && window.LIBRARY.isPublished(ch.id)
        ? 'Published — click to unpublish'
        : 'Share to library';
    if (window.LIBRARY && window.LIBRARY.isPublished(ch.id)) {
        shareBtn.classList.add('published');
    }
    shareBtn.onclick = (e) => {
        e.stopPropagation();
        publishToLibrary(ch.id);
    };
    li.appendChild(shareBtn);

    // Delete button with trash icon
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'chapter-delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete page';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteChapter(ch.id);
    };

    li.appendChild(deleteBtn);
    list.appendChild(li);
}

// ─── PUBLISH TO SHARED LIBRARY ───────────────────────────────────────────────

window.publishToLibrary = function(chapterId) {
    if (!window.LIBRARY || !window.AUTH) {
        showToast('Library not available');
        return;
    }

    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) { showToast('Note not found'); return; }

    const user = window.AUTH.getCurrentUser();

    // If already published → offer to unpublish
    if (window.LIBRARY.isPublished(chapterId)) {
        const entry = window.LIBRARY.getByChapterId(chapterId);
        if (entry) {
            if (!confirm(`"${chapter.title}" is already in the library.\n\nRemove it from the library?`)) return;
            const result = window.LIBRARY.deleteEntry(entry.id, user.userId);
            if (result.ok) {
                showToast('📤 Removed from library');
                renderSidebar(); // refresh share button state
            } else {
                showToast('❌ ' + result.error);
            }
        }
        return;
    }

    // Make sure there's something worth sharing
    const raw = (chapter.content || '').replace(/<[^>]+>/g, '').trim();
    if (!chapter.title || chapter.title === 'Untitled Page') {
        showToast('❌ Add a title to this note before sharing');
        return;
    }
    if (raw.length < 10) {
        showToast('❌ Note is too short to share');
        return;
    }

    const result = window.LIBRARY.publish(chapter, user);
    if (result.ok) {
        showToast('📤 Published to library!');
        renderSidebar(); // refresh share button state

        // Offer to jump to library
        setTimeout(() => {
            if (confirm('Note published! Open the library to view it?')) {
                window.open('library.html', '_blank');
            }
        }, 500);
    } else {
        showToast('❌ ' + result.error);
    }
};

// ─── PENDING CLONE HANDLER ───────────────────────────────────────────────────
// When user clones a note from the library, it's stored as a pending clone
// in localStorage. initApp picks it up here and saves it as a real chapter.

async function checkPendingClone() {
    if (!window.AUTH) return;
    const pendingKey = window.AUTH.getStorageKey('nb_pending_clone');
    const raw = localStorage.getItem(pendingKey);
    if (!raw) return;
    localStorage.removeItem(pendingKey);
    try {
        const clone = JSON.parse(raw);
        if (!clone || !clone.id) return;
        chapters.unshift(clone);
        await saveChapterToDB(clone);
        renderSidebar();
        loadChapter(clone.id);
        showToast(`📋 "${clone.title}" cloned into your notebook!`);
    } catch (e) {
        console.warn('Pending clone restore failed:', e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────

// Delete a chapter (OPTIMIZED)
window.deleteChapter = async (id) => {
    const chapterIndex = chapters.findIndex(c => c.id === id);
    if (chapterIndex === -1) return;

    const chapter = chapters[chapterIndex];

    // Remove from array (faster than filter for single item)
    chapters.splice(chapterIndex, 1);

    const wasCurrentChapter = (currentId === id);

    // Delete from IndexedDB asynchronously (don't block UI)
    deleteChapterFromDB(id).catch(err => console.error('Delete failed:', err));

    // Handle UI updates
    if (wasCurrentChapter) {
        if (chapters.length > 0) {
            // Load next available chapter without full re-render
            loadChapter(chapters[0].id);
        } else {
            // No chapters left, create a new one
            createNewChapter();
        }
    } else {
        // Just update sidebar (no need to reload entire page)
        requestAnimationFrame(() => renderSidebar());
    }

    showToast('✓ Page deleted');
};

// Delete chapter from IndexedDB
async function deleteChapterFromDB(id) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('NotebookDB', 1);
        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('chapters', 'readwrite');
            const store = tx.objectStore('chapters');
            const deleteRequest = store.delete(id);

            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
        };
        request.onerror = () => reject(request.error);
    });
}


// Load a specific chapter (UPDATED FOR MULTI-PAGE STREAM)
window.loadChapter = (id) => {
    const chapter = chapters.find(c => c.id === id);
    if (!chapter) return;

    currentId = id;

    // Get the primary tag of this chapter
    const primaryTag = chapter.tags && chapter.tags.length > 0 ? chapter.tags[0] : null;

    // Find all chapters with the same primary tag
    const relatedChapters = primaryTag
        ? chapters.filter(ch => ch.tags && ch.tags.includes(primaryTag))
        : [chapter];

    // Sort by creation date
    relatedChapters.sort((a, b) => new Date(a.metadata?.createdAt || 0) - new Date(b.metadata?.createdAt || 0));

    // Update title
    document.getElementById('pageTitle').value = chapter.title || 'Untitled';

    // Clear and recreate DOM with all related pages
    const stream = document.getElementById('sequentialStream');

    // Destroy previous virtual scroll manager if it exists
    if (currentVirtualScrollManager) {
        currentVirtualScrollManager.destroy();
    }

    // Use Virtual Scrolling for performance with large page sets
    if (relatedChapters.length > 10) {
        // Enable virtual scrolling for streams with more than 10 pages
        currentVirtualScrollManager = new VirtualScrollManager(stream, relatedChapters, currentId);
        currentVirtualScrollManager.init();
    } else {
        // For small page sets, render normally (no virtual scrolling overhead)
        currentVirtualScrollManager = null;
        stream.innerHTML = '';

        // Use DocumentFragment for efficient rendering
        const fragment = document.createDocumentFragment();

        relatedChapters.forEach((ch, index) => {
            const block = document.createElement('div');
            block.className = 'sequence-editor-block';
            if (ch.id === currentId) block.classList.add('active-focus');
            block.id = `page-block-${ch.id}`;

            // Add title section for subsequent pages (index > 0)
            if (index > 0) {
                const titleSection = document.createElement('div');
                titleSection.className = 'paper-title'; // Re-use main title class for consistency
                titleSection.style.marginTop = '0';
                titleSection.style.marginBottom = '0';
                titleSection.style.borderBottom = '2px solid var(--accent-color)';
                titleSection.style.borderRadius = '4px 4px 0 0';
                titleSection.style.background = 'rgba(0, 0, 0, 0.02)';

                const titleInput = document.createElement('input');
                titleInput.type = 'text';
                titleInput.value = ch.title || 'Untitled';
                titleInput.className = 'page-title-input';
                titleInput.style.cssText = 'width: 100%; border: none; background: transparent; font-size: 2.4rem; font-weight: 400; color: var(--ink-color); outline: none; font-family: inherit; padding: 0.5rem;';
                titleInput.placeholder = "Page title...";

                titleInput.oninput = () => {
                    ch.title = titleInput.value;
                    ch.lastEdited = new Date().toISOString();
                    markUnsaved();
                    saveChapterContent(ch.id);
                };

                titleSection.appendChild(titleInput);
                block.appendChild(titleSection);
            }

            // Add content area
            const contentArea = document.createElement('div');
            contentArea.className = 'content-area';
            contentArea.contentEditable = 'true';
            contentArea.innerHTML = ch.content || '<p>Start typing...</p>';
            contentArea.dataset.chapterId = ch.id;

            // Adjust padding for subsequent pages if they have a title
            if (index > 0) {
                contentArea.style.paddingTop = '1rem';
            }

            contentArea.oninput = () => {
                markUnsaved();
                saveChapterContent(ch.id);
            };

            // Enable auto-checkbox functionality
            setupAutoCheckbox(contentArea);

            block.appendChild(contentArea);
            fragment.appendChild(block);
        });

        stream.appendChild(fragment);
    }

    // Update UI
    updateToolVisibility(chapter);
    renderSidebar();

    // Handle whiteboard mode
    if (chapter.isWhiteboard) {
        document.getElementById('paper').classList.add('infinite');
    } else {
        document.getElementById('paper').classList.remove('infinite');
    }

    // Restore sketch data if exists
    if (chapter.sketchData) {
        setTimeout(() => {
            const canvas = document.getElementById('sketchCanvas');
            const ctx = canvas?.getContext('2d');
            if (ctx && chapter.sketchData) {
                const img = new Image();
                img.onload = () => ctx.drawImage(img, 0, 0);
                img.src = chapter.sketchData;
            }
        }, 100);
    }
};

// Save current chapter to database
window.saveCurrentToCloud = async () => {
    const chapter = chapters.find(c => c.id === currentId);
    if (!chapter) return;

    // Update title
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) chapter.title = titleEl.value;

    // Update content
    const contentArea = document.querySelector(`#page-block-${currentId} .content-area`);
    if (contentArea) chapter.content = contentArea.innerHTML;

    // Update timestamp
    chapter.lastEdited = new Date().toISOString();

    // Save to IndexedDB
    await saveChapterToDB(chapter);

    // Update status
    const status = document.getElementById('saveStatus');
    if (status) {
        status.textContent = 'All changes saved';
        status.style.color = 'var(--save-color)';
    }
};

// Mark content as unsaved
window.markUnsaved = () => {
    const status = document.getElementById('saveStatus');
    if (status) {
        status.textContent = 'Saving...';
        status.style.color = 'var(--ink-color)';
    }
};

// Show toast notification
window.showToast = (message) => {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('globalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalToast';
        toast.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: var(--sidebar-bg);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    z-index: 10000;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                    font-size: 0.9rem;
                    max-width: 300px;
                `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
};

// Setup drag and drop for images (fallback — workspace-level handler)
window.setupDragAndDrop = () => {
    const workspace = document.getElementById('workspace');
    if (!workspace) return;

    workspace.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    workspace.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                insertResizableImage(event.target.result);
                markUnsaved();
                saveCurrentToCloud();
            };
            reader.readAsDataURL(file);
            showToast('✓ Image added');
        }
    });
};

// Update storage quota display
window.updateStorageQuota = async () => {
    if (!navigator.storage || !navigator.storage.estimate) return;

    try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

        const storageText = document.getElementById('storageText');
        const storageBar = document.getElementById('storageBar');

        if (storageText) {
            const usageMB = (usage / (1024 * 1024)).toFixed(1);
            const quotaMB = (quota / (1024 * 1024)).toFixed(0);
            storageText.textContent = `${usageMB} MB / ${quotaMB} MB`;
        }

        if (storageBar) {
            storageBar.style.width = `${percentUsed}%`;
        }
    } catch (err) {
        console.error('Storage estimate error:', err);
    }
};

// Initialize My References system
window.initMyReferences = async () => {
    // Stub - can be implemented later
    console.log('My References initialized');
};

// Save current text selection
window.saveSelection = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        window.savedRange = selection.getRangeAt(0);
    }
};

// Handle selection change
window.handleSelectionChange = () => {
    const selection = window.getSelection();
    const textBubble = document.getElementById('textBubble');

    if (!textBubble) return;

    if (selection.toString().length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        textBubble.style.display = 'flex';
        textBubble.style.left = `${rect.left + window.scrollX}px`;
        textBubble.style.top = `${rect.top + window.scrollY - 50}px`;
    } else {
        textBubble.style.display = 'none';
    }
};

// Handle markdown input
window.handleMarkdownInput = (e) => {
    // Basic markdown support - can be enhanced later
    // For now, just trigger save
    if (e.target.classList.contains('content-area')) {
        markUnsaved();
        saveCurrentToCloud();
    }
};

// Setup ruler events
window.setupRulerEvents = () => {
    const ruler = document.getElementById('engRuler');
    if (!ruler) return;

    let isDragging = false;
    let startX, startY;

    ruler.addEventListener('mousedown', (e) => {
        if (e.target.id === 'rulerRotate') return;
        isDragging = true;
        startX = e.clientX - ruler.offsetLeft;
        startY = e.clientY - ruler.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        ruler.style.left = `${e.clientX - startX}px`;
        ruler.style.top = `${e.clientY - startY}px`;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
};

// Switch math keyboard tab
window.switchMathTab = (tab) => {
    const mathKeys = document.getElementById('mathKeys');
    if (!mathKeys) return;

    // Update active tab button
    document.querySelectorAll('.math-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // If called from a button click, use event.target
    // Otherwise, find the button for this category
    try {
        if (event?.target) {
            event.target.classList.add('active');
        } else {
            // Find and activate the button for this category
            const targetBtn = document.querySelector(`.math-tab-btn[onclick*="'${tab}'"]`);
            if (targetBtn) {
                targetBtn.classList.add('active');
            }
        }
    } catch (err) {
        // If event is unreliable, just find the button manually
        const targetBtn = document.querySelector(`.math-tab-btn[onclick*="'${tab}'"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
    }

    // Define math symbols for each tab
    const symbols = {
        basic: ['\\frac{}{}', 'x^2', 'x_n', '\\sqrt{}', '\\sum', '\\int', '\\pm', '\\times', '\\div', '\\neq', '\\leq', '\\geq'],
        trig: ['\\sin', '\\cos', '\\tan', '\\cot', '\\sec', '\\csc', '\\arcsin', '\\arccos', '\\arctan'],
        calc: ['\\lim', '\\frac{d}{dx}', '\\int', '\\partial', '\\nabla', '\\infty', '\\Delta'],
        geom: ['\\angle', '\\triangle', '\\perp', '\\parallel', '\\cong', '\\sim', '\\degree'],
        struct: ['()', '[]', '\\{\\}', '|', '\\left(\\right)', '\\begin{cases}\\end{cases}']
    };

    mathKeys.innerHTML = '';
    (symbols[tab] || symbols.basic).forEach(sym => {
        const btn = document.createElement('button');
        btn.className = 'math-key-btn';
        btn.textContent = sym;
        btn.onclick = () => {
            const buffer = document.getElementById('mathBuffer');
            if (buffer) {
                buffer.value += sym;
                buffer.dispatchEvent(new Event('input'));
            }
        };
        mathKeys.appendChild(btn);
    });
};

// Setup auto-checkbox functionality for content areas (for Eisenhower Matrix and task lists)
window.setupAutoCheckbox = (contentArea) => {
    contentArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            const currentNode = range.commonAncestorContainer;
            const currentElement = currentNode.nodeType === 3 ? currentNode.parentElement : currentNode;

            // Find the current line - check multiple levels
            let currentLine = currentElement.closest('div, p, li');

            // If we're in a span, check its parent
            if (!currentLine && currentElement.tagName === 'SPAN') {
                currentLine = currentElement.parentElement;
            }

            if (!currentLine) return;

            // Check if current line or its parent has a checkbox
            let hasCheckbox = currentLine.querySelector('input[type="checkbox"]');

            // Also check if the line itself contains a checkbox as a direct child
            if (!hasCheckbox) {
                hasCheckbox = Array.from(currentLine.children).find(child =>
                    child.tagName === 'INPUT' && child.type === 'checkbox'
                );
            }

            // Check parent if still not found
            if (!hasCheckbox && currentLine.parentElement) {
                hasCheckbox = currentLine.parentElement.querySelector('input[type="checkbox"]');
            }

            if (hasCheckbox) {
                e.preventDefault();

                // Create new line with checkbox
                const newLine = document.createElement('div');
                newLine.style.cssText = 'margin-bottom: 0.5rem; display: flex; align-items: flex-start; gap: 0.5rem;';
                newLine.dataset.hasCheckbox = 'true';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.style.cssText = 'margin-top: 0.25rem; cursor: pointer; flex-shrink: 0;';
                checkbox.onclick = () => {
                    markUnsaved();
                    const chapterId = contentArea.dataset.chapterId;
                    if (chapterId) saveChapterContent(chapterId);
                    else saveCurrentToCloud();
                };

                const textSpan = document.createElement('span');
                textSpan.contentEditable = 'true';
                textSpan.style.cssText = 'flex: 1; outline: none;';
                textSpan.innerHTML = '<br>'; // Placeholder for cursor

                newLine.appendChild(checkbox);
                newLine.appendChild(textSpan);

                // Insert the new line after current line
                if (currentLine.nextSibling) {
                    currentLine.parentNode.insertBefore(newLine, currentLine.nextSibling);
                } else {
                    currentLine.parentNode.appendChild(newLine);
                }

                // Focus on the new text span
                setTimeout(() => {
                    textSpan.focus();
                    const newRange = document.createRange();
                    newRange.selectNodeContents(textSpan);
                    newRange.collapse(true);
                    const newSelection = window.getSelection();
                    newSelection.removeAllRanges();
                    newSelection.addRange(newRange);
                }, 0);
            }
        }
    });

    // Handle input events for touch devices (iPad stylus)
    // This catches line breaks created by the browser on touch devices
    let lastContent = contentArea.innerHTML;
    contentArea.addEventListener('input', () => {
        const currentContent = contentArea.innerHTML;

        // Check if content changed (new line added)
        if (currentContent !== lastContent) {
            // Find all divs/paragraphs in the content area
            const allLines = contentArea.querySelectorAll('div, p');

            allLines.forEach(line => {
                // Check if this line has a checkbox already or is marked as processed
                const hasCheckbox = line.querySelector('input[type="checkbox"]');
                const isProcessed = line.dataset.hasCheckbox === 'true';

                // If line doesn't have checkbox but previous sibling does, add one
                if (!hasCheckbox && !isProcessed && line.previousElementSibling) {
                    const prevHasCheckbox = line.previousElementSibling.querySelector('input[type="checkbox"]');

                    if (prevHasCheckbox && line.textContent.trim() !== '') {
                        // Convert this line to checkbox format
                        const originalContent = line.innerHTML;
                        line.innerHTML = '';
                        line.style.cssText = 'margin-bottom: 0.5rem; display: flex; align-items: flex-start; gap: 0.5rem;';
                        line.dataset.hasCheckbox = 'true';

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.style.cssText = 'margin-top: 0.25rem; cursor: pointer; flex-shrink: 0;';
                        checkbox.onclick = () => {
                            markUnsaved();
                            const chapterId = contentArea.dataset.chapterId;
                            if (chapterId) saveChapterContent(chapterId);
                            else saveCurrentToCloud();
                        };

                        const textSpan = document.createElement('span');
                        textSpan.contentEditable = 'true';
                        textSpan.style.cssText = 'flex: 1; outline: none;';
                        textSpan.innerHTML = originalContent;

                        line.appendChild(checkbox);
                        line.appendChild(textSpan);
                    }
                }
            });
        }

        lastContent = currentContent;
    });
};

// ==================== END MISSING FUNCTIONS ====================

// ==================== MINDMAP TEMPLATE FUNCTIONS ====================

let mindmapState = {
    nodes: [],
    links: [],
    linkingMode: false,
    firstNode: null,
    nextNodeId: 1
};

window.addMindmapNode = function () {
    const canvas = document.getElementById('mindmapCanvas');
    if (!canvas) return;

    const nodeId = `mindmap-node-${mindmapState.nextNodeId++}`;
    const node = document.createElement('div');
    node.className = 'mindmap-node';
    node.id = nodeId;
    node.style.left = `${Math.random() * 60 + 20}%`;
    node.style.top = `${Math.random() * 60 + 20}%`;
    node.setAttribute('data-node-id', nodeId);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'New Idea';
    input.maxLength = 50;

    node.appendChild(input);
    canvas.appendChild(node);

    // Make draggable
    makeMindmapNodeDraggable(node);

    // Add click handler for linking
    node.addEventListener('click', (e) => {
        if (mindmapState.linkingMode) {
            handleMindmapNodeClick(nodeId);
        }
    });

    mindmapState.nodes.push({ id: nodeId, element: node });
    showToast('Node added! Drag to reposition');
};

window.addMindmapLink = function () {
    mindmapState.linkingMode = true;
    mindmapState.firstNode = null;

    // Highlight all nodes
    const nodes = document.querySelectorAll('.mindmap-node');
    nodes.forEach(n => n.classList.add('linkable'));

    showToast('🔗 Linking mode: Click first node, then second node');
};

function handleMindmapNodeClick(nodeId) {
    if (!mindmapState.firstNode) {
        // First node selected
        mindmapState.firstNode = nodeId;
        const firstElement = document.getElementById(nodeId);
        if (firstElement) {
            firstElement.classList.add('selected-for-link');
            // Setup drag-to-link
            setupDragToLink(firstElement, nodeId);
        }
        showToast('✓ First node selected. Drag to second node...');
    } else {
        // Second node selected - create link
        const secondNode = nodeId;

        if (mindmapState.firstNode === secondNode) {
            showToast('⚠️ Cannot link node to itself');
            return;
        }

        createMindmapLink(mindmapState.firstNode, secondNode);

        // Reset linking mode
        const nodes = document.querySelectorAll('.mindmap-node');
        nodes.forEach(n => {
            n.classList.remove('linkable');
            n.classList.remove('selected-for-link');
        });

        mindmapState.linkingMode = false;
        mindmapState.firstNode = null;
    }
}

function createMindmapLink(fromId, toId) {
    const canvas = document.getElementById('mindmapCanvas');
    if (!canvas) return;

    // Create SVG layer if it doesn't exist
    let svg = canvas.querySelector('svg.mindmap-links');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('mindmap-links');
        svg.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:1;';
        canvas.insertBefore(svg, canvas.firstChild);
    }

    const fromNode = document.getElementById(fromId);
    const toNode = document.getElementById(toId);

    if (!fromNode || !toNode) return;

    // Create link line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.classList.add('mindmap-link');
    line.setAttribute('data-from', fromId);
    line.setAttribute('data-to', toId);
    line.setAttribute('stroke', '#3498db');
    line.setAttribute('stroke-width', '2');
    line.style.pointerEvents = 'auto';
    line.style.cursor = 'pointer';

    // Add click to delete
    line.addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('Delete this link?')) {
            line.remove();
            mindmapState.links = mindmapState.links.filter(l =>
                !(l.from === fromId && l.to === toId)
            );
        }
    });

    svg.appendChild(line);

    mindmapState.links.push({ from: fromId, to: toId, element: line });

    // Update line position
    updateMindmapLink(line, fromNode, toNode);

    showToast('✓ Link created!');
}

function updateMindmapLink(line, fromNode, toNode) {
    const canvas = document.getElementById('mindmapCanvas');
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const fromRect = fromNode.getBoundingClientRect();
    const toRect = toNode.getBoundingClientRect();

    const x1 = fromRect.left + fromRect.width / 2 - canvasRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - canvasRect.top;
    const x2 = toRect.left + toRect.width / 2 - canvasRect.left;
    const y2 = toRect.top + toRect.height / 2 - canvasRect.top;

    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
}

function makeMindmapNodeDraggable(node) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    node.addEventListener('mousedown', function (e) {
        // Don't drag if clicking input
        if (e.target.tagName === 'INPUT') return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const style = window.getComputedStyle(node);
        initialLeft = parseFloat(style.left);
        initialTop = parseFloat(style.top);

        node.style.zIndex = 100;
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        node.style.left = `${initialLeft + dx}px`;
        node.style.top = `${initialTop + dy}px`;

        // Update all connected links
        updateLinksForNode(node.id);
    });

    document.addEventListener('mouseup', function () {
        if (isDragging) {
            isDragging = false;
            node.style.zIndex = 10;
        }
    });
}

function updateLinksForNode(nodeId) {
    mindmapState.links.forEach(link => {
        if (link.from === nodeId || link.to === nodeId) {
            const fromNode = document.getElementById(link.from);
            const toNode = document.getElementById(link.to);
            if (fromNode && toNode) {
                updateMindmapLink(link.element, fromNode, toNode);
            }
        }
    });
}

window.autoLayoutMindmap = function () {
    const canvas = document.getElementById('mindmapCanvas');
    if (!canvas) return;

    const nodes = Array.from(canvas.querySelectorAll('.mindmap-node'));
    const centerNode = nodes.find(n => n.classList.contains('central'));
    const otherNodes = nodes.filter(n => !n.classList.contains('central'));

    if (!centerNode) return;

    // Position center node
    centerNode.style.left = '50%';
    centerNode.style.top = '50%';
    centerNode.style.transform = 'translate(-50%, -50%)';

    // Arrange other nodes in a circle
    const radius = 200; // pixels
    const angleStep = (2 * Math.PI) / otherNodes.length;

    otherNodes.forEach((node, index) => {
        const angle = index * angleStep;
        const x = 50 + (radius * Math.cos(angle)) / canvas.clientWidth * 100; // Convert to %
        const y = 50 + (radius * Math.sin(angle)) / canvas.clientHeight * 100;

        node.style.left = `${x}%`;
        node.style.top = `${y}%`;
        node.style.transform = 'translate(-50%, -50%)';
    });

    // Update all links
    mindmapState.links.forEach(link => {
        const fromNode = document.getElementById(link.from);
        const toNode = document.getElementById(link.to);
        if (fromNode && toNode) {
            updateMindmapLink(link.element, fromNode, toNode);
        }
    });

    showToast('🎨 Layout organized!');
};

// Initialize mindmap when template is loaded
window.initMindmapTemplate = function () {
    const canvas = document.getElementById('mindmapCanvas');
    if (!canvas) return;

    // Make all existing nodes (including central node) draggable
    const existingNodes = canvas.querySelectorAll('.mindmap-node');
    existingNodes.forEach(node => {
        if (!node.id) {
            node.id = `mindmap-node-${mindmapState.nextNodeId++}`;
        }
        makeMindmapNodeDraggable(node);

        // Add click handler for linking
        node.addEventListener('click', (e) => {
            if (mindmapState.linkingMode) {
                handleMindmapNodeClick(node.id);
            }
        });

        mindmapState.nodes.push({ id: node.id, element: node });
    });

    console.log('Mindmap template initialized - all nodes are draggable');
};

// ==================== OUTLINE TEMPLATE FUNCTIONS ====================

// Outline label generators for each level
// Level 1 → Roman numerals, Level 2 → Uppercase, Level 3 → Numbers, Level 4 → Lowercase
const outlineLabelGenerators = {
    1: (index) => {
        const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
            'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
        return romans[index] || `${index + 1}`;
    },
    2: (index) => String.fromCharCode(65 + (index % 26)), // A, B, C, ...
    3: (index) => `${index + 1}`,                          // 1, 2, 3, ...
    4: (index) => String.fromCharCode(97 + (index % 26))   // a, b, c, ...
};

// ---- Helper: find the .outline-item ancestor of a DOM node ----
function findOutlineItem(node) {
    let current = node;
    while (current && current.id !== 'outlineContent') {
        if (current.classList && current.classList.contains('outline-item')) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

// ---- Helper: read / write level from class name ----
function getItemLevel(item) {
    const match = item.className.match(/level-(\d)/);
    return match ? parseInt(match[1]) : 1;
}

function setItemLevel(item, level) {
    // Preserve collapsed state if present
    const isCollapsed = item.classList.contains('outline-collapsed');
    item.className = `outline-item level-${level}`;
    if (isCollapsed) item.classList.add('outline-collapsed');
}

// ---- Helper: get text content excluding the label span ----
function getItemText(item) {
    const label = item.querySelector('.outline-label');
    const toggle = item.querySelector('.outline-toggle-btn');
    let text = '';
    for (let node of item.childNodes) {
        if (node !== label && node !== toggle) {
            text += node.textContent || '';
        }
    }
    return text.trim();
}

// ---- Helper: create a new outline item div ----
function createOutlineItem(level) {
    const item = document.createElement('div');
    item.className = `outline-item level-${level}`;

    const label = document.createElement('span');
    label.className = 'outline-label';
    label.textContent = ''; // Will be set by renumberOutline

    item.appendChild(label);
    item.appendChild(document.createTextNode(' '));

    return item;
}

// ---- Helper: place the caret at the end of an item's text ----
function placeCursorAtEnd(item) {
    const sel = window.getSelection();
    const range = document.createRange();
    const lastChild = item.lastChild;
    if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
        range.setStart(lastChild, lastChild.textContent.length);
        range.collapse(true);
    } else {
        range.selectNodeContents(item);
        range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
}

// ---- Helper: place the caret at the start of an item's text (after label) ----
function placeCursorAtStart(item) {
    const sel = window.getSelection();
    const range = document.createRange();
    const label = item.querySelector('.outline-label');
    // Find the first text node after the label
    let textNode = null;
    for (let node of item.childNodes) {
        if (node !== label && node !== item.querySelector('.outline-toggle-btn')) {
            if (node.nodeType === Node.TEXT_NODE) {
                textNode = node;
                break;
            }
        }
    }
    if (textNode) {
        // Skip leading space
        const startOffset = textNode.textContent.startsWith(' ') ? 1 : 0;
        range.setStart(textNode, startOffset);
        range.collapse(true);
    } else {
        range.selectNodeContents(item);
        range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
}

// ---- Helper: detect if cursor is at the very start of an item ----
function isCursorAtStart(item) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return false;

    const anchorNode = sel.anchorNode;
    const anchorOffset = sel.anchorOffset;
    const label = item.querySelector('.outline-label');
    const toggle = item.querySelector('.outline-toggle-btn');

    // Cursor is on the item div itself at position 0, 1, or 2 (toggle/label are early children)
    if (anchorNode === item && anchorOffset <= 2) return true;

    // Cursor is inside the label or toggle
    if (anchorNode === label || (label && label.contains(anchorNode))) return true;
    if (anchorNode === toggle || (toggle && toggle.contains(anchorNode))) return true;

    // Cursor is in a text node
    if (anchorNode.nodeType === Node.TEXT_NODE) {
        // If item text is empty, cursor is always "at start"
        if (getItemText(item) === '') return true;

        // Cursor at offset 0 in a text node right after the label
        if (anchorOffset === 0) {
            const prev = anchorNode.previousSibling;
            if (!prev || prev === label || prev === toggle ||
                (prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '')) {
                return true;
            }
        }
        // Cursor at offset 1 if the text starts with a space (the space after label)
        if (anchorOffset <= 1 && anchorNode.textContent.match(/^\s/)) {
            const prev = anchorNode.previousSibling;
            if (!prev || prev === label || prev === toggle) {
                return true;
            }
        }
    }

    return false;
}

// ---- Helper: get all outline items as an array ----
function getAllOutlineItems(container) {
    return Array.from(container.querySelectorAll('.outline-item'));
}

// ---- Helper: get the previous visible sibling outline item ----
function getPreviousOutlineItem(item, container) {
    const items = getAllOutlineItems(container);
    const idx = items.indexOf(item);
    if (idx <= 0) return null;
    return items[idx - 1];
}

// ================================================================
//  RENUMBER OUTLINE — counter-array approach
//  Tracks counters per level, resets deeper counters on level change.
// ================================================================
function renumberOutline(container) {
    const items = getAllOutlineItems(container);
    // counters[0] = level1 count, counters[1] = level2, etc.
    const counters = [0, 0, 0, 0];

    items.forEach(item => {
        const level = getItemLevel(item); // 1-4
        const idx = level - 1;            // 0-3

        // Reset all deeper level counters when a higher level is encountered
        for (let d = idx + 1; d < 4; d++) {
            counters[d] = 0;
        }

        // Increment counter for this level
        counters[idx]++;

        // Assign label via generator
        const label = item.querySelector('.outline-label');
        if (label) {
            const generator = outlineLabelGenerators[level];
            label.textContent = generator
                ? generator(counters[idx] - 1) + '.'
                : `${counters[idx]}.`;
        }
    });

    // After renumbering, refresh collapse toggle arrows
    refreshOutlineToggles(container);
}

// ================================================================
//  COLLAPSE / EXPAND — per-item toggle arrows (▶ / ▼)
// ================================================================

/**
 * Checks if an item has "children" — i.e., the next sibling items have a
 * deeper level. Children are all consecutive items with level > this item's
 * level, stopping when a same-or-higher level is hit.
 */
function getOutlineChildren(item, container) {
    const items = getAllOutlineItems(container);
    const idx = items.indexOf(item);
    const level = getItemLevel(item);
    const children = [];

    for (let i = idx + 1; i < items.length; i++) {
        if (getItemLevel(items[i]) > level) {
            children.push(items[i]);
        } else {
            break; // Same or higher level — stop
        }
    }
    return children;
}

/**
 * Add or remove toggle arrows (▶/▼) on items that have children.
 * Called after every renumber.
 */
function refreshOutlineToggles(container) {
    const items = getAllOutlineItems(container);

    items.forEach((item, i) => {
        const level = getItemLevel(item);
        let hasChildren = false;

        // Check if the next item is deeper
        if (i + 1 < items.length && getItemLevel(items[i + 1]) > level) {
            hasChildren = true;
        }

        let toggleBtn = item.querySelector('.outline-toggle-btn');

        if (hasChildren) {
            // Add toggle button if not present
            if (!toggleBtn) {
                toggleBtn = document.createElement('span');
                toggleBtn.className = 'outline-toggle-btn';
                toggleBtn.setAttribute('contenteditable', 'false');
                toggleBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleOutlineItem(item, container);
                });
                // Insert as first child (before label)
                item.insertBefore(toggleBtn, item.firstChild);
            }
            // Set arrow direction based on collapsed state
            const isCollapsed = item.classList.contains('outline-collapsed');
            toggleBtn.textContent = isCollapsed ? '▶' : '▼';
            item.classList.add('has-children');
        } else {
            // Remove toggle if item has no children
            if (toggleBtn) {
                toggleBtn.remove();
            }
            item.classList.remove('has-children', 'outline-collapsed');
        }
    });
}

/**
 * Toggle collapse/expand for a single item.
 */
function toggleOutlineItem(item, container) {
    const isCollapsed = item.classList.contains('outline-collapsed');

    if (isCollapsed) {
        expandOutlineItem(item, container);
    } else {
        collapseOutlineItem(item, container);
    }
}

/**
 * Collapse: hide all children (items with deeper level following this item).
 */
function collapseOutlineItem(item, container) {
    const children = getOutlineChildren(item, container);
    children.forEach(child => {
        child.style.display = 'none';
        child.setAttribute('data-outline-hidden', 'true');
    });
    item.classList.add('outline-collapsed');

    // Update toggle arrow
    const toggleBtn = item.querySelector('.outline-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = '▶';
}

/**
 * Expand: show direct children. If a child is itself collapsed,
 * keep its children hidden (respect nested collapse state).
 */
function expandOutlineItem(item, container) {
    const items = getAllOutlineItems(container);
    const idx = items.indexOf(item);
    const level = getItemLevel(item);

    item.classList.remove('outline-collapsed');

    // Walk through children and show them, but respect nested collapse
    let skipUntilLevel = -1;

    for (let i = idx + 1; i < items.length; i++) {
        const childLevel = getItemLevel(items[i]);

        // Stop when we hit same or higher level than the parent
        if (childLevel <= level) break;

        // If we're skipping because of a nested collapsed parent
        if (skipUntilLevel > 0 && childLevel > skipUntilLevel) {
            // Keep hidden — nested under a collapsed item
            continue;
        }

        // Show this item
        items[i].style.display = '';
        items[i].removeAttribute('data-outline-hidden');
        skipUntilLevel = -1;

        // If this child is itself collapsed, skip its descendants
        if (items[i].classList.contains('outline-collapsed')) {
            skipUntilLevel = childLevel;
        }
    }

    // Update toggle arrow
    const toggleBtn = item.querySelector('.outline-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = '▼';
}

/**
 * Collapse All — collapse every item that has children, hide all non-level-1 items.
 */
window.collapseAllOutline = function () {
    const container = document.getElementById('outlineContent');
    if (!container) return;

    const items = getAllOutlineItems(container);
    items.forEach(item => {
        const level = getItemLevel(item);
        if (level > 1) {
            item.style.display = 'none';
            item.setAttribute('data-outline-hidden', 'true');
        }
        // Mark items with children as collapsed
        const hasChildren = item.classList.contains('has-children');
        if (hasChildren) {
            item.classList.add('outline-collapsed');
            const toggleBtn = item.querySelector('.outline-toggle-btn');
            if (toggleBtn) toggleBtn.textContent = '▶';
        }
    });

    showToast('Collapsed to level 1');
};

/**
 * Expand All — show every item and clear all collapsed states.
 */
window.expandAllOutline = function () {
    const container = document.getElementById('outlineContent');
    if (!container) return;

    const items = getAllOutlineItems(container);
    items.forEach(item => {
        item.style.display = '';
        item.removeAttribute('data-outline-hidden');
        item.classList.remove('outline-collapsed');

        const toggleBtn = item.querySelector('.outline-toggle-btn');
        if (toggleBtn) toggleBtn.textContent = '▼';
    });

    showToast('Expanded all levels');
};

// ================================================================
//  MAIN KEYDOWN HANDLER
// ================================================================
function handleOutlineKeydown(e) {
    const outlineContent = document.getElementById('outlineContent');
    if (!outlineContent) return;

    // Only handle keys inside the outline area
    if (!outlineContent.contains(e.target) && e.target !== outlineContent) return;

    const sel = window.getSelection();
    let currentItem = findOutlineItem(sel.anchorNode);

    // ===== TAB (indent deeper) =====
    if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();

        if (!currentItem) {
            // Create a new item if none exists
            const item = createOutlineItem(1);
            outlineContent.appendChild(item);
            renumberOutline(outlineContent);
            placeCursorAtEnd(item);
            return;
        }

        const level = getItemLevel(currentItem);

        // GUARD: cannot indent past level 4
        if (level >= 4) return;

        // GUARD: first item in outline cannot be indented
        const prevItem = getPreviousOutlineItem(currentItem, outlineContent);
        if (!prevItem) return;

        // GUARD: cannot jump more than 1 level deeper than previous sibling
        // This ensures logical hierarchy — you can't go from level-1 to level-3
        const prevLevel = getItemLevel(prevItem);
        if (level + 1 > prevLevel + 1) return;

        setItemLevel(currentItem, level + 1);
        renumberOutline(outlineContent);
        return;
    }

    // ===== SHIFT+TAB (outdent) =====
    if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();

        if (!currentItem) return;

        const level = getItemLevel(currentItem);
        // GUARD: cannot outdent past level 1
        if (level <= 1) return;

        setItemLevel(currentItem, level - 1);
        renumberOutline(outlineContent);
        return;
    }

    // ===== ENTER (new item at same level, or remove empty item) =====
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();

        if (currentItem) {
            const text = getItemText(currentItem);
            const allItems = getAllOutlineItems(outlineContent);

            // If current item is empty and there are other items, remove it
            if (text === '' && allItems.length > 1) {
                const prevItem = getPreviousOutlineItem(currentItem, outlineContent);
                const nextSibling = currentItem.nextElementSibling;
                currentItem.remove();
                renumberOutline(outlineContent);

                // Focus the previous item, or the next one if no previous
                if (prevItem) {
                    placeCursorAtEnd(prevItem);
                } else if (nextSibling && nextSibling.classList.contains('outline-item')) {
                    placeCursorAtStart(nextSibling);
                }
                return;
            }

            // Normal case: insert new item at same level after current
            const level = getItemLevel(currentItem);
            const newItem = createOutlineItem(level);
            currentItem.parentNode.insertBefore(newItem, currentItem.nextSibling);
            renumberOutline(outlineContent);
            placeCursorAtEnd(newItem);
        } else {
            // No current item — create a level-1 item
            const newItem = createOutlineItem(1);
            outlineContent.appendChild(newItem);
            renumberOutline(outlineContent);
            placeCursorAtEnd(newItem);
        }
        return;
    }

    // ===== BACKSPACE (smart outdent at start of line) =====
    if (e.key === 'Backspace') {
        if (!currentItem) return;

        if (isCursorAtStart(currentItem)) {
            const level = getItemLevel(currentItem);
            const text = getItemText(currentItem);

            if (level > 1) {
                // Outdent: move up one level (same as Shift+Tab)
                e.preventDefault();
                e.stopImmediatePropagation();
                setItemLevel(currentItem, level - 1);
                renumberOutline(outlineContent);
            } else if (text === '' && getAllOutlineItems(outlineContent).length > 1) {
                // Level 1 with empty text: remove the item
                e.preventDefault();
                e.stopImmediatePropagation();
                const prevItem = getPreviousOutlineItem(currentItem, outlineContent);
                currentItem.remove();
                renumberOutline(outlineContent);
                if (prevItem) {
                    placeCursorAtEnd(prevItem);
                }
            }
            // At level 1 with content → allow normal browser backspace (do nothing)
        }
    }
}

// ================================================================
//  INITIALIZATION
// ================================================================
window.initOutlineTemplate = function () {
    const outlineContent = document.getElementById('outlineContent');
    if (!outlineContent) return;

    // Remove any old listener to prevent duplicates
    outlineContent.removeEventListener('keydown', handleOutlineKeydown);
    // Use capture phase to intercept before browser default focus behavior
    outlineContent.addEventListener('keydown', handleOutlineKeydown, true);

    // Initial renumber + toggle refresh
    renumberOutline(outlineContent);

    console.log('Outline template initialized with professional outlining support');
};

// Initialize the application
async function initApp() {
    try {
        // Initialize IndexedDB
        await initDB();

        // Load all chapters from database
        chapters = await loadAllChapters();

        // Sort chapters by last edited (most recent first)
        chapters.sort((a, b) => new Date(b.lastEdited) - new Date(a.lastEdited));

        // If no chapters exist, create a default one
        if (chapters.length === 0) {
            createNewChapter();
        } else {
            // Render sidebar with existing chapters
            renderSidebar();

            // Load the most recent chapter
            const mostRecent = chapters[0];
            currentId = mostRecent.id;

            // Set page title
            document.getElementById('pageTitle').value = mostRecent.title || 'Untitled';

            // Create content area in sequential stream
            const stream = document.getElementById('sequentialStream');
            stream.innerHTML = '';

            const block = document.createElement('div');
            block.className = 'sequence-editor-block active-focus';
            block.id = `page-block-${mostRecent.id}`;

            const contentArea = document.createElement('div');
            contentArea.className = 'content-area';
            contentArea.contentEditable = 'true';
            contentArea.innerHTML = mostRecent.content || '<p>Start typing...</p>';
            contentArea.oninput = () => {
                markUnsaved();
                saveCurrentToCloud();
            };

            block.appendChild(contentArea);
            stream.appendChild(block);

            // Update tool visibility based on chapter discipline
            updateToolVisibility(mostRecent);
        }

        // Setup drag and drop for images
        setupDragAndDrop();

        // Update storage quota display
        updateStorageQuota();

        // Render the user profile widget in the sidebar
        renderUserProfile();

        // Check if user just cloned a note from the library
        await checkPendingClone();

        // Initialize My References system
        await initMyReferences();

        // Set default paper texture (Grid)
        const paper = document.getElementById('paper');
        if (paper && !paper.className.includes('-texture')) {
            paper.classList.add('grid-texture');
        }

        // Add event listener for selection changes
        document.addEventListener('selectionchange', () => {
            saveSelection();
            handleSelectionChange();
        });

        // Event delegation for checkbox toggles in stream
        document.getElementById('sequentialStream').addEventListener('click', function (e) {
            if (e.target.classList.contains('checkbox')) {
                e.preventDefault();
                e.target.classList.toggle('checked');
                const wrapper = e.target.parentElement;
                const textDiv = wrapper.nextElementSibling;
                if (textDiv && textDiv.classList.contains('checklist-text')) {
                    textDiv.classList.toggle('completed');
                }
                // Trigger save
                const block = e.target.closest('.content-area');
                if (block && block.oninput) block.oninput();
            }
        });

        // Markdown support on stream container
        document.getElementById('sequentialStream').addEventListener('input', handleMarkdownInput);

        // Setup ruler events if ruler exists
        setupRulerEvents();

        // Switch to basic math tab
        switchMathTab('basic');

        // PHASE 1: Initialize Advanced Features
        try {
            initializeAdvancedFeatures();
        } catch (err) {
            console.warn('Some advanced features may not be available:', err.message);
            showToast(`⚠️ ${err.message} - check console for details`);
        }

    } catch (err) {
        console.error('Critical error initializing app:', err);
        showToast('⚠️ Some features may not work correctly');
    }
}

// ========== PHASE 1: ADVANCED FEATURES ==========
let lassoSelector = null;
let shapeRecognizer = null;

function initializeAdvancedFeatures() {
    const failures = [];

    // Initialize Lasso Selection
    try {
        lassoSelector = new LassoSelector();
        lassoSelector.initialize();
        console.log('✅ Lasso Selection initialized');
    } catch (err) {
        console.error('❌ Lasso Selection failed:', err);
        failures.push('Lasso Selection');
    }

    // Initialize Shape Recognition
    try {
        shapeRecognizer = new ShapeRecognizer();
        shapeRecognizer.initialize();
        shapeRecognizer.setSensitivity('moderate');
        console.log('✅ Shape Recognition initialized');
    } catch (err) {
        console.error('❌ Shape Recognition failed:', err);
        failures.push('Shape Recognition');
    }

    // Initialize Page Details Gesture
    try {
        const pageDetailsGesture = new PageDetailsGesture();
        pageDetailsGesture.initialize();
        console.log('✅ Page Details Gesture initialized');
    } catch (err) {
        console.error('❌ Page Details Gesture failed:', err);
        failures.push('Page Details Gesture');
    }

    if (failures.length > 0) {
        console.warn(`⚠️ Some features unavailable: ${failures.join(', ')}`);
        // Don't throw — let Phase 2 and Phase 3 still initialize
    } else {
        console.log('✅ All Phase 1 Advanced Features initialized successfully');
    }
}

function toggleLassoSelection() {
    if (!lassoSelector) {
        showToast('Lasso tool not available');
        return;
    }

    // Exit sketch mode if active (mutual exclusion)
    if (typeof isSketchMode !== 'undefined' && isSketchMode) {
        if (typeof toggleSketchMode === 'function') toggleSketchMode();
    }

    const isActive = lassoSelector.toggleLassoMode();
    const btn = document.getElementById('lassoBtn');
    if (btn) btn.classList.toggle('active', isActive);

    showToast(isActive ? 'Lasso Selection Active — Draw to select elements' : 'Lasso Selection Disabled');
}

function toggleShapeRecognition() {
    if (!shapeRecognizer) {
        showToast('Shape recognition not available');
        return;
    }

    shapeRecognizer.isEnabled = !shapeRecognizer.isEnabled;
    const btn = document.getElementById('shapeRecBtn');

    if (shapeRecognizer.isEnabled) {
        btn.style.background = '#9b59b6';
        btn.style.color = 'white';
        showToast('Shape Recognition ON - Draw shapes to auto-correct');

        // Connect shape recognition to drawing system
        connectShapeRecognition();
    } else {
        btn.style.background = '';
        btn.style.color = '';
        showToast('Shape Recognition OFF');
    }
}

function connectShapeRecognition() {
    // This function will integrate shape recognition with the existing drawing system
    // When a stroke ends, analyze it for shapes

    // Hook into the existing sketch canvas system
    shapeRecognizer.onShapeDetected = (shapeResult) => {
        // When a shape is accepted, draw it on the canvas
        drawPerfectShape(shapeResult);
        showToast(`${shapeResult.type} detected and corrected!`);
    };
}

function drawPerfectShape(shapeResult) {
    // Get the active canvas context
    const canvas = document.querySelector('canvas.active, canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const bounds = shapeResult.params.bounds || shapeResult.params;

    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shapeResult.type === 'circle') {
        const { center, radius } = shapeResult.params;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
    } else if (shapeResult.type === 'rectangle' || shapeResult.type === 'square') {
        const { bounds } = shapeResult.params;
        ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    } else if (shapeResult.type === 'line') {
        const { start, end } = shapeResult.params;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    }
}

// ========== END PHASE 1 ADVANCED FEATURES ==========

// ========== PHASE 2: AUDIO RECORDING ==========
let audioRecorder = null;

// Update initializeAdvancedFeatures to include audio recorder
const originalInitAdvanced = initializeAdvancedFeatures;
initializeAdvancedFeatures = function () {
    // Run Phase 1 — but don't let its throws block Phase 2
    try { originalInitAdvanced(); } catch (e) { /* Phase 1 partial failures already logged */ }

    // Initialize Audio Recorder
    try {
        audioRecorder = new AudioRecorderWidget();
        audioRecorder.initialize();
        console.log('✅ Audio Recorder initialized');
    } catch (err) {
        console.error('Error initializing audio recorder:', err);
    }
};

// toggleAudioRecording: the AudioRecorderWidget class wires #audioRecordBtn
// directly in its own _wireButton() method, so no wrapper needed here.
function toggleAudioRecording() {
    if (audioRecorder) audioRecorder.toggle();
}



// ========== END PHASE 2 AUDIO RECORDING ==========

// ========== PHASE 3: GESTURE FEATURES ==========
let scribbleEraser = null;
let pageDetailsGesture = null;

// Update initializeAdvancedFeatures to include Phase 3
const originalInitAdvanced2 = initializeAdvancedFeatures;
initializeAdvancedFeatures = function () {
    // Run Phase 2 — but don't let its throws block Phase 3
    try { originalInitAdvanced2(); } catch (e) { /* Phase 2 partial failures already logged */ }

    // Initialize Scribble Eraser
    try {
        scribbleEraser = new ScribbleEraser();
        scribbleEraser.initialize();
        scribbleEraser.setSensitivity('medium');
        console.log('✅ Scribble Eraser initialized');
    } catch (err) {
        console.error('Error initializing scribble eraser:', err);
    }

    // Initialize Page Details Gesture
    try {
        pageDetailsGesture = new PageDetailsGesture();
        pageDetailsGesture.initialize();
        console.log('✅ Page Details Gesture initialized');
    } catch (err) {
        console.error('Error initializing page details gesture:', err);
    }
};

// Note: Scribble eraser integrates with existing drawing/sketch system
// It will analyze strokes and automatically trigger erase when scribble detected
// No additional UI buttons needed - it works automatically when enabled

// ========== END PHASE 3 GESTURE FEATURES ==========



initApp();
setTimeout(resizeCanvas, 500);


// ========== AUTO-GENERATED EVENT LISTENERS ==========
document.addEventListener("DOMContentLoaded", function () {
    (function () { var el = document.querySelector('#darkModeToggle'); if (el) el.addEventListener('click', function () { toggleDarkMode() }); })();
    (function () { var el = document.querySelector('#mobileMenuBtn'); if (el) el.addEventListener('click', function () { toggleMobileSidebar() }); })();
    (function () { var el = document.querySelector('#_auto_1'); if (el) el.addEventListener('click', function () { toggleFocusMode() }); })();
    (function () { var el = document.querySelector('#_auto_2'); if (el) el.addEventListener('click', function () { exitFlashcardMode() }); })();
    (function () { var el = document.querySelector('#_auto_3'); if (el) el.addEventListener('click', function () { flipCard() }); })();
    (function () { var el = document.querySelector('#_auto_4'); if (el) el.addEventListener('click', function () { prevCard() }); })();
    (function () { var el = document.querySelector('#_auto_5'); if (el) el.addEventListener('click', function () { nextCard() }); })();
    (function () { var el = document.querySelector('#_auto_6'); if (el) el.addEventListener('click', function () { toggleCircuitComponents() }); })();
    (function () { var el = document.querySelector('#mathBuffer'); if (el) el.addEventListener('input', function () { updateMathPreview() }); })();
    (function () { var el = document.querySelector('#_auto_7'); if (el) el.addEventListener('click', function () { insertMathFromBuffer() }); })();
    (function () { var el = document.querySelector('#_auto_8'); if (el) el.addEventListener('click', function () { toggleMathMode() }); })();
    (function () { var el = document.querySelector('#_auto_9'); if (el) el.addEventListener('click', function () { switchMathTab('basic', this) }); })();
    (function () { var el = document.querySelector('#_auto_10'); if (el) el.addEventListener('click', function () { switchMathTab('trig', this) }); })();
    (function () { var el = document.querySelector('#_auto_11'); if (el) el.addEventListener('click', function () { switchMathTab('calc', this) }); })();
    (function () { var el = document.querySelector('#_auto_12'); if (el) el.addEventListener('click', function () { switchMathTab('geom', this) }); })();
    (function () { var el = document.querySelector('#_auto_13'); if (el) el.addEventListener('click', function () { switchMathTab('struct', this) }); })();
    (function () { var el = document.querySelector('#_auto_14'); if (el) el.addEventListener('click', function () { confirmTraceTable() }); })();
    (function () { var el = document.querySelector('#_auto_15'); if (el) el.addEventListener('click', function () { closeTraceModal() }); })();
    (function () { var el = document.querySelector('#constInput'); if (el) el.addEventListener('input', function () { lookupConstant() }); })();
    (function () { var el = document.querySelector('#_auto_16'); if (el) el.addEventListener('click', function () { confirmConstant() }); })();
    (function () { var el = document.querySelector('#_auto_17'); if (el) el.addEventListener('click', function () { closeConstantModal() }); })();
    (function () { var el = document.querySelector('#_auto_18'); if (el) el.addEventListener('click', function () { renderAnatomyMap('body') }); })();
    (function () { var el = document.querySelector('#_auto_19'); if (el) el.addEventListener('click', function () { renderAnatomyMap('tooth') }); })();
    (function () { var el = document.querySelector('#_auto_20'); if (el) el.addEventListener('click', function () { renderAnatomyMap('brain') }); })();
    (function () { var el = document.querySelector('#_auto_21'); if (el) el.addEventListener('click', function () { closeAnatomyModal() }); })();
    (function () { var el = document.querySelector('#_auto_22'); if (el) el.addEventListener('click', function () { resolvePdfMode('annotate') }); })();
    (function () { var el = document.querySelector('#_auto_23'); if (el) el.addEventListener('click', function () { resolvePdfMode('split') }); })();
    (function () { var el = document.querySelector('#_auto_24'); if (el) el.addEventListener('click', function () { closePdfModeModal() }); })();
    (function () { var el = document.querySelector('#_auto_25'); if (el) el.addEventListener('click', function () { formatText('bold') }); })();
    (function () { var el = document.querySelector('#_auto_26'); if (el) el.addEventListener('click', function () { formatText('italic') }); })();
    (function () { var el = document.querySelector('#_auto_27'); if (el) el.addEventListener('click', function () { formatText('formatBlock', 'h2') }); })();
    (function () { var el = document.querySelector('#_auto_28'); if (el) el.addEventListener('click', function () { formatText('formatBlock', 'h3') }); })();
    (function () { var el = document.querySelector('#_auto_29'); if (el) el.addEventListener('click', function () { formatText('insertUnorderedList') }); })();
    (function () { var el = document.querySelector('#_auto_30'); if (el) el.addEventListener('click', function () { saveToMyReferences() }); })();
    (function () { var el = document.querySelector('#categoryFilter'); if (el) el.addEventListener('change', function () { filterChapters() }); })();
    (function () { var el = document.querySelector('#sidebarSearch'); if (el) el.addEventListener('input', function () { renderSidebar() }); })();
    (function () { var el = document.querySelector('#_auto_31'); if (el) el.addEventListener('click', function () { toggleSection('pagesContent', 'pagesArrow', 'pagesSectionWrapper') }); })();
    (function () { var el = document.querySelector('#_auto_32'); if (el) el.addEventListener('click', function () { toggleSection('tagsContent', 'tagsArrow', 'tagsSectionWrapper') }); })();
    (function () { var el = document.querySelector('#_auto_33'); if (el) el.addEventListener('click', function () { toggleSection('pomodoroContent', 'pomodoroArrow', 'pomodoroSectionWrapper') }); })();
    (function () { var el = document.querySelector('#pomodoroStartBtn'); if (el) el.addEventListener('click', function () { startPomodoro() }); })();
    (function () { var el = document.querySelector('#pomodoroPauseBtn'); if (el) el.addEventListener('click', function () { pausePomodoro() }); })();
    (function () { var el = document.querySelector('#_auto_34'); if (el) el.addEventListener('click', function () { resetPomodoro() }); })();
    (function () { var el = document.querySelector('#dndToggle'); if (el) el.addEventListener('change', function () { updateDndSetting() }); })();
    (function () { var el = document.querySelector('#_auto_35'); if (el) el.addEventListener('click', function () { toggleSection('knowledgeBaseContent', 'knowledgeBaseArrow', 'knowledgeBaseSectionWrapper') }); })();
    (function () { var el = document.querySelector('#_auto_36'); if (el) el.addEventListener('click', function () { toggleSection('myReferencesContent', 'myReferencesArrow', 'myReferencesSectionWrapper') }); })();
    (function () { var el = document.querySelector('#_auto_37'); if (el) el.addEventListener('click', function () { toggleSection('toolsContent', 'toolsArrow') }); })();
    (function () { var el = document.querySelector('#installAppBtn'); if (el) el.addEventListener('click', function () { installPWA() }); })();
    (function () { var el = document.querySelector('#_auto_38'); if (el) el.addEventListener('click', function () { createNewChapter() }); })();
    (function () { var el = document.querySelector('#_auto_39'); if (el) el.addEventListener('click', function () { toggleFocusMode() }); })();
    (function () { var el = document.querySelector('#_auto_40'); if (el) el.addEventListener('click', function () { startFlashcardMode() }); })();
    (function () { var el = document.querySelector('#paperStyleBtn'); if (el) el.addEventListener('click', function () { cyclePaperStyle() }); })();
    (function () { var el = document.querySelector('#_auto_41'); if (el) el.addEventListener('click', function () { shareNote() }); })();
    (function () { var el = document.querySelector('#_auto_42'); if (el) el.addEventListener('click', function () { window.print() }); })();
    (function () { var el = document.querySelector('#readModeBtn'); if (el) el.addEventListener('click', function () { toggleReadMode() }); })();
    (function () { var el = document.querySelector('#_auto_43'); if (el) el.addEventListener('click', function () { openMetadataModal() }); })();
    (function () { var el = document.querySelector('#_auto_44'); if (el) el.addEventListener('change', function () { loadLecturePdf(this) }); })();
    (function () { var el = document.querySelector('#_auto_45'); if (el) el.addEventListener('change', function () { importBackgroundFile(this) }); })();
    (function () { var el = document.querySelector('#sketchToggle'); if (el) el.addEventListener('click', function () { toggleSketchMode() }); })();
    (function () { var el = document.querySelector('#_auto_46'); if (el) el.addEventListener('click', function () { toggleTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_47'); if (el) el.addEventListener('click', function () { exportData() }); })();
    (function () { var el = document.querySelector('#importFile'); if (el) el.addEventListener('change', function () { importData(this) }); })();
    (function () { var el = document.querySelector('#_auto_48'); if (el) el.addEventListener('click', function () { wipeAllData() }); })();
    (function () { var el = document.querySelector('#voiceBtn'); if (el) el.addEventListener('click', function () { toggleVoiceTranscription() }); })();
    (function () { var el = document.querySelector('#handBtn'); if (el) el.addEventListener('click', function () { selectSketchTool('hand') }); })();
    (function () { var el = document.querySelector('#eraserBtn'); if (el) el.addEventListener('click', function () { selectSketchTool('eraser') }); })();
    (function () { var el = document.querySelector('#customColorPicker'); if (el) el.addEventListener('change', function () { setCustomColor(this.value) }); })();
    (function () { var el = document.querySelector('#lassoBtn'); if (el) el.addEventListener('click', function () { toggleLassoSelection() }); })();
    (function () { var el = document.querySelector('#shapeRecBtn'); if (el) el.addEventListener('click', function () { toggleShapeRecognition() }); })();
    (function () { var el = document.querySelector('#audioRecordBtn'); /* wired by AudioRecorderWidget._wireButton() */ })();
    (function () { var el = document.querySelector('#_auto_49'); if (el) el.addEventListener('click', function () { insertBlock('header') }); })();
    (function () { var el = document.querySelector('#_auto_50'); if (el) el.addEventListener('click', function () { insertBlock('note') }); })();
    (function () { var el = document.querySelector('#_auto_51'); if (el) el.addEventListener('click', function () { insertBlock('todo') }); })();
    (function () { var el = document.querySelector('#_auto_52'); if (el) el.addEventListener('click', function () { insertCSCodeBlock() }); })();
    (function () { var el = document.querySelector('#_auto_53'); if (el) el.addEventListener('click', function () { insertAlgoStep() }); })();
    (function () { var el = document.querySelector('#_auto_54'); if (el) el.addEventListener('click', function () { insertComplexity() }); })();
    (function () { var el = document.querySelector('#_auto_55'); if (el) el.addEventListener('click', function () { insertTraceTable() }); })();
    (function () { var el = document.querySelector('#_auto_56'); if (el) el.addEventListener('click', function () { openAnatomyModal() }); })();
    (function () { var el = document.querySelector('#_auto_57'); if (el) el.addEventListener('click', function () { activateAnatomyPin() }); })();
    (function () { var el = document.querySelector('#_auto_58'); if (el) el.addEventListener('click', function () { setHighlightPreset('symptom') }); })();
    (function () { var el = document.querySelector('#_auto_59'); if (el) el.addEventListener('click', function () { setHighlightPreset('drug') }); })();
    (function () { var el = document.querySelector('#_auto_60'); if (el) el.addEventListener('click', function () { insertTimeline() }); })();
    (function () { var el = document.querySelector('#_auto_61'); if (el) el.addEventListener('click', function () { insertComparison() }); })();
    (function () { var el = document.querySelector('#mathModeBtn'); if (el) el.addEventListener('click', function () { toggleMathMode() }); })();
    (function () { var el = document.querySelector('#_auto_62'); if (el) el.addEventListener('click', function () { toggleRuler() }); })();
    (function () { var el = document.querySelector('#_auto_63'); if (el) el.addEventListener('click', function () { insertEquation() }); })();
    (function () { var el = document.querySelector('#_auto_64'); if (el) el.addEventListener('click', function () { insertAssumptions() }); })();
    (function () { var el = document.querySelector('#_auto_65'); if (el) el.addEventListener('click', function () { insertConstants() }); })();
    (function () { var el = document.querySelector('#circuitComponentsBtn'); if (el) el.addEventListener('click', function () { toggleCircuitComponents() }); })();
    (function () { var el = document.querySelector('#stickerBtn'); if (el) el.addEventListener('click', function () { toggleStickerMode() }); })();
    (function () { var el = document.querySelector('#_auto_66'); if (el) el.addEventListener('click', function () { triggerImageUpload() }); })();
    (function () { var el = document.querySelector('#_auto_67'); if (el) el.addEventListener('click', function () { clearSketch() }); })();
    (function () { var el = document.querySelector('#trayToggle'); if (el) el.addEventListener('click', function () { toggleTray() }); })();
    (function () { var el = document.querySelector('#_auto_68'); if (el) el.addEventListener('click', function () { toggleTopTools() }); })();
    (function () { var el = document.querySelector('#_auto_69'); if (el) el.addEventListener('click', function () { selectWritingTool('pen') }); })();
    (function () { var el = document.querySelector('#_auto_70'); if (el) el.addEventListener('click', function () { selectWritingTool('pencil') }); })();
    (function () { var el = document.querySelector('#_auto_71'); if (el) el.addEventListener('click', function () { selectWritingTool('highlighter') }); })();
    (function () { var el = document.querySelector('#_auto_72'); if (el) el.addEventListener('click', function () { selectWritingTool('marker') }); })();
    (function () { var el = document.querySelector('#_auto_73'); if (el) el.addEventListener('click', function () { selectWritingTool('elegant') }); })();
    (function () { var el = document.querySelector('#_auto_74'); if (el) el.addEventListener('click', function () { selectWritingTool('brush') }); })();
    (function () { var el = document.querySelector('#_auto_75'); if (el) el.addEventListener('click', function () { selectWritingTool('chalk') }); })();
    (function () { var el = document.querySelector('#_auto_76'); if (el) el.addEventListener('click', function () { toggleTopTools() }); })();
    (function () { var el = document.querySelector('#_auto_77'); if (el) el.addEventListener('click', function () { undoSketch() }); })();
    (function () { var el = document.querySelector('#_auto_78'); if (el) el.addEventListener('click', function () { redoSketch() }); })();
    (function () { var el = document.querySelector('#imageInput'); if (el) el.addEventListener('change', function (event) { handleImageUpload(event) }); })();
    (function () { var el = document.querySelector('#pageTitle'); if (el) el.addEventListener('input', function () { markUnsaved(); saveCurrentToCloud() }); })();
    (function () { var el = document.querySelector('#_auto_79'); if (el) el.addEventListener('click', function () { addPageToStream() }); })();
    (function () { var el = document.querySelector('#_auto_80'); if (el) el.addEventListener('click', function () { closeLecturePane() }); })();
    (function () { var el = document.querySelector('#metaTagInput'); if (el) el.addEventListener('keydown', function (event) { handleMetaTagInput(event) }); })();
    (function () { var el = document.querySelector('#_auto_81'); if (el) el.addEventListener('click', function () { addTagFromInput() }); })();
    (function () { var el = document.querySelector('#metaType'); if (el) el.addEventListener('change', function () { updatePageMeta() }); })();
    (function () { var el = document.querySelector('#metaSystem'); if (el) el.addEventListener('change', function () { updatePageMeta() }); })();
    (function () { var el = document.querySelector('#metaTooth'); if (el) el.addEventListener('change', function () { updatePageMeta() }); })();
    (function () { var el = document.querySelector('#metaQuadrant'); if (el) el.addEventListener('change', function () { updatePageMeta() }); })();
    (function () { var el = document.querySelector('#metaSpecialty'); if (el) el.addEventListener('change', function () { updatePageMeta() }); })();
    (function () { var el = document.querySelector('#metaEngBranch'); if (el) el.addEventListener('change', function () { updatePageMeta() }); })();
    (function () { var el = document.querySelector('#metaDifficulty'); if (el) el.addEventListener('change', function () { updatePageMeta() }); })();
    (function () { var el = document.querySelector('#_auto_82'); if (el) el.addEventListener('click', function () { closeMetadataModal() }); })();
    (function () { var el = document.querySelector('#_auto_83'); if (el) el.addEventListener('click', function () { showCSTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_84'); if (el) el.addEventListener('click', function () { showMedTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_85'); if (el) el.addEventListener('click', function () { showDentistryTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_86'); if (el) el.addEventListener('click', function () { showEngineeringTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_87'); if (el) el.addEventListener('click', function () { showAdvancedTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_88'); if (el) el.addEventListener('click', function () { applyTemplate('default') }); })();
    (function () { var el = document.querySelector('#_auto_89'); if (el) el.addEventListener('click', function () { applyTemplate('whiteboard') }); })();
    (function () { var el = document.querySelector('#_auto_90'); if (el) el.addEventListener('click', function () { applyTemplate('meeting') }); })();
    (function () { var el = document.querySelector('#_auto_91'); if (el) el.addEventListener('click', function () { applyTemplate('journal') }); })();
    (function () { var el = document.querySelector('#_auto_92'); if (el) el.addEventListener('click', function () { applyTemplate('eisenhower') }); })();
    (function () { var el = document.querySelector('#_auto_93'); if (el) el.addEventListener('click', function () { showMainTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_94'); if (el) el.addEventListener('click', function () { applyTemplate('cornell') }); })();
    (function () { var el = document.querySelector('#_auto_95'); if (el) el.addEventListener('click', function () { applyTemplate('zettelkasten') }); })();
    (function () { var el = document.querySelector('#_auto_96'); if (el) el.addEventListener('click', function () { applyTemplate('outline') }); })();
    (function () { var el = document.querySelector('#_auto_97'); if (el) el.addEventListener('click', function () { applyTemplate('mindmap') }); })();
    (function () { var el = document.querySelector('#_auto_98'); if (el) el.addEventListener('click', function () { applyTemplate('sq3r') }); })();
    (function () { var el = document.querySelector('#_auto_99'); if (el) el.addEventListener('click', function () { applyTemplate('feynman') }); })();
    (function () { var el = document.querySelector('#_auto_100'); if (el) el.addEventListener('click', function () { showMainTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_101'); if (el) el.addEventListener('click', function () { applyTemplate('algo') }); })();
    (function () { var el = document.querySelector('#_auto_102'); if (el) el.addEventListener('click', function () { applyTemplate('logicGates') }); })();
    (function () { var el = document.querySelector('#_auto_103'); if (el) el.addEventListener('click', function () { applyTemplate('sysDesign') }); })();
    (function () { var el = document.querySelector('#_auto_104'); if (el) el.addEventListener('click', function () { applyTemplate('codeStudy') }); })();
    (function () { var el = document.querySelector('#_auto_105'); if (el) el.addEventListener('click', function () { applyTemplate('project') }); })();
    (function () { var el = document.querySelector('#_auto_106'); if (el) el.addEventListener('click', function () { showMainTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_107'); if (el) el.addEventListener('click', function () { applyTemplate('anatomy') }); })();
    (function () { var el = document.querySelector('#_auto_108'); if (el) el.addEventListener('click', function () { applyTemplate('disease') }); })();
    (function () { var el = document.querySelector('#_auto_109'); if (el) el.addEventListener('click', function () { applyTemplate('drug') }); })();
    (function () { var el = document.querySelector('#_auto_110'); if (el) el.addEventListener('click', function () { applyTemplate('physio') }); })();
    (function () { var el = document.querySelector('#_auto_111'); if (el) el.addEventListener('click', function () { applyTemplate('pathway') }); })();
    (function () { var el = document.querySelector('#_auto_112'); if (el) el.addEventListener('click', function () { applyTemplate('lab') }); })();
    (function () { var el = document.querySelector('#_auto_113'); if (el) el.addEventListener('click', function () { showMainTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_114'); if (el) el.addEventListener('click', function () { applyTemplate('dental_anatomy') }); })();
    (function () { var el = document.querySelector('#_auto_115'); if (el) el.addEventListener('click', function () { applyTemplate('oral_pathology') }); })();
    (function () { var el = document.querySelector('#_auto_116'); if (el) el.addEventListener('click', function () { applyTemplate('dental_procedure') }); })();
    (function () { var el = document.querySelector('#_auto_117'); if (el) el.addEventListener('click', function () { applyTemplate('dental_case') }); })();
    (function () { var el = document.querySelector('#_auto_118'); if (el) el.addEventListener('click', function () { applyTemplate('prostho_plan') }); })();
    (function () { var el = document.querySelector('#_auto_119'); if (el) el.addEventListener('click', function () { applyTemplate('endo_case') }); })();
    (function () { var el = document.querySelector('#_auto_120'); if (el) el.addEventListener('click', function () { applyTemplate('perio_case') }); })();
    (function () { var el = document.querySelector('#_auto_121'); if (el) el.addEventListener('click', function () { applyTemplate('oral_radiology') }); })();
    (function () { var el = document.querySelector('#_auto_122'); if (el) el.addEventListener('click', function () { showMainTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_123'); if (el) el.addEventListener('click', function () { applyTemplate('prob_sol') }); })();
    (function () { var el = document.querySelector('#_auto_124'); if (el) el.addEventListener('click', function () { applyTemplate('circuit') }); })();
    (function () { var el = document.querySelector('#_auto_125'); if (el) el.addEventListener('click', function () { applyTemplate('mech_sys') }); })();
    (function () { var el = document.querySelector('#_auto_126'); if (el) el.addEventListener('click', function () { applyTemplate('struct') }); })();
    (function () { var el = document.querySelector('#_auto_127'); if (el) el.addEventListener('click', function () { applyTemplate('control') }); })();
    (function () { var el = document.querySelector('#_auto_128'); if (el) el.addEventListener('click', function () { applyTemplate('process') }); })();
    (function () { var el = document.querySelector('#_auto_129'); if (el) el.addEventListener('click', function () { applyTemplate('lab_exp') }); })();
    (function () { var el = document.querySelector('#_auto_130'); if (el) el.addEventListener('click', function () { toggleTemplates() }); })();
    (function () { var el = document.querySelector('#_auto_131'); if (el) el.addEventListener('click', function () { exitDnd() }); })();
    (function () { var el = document.querySelector('#_auto_132'); if (el) el.addEventListener('click', function () { closeRefModal() }); })();
});