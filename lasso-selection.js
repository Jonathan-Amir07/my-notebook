/**
 * Lasso Selection Tool
 * Enables freehand selection of multiple elements with drag-to-move functionality
 */

class LassoSelector {
    constructor() {
        this.isActive = false;
        this.isDrawing = false;
        this.lassoPoints = [];
        this.selectedElements = [];
        this.lassoCanvas = null;
        this.lassoCtx = null;
        this.selectionOverlay = null;
        this.isDragging = false;
        this.dragStartPos = { x: 0, y: 0 };
        this.elementStartPositions = [];
    }

    initialize() {
        // Create lasso canvas overlay
        this.lassoCanvas = document.createElement('canvas');
        this.lassoCanvas.id = 'lassoCanvas';
        this.lassoCanvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 9999;
            display: none;
        `;
        document.body.appendChild(this.lassoCanvas);
        this.lassoCtx = this.lassoCanvas.getContext('2d');

        // Create selection overlay for visual feedback
        this.selectionOverlay = document.createElement('div');
        this.selectionOverlay.id = 'selectionOverlay';
        this.selectionOverlay.style.cssText = `
            position: absolute;
            border: 2px dashed #3498db;
            background: rgba(52, 152, 219, 0.1);
            pointer-events: none;
            display: none;
            z-index: 9998;
            animation: dash-animation 0.5s linear infinite;
        `;
        document.body.appendChild(this.selectionOverlay);

        // Add animation for dashed border
        if (!document.getElementById('lasso-styles')) {
            const style = document.createElement('style');
            style.id = 'lasso-styles';
            style.textContent = `
                @keyframes dash-animation {
                    to {
                        stroke-dashoffset: -20;
                    }
                }
                .lasso-selected {
                    outline: 2px solid #3498db !important;
                    outline-offset: 2px;
                }
            `;
            document.head.appendChild(style);
        }

        this.updateCanvasSize();
        window.addEventListener('resize', () => this.updateCanvasSize());
    }

    updateCanvasSize() {
        this.lassoCanvas.width = window.innerWidth;
        this.lassoCanvas.height = window.innerHeight;
    }

    toggleLassoMode() {
        this.isActive = !this.isActive;

        if (this.isActive) {
            this.attachEventListeners();
            this.lassoCanvas.style.display = 'block';
            this.lassoCanvas.style.pointerEvents = 'auto';
            document.body.style.cursor = 'crosshair';
        } else {
            this.deactivate();
        }

        return this.isActive;
    }

    deactivate() {
        this.detachEventListeners();
        this.clearSelection();
        this.lassoCanvas.style.display = 'none';
        this.lassoCanvas.style.pointerEvents = 'none';
        document.body.style.cursor = 'default';
        this.isActive = false;
    }

    attachEventListeners() {
        this.lassoCanvas.addEventListener('mousedown', this.handleStart.bind(this));
        this.lassoCanvas.addEventListener('mousemove', this.handleMove.bind(this));
        this.lassoCanvas.addEventListener('mouseup', this.handleEnd.bind(this));

        this.lassoCanvas.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });
        this.lassoCanvas.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
        this.lassoCanvas.addEventListener('touchend', this.handleEnd.bind(this));
    }

    detachEventListeners() {
        this.lassoCanvas.removeEventListener('mousedown', this.handleStart.bind(this));
        this.lassoCanvas.removeEventListener('mousemove', this.handleMove.bind(this));
        this.lassoCanvas.removeEventListener('mouseup', this.handleEnd.bind(this));

        this.lassoCanvas.removeEventListener('touchstart', this.handleStart.bind(this));
        this.lassoCanvas.removeEventListener('touchmove', this.handleMove.bind(this));
        this.lassoCanvas.removeEventListener('touchend', this.handleEnd.bind(this));
    }

    handleStart(e) {
        e.preventDefault();
        const point = this.getEventPoint(e);

        // Check if clicking on existing selection to drag
        if (this.selectedElements.length > 0 && this.isPointInSelection(point)) {
            this.startDragging(point);
            return;
        }

        // Start new lasso selection
        this.isDrawing = true;
        this.lassoPoints = [point];
        this.clearSelection();
    }

    handleMove(e) {
        e.preventDefault();
        const point = this.getEventPoint(e);

        if (this.isDragging) {
            this.dragSelection(point);
            return;
        }

        if (!this.isDrawing) return;

        this.lassoPoints.push(point);
        this.drawLasso();
    }

    handleEnd(e) {
        e.preventDefault();

        if (this.isDragging) {
            this.endDragging();
            return;
        }

        if (!this.isDrawing) return;

        this.isDrawing = false;
        this.closeLasso();
        this.detectSelectedElements();
        this.lassoPoints = [];
        this.clearLassoCanvas();
    }

    getEventPoint(e) {
        const rect = this.lassoCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    drawLasso() {
        this.clearLassoCanvas();

        if (this.lassoPoints.length < 2) return;

        this.lassoCtx.beginPath();
        this.lassoCtx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);

        for (let i = 1; i < this.lassoPoints.length; i++) {
            this.lassoCtx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
        }

        this.lassoCtx.strokeStyle = '#3498db';
        this.lassoCtx.lineWidth = 2;
        this.lassoCtx.setLineDash([5, 5]);
        this.lassoCtx.stroke();
    }

    closeLasso() {
        if (this.lassoPoints.length < 3) return;

        this.lassoCtx.beginPath();
        this.lassoCtx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);

        for (let i = 1; i < this.lassoPoints.length; i++) {
            this.lassoCtx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
        }

        this.lassoCtx.closePath();
        this.lassoCtx.fillStyle = 'rgba(52, 152, 219, 0.1)';
        this.lassoCtx.fill();
        this.lassoCtx.strokeStyle = '#3498db';
        this.lassoCtx.lineWidth = 2;
        this.lassoCtx.stroke();
    }

    clearLassoCanvas() {
        this.lassoCtx.clearRect(0, 0, this.lassoCanvas.width, this.lassoCanvas.height);
    }

    detectSelectedElements() {
        this.selectedElements = [];

        // Get all selectable elements on the page
        const currentPaper = document.querySelector('.paper.active, .stream-paper');
        if (!currentPaper) return;

        const selectableElements = currentPaper.querySelectorAll(`
            img,
            .math-equation,
            .code-block,
            .sticky-note,
            .text-box,
            .circuit-component,
            .logic-gate,
            .mindmap-node,
            [contenteditable="true"]
        `);

        selectableElements.forEach(element => {
            if (this.isElementInLasso(element)) {
                this.selectedElements.push(element);
                element.classList.add('lasso-selected');
            }
        });

        if (this.selectedElements.length > 0) {
            this.updateSelectionOverlay();
            console.log(`Selected ${this.selectedElements.length} element(s)`);
        }
    }

    isElementInLasso(element) {
        const rect = element.getBoundingClientRect();
        const canvasRect = this.lassoCanvas.getBoundingClientRect();

        // Check if element's center point is inside lasso
        const centerX = rect.left + rect.width / 2 - canvasRect.left;
        const centerY = rect.top + rect.height / 2 - canvasRect.top;

        return this.isPointInPolygon({ x: centerX, y: centerY }, this.lassoPoints);
    }

    // Point-in-polygon algorithm (ray casting)
    isPointInPolygon(point, polygon) {
        if (polygon.length < 3) return false;

        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }

        return inside;
    }

    isPointInSelection(point) {
        if (this.selectedElements.length === 0) return false;

        return this.selectedElements.some(element => {
            const rect = element.getBoundingClientRect();
            const canvasRect = this.lassoCanvas.getBoundingClientRect();

            const relX = point.x + canvasRect.left;
            const relY = point.y + canvasRect.top;

            return relX >= rect.left && relX <= rect.right &&
                relY >= rect.top && relY <= rect.bottom;
        });
    }

    updateSelectionOverlay() {
        if (this.selectedElements.length === 0) {
            this.selectionOverlay.style.display = 'none';
            return;
        }

        // Calculate bounding box of all selected elements
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        this.selectedElements.forEach(element => {
            const rect = element.getBoundingClientRect();
            minX = Math.min(minX, rect.left);
            minY = Math.min(minY, rect.top);
            maxX = Math.max(maxX, rect.right);
            maxY = Math.max(maxY, rect.bottom);
        });

        this.selectionOverlay.style.left = `${minX}px`;
        this.selectionOverlay.style.top = `${minY}px`;
        this.selectionOverlay.style.width = `${maxX - minX}px`;
        this.selectionOverlay.style.height = `${maxY - minY}px`;
        this.selectionOverlay.style.display = 'block';
    }

    startDragging(point) {
        this.isDragging = true;
        this.dragStartPos = point;

        // Store initial positions of all selected elements
        this.elementStartPositions = this.selectedElements.map(element => {
            const rect = element.getBoundingClientRect();
            return {
                element: element,
                left: rect.left,
                top: rect.top,
                position: element.style.position
            };
        });

        // Ensure elements are positioned absolutely for dragging
        this.selectedElements.forEach(element => {
            if (element.style.position !== 'absolute') {
                element.style.position = 'absolute';
            }
        });

        document.body.style.cursor = 'move';
    }

    dragSelection(point) {
        const deltaX = point.x - this.dragStartPos.x;
        const deltaY = point.y - this.dragStartPos.y;

        this.elementStartPositions.forEach(({ element, left, top }) => {
            element.style.left = `${left + deltaX}px`;
            element.style.top = `${top + deltaY}px`;
        });

        this.updateSelectionOverlay();
    }

    endDragging() {
        this.isDragging = false;
        document.body.style.cursor = 'crosshair';
    }

    clearSelection() {
        this.selectedElements.forEach(element => {
            element.classList.remove('lasso-selected');
        });
        this.selectedElements = [];
        this.selectionOverlay.style.display = 'none';
        this.elementStartPositions = [];
    }

    destroy() {
        this.deactivate();
        if (this.lassoCanvas) this.lassoCanvas.remove();
        if (this.selectionOverlay) this.selectionOverlay.remove();
        const styles = document.getElementById('lasso-styles');
        if (styles) styles.remove();
    }
}

// Export for global use
window.LassoSelector = LassoSelector;
