/**
 * card-engine.js
 * 
 * Theatrical animation library for card games.
 * Provides Stage (animation space) and Token (card actor) abstractions.
 * 
 * EXPORTS: Stage (default)
 * INTERNAL: Token, TokenPool, Zone, Strategies
 * 
 * @see Stage class documentation for architecture and usage patterns
 */

/* ═══════════════════════════════════════════════════════════════════
   INTERNAL CLASSES (Not Exported)
   These are implementation details. Do not expose or depend on directly.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Token - A card actor on the Stage.
 * 
 * Tokens are DOM wrappers managed by TokenPool for efficient reuse.
 * They represent cards visually but do NOT hold game state.
 * Within Stage, Tokens persist in Zones until explicitly despawned.
 */
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

/**
 * TokenPool - Object pool for Token recycling.
 * 
 * Avoids DOM thrashing by reusing Token elements.
 * Tokens are despawned (hidden & pooled), not destroyed.
 */
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

/**
 * StageHelper - Coordinate calculation utilities.
 * 
 * IMPORTANT: Assumes stageEl is non-scrolling.
 * If stageEl.scrollTop/Left > 0, calculations will be wrong.
 */
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

/**
 * Layout Strategies - Positioning algorithms for Zones.
 * Each strategy implements update(items, zoneEl, stageEl).
 */
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

class GridStrategy {
    constructor(config, options = {}) {
        this._config = config;
        this._gap = options.gap || [10, 10];
        this._cols = options.cols || null; // null = auto-calculate
    }

    update(items, zoneEl, stageEl) {
        const count = items.length;
        if (count === 0) return;

        const cw = this._config.cardWidth;
        const ch = this._config.cardHeight;
        const [gapX, gapY] = this._gap;
        const zoneWidth = zoneEl.offsetWidth;

        // Calculate cols: use provided value or fit as many as possible
        const cols = this._cols || Math.max(1, Math.floor((zoneWidth + gapX) / (cw + gapX)));

        // Get zone's top-left position relative to stage
        const zoneRect = zoneEl.getBoundingClientRect();
        const stageRect = stageEl.getBoundingClientRect();
        const scale = stageRect.width / stageEl.offsetWidth;
        const zoneX = (zoneRect.left - stageRect.left) / scale;
        const zoneY = (zoneRect.top - stageRect.top) / scale;

        items.forEach((token, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = zoneX + col * (cw + gapX);
            const y = zoneY + row * (ch + gapY);
            token.moveTo(x, y, 0);
            token.element.style.zIndex = i;
        });
    }
}

/**
 * Zone - A logical grouping of Tokens with a layout strategy.
 * 
 * Zones are anchored to a DOM element and arrange their
 * Tokens according to the assigned strategy (row, pile, etc.).
 */
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
 * Stage - A theatrical space for card animation and choreography.
 * 
 * ═══════════════════════════════════════════════════════════════════
 * CONCEPT
 * ═══════════════════════════════════════════════════════════════════
 * Stage is a bounded, non-scrolling coordinate space where Tokens
 * (card actors) live and move. All positioning is handled purely
 * through Stage-relative coordinates — no scroll offsets involved.
 * 
 * Hand, discard pile, and other fixed zones exist within Stage.
 * Tokens persist here as long as they belong to these zones.
 * 
 * ═══════════════════════════════════════════════════════════════════
 * SCOPE (What Stage Manages)
 * ═══════════════════════════════════════════════════════════════════
 * - Elements that need NO scrolling
 * - Positioning based purely on Stage-relative coordinates
 * - Animated movement between Zones within the Stage
 * 
 * ═══════════════════════════════════════════════════════════════════
 * RESPONSIBILITIES
 * ═══════════════════════════════════════════════════════════════════
 * - Spawn/despawn Tokens (pooled DOM elements for performance)
 * - Animate Token movement within the bounded space
 * - Manage Zones (logical groupings with layout strategies)
 * - Handle coordinate calculations relative to container
 * - Respond to container resize
 * 
 * ═══════════════════════════════════════════════════════════════════
 * BOUNDARIES (What Stage Does NOT Do)
 * ═══════════════════════════════════════════════════════════════════
 * - NO scrolling support — if you need scroll, it's outside Stage
 * - NO cross-stage transfers — handle at higher layer
 * - NO game logic — purely visual/animation concerns
 * 
 * ═══════════════════════════════════════════════════════════════════
 * ARCHITECTURE PATTERN
 * ═══════════════════════════════════════════════════════════════════
 * 
 *   ┌─────────────────────────────────────┐
 *   │ Stage                               │
 *   │ - No scrolling                      │
 *   │ - Pure coordinate-based positioning │
 *   │ - Tokens persist in Zones           │
 *   │   (hand, discard, deck, etc.)       │
 *   └──────────────┬──────────────────────┘
 *                  │ despawn + create equivalent
 *                  ▼
 *   ┌─────────────────────────────────────┐
 *   │ Scrollable Area (outside Stage)     │
 *   │ - Uses flexbox/grid layout          │
 *   │ - Normal DOM elements               │
 *   │ - Managed separately                │
 *   └─────────────────────────────────────┘
 * 
 * When moving cards to a scrollable area, despawn the Token
 * and create an equivalent DOM element in that area.
 * 
 * ═══════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════
 * 
 *   const stage = new Stage(containerEl, {
 *       cardWidth: 80,
 *       cardHeight: 112,
 *       renderCard: (el, type) => { el.textContent = type; }
 *   });
 *   
 *   const hand = stage.createZone(handEl, 'row');
 *   const token = stage.spawn('Ace', deckEl);
 *   hand.add(token);  // Animates into hand, persists there
 *   
 *   // Moving to a scrollable area (outside Stage):
 *   hand.removeIndices([0]);
 *   token.element.style.opacity = 0;
 *   await wait(300);
 *   stage.despawn(token);
 *   scrollableArea.appendChild(createCardElement('Ace'));
 * 
 * ═══════════════════════════════════════════════════════════════════
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
        } else if (strategyType === 'grid') {
            strategy = new GridStrategy(this._config, {
                cols: options.cols,
                gap: options.gap
            });
        }

        const zone = new Zone(zoneElement, strategy, this._pool, this._stageEl);
        this._zones.push(zone);
        return zone;
    }

    renderAll() {
        this._zones.forEach(z => z.render());
    }
}