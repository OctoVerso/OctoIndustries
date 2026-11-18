(function () {
    // --- Configuration & Constants ---
    
    // Feature flags to easily toggle specific placements
    const ENABLE_TOP = false;
    const ENABLE_LEFT = false;
    const ENABLE_BOTTOM = true;
    const ENABLE_RIGHT = true;

    const BANNER_CONFIG = {
        top: { max_ratio: 0.6, min_width: 300, overlay: false, inner_margin: 0 },
        bottom: { max_ratio: 1.3, min_width: 300, overlay: false, inner_margin: 0 }, // Disabled margin for GAM expansion
        left: { min_ratio: 1.3, min_height: 600, overlay: false, inner_margin: 6 },
        right: { min_ratio: 1.3, min_width: 1024, min_height: 250, overlay: false, inner_margin: 6 }
    };

    const AD_UNIT_SIZES = {
        top: [[320, 50], [320, 100]],
        bottom: [[320, 50], [320, 100], [970, 90], [728, 90]],
        left: [[120, 600], [160, 600], [300, 600]],
        right: [[120, 600], [160, 600], [300, 600], [300, 250]]
    };

    const TYPES = ["top", "bottom", "left", "right"];
    
    // Filter active types based on flags
    const ACTIVE_TYPES = TYPES.filter(type => {
        if (type === "top") return ENABLE_TOP;
        if (type === "left") return ENABLE_LEFT;
        if (type === "bottom") return ENABLE_BOTTOM;
        if (type === "right") return ENABLE_RIGHT;
        return false;
    });

    const GAM_PARENT_CODE = (window?.EOS_SDK_GAM_OVERRIDE?.parentNetworkCode || "37336410");
    const GAM_CHILD_CODE = window?.EOS_SDK_GAM_OVERRIDE?.childNetworkCode;
    const GAM_NETWORK_CODE = GAM_CHILD_CODE ? (GAM_PARENT_CODE + "," + GAM_CHILD_CODE) : GAM_PARENT_CODE;
    const GAM_AD_UNIT = (window?.EOS_SDK_GAM_OVERRIDE?.bannerUnit || "eos/default-h5-game-banner");
    const WAIT_BEFORE_REFRESH_MS = 40000;
    const MIN_REFRESH_DURATION_MS = 30000;
    const CSS_FADE_DURATION_MS = 600;
    const SLOT_CLEANUP_DELAY_MS = 50;

    // --- GameInterface Setup ---
    window.GameInterface = window.GameInterface || {};
    window.GameInterface._offsetListeners = window.GameInterface._offsetListeners || [];

    window.GameInterface.onOffsetChange = function(listenerFunc) {
        this._offsetListeners.push(listenerFunc);
    };

    window.GameInterface.getOffsets = function() {
        return BannerManager.getCurrentOffsets();
    };

    window.GameInterface._triggerOffsetChange = function() {
        const offsets = this.getOffsets();
        this._offsetListeners.forEach(fn => fn(offsets));
    };

    // --- Core Manager ---
    class BannerManager {
        static slots = {};
        static support = { top: false, bottom: false, left: false, right: false };
        static sizes = { top: [], bottom: [], left: [], right: [] };
        static containers = {};
        static refreshAfter = {};
        static adUnitPath = `/${GAM_NETWORK_CODE}/${GAM_AD_UNIT}`;
        static resizeTimer = null;
        static destroyTimers = {};

        static init() {
            this.setupContainers();
            this.setupGPT();
            this.checkViewportSupport();

            window.addEventListener("resize", () => this.handleViewportResize());
            window.addEventListener("orientationchange", () => this.handleViewportResize());

            setInterval(() => this.showAds(), WAIT_BEFORE_REFRESH_MS);
            this.showAds();
        }

        static setupContainers() {
            ACTIVE_TYPES.forEach(type => {
                const container = document.createElement("div");
                const inner = document.createElement("div");

                container.id = `fg-banner-outer-${type}`;
                inner.id = `fg-banner-inner-${type}`;

                container.style.cssText = `position: fixed; display: flex; z-index: 999; user-select: none; transition: transform ${CSS_FADE_DURATION_MS}ms ease-in-out; background: rgba(0,0,0,0.75); box-shadow: 0px 0px 8px 0px rgba(0,0,0,0.50);`;
                
                // Read margin dynamically from config, default to 0 if undefined
                const margin = BANNER_CONFIG[type].inner_margin || 0;
                
                // Set inner styles including the white background fix
                inner.style.margin = `${margin}px`;
                inner.style.backgroundColor = "#ffffff"; // Fallback for transparent ads
                inner.style.overflow = "hidden"; // Prevent ad bleed
                inner.style.display = "flex"; // Helps center the iframe if it's smaller

                if (type === "top" || type === "bottom") {
                    container.style.width = "100%";
                    container.style.justifyContent = "center";
                    container.style[type] = "0";
                    container.style.transform = type === "top" ? "translateY(-100%)" : "translateY(100%)";
                } else {
                    container.style.height = "100%";
                    container.style.alignItems = "center";
                    container.style[type] = "0";
                    container.style.transform = type === "left" ? "translateX(-100%)" : "translateX(100%)";
                }

                container.appendChild(inner);
                document.body.insertBefore(container, document.body.firstChild);
                this.containers[type] = container;
            });
        }

        static setupGPT() {
            window.googletag = window.googletag || { cmd: [] };
            window.googletag.cmd.push(() => {
                window.googletag.pubads().addEventListener("slotOnload", (evt) => {
                    const type = this.getSlotType(evt.slot);
                
                    if (type && this.support[type]) {
                        this.fadeInSlot(type);
                    }
                });
                window.googletag.pubads().addEventListener("slotRenderEnded", (evt) => {
                    const type = this.getSlotType(evt.slot);
                    if (type) {
                        this.refreshAfter[type] = Date.now() + MIN_REFRESH_DURATION_MS;
                        if (!evt.isEmpty) {
                            window.GameInterface._triggerOffsetChange();
                        }
                    }
                });
            });
        }

        static showAds() {
            this.checkViewportSupport();
            window.googletag.cmd.push(() => {
                ACTIVE_TYPES.forEach(type => {
                    if (!this.support[type]) return;

                    if (this.slots[type]) {
                        if (this.refreshAfter[type] && this.refreshAfter[type] <= Date.now()) {
                            window.googletag.pubads().refresh([this.slots[type]]);
                        }
                    } else {
                        this.configureSlot(type);
                    }
                });
            });
        }

        static configureSlot(type) {
            const innerId = `fg-banner-inner-${type}`;
            this.slots[type] = window.googletag.defineSlot(this.adUnitPath, this.sizes[type], innerId)
                .addService(window.googletag.pubads())
                .setTargeting("bannertype", type);

            window.googletag.enableServices();
            window.googletag.display(innerId);
        }

        static getSizeKey(sizes) {
            return sizes.map(([w, h]) => `${w}x${h}`).join("|");
        }

        static checkViewportSupport() {
            const oldSupport = { ...this.support };
            const oldSizeKeys = {};

            ACTIVE_TYPES.forEach(type => {
                oldSizeKeys[type] = this.getSizeKey(this.sizes[type] || []);
            });

            const w = window.innerWidth, h = window.innerHeight;
            const ratio = w / h;
            const changedTypes = [];

            ACTIVE_TYPES.forEach(type => {
                this.support[type] = false;
                this.sizes[type] = [];

                const config = BANNER_CONFIG[type];
                let isSupported = true;

                if (config.max_ratio && ratio >= config.max_ratio) isSupported = false;
                if (config.min_ratio && ratio < config.min_ratio) isSupported = false;
                if (config.min_width && w < config.min_width) isSupported = false;
                if (config.min_height && h < config.min_height) isSupported = false;

                if (isSupported) {
                    AD_UNIT_SIZES[type].forEach(size => {
                        if (w >= size[0] && h >= size[1]) {
                            this.sizes[type].push(size);
                        }
                    });

                    if (this.sizes[type].length > 0) {
                        this.support[type] = true;
                    }
                }

                const sizesChanged =
                    oldSizeKeys[type] !== this.getSizeKey(this.sizes[type]);

                if (
                    oldSupport[type] !== this.support[type] ||
                    sizesChanged
                ) {
                    changedTypes.push(type);
                }
            });

            if (changedTypes.length > 0) {
                window.GameInterface._triggerOffsetChange();
            }

            return changedTypes;
        }

        static handleViewportResize() {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this.applyViewportResize(), 500);
        }

        static applyViewportResize() {
            const changedTypes = this.checkViewportSupport();

            if (changedTypes.length === 0) return;

            window.googletag.cmd.push(() => {
                changedTypes.forEach(type => {
                    if (!this.support[type]) {
                        if (this.slots[type]) {
                            this.fadeOutSlot(type);
                            this.destroySlotAfterFade(type);
                        }
                    
                        return;
                    }

                    clearTimeout(this.destroyTimers[type]);

                    if (this.slots[type]) {
                        window.googletag.destroySlots([this.slots[type]]);
                        this.slots[type] = null;

                        const inner = document.getElementById(
                            `fg-banner-inner-${type}`
                        );

                        if (inner) {
                            inner.replaceChildren();
                        }
                    }

                    this.configureSlot(type);
                });
            });
        }

        static getCurrentOffsets() {
            const offsets = { top: 0, bottom: 0, left: 0, right: 0 };

            ACTIVE_TYPES.forEach(type => {
                if (this.support[type] && this.sizes[type].length > 0) {
                    const compareIndex = (type === "top" || type === "bottom") ? 1 : 0;
                    
                    // Add dynamically calculated margin to the offset
                    const marginTotal = (BANNER_CONFIG[type].inner_margin || 0) * 2;
                    
                    offsets[type] = Math.max(...this.sizes[type].map(s => s[compareIndex])) + marginTotal;
                }
            });
            return offsets;
        }

        static fadeInSlot(type) {
            const container = this.containers[type];
        
            // Never show a slot that is no longer valid for the current viewport.
            if (!container || !this.support[type]) return;
        
            const transform =
                (type === "top" || type === "bottom")
                    ? "translateY(0)"
                    : "translateX(0)";
        
            container.style.transform = transform;
        }

        static fadeOutSlot(type) {
            const container = this.containers[type];
            if (!container) return;
            if (type === "top") container.style.transform = "translateY(-100%)";
            if (type === "bottom") container.style.transform = "translateY(100%)";
            if (type === "left") container.style.transform = "translateX(-100%)";
            if (type === "right") container.style.transform = "translateX(100%)";
        }

        static destroySlotAfterFade(type) {
            clearTimeout(this.destroyTimers[type]);
        
            this.destroyTimers[type] = setTimeout(() => {
                // If the placement became valid again while fading out,
                // don't destroy the slot.
                if (this.support[type]) return;
        
                if (this.slots[type]) {
                    window.googletag.destroySlots([this.slots[type]]);
                    this.slots[type] = null;
                }
        
                const inner = document.getElementById(
                    `fg-banner-inner-${type}`
                );
        
                if (inner) {
                    inner.replaceChildren();
                }
            }, CSS_FADE_DURATION_MS + SLOT_CLEANUP_DELAY_MS);
        }

        static getSlotType(slot) {
            return ACTIVE_TYPES.find(type => this.slots[type] === slot) || null;
        }
    }

    // Bootstrap securely after the DOM has parsed
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => BannerManager.init());
    } else {
        BannerManager.init();
    }
})();