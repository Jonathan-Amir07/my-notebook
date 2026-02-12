/**
 * Zoom Manager
 * Pinch-to-zoom and pan functionality for papers
 */

class ZoomManager {
    constructor() {
        this.currentZoom = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 3.0;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.currentPan = { x: 0, y: 0 };
        this.zoomTarget = null;
        this.zoomIndicator = null;
        this.touchDistance = 0;
        this.isActive = false;
    }

    initialize() {
        this.createZoomIndicator();
        this.createZoomControls();
    }

    createZoomIndicator() {
        this.zoomIndicator = document.createElement('div');
        this.zoomIndicator.id = 'zoomIndicator';
        this.zoomIndicator.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            background: rgba(44, 62, 80, 0.9);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
            display: none;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: 'Fira Code', monospace;
        `;
        document.body.appendChild(this.zoomIndicator);
    }

    createZoomControls() {
        const controls = document.createElement('div');
        controls.id = 'zoomControls';
        controls.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 9999;
        `;

        const buttonStyle = `
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(44, 62, 80, 0.9);
            color: white;
            border: none;
            font-size: 1.4rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: all 0.2s;
        `;

        const zoomInBtn = document.createElement('button');
        zoomInBtn.innerHTML = '+';
        zoomInBtn.style.cssText = buttonStyle;
        zoomInBtn.title = 'Zoom In';
        zoomInBtn.addEventListener('click', () => this.zoomIn());

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.innerHTML = '−';
        zoomOutBtn.style.cssText = buttonStyle;
        zoomOutBtn.title = 'Zoom Out';
        zoomOutBtn.addEventListener('click', () => this.zoomOut());

        const zoomResetBtn = document.createElement('button');
        zoomResetBtn.innerHTML = '⟲';
        zoomResetBtn.style.cssText = buttonStyle;
        zoomResetBtn.title = 'Reset Zoom';
        zoomResetBtn.addEventListener('click', () => this.resetZoom());

        controls.appendChild(zoomInBtn);
        controls.appendChild(zoomOutBtn);
        controls.appendChild(zoomResetBtn);

        document.body.appendChild(controls);

        // Add hover effects
        const style = document.createElement('style');
        style.textContent = `
            #zoomControls button:hover {
                background: rgba(52, 73, 94, 1);
                transform: scale(1.1);
            }
            #zoomControls button:active {
                transform: scale(0.95);
            }
        `;
        document.head.appendChild(style);
    }

    enableZoomForElement(element) {
        this.zoomTarget = element;
        this.isActive = true;

        // Ensure element is positioned for transforms
        if (window.getComputedStyle(element).position === 'static') {
            element.style.position = 'relative';
        }

        // Add transform origin
        element.style.transformOrigin = '0 0';

        // Attach event listeners
        this.attachEventListeners(element);

        return true;
    }

    disableZoom() {
        if (this.zoomTarget) {
            this.detachEventListeners(this.zoomTarget);
            this.resetZoom();
        }
        this.isActive = false;
        this.zoomIndicator.style.display = 'none';
    }

    attachEventListeners(element) {
        // Touch events for pinch-to-zoom
        element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        element.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        element.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Mouse events for pan (when zoomed)
        element.addEventListener('mousedown', this.handleMouseDown.bind(this));
        element.addEventListener('mousemove', this.handleMouseMove.bind(this));
        element.addEventListener('mouseup', this.handleMouseUp.bind(this));
        element.addEventListener('mouseleave', this.handleMouseUp.bind(this));

        // Mouse wheel for zoom
        element.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    }

    detachEventListeners(element) {
        element.removeEventListener('touchstart', this.handleTouchStart.bind(this));
        element.removeEventListener('touchmove', this.handleTouchMove.bind(this));
        element.removeEventListener('touchend', this.handleTouchEnd.bind(this));
        element.removeEventListener('mousedown', this.handleMouseDown.bind(this));
        element.removeEventListener('mousemove', this.handleMouseMove.bind(this));
        element.removeEventListener('mouseup', this.handleMouseUp.bind(this));
        element.removeEventListener('mouseleave', this.handleMouseUp.bind(this));
        element.removeEventListener('wheel', this.handleWheel.bind(this));
    }

