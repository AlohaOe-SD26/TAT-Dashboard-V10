// state.js — Global state, tab switching, setup, profile management
// Auto-extracted from monolith by Step 7

let currentMainTab = 'setup';
let currentMISTab = 'csv-gen';
let approvedMatches = {};
let matchesData = [];
let misData = { tabName: '', csvFile: null, csvFilename: '', allLoadedTabs: [], localPath: null };
let blazeData = { rawData: [], filteredData: [], table: null };

// v12.17: Settings cache for Enhanced Create Popup
let settingsCache = {
    stores: [],
    categories: [],
    brandLinkedMap: {},
    loaded: false,
    loading: false
};

// v12.17: Load settings dropdown data from API
async function loadSettingsDropdownData(forceRefresh = false) {
    if (settingsCache.loaded && !forceRefresh) {
        console.log('[SETTINGS] Using cached settings data');
        return settingsCache;
    }
    if (settingsCache.loading) {
        console.log('[SETTINGS] Already loading, waiting...');
        while (settingsCache.loading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return settingsCache;
    }
    
    settingsCache.loading = true;
    try {
        console.log('[SETTINGS] Fetching dropdown data from API...');
        const data = await api.setup.getDropdowns();
        
        if (data.success) {
            settingsCache.stores = data.stores || [];
            settingsCache.categories = data.categories || [];
            settingsCache.brandLinkedMap = data.brand_linked_map || {};
            settingsCache.loaded = true;
            console.log('[SETTINGS] Loaded:', settingsCache.stores.length, 'stores,', settingsCache.categories.length, 'categories');
        } else {
            console.error('[SETTINGS] Failed:', data.error);
        }
    } catch (err) {
        console.error('[SETTINGS] Error:', err);
    }
    settingsCache.loading = false;
    return settingsCache;
}

const STRICT_OTD_STORES = ["Davis", "Dixon"];   
const VALID_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function switchMainTab(tabName, btnElement) {
    // 1. Hide all main sections
    document.querySelectorAll('.main-section').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });
    
    // 2. Deactivate all main buttons
    document.querySelectorAll('.main-nav-btn').forEach(b => b.classList.remove('active'));
    
    // 3. Show Target Section (Force Display Block)
    const target = document.getElementById(tabName + '-section');
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
    }
    
    // 4. Activate Button (Use 'this' if passed, else fallback)
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    currentMainTab = tabName;
    
    // 5. Handle MIS Sub-Nav Visibility
    const misNav = document.getElementById('mis-sub-nav');
    if (tabName === 'mis') {
        misNav.style.display = 'flex'; // Force Flex
    } else {
        misNav.style.display = 'none';
    }

    // 6. Blaze Tab Fix (Recalculate Table Widths)
    if (tabName === 'blaze') {
        setTimeout(function() {
            if ($.fn.DataTable.isDataTable('#promotionsTable')) {
                const table = $('#promotionsTable').DataTable();
                table.columns.adjust();
                table.draw(false); // false = don't reset paging
                // Force scroll body to recalculate
                $(window).trigger('resize');
            }
        }, 100);
    }
}

function switchMISTab(tabName, btnElement) {
    // 1. Hide all sub-sections
    document.querySelectorAll('.sub-section').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });
    
    // 2. Deactivate all sub-nav buttons
    document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
    
    // 3. Show Target (Force Display Block)
    const target = document.getElementById(tabName + '-section');
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
    }
    
    // 4. Activate Button
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    currentMISTab = tabName;
}

// ============================================
// TOAST NOTIFICATION (v12.12.11)
// ============================================
function showToast(message, type = 'info') {
    // Add animation styles if not exists
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Remove existing toast if any
    const existingToast = document.getElementById('app-toast');
    if (existingToast) existingToast.remove();
    
    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        font-weight: bold;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    
    // Set colors based on type
    if (type === 'success') {
        toast.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        toast.style.color = 'white';
    } else if (type === 'error') {
        toast.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
        toast.style.color = 'white';
    } else {
        toast.style.background = 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)';
        toast.style.color = 'white';
    }
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// RE-INJECT VALIDATION (v12.12.11)
// ============================================
async function reinjectValidation() {
    const btn = document.getElementById('reinject-validation-btn');
    const originalText = btn.innerHTML;
    
    try {
        // Update button to show loading state
        btn.innerHTML = '⏳ Injecting...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        
        const result = await api.automation.reinject();
        
        
        if (result.success) {
            // Success - flash green
            btn.innerHTML = '✅ Injected!';
            btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
            
            // Show notification
            showToast('Validation code re-injected successfully! Open a Daily Discount modal to see it.', 'success');
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                btn.style.opacity = '1';
            }, 2000);
        } else {
            // Error
            btn.innerHTML = '❌ Failed';
            btn.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
            
            showToast(result.error || 'Failed to inject validation code', 'error');
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
                btn.disabled = false;
                btn.style.opacity = '1';
            }, 3000);
        }
    } catch (error) {
        console.error('Re-inject validation error:', error);
        btn.innerHTML = '❌ Error';
        btn.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
        
        showToast('Failed to connect to server. Is the browser initialized?', 'error');
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
            btn.disabled = false;
            btn.style.opacity = '1';
        }, 3000);
    }
}

// ============================================
// DEAL TYPE SUB-TAB SWITCHING (Weekly/Monthly/Sale/All)
// ============================================