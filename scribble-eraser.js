/**
 * Scribble to Erase Gesture Detection
 * Detects rapid back-and-forth scribbling motion to trigger erase mode
 */

class ScribbleEraser {
    constructor() {
        this.isEnabled = false;
        this.strokePoints = [];
        this.sensitivity = 'medium'; // 'low', 'medium', 'high'
        this.isErasing = false;
        this.eraseCanvas = null;
        this.eraseCtx = null;
    }

    initialize() {
        this.createEraseCanvas();
    }

    createEraseCanvas() {
        this.eraseCanvas = document.createElement('canvas');
        this.eraseCanvas.id = 'scribbleEraseCanvas';
        this.eraseCanvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 9997;
            display: none;
        `;
        document.body.appendChild(this.eraseCanvas);
        this.eraseCtx = this.eraseCanvas.getContext('2d');
        this.updateCanvasSize();

        window.addEventListener('resize', () => this.updateCanvasSize());
    }

    updateCanvasSize() {
        this.eraseCanvas.width = window.innerWidth;
        this.eraseCanvas.height = window.innerHeight;
    }

    setSensitivity(level) {
        this.sensitivity = level; // 'low', 'medium', 'high'
    }

    analyzeStroke(points) {
        if (!this.isEnabled || points.length < 10) {
            return { isScribble: false };
        }

        // Calculate direction changes
        const directionChanges = this.countDirectionChanges(points);

        // Calculate speed (distance per time)
        const speed = this.calculateSpeed(points);

        // Calculate bounding box size (scribbles are usually compact)
        const bounds = this.getBoundingBox(points);
        const boundingArea = bounds.width * bounds.height;

        // Thresholds based on sensitivity
        const thresholds = {
            low: { dirChanges: 8, speed: 5, maxArea: 15000 },
            medium: { dirChanges: 5, speed: 3, maxArea: 10000 },
            high: { dirChanges: 3, speed: 2, maxArea: 8000 }
        };

        const threshold = thresholds[this.sensitivity];

        const isScribble =
            directionChanges >= threshold.dirChanges &&
            speed >= threshold.speed &&
            boundingArea < threshold.maxArea;

        return {
            isScribble,
            confidence: isScribble ? Math.min(directionChanges / 10, 1) : 0,
            bounds
        };
    }

    countDirectionChanges(points) {
        if (points.length < 3) return 0;

        let changes = 0;
        let prevDirection = null;

        for (let i = 1; i < points.length - 1; i++) {
            const dx1 = points[i].x - points[i - 1].x;
            const dx2 = points[i + 1].x - points[i].x;

            const currentDirection = dx2 > 0 ? 'right' : 'left';

            if (prevDirection && currentDirection !== prevDirection) {
                changes++;
            }

            prevDirection = currentDirection;
        }

        return changes;
    }

    calculateSpeed(points) {
        if (points.length < 2) return 0;

        let totalDistance = 0;
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
        }

        // Rough estimate: assume points collected at ~10ms intervals
        const timeEstimate = points.length * 10;
        return totalDistance / timeEstimate; // pixels per ms
    }

    getBoundingBox(points) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });

        return {
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    eraseInBounds(bounds) {
        // Find all elements within the scribble bounds
        const allElements = document.querySelectorAll(`
            .paper img,
            .paper .math-equation,
            .paper .code-block,
            .paper .sticky-note,
            .paper .text-box,
            .paper [contenteditable="true"]
        `);

        const elementsToErase = [];

        allElements.forEach(element => {
            const rect = element.getBoundingClientRect();

            // Check if element intersects with scribble bounds
            if (this.rectanglesIntersect(bounds, {
                minX: rect.left,
                minY: rect.top,
                maxX: rect.right,
                maxY: rect.bottom
            })) {
                elementsToErase.push(element);
            }
        });

        // Erase elements with animation
        elementsToErase.forEach(element => {
            element.style.transition = 'opacity 0.3s, transform 0.3s';
            element.style.opacity = '0';
            element.style.transform = 'scale(0.5)';

            setTimeout(() => {
                element.remove();
            }, 300);
        });

        if (elementsToErase.length > 0) {
            console.log(`🧼 Erased ${elementsToErase.length} element(s) via scribble`);
            this.showEraseEffect(bounds);
        }

        return elementsToErase.length;
    }

    rectanglesIntersect(rect1, rect2) {
        return !(rect1.maxX < rect2.minX ||
            rect2.maxX < rect1.minX ||
            rect1.maxY < rect2.minY ||
            rect2.maxY < rect1.minY);
    }

    showEraseEffect(bounds) {
        // Show visual feedback
        this.eraseCanvas.style.display = 'block';
        this.eraseCtx.clearRect(0, 0, this.eraseCanvas.width, this.eraseCanvas.height);

        this.eraseCtx.fillStyle = 'rgba(231, 76, 60, 0.2)';
        this.eraseCtx.fillRect(
            bounds.minX,
            bounds.minY,
            bounds.width,
            bounds.height
        );

        setTimeout(() => {
            this.eraseCanvas.style.display = 'none';
        }, 300);
    }

    destroy() {
        if (this.eraseCanvas) {
            this.eraseCanvas.remove();
        }
    }
}

// Export for global use
window.ScribbleEraser = ScribbleEraser;
