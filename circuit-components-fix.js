// Circuit Components Fix - Override functions to work properly
// This file fixes the circuit components drag-and-drop functionality

// Map component names to their SVG symbols
const componentSvgMap = {
    'resistor': '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><rect x="15" y="15" width="10" height="10" fill="none" stroke="#2c3e50" stroke-width="2"/><line x1="25" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>',
    'capacitor': '<line x1="5" y1="20" x2="17" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="17" y1="10" x2="17" y2="30" stroke="#2c3e50" stroke-width="2"/><line x1="23" y1="10" x2="23" y2="30" stroke="#2c3e50" stroke-width="2"/><line x1="23" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>',
    'inductor': '<path d="M 5 20 Q 10 10, 15 20 T 25 20 T 35 20" fill="none" stroke="#2c3e50" stroke-width="2"/>',
    'battery': '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="15" y1="12" x2="15" y2="28" stroke="#2c3e50" stroke-width="3"/><line x1="25" y1="15" x2="25" y2="25" stroke="#2c3e50" stroke-width="2"/><line x1="25" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>',
    'ground': '<line x1="20" y1="5" x2="20" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="10" y1="20" x2="30" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="13" y1="25" x2="27" y2="25" stroke="#2c3e50" stroke-width="2"/><line x1="16" y1="30" x2="24" y2="30" stroke="#2c3e50" stroke-width="2"/>',
    'diode': '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><polygon points="15,10 15,30 25,20" fill="#2c3e50"/><line x1="25" y1="10" x2="25" y2="30" stroke="#2c3e50" stroke-width="2"/><line x1="25" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>',
    'led': '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><polygon points="15,10 15,30 25,20" fill="#e74c3c"/><line x1="25" y1="10" x2="25" y2="30" stroke="#2c3e50" stroke-width="2"/><line x1="25" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>',
    'switch': '<line x1="5" y1="20" x2="15" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="15" y1="20" x2="30" y2="10" stroke="#2c3e50" stroke-width="2"/><circle cx="15" cy="20" r="2" fill="#2c3e50"/><circle cx="30" cy="20" r="2" fill="#2c3e50"/><line x1="30" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>',
    'bulb': '<line x1="5" y1="20" x2="10" y2="20" stroke="#2c3e50" stroke-width="2"/><circle cx="20" cy="20" r="10" fill="none" stroke="#2c3e50" stroke-width="2"/><path d="M 15 25 L 15 30 M 25 25 L 25 30 M 13 30 L 27 30" stroke="#2c3e50" stroke-width="2" fill="none"/><line x1="30" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>',
    'voltmeter': '<circle cx="20" cy="20" r="12" fill="none" stroke="#2c3e50" stroke-width="2"/><text x="20" y="25" text-anchor="middle" font-size="12" fill="#2c3e50" font-weight="bold">V</text><line x1="5" y1="20" x2="8" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="32" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>',
    'ammeter': '<circle cx="20" cy="20" r="12" fill="none" stroke="#2c3e50" stroke-width="2"/><text x="20" y="25" text-anchor="middle" font-size="12" fill="#2c3e50" font-weight="bold">A</text><line x1="5" y1="20" x2="8" y2="20" stroke="#2c3e50" stroke-width="2"/><line x1="32" y1="20" x2="35" y2="20" stroke="#2c3e50" stroke-width="2"/>'
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    console.log('Circuit components fix: DOM loaded');
    setTimeout(initCircuitComponentsFix, 1000);

    // Also retry after a longer delay in case content is loaded dynamically
    setTimeout(initCircuitComponentsFix, 3000);
});

// Also try to initialize immediately if DOM is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('Circuit components fix: DOM already ready');
    setTimeout(initCircuitComponentsFix, 500);
}

