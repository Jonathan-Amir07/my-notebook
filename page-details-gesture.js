/**
 * Triple-Tap Gesture for Quick Page Details
 * Detects three quick taps to show page metadata and quick actions
 */

class PageDetailsGesture {
    constructor() {
        this.isEnabled = true;
        this.longPressTimer = null;
        this.touchStartTime = 0;
        this.touchMoved = false;
        this.detailsModal = null;
    }

    initialize() {
        this.createDetailsModal();
        this.attachEventListeners();
    }

    createDetailsModal() {
        this.detailsModal = document.createElement('div');
        this.detailsModal.id = 'pageDetailsModal';
        this.detailsModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.8);
            background: white;
            border-radius: 16px;
            box-shadow: 0 12px 48px rgba(0,0,0,0.4);
            padding: 24px;
            z-index: 10001;
            display: none;
            max-width: 400px;
            opacity: 0;
            transition: opacity 0.2s, transform 0.2s;
        `;

        this.detailsModal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #2c3e50; font-size: 1.4rem;">📄 Page Details</h3>
                <button id="closeDetailsModal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #7f8c8d; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">×</button>
            </div>
            
            <div id="pageDetailsContent" style="margin-bottom: 16px;"></div>
            
            <div style="border-top: 1px solid #ecf0f1; padding-top: 16px;">
                <div style="font-weight: bold; margin-bottom: 10px; color: #7f8c8d; font-size: 0.9rem;">Quick Actions:</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <button onclick="duplicateCurrentPage()" style="padding: 10px; border: none; background: #3498db; color: white; border-radius: 8px; cursor: pointer; font-weight: bold;">
                        📋 Duplicate
                    </button>
                    <button onclick="shareNote()" style="padding: 10px; border: none; background: #2ecc71; color: white; border-radius: 8px; cursor: pointer; font-weight: bold;">
                        📤 Share
                    </button>
                    <button onclick="exportPageData()" style="padding: 10px; border: none; background: #f39c12; color: white; border-radius: 8px; cursor: pointer; font-weight: bold;">
                        💾 Export
                    </button>
                    <button onclick="deleteCurrentPage()" style="padding: 10px; border: none; background: #e74c3c; color: white; border-radius: 8px; cursor: pointer; font-weight: bold;">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.detailsModal);

        // Close button
        document.getElementById('closeDetailsModal').addEventListener('click', () => {
            this.hideModal();
        });

        // Close on outside click
        this.detailsModal.addEventListener('click', (e) => {
            if (e.target === this.detailsModal) {
                this.hideModal();
            }
        });

        // Button hover effects
        const style = document.createElement('style');
        style.textContent = `
            #pageDetailsModal button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
            #pageDetailsModal button:active {
                transform: translateY(0);
            }
            #closeDetailsModal:hover {
                background: #ecf0f1;
            }
        `;
        document.head.appendChild(style);
    }

    attachEventListeners() {
        // Detect if this is a touch device
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        if (isTouchDevice) {
            // On touch devices (like iPad), use long-press (2-second hold)
            document.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
            document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
            document.addEventListener('touchend', (e) => this.handleTouchEnd(e));
            document.addEventListener('touchcancel', (e) => this.handleTouchEnd(e));
        } else {
            // On desktop devices, use Ctrl+Click
            document.addEventListener('click', (e) => this.handleCtrlClick(e));
        }

        console.log('✅ PageDetailsGesture: Event listeners attached (touch device: ' + isTouchDevice + ')');
    }


    handleTouchStart(e) {
        if (!this.isEnabled) return;

        // Ignore touches on UI elements
        if (e.target.closest('button, input, select, textarea, .sidebar, .tool-tray')) {
            return;
        }

        this.touchStartTime = Date.now();
        this.touchMoved = false;

        // Start long-press timer (2 seconds)
        this.longPressTimer = setTimeout(() => {
            if (!this.touchMoved) {
                // Long press detected!
                this.showPageDetails();
                // Provide haptic feedback if available
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
                e.preventDefault();
            }
        }, 2000);
    }

    handleTouchMove(e) {
        // If user moves their finger, cancel the long press
        this.touchMoved = true;
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    handleTouchEnd(e) {
        // Clear the timer if user lifts finger before 2 seconds
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    handleCtrlClick(e) {
        console.log('🔍 Click event received', { ctrl: e.ctrlKey, button: e.button, enabled: this.isEnabled });

        if (!this.isEnabled) return;

        // Check if Ctrl key (or Cmd on Mac) was pressed
        if (!e.ctrlKey && !e.metaKey) return;

        // Check that it's specifically LEFT mouse button (button 0)
        if (e.button !== 0) return;

        // Ignore Ctrl+clicks on UI elements
        if (e.target.closest('button, input, select, textarea, .sidebar, .tool-tray, a')) {
            return;
        }

        // Prevent default behavior
        e.preventDefault();

        // Show page details on Ctrl+Click
        this.showPageDetails();
    }


    showPageDetails() {
        // Find and click the Page Details button in the sidebar
        const buttons = Array.from(document.querySelectorAll('.btn, .btn-secondary'));
        const pageDetailsBtn = buttons.find(btn => btn.textContent && btn.textContent.includes('Page Details'));

        if (pageDetailsBtn) {
            pageDetailsBtn.click();
            console.log('👆 Gesture triggered - Page Details opened');
        } else {
            console.warn('⚠️ Page Details button not found in sidebar');
        }
    }

    getCurrentPageMetadata() {
        // Get active page from the app
        const stream = document.getElementById('sequentialStream');
        const titleInput = document.getElementById('pageTitle');

        const title = titleInput ? titleInput.textContent.trim() || 'Untitled Page' : 'Untitled Page';

        // Count words
        const text = stream ? stream.textContent : '';
        const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;

        // Count elements
        const elements = stream ? stream.querySelectorAll('img, .math-equation, .code-block, .sticky-note, .text-box') : [];
        const elementCount = elements.length;

        // Count images
        const images = stream ? stream.querySelectorAll('img') : [];
        const imageCount = images.length;

        // Get dates (from current chapter if available)
        const now = new Date();
        const created = now.toLocaleDateString();
        const modified = now.toLocaleDateString();

        // Get tags (if any)
        const tags = [];
        const tagElements = document.querySelectorAll('.tag-chip');
        tagElements.forEach(el => {
            const tagText = el.textContent.replace('×', '').trim();
            if (tagText) tags.push(tagText);
        });

        // Get template type (if any)
        const template = 'Default';

        return {
            title,
            created,
            modified,
            wordCount,
            elementCount,
            imageCount,
            tags,
            template
        };
    }

    hideModal() {
        this.detailsModal.style.opacity = '0';
        this.detailsModal.style.transform = 'translate(-50%, -50%) scale(0.8)';

        setTimeout(() => {
            this.detailsModal.style.display = 'none';
        }, 200);
    }

    destroy() {
        if (this.detailsModal) {
            this.detailsModal.remove();
        }
    }
}

// Export for global use
window.PageDetailsGesture = PageDetailsGesture;
