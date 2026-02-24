// static/js/components/validation-banner.js
// Validation banner: persistent header bar showing field-level validation state.
// Color coding: RED = CRITICAL (blocks save), ORANGE = ADVISORY (warning only).
// Populated by MIS browser-side ValidationEngine messages via postMessage.

// ── Banner State ──────────────────────────────────────────────────────────────
const ValidationBanner = {
    SEVERITY: {
        CRITICAL: 'critical',  // RED  — blocks save
        ADVISORY: 'advisory',  // ORANGE — warning only
        OK:       'ok',        // GREEN — all clear
    },

    _bannerEl:   null,
    _statusEl:   null,
    _detailEl:   null,
    _currentFields: [],

    init() {
        this._bannerEl = document.getElementById('validation-banner');
        this._statusEl = document.getElementById('validation-banner-status');
        this._detailEl = document.getElementById('validation-banner-detail');
        if (!this._bannerEl) {
            this._createBanner();
        }
        // Listen for messages from MIS browser automation
        window.addEventListener('message', (e) => this._handleMessage(e));
        console.log('[ValidationBanner] Initialized');
    },

    _createBanner() {
        const banner = document.createElement('div');
        banner.id    = 'validation-banner';
        banner.style.cssText = [
            'display:none',
            'position:fixed',
            'top:0',
            'left:0',
            'right:0',
            'z-index:9999',
            'padding:8px 16px',
            'font-size:0.9em',
            'font-weight:600',
            'transition:background 0.3s ease',
        ].join(';');
        banner.innerHTML = `
            <span id="validation-banner-status"></span>
            <span id="validation-banner-detail" style="font-weight:400; margin-left:10px;"></span>
            <button onclick="ValidationBanner.dismiss()"
                style="float:right; background:transparent; border:none; color:inherit; cursor:pointer;">✕</button>
        `;
        document.body.prepend(banner);
        this._bannerEl = banner;
        this._statusEl = document.getElementById('validation-banner-status');
        this._detailEl = document.getElementById('validation-banner-detail');
    },

    show(severity, statusText, detailText = '') {
        if (!this._bannerEl) this.init();
        const colors = {
            [this.SEVERITY.CRITICAL]: { bg: '#dc3545', color: '#fff' },
            [this.SEVERITY.ADVISORY]: { bg: '#fd7e14', color: '#fff' },
            [this.SEVERITY.OK]:       { bg: '#28a745', color: '#fff' },
        };
        const { bg, color } = colors[severity] || colors[this.SEVERITY.ADVISORY];
        this._bannerEl.style.background    = bg;
        this._bannerEl.style.color         = color;
        this._bannerEl.style.display       = 'block';
        this._statusEl.textContent         = statusText;
        this._detailEl.textContent         = detailText;
    },

    dismiss() {
        if (this._bannerEl) this._bannerEl.style.display = 'none';
        this._currentFields = [];
    },

    showFieldResults(fieldResults) {
        this._currentFields = fieldResults;
        const criticals = fieldResults.filter(f => f.severity === 'CRITICAL' && f.status !== 'OK');
        const advisories = fieldResults.filter(f => f.severity === 'ADVISORY' && f.status !== 'OK');

        if (criticals.length > 0) {
            const names = criticals.map(f => f.field).join(', ');
            this.show(this.SEVERITY.CRITICAL,
                `❌ ${criticals.length} CRITICAL field(s) mismatch — SAVE BLOCKED`,
                `Fields: ${names}`);
        } else if (advisories.length > 0) {
            const names = advisories.map(f => f.field).join(', ');
            this.show(this.SEVERITY.ADVISORY,
                `⚠️ ${advisories.length} advisory warning(s)`,
                `Check: ${names}`);
        } else {
            this.show(this.SEVERITY.OK, '✓ All fields validated', '');
            setTimeout(() => this.dismiss(), 3000);
        }
    },

    _handleMessage(event) {
        if (!event.data || event.data.type !== 'VALIDATION_RESULT') return;
        const { fieldResults, summary } = event.data;
        if (fieldResults) {
            this.showFieldResults(fieldResults);
        } else if (summary) {
            const sev = summary.has_critical ? this.SEVERITY.CRITICAL
                      : summary.has_advisory ? this.SEVERITY.ADVISORY
                      : this.SEVERITY.OK;
            this.show(sev, summary.status_line || summary.message || '');
        }
    },
};

// Auto-init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ValidationBanner.init());
} else {
    ValidationBanner.init();
}