function initCircuitComponentsFix() {
    console.log('Initializing circuit components fix...');

    // Setup drag handlers for component cards
    const cards = document.querySelectorAll('.circuit-component-card');
    cards.forEach(card => {
        // Remove any existing listeners first
        card.removeEventListener('dragstart', handleDragStart);
        card.removeEventListener('click', handleComponentClick);

        // Add drag and click handlers
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('click', handleComponentClick);

        console.log('Added dragstart and click listeners to:', card.dataset.component);
    });

    // Setup drop zones on all content areas
    const contentAreas = document.querySelectorAll('.content-area');
    contentAreas.forEach(area => {
        area.removeEventListener('dragover', handleDragOver);
        area.removeEventListener('drop', handleDrop);
        area.addEventListener('dragover', handleDragOver);
        area.addEventListener('drop', handleDrop);
        console.log('Added drop listeners to content area');
    });

    // Also add to the paper element as a fallback
    const paper = document.getElementById('paper');
    if (paper) {
        paper.removeEventListener('dragover', handleDragOver);
        paper.removeEventListener('drop', handleDrop);
        paper.addEventListener('dragover', handleDragOver);
        paper.addEventListener('drop', handleDrop);
        console.log('Added drop listeners to paper element');
    }

    console.log(`Circuit components initialized: ${cards.length} cards, ${contentAreas.length} drop zones`);
}

function handleDragStart(e) {
    const componentType = this.dataset.component;
    const componentName = this.querySelector('.circuit-component-name').textContent;
    const componentSvg = componentSvgMap[componentType] || '';

    e.dataTransfer.setData('componentType', componentType);
    e.dataTransfer.setData('componentName', componentName);
    e.dataTransfer.setData('componentSvg', componentSvg);
    e.dataTransfer.effectAllowed = 'copy';

    console.log('Dragging:', componentName);
}

function handleComponentClick(e) {
    // Don't trigger if user is dragging
    if (e.defaultPrevented) return;

    const componentType = this.dataset.component;
    const componentName = this.querySelector('.circuit-component-name').textContent;
    const componentSvg = componentSvgMap[componentType] || '';

    console.log('Component clicked:', componentName);

    // Find the first visible content area or paper element
    let targetArea = document.querySelector('.content-area');
    if (!targetArea) {
        targetArea = document.getElementById('paper');
    }

    if (!targetArea) {
        console.error('No target area found for component placement');
        return;
    }

    // Calculate center position of the visible area
    const rect = targetArea.getBoundingClientRect();
    const scrollTop = targetArea.scrollTop || 0;
    const scrollLeft = targetArea.scrollLeft || 0;

    // Place at center of visible area
    const x = (rect.width / 2) + scrollLeft;
    const y = (rect.height / 2) + scrollTop;

    // Add some randomness so multiple clicks don't stack exactly
    const randomOffset = () => (Math.random() - 0.5) * 40;
    const finalX = x + randomOffset();
    const finalY = y + randomOffset();

    console.log('Adding component at:', finalX, finalY);

    // Add the component
    addCircuitComponentFixed(componentType, componentSvg, componentName, finalX, finalY, targetArea);

    // Close the overlay
    if (typeof toggleCircuitComponents === 'function') {
        toggleCircuitComponents();
    }

    // Show feedback
    if (typeof showToast === 'function') {
        showToast(`✓ ${componentName} added! Click to add more, or drag for precise placement.`);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

function handleDrop(e) {
    e.preventDefault();

    const componentType = e.dataTransfer.getData('componentType');
    const componentName = e.dataTransfer.getData('componentName');
    const componentSvg = e.dataTransfer.getData('componentSvg');

    if (!componentType) return;

    const area = e.currentTarget;
    const rect = area.getBoundingClientRect();
    const x = e.clientX - rect.left + area.scrollLeft;
    const y = e.clientY - rect.top + area.scrollTop;

    addCircuitComponentFixed(componentType, componentSvg, componentName, x, y, area);

    // Close the overlay
    if (typeof toggleCircuitComponents === 'function') {
        toggleCircuitComponents();
    }

    console.log('Dropped:', componentName, 'at', x, y);
}

function addCircuitComponentFixed(type, svg, name, x, y, targetArea) {
    if (!targetArea) return;

    // Ensure area has relative positioning
    if (getComputedStyle(targetArea).position === 'static') {
        targetArea.style.position = 'relative';
    }

    // Create SVG layer for wires if it doesn't exist
    let svgLayer = targetArea.querySelector('.circuit-svg-layer');
    if (!svgLayer) {
        svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgLayer.setAttribute('class', 'circuit-svg-layer');
        svgLayer.id = 'circuitSvg';
        svgLayer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5;';
        targetArea.appendChild(svgLayer);
    }

    // Create component element
    const componentId = `circuit-comp-${Date.now()}`;
    const element = document.createElement('div');
    element.className = 'circuit-element';
    element.id = componentId;
    element.style.left = `${x - 40}px`;
    element.style.top = `${y - 40}px`;
    element.dataset.type = type;

    element.innerHTML = `
        <svg class="circuit-element-icon" viewBox="0 0 40 40" style="width: 40px; height: 40px;">
            ${svg}
        </svg>
        <div class="circuit-element-label">${name}</div>
        <button class="circuit-element-delete" onclick="deleteCircuitComponentFixed('${componentId}')">×</button>
        <div class="circuit-connection-point top" data-point="top" onclick="startConnectionFixed(event, '${componentId}', 'top')"></div>
        <div class="circuit-connection-point bottom" data-point="bottom" onclick="startConnectionFixed(event, '${componentId}', 'bottom')"></div>
        <div class="circuit-connection-point left" data-point="left" onclick="startConnectionFixed(event, '${componentId}', 'left')"></div>
        <div class="circuit-connection-point right" data-point="right" onclick="startConnectionFixed(event, '${componentId}', 'right')"></div>
    `;

    // Make draggable
    makeElementDraggable(element);

    // Add click handler for interactive components
    addComponentClickHandler(element, componentId, type);

    targetArea.appendChild(element);

    // Register with simulator
    if (window.circuitSimulator) {
        window.circuitSimulator.registerComponent(componentId, type, element);
    }

    if (typeof showToast === 'function') {
        showToast(`${name} added to circuit`);
    }
}

// Add click handler for interactive components
function addComponentClickHandler(element, componentId, type) {
    const icon = element.querySelector('.circuit-element-icon');
    if (!icon) return;

    // Add click handler based on component type
    if (type === 'resistor') {
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            handleResistorClick(componentId);
        });
    } else if (type === 'switch') {
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            handleSwitchClick(componentId);
        });
    } else if (type === 'battery') {
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            handleBatteryClick(componentId);
        });
    }
}

