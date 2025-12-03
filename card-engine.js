/**
 * card-engine.js
 * Core library for card positioning and animation.
 * ES Module version: Only exposes Stage.
 */

/* --- Internal Classes & Helpers (Encapsulated) --- */

// 1. Token Class: DOM Wrapper & Animation Actor
class Token {
    constructor(element, renderCallback, stage, config) {
        this._el = element;
        this._renderCallback = renderCallback;
        this._stage = stage;
        this._config = config;

        // Cartesian coordinates and rotation state
        this._x = 0;
        this._y = 0;
        this._rotation = 0;
        
        // State flags
        this._type = null;
        this._isFlipped = false;
    }

    get element() { return this._el; }
    get type() { return this._type; }

    setType(cardType) {
        this._type = cardType;
        const front = this._el.querySelector('.face-front');
        if (this._renderCallback) {
            this._renderCallback(front, cardType);
        } else {
            front.textContent = cardType;
        }
    }

    setFlipped(flipped) {
        this._isFlipped = flipped;
        this._applyTransform();
    }

    moveToAnchor(targetEl, rotation = 0) {
        const center = StageHelper.getRelativePos(targetEl, this._stage);
        const x = center.x - (this._config.cardWidth / 2);
        const y = center.y - (this._config.cardHeight / 2);
        this.moveTo(x, y, rotation);
    }

    jumpToAnchor(targetEl) {
        const center = StageHelper.getRelativePos(targetEl, this._stage);
        const x = center.x - (this._config.cardWidth / 2);
        const y = center.y - (this._config.cardHeight / 2);
        this.jumpTo(x, y);
    }

    moveTo(x, y, rotation = 0) {
        this._x = x;
        this._y = y;
        this._rotation = rotation;
        this._applyTransform();
    }
    
    jumpTo(x, y) {
        this._el.style.transition = 'none';
        this.moveTo(x, y, 0);
        this._el.offsetHeight; // Force Reflow
        this._el.style.transition = '';
    }

    _applyTransform() {
        const flipRot = this._isFlipped ? 180 : 0;
        this._el.style.transform = `translate3d(${this._x}px, ${this._y}px, 0) rotate(${this._rotation}deg) rotateY(${flipRot}deg)`;
    }
}

// 2. Token Pool (Internal Memory Management)
class TokenPool {
    constructor(stageElement, renderCallback, config) {
        this._stage = stageElement;
        this._pool = [];
        this._renderCallback = renderCallback;
        this._config = config;
    }

    spawn(cardType, anchorEl, initialFlipped = false) {
        let token;
        if (this._pool.length > 0) {
            token = this._pool.pop();
            token.element.style.display = 'block';
        } else {
            token = this._createTokenElement();
        }
        
        token.setType(cardType);
        token.setFlipped(initialFlipped);
        
        if (anchorEl) {
            token.jumpToAnchor(anchorEl);
        }
        
        return token;
    }

    despawn(token) {
        token.element.style.display = 'none';
        this._pool.push(token);
    }

    _createTokenElement() {
        const el = document.createElement('div');
        el.className = 'card-token';
        el.innerHTML = `
            <div class="card-face face-front"></div>
            <div class="card-face face-back"></div>
        `;
        this._stage.appendChild(el);
        return new Token(el, this._renderCallback, this._stage, this._config);
    }
}

// 3. Layout Strategies
const StageHelper = {
    getRelativePos(targetEl, stageEl) {
        const stageRect = stageEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const scale = stageRect.width / stageEl.offsetWidth; 

        return {
            x: (targetRect.left - stageRect.left + targetRect.width/2) / scale,
            y: (targetRect.top - stageRect.top + targetRect.height/2) / scale
        };
    }
};

class CenterRowStrategy {
    constructor(config) {
        this._config = config;
    }

    update(items, zoneEl, stageEl) {
        const center = StageHelper.getRelativePos(zoneEl, stageEl);
        const count = items.length;
        if (count === 0) return;

        const cw = this._config.cardWidth;
        const ch = this._config.cardHeight;
        const gap = 10;
        const zoneWidth = zoneEl.offsetWidth;

        let step = cw + gap;
        if (count > 1) {
            const availableSpace = zoneWidth - cw;
            const maxStep = availableSpace / (count - 1);
            step = Math.min(step, maxStep);
        }

        const totalGroupWidth = (count - 1) * step + cw;
        const startX = center.x - (totalGroupWidth / 2);
        const startY = center.y - (ch / 2);

        items.forEach((token, i) => {
            const x = startX + (i * step);
            token.moveTo(x, startY, 0);
            token.element.style.zIndex = i;
        });
    }
}

class PileStrategy {
    constructor(config, maxAngle = 15) {
        this._config = config;
        this._maxAngle = maxAngle;
    }

    update(items, zoneEl, stageEl) {
        const center = StageHelper.getRelativePos(zoneEl, stageEl);
        const cw = this._config.cardWidth;
        const ch = this._config.cardHeight;

        items.forEach((token, i) => {
            const x = center.x - (cw / 2); 
            const y = center.y - (ch / 2);
            const angle = Math.sin(i * 12345) * this._maxAngle;
            token.moveTo(x, y, angle);
            token.element.style.zIndex = i;
        });
    }
}

// 4. Zone Wrapper
class Zone {
    constructor(element, strategy, pool, stageEl) {
        this._el = element;
        this._strategy = strategy;
        this._items = []; 
        this._pool = pool;
        this._stageEl = stageEl;
    }

    get items() {
        return this._items;
    }

    add(token) {
        this._items.push(token);
        this.render();
    }

    removeIndices(indices) {
        indices.sort((a, b) => b - a);
        const removed = [];
        indices.forEach(idx => {
            if (this._items[idx]) {
                removed.push(this._items.splice(idx, 1)[0]);
            }
        });
        this.render();
        return removed;
    }

    clear() {
        const all = [...this._items];
        this._items = [];
        this.render();
        return all;
    }

    render() {
        this._strategy.update(this._items, this._el, this._stageEl);
    }
}

/* --- Public API (Export) --- */

/**
 * Stage
 * 
 * A bounded coordinate space for card positioning and animation.
 * 
 * Scope & Limitations:
 * - Operates within a SINGLE non-scrolling container element
 * - All coordinate calculations are relative to this container
 * - For multi-container scenarios, instantiate separate Stages
 *   and handle cross-stage transfers at a higher layer
 */
export default class Stage {
    constructor(containerEl, config) {
        this._stageEl = containerEl;
        this._config = config;
        this._zones = []; 
        
        this._pool = new TokenPool(this._stageEl, this._config.renderCard, this._config);
        
        const ro = new ResizeObserver(() => {
            this._stageEl.classList.add('no-transition');
            this.renderAll();
            void this._stageEl.offsetHeight;
            this._stageEl.classList.remove('no-transition');
        });
        
        ro.observe(this._stageEl);
    }

    spawn(cardType, anchorEl, initialFlipped = false) {
        return this._pool.spawn(cardType, anchorEl, initialFlipped);
    }

    despawn(token) {
        this._pool.despawn(token);
    }

    createZone(zoneElement, strategyType, options = {}) {
        let strategy;
        if (strategyType === 'row') {
            strategy = new CenterRowStrategy(this._config);
        } else if (strategyType === 'pile') {
            strategy = new PileStrategy(this._config, options.angle || 15);
        }

        const zone = new Zone(zoneElement, strategy, this._pool, this._stageEl);
        this._zones.push(zone);
        return zone;
    }

    renderAll() {
        this._zones.forEach(z => z.render());
    }
}
