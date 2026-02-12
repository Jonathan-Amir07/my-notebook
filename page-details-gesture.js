/**
 * Triple-Tap Gesture for Quick Page Details
 * Detects three quick taps to show page metadata and quick actions
 */

class PageDetailsGesture {
    constructor() {
        this.isEnabled = true;
        this.tapTimes = [];
        this.maxTapInterval = 500; // ms between taps
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
        document.addEventListener('click', (e) => this.handleTap(e));
        document.addEventListener('touchstart', (e) => this.handleTap(e));
    }

    handleTap(event) {
        if (!this.isEnabled) return;

        // Ignore taps on UI elements
        if (event.target.closest('button, input, select, textarea, .sidebar, .tool-tray')) {
            return;
        }

        const now = Date.now();
        this.tapTimes.push(now);

        // Keep only last 3 taps
        if (this.tapTimes.length > 3) {
            this.tapTimes.shift();
        }

        // Check if we have 3 taps within the interval
        if (this.tapTimes.length === 3) {
            const firstTap = this.tapTimes[0];
            const lastTap = this.tapTimes[2];

            if (lastTap - firstTap < this.maxTapInterval * 2) {
                // Triple tap detected!
                this.showPageDetails();
                this.tapTimes = []; // Reset
                event.preventDefault();
            }
        }
    }

    showPageDetails() {
        // Get current page metadata
        const metadata = this.getCurrentPageMetadata();

        // Populate modal
        const content = document.getElementById('pageDetailsContent');
        content.innerHTML = `
            <div style="display: grid; gap: 12px;">
                <div style="background: #ecf0f1; padding: 12px; border-radius: 8px;">
                    <div style="font-weight: bold; color: #7f8c8d; font-size: 0.85rem; margin-bottom: 4px;">Title</div>
                    <div style="color: #2c3e50; font-size: 1.1rem;">${metadata.title}</div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div style="background: #ecf0f1; padding: 12px; border-radius: 8px;">
                        <div style="font-weight: bold; color: #7f8c8d; font-size: 0.85rem; margin-bottom: 4px;">Created</div>
                        <div style="color: #2c3e50;">${metadata.created}</div>
                    </div>
                    <div style="background: #ecf0f1; padding: 12px; border-radius: 8px;">
                        <div style="font-weight: bold; color: #7f8c8d; font-size: 0.85rem; margin-bottom: 4px;">Modified</div>
                        <div style="color: #2c3e50;">${metadata.modified}</div>
                    </div>
                </div>

                <div style="background: #ecf0f1; padding: 12px; border-radius: 8px;">
                    <div style="font-weight: bold; color: #7f8c8d; font-size: 0.85rem; margin-bottom: 4px;">Statistics</div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px;">
                        <div style="text-align: center;">
                            <div style="font-size: 1.5rem; font-weight: bold; color: #3498db;">${metadata.wordCount}</div>
                            <div style="font-size: 0.75rem; color: #7f8c8d;">Words</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.5rem; font-weight: bold; color: #2ecc71;">${metadata.elementCount}</div>
                            <div style="font-size: 0.75rem; color: #7f8c8d;">Elements</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.5rem; font-weight: bold; color: #e74c3c;">${metadata.imageCount}</div>
                            <div style="font-size: 0.75rem; color: #7f8c8d;">Images</div>
                        </div>
                    </div>
                </div>

                ${metadata.tags.length > 0 ? `
                    <div style="background: #ecf0f1; padding: 12px; border-radius: 8px;">
                        <div style="font-weight: bold; color: #7f8c8d; font-size: 0.85rem; margin-bottom: 8px;">Tags</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                            ${metadata.tags.map(tag => `
                                <span style="background: #3498db; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem;">
                                    #${tag}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${metadata.template ? `
                    <div style="background: #ecf0f1; padding: 12px; border-radius: 8px;">
                        <div style="font-weight: bold; color: #7f8c8d; font-size: 0.85rem; margin-bottom: 4px;">Template</div>
                        <div style="color: #2c3e50;">${metadata.template}</div>
                    </div>
                ` : ''}
            </div>
        `;

        // Show modal with animation
        this.detailsModal.style.display = 'block';
        setTimeout(() => {
            this.detailsModal.style.opacity = '1';
            this.detailsModal.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 10);

        console.log('👆 Triple-tap detected - showing page details');
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