// Handle resistor click - change resistance value
function handleResistorClick(componentId) {
    if (!window.circuitSimulator) return;

    const comp = window.circuitSimulator.components.get(componentId);
    if (!comp) return;

    const newValue = prompt(`Enter resistance value (Ω):`, comp.resistance);
    if (newValue !== null && !isNaN(newValue) && parseFloat(newValue) > 0) {
        window.circuitSimulator.changeComponentValue(componentId, 'resistance', newValue);
        if (typeof showToast === 'function') {
            showToast(`Resistor set to ${newValue}Ω`);
        }
    }
}

// Handle switch click - toggle open/closed
function handleSwitchClick(componentId) {
    if (!window.circuitSimulator) return;

    window.circuitSimulator.toggleSwitch(componentId);

    const comp = window.circuitSimulator.components.get(componentId);
    if (comp && typeof showToast === 'function') {
        showToast(`Switch ${comp.closed ? 'closed' : 'opened'}`);
    }
}

// Handle battery click - change voltage
function handleBatteryClick(componentId) {
    if (!window.circuitSimulator) return;

    const comp = window.circuitSimulator.components.get(componentId);
    if (!comp) return;

    const newValue = prompt(`Enter voltage (V):`, comp.voltage);
    if (newValue !== null && !isNaN(newValue) && parseFloat(newValue) > 0) {
        window.circuitSimulator.changeComponentValue(componentId, 'voltage', newValue);
        if (typeof showToast === 'function') {
            showToast(`Battery set to ${newValue}V`);
        }
    }
}

function makeElementDraggable(element) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    element.addEventListener('mousedown', function (e) {
        if (e.target.classList.contains('circuit-connection-point') ||
            e.target.classList.contains('circuit-element-delete')) {
            return;
        }

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseInt(element.style.left) || 0;
        initialTop = parseInt(element.style.top) || 0;
        element.classList.add('selected');
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        element.style.left = `${initialLeft + dx}px`;
        element.style.top = `${initialTop + dy}px`;

        updateWiresForComponent(element.id);
    });

    document.addEventListener('mouseup', function () {
        if (isDragging) {
            isDragging = false;
            element.classList.remove('selected');
        }
    });
}

// Wire connection state
let connectionStart = null;

window.startConnectionFixed = function (event, componentId, point) {
    event.stopPropagation();

    if (!connectionStart) {
        connectionStart = { componentId, point };
        if (typeof showToast === 'function') {
            showToast('Click another connection point to complete wire');
        }
    } else {
        if (connectionStart.componentId !== componentId) {
            createWireFixed(connectionStart.componentId, connectionStart.point, componentId, point);
            connectionStart = null;
        } else {
            if (typeof showToast === 'function') {
                showToast('Cannot connect component to itself');
            }
            connectionStart = null;
        }
    }
};

