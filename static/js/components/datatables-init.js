// static/js/components/datatables-init.js
// DataTables initialization, search enhancements, OTD price modal, audit row rendering
// Extracted from monolith v12.27 by Step 7

function setupSearchEnhancements() {
// Find all search inputs
document.querySelectorAll('input[type="search"]').forEach(searchInput => {
// Check if there's a button/icon next to it
const parent = searchInput.parentElement;

// Look for magnifying glass icon (common patterns)
const searchIcon = parent.querySelector('.bi-search, .fa-search, [class*="search-icon"]');

if (searchIcon) {
    searchIcon.style.cursor = 'pointer';
    searchIcon.addEventListener('click', function() {
        // Trigger ENTER key on the search input
        const enterEvent = new KeyboardEvent('keypress', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
        });
        searchInput.dispatchEvent(enterEvent);
        
        // Also trigger change event for DataTables
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

// Add ENTER key handler if not already present
if (!searchInput.dataset.enterHandlerAdded) {
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Trigger search
            this.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
    searchInput.dataset.enterHandlerAdded = 'true';
}
});

// Find all buttons near search inputs
document.querySelectorAll('button').forEach(btn => {
const btnText = btn.textContent.trim().toLowerCase();
if (btnText.includes('search') || btnText.includes('filter')) {
    const nearbySearch = btn.parentElement?.querySelector('input[type="search"]') ||
                        btn.closest('.filter-group')?.querySelector('input[type="search"]');
    
    if (nearbySearch) {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function() {
            const enterEvent = new KeyboardEvent('keypress', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            });
            nearbySearch.dispatchEvent(enterEvent);
            nearbySearch.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
}
});
}

// ============================================
// AUTO-LOAD CREDENTIALS
// ============================================
async function autoLoadCredentials() {
    try {
        const data = await api.setup.getCredentials();
        
        if (data.success && data.credentials) {
            const creds = data.credentials;
            
            // Auto-fill MIS credentials
            if (creds.mis) {
                document.getElementById('mis-username').value = creds.mis.username || '';
                document.getElementById('mis-password').value = creds.mis.password || '';
                console.log('[AUTO-FILL] MIS credentials loaded');
            }
            
            // Auto-fill Blaze credentials
            if (creds.blaze) {
                document.getElementById('blaze-email').value = creds.blaze.email || '';
                document.getElementById('blaze-password').value = creds.blaze.password || '';
                console.log('[AUTO-FILL] Blaze credentials loaded');
            }
            
            // Auto-fill and load Google Sheet
            if (creds.google_sheet && creds.google_sheet.default_url) {
                const urlInput = document.getElementById('mis-sheet-url');
                urlInput.value = creds.google_sheet.default_url;
                console.log('[AUTO-FILL] Google Sheet URL loaded');
                
                // Auto-trigger load tabs
                setTimeout(function() {
                    autoLoadSheetTabs();
                }, 2000); // Wait 2 seconds after auth
            }
        }
    } catch (error) {
        console.log('[INFO] No credentials config found (this is optional)');
    }
}

async function autoLoadSheetTabs() {
    const urlInput = document.getElementById('mis-sheet-url');
    const url = urlInput.value;
    
    if (!url) return;
    
    console.log('[AUTO-LOAD] Loading sheet tabs...');
    
    try {
        const data = await api.sheet.loadTabs({url: url});
        
        if (data.success) {
            misData.allLoadedTabs = data.tabs;
            // v12.1: Store spreadsheet ID globally for goToSheetRow
            window.globalSpreadsheetId = data.spreadsheet_id || '';
            renderTabOptions();
            if (document.getElementById('mis-tab').options.length > 0) {
                misData.tabName = document.getElementById('mis-tab').value;
            }
            console.log('[AUTO-LOAD] Sheet tabs loaded successfully');
        } else {
            console.log('[AUTO-LOAD] Failed to load sheet tabs:', data.error);
        }
    } catch (error) {
        console.log('[AUTO-LOAD] Error loading sheet tabs:', error.message);
    }
}

async function autoAuthenticateGoogle() {
    console.log('[AUTO-AUTH] Attempting Google Sheets authentication...');
    
    try {
        // Wait for browser to be ready
        let attempts = 0;
        while (!document.getElementById('browser-ready-text').textContent.includes('Ready') && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        const data = await api.profiles.authGoogle();
        
        if (data.success) {
            document.getElementById('auth-status').innerHTML = '<p class="alert alert-success">[OK] Auto-authenticated successfully!</p>';
            console.log('[AUTO-AUTH] Google Sheets authenticated');
        } else {
            document.getElementById('auth-status').innerHTML = '<p class="alert alert-warning">[!] ⚠️⚠️  Auto-auth failed. Please authenticate manually.</p>';
            console.log('[AUTO-AUTH] Failed:', data.error);
        }
    } catch (error) {
        console.log('[AUTO-AUTH] Error:', error.message);
    }
}

// ============================================
// DATATABLE SEARCH: Add Search Button
// ============================================
function enhanceDataTableSearch() {
    // Wait for DataTable to exist
    if ($.fn.DataTable && $.fn.DataTable.isDataTable('#promotionsTable')) {
        const table = $('#promotionsTable').DataTable();
        
        // Find the DataTables search input (auto-generated)
        const dtSearch = $('.dataTables_filter input[type="search"]');
        
        if (dtSearch.length > 0) {
            // Check if button already exists
            if (!dtSearch.next('.search-trigger-btn').length) {
                // Create search button
                const searchBtn = $('<button>')
                    .addClass('btn btn-sm btn-primary search-trigger-btn')
                    .html('<i class="bi bi-search"></i>')
                    .css({
                        'marginLeft': '5px',
                        'padding': '4px 12px'
                    })
                    .on('click', function() {
                        const searchValue = dtSearch.val();
                        table.search(searchValue).draw();
                    });
                
                // Insert button after search input
                dtSearch.after(searchBtn);
                
                console.log('[SEARCH] DataTable search button added');
            }
        }
    }
}

function renderAuditRow(r, idx, groupId, hasMissingWeekday) {
    const statusClass = r.status.includes('MATCH') ? 'status-match' : 
                       r.status.includes('NOT FOUND') ? 'status-error' : 'status-warning';
    
    const rowBtn = renderRowButton(r.google_row);
    const brandCell = renderBrandCell(r.brand, idx, 'audit');
    const misIdCell = renderMisIdCell(r.mis_id, r);  // Pass full row data for validation
    
    let weekdayDisplay = r.weekday || '-';
    if (!r.weekday || r.weekday.trim() === '') {
        weekdayDisplay = '<span class="weekday-missing-icon">[!] ⚠️⚠️ </span><span style="color:#dc3545; font-style:italic;">MISSING</span>';
    }
    
    const hasDiscrepancies = r.discrepancies && r.discrepancies.length > 0;
    let reviewBtn = '-';
    if (hasDiscrepancies && !(hasMissingWeekday && (!r.weekday || r.weekday.trim() === ''))) {
        reviewBtn = `<button class="btn-review" onclick="reviewDiscrepancy('${r.mis_id}', ${r.google_row})">Review</button>`;
    }
    
    const truncate = (text, len) => {
        if (!text) return '-';
        text = String(text);
        return text.length > len ? text.substring(0, len) + '...' : text;
    };
    
    // v12.1: Format locations with numbered list for tooltip
    const formatLocationsNumbered = (locStr) => {
        if (!locStr || locStr === '-') return '-';
        const locs = locStr.split(',').map(l => l.trim()).filter(l => l);
        return locs.map((loc, i) => (i + 1) + '. ' + loc).join('&#10;');
    };
    const locationsTooltip = formatLocationsNumbered(r.locations);
    
    const rowClass = groupId ? `group-member-row group-${groupId}` : '';
    const warningClass = (hasMissingWeekday && (!r.weekday || r.weekday.trim() === '')) ? 'missing-weekday-warning' : '';
    
    // --- YELLOW BACKGROUND LOGIC ---
    // If this row is part of a group, force the background color to yellow
    const bgStyle = groupId ? 'style="background-color: #fff3cd !important;"' : '';
    
    return `<tr id="audit-row-${idx}" class="${rowClass} ${warningClass}" ${bgStyle}>
        <td>${rowBtn}</td>
        <td>${misIdCell}</td>
        <td>${brandCell}</td>
        <td>${weekdayDisplay}</td>
        <td title="${r.special_notes}">${truncate(r.special_notes, 15)}</td>
        <td title="${r.deal_info}">${truncate(r.deal_info, 15)}</td>
        <td>${r.discount}%</td>
        <td>${r.vendor_contrib}%</td>
        <td title="${locationsTooltip}">${truncate(r.locations, 25)}</td>
        <td title="${r.categories}">${truncate(r.categories, 15)}</td>
        <td><span class="status-badge ${statusClass}">${r.status}</span></td>
        <td>${r.discrepancies.join('<br>') || '-'}</td>
        <td>${reviewBtn}</td>
    </tr>`;
}

async function reviewDiscrepancy(misId, googleRow) {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = '...';
    btn.disabled = true;
    
    try {
        const data = await api.audit.reviewDiscrepancy({ mis_id: misId, google_row: googleRow });
        if (!data.success) {
            alert('Error: ' + data.error);
        }
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function authenticateGoogle() {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Authenticating...';
    
    try {
        const data = await api.profiles.authGoogle();
        
        if (data.success) {
            document.getElementById('auth-status').innerHTML = '<p class="alert alert-success">[OK] Success!</p>';
        } else {
            document.getElementById('auth-status').innerHTML = '<p class="alert alert-error">Error: ' + data.error + '</p>';
        }
    } catch (error) {
        document.getElementById('auth-status').innerHTML = '<p class="alert alert-error">Error: ' + error.message + '</p>';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Authenticate Google Sheets';
    }
}

async function loadMISSheetTabs() {
    const url = document.getElementById('mis-sheet-url').value;
    if (!url) {
        alert('Please enter a URL');
        return;
    }
    
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Loading...';
    
    try {
        const data = await api.sheet.loadTabs({url: url});
        
        if (data.success) {
            misData.allLoadedTabs = data.tabs;
            // v12.1: Store spreadsheet ID globally for goToSheetRow
            window.globalSpreadsheetId = data.spreadsheet_id || '';
            renderTabOptions();
            if (document.getElementById('mis-tab').options.length > 0) {
                misData.tabName = document.getElementById('mis-tab').value;
            }
        } else {
            alert('Error: ' + data.error);
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Load Tabs';
    }
}

function renderTabOptions() {
    const select = document.getElementById('mis-tab');
    const showAll = document.getElementById('mis-show-all-tabs').checked;
    const currentSelection = select.value;
    
    const filteredTabs = showAll ? misData.allLoadedTabs : misData.allLoadedTabs.filter(tab => {
        const parts = tab.trim().split(' ');
        if (parts.length !== 2) return false;
        const month = parts[0].toLowerCase();
        const year = parts[1];
        return VALID_MONTHS.includes(month) && /^\d{4}$/.test(year);
    });
    
    if (filteredTabs.length === 0) {
        select.innerHTML = '<option value="">-- No matching tabs --</option>';
    } else {
        select.innerHTML = filteredTabs.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    
    if (currentSelection && filteredTabs.includes(currentSelection)) {
        select.value = currentSelection;
    } else if (filteredTabs.length > 0) {
        select.value = filteredTabs[0];
    }
}

async function initializeSheetPage(btnElement) {
    const tab = document.getElementById('mis-tab').value;
    if (!tab) {
        alert('Select a tab first');
        return;
    }
    
    // Use the passed element
    const btn = btnElement;
    
    btn.disabled = true;
    btn.textContent = 'Opening...';
    
    try {
        const data = await api.sheet.initPage({tab: tab});
        
        // Alert result
        if (data.success) {
            // Optional: auto-close alert after 2s or just show it
            alert('[OK] ' + data.message);
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Network/Server Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Open Sheet';
    }
}

function handleMISCSV(input) {
if (input.files.length > 0) {
// Manual upload overrides pulled CSV
misData.csvFile = input.files[0];
misData.csvFilename = input.files[0].name;
misData.pulledCSVPath = null; // Clear pulled path

// Re-enable the input
input.disabled = false;
input.style.opacity = '1';

document.getElementById('mis-csv-status').innerHTML = `
    <div class="alert alert-info p-2 mb-0" style="font-size: 0.9rem;">
        <strong> Manual Upload:</strong> ${misData.csvFilename}
    </div>
`;

console.log('[MANUAL-CSV] User uploaded:', misData.csvFilename);
}
}

// v10.7: Open MIS Reports folder in file explorer
async function openMisReportsFolder() {
    try {
        const data = await api.setup.openMisFolder();
        if (!data.success) {
            alert('Could not open folder: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// v10.7: Load MIS Reports folder path on page load
async function loadMisReportsFolderPath() {
    try {
        const data = await api.setup.getMisFolder();
        if (data.success) {
            document.getElementById('mis-csv-folder-path').innerHTML = 
                '<i class="bi bi-folder"></i> ' + data.path;
        }
    } catch (e) {
        console.log('Could not load MIS folder path');
    }
}

async function pullMisCsv(btn) {
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    
    try {
        // Get credentials from Setup tab
        const misUsername = document.getElementById('mis-username').value;
        const misPassword = document.getElementById('mis-password').value;
        
        const response = await api.sheet.pullCSV({
                mis_username: misUsername,
                mis_password: misPassword
            });
        const data = await response.json();
        
        if (data.success) {
            misData.localPath = data.path;
            misData.csvFile = null; // Auto-pull overrides manual file
            
            // Store globally so Matcher and Audit can use it
            misData.csvFilename = data.filename;
            misData.pulledCSVPath = data.path;
            
            // Clear the file input visually so user knows automation took over
            // Can't set file input value (security), but create a visual "Active CSV" indicator
            document.getElementById('mis-csv').value = ''; 
            document.getElementById('mis-csv-status').innerHTML = `
                <div class="alert alert-success p-2 mb-0" style="font-size: 0.9rem;">
                    <strong>[OK]✅ Active CSV:</strong> ${data.filename}
                    <br><small class="text-muted">This CSV will be automatically used by ID Matcher and Audit tabs</small>
                </div>
            `;

            // Also disable the file input to show automation is active
            document.getElementById('mis-csv').disabled = true;
            document.getElementById('mis-csv').style.opacity = '0.5';
            
            console.log('[CSV-PULL] CSV stored and ready for Matcher/Audit tabs');
            console.log('[CSV-PULL] Filename:', data.filename);
            console.log('[CSV-PULL] Path:', data.path);
        } else {
            alert("Pull Failed: " + data.error);
        }
    } catch (e) {
        alert("Network Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}

async function initializeAllSystems(btnElement) {
    const btn = btnElement;
    btn.disabled = true;
    btn.textContent = 'Initializing...';
    
    try {
        const response = await api.setup.initAll({
                mis: {
                    username: document.getElementById('mis-username').value,
                    password: document.getElementById('mis-password').value
                },
                blaze: {
                    email: document.getElementById('blaze-email').value,
                    password: document.getElementById('blaze-password').value
                }
            });
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('init-status').innerHTML = '<p class="alert alert-success">' + data.message + '</p>';
            
            if (data.message.includes("Blaze login successful")) {
                console.log("Triggering ONE-TIME auto-fetch for Blaze...");
                const blazeBtn = document.querySelector("button[onclick='fetchBlazeData()']");
                if (blazeBtn) blazeBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Auto-Syncing...';
                setTimeout(() => { fetchBlazeData(true); }, 5000);
            }
        } else {
            document.getElementById('init-status').innerHTML = '<p class="alert alert-error">Error: ' + data.error + '</p>';
        }
    } catch (error) {
        document.getElementById('init-status').innerHTML = '<p class="alert alert-error">Network Error: ' + error.message + '</p>';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Initialize Browser & Login to Both Systems';
    }
}

    function displayGeneratedCSV(data) {
    const containerId = 'gen-results';
    const sections = data.sections;
    
    const sectionTitles = {
        'weekly': ' WEEKLY DEALS',
        'monthly': ' MONTHLY DEALS',
        'sale': ' SALE DEALS'
    };
    
    // Count items per section
    const counts = {
        weekly: (sections.weekly?.rows || []).length,
        monthly: (sections.monthly?.rows || []).length,
        sale: (sections.sale?.rows || []).length
    };
    
    // Header and download buttons
    let headerHtml = '<h3>Generated MIS CSV (Multi-Section)</h3>';
    headerHtml += '<div style="margin-bottom:20px; display:flex; gap:10px; flex-wrap:wrap;">';
    headerHtml += '<button class="btn btn-success" onclick="downloadCSV(\'all\')"> Download ALL</button>';
    headerHtml += '<button class="btn btn-outline-primary" onclick="downloadCSV(\'weekly\')"> Weekly Only</button>';
    headerHtml += '<button class="btn btn-outline-info" onclick="downloadCSV(\'monthly\')"> Monthly Only</button>';
    headerHtml += '<button class="btn btn-outline-warning" onclick="downloadCSV(\'sale\')"> Sale Only</button>';
    headerHtml += '<button class="btn btn-secondary" onclick="generateCSV()"> Regenerate</button>';
    headerHtml += '<button class="btn btn-purple" style="background:#6f42c1; color:white; border:none;" onclick="generateNewsletterTable()"> Generate Newsletter Table</button>';
    headerHtml += '</div>';
    
    // Generate deal type tabs
    headerHtml += generateDealTypeTabsHTML(containerId, counts);
    
    // Helper function to build a section's HTML
    function buildSectionHTML(secKey) {
        const secData = sections[secKey];
        const rows = secData?.rows || [];
        const title = sectionTitles[secKey];
        let sectionHtml = '';
        
        sectionHtml += `<div class="card mb-4 shadow-sm">`;
        sectionHtml += `<div class="card-header bg-light"><strong>${title}</strong> (${rows.length} rows)</div>`;
        sectionHtml += `<div class="card-body p-0">`;
        
        if (rows.length === 0) {
            sectionHtml += '<div class="p-3 text-muted">No data in this section.</div>';
        } else {
            sectionHtml += '<div class="scrollable-table-container" style="max-height:500px;">';
            sectionHtml += '<table class="table table-sm table-striped mb-0" style="font-size:0.85em; border-collapse: separate; border-spacing: 0;">';
            sectionHtml += '<thead style="position:sticky; top:0; z-index:5; background:white;"><tr>';
            sectionHtml += '<th style="width:40px;">[OK]</th><th>Weekday</th><th>Brand</th><th>Linked</th><th>Notes</th><th>Info</th><th>Disc</th><th>Vend%</th><th>Store</th><th>Cat</th><th>Type</th><th>Flag</th>';
            sectionHtml += '</tr></thead><tbody>';
            
            rows.forEach(r => {
                const isMultiDay = r.MULTI_DAY_FLAG !== 'NO';
                const isSplit = r.SPLIT_GROUP_ID && r.SPLIT_GROUP_ID !== "";
                
                let bgStyle = '';
                if (isMultiDay) bgStyle = 'background:#fff3cd;'; 
                if (isSplit) bgStyle = 'background:#e2e3e5;';    
                
                let borderStyle = 'border-bottom: 1px solid #dee2e6;';
                if (isSplit) {
                    const borderColor = '#6c757d'; 
                    const borderWidth = '2px';
                    borderStyle = `border-left: ${borderWidth} solid ${borderColor}; border-right: ${borderWidth} solid ${borderColor};`;
                    if (r.ROW_UI_CLASS === 'split-group-start') {
                        borderStyle += `border-top: ${borderWidth} solid ${borderColor}; border-bottom: 1px dotted #ccc;`;
                    } else if (r.ROW_UI_CLASS === 'split-group-end') {
                        borderStyle += `border-bottom: ${borderWidth} solid ${borderColor};`;
                    } else {
                        borderStyle += `border-bottom: 1px dotted #ccc;`;
                    }
                }

                const checkboxCellStyle = 'border-bottom: 1px solid #dee2e6; background: #fff; text-align: center; vertical-align: middle;';

                let weekdayHtml = r.Weekday;
                const days = r.Weekday.split(', ');
                if (days.length > 4) {
                    const chunks = [];
                    for (let i = 0; i < days.length; i += 4) {
                        chunks.push(days.slice(i, i + 4).join(', '));
                    }
                    weekdayHtml = chunks.join(',<br>');
                }

                const buildCellContent = (dataArray, keyName) => {
                    if (!dataArray || dataArray.length === 0) return { display: '<span style="color:#ccc;">-</span>', tooltip: '' };
                    const firstVal = dataArray[0][keyName]; 
                    const truncated = firstVal.length > 25 ? firstVal.substring(0, 22) + '...' : firstVal;
                    let display = dataArray.length > 1 ? `<span style="font-weight:500;">${truncated} <span style="color:#667eea; font-weight:bold;">(...)</span></span>` : `<span>${truncated}</span>`;
                    const lines = dataArray.map(item => `<strong>Row ${item.row} (${item.day}):</strong> ${item[keyName]}`);
                    const tooltip = lines.join('<br>').replace(/"/g, '&quot;');
                    return { display: display, tooltip: tooltip };
                };

                const notesObj = buildCellContent(r.UI_SPECIAL_NOTES, 'note');
                const infoObj = buildCellContent(r.UI_DEAL_INFO, 'info');

                let rebateDisplay = r.UI_REBATE_DISPLAY;
                let rebateStyle = borderStyle;
                if (rebateDisplay === 'Retail') rebateStyle += ' color:#dc3545; font-weight:bold;';
                else if (rebateDisplay === 'Wholesale') rebateStyle += ' color:#198754; font-weight:500;';

                const locRaw = r.DISPLAY_STORE || r.Store || '-';
                let locHtml = locRaw;
                let locStyle = '';
                if (locRaw === 'All Locations') {
                    locStyle = 'color: #28a745; font-weight: bold;';
                } else if (String(locRaw).toLowerCase().includes('all locations except')) {
                    locStyle = 'color: #dc3545; font-weight: bold;';
                    const match = locRaw.match(/: (.*)/);
                    if (match) {
                        const parts = match[1].split(',').map(s => s.trim());
                        if (parts.length > 2) locHtml = `All Locations Except: ${parts[0]}, ${parts[1]}...`;
                    }
                } else {
                    const parts = String(locRaw).split(',').map(s => s.trim());
                    if (parts.length > 2) locHtml = `${parts[0]}, ${parts[1]}...`;
                }

                let flagContent = r.MULTI_DAY_FLAG;
                if (isMultiDay && flagContent.includes('YES')) {
                    flagContent = flagContent.replace('YES (', 'YES<br>(');
                }

                const flagBadge = isMultiDay 
                    ? `<span style="background:#ffc107; padding:4px 8px; border-radius:12px; font-size:0.75em; font-weight:bold; display:inline-block; text-align:center; line-height:1.1;">&#x3030;📅 ${flagContent}</span>`
                    : '<span style="color:#999;">-</span>';
                
                const displayCat = r.DISPLAY_CATEGORY || r.Category || '-';

                let warningEmoji = '';
                const rebateType = r.UI_REBATE_DISPLAY || r['Rebate type'] || '';
                if (rebateType === 'Retail') {
                    warningEmoji = '<span style="font-size:1.2em; margin-right:5px;" title="Retail Rebate Reporting">🚨🚨🚨🚨</span>';
                } else if (!rebateType || rebateType.trim() === '') {
                    warningEmoji = '<span style="font-size:1.2em; margin-right:5px;" title="Wholesale/Retail Value = BLANK">[!] ⚠️⚠️ </span>';
                }

                sectionHtml += `<tr style="${bgStyle}">`;
                sectionHtml += `<td style="${checkboxCellStyle}">${warningEmoji}<input type="checkbox" style="cursor: pointer; width: 18px; height: 18px;"></td>`;
                sectionHtml += `<td style="${borderStyle} white-space:nowrap;"><strong>${weekdayHtml}</strong></td>`;
                sectionHtml += `<td style="${borderStyle} font-weight:bold;">${r.Brand}</td>`;
                sectionHtml += `<td style="${borderStyle} color:#666;">${r['Linked Brand (if applicable)'] || '-'}</td>`;
                sectionHtml += `<td style="${borderStyle} cursor:help;" data-bs-toggle="tooltip" data-bs-html="true" title="${notesObj.tooltip}">${notesObj.display}</td>`;
                sectionHtml += `<td style="${borderStyle} cursor:help;" data-bs-toggle="tooltip" data-bs-html="true" title="${infoObj.tooltip}">${infoObj.display}</td>`;
                sectionHtml += `<td style="${borderStyle}">${r['Daily Deal Discount']}%</td>`;
                sectionHtml += `<td style="${borderStyle}">${r['Discount paid by vendor']}%</td>`;
                sectionHtml += `<td style="${borderStyle} ${locStyle}" title="${locRaw}">${locHtml}</td>`;
                sectionHtml += `<td style="${borderStyle}">${displayCat}</td>`;
                sectionHtml += `<td style="${rebateStyle}">${rebateDisplay}</td>`;
                sectionHtml += `<td style="${borderStyle}">${flagBadge}</td>`;
                sectionHtml += `</tr>`;
            });
            
            sectionHtml += '</tbody></table></div>';
        }
        sectionHtml += '</div></div>';
        return sectionHtml;
    }
    
    // Build content for each section
    const sectionContents = {
        weekly: buildSectionHTML('weekly'),
        monthly: buildSectionHTML('monthly'),
        sale: buildSectionHTML('sale')
    };
    
    // Build the "All Deals" view (stacked)
    let allHtml = sectionContents.weekly + sectionContents.monthly + sectionContents.sale;
    
    // Build final HTML with containers
    let finalHtml = headerHtml;
    finalHtml += `<div id="${containerId}-weekly" class="deal-type-content">${sectionContents.weekly}</div>`;
    finalHtml += `<div id="${containerId}-monthly" class="deal-type-content">${sectionContents.monthly}</div>`;
    finalHtml += `<div id="${containerId}-sale" class="deal-type-content">${sectionContents.sale}</div>`;
    finalHtml += `<div id="${containerId}-all" class="deal-type-content active" style="display:block;">${allHtml}</div>`;
    
    document.getElementById('gen-results').innerHTML = finalHtml;
    
    setTimeout(function() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }, 500);
}

async function generateCSV() {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Generating...';
    
    try {
        const tab = document.getElementById('mis-tab').value;
        const data = await api.matcher.generateCSV({tab: tab});
        
        if (data.success) {
            displayGeneratedCSV(data);
        } else {
            alert('Error: ' + data.error);
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate CSV';
    }
}

async function downloadCSV(type = 'all') {
    window.location.href = `/api/mis/download-csv?type=${type}`;
}

async function generateNewsletterTable() {
    // Generate Newsletter files (Excel + DOCX) and save to REPORTS/Newsletter folder
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generating...';
    
    try {
        const data = await api.matcher.generateNewsletter();
        
        
        if (data.success) {
            // Show success message with folder path
            const folderPath = data.folder;
            const counts = data.counts;
            
            let message = '[OK]✅ Newsletter files generated successfully!\\n\\n';
            message += ' Saved to:\\n' + folderPath + '\\n\\n';
            message += ' Files created:\\n';
            if (data.files.excel) message += '  &#x2022; Excel (6 tabs)\\n';
            if (data.files.club420_docx) message += '  &#x2022; CLUB420_Newsletter.docx\\n';
            if (data.files.tat_legacy_docx) message += '  &#x2022; TAT_LEGACY_Newsletter.docx\\n';
            message += '\\n📊 Deal counts:\\n';
            message += '  CLUB420: Weekly=' + counts.club420.weekly + ', Monthly=' + counts.club420.monthly + ', Sale=' + counts.club420.sale + '\\n';
            message += '  TAT LEGACY: Weekly=' + counts.tat_legacy.weekly + ', Monthly=' + counts.tat_legacy.monthly + ', Sale=' + counts.tat_legacy.sale;
            
            alert(message);
        } else {
            alert('Error: ' + (data.error || 'Failed to generate newsletter'));
        }
    } catch (error) {
        alert('Network Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function runMatcher() {
const tab = document.getElementById('mis-tab').value;
if (!tab) {
alert('Please select a sheet tab in Setup first');
return;
}
// Note: Removed csvFile check - backend will handle both uploaded and pulled CSV
    
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Running...';
    
    const focusEnabled = document.getElementById('matcher-focus-enable').checked;
    const focusDate = document.getElementById('matcher-focus-date').value;
    const expandMonth = document.getElementById('matcher-focus-expand').checked;

    if (focusEnabled && !focusDate) {
        alert("Please select a date for Focus mode.");
        btn.disabled = false; btn.textContent = 'Run Matcher';
        return;
    }

    const formData = new FormData();
    formData.append('tab', tab);
    
    // ATTACH FILE OR PATH (Updated logic)
    if (misData.csvFile) {
        formData.append('csv', misData.csvFile);
    } else if (misData.localPath) {
        formData.append('local_csv_path', misData.localPath);
    }

    formData.append('focus_enabled', focusEnabled);
    formData.append('focus_date', focusDate);
    formData.append('expand_month', expandMonth);
    
    try {
        const data = await api.matcher.run(formData, true);
        
        if (data.success) {
            matchesData = data.matches; 
            displayMatchResults(data.matches);
            // v12.5: Reset apply buttons visibility after new matcher run
            approvedMatches = {};
            updateApplyButtonsVisibility();
        } else {
            alert('Error: ' + data.error);
        }
    } catch(e) { alert(e); } 
    finally {
        btn.disabled = false;
        btn.textContent = 'Run Matcher';
    }
}

// ============================================
// v12.1: ID Matcher Subtab Switching
// ============================================
function switchIdMatcherSubTab(tabName, clickedElement) {
    // Hide all subtab content
    document.querySelectorAll('.id-matcher-subtab-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('#idMatcherSubTabs .nav-link').forEach(el => {
        el.classList.remove('active');
    });
    
    // Show selected subtab
    const targetEl = document.getElementById('id-matcher-subtab-' + tabName);
    if (targetEl) {
        targetEl.style.display = 'block';
    }
    
    // Add active class to clicked tab
    if (clickedElement) {
        clickedElement.classList.add('active');
    }
}

// ============================================
// v12.1: MAudit - Google Sheet vs MIS CSV Verification
// ============================================
async function runMAudit() {
    const statusEl = document.getElementById('maudit-status');
    const resultsEl = document.getElementById('maudit-results');
    
    statusEl.textContent = 'Running verification...';
    resultsEl.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div><div class="mt-2">Verifying deals against MIS CSV...</div></div>';
    
    try {
        const tab = document.getElementById('mis-tab').value;
        if (!tab) {
            alert('Please select a sheet tab in Setup first');
            statusEl.textContent = '';
            resultsEl.innerHTML = '<p class="text-muted">Select a sheet tab first.</p>';
            return;
        }
        
        const formData = new FormData();
        formData.append('tab', tab);
        
        if (misData.csvFile) {
            formData.append('csv', misData.csvFile);
        } else if (misData.localPath) {
            formData.append('local_csv_path', misData.localPath);
        }
        
        const data = await api.audit.maudit(formData, true);
        
        if (data.success) {
            statusEl.textContent = 'Verification complete';
            renderMAuditResults(data.results);
        } else {
            statusEl.textContent = 'Error';
            resultsEl.innerHTML = `<div class="alert alert-danger">Error: ${data.error}</div>`;
        }
    } catch (error) {
        statusEl.textContent = 'Error';
        resultsEl.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

function renderMAuditResults(results) {
    const container = document.getElementById('maudit-results');
    
    if (!results || (results.verified.length === 0 && results.mismatches.length === 0 && 
        results.not_found.length === 0 && results.missing_id.length === 0)) {
        container.innerHTML = '<div class="alert alert-info">No results to display. Make sure the sheet has data and MIS CSV is loaded.</div>';
        return;
    }
    
    let html = '';
    
    // Summary stats
    const totalVerified = results.verified?.length || 0;
    const totalMismatches = results.mismatches?.length || 0;
    const totalNotFound = results.not_found?.length || 0;
    const totalMissingId = results.missing_id?.length || 0;
    const total = totalVerified + totalMismatches + totalNotFound + totalMissingId;
    
    html += `<div class="d-flex gap-3 mb-3 flex-wrap">
        <span class="badge bg-success fs-6">Verified: ${totalVerified}</span>
        <span class="badge bg-warning text-dark fs-6">Mismatches: ${totalMismatches}</span>
        <span class="badge bg-danger fs-6">Not Found: ${totalNotFound}</span>
        <span class="badge bg-secondary fs-6">Missing MIS ID: ${totalMissingId}</span>
        <span class="badge bg-dark fs-6">Total: ${total}</span>
    </div>`;
    
    // Missing MIS ID section
    if (results.missing_id && results.missing_id.length > 0) {
        html += `<div class="card mb-3 border-secondary">
            <div class="card-header bg-secondary text-white">
                <strong>Missing MIS ID (${results.missing_id.length})</strong>
                <small class="ms-2">- Deals without MIS IDs in Google Sheet</small>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-sm table-bordered mb-0">
                        <thead class="table-light">
                            <tr><th style="width:60px;">Row</th><th>Section</th><th>Brand</th><th>Day/Dates</th><th>Discount</th><th>Locations</th></tr>
                        </thead>
                        <tbody>`;
        
        results.missing_id.forEach(item => {
            const sectionBadge = getSectionBadge(item.section);
            const rowBtn = window.globalSpreadsheetId ? 
                `<button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="openSheetRow(${item.row})" title="Go to row ${item.row}">${item.row}</button>` : 
                item.row;
            html += `<tr>
                <td>${rowBtn}</td>
                <td>${sectionBadge}</td>
                <td>${item.brand || '-'}</td>
                <td>${item.weekday || item.start_date || '-'}</td>
                <td>${item.discount || '-'}</td>
                <td><small>${item.locations || '-'}</small></td>
            </tr>`;
        });
        
        html += `</tbody></table></div></div></div>`;
    }
    
    // Not Found in CSV section
    if (results.not_found && results.not_found.length > 0) {
        html += `<div class="card mb-3 border-danger">
            <div class="card-header bg-danger text-white">
                <strong>Not Found in CSV (${results.not_found.length})</strong>
                <small class="ms-2">- MIS IDs not found in uploaded CSV</small>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-sm table-bordered mb-0">
                        <thead class="table-light">
                            <tr><th style="width:60px;">Row</th><th>Section</th><th>Brand</th><th>MIS ID</th><th>Day/Dates</th><th>Discount</th></tr>
                        </thead>
                        <tbody>`;
        
        results.not_found.forEach(item => {
            const sectionBadge = getSectionBadge(item.section);
            const rowBtn = window.globalSpreadsheetId ? 
                `<button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="openSheetRow(${item.row})" title="Go to row ${item.row}">${item.row}</button>` : 
                item.row;
            
            // Enhanced MIS ID button with row data for validation
            const rowDataJson = JSON.stringify({
                brand: item.brand || '',
                linked_brand: item.linked_brand || '',
                weekday: item.weekday || '',
                categories: item.categories || '',
                discount: item.discount || '',
                vendor_contrib: item.vendor_contrib || '',
                locations: item.locations || 'All Locations',
                rebate_type: item.rebate_type || '',
                after_wholesale: item.after_wholesale || false
            }).replace(/"/g, '&quot;');
            
            const misIdBtn = item.mis_id ? 
                `<button class="btn btn-outline-secondary btn-sm py-0 px-2" 
                         data-row='${rowDataJson}' 
                         onclick="lookupMisIdWithValidation(this, '${item.mis_id}')"
                         title="Click to lookup and validate">${item.mis_id}</button>` : '-';
            html += `<tr>
                <td>${rowBtn}</td>
                <td>${sectionBadge}</td>
                <td>${item.brand || '-'}</td>
                <td>${misIdBtn}</td>
                <td>${item.weekday || item.start_date || '-'}</td>
                <td>${item.discount || '-'}</td>
            </tr>`;
        });
        
        html += `</tbody></table></div></div></div>`;
    }
    
    // Mismatches section
    if (results.mismatches && results.mismatches.length > 0) {
        html += `<div class="card mb-3 border-warning">
            <div class="card-header bg-warning text-dark">
                <strong>Field Mismatches (${results.mismatches.length})</strong>
                <small class="ms-2">- Deals with field differences between Sheet and CSV</small>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-sm table-bordered mb-0">
                        <thead class="table-light">
                            <tr><th style="width:60px;">Row</th><th>Section</th><th>Brand</th><th>MIS ID</th><th>Match %</th><th>Issues</th></tr>
                        </thead>
                        <tbody>`;
        
        results.mismatches.forEach(item => {
            const sectionBadge = getSectionBadge(item.section);
            const rowBtn = window.globalSpreadsheetId ? 
                `<button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="openSheetRow(${item.row})" title="Go to row ${item.row}">${item.row}</button>` : 
                item.row;
            
            // Enhanced MIS ID button with row data for validation
            const rowDataJson = JSON.stringify({
                brand: item.brand || '',
                linked_brand: item.linked_brand || '',
                weekday: item.weekday || '',
                categories: item.categories || '',
                discount: item.discount || '',
                vendor_contrib: item.vendor_contrib || '',
                locations: item.locations || 'All Locations',
                rebate_type: item.rebate_type || '',
                after_wholesale: item.after_wholesale || false
            }).replace(/"/g, '&quot;');
            
            const misIdBtn = item.mis_id ? 
                `<button class="btn btn-outline-secondary btn-sm py-0 px-2" 
                         data-row='${rowDataJson}' 
                         onclick="lookupMisIdWithValidation(this, '${item.mis_id}')"
                         title="Click to lookup and validate">${item.mis_id}</button>` : '-';
            const pct = item.match_percent || 0;
            const pctClass = pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger';
            const issues = item.issues ? item.issues.join(', ') : '-';
            html += `<tr>
                <td>${rowBtn}</td>
                <td>${sectionBadge}</td>
                <td>${item.brand || '-'}</td>
                <td>${misIdBtn}</td>
                <td class="${pctClass} fw-bold">${pct}%</td>
                <td><small class="text-danger">${issues}</small></td>
            </tr>`;
        });
        
        html += `</tbody></table></div></div></div>`;
    }
    
    // Verified section
    if (results.verified && results.verified.length > 0) {
        html += `<div class="card mb-3 border-success">
            <div class="card-header bg-success text-white">
                <strong>Verified (${results.verified.length})</strong>
                <small class="ms-2">- All fields match between Sheet and CSV</small>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-sm table-bordered mb-0">
                        <thead class="table-light">
                            <tr><th style="width:60px;">Row</th><th>Section</th><th>Brand</th><th>MIS ID</th><th>Day/Dates</th><th>Discount</th></tr>
                        </thead>
                        <tbody>`;
        
        results.verified.forEach(item => {
            const sectionBadge = getSectionBadge(item.section);
            const rowBtn = window.globalSpreadsheetId ? 
                `<button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="openSheetRow(${item.row})" title="Go to row ${item.row}">${item.row}</button>` : 
                item.row;
            
            // Enhanced MIS ID button with row data for validation
            const rowDataJson = JSON.stringify({
                brand: item.brand || '',
                linked_brand: item.linked_brand || '',
                weekday: item.weekday || '',
                categories: item.categories || '',
                discount: item.discount || '',
                vendor_contrib: item.vendor_contrib || '',
                locations: item.locations || 'All Locations',
                rebate_type: item.rebate_type || '',
                after_wholesale: item.after_wholesale || false
            }).replace(/"/g, '&quot;');
            
            const misIdBtn = item.mis_id ? 
                `<button class="btn btn-outline-success btn-sm py-0 px-2" 
                         data-row='${rowDataJson}' 
                         onclick="lookupMisIdWithValidation(this, '${item.mis_id}')"
                         title="Click to lookup and validate">${item.mis_id}</button>` : '-';
            html += `<tr>
                <td>${rowBtn}</td>
                <td>${sectionBadge}</td>
                <td>${item.brand || '-'}</td>
                <td>${misIdBtn}</td>
                <td>${item.weekday || item.start_date || '-'}</td>
                <td>${item.discount || '-'}</td>
            </tr>`;
        });
        
        html += `</tbody></table></div></div></div>`;
    }
    
    container.innerHTML = html;
}

function getSectionBadge(section) {
    if (!section) return '';
    const s = section.toLowerCase();
    if (s.includes('week')) return '<span class="badge bg-primary">Weekly</span>';
    if (s.includes('month')) return '<span class="badge bg-success">Monthly</span>';
    if (s.includes('sale')) return '<span class="badge bg-warning text-dark">Sale</span>';
    return `<span class="badge bg-secondary">${section}</span>`;
}

async function runAudit() {
const btn = event.target;
const originalText = btn.innerHTML;
btn.disabled = true;
btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Running...';

document.getElementById('audit-results').innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div><div class="mt-2">Auditing Data...</div></div>';

try {
    // Get current tab selection from dropdown (not stale misData.tabName)
    const currentTab = document.getElementById('mis-tab').value;
    
    if (!currentTab) {
        document.getElementById('audit-results').innerHTML = 
            '<div class="alert alert-warning">Please select a Google Sheet tab in the Setup section first.</div>';
        return;
    }
    
    const formData = new FormData();
    formData.append('tab', currentTab);

    // Attach CSV if available (same logic as Matcher/Conflict)
    if (misData.csvFile) {
        formData.append('csv', misData.csvFile);
    }

    const data = await api.audit.run(formData, true);


    if (data.success) {
        displayAuditResults(data.results);
    } else {
        document.getElementById('audit-results').innerHTML = 
            `<div class="alert alert-danger">[X] Error: ${data.error}</div>`;
    }
} catch (e) {
    document.getElementById('audit-results').innerHTML = 
        `<div class="alert alert-danger">[X] Network Error: ${e.message}</div>`;
} finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
}
}

// ============================================
// v12.25.0: COMPREHENSIVE AUDIT TAB
// ============================================

// Global state for comprehensive audit
let comprehensiveAuditState = {
deals: [],           // Filtered deals to audit
currentIndex: 0,     // Current position in sequential audit
results: {},         // { rowNumber: { status, notes, auditedAt } }
settings: {
mode: 'full',    // 'full' or 'custom'
sections: ['weekly', 'monthly', 'sale'],
weekdays: [],
specificDate: null
},
auditId: null,
tabName: '',
startedAt: null,
inProgress: false
};

// Toggle audit mode (Full vs Custom)
function toggleAuditMode() {
const mode = document.querySelector('input[name="auditMode"]:checked').value;
const customOptions = document.getElementById('customAuditOptions');

comprehensiveAuditState.settings.mode = mode;
customOptions.style.display = mode === 'custom' ? 'block' : 'none';
}

// Toggle weekend (Sat+Sun) checkboxes
function toggleWeekendAudit() {
const satCheck = document.getElementById('auditWeekSat');
const sunCheck = document.getElementById('auditWeekSun');
const weekendOn = !(satCheck.checked && sunCheck.checked);
satCheck.checked = weekendOn;
sunCheck.checked = weekendOn;
}

// Get selected sections from checkboxes
function getSelectedAuditSections() {
const sections = [];
if (document.getElementById('auditSectionWeekly').checked) sections.push('weekly');
if (document.getElementById('auditSectionMonthly').checked) sections.push('monthly');
if (document.getElementById('auditSectionSale').checked) sections.push('sale');
return sections;
}

// Get selected weekdays from checkboxes
function getSelectedAuditWeekdays() {
const weekdays = [];
document.querySelectorAll('.audit-weekday-check:checked').forEach(cb => {
weekdays.push(cb.value);
});
return weekdays;
}

// Check if a date falls on selected weekdays
function dateMatchesWeekdays(dateStr, selectedWeekdays) {
if (!dateStr || selectedWeekdays.length === 0) return true;

// Parse date
const parsed = parseDateString(dateStr);
if (!parsed) return true;

const date = new Date(parsed.year, parsed.month, parsed.day);
const dayIndex = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
return selectedWeekdays.includes(dayNames[dayIndex]);
}

// Parse date string to {year, month, day}
function parseDateString(dateStr) {
if (!dateStr || dateStr === '-' || dateStr === 'N/A') return null;
// Try YYYY-MM-DD
let m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
if (m) return { year: parseInt(m[1]), month: parseInt(m[2]) - 1, day: parseInt(m[3]) };
// Try MM/DD/YYYY
m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
if (m) return { year: parseInt(m[3]), month: parseInt(m[1]) - 1, day: parseInt(m[2]) };
// Try MM/DD/YY
m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
if (m) return { year: 2000 + parseInt(m[3]), month: parseInt(m[1]) - 1, day: parseInt(m[2]) };
return null;
}

// Check if deal matches weekday filter (applies to all section types)
// v12.25.0: Weekly deals + Specific Date fix
// Weekly deals should be included if:
// 1. Weekly section toggle is ON
// 2. AND deal weekday matches selected weekday toggle (if any)
// NOTE: Weekly deals run every week, so specific date only filters by weekday match
function dealMatchesWeekdayFilter(match, selectedWeekdays) {
if (selectedWeekdays.length === 0) return true; // No filter = all pass

const section = (match.section || '').toLowerCase();

// Weekly deals: Check weekday field directly
if (section.includes('weekly')) {
const dealWeekday = (match.weekday || '').toLowerCase().substring(0, 3);
return selectedWeekdays.includes(dealWeekday);
}

// Monthly/Sale deals: The "weekday" column contains day-of-month values like "10th" or "10th, 15th"
// We need to calculate what weekday those dates fall on for the current tab month
// NOTE (FUTURE CHANGE): This column format may change - all logic referencing this will need updating
if (section.includes('monthly') || section.includes('sale')) {
const weekdayCol = match.weekday || '';

// If it's already a weekday name (Thu, Mon, etc), use it directly
const weekdayNames = ['mon','tue','wed','thu','fri','sat','sun'];
const lowerWeekday = weekdayCol.toLowerCase();
if (weekdayNames.some(d => lowerWeekday.includes(d))) {
    const dealWeekday = lowerWeekday.substring(0, 3);
    return selectedWeekdays.includes(dealWeekday);
}

// Parse day-of-month values like "10th", "15th", "10th, 15th"
const dayNumbers = parseDayOfMonthValues(weekdayCol);
if (dayNumbers.length > 0) {
    // Get current tab's month/year context
    const tabName = document.getElementById('mis-tab')?.value || '';
    const monthYear = parseTabNameToMonthYear(tabName);
    
    if (monthYear) {
        // Check if any of the day-of-month dates fall on a selected weekday
        for (const dayNum of dayNumbers) {
            const dateObj = new Date(monthYear.year, monthYear.month, dayNum);
            const dayIndex = dateObj.getDay();
            const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIndex];
            if (selectedWeekdays.includes(dayName)) {
                return true;
            }
        }
        return false; // None of the dates matched selected weekdays
    }
}

// Fallback: if has start_date, check if that date matches
if (match.start_date) {
    return dateMatchesWeekdays(match.start_date, selectedWeekdays);
}
}

return true;
}

// v12.25.0: Parse day-of-month values from "10th", "15th", "10th, 15th" format
// NOTE (FUTURE CHANGE): This column format may change - update this function when it does
function parseDayOfMonthValues(str) {
if (!str) return [];
const dayNumbers = [];
// Match patterns like "10th", "15th", "1st", "2nd", "3rd", "21st", etc.
const matches = String(str).match(/(\d{1,2})(?:st|nd|rd|th)?/gi);
if (matches) {
matches.forEach(m => {
    const num = parseInt(m.replace(/\D/g, ''), 10);
    if (num >= 1 && num <= 31) {
        dayNumbers.push(num);
    }
});
}
return dayNumbers;
}

// v12.25.0: Parse tab name like "February 2026" to {month: 1, year: 2026}
function parseTabNameToMonthYear(tabName) {
if (!tabName) return null;
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const lower = tabName.toLowerCase();

let monthIndex = -1;
for (let i = 0; i < months.length; i++) {
if (lower.includes(months[i])) {
    monthIndex = i;
    break;
}
}

const yearMatch = tabName.match(/\d{4}/);
const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

if (monthIndex >= 0) {
return { month: monthIndex, year: year };
}
return null;
}

// v12.25.0: Check if deal matches specific date filter
// Weekly deals: Include if the selected date's weekday matches the deal's weekday
// Monthly/Sale deals: Include if the date falls within the deal's date range OR matches day-of-month
function dealMatchesDateFilter(match, specificDate) {
if (!specificDate) return true;

const filterDate = new Date(specificDate);
const section = (match.section || '').toLowerCase();

// For Weekly deals: Check if the specific date falls on the deal's weekday
if (section.includes('weekly')) {
const dayIndex = filterDate.getDay();
const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const dealWeekday = (match.weekday || '').toLowerCase().substring(0, 3);
return dealWeekday === dayNames[dayIndex];
}

// For Monthly/Sale deals: Check both date range AND day-of-month column
if (section.includes('monthly') || section.includes('sale')) {
// First check: Does the specific date match a day-of-month value in the weekday column?
const weekdayCol = match.weekday || '';
const dayNumbers = parseDayOfMonthValues(weekdayCol);
const filterDayOfMonth = filterDate.getDate();

if (dayNumbers.length > 0 && dayNumbers.includes(filterDayOfMonth)) {
    return true;
}

// Second check: Does the date fall within the deal's date range?
if (match.start_date && match.end_date) {
    const start = parseDateString(match.start_date);
    const end = parseDateString(match.end_date);
    if (start && end) {
        const startDate = new Date(start.year, start.month, start.day);
        const endDate = new Date(end.year, end.month, end.day);
        return filterDate >= startDate && filterDate <= endDate;
    }
}
}

return true;
}

// Load deals for audit from matchesData
function loadAuditDeals() {
// Check if matchesData has been populated
if (!matchesData || matchesData.length === 0) {
alert('No deals loaded. Please run the ID Matcher first to load deals.');
return;
}

const mode = document.querySelector('input[name="auditMode"]:checked').value;
const sections = mode === 'custom' ? getSelectedAuditSections() : ['weekly', 'monthly', 'sale'];
const weekdays = mode === 'custom' ? getSelectedAuditWeekdays() : [];
const specificDate = mode === 'custom' ? document.getElementById('auditSpecificDate').value : null;

// Update state
comprehensiveAuditState.settings = { mode, sections, weekdays, specificDate };
comprehensiveAuditState.tabName = document.getElementById('mis-tab')?.value || 'Unknown';

// Filter deals based on settings
let filteredDeals = matchesData.filter(match => {
// Section filter
const dealSection = (match.section || '').toLowerCase();
const matchesSection = sections.some(s => dealSection.includes(s));
if (!matchesSection) return false;

// Weekday filter (Custom mode only)
if (mode === 'custom' && weekdays.length > 0) {
    if (!dealMatchesWeekdayFilter(match, weekdays)) return false;
}

// Date filter (Custom mode only)
if (mode === 'custom' && specificDate) {
    if (!dealMatchesDateFilter(match, specificDate)) return false;
}

return true;
});

// Store filtered deals with their original indices
comprehensiveAuditState.deals = filteredDeals.map((deal, idx) => ({
...deal,
originalIndex: matchesData.indexOf(deal),
auditIndex: idx
}));

// Reset audit state
comprehensiveAuditState.currentIndex = 0;
comprehensiveAuditState.results = {};
comprehensiveAuditState.inProgress = false;

// Update UI
renderAuditOverview();

// Enable buttons
document.getElementById('startAuditBtn').disabled = filteredDeals.length === 0;
document.getElementById('exportAuditBtn').disabled = true;
document.getElementById('auditDealCount').textContent = `${filteredDeals.length} deals loaded`;
document.getElementById('auditDealCount').className = filteredDeals.length > 0 ? 'badge bg-success fs-6' : 'badge bg-warning fs-6';

// Hide placeholder, show overview
document.getElementById('auditPlaceholder').style.display = 'none';
document.getElementById('auditOverviewContainer').style.display = 'block';

// Try to load any saved audit state
loadAuditStateFromServer();
}

// Render the audit overview table
function renderAuditOverview() {
const deals = comprehensiveAuditState.deals;
const results = comprehensiveAuditState.results;

// Count by section
const counts = { weekly: 0, monthly: 0, sale: 0, total: deals.length };
deals.forEach(d => {
const section = (d.section || '').toLowerCase();
if (section.includes('weekly')) counts.weekly++;
else if (section.includes('monthly')) counts.monthly++;
else if (section.includes('sale')) counts.sale++;
});

// Summary counts
const summaryHtml = `
<div class="col-md-3">
    <div class="card text-center border-primary">
        <div class="card-body py-2">
            <h5 class="card-title mb-0 text-primary">${counts.weekly}</h5>
            <small class="text-muted">Weekly</small>
        </div>
    </div>
</div>
<div class="col-md-3">
    <div class="card text-center border-success">
        <div class="card-body py-2">
            <h5 class="card-title mb-0 text-success">${counts.monthly}</h5>
            <small class="text-muted">Monthly</small>
        </div>
    </div>
</div>
<div class="col-md-3">
    <div class="card text-center border-warning">
        <div class="card-body py-2">
            <h5 class="card-title mb-0 text-warning">${counts.sale}</h5>
            <small class="text-muted">Sale</small>
        </div>
    </div>
</div>
<div class="col-md-3">
    <div class="card text-center border-dark">
        <div class="card-body py-2">
            <h5 class="card-title mb-0">${counts.total}</h5>
            <small class="text-muted">Total</small>
        </div>
    </div>
</div>
`;
document.getElementById('auditSummaryCounts').innerHTML = summaryHtml;

// Table rows
let tableHtml = '';
deals.forEach((deal, idx) => {
const result = results[deal.google_row] || {};
const auditStatusBadge = getAuditStatusBadge(result.status);
const section = (deal.section || '').toLowerCase();
const sectionBadge = section.includes('weekly') ? '<span class="badge bg-primary">W</span>' :
                    section.includes('monthly') ? '<span class="badge bg-success">M</span>' :
                    section.includes('sale') ? '<span class="badge bg-warning text-dark">S</span>' : '';

// Multi-brand indicator
let brandDisplay = deal.brand || '-';
if (deal.is_multi_brand) {
    brandDisplay = `<span class="badge bg-info text-dark me-1">${deal.multi_brand_index + 1}/${deal.multi_brand_total}</span> ${brandDisplay}`;
}

// Linked brand
const linkedDisplay = deal.linked_brand ? `<small class="text-muted">${deal.linked_brand}</small>` : '-';

// Discount display
let discountDisplay = '-';
if (deal.discount !== null && deal.discount !== undefined && deal.discount !== '') {
    discountDisplay = `${deal.discount}%`;
}

// Vendor display
let vendorDisplay = '-';
if (deal.vendor_contrib !== null && deal.vendor_contrib !== undefined && deal.vendor_contrib !== '') {
    vendorDisplay = `${deal.vendor_contrib}%`;
}

// MIS ID display - v12.25.1: Parse multiple IDs properly
let misIdDisplay = '<span class="text-muted">No ID</span>';
if (deal.current_sheet_id) {
    const parsedIds = parseMultipleMisIdsForAudit(deal.current_sheet_id);
    if (parsedIds.length > 0) {
        // Create a button for each MIS ID
        misIdDisplay = parsedIds.map(rawId => {
            const cleanId = cleanMisIdForAudit(rawId);
            return `<button class="btn btn-outline-secondary btn-sm py-0 px-1 me-1 mb-1" onclick="lookupMisId('${cleanId}')" style="font-size:0.75em;">${rawId}</button>`;
        }).join('');
    }
}

// Confidence badge
const statusClass = deal.status === 'HIGH' ? 'status-high' : deal.status === 'MEDIUM' ? 'status-medium' : 'status-low';

tableHtml += `
    <tr data-audit-idx="${idx}" data-row="${deal.google_row}">
        <td><button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="openSheetRow(${deal.google_row})">${deal.google_row}</button></td>
        <td>${brandDisplay}</td>
        <td>${linkedDisplay}</td>
        <td>${deal.weekday || '-'}</td>
        <td title="${deal.special_notes || ''}">${(deal.special_notes || '-').substring(0, 15)}${(deal.special_notes || '').length > 15 ? '...' : ''}</td>
        <td title="${deal.deal_info || ''}">${(deal.deal_info || '-').substring(0, 15)}${(deal.deal_info || '').length > 15 ? '...' : ''}</td>
        <td>${discountDisplay}</td>
        <td>${vendorDisplay}</td>
        <td title="${deal.locations || ''}">${(deal.locations || '-').substring(0, 15)}${(deal.locations || '').length > 15 ? '...' : ''}</td>
        <td title="${deal.categories || ''}">${(deal.categories || '-').substring(0, 15)}${(deal.categories || '').length > 15 ? '...' : ''}</td>
        <td><span class="badge ${statusClass}">${deal.status || '-'}</span></td>
        <td>${misIdDisplay}</td>
        <td>${auditStatusBadge}</td>
        <td>
            <button class="btn btn-outline-primary btn-sm py-0" onclick="showAuditPopup(${idx})" title="Audit this deal">
                <i class="bi bi-clipboard-check"></i> Audit
            </button>
        </td>
    </tr>
`;
});

document.getElementById('auditDealsTableBody').innerHTML = tableHtml || '<tr><td colspan="14" class="text-center text-muted">No deals match the current filters</td></tr>';
}

// Get badge for audit status
function getAuditStatusBadge(status) {
if (!status) return '<span class="badge bg-secondary">Pending</span>';
if (status === 'verified') return '<span class="badge bg-success">ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ Verified</span>';
if (status === 'attention') return '<span class="badge bg-warning text-dark">ÃƒÂ¢Ã…Â¡Ã‚Â  Attention</span>';
if (status === 'skipped') return '<span class="badge bg-secondary">ÃƒÂ¢Ã‚ÂÃ‚Â­ Skipped</span>';
return `<span class="badge bg-secondary">${status}</span>`;
}

// Start sequential audit
function startSequentialAudit() {
const deals = comprehensiveAuditState.deals;
if (deals.length === 0) {
alert('No deals to audit.');
return;
}

// Confirmation popup
const confirmMsg = `${deals.length} deals to audit - Ready?`;
if (!confirm(confirmMsg)) return;

comprehensiveAuditState.inProgress = true;
comprehensiveAuditState.startedAt = new Date().toISOString();
comprehensiveAuditState.auditId = 'audit_' + Date.now();

// Find first unaudited deal
let startIdx = 0;
for (let i = 0; i < deals.length; i++) {
if (!comprehensiveAuditState.results[deals[i].google_row]) {
    startIdx = i;
    break;
}
}

comprehensiveAuditState.currentIndex = startIdx;
showAuditPopup(startIdx);
}

// Show audit popup for a specific deal
function showAuditPopup(auditIdx) {
const deals = comprehensiveAuditState.deals;
if (auditIdx < 0 || auditIdx >= deals.length) return;

comprehensiveAuditState.currentIndex = auditIdx;
const deal = deals[auditIdx];
const results = comprehensiveAuditState.results;
const existingResult = results[deal.google_row] || {};

// Remove existing popup
const existingPopup = document.getElementById('comprehensive-audit-popup-overlay');
if (existingPopup) existingPopup.remove();

// Create overlay
const overlay = document.createElement('div');
overlay.id = 'comprehensive-audit-popup-overlay';
overlay.style.cssText = `
position: fixed; top: 0; left: 0; width: 100%; height: 100%;
background: rgba(0, 0, 0, 0.6); z-index: 9998;
display: flex; justify-content: center; align-items: center;
`;
overlay.onclick = function(e) {
if (e.target === overlay) {
    if (confirm('Exit audit? Progress will be saved.')) {
        saveAuditProgress();
        overlay.remove();
    }
}
};

// Modal sizing
const screenWidth = window.innerWidth;
const modalWidth = Math.min(1600, screenWidth - 40);

// Create modal
const modal = document.createElement('div');
modal.style.cssText = `
background: #fff; padding: 0; border-radius: 8px;
box-shadow: 0 4px 20px rgba(0,0,0,0.3);
width: ${modalWidth}px; max-width: 98%; max-height: 90vh;
overflow-y: auto; z-index: 9999; position: relative;
`;

// Build popup content
let html = buildAuditPopupContent(deal, auditIdx, existingResult);

modal.innerHTML = html;
overlay.appendChild(modal);
document.body.appendChild(overlay);
}

// Build the content for audit popup (3 sections)
function buildAuditPopupContent(deal, auditIdx, existingResult) {
const deals = comprehensiveAuditState.deals;
const totalDeals = deals.length;
const progress = Math.round(((auditIdx + 1) / totalDeals) * 100);

// Section badge
const section = (deal.section || '').toLowerCase();
const sectionBadge = section.includes('weekly') ? '<span class="badge bg-primary me-2">Weekly</span>' :
                section.includes('monthly') ? '<span class="badge bg-success me-2">Monthly</span>' :
                section.includes('sale') ? '<span class="badge bg-warning text-dark me-2">Sale</span>' : '';

// v12.25.0: Fixed column widths for alignment between tables
const colWidths = {
row: '60px',
weekday: '80px',
brand: '140px',
category: '120px',
discount: '70px',
vendor: '70px',
locations: '120px',
dealInfo: '130px',
notes: '100px',
start: '90px',
end: '90px',
action: '60px'
};

let html = `
<!-- HEADER with navigation -->
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px 30px; border-radius: 8px 8px 0 0;">
    <div class="d-flex justify-content-between align-items-center">
        <div style="flex: 1;"></div>
        <div style="flex: 2; text-align: center;">
            <h3 class="mb-1" style="font-weight: bold;">
                <i class="bi bi-clipboard-check"></i> Audit: ${deal.brand || 'Unknown Brand'}
            </h3>
            <div>${sectionBadge}<small>Row ${deal.google_row} | Deal ${auditIdx + 1} of ${totalDeals}</small></div>
        </div>
        <div style="flex: 1; display: flex; justify-content: flex-end; gap: 10px; align-items: center;">
            <div class="progress" style="width: 120px; height: 8px;">
                <div class="progress-bar bg-success" style="width: ${progress}%"></div>
            </div>
            <span>${progress}%</span>
            <button class="btn btn-outline-light btn-sm" onclick="exitAuditPopup()">
                <i class="bi bi-x-lg"></i> Exit
            </button>
        </div>
    </div>
</div>

<div style="padding: 20px;">
`;

// SECTION 1: Google Sheet Data - aligned columns
html += `
<div class="card mb-3 border-primary">
    <div class="card-header bg-primary text-white">
        <strong><i class="bi bi-file-earmark-spreadsheet"></i> Section 1: Google Sheet Data</strong>
    </div>
    <div class="card-body p-2">
        <div style="overflow-x: auto;">
            <table class="table table-sm table-bordered mb-0" style="font-size: 0.85em; table-layout: fixed;">
                <thead style="background:#e9ecef; color:#212529;">
                    <tr>
                        <th style="width:${colWidths.row};">Row</th>
                        <th style="width:${colWidths.weekday};">Weekday</th>
                        <th style="width:${colWidths.brand};">Brand / Linked</th>
                        <th style="width:${colWidths.category};">Category</th>
                        <th style="width:${colWidths.discount};">Discount</th>
                        <th style="width:${colWidths.vendor};">Vendor</th>
                        <th style="width:${colWidths.locations};">Locations</th>
                        <th style="width:${colWidths.dealInfo};">Deal Info</th>
                        <th style="width:${colWidths.notes};">Notes</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background: #e7f1ff;">
                        <td><button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="openSheetRow(${deal.google_row})">${deal.google_row}</button></td>
                        <td><strong>${deal.weekday || '-'}</strong></td>
                        <td><strong>${deal.brand || '-'}</strong>${deal.linked_brand ? '<br><small class="text-muted">' + deal.linked_brand + '</small>' : ''}</td>
                        <td title="${deal.categories || 'Not Specified'}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;${!deal.categories || deal.categories === '-' ? ' background:#fff3cd; color:#856404;' : ''}">${deal.categories || '<em style="color:#856404;">Not Specified</em>'}</td>
                        <td><strong>${(deal.discount !== null && deal.discount !== undefined && String(deal.discount).trim() !== '') ? deal.discount + '%' : '-'}</strong></td>
                        <td>${(deal.vendor_contrib !== null && deal.vendor_contrib !== undefined && String(deal.vendor_contrib).trim() !== '') ? deal.vendor_contrib + '%' : '-'}</td>
                        <td title="${deal.locations || 'All Locations'}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${deal.locations || 'All Locations'}</td>
                        <td title="${deal.deal_info || ''}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${deal.deal_info || '-'}</td>
                        <td title="${deal.special_notes || ''}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${deal.special_notes || '-'}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
`;

// SECTION 2: Assigned MIS ID Entries
html += buildMISSection(deal, colWidths);

// SECTION 3: Blaze Discounts (if assigned)
html += buildBlazeSection(deal);

// Multi-brand checklist (if applicable)
if (deal.is_multi_brand) {
html += buildMultiBrandChecklist(deal);
}

// Audit Actions and Notes - v12.25.0: Fixed button colors
html += `
<div class="card mt-3 border-secondary">
    <div class="card-header bg-secondary text-white">
        <strong><i class="bi bi-pencil-square"></i> Audit Actions</strong>
    </div>
    <div class="card-body">
        <div class="row">
            <div class="col-md-6">
                <label class="form-label fw-bold">Notes</label>
                <textarea id="auditNotes" class="form-control" rows="3" placeholder="Add notes about this deal...">${existingResult.notes || ''}</textarea>
            </div>
            <div class="col-md-6">
                <label class="form-label fw-bold">Mark As</label>
                <div class="d-flex gap-2 flex-wrap">
                    <button class="btn" style="background-color:#28a745; color:white; border-color:#28a745;" onclick="markAuditDeal(${auditIdx}, 'verified')">
                        <i class="bi bi-check-circle"></i> Verified
                    </button>
                    <button class="btn" style="background-color:#fd7e14; color:white; border-color:#fd7e14;" onclick="markAuditDeal(${auditIdx}, 'attention')">
                        <i class="bi bi-exclamation-triangle"></i> Needs Attention
                    </button>
                    <button class="btn" style="background-color:#6c757d; color:#212529; border-color:#6c757d;" onclick="markAuditDeal(${auditIdx}, 'skipped')">
                        <i class="bi bi-skip-forward"></i> Skip
                    </button>
                </div>
                <hr>
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-primary" onclick="navigateAudit(-1)" ${auditIdx === 0 ? 'disabled' : ''}>
                        <i class="bi bi-arrow-left"></i> Previous
                    </button>
                    <button class="btn btn-outline-primary" onclick="navigateAudit(1)" ${auditIdx === totalDeals - 1 ? 'disabled' : ''}>
                        Next <i class="bi bi-arrow-right"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
`;

html += `</div>`; // Close padding div

return html;
}

// Build MIS section of audit popup
function buildMISSection(deal, colWidths) {
const assignedIdRaw = deal.current_sheet_id ? String(deal.current_sheet_id).trim() : '';
const suggestions = deal.suggestions || [];

// v12.25.0: Parse multiple MIS IDs (same logic as ID Matcher)
// Filter out "STIIIZY MONTHLY + WEEKLY DEAL PLANNER" as it's a note, not an MIS ID
const assignedIds = parseMultipleMisIdsForAudit(assignedIdRaw);
const hasAssignedIds = assignedIds.length > 0;

let html = `
<div class="card mb-3 border-success">
    <div class="card-header bg-success text-white d-flex justify-content-between">
        <strong><i class="bi bi-database"></i> Section 2: Assigned MIS ID Entries</strong>
        ${hasAssignedIds ? `<span class="badge bg-light text-dark">Assigned: ${assignedIds.join(', ')}</span>` : '<span class="badge bg-danger">NO MIS ID ASSIGNED</span>'}
    </div>
    <div class="card-body p-2">
`;

if (!hasAssignedIds) {
html += `
    <div class="alert alert-warning mb-0">
        <i class="bi bi-exclamation-triangle"></i> <strong>WARNING:</strong> No MIS ID is assigned to this deal in Google Sheet.
    </div>
`;
} else {
// v12.25.0: Process each assigned MIS ID
let foundMatches = [];
let notFoundIds = [];

assignedIds.forEach(rawId => {
    const cleanId = cleanMisIdForAudit(rawId);
    const matchingSuggestion = suggestions.find(s => String(s.mis_id) === cleanId);
    if (matchingSuggestion) {
        foundMatches.push({ rawId, cleanId, suggestion: matchingSuggestion });
    } else {
        notFoundIds.push({ rawId, cleanId });
    }
});

// Show found matches
if (foundMatches.length > 0) {
    const matchingSuggestions = foundMatches.map(m => m.suggestion);
    html += renderMISSuggestionTable(matchingSuggestions, deal, true, colWidths);
}

// Show not found IDs
if (notFoundIds.length > 0) {
    html += `
        <div class="alert alert-danger mb-2">
            <i class="bi bi-x-circle"></i> <strong>MIS ID(s) NOT FOUND IN CSV:</strong> ${notFoundIds.map(n => n.rawId).join(', ')}
        </div>
    `;
}

// Show other suggestions if available (exclude already-matched IDs)
const matchedCleanIds = foundMatches.map(m => m.cleanId);
const otherSuggestions = suggestions.filter(s => !matchedCleanIds.includes(String(s.mis_id)));
if (otherSuggestions.length > 0) {
    html += `
        <details class="mt-2">
            <summary class="text-muted" style="cursor: pointer;">
                <i class="bi bi-list"></i> Other suggestions (${otherSuggestions.length})
            </summary>
            <div class="mt-2">
                ${renderMISSuggestionTable(otherSuggestions, deal, false, colWidths)}
            </div>
        </details>
    `;
}
}

html += `</div></div>`;
return html;
}

// v12.25.0: Parse multiple MIS IDs from raw value, filtering out notes
// Ignores "STIIIZY MONTHLY + WEEKLY DEAL PLANNER" and similar non-ID text
function parseMultipleMisIdsForAudit(rawValue) {
if (!rawValue) return [];
const str = String(rawValue).trim();

// Filter out known notes/non-ID text (case insensitive)
const ignorePhrases = [
'stiiizy monthly + weekly deal planner',
'stiiizy monthly+ weekly deal planner',
'stiiizy monthly and weekly deal planner',
'deal planner',
'monthly + weekly',
'monthly+ weekly'
];

// Check if entire string is just a note to ignore
const lowerStr = str.toLowerCase();
if (ignorePhrases.some(phrase => lowerStr === phrase)) {
return [];
}

// Split by newlines and/or commas
let parts = str.split(/[\n\r,]+/).map(p => p.trim()).filter(p => p);

// If only one part, check if it contains multiple tagged IDs (space-separated tags like "W1 12345 W2 67890")
if (parts.length === 1 && !parts[0].match(/^\d+$/)) {
// Try to find multiple tagged IDs
const multiTagMatch = str.match(/([A-Za-z]+\d*\s+\d+)/g);
if (multiTagMatch && multiTagMatch.length > 1) {
    parts = multiTagMatch;
} else {
    // Try splitting by spaces for simple numeric IDs
    const spaceParts = str.split(/\s+/).map(p => p.trim()).filter(p => p && /\d/.test(p));
    if (spaceParts.length > 1) {
        // Check if these look like IDs (numbers or tagged numbers)
        const allLookLikeIds = spaceParts.every(p => /^([A-Za-z]*\d*\s*)?\d+$/.test(p));
        if (allLookLikeIds) {
            parts = spaceParts;
        }
    }
}
}

// Filter out ignore phrases and non-numeric entries
return parts.filter(p => {
const lower = p.toLowerCase();
// Skip if matches ignore phrase
if (ignorePhrases.some(phrase => lower.includes(phrase))) {
    return false;
}
// Skip standalone text that doesn't contain digits
if (!/\d/.test(p)) {
    return false;
}
return true;
});
}

// Clean MIS ID by stripping tag prefixes (reuse from showSuggestionTooltip pattern)
function cleanMisIdForAudit(rawId) {
if (!rawId) return '';
const str = String(rawId).trim();
const tagMatch = str.match(/^([A-Za-z]+\d*)\s+(\d+)$/);
if (tagMatch) return tagMatch[2];
const numMatch = str.match(/(\d+)\s*$/);
if (numMatch) return numMatch[1];
return str;
}

// Render MIS suggestion table
function renderMISSuggestionTable(suggestions, deal, isAssigned, colWidths) {
const currentTabName = document.getElementById('mis-tab')?.value || '';

// v12.25.0: Include linked brand for comparison
const sheetBrand = deal.brand || '';
const sheetLinkedBrand = deal.linked_brand || '';
const combinedSheetBrand = sheetLinkedBrand ? `${sheetBrand} / ${sheetLinkedBrand}` : sheetBrand;

// Use provided colWidths or defaults
const widths = colWidths || {
row: '60px', weekday: '80px', brand: '140px', category: '120px',
discount: '70px', vendor: '70px', locations: '120px',
dealInfo: '130px', notes: '100px', start: '90px', end: '90px', action: '60px'
};

let html = `
<div style="overflow-x: auto;">
    <table class="table table-sm table-bordered mb-0" style="font-size: 0.85em; table-layout: fixed; ${isAssigned ? 'border: 2px solid #198754;' : ''}">
        <thead style="background: ${isAssigned ? '#d4edda' : '#e9ecef'}; color:#212529;">
            <tr>
                <th style="width:${widths.row};">MIS ID</th>
                <th style="width:${widths.weekday};">Weekday</th>
                <th style="width:${widths.brand};">Brand / Linked</th>
                <th style="width:${widths.category};">Category</th>
                <th style="width:${widths.discount};">Discount</th>
                <th style="width:${widths.vendor};">Vendor</th>
                <th style="width:${widths.locations};">Locations</th>
                <th style="width:${widths.start};">Start</th>
                <th style="width:${widths.end};">End</th>
                <th style="width:${widths.action};">Action</th>
            </tr>
        </thead>
        <tbody>
`;

suggestions.forEach(s => {
const data = s.mis_data || {};
const endDateColor = getEndDateColorForAudit(data.end_date, currentTabName);

// v12.25.0: Combine MIS Brand + Linked Brand for display
const misBrand = data.brand || '';
const misLinkedBrand = data.linked_brand && data.linked_brand !== 'N/A' ? data.linked_brand : '';
const combinedMisBrand = misLinkedBrand ? `${misBrand}<br><small class="text-muted">${misLinkedBrand}</small>` : misBrand || '-';

// Compare both brand AND linked brand
const brandStyle = getBrandAndLinkedStyleForAudit(sheetBrand, sheetLinkedBrand, misBrand, misLinkedBrand);

// v12.26.0: Smart display for Locations - blank/NaN MIS = "All Locations"
const misLocRaw = String(data.locations || '').trim();
const misLocIsBlank = !misLocRaw || misLocRaw === '-' || misLocRaw.toLowerCase() === 'nan' || misLocRaw.toLowerCase() === 'n/a' || misLocRaw.toLowerCase() === 'null' || misLocRaw.toLowerCase() === 'none';
const misLocDisplay = misLocIsBlank ? 'All Locations' : data.locations;

// v12.26.0: Smart display for Categories - blank/NaN MIS = "All Categories"
const misCatRaw = String(data.category || '').trim();
const misCatIsBlank = !misCatRaw || misCatRaw === '-' || misCatRaw.toLowerCase() === 'nan' || misCatRaw.toLowerCase() === 'n/a' || misCatRaw.toLowerCase() === 'null' || misCatRaw.toLowerCase() === 'none';
const misCatDisplay = misCatIsBlank ? 'All Categories' : data.category;

// v12.26.0: Fix discount display for 0% - explicit check for null/undefined only
const discountDisplay = (data.discount !== null && data.discount !== undefined && String(data.discount).trim() !== '') ? data.discount + '%' : '-';
const vendorDisplay = (data.vendor_contribution !== null && data.vendor_contribution !== undefined && String(data.vendor_contribution).trim() !== '') ? data.vendor_contribution + '%' : '-';

html += `
    <tr>
        <td>
            <button class="btn btn-sm btn-outline-primary py-0 px-2" 
                    onclick="lookupMisIdWithValidation(this, '${s.mis_id}')"
                    title="Click to lookup in MIS">${s.mis_id}</button>
        </td>
        <td style="${getWeekdayStyleForAudit(deal.weekday, data.weekdays)}">${data.weekdays || '-'}</td>
        <td style="${brandStyle}">${combinedMisBrand}</td>
        <td style="${getCategoryStyleForAudit(deal.categories, data.category)}" title="${misCatDisplay}" class="text-truncate">${misCatDisplay}</td>
        <td style="${getMatchStyleForAudit(deal.discount, data.discount, true)}">${discountDisplay}</td>
        <td style="${getMatchStyleForAudit(deal.vendor_contrib, data.vendor_contribution, true)}">${vendorDisplay}</td>
        <td style="${getLocationStyleForAudit(deal.locations, data.locations)}" title="${misLocDisplay}" class="text-truncate">${misLocDisplay}</td>
        <td>${data.start_date || '-'}</td>
        <td>
            <button class="btn btn-sm py-0 px-2" style="${endDateColor.style}" title="${endDateColor.tooltip}">
                ${data.end_date || '-'}
            </button>
        </td>
        <td>
            <button class="btn btn-sm btn-outline-info py-0 px-1" onclick="showMoreInfoForAudit('${s.mis_id}', ${JSON.stringify(data).replace(/"/g, '&quot;')})" title="View all MIS fields">
                <i class="bi bi-info-circle"></i>
            </button>
        </td>
    </tr>
`;
});

html += `</tbody></table></div>`;
return html;
}

// v12.25.0: Compare brand AND linked brand together
function getBrandAndLinkedStyleForAudit(sheetBrand, sheetLinked, misBrand, misLinked) {
const sb = String(sheetBrand || '').toLowerCase().trim();
const sl = String(sheetLinked || '').toLowerCase().trim();
const mb = String(misBrand || '').toLowerCase().trim();
const ml = String(misLinked || '').toLowerCase().trim();

// Check various match scenarios:
// 1. Sheet brand matches MIS brand (direct match)
// 2. Sheet linked matches MIS brand (linked brand used as primary in MIS)
// 3. Sheet brand matches MIS linked (inverse linked match)
// 4. Sheet linked matches MIS linked (linked brands match)
// 5. Fuzzy match (contains check)

let brandMatch = sb === mb || sb.includes(mb) || mb.includes(sb);
let linkedMatch = (sl && ml) ? (sl === ml || sl.includes(ml) || ml.includes(sl)) : true;
let crossMatch1 = sl && mb && (sl === mb || sl.includes(mb) || mb.includes(sl));
let crossMatch2 = sb && ml && (sb === ml || sb.includes(ml) || ml.includes(sb));

// GREEN: Direct brand match or cross-match found
if (brandMatch || crossMatch1 || crossMatch2) {
return 'background:#d4edda; color:#155724;';
}

// YELLOW: Missing data on one side
if (!sb || !mb) {
return 'background:#fff3cd; color:#856404;';
}

// RED: Mismatch
return 'background:#f8d7da; color:#721c24;';
}

// Get end date color (reuse logic from showSuggestionTooltip)
function getEndDateColorForAudit(endDateStr, tabName) {
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const parts = tabName.toLowerCase().trim().split(/\s+/);
let tabMonth = -1, tabYear = -1;
for (const p of parts) {
const mIdx = months.indexOf(p);
if (mIdx >= 0) tabMonth = mIdx;
if (/^\d{4}$/.test(p)) tabYear = parseInt(p);
}

if (tabMonth < 0 || tabYear < 0) {
return { style: 'background:#6c757d; border-color:#6c757d; color:white;', tooltip: 'Cannot parse tab name' };
}

const parsed = parseDateString(endDateStr);
if (!parsed) {
return { style: 'background:#6c757d; border-color:#6c757d; color:white;', tooltip: 'Invalid date' };
}

const tabYM = tabYear * 12 + tabMonth;
const endYM = parsed.year * 12 + parsed.month;

if (endYM < tabYM) {
return { style: 'background:#dc3545; border-color:#dc3545; color:white;', tooltip: 'EXPIRED - needs update' };
} else if (endYM === tabYM) {
return { style: 'background:#28a745; border-color:#28a745; color:white;', tooltip: 'Current month' };
} else {
return { style: 'background:#fd7e14; border-color:#fd7e14; color:white;', tooltip: 'Future month' };
}
}

// Comparison style helpers (simplified versions)
function getMatchStyleForAudit(src, tgt, isNumeric = false) {
// v12.26.0: Fix 0% matching - use explicit null/undefined/empty checks instead of falsy
const srcEmpty = (src === null || src === undefined || String(src).trim() === '' || String(src).trim() === '-' || String(src).toLowerCase() === 'nan');
const tgtEmpty = (tgt === null || tgt === undefined || String(tgt).trim() === '' || String(tgt).trim() === '-' || String(tgt).toLowerCase() === 'nan');

if (srcEmpty && tgtEmpty) return '';
if (srcEmpty || tgtEmpty) return 'background:#fff3cd; color:#856404;';

let matches = false;
if (isNumeric) {
const s = parseFloat(String(src).replace(/[%$,]/g, ''));
const t = parseFloat(String(tgt).replace(/[%$,]/g, ''));
if (isNaN(s) && isNaN(t)) return '';
if (isNaN(s) || isNaN(t)) return 'background:#fff3cd; color:#856404;';
matches = Math.abs(s - t) < 0.01;
} else {
matches = String(src).toLowerCase().trim() === String(tgt).toLowerCase().trim();
}
return matches ? 'background:#d4edda; color:#155724;' : 'background:#f8d7da; color:#721c24;';
}

function getBrandStyleForAudit(srcBrand, tgtBrand) {
if (!srcBrand || !tgtBrand) return 'background:#fff3cd; color:#856404;';
const s = String(srcBrand).toLowerCase().trim();
const t = String(tgtBrand).toLowerCase().trim();
if (s === t || s.includes(t) || t.includes(s)) return 'background:#d4edda; color:#155724;';
return 'background:#f8d7da; color:#721c24;';
}

function getWeekdayStyleForAudit(srcWeekday, tgtWeekdays) {
if (!srcWeekday || !tgtWeekdays) return 'background:#fff3cd; color:#856404;';
const src = srcWeekday.toLowerCase().substring(0, 3);
const tgt = tgtWeekdays.toLowerCase();
if (tgt.includes(src)) return 'background:#d4edda; color:#155724;';
return 'background:#f8d7da; color:#721c24;';
}

// v12.26.0: SET-BASED category comparison + asymmetric blank handling
// srcCat = Google Sheet, tgtCat = MIS Entry
// MIS blank = "All Categories" (acceptable) â†’ can match GREEN
// Google Sheet blank = "Not Specified" (needs review) â†’ always ORANGE
function getCategoryStyleForAudit(srcCat, tgtCat) {
const s = String(srcCat || '').toLowerCase().trim();
const t = String(tgtCat || '').toLowerCase().trim();

// Detect blank/NaN
const srcBlank = !s || s === '-' || s === 'nan' || s === 'null' || s === 'none' || s === 'n/a';
const tgtBlank = !t || t === '-' || t === 'nan' || t === 'null' || t === 'none' || t === 'n/a';

// Detect "All Categories" (explicit)
const srcAllExplicit = s === 'all' || s.includes('all categories');
const tgtAllExplicit = t === 'all' || t.includes('all categories');

// MIS blank = "All Categories" (acceptable behavior - user doesn't need to select all)
const tgtAll = tgtBlank || tgtAllExplicit;
// Google Sheet "All Categories" (explicit) 
const srcAll = srcAllExplicit;

// v12.26.0: Google Sheet blank = "Not Specified" â†’ ORANGE (needs review/data entry)
if (srcBlank && !srcAllExplicit) {
return 'background:#fff3cd; color:#856404;';
}

// Both All = GREEN (Google Sheet explicitly says "All Categories" + MIS is blank/all)
if (srcAll && tgtAll) return 'background:#d4edda; color:#155724;';

// One All, one specific = YELLOW
if (srcAll !== tgtAll) return 'background:#fff3cd; color:#856404;';

// Both specific - SET comparison (order independent)
const srcSet = new Set(s.split(',').map(x => x.trim().toLowerCase()).filter(x => x));
const tgtSet = new Set(t.split(',').map(x => x.trim().toLowerCase()).filter(x => x));
const setsEqual = srcSet.size === tgtSet.size && [...srcSet].every(x => tgtSet.has(x));
return setsEqual ? 'background:#d4edda; color:#155724;' : 'background:#fff3cd; color:#856404;';
}

// v12.26.1: Master store list + normalization helpers for audit location comparison
const _AUDIT_ALL_STORES = new Set([
'davis', 'dixon', 'beverly hills', 'el sobrante',
'fresno (palm)', 'fresno (shaw)', 'hawthorne',
'koreatown', 'laguna woods', 'oxnard',
'riverside', 'west hollywood'
]);
const _AUDIT_STORE_NORM = {
'beverly': 'beverly hills',
'fresno': 'fresno (palm)',
'fresno palm': 'fresno (palm)',
'fresno shaw': 'fresno (shaw)',
};
function _auditNormStore(name) {
const n = name.toLowerCase().trim()
.replace(/^(the artist tree|davisville business enterprises,?\s*inc\.?|club 420)\s*[-\u2013\u2014]?\s*/i, '');
return _AUDIT_STORE_NORM[n] || n;
}
function _auditParseLocSet(locStr) {
const s = String(locStr || '').trim().toLowerCase();
if (!s || s === '-' || s === 'nan' || s === 'n/a' || s === 'null' || s === 'none' || s === 'undefined' ||
s === 'all' || s === 'all locations') {
return { isAll: true, stores: new Set(_AUDIT_ALL_STORES) };
}
// v12.26.2: Detect "All Locations Except" ANYWHERE in string; filter to known stores only
// v12.26.3: Handles both "Except:" and "(Except:" formats ANYWHERE in string
const exceptMatch = s.match(/all\s*(?:locations\s*)?[\s(]*except[):\s]*(.+)/i);
if (exceptMatch) {
const exceptions = new Set(
    exceptMatch[1].split(',')
        .map(e => _auditNormStore(e))
        .filter(e => e && _AUDIT_ALL_STORES.has(e))
);
const included = new Set([..._AUDIT_ALL_STORES].filter(st => !exceptions.has(st)));
return { isAll: false, stores: included };
}
const stores = new Set(s.split(',').map(e => _auditNormStore(e)).filter(e => e));
if (stores.size >= _AUDIT_ALL_STORES.size && [..._AUDIT_ALL_STORES].every(st => stores.has(st))) {
return { isAll: true, stores: new Set(_AUDIT_ALL_STORES) };
}
return { isAll: false, stores };
}

// v12.26.1: SET-BASED location comparison with normalization + All Except support
function getLocationStyleForAudit(srcLoc, tgtLoc) {
const GREEN = 'background:#d4edda; color:#155724;';
const YELLOW = 'background:#fff3cd; color:#856404;';

const src = _auditParseLocSet(srcLoc);
const tgt = _auditParseLocSet(tgtLoc);

// Both All â†’ GREEN
if (src.isAll && tgt.isAll) return GREEN;

// Compare as normalized sets (handles All Except vs explicit list)
const setsEqual = src.stores.size === tgt.stores.size &&
              [...src.stores].every(x => tgt.stores.has(x));
return setsEqual ? GREEN : YELLOW;
}

// Build Blaze section (Section 3)
function buildBlazeSection(deal) {
// v12.25.1: Check multiple sources for Blaze data
// PRIORITY ORDER:
// 1. blaze_discount_title from Google Sheet (already applied = already approved)
// 2. approvedMatches (where Blaze titles are stored when approved in ID Matcher)
// 3. deal.blaze_titles directly attached
// 4. blazeMatches global

let blazeTitles = [];

// v12.25.1: FIRST check Google Sheet column "Blaze Discount Title"
// If this has a value, the discount was already applied to the sheet = already approved
const sheetBlazeTitle = (deal.blaze_discount_title || '').trim();
if (sheetBlazeTitle && blazeData && blazeData.currentRows && blazeData.currentRows.length > 0) {
// Parse multiple titles (may be comma or newline separated)
const sheetTitles = sheetBlazeTitle.split(/[,\n]+/).map(t => t.trim()).filter(t => t);

sheetTitles.forEach(titleToFind => {
    // Search for this title in Blaze data
    const matchingBlaze = blazeData.currentRows.find(row => {
        const blazeName = (row.Name || '').trim().toLowerCase();
        const searchTitle = titleToFind.toLowerCase();
        // Exact match or contains (for partial title matching)
        return blazeName === searchTitle || blazeName.includes(searchTitle) || searchTitle.includes(blazeName);
    });
    
    if (matchingBlaze) {
        // Found in Blaze data - add full details
        blazeTitles.push({
            id: matchingBlaze.Id || matchingBlaze.id || '-',
            name: matchingBlaze.Name || titleToFind,
            active: (matchingBlaze.Status || '').toLowerCase() === 'active',
            type: matchingBlaze['Discount Value Type'] || '-',
            value: matchingBlaze['Discount Value'] || '-',
            locations: matchingBlaze.Locations || '-',
            start_date: matchingBlaze['Start Date'] || '-',
            end_date: matchingBlaze['End Date'] || '-',
            source: 'sheet'  // Mark as from Google Sheet
        });
    } else {
        // Title in sheet but not found in Blaze data - still show it
        blazeTitles.push({
            id: '-',
            name: titleToFind,
            active: null,  // Unknown
            type: '-',
            value: '-',
            locations: '-',
            start_date: '-',
            end_date: '-',
            source: 'sheet_only'  // Only in sheet, not found in Blaze
        });
    }
});
}

// If no sheet titles found, try approvedMatches (primary source for newly approved)
if (blazeTitles.length === 0) {
const approvedData = approvedMatches[deal.google_row];
if (approvedData && approvedData.blaze_titles && approvedData.blaze_titles.length > 0) {
    blazeTitles = approvedData.blaze_titles;
}
}

// Also check if deal has blaze_titles directly attached
if (blazeTitles.length === 0 && deal.blaze_titles && deal.blaze_titles.length > 0) {
blazeTitles = deal.blaze_titles;
}

// Check blazeMatches global (if it exists) - alternative storage for Blaze data
if (blazeTitles.length === 0 && typeof blazeMatches !== 'undefined' && blazeMatches[deal.google_row]) {
const blazeData = blazeMatches[deal.google_row];
if (blazeData.titles && blazeData.titles.length > 0) {
    blazeTitles = blazeData.titles;
}
}

if (blazeTitles.length === 0) {
return `
    <div class="card mb-3 border-info">
        <div class="card-header bg-info text-white">
            <strong><i class="bi bi-lightning"></i> Section 3: Blaze Discounts</strong>
        </div>
        <div class="card-body">
            <p class="text-muted mb-0"><i class="bi bi-info-circle"></i> No Blaze discounts assigned to this deal.</p>
            <small class="text-muted">Tip: If a Blaze discount title is in the Google Sheet, it will appear here after syncing Blaze data.</small>
        </div>
    </div>
`;
}

let html = `
<div class="card mb-3 border-info">
    <div class="card-header bg-info text-white">
        <strong><i class="bi bi-lightning"></i> Section 3: Blaze Discounts (${blazeTitles.length})</strong>
    </div>
    <div class="card-body p-2">
        <div style="overflow-x: auto;">
            <table class="table table-sm table-bordered mb-0" style="font-size: 0.85em;">
                <thead style="background:#e9ecef; color:#212529;">
                    <tr>
                        <th style="width:90px;">View</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Locations</th>
                        <th>Start</th>
                        <th>End</th>
                    </tr>
                </thead>
                <tbody>
`;

blazeTitles.forEach(title => {
// v12.25.1: Handle different status scenarios
let statusBadge;
if (title.source === 'sheet_only') {
    statusBadge = '<span class="badge bg-warning text-dark" title="Title in Google Sheet but not found in current Blaze data">In Sheet Only</span>';
} else if (title.active === true) {
    statusBadge = '<span class="badge bg-success">Active</span>';
} else if (title.active === false) {
    statusBadge = '<span class="badge bg-secondary">Inactive</span>';
} else {
    statusBadge = '<span class="badge bg-light text-dark">Unknown</span>';
}

// Highlight source from sheet
const nameStyle = title.source === 'sheet' || title.source === 'sheet_only' ? 'background:#e7f1ff;' : '';

// v12.25.4: ID column becomes View button
let viewButton;
const hasValidId = title.id && title.id !== '-' && title.id !== '';

if (title.source === 'sheet_only') {
    // Not found in Blaze - disabled button
    viewButton = '<button class="btn btn-sm btn-secondary" disabled style="font-size:0.75rem; padding:2px 6px; opacity:0.6;" title="Not found in current Blaze data">Not in Blaze</button>';
} else if (hasValidId) {
    // Found in Blaze - clickable View button
    viewButton = `<button onclick="navBlaze('promo', '${title.id}'); return false;" class="btn btn-sm btn-primary" style="font-size:0.75rem; padding:2px 6px;" title="ID: ${title.id}">View</button>`;
} else {
    // No ID available
    viewButton = '<span class="text-muted">No ID</span>';
}

html += `
    <tr style="${nameStyle}">
        <td>${viewButton}</td>
        <td>${title.name || '-'}${title.source === 'sheet' ? ' <small class="text-success">(from Sheet)</small>' : ''}</td>
        <td>${statusBadge}</td>
        <td>${title.type || '-'}</td>
        <td>${title.value || '-'}</td>
        <td title="${title.locations || ''}" style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title.locations || '-'}</td>
        <td>${title.start_date || '-'}</td>
        <td>${title.end_date || '-'}</td>
    </tr>
`;
});

html += `</tbody></table></div></div></div>`;
return html;
}

// Build multi-brand checklist
function buildMultiBrandChecklist(deal) {
const brands = (deal.brand_raw || deal.brand || '').split(',').map(b => b.trim()).filter(b => b);

let html = `
<div class="card mb-3 border-warning">
    <div class="card-header bg-warning text-dark">
        <strong><i class="bi bi-tags"></i> Multi-Brand Verification (${brands.length} brands)</strong>
    </div>
    <div class="card-body">
        <div class="list-group">
`;

brands.forEach((brand, idx) => {
html += `
    <div class="list-group-item d-flex justify-content-between align-items-center">
        <span><strong>${idx + 1}.</strong> ${brand}</span>
        <div class="form-check">
            <input class="form-check-input" type="checkbox" id="multiBrandCheck${idx}">
            <label class="form-check-label" for="multiBrandCheck${idx}">Verified</label>
        </div>
    </div>
`;
});

html += `</div></div></div>`;
return html;
}

// Mark a deal in audit
function markAuditDeal(auditIdx, status) {
const deals = comprehensiveAuditState.deals;
const deal = deals[auditIdx];
const notes = document.getElementById('auditNotes')?.value || '';

comprehensiveAuditState.results[deal.google_row] = {
status: status,
notes: notes,
auditedAt: new Date().toISOString()
};

// Update table row
renderAuditOverview();

// Save progress
saveAuditProgress();

// If in sequential mode and not at end, move to next
if (comprehensiveAuditState.inProgress && auditIdx < deals.length - 1) {
navigateAudit(1);
} else if (auditIdx === deals.length - 1) {
// Completed all
showAuditCompletionSummary();
}
}

// Navigate in audit (prev/next)
function navigateAudit(direction) {
const newIdx = comprehensiveAuditState.currentIndex + direction;
const deals = comprehensiveAuditState.deals;

if (newIdx >= 0 && newIdx < deals.length) {
showAuditPopup(newIdx);
}
}

// Exit audit popup
function exitAuditPopup() {
if (confirm('Exit audit? Progress will be saved.')) {
saveAuditProgress();
const overlay = document.getElementById('comprehensive-audit-popup-overlay');
if (overlay) overlay.remove();
document.getElementById('exportAuditBtn').disabled = false;
}
}

// Show completion summary
function showAuditCompletionSummary() {
const results = comprehensiveAuditState.results;
const deals = comprehensiveAuditState.deals;

let verified = 0, attention = 0, skipped = 0, pending = 0;
deals.forEach(d => {
const r = results[d.google_row];
if (!r) pending++;
else if (r.status === 'verified') verified++;
else if (r.status === 'attention') attention++;
else if (r.status === 'skipped') skipped++;
});

const overlay = document.getElementById('comprehensive-audit-popup-overlay');
if (overlay) {
overlay.innerHTML = `
    <div style="background: #fff; padding: 30px; border-radius: 8px; text-align: center; max-width: 500px;">
        <h3><i class="bi bi-check-circle-fill text-success"></i> Audit Complete!</h3>
        <hr>
        <div class="row text-center mb-3">
            <div class="col"><h4 class="text-success mb-0">${verified}</h4><small>Verified</small></div>
            <div class="col"><h4 class="text-warning mb-0">${attention}</h4><small>Attention</small></div>
            <div class="col"><h4 class="text-secondary mb-0">${skipped}</h4><small>Skipped</small></div>
        </div>
        ${attention > 0 ? `<button class="btn btn-warning me-2" onclick="reviewAttentionItems()">Review ${attention} Attention Items</button>` : ''}
        <button class="btn btn-info me-2" onclick="exportAuditReport()">Export Report</button>
        <button class="btn btn-secondary" onclick="document.getElementById('comprehensive-audit-popup-overlay').remove()">Close</button>
    </div>
`;
}

comprehensiveAuditState.inProgress = false;
document.getElementById('exportAuditBtn').disabled = false;
}

// Review attention items
function reviewAttentionItems() {
const deals = comprehensiveAuditState.deals;
const results = comprehensiveAuditState.results;

// Find first attention item
for (let i = 0; i < deals.length; i++) {
const r = results[deals[i].google_row];
if (r && r.status === 'attention') {
    showAuditPopup(i);
    return;
}
}
}

// Save audit progress to server
async function saveAuditProgress() {
const state = comprehensiveAuditState;
const payload = {
audit_id: state.auditId || 'audit_' + Date.now(),
tab_name: state.tabName,
started_at: state.startedAt,
settings: state.settings,
total_deals: state.deals.length,
current_index: state.currentIndex,
results: Object.entries(state.results).map(([row, data]) => ({
    row_number: parseInt(row),
    status: data.status,
    notes: data.notes,
    audited_at: data.auditedAt
}))
};

try {
await api.audit.saveState(payload);
// Also save to localStorage as backup
localStorage.setItem('comprehensiveAuditState', JSON.stringify(payload));
} catch (e) {
console.error('Failed to save audit state:', e);
// Still save to localStorage
localStorage.setItem('comprehensiveAuditState', JSON.stringify(payload));
}
}

// Load audit state from server
async function loadAuditStateFromServer() {
const tabName = document.getElementById('mis-tab')?.value || '';

try {
const response = await apiGet(`/api/audit/load-state?tab=${encodeURIComponent(tabName)}`);
const data = await response.json();

if (data.success && data.state && data.state.results && data.state.results.length > 0) {
    const completedCount = data.state.results.length;
    const totalCount = data.state.total_deals;
    
    // v12.25.0: Custom Yes/No popup instead of confirm()
    showResumeAuditPopup(completedCount, totalCount, data.state);
}
} catch (e) {
// Try localStorage backup
const localState = localStorage.getItem('comprehensiveAuditState');
if (localState) {
    try {
        const parsed = JSON.parse(localState);
        if (parsed.tab_name === tabName && parsed.results && parsed.results.length > 0) {
            showResumeAuditPopup(parsed.results.length, parsed.total_deals, parsed, true);
        }
    } catch (parseErr) {
        console.error('Failed to parse local state:', parseErr);
    }
}
}
}

// v12.25.0: Custom Yes/No popup for resuming audit
function showResumeAuditPopup(completedCount, totalCount, savedState, isLocal = false) {
const sourceText = isLocal ? 'local backup' : 'incomplete audit';
const content = `
<div id="resumeAuditPopup" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:10002; display:flex; align-items:center; justify-content:center;">
    <div style="background:white; padding:30px; border-radius:12px; max-width:450px; text-align:center; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <div style="margin-bottom:20px;">
            <i class="bi bi-question-circle" style="font-size:3em; color:#667eea;"></i>
        </div>
        <h4 style="margin-bottom:15px;">Resume Previous Audit?</h4>
        <p style="color:#6c757d; margin-bottom:25px;">
            Found ${sourceText}:<br>
            <strong>${completedCount} of ${totalCount}</strong> deals completed.<br>
            Would you like to continue where you left off?
        </p>
        <div style="display:flex; gap:15px; justify-content:center;">
            <button class="btn btn-lg" style="background-color:#28a745; color:white; min-width:100px;" onclick="resumeAuditFromState(${JSON.stringify(savedState).replace(/"/g, '&quot;')}); document.getElementById('resumeAuditPopup').remove();">
                <i class="bi bi-check-lg"></i> Yes
            </button>
            <button class="btn btn-lg" style="background-color:#dc3545; color:white; min-width:100px;" onclick="document.getElementById('resumeAuditPopup').remove();">
                <i class="bi bi-x-lg"></i> No
            </button>
        </div>
    </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', content);
}

// v12.25.0: Resume audit from saved state
function resumeAuditFromState(savedState) {
// Parse if string
let state = savedState;
if (typeof savedState === 'string') {
try {
    state = JSON.parse(savedState.replace(/&quot;/g, '"'));
} catch (e) {
    console.error('Failed to parse saved state:', e);
    return;
}
}

// Restore state
if (state.results) {
state.results.forEach(r => {
    comprehensiveAuditState.results[r.row_number] = {
        status: r.status,
        notes: r.notes,
        auditedAt: r.audited_at
    };
});
}
comprehensiveAuditState.currentIndex = state.current_index || 0;
comprehensiveAuditState.auditId = state.audit_id;
comprehensiveAuditState.startedAt = state.started_at;

// Update UI
renderAuditOverview();
}

// Export audit report as CSV
async function exportAuditReport() {
const state = comprehensiveAuditState;
const deals = state.deals;
const results = state.results;

if (deals.length === 0) {
alert('No deals to export.');
return;
}

// Build CSV content
let csv = 'Row Number,Section,Brand(s),Linked Brand,Weekday,MIS ID(s),Audit Status,Issues Found,Audited Date,Notes\n';

deals.forEach(deal => {
const r = results[deal.google_row] || {};
const section = (deal.section || '').replace(/,/g, ';');
const brand = (deal.brand || '').replace(/,/g, ';');
const linked = (deal.linked_brand || '').replace(/,/g, ';');
const weekday = (deal.weekday || '').replace(/,/g, ';');
const misId = (deal.current_sheet_id || '').replace(/,/g, ';');
const status = r.status || 'pending';
const issues = ''; // Could be enhanced to detect issues
const auditedAt = r.auditedAt || '';
const notes = (r.notes || '').replace(/,/g, ';').replace(/\n/g, ' ');

csv += `${deal.google_row},"${section}","${brand}","${linked}","${weekday}","${misId}","${status}","${issues}","${auditedAt}","${notes}"\n`;
});

// Create download
const blob = new Blob([csv], { type: 'text/csv' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
a.href = url;
a.download = `Audit_${state.tabName.replace(/\s+/g, '_')}_${timestamp}.csv`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
}

// Helper: Show more info for MIS entry - full details popup
function showMoreInfoForAudit(misId, misData) {
// Parse the data if it's a string
let data = misData;
if (typeof misData === 'string') {
try {
    data = JSON.parse(misData.replace(/&quot;/g, '"'));
} catch (e) {
    data = {};
}
}

// Build detailed info popup
let content = `
<div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10001; display:flex; align-items:center; justify-content:center;" onclick="this.remove()">
    <div style="background:white; padding:20px; border-radius:8px; max-width:600px; max-height:80vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.3);" onclick="event.stopPropagation()">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:2px solid #667eea; padding-bottom:10px;">
            <h5 style="margin:0; color:#667eea;"><i class="bi bi-database"></i> MIS Entry: ${misId}</h5>
            <button class="btn btn-sm btn-outline-secondary" onclick="this.closest('div[style*=position]').remove()"><i class="bi bi-x"></i></button>
        </div>
        <table class="table table-sm table-bordered" style="font-size:0.9em;">
            <tbody>
                <tr><th style="width:35%; background:#f8f9fa;">MIS ID</th><td><strong>${misId}</strong></td></tr>
                <tr><th style="background:#f8f9fa;">Brand</th><td>${data.brand || '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">Linked Brand</th><td>${data.linked_brand || '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">Weekdays</th><td>${data.weekdays || '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">Category</th><td>${data.category || '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">Discount</th><td>${data.discount !== null && data.discount !== undefined ? data.discount + '%' : '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">Vendor Contribution</th><td>${data.vendor_contribution !== null && data.vendor_contribution !== undefined ? data.vendor_contribution + '%' : '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">Locations</th><td>${data.locations || '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">Start Date</th><td>${data.start_date || '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">End Date</th><td>${data.end_date || '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">Deal Name</th><td>${data.deal_name || '-'}</td></tr>
                <tr><th style="background:#f8f9fa;">Notes</th><td>${data.notes || '-'}</td></tr>
            </tbody>
        </table>
        <div class="text-center mt-3">
            <button class="btn btn-primary btn-sm" onclick="lookupMisIdWithValidation(this, '${misId}'); this.closest('div[style*=position]').remove();">
                <i class="bi bi-search"></i> Lookup in MIS
            </button>
        </div>
    </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', content);
}

// ============================================
// GOOGLE SHEET CONFLICT AUDIT (Pre-Flight Check)
// ============================================
async function runGSheetConflictAudit() {
const btn = event.target;
const originalText = btn.innerHTML;
btn.disabled = true;
btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Scanning Google Sheet...';

document.getElementById('gsheet-audit-results').innerHTML = '';
document.getElementById('gsheet-audit-stats').innerText = 'Scanning...';
document.getElementById('gsheet-audit-stats').className = 'badge bg-info fs-6 me-2';

try {
const tab = document.getElementById('mis-tab').value;

if (!tab) {
    alert('Please select a Google Sheet tab in the Setup section first.');
    document.getElementById('gsheet-audit-stats').innerText = 'No Tab Selected';
    document.getElementById('gsheet-audit-stats').className = 'badge bg-danger fs-6 me-2';
    return;
}

const data = await api.audit.gsheetConflict({ tab: tab });

if (data.success) {
    displayGSheetConflictResults(data);
    
    const conflictCount = data.conflicts ? data.conflicts.length : 0;
    if (conflictCount > 0) {
        document.getElementById('gsheet-audit-stats').innerText = 
            `[!] ⚠️⚠️ ${conflictCount} Cross-Section Conflicts Found`;
        document.getElementById('gsheet-audit-stats').className = 'badge bg-warning text-dark fs-6 me-2';
    } else {
        document.getElementById('gsheet-audit-stats').innerText = 
            `[OK]✅ No Cross-Section Conflicts`;
        document.getElementById('gsheet-audit-stats').className = 'badge bg-success fs-6 me-2';
    }
} else {
    document.getElementById('gsheet-audit-results').innerHTML = 
        `<div class="alert alert-danger">[X] Error: ${data.error}</div>`;
    document.getElementById('gsheet-audit-stats').innerText = 'Error';
    document.getElementById('gsheet-audit-stats').className = 'badge bg-danger fs-6 me-2';
}
} catch (e) {
document.getElementById('gsheet-audit-results').innerHTML = 
    `<div class="alert alert-danger">[X] Network Error: ${e.message}</div>`;
document.getElementById('gsheet-audit-stats').innerText = 'Error';
document.getElementById('gsheet-audit-stats').className = 'badge bg-danger fs-6 me-2';
} finally {
btn.disabled = false;
btn.innerHTML = originalText;
}
}