    handleTouchStart(e) {
        if (e.touches.length === 2) {
            // Pinch zoom gesture
            e.preventDefault();
            this.touchDistance = this.getTouchDistance(e.touches);
        } else if (e.touches.length === 1 && this.currentZoom > 1.0) {
            // Pan when zoomed
            this.isPanning = true;
            this.panStart = {
                x: e.touches[0].clientX - this.currentPan.x,
                y: e.touches[0].clientY - this.currentPan.y
            };
        }
    }

    handleTouchMove(e) {
        if (e.touches.length === 2) {
            // Pinch zoom
            e.preventDefault();
            const newDistance = this.getTouchDistance(e.touches);
            const scale = newDistance / this.touchDistance;

            const newZoom = this.currentZoom * scale;
            this.setZoom(newZoom);

            this.touchDistance = newDistance;
        } else if (e.touches.length === 1 && this.isPanning) {
            // Pan
            e.preventDefault();
            this.currentPan = {
                x: e.touches[0].clientX - this.panStart.x,
                y: e.touches[0].clientY - this.panStart.y
            };
            this.applyTransform();
        }
    }

    handleTouchEnd(e) {
        if (e.touches.length < 2) {
            this.touchDistance = 0;
        }
        if (e.touches.length === 0) {
            this.isPanning = false;
        }
    }

    handleMouseDown(e) {
        if (this.currentZoom > 1.0) {
            this.isPanning = true;
            this.panStart = {
                x: e.clientX - this.currentPan.x,
                y: e.clientY - this.currentPan.y
            };
            this.zoomTarget.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(e) {
        if (this.isPanning) {
            this.currentPan = {
                x: e.clientX - this.panStart.x,
                y: e.clientY - this.panStart.y
            };
            this.applyTransform();
        } else if (this.currentZoom > 1.0) {
            this.zoomTarget.style.cursor = 'grab';
        }
    }

    handleMouseUp(e) {
        this.isPanning = false;
        if (this.currentZoom > 1.0) {
            this.zoomTarget.style.cursor = 'grab';
        } else {
            this.zoomTarget.style.cursor = 'default';
        }
    }

    handleWheel(e) {
        e.preventDefault();

        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = this.currentZoom + delta;

        this.setZoom(newZoom);
    }

    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    zoomIn() {
        this.setZoom(this.currentZoom + 0.2);
    }

    zoomOut() {
        this.setZoom(this.currentZoom - 0.2);
    }

    setZoom(zoom) {
        // Clamp zoom to min/max
        this.currentZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));

        this.applyTransform();
        this.updateZoomIndicator();
    }

    applyTransform() {
        if (!this.zoomTarget) return;

        const transform = `translate(${this.currentPan.x}px, ${this.currentPan.y}px) scale(${this.currentZoom})`;
        this.zoomTarget.style.transform = transform;
        this.zoomTarget.style.transition = 'transform 0.1s ease-out';
    }

    resetZoom() {
        this.currentZoom = 1.0;
        this.currentPan = { x: 0, y: 0 };
        this.applyTransform();
        this.updateZoomIndicator();

        if (this.zoomTarget) {
            this.zoomTarget.style.cursor = 'default';
        }

        // Hide indicator after reset
        setTimeout(() => {
            if (this.currentZoom === 1.0) {
                this.zoomIndicator.style.display = 'none';
            }
        }, 1000);
    }

    updateZoomIndicator() {
        const percentage = Math.round(this.currentZoom * 100);
        this.zoomIndicator.textContent = `${percentage}%`;
        this.zoomIndicator.style.display = 'block';

        // Auto-hide after 2 seconds if at 100%
        clearTimeout(this.indicatorTimeout);
        this.indicatorTimeout = setTimeout(() => {
            if (this.currentZoom === 1.0) {
                this.zoomIndicator.style.display = 'none';
            }
        }, 2000);
    }

    getZoomLevel() {
        return this.currentZoom;
    }

    getPanOffset() {
        return this.currentPan;
    }

    destroy() {
        this.disableZoom();
        if (this.zoomIndicator) this.zoomIndicator.remove();
        const controls = document.getElementById('zoomControls');
        if (controls) controls.remove();
    }
}

// Export for global use
window.ZoomManager = ZoomManager;