function createWireFixed(comp1Id, point1, comp2Id, point2) {
    const comp1 = document.getElementById(comp1Id);
    const comp2 = document.getElementById(comp2Id);

    if (!comp1 || !comp2) return;

    const svg = comp1.parentElement.querySelector('.circuit-svg-layer');
    if (!svg) return;

    const wireId = `wire-${Date.now()}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'circuit-wire');
    path.setAttribute('id', wireId);
    path.setAttribute('data-comp1', comp1Id);
    path.setAttribute('data-point1', point1);
    path.setAttribute('data-comp2', comp2Id);
    path.setAttribute('data-point2', point2);
    path.style.pointerEvents = 'auto';

    updateWirePath(path, comp1, point1, comp2, point2, svg);

    path.addEventListener('click', function () {
        if (confirm('Delete this wire?')) {
            // Unregister from simulator before removing
            if (window.circuitSimulator) {
                window.circuitSimulator.unregisterWire(wireId);
            }
            path.remove();
            // Re-analyze circuit
            if (window.circuitSimulator) {
                window.circuitSimulator.analyzeCircuit();
            }
        }
    });

    svg.appendChild(path);

    // Register with simulator
    if (window.circuitSimulator) {
        window.circuitSimulator.registerWire(wireId, comp1Id, point1, comp2Id, point2, path);
        // Analyze circuit after adding wire
        window.circuitSimulator.analyzeCircuit();
    }

    if (typeof showToast === 'function') {
        showToast('Wire connected');
    }
}

function updateWirePath(path, comp1, point1, comp2, point2, svg) {
    const svgRect = svg.getBoundingClientRect();
    const comp1Rect = comp1.getBoundingClientRect();
    const comp2Rect = comp2.getBoundingClientRect();

    const pos1 = getConnectionPos(comp1Rect, point1, svgRect);
    const pos2 = getConnectionPos(comp2Rect, point2, svgRect);

    const d = `M ${pos1.x} ${pos1.y} L ${pos2.x} ${pos2.y}`;
    path.setAttribute('d', d);
}

function getConnectionPos(compRect, point, svgRect) {
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

function updateWiresForComponent(componentId) {
    const component = document.getElementById(componentId);
    if (!component) return;

    const svg = component.parentElement.querySelector('.circuit-svg-layer');
    if (!svg) return;

    const wires = svg.querySelectorAll('.circuit-wire');
    wires.forEach(wire => {
        const comp1Id = wire.getAttribute('data-comp1');
        const comp2Id = wire.getAttribute('data-comp2');

        if (comp1Id === componentId || comp2Id === componentId) {
            const comp1 = document.getElementById(comp1Id);
            const comp2 = document.getElementById(comp2Id);
            const point1 = wire.getAttribute('data-point1');
            const point2 = wire.getAttribute('data-point2');

            if (comp1 && comp2) {
                updateWirePath(wire, comp1, point1, comp2, point2, svg);
            }
        }
    });
}

window.deleteCircuitComponentFixed = function (componentId) {
    const element = document.getElementById(componentId);
    if (!element) return;

    const svg = element.parentElement.querySelector('.circuit-svg-layer');
    if (svg) {
        const wires = svg.querySelectorAll('.circuit-wire');
        wires.forEach(wire => {
            const comp1Id = wire.getAttribute('data-comp1');
            const comp2Id = wire.getAttribute('data-comp2');

            if (comp1Id === componentId || comp2Id === componentId) {
                const wireId = wire.getAttribute('id');
                // Unregister wire from simulator
                if (window.circuitSimulator && wireId) {
                    window.circuitSimulator.unregisterWire(wireId);
                }
                wire.remove();
            }
        });
    }

    // Unregister component from simulator
    if (window.circuitSimulator) {
        window.circuitSimulator.unregisterComponent(componentId);
    }

    element.remove();

    // Re-analyze circuit
    if (window.circuitSimulator) {
        window.circuitSimulator.analyzeCircuit();
    }

    if (typeof showToast === 'function') {
        showToast('Component deleted');
    }
};

// Expose initialization function globally so it can be called when modal opens
window.reinitCircuitComponents = function () {
    console.log('Manually reinitializing circuit components...');
    initCircuitComponentsFix();
};

// Also expose the init function
window.initCircuitComponentsFix = initCircuitComponentsFix;
