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

        // Store bound function references for proper event listener management
        this.boundHandleStart = this.handleStart.bind(this);
        this.boundHandleMove = this.handleMove.bind(this);
        this.boundHandleEnd = this.handleEnd.bind(this);
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
        const btn = document.getElementById('lassoBtn');

        if (this.isActive) {
            btn?.classList.add('active');

            // Make lasso canvas visible and interactive
            this.lassoCanvas.style.display = 'block';
            this.lassoCanvas.style.pointerEvents = 'auto';

            // Apply crosshair cursor only to the canvas/paper area
            const canvas = document.getElementById('sequentialStream');
            if (canvas) {
                canvas.style.cursor = 'crosshair';
            }

            this.attachEventListeners();
            console.log('Lasso mode activated');
        } else {
            this.deactivate();
        }

        return this.isActive;
    }

    deactivate() {
        this.isActive = false;
        const btn = document.getElementById('lassoBtn');
        btn?.classList.remove('active');

        // Reset cursor on canvas
        const canvas = document.getElementById('sequentialStream');
        if (canvas) {
            canvas.style.cursor = '';
        }

        this.detachEventListeners();
        this.clearSelection();
        console.log('Lasso mode deactivated');
        this.lassoCanvas.style.display = 'none';
        this.lassoCanvas.style.pointerEvents = 'none';
        document.body.style.cursor = 'default';
    }

    attachEventListeners() {
        this.lassoCanvas.addEventListener('mousedown', this.boundHandleStart);
        this.lassoCanvas.addEventListener('mousemove', this.boundHandleMove);
        this.lassoCanvas.addEventListener('mouseup', this.boundHandleEnd);

        this.lassoCanvas.addEventListener('touchstart', this.boundHandleStart, { passive: false });
        this.lassoCanvas.addEventListener('touchmove', this.boundHandleMove, { passive: false });
        this.lassoCanvas.addEventListener('touchend', this.boundHandleEnd);
    }

    detachEventListeners() {
        this.lassoCanvas.removeEventListener('mousedown', this.boundHandleStart);
        this.lassoCanvas.removeEventListener('mousemove', this.boundHandleMove);
        this.lassoCanvas.removeEventListener('mouseup', this.boundHandleEnd);

        this.lassoCanvas.removeEventListener('touchstart', this.boundHandleStart);
        this.lassoCanvas.removeEventListener('touchmove', this.boundHandleMove);
        this.lassoCanvas.removeEventListener('touchend', this.boundHandleEnd);
    }

    handleStart(e) {
        e.preventDefault();

        // Ignore if clicking on UI elements
        if (e.target.closest('.sidebar, .tool-tray, button, input, select, textarea, a')) {
            console.log('🚫 Ignoring click on UI element');
            return;
        }

        const point = this.getEventPoint(e);

        // Check if clicking on existing selection to drag
        if (this.selectedElements.length > 0 && this.isPointInSelection(point)) {
            console.log('🎯 Starting drag - point in selection!');
            this.startDragging(point);
            return;
        }

        console.log('✏️ Starting new lasso selection');
        // Clear previous selection when starting new one
        this.lassoPoints = [];
        this.clearLassoCanvas();

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
        // Don't clear lasso points or canvas here - keep selection visible for dragging
        // this.lassoPoints = [];
        // this.clearLassoCanvas();
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
        if (!currentPaper) {
            // Fallback to main content area
            const mainStream = document.getElementById('sequentialStream');
            if (!mainStream) return;

            // Select all direct children and common content elements
            const selectableElements = mainStream.querySelectorAll(`
                div, p, span, h1, h2, h3, h4, h5, h6,
                img, svg, canvas,
                ul, ol, li,
                table, tr, td, th,
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
        } else {
            const selectableElements = currentPaper.querySelectorAll(`
                div, p, span, h1, h2, h3, h4, h5, h6,
                img, svg, canvas,
                ul, ol, li,
                table, tr, td, th,
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
        }

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
        if (this.selectedElements.length === 0) {
            console.log('❌ No selected elements');
            return false;
        }

        const canvasRect = this.lassoCanvas.getBoundingClientRect();

        // Convert point (relative to canvas) to viewport coordinates
        const viewportX = point.x + canvasRect.left;
        const viewportY = point.y + canvasRect.top;

        console.log('🔍 Checking point:', {
            canvasPoint: point,
            viewport: { x: viewportX, y: viewportY },
            canvasRect,
            selectedCount: this.selectedElements.length
        });

        const result = this.selectedElements.some((element, index) => {
            const rect = element.getBoundingClientRect();

            const isInside = viewportX >= rect.left && viewportX <= rect.right &&
                viewportY >= rect.top && viewportY <= rect.bottom;

            console.log(`  Element ${index}:`, {
                rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                isInside
            });

            return isInside;
        });

        console.log('🎯 Result:', result ? 'INSIDE selection' : 'OUTSIDE selection');
        return result;
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

        // Reset cursor on canvas
        const canvas = document.getElementById('sequentialStream');
        if (canvas) {
            canvas.style.cursor = 'crosshair';
        }

        // Clear the lasso visual after dragging is complete
        this.lassoPoints = [];
        this.clearLassoCanvas();
        console.log('✅ Drag complete - lasso cleared');
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
