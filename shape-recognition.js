/**
 * Shape Recognition Engine
 * Automatically detects and corrects hand-drawn shapes (Apple Notes style)
 */

class ShapeRecognizer {
    constructor() {
        this.isEnabled = false;
        this.currentStroke = [];
        this.sensitivity = 'moderate'; // 'strict', 'moderate', 'relaxed'
        this.minPoints = 10;
        this.suggestionModal = null;
        this.onShapeDetected = null;
    }

    initialize() {
        this.createSuggestionModal();
    }

    createSuggestionModal() {
        this.suggestionModal = document.createElement('div');
        this.suggestionModal.id = 'shapeRecognitionModal';
        this.suggestionModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            padding: 24px;
            z-index: 10000;
            display: none;
            max-width: 400px;
            font-family: 'Patrick Hand', cursive;
        `;

        this.suggestionModal.innerHTML = `
            <h3 style="margin: 0 0 16px 0; font-size: 1.3rem; color: #2c3e50;">Shape Detected</h3>
            <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                <div style="flex: 1; text-align: center;">
                    <p style="margin: 0 0 8px 0; font-size: 0.9rem; color: #7f8c8d;">Original</p>
                    <canvas id="originalShapeCanvas" width="150" height="150" 
                        style="border: 2px solid #ecf0f1; border-radius: 8px;"></canvas>
                </div>
                <div style="flex: 1; text-align: center;">
                    <p style="margin: 0 0 8px 0; font-size: 0.9rem; color: #7f8c8d;">Suggested</p>
                    <canvas id="suggestedShapeCanvas" width="150" height="150" 
                        style="border: 2px solid #3498db; border-radius: 8px;"></canvas>
                </div>
            </div>
            <div id="shapeTypeLabel" style="text-align: center; margin-bottom: 16px; 
                font-size: 1.1rem; color: #3498db; font-weight: bold;"></div>
            <div style="display: flex; gap: 12px;">
                <button id="acceptShapeBtn" style="flex: 1; padding: 12px; border: none; 
                    background: #3498db; color: white; border-radius: 8px; font-size: 1rem; 
                    cursor: pointer; font-family: 'Patrick Hand', cursive; font-weight: bold;">
                    ✓ Accept
                </button>
                <button id="rejectShapeBtn" style="flex: 1; padding: 12px; border: none; 
                    background: #ecf0f1; color: #2c3e50; border-radius: 8px; font-size: 1rem; 
                    cursor: pointer; font-family: 'Patrick Hand', cursive; font-weight: bold;">
                    ✗ Keep Original
                </button>
            </div>
        `;

        document.body.appendChild(this.suggestionModal);

        // Add event listeners
        document.getElementById('acceptShapeBtn').addEventListener('click', () => {
            this.acceptSuggestion();
        });

        document.getElementById('rejectShapeBtn').addEventListener('click', () => {
            this.rejectSuggestion();
        });

        // Add button hover effects
        const style = document.createElement('style');
        style.textContent = `
            #acceptShapeBtn:hover {
                background: #2980b9;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(52, 152, 219, 0.4);
            }
            #rejectShapeBtn:hover {
                background: #d5dbdb;
                transform: translateY(-2px);
            }
        `;
        document.head.appendChild(style);
    }

    setSensitivity(level) {
        this.sensitivity = level; // 'strict', 'moderate', 'relaxed'
    }

    analyzeStroke(points) {
        if (!this.isEnabled || points.length < this.minPoints) {
            return null;
        }

        this.currentStroke = points;

        // Try to detect shapes in order of complexity
        const circleResult = this.detectCircle(points);
        if (circleResult) return circleResult;

        const rectangleResult = this.detectRectangle(points);
        if (rectangleResult) return rectangleResult;

        const lineResult = this.detectLine(points);
        if (lineResult) return lineResult;

        return null;
    }

    detectCircle(points) {
        // Calculate center of mass
        const center = this.getCentroid(points);

        // Calculate average distance from center (radius)
        let totalDistance = 0;
        points.forEach(p => {
            totalDistance += this.distance(p, center);
        });
        const avgRadius = totalDistance / points.length;

        // Calculate variance in radius
        let variance = 0;
        points.forEach(p => {
            const dist = this.distance(p, center);
            variance += Math.pow(dist - avgRadius, 2);
        });
        variance /= points.length;
        const stdDev = Math.sqrt(variance);

        // Check if variance is low (consistent radius = circle)
        const varianceRatio = stdDev / avgRadius;

        // Check circularity (ratio of perimeter to area)
        const perimeter = this.calculatePerimeter(points);
        const area = Math.PI * avgRadius * avgRadius;
        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);

        // Thresholds based on sensitivity
        const thresholds = {
            strict: { variance: 0.15, circularity: 0.7 },
            moderate: { variance: 0.25, circularity: 0.6 },
            relaxed: { variance: 0.35, circularity: 0.5 }
        };

        const threshold = thresholds[this.sensitivity];

        if (varianceRatio < threshold.variance && circularity > threshold.circularity) {
            return {
                type: 'circle',
                confidence: 1 - varianceRatio,
                params: {
                    center: center,
                    radius: avgRadius
                }
            };
        }

        return null;
    }

    detectRectangle(points) {
        // Find approximate corners using Douglas-Peucker algorithm
        const simplified = this.simplifyPath(points, 10);

        if (simplified.length < 4 || simplified.length > 8) {
            return null;
        }

        // Detect corners (points with sharp angle changes)
        const corners = this.findCorners(simplified);

        if (corners.length < 4 || corners.length > 5) {
            return null;
        }

        // Take first 4 corners
        const fourCorners = corners.slice(0, 4);

        // Check if corners form a rectangle
        const isRect = this.isRectangleShape(fourCorners);

        if (!isRect) {
            return null;
        }

        // Check if it's a square (all sides roughly equal)
        const isSquare = this.isSquareShape(fourCorners);

        // Calculate bounding box
        const bounds = this.getBoundingBox(fourCorners);

        const thresholds = {
            strict: 0.9,
            moderate: 0.75,
            relaxed: 0.6
        };

        const confidence = isRect ? thresholds[this.sensitivity] : 0;

        if (confidence > 0.5) {
            return {
                type: isSquare ? 'square' : 'rectangle',
                confidence: confidence,
                params: {
                    corners: fourCorners,
                    bounds: bounds
                }
            };
        }

        return null;
    }

    detectLine(points) {
        // Check if points form a relatively straight line
        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];

        // Calculate expected line length
        const lineLength = this.distance(firstPoint, lastPoint);

        // Calculate total path length
        let pathLength = 0;
        for (let i = 1; i < points.length; i++) {
            pathLength += this.distance(points[i - 1], points[i]);
        }

        // Straightness ratio
        const straightness = lineLength / pathLength;

        const thresholds = {
            strict: 0.95,
            moderate: 0.85,
            relaxed: 0.75
        };

        if (straightness > thresholds[this.sensitivity]) {
            return {
                type: 'line',
                confidence: straightness,
                params: {
                    start: firstPoint,
                    end: lastPoint
                }
            };
        }

        return null;
    }

    showSuggestion(originalPoints, shapeResult) {
        const originalCanvas = document.getElementById('originalShapeCanvas');
        const suggestedCanvas = document.getElementById('suggestedShapeCanvas');
        const originalCtx = originalCanvas.getContext('2d');
        const suggestedCtx = suggestedCanvas.getContext('2d');

        // Clear canvases
        originalCtx.clearRect(0, 0, 150, 150);
        suggestedCtx.clearRect(0, 0, 150, 150);

        // Draw original stroke
        this.drawStroke(originalCtx, originalPoints, 150, 150);

        // Draw suggested shape
        this.drawShape(suggestedCtx, shapeResult, 150, 150);

        // Update label
        const label = document.getElementById('shapeTypeLabel');
        label.textContent = `${shapeResult.type.toUpperCase()} (${Math.round(shapeResult.confidence * 100)}% match)`;

        // Store for later
        this.currentSuggestion = { originalPoints, shapeResult };

        // Show modal
        this.suggestionModal.style.display = 'block';
    }

    drawStroke(ctx, points, canvasWidth, canvasHeight) {
        if (points.length === 0) return;

        // Normalize points to fit canvas
        const normalized = this.normalizePoints(points, canvasWidth - 20, canvasHeight - 20, 10);

        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(normalized[0].x, normalized[0].y);
        for (let i = 1; i < normalized.length; i++) {
            ctx.lineTo(normalized[i].x, normalized[i].y);
        }
        ctx.stroke();
    }

    drawShape(ctx, shapeResult, canvasWidth, canvasHeight) {
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const padding = 20;
        const drawWidth = canvasWidth - padding;
        const drawHeight = canvasHeight - padding;

        if (shapeResult.type === 'circle') {
            const centerX = canvasWidth / 2;
            const centerY = canvasHeight / 2;
            const radius = Math.min(drawWidth, drawHeight) / 2;

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (shapeResult.type === 'rectangle' || shapeResult.type === 'square') {
            const width = shapeResult.type === 'square' ?
                Math.min(drawWidth, drawHeight) : drawWidth;
            const height = shapeResult.type === 'square' ?
                Math.min(drawWidth, drawHeight) : drawHeight;

            const x = (canvasWidth - width) / 2;
            const y = (canvasHeight - height) / 2;

            ctx.strokeRect(x, y, width, height);
        } else if (shapeResult.type === 'line') {
            const startX = padding / 2;
            const startY = canvasHeight / 2;
            const endX = canvasWidth - padding / 2;
            const endY = canvasHeight / 2;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
    }

    acceptSuggestion() {
        this.suggestionModal.style.display = 'none';

        if (this.onShapeDetected && this.currentSuggestion) {
            this.onShapeDetected(this.currentSuggestion.shapeResult);
        }
    }

    rejectSuggestion() {
        this.suggestionModal.style.display = 'none';
        this.currentSuggestion = null;
    }

    // Helper functions
    getCentroid(points) {
        let sumX = 0, sumY = 0;
        points.forEach(p => {
            sumX += p.x;
            sumY += p.y;
        });
        return { x: sumX / points.length, y: sumY / points.length };
    }

    distance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    calculatePerimeter(points) {
        let perimeter = 0;
        for (let i = 1; i < points.length; i++) {
            perimeter += this.distance(points[i - 1], points[i]);
        }
        return perimeter;
    }

    simplifyPath(points, tolerance) {
        // Douglas-Peucker algorithm
        if (points.length <= 2) return points;

        let maxDistance = 0;
        let index = 0;
        const end = points.length - 1;

        for (let i = 1; i < end; i++) {
            const dist = this.perpendicularDistance(points[i], points[0], points[end]);
            if (dist > maxDistance) {
                index = i;
                maxDistance = dist;
            }
        }

        if (maxDistance > tolerance) {
            const left = this.simplifyPath(points.slice(0, index + 1), tolerance);
            const right = this.simplifyPath(points.slice(index), tolerance);
            return left.slice(0, -1).concat(right);
        } else {
            return [points[0], points[end]];
        }
    }

    perpendicularDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const mag = Math.sqrt(dx * dx + dy * dy);

        if (mag > 0) {
            const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);
            const x = lineStart.x + u * dx;
            const y = lineStart.y + u * dy;
            return this.distance(point, { x, y });
        }

        return this.distance(point, lineStart);
    }

    findCorners(points) {
        const corners = [];
        const angleThreshold = 45; // degrees

        for (let i = 1; i < points.length - 1; i++) {
            const angle = this.calculateAngle(points[i - 1], points[i], points[i + 1]);
            const angleDegrees = angle * (180 / Math.PI);

            if (angleDegrees < (180 - angleThreshold)) {
                corners.push(points[i]);
            }
        }

        return corners;
    }

    calculateAngle(p1, p2, p3) {
        const angle1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
        const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
        let angle = Math.abs(angle1 - angle2);

        if (angle > Math.PI) {
            angle = 2 * Math.PI - angle;
        }

        return angle;
    }

    isRectangleShape(corners) {
        if (corners.length !== 4) return false;

        // Check if opposite sides are roughly parallel
        const side1 = this.distance(corners[0], corners[1]);
        const side2 = this.distance(corners[1], corners[2]);
        const side3 = this.distance(corners[2], corners[3]);
        const side4 = this.distance(corners[3], corners[0]);

        const threshold = 0.3;
        return Math.abs(side1 - side3) / side1 < threshold &&
            Math.abs(side2 - side4) / side2 < threshold;
    }

    isSquareShape(corners) {
        const sides = [
            this.distance(corners[0], corners[1]),
            this.distance(corners[1], corners[2]),
            this.distance(corners[2], corners[3]),
            this.distance(corners[3], corners[0])
        ];

        const avgSide = sides.reduce((a, b) => a + b) / 4;
        const threshold = 0.2;

        return sides.every(side => Math.abs(side - avgSide) / avgSide < threshold);
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

        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    normalizePoints(points, targetWidth, targetHeight, padding) {
        const bounds = this.getBoundingBox(points);
        const scaleX = targetWidth / bounds.width;
        const scaleY = targetHeight / bounds.height;
        const scale = Math.min(scaleX, scaleY);

        return points.map(p => ({
            x: (p.x - bounds.minX) * scale + padding,
            y: (p.y - bounds.minY) * scale + padding
        }));
    }

    destroy() {
        if (this.suggestionModal) {
            this.suggestionModal.remove();
        }
    }
}

// Export for global use
window.ShapeRecognizer = ShapeRecognizer;
