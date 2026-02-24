// static/js/api.js — v2.0
// Central API wrapper for all Flask backend calls.
// Every fetch() in tab files should route through this module.
// Extracted and expanded from monolith v12.27 + Step 8 fetch() migration audit.

// ── Core fetch wrappers ───────────────────────────────────────────────────────

async function apiPost(endpoint, body = {}, isFormData = false) {
    try {
        const opts = { method: 'POST' };
        if (isFormData) {
            opts.body = body;
        } else {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = JSON.stringify(body);
        }
        const resp = await fetch(endpoint, opts);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        return await resp.json();
    } catch (err) {
        console.error(`[API] POST ${endpoint} failed:`, err);
        return { success: false, error: err.message };
    }
}

async function apiGet(endpoint) {
    try {
        const resp = await fetch(endpoint);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        return await resp.json();
    } catch (err) {
        console.error(`[API] GET ${endpoint} failed:`, err);
        return { success: false, error: err.message };
    }
}

// ── Typed API namespace ───────────────────────────────────────────────────────
const api = {

    // ── Setup / System ────────────────────────────────────────────────────────
    setup: {
        initAll:         (body) => apiPost('/api/init-all', body),
        browserStatus:   ()     => apiGet('/api/browser-status'),
        restart:         ()     => apiPost('/api/restart'),
        getDropdowns:    ()     => apiGet('/api/get-settings-dropdowns'),
        getTaxRates:     ()     => apiGet('/api/tax-rates'),
        saveTaxRates:    (body) => apiPost('/api/save-tax-rates', body),
        getMisFolder:    ()     => apiGet('/api/get-mis-reports-folder'),
        openMisFolder:   ()     => apiGet('/api/open-mis-reports-folder'),
        getCredentials:  ()     => apiGet('/api/get-credentials'),
        saveCredentials: (body) => apiPost('/api/save-profile-credentials', body),
    },

    // ── Profiles ──────────────────────────────────────────────────────────────
    profiles: {
        list:              ()      => apiGet('/api/profiles'),
        current:           ()      => apiGet('/api/profile/current'),
        switch:            (body)  => apiPost('/api/profile/switch', body),
        register:          (body)  => apiPost('/api/profile/register', body),
        checkCreds:        (h)     => apiGet(`/api/profile/check-credentials/${h}`),
        delete:            (body)  => apiPost('/api/profile/delete', body),
        authGoogle:        ()      => apiPost('/api/auth/google'),
    },

    // ── MIS Sheet ─────────────────────────────────────────────────────────────
    sheet: {
        loadTabs:    (body) => apiPost('/api/mis/load-sheet', body),
        initPage:    (body) => apiPost('/api/mis/init-sheet-page', body),
        openRow:     (body) => apiPost('/api/mis/open-sheet-row', body),
        pullCSV:     (body) => apiPost('/api/mis/pull-csv', body),
    },

    // ── ID Matcher ────────────────────────────────────────────────────────────
    matcher: {
        generateCSV:   (body)  => apiPost('/api/mis/generate-csv', body),
        run:           (body)  => apiPost('/api/mis/match', body),
        applyMatches:  (body)  => apiPost('/api/mis/apply-matches', body),
        applyBlaze:    (body)  => apiPost('/api/mis/apply-blaze-titles', body),
        applySplitId:  (body)  => apiPost('/api/mis/apply-split-id', body),
    },

    // ── Audit ─────────────────────────────────────────────────────────────────
    audit: {
        maudit:          (fd)    => apiPost('/api/mis/maudit', fd, true),
        gsheetConflict:  (body)  => apiPost('/api/mis/gsheet-conflict-audit', body),
        conflict:        (fd)    => apiPost('/api/mis/conflict-audit', fd, true),
        cleanup:         (fd)    => apiPost('/api/mis/cleanup-audit', fd, true),
        validateLookup:  (body)  => apiPost('/api/mis/validate-lookup', body),
        compareToSheet:  (body)  => apiPost('/api/mis/compare-to-sheet', body),
        saveState:       (body)  => apiPost('/api/audit/save-state', body),
        loadState:       ()      => apiGet('/api/audit/load-state'),
        export:          (body)  => apiPost('/api/audit/export', body),
        lookupMisId:     (body)  => apiPost('/api/mis/lookup-mis-id', body),
        searchBrand:     (body)  => apiPost('/api/mis/search-brand', body),
    },

    // ── Up-Down Planning ──────────────────────────────────────────────────────
    updown: {
        planning:    (body) => apiPost('/api/mis/split-audit/planning', body),
        gapCheck:    (fd)   => apiPost('/api/mis/split-audit/gap-check', fd, true),
        final:       (fd)   => apiPost('/api/mis/split-audit/final', fd, true),
        finalCheck:  (fd)   => apiPost('/api/mis/split-audit/final-check', fd, true),
        fuzzySuggest:(body) => apiPost('/api/mis/split-audit/fuzzy-suggestions', body),
    },

    // ── Automation ────────────────────────────────────────────────────────────
    automation: {
        createDeal:       (body) => apiPost('/api/mis/create-deal', body),
        autoCreate:       (body) => apiPost('/api/mis/automate-create-deal', body),
        updateEndDate:    (body) => apiPost('/api/mis/update-end-date', body),
        autoEndDate:      (body) => apiPost('/api/mis/automate-end-date', body),
        injectValidation: ()     => apiPost('/api/mis/inject-validation'),
        reinject:         ()     => apiPost('/api/mis/inject-validation'),
    },

    // ── Blaze ─────────────────────────────────────────────────────────────────
    blaze: {
        refresh:            ()      => apiGet('/api/blaze/refresh'),
        getCache:           ()      => apiGet('/api/blaze/get-cache'),
        navigate:           (body)  => apiPost('/api/blaze/navigate', body),
        createDiscount:     (body)  => apiPost('/api/blaze/create-discount', body),
        exportFilteredCSV:  (body)  => apiPost('/api/blaze/export-filtered-csv', body),
        zombieDisable:      (body)  => apiPost('/api/blaze/zombie-disable', body),
        updateTags:         (body)  => apiPost('/api/blaze/update-tags', body),
        ecomSync:           (body)  => apiPost('/api/blaze/ecom-sync', body),
        inventory: {
            status:           ()      => apiGet('/api/blaze/inventory/status'),
            listReports:      ()      => apiGet('/api/blaze/inventory/list-reports'),
            loadReport:       (body)  => apiPost('/api/blaze/inventory/load-report', body),
            fetch:            (body)  => apiPost('/api/blaze/inventory/fetch', body),
            getTabData:       (body)  => apiPost('/api/blaze/inventory/get-tab-data', body),
            navigateToProduct:(body)  => apiPost('/api/blaze/inventory/navigate-to-product', body),
            exportTabs:       (body)  => apiPost('/api/blaze/inventory/export-tabs', body),
        },
    },
};

// ── Migration shims ───────────────────────────────────────────────────────────
// These thin wrappers allow existing inline fetch() calls in tab files to
// migrate incrementally to the api.* namespace without breaking.

// Used in state.js / mis-audit.js
async function fetchGet(endpoint) { return apiGet(endpoint); }
async function fetchPost(endpoint, body, isFormData = false) {
    return apiPost(endpoint, body, isFormData);
}
