// static/js/tabs/mis-audit.js
// Audit tab: GSheet conflict, cleanup audit, comprehensive audit, conflict audit
// Extracted from monolith v12.27 by Step 7

function displayGSheetConflictResults(data) {
    const container = document.getElementById('gsheet-audit-results');
    const dateConflicts = data.date_conflicts || [];
    const brandConflicts = data.brand_conflicts || [];
    const summary = data.summary || {};
    const dateContext = data.date_context || 'Unknown';
    
    // --- 1. Summary Header ---
    let html = `
        <div class="card mb-4 shadow-sm">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
                <strong> Sheet Analysis Summary</strong>
                <span class="badge bg-dark fs-6">📅 Context: ${dateContext}</span>
            </div>
            <div class="card-body">
                <div class="row text-center">
                    <div class="col-md-3">
                        <div class="border rounded p-3">
                            <h4 class="text-primary mb-0">${summary.weekly_count || 0}</h4>
                            <small class="text-muted">&#x1F4C5; Weekly Deals</small>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="border rounded p-3">
                            <h4 class="text-info mb-0">${summary.monthly_count || 0}</h4>
                            <small class="text-muted"> Monthly Deals</small>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="border rounded p-3">
                            <h4 class="text-warning mb-0">${summary.sale_count || 0}</h4>
                            <small class="text-muted"> Sale Deals</small>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="border rounded p-3">
                            <h4 class="text-secondary mb-0">${summary.unique_brands || 0}</h4>
                            <small class="text-muted"> Unique Brands</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- 2. Tab Navigation ---
    html += `
        <ul class="nav nav-tabs mb-3" id="auditSubTabs" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active fw-bold" id="tab-date-conflicts" data-bs-toggle="tab" data-bs-target="#pane-date-conflicts" type="button" role="tab">
                     Conflictions by Date 
                    <span class="badge bg-danger ms-2">${dateConflicts.length}</span>
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link fw-bold" id="tab-brand-conflicts" data-bs-toggle="tab" data-bs-target="#pane-brand-conflicts" type="button" role="tab">
                     Conflictions by Brand
                    <span class="badge bg-secondary ms-2">${brandConflicts.length}</span>
                </button>
            </li>
        </ul>
        
        <div class="tab-content" id="auditSubTabsContent">
    `;

    // --- 3. Pane A: Date Conflicts ---
    html += `<div class="tab-pane fade show active" id="pane-date-conflicts" role="tabpanel">`;
    
    if (dateConflicts.length === 0) {
        html += `
            <div class="text-center p-4 border rounded bg-light text-success">
                <h4><i class="bi bi-check-circle-fill"></i> No Date-Based Conflicts</h4>
                <p class="mb-0">No brands overlap on the exact same dates.</p>
            </div>`;
    } else {
        html += `
            <div class="alert alert-warning">
                <h6 class="mb-1"><i class="bi bi-exclamation-triangle-fill"></i> STRICT OVERLAP</h6>
                These brands have deals scheduled on the <strong>exact same date</strong> in different sections.
            </div>
            <div class="accordion" id="accDateConflicts">`;
        
        dateConflicts.forEach((conflict, idx) => {
            const groupID = `dc${idx}`;
            const sectionBadges = conflict.sections.map(s => `<span class="badge bg-secondary me-1">${s.toUpperCase()}</span>`).join('');
            const datesBadges = conflict.conflicting_dates.map(d => `<span class="badge bg-danger me-1">${d.date}</span>`).join('');
            
            html += `
                <div class="card mb-3 shadow-sm" style="border-left: 5px solid #dc3545;">
                    <div class="card-header bg-white collapsed" data-bs-toggle="collapse" data-bs-target="#${groupID}" style="cursor:pointer;">
                        <div class="d-flex justify-content-between">
                            <div><span class="fw-bold fs-5"> ${conflict.brand}</span> <span class="ms-2">${sectionBadges}</span></div>
                            <span class="badge bg-danger">${conflict.total_conflict_dates} dates</span>
                        </div>
                        <div class="mt-1 small text-muted">Overlapping: ${datesBadges}</div>
                    </div>
                    <div id="${groupID}" class="collapse" data-bs-parent="#accDateConflicts">
                        <div class="card-body p-0 table-responsive">
                            ${renderAuditTable(conflict.rows, true)}
                        </div>
                    </div>
                </div>`;
        });
        html += `</div>`; // End Accordion
    }
    html += `</div>`; // End Pane A

    // --- 4. Pane B: Brand Conflicts ---
    html += `<div class="tab-pane fade" id="pane-brand-conflicts" role="tabpanel">`;
    
    if (brandConflicts.length === 0) {
        html += `
            <div class="text-center p-4 border rounded bg-light text-success">
                <h4><i class="bi bi-check-circle-fill"></i> No Brand Overlaps</h4>
                <p class="mb-0">Every brand appears in only one section type.</p>
            </div>`;
    } else {
        html += `
            <div class="alert alert-secondary" style="border-left: 5px solid #6c757d;">
                <h6 class="mb-1"><i class="bi bi-info-circle-fill"></i> BROAD OVERLAP</h6>
                These brands appear in multiple sections (e.g., Weekly AND Sale) but <strong>do not necessarily overlap dates</strong>.
            </div>
            <div class="accordion" id="accBrandConflicts">`;

        brandConflicts.forEach((conflict, idx) => {
            const groupID = `bc${idx}`;
            const sectionBadges = conflict.sections.map(s => `<span class="badge bg-secondary me-1">${s.toUpperCase()}</span>`).join('');
            
            html += `
                <div class="card mb-3 shadow-sm" style="border-left: 5px solid #6c757d;">
                    <div class="card-header bg-white collapsed" data-bs-toggle="collapse" data-bs-target="#${groupID}" style="cursor:pointer;">
                        <div class="d-flex justify-content-between">
                            <div><span class="fw-bold fs-5"> ${conflict.brand}</span> <span class="ms-2">${sectionBadges}</span></div>
                            <span class="badge bg-secondary">${conflict.rows.length} rows</span>
                        </div>
                    </div>
                    <div id="${groupID}" class="collapse" data-bs-parent="#accBrandConflicts">
                        <div class="card-body p-0 table-responsive">
                            ${renderAuditTable(conflict.rows, false)}
                        </div>
                    </div>
                </div>`;
        });
        html += `</div>`; // End Accordion
    }
    html += `</div>`; // End Pane B
    
    html += `</div>`; // End Tab Content
    
    container.innerHTML = html;
    initTooltips();
}

// Helper to render table rows (reused for both tabs)
// UPDATED: Tight padding, recalculated widths to prevent scrolling
function renderAuditTable(rows, showConflictDate) {
    // Added explicit padding style to th/td to reduce gaps
    const cellStyle = 'padding: 2px 4px; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    const wrapStyle = 'padding: 2px 4px; vertical-align: middle; white-space: normal; word-break: break-word;'; // For Notes/Locations
    
    let table = `<table class="table table-sm table-hover mb-0" style="font-size:0.85em; table-layout: fixed; width: 100%;">
        <thead class="table-light">
            <tr>`;
    
    // Total width must equal 100% to avoid scrollbars
    if (showConflictDate) {
        // Scenario A: WITH Conflict Date (Total 100%)
        table += `<th style="width: 9%; ${cellStyle}">Conflict Date</th>`;
        table += `
            <th style="width: 7%; ${cellStyle}">Section</th>
            <th style="width: 4%; ${cellStyle}">Row</th>
            <th style="width: 9%; ${wrapStyle}">Date/Day</th>
            <th style="width: 6%; ${cellStyle}">Discount</th>
            <th style="width: 6%; ${cellStyle}">Vendor %</th>
            <th style="width: 20%; ${wrapStyle}">Locations</th>
            <th style="width: 28%; ${wrapStyle}">Notes</th>
            <th style="width: 6%; ${cellStyle}">MIS ID</th>
            <th style="width: 5%; ${cellStyle}">Action</th>`;
    } else {
        // Scenario B: Brand View (No Conflict Date) (Total 100%)
        // Distributed extra space to Notes & Locations
        table += `
            <th style="width: 7%; ${cellStyle}">Section</th>
            <th style="width: 4%; ${cellStyle}">Row</th>
            <th style="width: 9%; ${wrapStyle}">Date/Day</th>
            <th style="width: 6%; ${cellStyle}">Discount</th>
            <th style="width: 6%; ${cellStyle}">Vendor %</th>
            <th style="width: 22%; ${wrapStyle}">Locations</th>
            <th style="width: 35%; ${wrapStyle}">Notes</th>
            <th style="width: 6%; ${cellStyle}">MIS ID</th>
            <th style="width: 5%; ${cellStyle}">Action</th>`;
    }
    
    table += `</tr></thead><tbody>`;

    rows.forEach(row => {
        const sectionColors = { 'weekly': 'primary', 'monthly': 'info', 'sale': 'warning' };
        const badge = `<span class="badge bg-${sectionColors[row.section] || 'secondary'}">${row.section.charAt(0).toUpperCase()}</span>`; // Abbreviated Badge
        
        // Stack Date/Weekday Values
        let dateDisplay = row.weekday_raw || '-';
        if (dateDisplay.includes(',')) {
            dateDisplay = dateDisplay.replace(/,\s*/g, '<br>');
        }

        // Color Code Locations
        let locText = row.locations || '-';
        let locStyle = 'color: #fd7e14;'; 
        if (locText.includes('All Locations Except')) {
            locStyle = 'color: #dc3545; font-weight: bold;'; 
        } else if (locText.trim() === 'All Locations') {
            locStyle = 'color: #198754; font-weight: bold;'; 
        }

        const truncate = (t, l) => t && t.length > l ? t.substring(0, l) + '...' : (t || '-');
        
        // Truncate based on width
        const notes = row.notes ? `<span title="${row.notes.replace(/"/g, '&quot;')}">${truncate(row.notes, 45)}</span>` : '-';
        const locDisplay = `<span style="${locStyle}" title="${locText.replace(/"/g, '&quot;')}">${truncate(locText, 35)}</span>`;
        
        let misLink = '-';
        if(row.mis_id && row.mis_id !== '-') {
            misLink = row.mis_id.split(',').map(id => 
                `<a href="#" onclick="lookupMisId('${id.trim()}'); return false;" style="font-weight:bold; text-decoration:underline;">${id.trim()}</a>`
            ).join(', ');
        }

        table += `<tr>`;
        if (showConflictDate) table += `<td style="${cellStyle}"><span class="badge bg-danger">${row.conflict_date}</span></td>`;
        table += `
            <td style="${cellStyle}">${badge}</td>
            <td style="${cellStyle} text-align:center; font-weight:bold;">${row.row_num}</td>
            <td style="${wrapStyle} line-height: 1.1;">${dateDisplay}</td>
            <td style="${cellStyle}">${row.discount}</td>
            <td style="${cellStyle}">${row.vendor_contrib}</td>
            <td style="${wrapStyle}">${locDisplay}</td>
            <td style="${wrapStyle}">${notes}</td>
            <td style="${cellStyle}">${misLink}</td>
            <td style="${cellStyle}"><button class="btn btn-sm btn-outline-primary py-0 px-1" style="font-size: 0.8em;" onclick="openSheetRow(${row.row_num})">Row →📋</button></td>
        </tr>`;
    });
    table += `</tbody></table>`;
    return table;
}

function initTooltips() {
    setTimeout(function() {
        var tooltipTriggerList = [].slice.call(document.querySelectorAll('[title]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }, 500);
}

// ============================================
// CLEANUP AUDIT - Find stale MIS entries
// ============================================
let cleanupAuditData = { fullMatch: [], idOnly: [] };

function switchCleanupMethod(method, btnElement) {
    // Hide all method contents
    document.querySelectorAll('.cleanup-method-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // Deactivate all tabs
    document.querySelectorAll('#cleanupMethodTabs .nav-link').forEach(el => {
        el.classList.remove('active');
    });
    
    // Show selected method
    const targetEl = document.getElementById('cleanup-method-' + method);
    if (targetEl) {
        targetEl.style.display = 'block';
    }
    
    // Activate button
    if (btnElement) {
        btnElement.classList.add('active');
    }
}

function filterCleanupSection(method, section, btnElement) {
    const containerId = method === 'full-match' ? 'cleanup-full-match-results' : 'cleanup-id-only-results';
    const tabsId = method === 'full-match' ? 'cleanupFullMatchSectionTabs' : 'cleanupIdOnlySectionTabs';
    
    // Update active state on pills
    document.querySelectorAll(`#${tabsId} .nav-link`).forEach(el => {
        el.classList.remove('active');
    });
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    // Filter rows in the table
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const rows = container.querySelectorAll('tbody tr[data-section]');
    rows.forEach(row => {
        const rowSection = row.getAttribute('data-section');
        if (section === 'all' || rowSection === section) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
    
    // Update visible count
    const visibleCount = container.querySelectorAll('tbody tr[data-section]:not([style*="display: none"])').length;
    const countBadge = container.querySelector('.cleanup-count-badge');
    if (countBadge) {
        countBadge.textContent = visibleCount + ' entries';
    }
}

async function runCleanupAudit() {
    const statsEl = document.getElementById('cleanup-audit-stats');
    const fullMatchResultsEl = document.getElementById('cleanup-full-match-results');
    const idOnlyResultsEl = document.getElementById('cleanup-id-only-results');
    
    statsEl.textContent = 'Scanning...';
    statsEl.className = 'badge bg-warning fs-6 me-2';
    fullMatchResultsEl.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div><div class="mt-2">Scanning MIS CSV for stale entries...</div></div>';
    idOnlyResultsEl.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div><div class="mt-2">Scanning MIS CSV for stale entries...</div></div>';
    
    try {
        const tab = document.getElementById('mis-tab').value || (typeof misData !== 'undefined' ? misData.tabName : '') || '';
        if (!tab) {
            alert('Please select a sheet tab in Setup first');
            statsEl.textContent = 'Ready';
            statsEl.className = 'badge bg-secondary fs-6 me-2';
            fullMatchResultsEl.innerHTML = '<p class="text-muted">Select a sheet tab first.</p>';
            idOnlyResultsEl.innerHTML = '<p class="text-muted">Select a sheet tab first.</p>';
            return;
        }
        
        const formData = new FormData();
        formData.append('tab', tab);
        
        if (misData.csvFile) {
            formData.append('csv', misData.csvFile);
        } else if (misData.localPath) {
            formData.append('local_csv_path', misData.localPath);
        }
        
        const data = await api.audit.cleanup(formData, true);
        
        if (data.success) {
            cleanupAuditData = data.results;
            const totalIssues = (data.results.fullMatch?.length || 0) + (data.results.idOnly?.length || 0);
            statsEl.textContent = totalIssues + ' potential issues';
            statsEl.className = totalIssues > 0 ? 'badge bg-danger fs-6 me-2' : 'badge bg-success fs-6 me-2';
            renderCleanupResults('full-match', data.results.fullMatch || []);
            renderCleanupResults('id-only', data.results.idOnly || []);
        } else {
            statsEl.textContent = 'Error';
            statsEl.className = 'badge bg-danger fs-6 me-2';
            fullMatchResultsEl.innerHTML = `<div class="alert alert-danger">Error: ${data.error}</div>`;
            idOnlyResultsEl.innerHTML = `<div class="alert alert-danger">Error: ${data.error}</div>`;
        }
    } catch (error) {
        statsEl.textContent = 'Error';
        statsEl.className = 'badge bg-danger fs-6 me-2';
        fullMatchResultsEl.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        idOnlyResultsEl.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

function renderCleanupResults(method, results) {
    const containerId = method === 'full-match' ? 'cleanup-full-match-results' : 'cleanup-id-only-results';
    const container = document.getElementById(containerId);
    
    if (!results || results.length === 0) {
        container.innerHTML = `<div class="alert alert-success"><i class="bi bi-check-circle"></i> No stale entries found using ${method === 'full-match' ? 'Full Field Match' : 'MIS ID Only'} detection.</div>`;
        return;
    }
    
    // Count by section
    const sectionCounts = { weekly: 0, monthly: 0, sale: 0 };
    results.forEach(r => {
        const section = (r.section || 'weekly').toLowerCase();
        if (sectionCounts.hasOwnProperty(section)) {
            sectionCounts[section]++;
        }
    });
    
    let html = `<div class="d-flex justify-content-between align-items-center mb-2">
        <span class="cleanup-count-badge badge bg-danger">${results.length} entries</span>
        <small class="text-muted">Weekly: ${sectionCounts.weekly} | Monthly: ${sectionCounts.monthly} | Sale: ${sectionCounts.sale}</small>
    </div>`;
    
    html += `<div class="table-responsive"><table class="table table-sm table-bordered table-hover">
        <thead class="table-dark">
            <tr>
                <th style="width:80px;">MIS ID</th>
                <th style="width:150px;">Brand</th>
                <th style="width:80px;">Weekday</th>
                <th style="width:70px;">Discount</th>
                <th style="width:70px;">Vendor %</th>
                <th style="width:150px;">Locations</th>
                <th style="width:90px;">Start Date</th>
                <th style="width:90px;">End Date</th>
                <th style="width:80px;">Section</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>`;
    
    results.forEach((r, idx) => {
        const section = (r.section || 'weekly').toLowerCase();
        const sectionBadgeClass = section === 'weekly' ? 'bg-primary' : (section === 'monthly' ? 'bg-success' : 'bg-warning text-dark');
        
        // Format locations with numbered tooltip
        const locs = r.locations || 'All Locations';
        const locParts = locs.split(',').map(l => l.trim()).filter(l => l);
        const locDisplay = locParts.slice(0, 2).join('<br>') + (locParts.length > 2 ? '<br>...' : '');
        const locTooltip = locParts.map((l, i) => (i + 1) + '. ' + l).join('&#10;');
        
        // Format weekday vertically
        const weekday = r.weekday || '-';
        const weekdayParts = weekday.split(',').map(w => w.trim()).filter(w => w);
        const weekdayDisplay = weekdayParts.slice(0, 3).join('<br>') + (weekdayParts.length > 3 ? '<br>...' : '');
        const weekdayTooltip = weekdayParts.join('&#10;');
        
        // Status styling
        let statusHtml = '';
        if (r.status === 'NOT_IN_SHEET') {
            statusHtml = '<span class="badge bg-danger">NOT IN SHEET</span>';
        } else if (r.status === 'PARTIAL_MATCH') {
            statusHtml = `<span class="badge bg-warning text-dark" title="${r.partial_match_details || ''}">PARTIAL MATCH</span>`;
            if (r.partial_match_details) {
                statusHtml += `<br><small class="text-muted">${r.partial_match_details}</small>`;
            }
        } else if (r.status === 'ID_NOT_TRACKED') {
            statusHtml = '<span class="badge bg-info">ID NOT TRACKED</span>';
        } else {
            statusHtml = `<span class="badge bg-secondary">${r.status || 'UNKNOWN'}</span>`;
        }
        
        html += `<tr data-section="${section}">
            <td>
                <button class="btn btn-sm btn-outline-secondary py-0 px-2" 
                        onclick="lookupMisId('${r.mis_id}')" 
                        style="font-weight:bold;" 
                        title="Click to lookup in MIS">
                    ${r.mis_id}
                </button>
            </td>
            <td>${r.brand || '-'}</td>
            <td title="${weekdayTooltip}" style="font-size:0.85em;">${weekdayDisplay}</td>
            <td>${r.discount || '-'}%</td>
            <td>${r.vendor_pct || '-'}%</td>
            <td title="${locTooltip}" style="font-size:0.85em;">${locDisplay}</td>
            <td>${r.start_date || '-'}</td>
            <td>${r.end_date || '-'}</td>
            <td><span class="badge ${sectionBadgeClass}">${section.toUpperCase()}</span></td>
            <td>${statusHtml}</td>
        </tr>`;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

async function runConflictAudit() {
const btn = event.target;
const originalText = btn.innerHTML;
btn.disabled = true;
btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Scanning...';

document.getElementById('conflict-results').innerHTML = '';
document.getElementById('conflict-stats').innerText = 'Scanning...';

try {
    const formData = new FormData();
    // Tab is required by the backend — read from DOM or misData fallback
    const conflictTab = document.getElementById('mis-tab').value || (typeof misData !== 'undefined' ? misData.tabName : '') || '';
    if (conflictTab) formData.append('tab', conflictTab);
    // Attach active CSV if available
    if (misData.csvFile) {
        formData.append('csv', misData.csvFile);
    } else if (misData.localPath) {
        formData.append('local_csv_path', misData.localPath);
    } else if (misData.mis_csv_filename) {
         // Fallback if we stored filename but logic needs path
         formData.append('local_csv_path', misData.pulledCSVPath);
    }

    const data = await api.audit.conflict(formData, true);

    if (data.success) {
        renderConflictResults(data.conflicts);
        document.getElementById('conflict-stats').innerText = 
            `${data.conflict_groups} Conflict Groups Found (${data.total_active} Active Deals Scanned)`;
    } else {
        alert('Error: ' + data.error);
        document.getElementById('conflict-stats').innerText = 'Error';
    }
} catch (e) {
    alert('Network Error: ' + e.message);
} finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
}
}

function renderConflictResults(conflicts) {
const containerId = 'conflict-results';
const container = document.getElementById(containerId);

// Note: Conflict audit doesn't categorize by deal type (weekly/monthly/sale)
// It groups by Brand/Weekday conflicts across all deal types
const conflictCount = conflicts ? conflicts.length : 0;

// Header with sub-tabs
let headerHtml = '<h3>Conflict Analysis Results</h3>';

// Generate deal type tabs with informational counts
// Since conflicts aren't categorized by type, we show N/A for individual types
headerHtml += `
    <div class="deal-type-tabs">
        <button class="deal-type-btn" onclick="switchDealTypeTab('${containerId}', 'weekly', this)">
            &#x1F4C5; Weekly Deals <span class="badge bg-secondary">N/A</span>
        </button>
        <button class="deal-type-btn" onclick="switchDealTypeTab('${containerId}', 'monthly', this)">
             Monthly Deals <span class="badge bg-secondary">N/A</span>
        </button>
        <button class="deal-type-btn" onclick="switchDealTypeTab('${containerId}', 'sale', this)">
             Sale Deals <span class="badge bg-secondary">N/A</span>
        </button>
        <button class="deal-type-btn active" onclick="switchDealTypeTab('${containerId}', 'all', this)">
             All Conflicts <span class="badge bg-warning text-dark">${conflictCount} groups</span>
        </button>
    </div>
`;

// Info message for individual deal type tabs
const infoMessage = `
    <div class="alert alert-info">
        <i class="bi bi-info-circle"></i> 
        <strong>Note:</strong> Conflict detection works across all deal types. Conflicts are grouped by 
        <strong>Brand + Weekday</strong> regardless of whether they are Weekly, Monthly, or Sale deals.
        <br><br>
        View the <strong>"All Conflicts"</strong> tab to see all detected conflicts.
    </div>
`;

// Build content for "All" tab
let allContent = '';

if (!conflicts || conflicts.length === 0) {
    allContent = `
        <div class="text-center p-5 text-muted" style="background:#f8f9fa; border-radius:10px;">
            <h3 style="color:#28a745;"><i class="bi bi-check-circle-fill"></i> No Conflicts Found!</h3>
            <p>All active deals appear unique based on Brand/Discount/Category/Weekday.</p>
        </div>`;
} else {
    allContent = '<div class="accordion" id="conflictAccordion">';
    
    conflicts.forEach((group, idx) => {
        const groupID = `conflictGroup${idx}`;
        
        allContent += `
        <div class="card mb-3 shadow-sm" style="border-left: 5px solid #ffc107;">
            <div class="card-header bg-white" id="heading${idx}">
                <div class="d-flex justify-content-between align-items-center" 
                     style="cursor:pointer;" 
                     data-bs-toggle="collapse" 
                     data-bs-target="#${groupID}">
                    
                    <div>
                        <span class="badge bg-warning text-dark me-2">${group.count} Conflicts</span>
                        <span class="fw-bold" style="font-size:1.1em;">${group.title}</span>
                    </div>
                    <i class="bi bi-chevron-down text-muted"></i>
                </div>
            </div>

            <div id="${groupID}" class="collapse show" data-bs-parent="#conflictAccordion">
                <div class="card-body p-0">
                    <table class="table table-sm table-hover mb-0" style="font-size:0.9em;">
                        <thead class="table-light">
                            <tr>
                                <th>MIS ID</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Locations</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>`;
        
        group.rows.forEach(row => {
            const actionBtn = `<button class="btn btn-sm btn-outline-primary py-0" onclick="lookupMisId('${row.mis_id}')">View ${row.mis_id}</button>`;

            allContent += `
                            <tr>
                                <td class="fw-bold text-primary">${row.mis_id}</td>
                                <td>${row.start}</td>
                                <td>${row.end}</td>
                                <td>${row.locations}</td>
                                <td>${actionBtn}</td>
                            </tr>`;
        });

        allContent += `       </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    });

    allContent += '</div>';
}

// Build final HTML with containers
let finalHtml = headerHtml;
finalHtml += `<div id="${containerId}-weekly" class="deal-type-content">${infoMessage}</div>`;
finalHtml += `<div id="${containerId}-monthly" class="deal-type-content">${infoMessage}</div>`;
finalHtml += `<div id="${containerId}-sale" class="deal-type-content">${infoMessage}</div>`;
finalHtml += `<div id="${containerId}-all" class="deal-type-content active" style="display:block;">${allContent}</div>`;

container.innerHTML = finalHtml;
}

async function navBlaze(type, id) {
    let url = "";
    // Use the specific Setup Anchor
    if (type === 'promo') url = `https://retail.blaze.me/company-promotions/promotions/${id}#setup`;
    if (type === 'coll') url = `https://retail.blaze.me/company-promotions/smart-collections/${id}`;
    
    await api.blaze.navigate({ url: url });
}

// --- OTD Price Modal Logic (With Marketing Audit) ---
function showOtdModal(rowIndex) {
// 1. Get row data from global storage
const row = blazeData.currentRows[rowIndex];
if (!row) return;

// 2. Parse Base Price
const discountValueStr = String(row['Discount Value']).replace(/[^0-9.-]/g, '');
const discValue = parseFloat(discountValueStr);

if (isNaN(discValue)) {
alert("Invalid price value");
return;
}

// 3. Prepare Modal Elements
const modal = document.getElementById('detailModal');
const backdrop = document.getElementById('detailModalBackdrop');

document.getElementById('detailModalTitle').textContent = "OTD Price Breakdown";
document.getElementById('detailModalId').textContent = `Base Price: $${discValue.toFixed(2)}`;
document.getElementById('detailModalType').textContent = row.Name;

// 4. Determine Applicable Stores
let applicableStores = [];
const locRaw = row.Locations || '';

const ALL_LOCATIONS_LIST = [
"Beverly Hills", "Davis", "Dixon", "El Sobrante", "Fresno (Palm)",
"Fresno Shaw", "Hawthorne", "Koreatown", "Laguna Woods", 
"Oxnard", "Riverside", "West Hollywood"
];

if (locRaw === 'All Locations') {
applicableStores = ALL_LOCATIONS_LIST;
} else {
applicableStores = locRaw.split(',').map(l => l.trim()).filter(l => l);
}

// --- MARKETING AUDIT SETUP ---
let targetOtd = null;
let skipAudit = false;

// Check for Exclusion Verbiage
if (/BOGO|B2G1/i.test(row.Name)) {
skipAudit = true;
} else {
// Regex for "4 for $20", "2 for 30", etc.
const bulkMatch = row.Name.match(/(\d+)\s+for\s+\$([0-9.]+)/i);
if (bulkMatch) {
    // FIX: Use total price directly (Group 2)
    targetOtd = parseFloat(bulkMatch[2]);
}
}

// 5. Build Content HTML
let bodyHTML = '<div class="section-header" style="color: #28a745;"> OUT THE DOOR PRICES</div>';

if (typeof TAX_RATES === 'undefined' || Object.keys(TAX_RATES).length === 0) {
bodyHTML += '<div class="alert alert-warning">Tax rates not loaded yet. Please wait or check Setup tab.</div>';
} else {
const sortedStores = Object.keys(TAX_RATES).sort();
let foundAny = false;

sortedStores.forEach(store => {
    const isApplicable = applicableStores.some(loc => 
        loc.includes(store) || store.includes(loc)
    );

    if (isApplicable) {
        foundAny = true;
        const rate = TAX_RATES[store];
        const otdPrice = (discValue * rate); 
        const otdDisplay = otdPrice.toFixed(2);
        
        // AUDIT LOGIC
        let rowColor = "color:#198754;"; // Default Green
        let auditInfo = "";
        let fixAction = "";

        if (!skipAudit && targetOtd !== null && STRICT_OTD_STORES.includes(store)) {
            // FIX: Round to 2 decimals BEFORE comparing to catch visual penny variances
            const otdRounded = parseFloat(otdDisplay);
            const diff = Math.abs(otdRounded - targetOtd);
            
            // Match Logic
            if (diff < 0.009) {
                // Exact Match (Green)
                auditInfo = ` <span style="color:#198754; font-size:0.8em;">([OK]✅ Target: $${targetOtd.toFixed(2)})</span>`;
            } else if (diff <= 0.019) {
                // Penny Variance (Orange)
                rowColor = "color:#fd7e14;";
                auditInfo = ` <span style="color:#fd7e14; font-size:0.8em;">([!] ⚠️⚠️ Target: $${targetOtd.toFixed(2)})</span>`;
            } else {
                // Mismatch (Red)
                rowColor = "color:#dc3545; font-weight:bold;";
                auditInfo = ` <span style="color:#dc3545; font-size:0.8em;">([X] Target: $${targetOtd.toFixed(2)})</span>`;
                
                // Calculate Fix
                const correctPreTax = (targetOtd / rate).toFixed(2);
                fixAction = `
                    <button class="btn btn-sm btn-outline-danger" 
                        style="padding: 0px 6px; font-size: 0.75em; margin-left: 10px;" 
                        onclick="copyToClipboard('${correctPreTax}'); this.innerText='Copied!';">
                        Copy Fix: $${correctPreTax}
                    </button>
                `;
            }
        }

        bodyHTML += `
            <div class="data-row" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:6px 0;">
                <div>
                    <span class="data-label" style="font-size:1.1em;">${store}</span>
                    ${auditInfo}
                </div>
                <div style="display:flex; align-items:center;">
                    <span class="data-value" style="${rowColor} font-size:1.1em;">$${otdDisplay}</span>
                    ${fixAction}
                </div>
            </div>`;
    }
});

if (!foundAny) {
    bodyHTML += '<div class="data-row">No matching stores found for this promotion configuration.</div>';
}
}

document.getElementById('detailModalBody').innerHTML = bodyHTML;
modal.style.display = 'block';
backdrop.style.display = 'block';
}

// --- SHARED RENDER HELPER ---
async function renderBlazeTable(rows) {
// [CRITICAL] Store rows globally so buttons can access data by index
blazeData.currentRows = rows || [];

// 0. PRE-FETCH TAX RATES (Blocking) - Ensures Audit Logic has data
let TAX_RATES = {};
try {
    const data = await api.setup.getTaxRates();
    if (data.success) {
        TAX_RATES = data.rates;
    }
} catch (e) {
    console.error("Failed to pre-fetch tax rates:", e);
}

// 1. CALCULATE GLOBAL TOTALS
let totActive = 0;
let totInactive = 0;
let totZombie = 0;

if (rows && Array.isArray(rows)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Midnight Local Time
    
    rows.forEach(r => {
        const status = (r.Status || '').trim();
        if (status === 'Active') totActive++;
        else if (status === 'Inactive') totInactive++;
        
        if (status === 'Active') {
            const endDateStr = (r['End Date'] || '').trim();
            if (endDateStr) {
                try {
                    // FIX: Parse strictly as Local Time to avoid UTC shift errors
                    const parts = endDateStr.split('-'); // Assumes YYYY-MM-DD
                    if (parts.length === 3) {
                        const endDate = new Date(parts[0], parts[1] - 1, parts[2]);
                        endDate.setHours(0, 0, 0, 0);
                        
                        // LOGIC: If End Date is STRICTLY LESS than Today, it's a Zombie.
                        // If End Date == Today, it is still running (Active).
                        if (endDate.getTime() < today.getTime()) {
                            totZombie++;
                        }
                    }
                } catch (e) {}
            }
        }
    });
}

// Update DOM - Group 1 (Totals)
document.getElementById('totalCount').innerText = (rows ? rows.length : 0) + " Total Promotions";
document.getElementById('totalActive').innerText = totActive + " Active";
document.getElementById('totalInactive').innerText = totInactive + " Inactive";
document.getElementById('totalZombie').innerText = " " + totZombie + " Zombie";

// Cleanup old table
if ($.fn.DataTable.isDataTable('#promotionsTable')) {
    $('#promotionsTable').DataTable().destroy();
}

const tbody = document.querySelector('#promotionsTable tbody');
tbody.innerHTML = '';

// Helper: Get ALL location names for comparison
const ALL_LOCATIONS_LIST = [
    "Beverly Hills", "Davis", "Dixon", "El Sobrante", "Fresno (Palm)", 
    "Fresno Shaw", "Hawthorne", "Koreatown", "Laguna Woods", 
    "Oxnard", "Riverside", "West Hollywood"
].sort();

if (rows && Array.isArray(rows)) {
    rows.forEach((row, index) => {
        const tr = document.createElement('tr');
        
        // --- STATUS BADGE LOGIC ---
        const status = (row.Status || '').trim();
        const statusBadge = status === 'Active' 
            ? '<span class="badge bg-success">Active</span>' 
            : '<span class="badge bg-danger">Inactive</span>';
        
// --- DAYS UNTIL END CALCULATION ---
        const startDateStr = row['Start Date'] || '';
        const endDateStr = row['End Date'] || '';
        let daysDisplay = '-';
        let isExpired = false;
        
        if (endDateStr && endDateStr !== '') {
            try {
                // 1. Setup Dates (Local Time 00:00:00)
                const today = new Date();
                today.setHours(0, 0, 0, 0); 
                
                // Helper to parse YYYY-MM-DD cleanly to local time
                const parseLocal = (dateStr) => {
                    if (!dateStr) return null;
                    const parts = dateStr.split('-');
                    if (parts.length === 3) {
                        const d = new Date(parts[0], parts[1] - 1, parts[2]);
                        d.setHours(0, 0, 0, 0);
                        return d;
                    }
                    // Fallback
                    const d = new Date(dateStr);
                    d.setHours(0,0,0,0);
                    return d;
                };

                const endDate = parseLocal(endDateStr);
                const startDate = parseLocal(startDateStr);

                if (endDate) {
                    // --- NEW: CHECK FOR FUTURE START ---
                    if (startDate && startDate.getTime() > today.getTime()) {
                        // Calculate "Starts in X Days"
                        const startDiff = startDate.getTime() - today.getTime();
                        const daysToStart = Math.round(startDiff / (1000 * 3600 * 24));
                        
                        // Calculate "Runs for X Days"
                        const durationDiff = endDate.getTime() - startDate.getTime();
                        const durationDays = Math.round(durationDiff / (1000 * 3600 * 24));
                        
                        daysDisplay = `<div style="line-height:1.2;">
                            <span style="color:#0d6efd; font-weight:bold;">Starts in ${daysToStart} Day${daysToStart===1?'':'s'}</span><br>
                            <span style="color:#6c757d; font-size:0.85em;">Runs for ${durationDays} Day${durationDays===1?'':'s'}</span>
                        </div>`;
                    } 
                    // --- EXISTING LOGIC (Active or Ended) ---
                    else {
                        const diffTime = endDate.getTime() - today.getTime();
                        const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
                        
                        if (diffDays === 0) {
                            daysDisplay = '<span style="color:#d63384; font-weight:bold;">Ends Today!</span>';
                        } else if (diffDays > 0) {
                            daysDisplay = `Ends in ${diffDays} Day${diffDays === 1 ? '' : 's'}`;
                        } else {
                            const absDays = Math.abs(diffDays);
                            daysDisplay = `Ended ${absDays} Day${absDays === 1 ? '' : 's'} ago`;
                            isExpired = true;
                        }
                    }
                }
            } catch (e) {
                console.error(e);
                daysDisplay = 'Invalid Date';
            }
        }
        
        // --- ROW HIGHLIGHTING ---
        const isExpiredAlt = daysDisplay.includes('Ended') && daysDisplay.includes('ago');

        if (status === 'Active' && (isExpired || isExpiredAlt)) {
            tr.style.backgroundColor = '#dc3545'; // Bootstrap danger red
            tr.style.color = '#ffffff'; // White text
            tr.style.fontWeight = 'bold';
            tr.style.border = '3px solid #a02030';
        } else if (status === 'Inactive') {
            tr.style.backgroundColor = '#f4cccc'; // Light pink
        }

        if (isExpiredAlt && !isExpired && status === 'Active') {
            tr.style.color = '#dc3545'; 
            tr.style.fontWeight = 'bold';
        }
        
        // --- ID COLUMN ---
        const idButton = `
            <button onclick="navBlaze('promo', '${row.ID}'); return false;" 
                    class="btn btn-sm btn-primary" 
                    style="font-size: 0.75rem; padding: 2px 8px;"
                    title="ID: ${row.ID}">
                View Discount
            </button>
        `;
        
        // --- LOCATIONS SIMPLIFICATION ---
        let locationsRaw = row.Locations || '';
        let locationsDisplay = '';
        let applicableStores = [];

        if (locationsRaw === 'All Locations') {
            applicableStores = ALL_LOCATIONS_LIST;
            const tooltipHTML = ALL_LOCATIONS_LIST.join('<br>');
            locationsDisplay = `<span class="badge bg-info text-white" 
                                      style="cursor: help;" 
                                      data-bs-toggle="tooltip" 
                                      data-bs-html="true" 
                                      data-bs-placement="right"
                                      title="${tooltipHTML}">All Locations</span>`;
        } else {
            applicableStores = locationsRaw.split(',').map(l => l.trim()).filter(l => l);
            let displayText = locationsRaw;
            if (displayText.length > 50) {
                displayText = displayText.substring(0, 47) + '...';
            }
            const locationsList = locationsRaw.split(',').map(l => l.trim()).filter(l => l).sort();
            const tooltipHTML = locationsList.join('<br>');
            
            locationsDisplay = `<span style="cursor: help; text-decoration: underline dotted;" 
                                      data-bs-toggle="tooltip" 
                                      data-bs-html="true" 
                                      data-bs-placement="right"
                                      title="${tooltipHTML}">${displayText}</span>`;
        }
        
        // --- DETAIL COLUMN ---
        const detailCell = `<button 
            class="btn btn-sm btn-outline-secondary py-0 px-2"
            style="font-size: 0.75rem; font-weight: bold;" 
            onmouseenter="showDetailModal(blazeData.currentRows[${index}], false)"
            onmouseleave="hideDetailModal()"
            onclick="toggleDetailPin(blazeData.currentRows[${index}]); event.stopPropagation();">
            DETAIL
        </button>`;
        
        // --- AUTO/MANUAL COLUMN ---
        const autoManualText = row.auto_apply ? 'Automatic' : 'Manual';
        const autoManualColor = row.auto_apply ? '#0066ff' : '#ff8800';
        const autoManualCell = `<span style="color: ${autoManualColor}; font-weight: bold;">${autoManualText}</span>`;
        
        // --- GROUP LINKS ---
        const makeGroupLinks = (groups) => {
            if (!groups || groups.length === 0) return '-';
            const list = Array.isArray(groups) ? groups : []; 
            return list.map(g => {
                const displayName = g.name.length > 20 ? g.name.substring(0, 20) + '...' : g.name;
                const fullName = g.name; 
                return `<a href="#" onclick="navBlaze('coll', '${g.id}'); return false;" 
                   class="badge bg-light text-dark border" 
                   style="margin:1px; text-decoration:none; display:block; width:fit-content; margin-bottom:2px;"
                   title="${fullName}">
                   ${displayName}
                 </a>`;
            }).join(''); 
        };

// --- DISCOUNT VALUE (BUTTON & AUDIT LOGIC) ---
        let discountValueContent = row['Discount Value'];
        const discType = row['Discount Value Type'] || '';
        const isFinalPrice = discType.toLowerCase().includes('final');
        
        // IF FINAL PRICE: RENDER BUTTON WITH AUDIT
        if (isFinalPrice && discountValueContent && discountValueContent !== '-') {
            
            // --- AUDIT LOGIC START ---
            // Default Style: Blue Text, Blue Border, Tag Emoji
            let btnStyle = "color:#0d6efd; border:1px solid #0d6efd;"; 
            let btnEmoji = "";
            
            // 1. Check for bulk deal pattern in Name (e.g. "4 for $20")
            const bulkMatch = row.Name.match(/(\d+)\s+for\s+\$([0-9.]+)/i);
            const isBogo = /BOGO|B2G1/i.test(row.Name);
            
            if (!isBogo && bulkMatch && Object.keys(TAX_RATES).length > 0) {
                // FIX: Use total price directly from Regex Group 2
                const targetOtd = parseFloat(bulkMatch[2]);
                const discValue = parseFloat(String(discountValueContent).replace(/[^0-9.-]/g, ''));
                
                let maxDiff = 0;
                
                // Check applicable STRICT stores
                STRICT_OTD_STORES.forEach(strictStore => {
                    // Check if this strict store is in the applicable list for this row
                    const isApplicable = applicableStores.some(loc => 
                        loc.includes(strictStore) || strictStore.includes(loc)
                    );
                    
                    if (isApplicable && TAX_RATES[strictStore]) {
                        const rate = TAX_RATES[strictStore];
                        const calculatedOtd = discValue * rate;
                        // FIX: Round to 2 decimals before comparing
                        const calculatedRounded = parseFloat(calculatedOtd.toFixed(2));
                        const diff = Math.abs(calculatedRounded - targetOtd);
                        if (diff > maxDiff) maxDiff = diff;
                    }
                });
                
                // Determine Style based on worst variance found
                if (maxDiff >= 0.02) {
                    // Mismatch (> 2 cents): RED TEXT + CAUTION
                    btnStyle = "color:#dc3545; border:1px solid #dc3545;"; 
                    btnEmoji = "[!] ⚠️⚠️";
                } else if (maxDiff > 0.009) {
                    // Penny Variance: ORANGE TEXT + CAUTION
                    btnStyle = "color:#fd7e14; border:1px solid #fd7e14;"; 
                    btnEmoji = "[!] ⚠️⚠️";
                }
            }
            // --- AUDIT LOGIC END ---

            // RENDER BUTTON (Using inline styles to force color)
            discountValueContent = `
                <button class="btn btn-sm" 
                        style="font-weight:bold; padding:0px 6px; background:white; ${btnStyle}"
                        onclick="showOtdModal(${index})">
                    ${discountValueContent} ${btnEmoji}
                </button>`;
        }

        tr.innerHTML = `
            ${draftSelectionState.isActive ? `<td class="draft-checkbox-cell"><input type="checkbox" class="draft-checkbox" data-promo-id="${row.ID}" ${draftSelectionState.selectedDealIds.has(String(row.ID)) ? 'checked' : ''} onchange="toggleDraftSelection('${row.ID}', this.checked)"></td>` : ''}
            <td>${detailCell}</td>
            <td>${idButton}</td>
            <td>${row.Name}</td>
            <td>${statusBadge}</td>
            <td>${autoManualCell}</td>
            <td>${locationsDisplay}</td>
            <td>${makeGroupLinks(row.buy_groups)}</td>
            <td>${makeGroupLinks(row.get_groups)}</td>
            <td>${row['Discount Value Type']}</td>
            <td>${discountValueContent}</td>
            <td>${row['Start Date']}</td>
            <td>${row['End Date']}</td>
            <td><span style="font-size: 0.85rem; font-style: italic;">${daysDisplay}</span></td>
        `;
        tr.setAttribute('data-promo-id', row.ID);
        tbody.appendChild(tr);
        
        // Attach row data to detail cell span for event handlers
        const detailSpan = tr.querySelector('td:first-child span');
        if (detailSpan) {
            detailSpan.rowData = row;
        }
    });
}

// v12.25.6: Add checkbox header BEFORE DataTable init if draft mode is active
// This prevents "Incorrect column count" error
if (draftSelectionState.isActive) {
    const thead = document.querySelector('#promotionsTable thead tr');
    const existingCheckboxHeader = thead.querySelector('.draft-checkbox-header-cell');
    if (!existingCheckboxHeader) {
        const th = document.createElement('th');
        th.className = 'draft-checkbox-header-cell';
        th.style.cssText = 'width: 30px !important; text-align: center;';
        th.innerHTML = '<input type="checkbox" class="draft-checkbox-header" onclick="toggleSelectAllVisible(this)" title="Select all visible">';
        thead.insertBefore(th, thead.firstChild);
    }
} else {
    // Remove checkbox header if draft mode is OFF
    const thead = document.querySelector('#promotionsTable thead tr');
    const existingCheckboxHeader = thead.querySelector('.draft-checkbox-header-cell');
    if (existingCheckboxHeader) {
        existingCheckboxHeader.remove();
    }
}

// Initialize DataTable
const table = $('#promotionsTable').DataTable({ 
    paging: false, 
    scrollY: '60vh', 
    scrollCollapse: false,  // Don't collapse - maintain scroll area
    dom: 't',
    autoWidth: true,
    deferRender: true
});

// v12.25.6: Update count display if draft mode is active (moved from after init)
if (draftSelectionState.isActive) {
    updateDraftSelectedCount();
}

// Force redraw if container was hidden during initialization
const promoContent = document.getElementById('blaze-promo-content');
if (promoContent && promoContent.style.display !== 'none') {
    setTimeout(function() {
        table.columns.adjust().draw(false);
    }, 50);
}

// Initialize Bootstrap tooltips
setTimeout(function() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}, 300);

// 2. SETUP DYNAMIC FILTER COUNTER
table.on('draw', function () {
    const filteredData = table.rows({ search: 'applied' }).data();
    let filtActive = 0;
    let filtInactive = 0;
    let filtZombie = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // v12.25.5: Use dynamic column indices for filter counting
    const statusColIdx = getBlazeColumnIndex('status');
    const endColIdx = getBlazeColumnIndex('end');
    
    filteredData.each(function (value, index) {
        const statusHTML = String(value[statusColIdx] || '');
        const endDateHTML = String(value[endColIdx] || '');
        
        if (statusHTML.includes('Active')) {
            filtActive++;
            const dateMatch = endDateHTML.match(/\d{4}-\d{2}-\d{2}/);
            if (dateMatch) {
                try {
                    const endDate = new Date(dateMatch[0]);
                    endDate.setHours(0, 0, 0, 0);
                    // UPDATE: Strict inequality for Zombie count
                    if (endDate < today) {
                        filtZombie++;
                    }
                } catch (e) {}
            }
        } else if (statusHTML.includes('Inactive')) {
            filtInactive++;
        }
    });

    document.getElementById('filteredCount').innerText = filteredData.length + " Total";
    document.getElementById('filteredActive').innerText = filtActive + " Active";
    document.getElementById('filteredInactive').innerText = filtInactive + " Inactive";
    document.getElementById('filteredZombie').innerText = " " + filtZombie + " Zombie";
    
    // v12.25.3: Preserve checkbox states after filter/redraw
    if (draftSelectionState.isActive) {
        updateDraftCheckboxes();
    }

    const nameFilter = document.getElementById('blazeNameSearch').value;
    const subFilter = document.getElementById('blazeSubSearch').value;
    const filteredGroup = document.getElementById('filteredStatsGroup');
    const downloadFilteredBtn = document.getElementById('downloadFilteredBtn');
    
    // Check if any filter is active (including zombie filter)
    const hasActiveFilter = nameFilter.trim().length > 0 || subFilter.trim().length > 0 || $.fn.dataTable.ext.search.length > 0;
    
    if (hasActiveFilter) {
        filteredGroup.style.display = 'block';
        downloadFilteredBtn.style.display = 'block';
    } else {
        filteredGroup.style.display = 'none';
        downloadFilteredBtn.style.display = 'none';
    }
});

table.draw();

// PERSISTENCE
const primaryVal = document.getElementById('blazeNameSearch').value;
const subVal = document.getElementById('blazeSubSearch').value;
const subContainer = document.getElementById('subSearchContainer');

if (primaryVal.trim().length > 0) {
    subContainer.style.display = 'flex';
    // v12.25.5: Use dynamic column index
    const nameColIndex = getBlazeColumnIndex('name');
    table.column(nameColIndex).search(primaryVal);  
    table.search(subVal);                 
    table.draw();
} else if (subVal.trim().length > 0) {
    document.getElementById('blazeSubSearch').value = '';
    subContainer.style.display = 'none';
}
}

// 3. FULL REPORT EXPORT FUNCTION
async function exportData(mode) {
    if (mode === 'full') {
        window.location.href = '/api/blaze/export-csv';
    } else {
        console.log('Export mode not implemented:', mode);
    }
}

// ============================================
// DOWNLOAD FILTERED - Export visible rows only
// ============================================
async function exportFilteredData() {
if (!$.fn.DataTable.isDataTable('#promotionsTable')) {
alert('Table not initialized');
return;
}

const table = $('#promotionsTable').DataTable();
const filteredData = table.rows({ search: 'applied' }).data();

if (filteredData.length === 0) {
alert('No filtered data to export');
return;
}

// v12.25.4: Collect visible row IDs using data-promo-id attribute from DOM
// This is more reliable than parsing HTML from DataTable columns
const visibleIds = [];
const visibleRows = table.rows({ search: 'applied' }).nodes();

$(visibleRows).each(function() {
const promoId = $(this).attr('data-promo-id');
if (promoId) {
    visibleIds.push(promoId);
}
});

// Fallback: If data-promo-id not found, try extracting from column data
if (visibleIds.length === 0) {
// Determine which column has the ID based on draft mode
// Draft ON: col 0=checkbox, col 1=detail, col 2=ID
// Draft OFF: col 0=detail, col 1=ID
const idColIndex = draftSelectionState.isActive ? 2 : 1;

filteredData.each(function(rowData) {
    const idCell = rowData[idColIndex];
    // Extract numeric ID from HTML button or text
    const idMatch = String(idCell).match(/(\d+)/);
    if (idMatch) {
        visibleIds.push(idMatch[1]);
    }
});
}

if (visibleIds.length === 0) {
alert('Could not extract IDs from filtered data');
return;
}

console.log('[EXPORT] Exporting ' + visibleIds.length + ' rows with IDs:', visibleIds.slice(0, 5), '...');

// Send to backend for CSV generation
try {
const response = await api.blaze.exportFilteredCSV({ ids: visibleIds });

if (response.ok) {
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blaze_filtered_report_${new Date().toISOString().slice(0,19).replace(/[:-]/g, '')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
} else {
    const errorText = await response.text();
    alert('Export failed: ' + errorText);
}
} catch (e) {
alert('Export error: ' + e.message);
}
}

// ============================================
// ZOMBIE CLEANUP - State Management
// ============================================
let zombieCleanupState = {
isActive: false,
isManualMode: false,
zombieIds: [],
currentIndex: 0,
originalFilters: {
nameFilter: '',
subFilter: ''
}
};

function toggleZombieCleanupMode() {
const toggle = document.getElementById('zombieCleanupToggle');
const btn = document.getElementById('zombieCleanupBtn');

if (toggle.checked) {
btn.style.display = 'inline-block';
} else {
btn.style.display = 'none';
// If cleanup was active, reset everything
if (zombieCleanupState.isActive) {
    finishZombieCleanup();
}
}
}

function startZombieCleanup() {
// Save current filter state
zombieCleanupState.originalFilters.nameFilter = document.getElementById('blazeNameSearch').value;
zombieCleanupState.originalFilters.subFilter = document.getElementById('blazeSubSearch').value;

// Find all zombie IDs from the current data
const zombieIds = findZombieIds();

if (zombieIds.length === 0) {
alert('No zombie deals found! All active deals have valid end dates.');
return;
}

zombieCleanupState.zombieIds = zombieIds;
zombieCleanupState.currentIndex = 0;

// Update modal count
document.getElementById('zombieCountDisplay').textContent = zombieIds.length;

// Show modal
document.getElementById('zombieModalBackdrop').style.display = 'block';
document.getElementById('zombieModal').style.display = 'block';
document.getElementById('zombieActionButtons').style.display = 'flex';
document.getElementById('zombieProgressContainer').style.display = 'none';
}

function findZombieIds() {
    const zombieIds = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (blazeData.currentRows && Array.isArray(blazeData.currentRows)) {
        blazeData.currentRows.forEach(row => {
            const status = (row.Status || '').trim();
            const endDateStr = (row['End Date'] || '').trim();

            if (status === 'Active' && endDateStr) {
                try {
                    // FIX: Parse strictly as Local Time
                    const parts = endDateStr.split('-');
                    if (parts.length === 3) {
                        const endDate = new Date(parts[0], parts[1] - 1, parts[2]);
                        endDate.setHours(0, 0, 0, 0);
                        
                        // LOGIC: Only kill if End Date is BEFORE today (Yesterday or older)
                        if (endDate.getTime() < today.getTime()) {
                            zombieIds.push(row.ID);
                        }
                    }
                } catch (e) {
                    console.error("Date parse error", e);
                }
            }
        });
    }
    return zombieIds;
}

function applyZombieFilter() {
if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;

const table = $('#promotionsTable').DataTable();

// Clear existing filters - v12.25.5: Use dynamic column index
document.getElementById('blazeNameSearch').value = '';
document.getElementById('blazeSubSearch').value = '';
const nameColIndex = getBlazeColumnIndex('name');
table.column(nameColIndex).search('');
table.search('');

// Apply custom filter for zombies only
// v12.25.5: Use dynamic column indices in filter function
const statusColIndex = getBlazeColumnIndex('status');
const endColIndex = getBlazeColumnIndex('end');

$.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
if (settings.nTable.id !== 'promotionsTable') return true;

const statusHTML = data[statusColIndex] || '';
const endDateHTML = data[endColIndex] || '';

// Must be Active
if (!statusHTML.includes('Active')) return false;

// Must have end date in past
const dateMatch = endDateHTML.match(/\d{4}-\d{2}-\d{2}/);
if (!dateMatch) return false;

try {
    const endDate = new Date(dateMatch[0]);
    const today = new Date();
    endDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    return endDate < today;
} catch (e) {
    return false;
}
});

table.draw();
}

function clearZombieFilter() {
// Remove custom zombie filter
$.fn.dataTable.ext.search.pop();

if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;

const table = $('#promotionsTable').DataTable();
table.draw();
}

function runManualCleanup() {
zombieCleanupState.isActive = true;
zombieCleanupState.isManualMode = true;

// Hide modal
document.getElementById('zombieModalBackdrop').style.display = 'none';
document.getElementById('zombieModal').style.display = 'none';

// Apply zombie filter
applyZombieFilter();

// Change button to "Finish Cleanup"
const btn = document.getElementById('zombieCleanupBtn');
btn.innerHTML = '[OK]✅ Finish Cleanup';
btn.classList.add('cleanup-mode');
btn.onclick = finishZombieCleanup;
}

async function runAutoCleanup() {
zombieCleanupState.isActive = true;
zombieCleanupState.isManualMode = false;
zombieCleanupState.currentIndex = 0;

// Show progress, hide buttons
document.getElementById('zombieActionButtons').style.display = 'none';
document.getElementById('zombieProgressContainer').style.display = 'block';

// Apply zombie filter to table
applyZombieFilter();

// Change main button to show in-progress
const btn = document.getElementById('zombieCleanupBtn');
btn.innerHTML = '<span class="spin"></span> Processing...';
btn.disabled = true;

// Process each zombie
const total = zombieCleanupState.zombieIds.length;

for (let i = 0; i < total; i++) {
zombieCleanupState.currentIndex = i;
const promoId = zombieCleanupState.zombieIds[i];

// Update progress
const percent = Math.round(((i + 1) / total) * 100);
document.getElementById('zombieProgressFill').style.width = percent + '%';
document.getElementById('zombieProgressText').textContent = 
    `Processing ${i + 1} of ${total}: ID ${promoId}`;

try {
    const result = await api.blaze.zombieDisable({ promo_id: promoId });
    
    
    if (!result.success) {
        console.error(`Failed to disable ${promoId}: ${result.error}`);
        document.getElementById('zombieProgressText').textContent = 
            `[!] ⚠️❌ Error on ID ${promoId}: ${result.error}. Continuing...`;
        await new Promise(r => setTimeout(r, 2000));
    }
} catch (e) {
    console.error(`Error disabling ${promoId}:`, e);
    document.getElementById('zombieProgressText').textContent = 
        `[!] ⚠️⚠️ Network error on ID ${promoId}. Continuing...`;
    await new Promise(r => setTimeout(r, 2000));
}

// Small delay between operations
await new Promise(r => setTimeout(r, 500));
}

// Complete
document.getElementById('zombieProgressText').textContent = 
`[OK]✅ Completed! Disabled ${total} zombie deal(s).`;
document.getElementById('zombieProgressFill').style.width = '100%';
document.getElementById('zombieProgressFill').style.background = '#28a745';

// Wait 2 seconds then finish
await new Promise(r => setTimeout(r, 2000));
finishZombieCleanup();

// Refresh data
fetchBlazeData();
}

function cancelZombieCleanup() {
// Hide modal
document.getElementById('zombieModalBackdrop').style.display = 'none';
document.getElementById('zombieModal').style.display = 'none';

// Reset state
zombieCleanupState.isActive = false;
zombieCleanupState.zombieIds = [];
}

function finishZombieCleanup() {
// Clear zombie filter
clearZombieFilter();

// Hide modal if visible
document.getElementById('zombieModalBackdrop').style.display = 'none';
document.getElementById('zombieModal').style.display = 'none';

// Reset progress UI
document.getElementById('zombieActionButtons').style.display = 'flex';
document.getElementById('zombieProgressContainer').style.display = 'none';
document.getElementById('zombieProgressFill').style.width = '0%';
document.getElementById('zombieProgressFill').style.background = 'linear-gradient(90deg, #dc3545, #fd7e14)';

// Reset button
const btn = document.getElementById('zombieCleanupBtn');
btn.innerHTML = ' Zombie Cleanup';
btn.classList.remove('cleanup-mode');
btn.onclick = startZombieCleanup;
btn.disabled = false;

// Restore original filters
document.getElementById('blazeNameSearch').value = zombieCleanupState.originalFilters.nameFilter;
document.getElementById('blazeSubSearch').value = zombieCleanupState.originalFilters.subFilter;

// Re-apply original filters
applyBlazeFilters();

// Reset state
zombieCleanupState.isActive = false;
zombieCleanupState.isManualMode = false;
zombieCleanupState.zombieIds = [];
zombieCleanupState.currentIndex = 0;
}

// ============================================
// DRAFT SELECTED FEATURE - v12.25.3
// ============================================
let draftSelectionState = {
isActive: false,
selectedDealIds: new Set(),  // Persists across filters
isAutomating: false,
shouldStop: false,
currentIndex: 0,
draftedDeals: [],  // Results for review popup
totalToDraft: 0
};

function toggleDraftSelectionMode() {
const toggle = document.getElementById('draftSelectionToggle');
const btn = document.getElementById('draftSelectedBtn');

if (toggle.checked) {
draftSelectionState.isActive = true;
btn.style.display = 'inline-block';
// Re-render table to show checkboxes
rerenderBlazeTableWithCheckboxes();
updateDraftSelectedCount();
} else {
draftSelectionState.isActive = false;
btn.style.display = 'none';
// Clear selections
draftSelectionState.selectedDealIds.clear();
// Re-render table without checkboxes
rerenderBlazeTableWithCheckboxes();
}
}

function rerenderBlazeTableWithCheckboxes() {
// If DataTable exists, we need to update the header and refresh
if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;

const table = $('#promotionsTable').DataTable();
const isActive = draftSelectionState.isActive;

// Update header - add/remove checkbox column
const thead = document.querySelector('#promotionsTable thead tr');
const existingCheckboxHeader = thead.querySelector('.draft-checkbox-header-cell');

if (isActive && !existingCheckboxHeader) {
// Add checkbox header
const th = document.createElement('th');
th.className = 'draft-checkbox-header-cell';
th.style.cssText = 'width: 30px !important; text-align: center;';
th.innerHTML = '<input type="checkbox" class="draft-checkbox-header" onclick="toggleSelectAllVisible(this)" title="Select all visible">';
thead.insertBefore(th, thead.firstChild);
} else if (!isActive && existingCheckboxHeader) {
existingCheckboxHeader.remove();
}

// Update body rows
const tbody = document.querySelector('#promotionsTable tbody');
const rows = tbody.querySelectorAll('tr');

rows.forEach(row => {
const existingCheckboxCell = row.querySelector('.draft-checkbox-cell');
const rowId = row.getAttribute('data-promo-id');

if (isActive) {
    if (!existingCheckboxCell && rowId) {
        // Add checkbox cell
        const td = document.createElement('td');
        td.className = 'draft-checkbox-cell';
        const isChecked = draftSelectionState.selectedDealIds.has(rowId);
        td.innerHTML = `<input type="checkbox" class="draft-checkbox" data-promo-id="${rowId}" ${isChecked ? 'checked' : ''} onchange="toggleDraftSelection('${rowId}', this.checked)">`;
        row.insertBefore(td, row.firstChild);
    } else if (existingCheckboxCell && rowId) {
        // Update checkbox state
        const checkbox = existingCheckboxCell.querySelector('input');
        if (checkbox) {
            checkbox.checked = draftSelectionState.selectedDealIds.has(rowId);
        }
    }
} else if (existingCheckboxCell) {
    existingCheckboxCell.remove();
}
});

// Adjust columns
table.columns.adjust().draw(false);
}

function toggleDraftSelection(promoId, isChecked) {
if (isChecked) {
draftSelectionState.selectedDealIds.add(promoId);
} else {
draftSelectionState.selectedDealIds.delete(promoId);
}
updateDraftSelectedCount();
}

function toggleSelectAllVisible(headerCheckbox) {
const visibleCount = getVisibleDealIds().length;

if (headerCheckbox.checked) {
// Show confirmation
if (!confirm(`This will select ${visibleCount} currently visible deal(s). Continue?`)) {
    headerCheckbox.checked = false;
    return;
}
// Select all visible
const visibleIds = getVisibleDealIds();
visibleIds.forEach(id => draftSelectionState.selectedDealIds.add(id));
} else {
// Deselect all visible
const visibleIds = getVisibleDealIds();
visibleIds.forEach(id => draftSelectionState.selectedDealIds.delete(id));
}

// Update checkboxes
updateDraftCheckboxes();
updateDraftSelectedCount();
}

function getVisibleDealIds() {
const ids = [];
const tbody = document.querySelector('#promotionsTable tbody');
const rows = tbody.querySelectorAll('tr');

rows.forEach(row => {
// DataTables hides rows with display:none when filtered
if (row.style.display !== 'none') {
    const promoId = row.getAttribute('data-promo-id');
    if (promoId) {
        ids.push(promoId);
    }
}
});

return ids;
}

function updateDraftCheckboxes() {
const checkboxes = document.querySelectorAll('.draft-checkbox');
checkboxes.forEach(cb => {
const promoId = cb.getAttribute('data-promo-id');
cb.checked = draftSelectionState.selectedDealIds.has(promoId);
});
}

function updateDraftSelectedCount() {
const count = draftSelectionState.selectedDealIds.size;
document.getElementById('draftSelectedCount').textContent = count;

const btn = document.getElementById('draftSelectedBtn');
if (count > 0) {
btn.classList.add('has-selections');
btn.disabled = false;
} else {
btn.classList.remove('has-selections');
btn.disabled = true;
}
}

function startDraftSelected() {
const count = draftSelectionState.selectedDealIds.size;

if (count === 0) {
alert('No deals selected. Use the checkboxes to select deals first.');
return;
}

// Show confirmation modal
document.getElementById('draftCountDisplay').textContent = count;
document.getElementById('draftModalBackdrop').style.display = 'block';
document.getElementById('draftModal').style.display = 'block';
document.getElementById('draftActionButtons').style.display = 'flex';
document.getElementById('draftProgressContainer').style.display = 'none';
}

function cancelDraftModal() {
document.getElementById('draftModalBackdrop').style.display = 'none';
document.getElementById('draftModal').style.display = 'none';
}

async function runDraftAutomation() {
const selectedIds = Array.from(draftSelectionState.selectedDealIds);
const total = selectedIds.length;

draftSelectionState.isAutomating = true;
draftSelectionState.shouldStop = false;
draftSelectionState.currentIndex = 0;
draftSelectionState.draftedDeals = [];
draftSelectionState.totalToDraft = total;

// Show progress UI
document.getElementById('draftActionButtons').style.display = 'none';
document.getElementById('draftProgressContainer').style.display = 'block';
document.getElementById('draftStopBtn').style.display = 'block';

// Process each selected deal
for (let i = 0; i < total; i++) {
if (draftSelectionState.shouldStop) {
    document.getElementById('draftProgressText').textContent = 
        `Stopped at ${i} of ${total}. ${draftSelectionState.draftedDeals.length} drafted.`;
    break;
}

draftSelectionState.currentIndex = i;
const promoId = selectedIds[i];

// Get deal info for review
const dealInfo = blazeData.currentRows?.find(r => String(r.ID) === String(promoId));

// Update progress
const percent = Math.round(((i + 1) / total) * 100);
document.getElementById('draftProgressFill').style.width = percent + '%';
document.getElementById('draftProgressText').textContent = 
    `Drafting ${i + 1} of ${total}: ${dealInfo?.Name || 'ID ' + promoId}`;

try {
    const result = await api.blaze.zombieDisable({ promo_id: promoId });
    
    
    if (result.success) {
        // Add to drafted list
        draftSelectionState.draftedDeals.push({
            id: promoId,
            name: dealInfo?.Name || 'Unknown',
            status: 'Drafted',
            locations: dealInfo?.Locations || '-',
            startDate: dealInfo?.['Start Date'] || '-',
            endDate: dealInfo?.['End Date'] || '-'
        });
    } else {
        console.error(`Failed to draft ${promoId}: ${result.error}`);
        document.getElementById('draftProgressText').textContent = 
            `Error on ${dealInfo?.Name || promoId}: ${result.error}. Continuing...`;
        await new Promise(r => setTimeout(r, 2000));
    }
} catch (e) {
    console.error(`Error drafting ${promoId}:`, e);
    document.getElementById('draftProgressText').textContent = 
        `Network error on ${dealInfo?.Name || promoId}. Continuing...`;
    await new Promise(r => setTimeout(r, 2000));
}

// Delay between operations
await new Promise(r => setTimeout(r, 500));
}

// Complete
draftSelectionState.isAutomating = false;

if (!draftSelectionState.shouldStop) {
document.getElementById('draftProgressText').textContent = 
    `Complete! Drafted ${draftSelectionState.draftedDeals.length} deal(s).`;
document.getElementById('draftProgressFill').style.width = '100%';
document.getElementById('draftProgressFill').style.background = '#28a745';
}

document.getElementById('draftStopBtn').style.display = 'none';

// Wait then show review
await new Promise(r => setTimeout(r, 1500));

// Close progress modal
document.getElementById('draftModalBackdrop').style.display = 'none';
document.getElementById('draftModal').style.display = 'none';

// Reset progress UI
document.getElementById('draftActionButtons').style.display = 'flex';
document.getElementById('draftProgressContainer').style.display = 'none';
document.getElementById('draftProgressFill').style.width = '0%';
document.getElementById('draftProgressFill').style.background = 'linear-gradient(90deg, #fd7e14, #ffc107)';

// Clear selections
draftSelectionState.selectedDealIds.clear();
updateDraftSelectedCount();
updateDraftCheckboxes();

// Show review modal
showDraftReviewModal();

// Refresh Blaze data
fetchBlazeData();
}

function stopDraftAutomation() {
draftSelectionState.shouldStop = true;
document.getElementById('draftStopBtn').disabled = true;
document.getElementById('draftStopBtn').textContent = 'Stopping...';
}

function showDraftReviewModal() {
const drafted = draftSelectionState.draftedDeals;

if (drafted.length === 0) {
alert('No deals were drafted.');
return;
}

document.getElementById('draftReviewCount').textContent = drafted.length;

// Build review table
let tableHtml = `
<table class="table table-sm table-striped" style="font-size: 0.85em;">
    <thead style="background: #e9ecef;">
        <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Status</th>
            <th>Locations</th>
            <th>Start</th>
            <th>End</th>
        </tr>
    </thead>
    <tbody>
`;

drafted.forEach(deal => {
tableHtml += `
    <tr>
        <td>${deal.id}</td>
        <td>${deal.name}</td>
        <td><span class="badge bg-success">${deal.status}</span></td>
        <td title="${deal.locations}" style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${deal.locations}</td>
        <td>${deal.startDate}</td>
        <td>${deal.endDate}</td>
    </tr>
`;
});

tableHtml += '</tbody></table>';

document.getElementById('draftReviewTableContainer').innerHTML = tableHtml;
document.getElementById('draftReviewModalBackdrop').style.display = 'block';
document.getElementById('draftReviewModal').style.display = 'block';
}

function closeDraftReviewModal() {
document.getElementById('draftReviewModalBackdrop').style.display = 'none';
document.getElementById('draftReviewModal').style.display = 'none';
draftSelectionState.draftedDeals = [];
}

function filterToDraftedDeals() {
const draftedIds = draftSelectionState.draftedDeals.map(d => d.id);

if (draftedIds.length === 0) return;

// Close review modal
closeDraftReviewModal();

// Apply custom filter
if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;

const table = $('#promotionsTable').DataTable();

// Clear existing search - v12.25.5: Use dynamic column index
document.getElementById('blazeNameSearch').value = '';
document.getElementById('blazeSubSearch').value = '';
const nameColIndex = getBlazeColumnIndex('name');
table.column(nameColIndex).search('');
table.search('');

// Add custom filter for drafted IDs
// v12.25.5: Use dynamic column index for ID
const idColIndex = getBlazeColumnIndex('id');

$.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
if (settings.nTable.id !== 'promotionsTable') return true;

// Get the ID from dynamic column
const idCell = data[idColIndex] || '';
const idMatch = idCell.match(/\d+/);
if (!idMatch) return false;

return draftedIds.includes(idMatch[0]);
});

table.draw();

// Remove filter after 30 seconds or on next filter change
setTimeout(() => {
$.fn.dataTable.ext.search.pop();
table.draw();
}, 30000);
}

document.addEventListener('click', function(event) {
    const tooltip = document.getElementById('suggestion-tooltip');
    if (!event.target.closest('.suggestion-indicator') && !event.target.closest('.tooltip-container')) {
        tooltip.style.display = 'none';
    }
    
    const brandPopup = document.getElementById('brand-sticky-popup');
    if (!event.target.closest('.brand-multi') && !event.target.closest('.brand-popup')) {
        brandPopup.style.display = 'none';
    }
});

let hasAutoSynced = false; // Flag to prevent looping

async function checkBrowserStatus() {
    try {
        const data = await api.setup.browserStatus();
        
        const statusDiv = document.getElementById('browser-ready-status');
        const statusText = document.getElementById('browser-ready-text');
        
        if (data.ready) {
            statusDiv.className = 'alert alert-success';
            statusDiv.style.display = 'block';
            statusText.textContent = 'Ready!';
            
            // v10.7: REMOVED AUTO-SYNC - was causing browser crash by opening Blaze tabs
            // User should manually click "Initialize Browser" or "Refresh / Sync Data"
            // when they're ready to connect to Blaze
            console.log("[STARTUP] Browser Ready. Auto-sync disabled - use manual sync.");
        } else {
            statusDiv.className = 'alert alert-info';
            statusDiv.style.display = 'block';
            statusText.textContent = 'Initializing...';
            setTimeout(checkBrowserStatus, 1000);
        }
    } catch (error) {
        setTimeout(checkBrowserStatus, 2000);
    }
}

// --- BLAZE FILTER LOGIC ---
function handlePrimaryInput() {
    const primaryVal = document.getElementById('blazeNameSearch').value;
    const subContainer = document.getElementById('subSearchContainer');
    const subInput = document.getElementById('blazeSubSearch');

    if (primaryVal.trim().length > 0) {
        subContainer.style.display = 'flex';
    } else {
        subContainer.style.display = 'none';
        subInput.value = ''; 
    }
    applyBlazeFilters();
}

// v12.25.5: Helper to get correct column index based on draft mode
// When Draft mode is ON, checkbox column is added at index 0, shifting all others by 1
function getBlazeColumnIndex(columnName) {
const offset = draftSelectionState.isActive ? 1 : 0;
const baseIndices = {
'detail': 0,
'id': 1,
'name': 2,
'status': 3,
'autoManual': 4,
'locations': 5,
'buyGroups': 6,
'getGroups': 7,
'type': 8,
'value': 9,
'start': 10,
'end': 11,
'daysUntilEnd': 12
};
return (baseIndices[columnName] ?? 0) + offset;
}

// 2. Applies both filters to the DataTable
function applyBlazeFilters() {
    if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;
    
    const table = $('#promotionsTable').DataTable();
    const primaryVal = document.getElementById('blazeNameSearch').value;
    const subVal = document.getElementById('blazeSubSearch').value;
    
    // v12.25.5: Use dynamic column index for Name column
    const nameColIndex = getBlazeColumnIndex('name');
    table.column(nameColIndex).search(primaryVal);
    
    // Step 2: Apply Global "Sub" Search
    // This searches WITHIN the results remaining from Step 1
    table.search(subVal);
    
    // Step 3: Draw once to show the final result
    table.draw();
}


async function fetchBlazeData(isAuto = false) {
    const btn = document.querySelector("button[onclick='fetchBlazeData()']");
    const statusDiv = document.getElementById('blaze-sync-status');
    
    // UI Feedback
    if (btn) { 
        btn.disabled = true; 
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ' + (isAuto ? 'Auto-Syncing...' : 'Syncing...'); 
    }
    if (isAuto && statusDiv) {
        statusDiv.innerHTML = '<span class="text-muted">Checking Blaze Token...</span>';
    }
    
    try {
        const data = await api.blaze.refresh();
        if (!response.ok) throw new Error("Server Error");

        
        if (data.success) {
            renderBlazeTable(data.data);
            lastUpdateTS = Date.now() / 1000; 
            if (isAuto) {
                console.log("[AUTO] Sync successful.");
                if(statusDiv) statusDiv.innerHTML = '<span class="text-success fw-bold">[OK] Connected</span>';
            }
        } else {
            // ERROR HANDLING
            const errorMsg = data.message || "Unknown Error";
            
            if (isAuto) {
                console.log("[AUTO] Sync failed: " + errorMsg);
                // Notify user in the setup tab without popup
                if(statusDiv) {
                    statusDiv.innerHTML = `<span class="text-danger fw-bold">[!] 🚨🚨🚨🚨 ${errorMsg}</span>`;
                }
            } else {
                alert("Sync Failed: " + errorMsg);
            }
        }
    } catch (e) {
        if (!isAuto) alert('Sync Error: ' + e.message);
        if (isAuto && statusDiv) statusDiv.innerHTML = `<span class="text-danger">Error: ${e.message}</span>`;
    } finally {
        if (btn) { 
            btn.disabled = false; 
            btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh / Sync Data'; 
        }
    }
}

// --- BACKGROUND UPDATE (THE POLL) ---
async function loadTableFromCache() {
    try {
        const data = await api.blaze.getCache();
        if (!response.ok) return;

        if (data.success) {
            console.log("Background update applied.");
            renderBlazeTable(data.data);
            lastUpdateTS = data.ts; 
        }
    } catch (e) { console.log("Background load error:", e); }
}

// --- AUTO REFRESH POLLING ---
let lastUpdateTS = Date.now() / 1000;
setInterval(() => {
    // Only poll promotions if we're on Blaze tab AND not viewing Inventory
    // AND not running zombie cleanup automation
    const invContent = document.getElementById('blaze-inv-content');
    const isInventoryVisible = invContent && invContent.style.display !== 'none';
    const isZombieCleanupActive = zombieCleanupState && zombieCleanupState.isActive && !zombieCleanupState.isManualMode;
    
    if (currentMainTab === 'blaze' && !isInventoryVisible && !isZombieCleanupActive) {
        apiGet(`/api/blaze/poll-update?ts=${lastUpdateTS}`)
            .then(r => r.json())
            .then(data => {
                if (data.update) loadTableFromCache(); 
            })
            .catch(e => console.log("Poll error:", e));
    }
}, 2000);
// Initialize
window.addEventListener('load', function() {
    checkBrowserStatus();
    setupSearchEnhancements();
    autoLoadCredentials(); // Auto-fill credentials from config file
    autoAuthenticateGoogle(); // Auto-authenticate Google Sheets
    loadMisReportsFolderPath(); // v10.7: Show MIS reports folder path
    autoSyncBlazeData(); // v12.1: Auto-sync Company Promotions if token exists
});

// v12.1: Auto-sync Blaze data if token is available
async function autoSyncBlazeData() {
    console.log('[AUTO-SYNC] Checking for Blaze token...');
    try {
        // Wait a bit for page to fully load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if we have Blaze credentials/token by calling the refresh endpoint
        const data = await api.blaze.refresh();
        
        if (data.success) {
            console.log('[AUTO-SYNC] Blaze data synced successfully on startup');
            renderBlazeTable(data.data);
            
            // Update status in Setup tab
            const statusDiv = document.getElementById('blaze-sync-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="text-success fw-bold">[OK] Auto-synced on startup</span>';
            }
        } else {
            console.log('[AUTO-SYNC] Blaze sync skipped:', data.message || 'No token or error');
        }
    } catch (error) {
        console.log('[AUTO-SYNC] Blaze auto-sync not available:', error.message);
    }
}

// --- NEW FOCUS LOGIC ---
function toggleFocus(type) {
    const isEnabled = document.getElementById(`${type}-focus-enable`).checked;
    const controls = document.getElementById(`${type}-focus-controls`);
    const panel = document.getElementById(`${type}-focus-panel`);
    
    if (isEnabled) {
        controls.style.opacity = '1';
        controls.style.pointerEvents = 'auto';
        panel.classList.add('active');
    } else {
        controls.style.opacity = '0.5';
        controls.style.pointerEvents = 'none';
        panel.classList.remove('active');
    }
}



/* ==================================================================
   BLAZE DETAIL MODAL - Dual-State JavaScript (Hover + Pin)
   ================================================================== */
let detailModalState = {
isPinned: false,
currentPromoId: null,
hoverTimeout: null
};

function showDetailModal(row, isPinned = false) {
const modal = document.getElementById('detailModal');
const backdrop = document.getElementById('detailModalBackdrop');

if (!modal || !backdrop) {
console.error('[DETAIL] Modal elements not found');
return;
}

// Update modal content
document.getElementById('detailModalTitle').textContent = row.Name || 'N/A';
document.getElementById('detailModalId').textContent = `ID: ${row.ID || 'N/A'}`;
document.getElementById('detailModalType').textContent = `Type: ${row['Discount Value Type'] || 'N/A'}`;

// Build body content
let bodyHTML = '';

// SETUP SECTION
bodyHTML += '<div class="section-header" style="color: #0066cc;"> SETUP</div>';
bodyHTML += `<div class="data-row"><span class="data-label">Description:</span> ${row.description || 'None'}</div>`;

// Buy Requirements
if (row.buy_requirements && row.buy_requirements.length > 0) {
bodyHTML += '<div class="data-row"><span class="data-label">Buy Requirements:</span></div>';
row.buy_requirements.forEach(req => {
    bodyHTML += `<div class="data-row" style="padding-left: 30px;">&#x2022; Qty: ${req.quantity} | Items: ${req.items.join(', ')}</div>`;
});
} else {
bodyHTML += '<div class="data-row"><span class="data-label">Buy Requirements:</span> None</div>';
}

// v12.26.7: BOGO/Bundle quantities from discountRequirements
if (row.buy_qty || row.get_qty) {
const buyQ = row.buy_qty || 1;
const getQ = row.get_qty || 1;
bodyHTML += `<div class="data-row"><span class="data-label">Buy/Get Qty:</span> Buy ${buyQ} / Get ${getQ}</div>`;
}

bodyHTML += `<div class="data-row"><span class="data-label">Get/Target:</span> ${row.target_type || 'N/A'} - ${row.target_value || 'N/A'}</div>`;

// ADVANCED SECTION
bodyHTML += '<div class="section-header" style="color: #cc6600;">&#x2699;️ ADVANCED</div>';
bodyHTML += `<div class="data-row"><span class="data-label">Auto Apply:</span> ${row.auto_apply ? 'Yes' : 'No'}</div>`;
bodyHTML += `<div class="data-row"><span class="data-label">Stackable:</span> ${row.stackable ? 'Yes' : 'No'}</div>`;
bodyHTML += `<div class="data-row"><span class="data-label">Lowest Price First:</span> ${row.apply_lowest_price_first ? 'Yes' : 'No'}</div>`;
bodyHTML += `<div class="data-row"><span class="data-label">Priority:</span> ${row.priority || '5 - Lowest'}</div>`;

if (row.enable_promo_code) {
bodyHTML += `<div class="data-row"><span class="data-label">Promo Code:</span> ${row.promo_code || 'N/A'}</div>`;
}

bodyHTML += `<div class="data-row"><span class="data-label">Max Uses (Total):</span> ${row.max_uses || 'Unlimited'}</div>`;
bodyHTML += `<div class="data-row"><span class="data-label">Max Uses (Per Member):</span> ${row.max_uses_per_consumer || 'Unlimited'}</div>`;

// Restrictions
if (row.restrictions) {
const hasRestrictions = row.restrictions.member_groups.length > 0 || 
                      row.restrictions.consumer_types.length > 0 || 
                      row.restrictions.sales_channels.length > 0;
if (hasRestrictions) {
    bodyHTML += '<div class="data-row"><span class="data-label">Restrictions:</span></div>';
    if (row.restrictions.member_groups.length > 0) {
        bodyHTML += `<div class="data-row" style="padding-left: 30px;">&#x2022; Member Groups: ${row.restrictions.member_groups.join(', ')}</div>`;
    }
    if (row.restrictions.consumer_types.length > 0) {
        bodyHTML += `<div class="data-row" style="padding-left: 30px;">&#x2022; Consumer Types: ${row.restrictions.consumer_types.join(', ')}</div>`;
    }
    if (row.restrictions.sales_channels.length > 0) {
        bodyHTML += `<div class="data-row" style="padding-left: 30px;">&#x2022; Sales Channels: ${row.restrictions.sales_channels.join(', ')}</div>`;
    }
}
}

// SCHEDULE SECTION
bodyHTML += '<div class="section-header" style="color: #009933;"> SCHEDULE</div>';
bodyHTML += `<div class="data-row"><span class="data-label">Date Range:</span> ${row['Start Date']} to ${row['End Date']}</div>`;

if (row.time_constraint) {
if (row.time_constraint.days && row.time_constraint.days.length > 0) {
    bodyHTML += `<div class="data-row"><span class="data-label">Days:</span> ${row.time_constraint.days.join(', ')}</div>`;
}
if (row.time_constraint.start_time && row.time_constraint.end_time) {
    bodyHTML += `<div class="data-row"><span class="data-label">Time:</span> ${row.time_constraint.start_time} - ${row.time_constraint.end_time}</div>`;
}
}

document.getElementById('detailModalBody').innerHTML = bodyHTML;

// Update state
detailModalState.isPinned = isPinned;
detailModalState.currentPromoId = row.ID;

// Show modal
modal.style.display = 'block';
if (isPinned) {
backdrop.style.display = 'block';
}
}

function hideDetailModal() {
if (detailModalState.isPinned) {
return; // Don't hide if pinned
}

const modal = document.getElementById('detailModal');
const backdrop = document.getElementById('detailModalBackdrop');

if (modal) modal.style.display = 'none';
if (backdrop) backdrop.style.display = 'none';

detailModalState.currentPromoId = null;
}

function closeDetailModal() {
const modal = document.getElementById('detailModal');
const backdrop = document.getElementById('detailModalBackdrop');

if (modal) modal.style.display = 'none';
if (backdrop) backdrop.style.display = 'none';

detailModalState.isPinned = false;
detailModalState.currentPromoId = null;
}

function toggleDetailPin(row) {
if (detailModalState.isPinned && detailModalState.currentPromoId === row.ID) {
// Unpin and close
closeDetailModal();
} else {
// Pin or switch to new promo
if (detailModalState.currentPromoId && detailModalState.currentPromoId !== row.ID) {
    closeDetailModal(); // Close old one
}
showDetailModal(row, true); // Open and pin new one
}
}

// Setup backdrop click handler
document.addEventListener('DOMContentLoaded', function() {
const backdrop = document.getElementById('detailModalBackdrop');
if (backdrop) {
backdrop.addEventListener('click', function() {
    closeDetailModal();
});
}
});

// ── Script 2: Blaze Datatable filters, background poll, focus logic ───────────
// ============================================================================
// PROFILE MANAGEMENT FUNCTIONS
// ============================================================================

let currentProfileHandle = null;
let pendingProfileHandle = null;

// Load profiles on page load
document.addEventListener('DOMContentLoaded', function() {
loadProfiles();
});

async function loadProfiles() {
try {
    const data = await api.profiles.list();
    
    if (!data.success) {
        console.error('Failed to load profiles:', data.error);
        return;
    }
    
    const selector = document.getElementById('profile-selector');
    selector.innerHTML = '';
    
    if (data.profiles.length === 0) {
        // No profiles - show first run modal
        selector.innerHTML = '<option value="">No Profiles</option>';
        setTimeout(() => {
            const firstRunModal = new bootstrap.Modal(document.getElementById('firstRunModal'));
            firstRunModal.show();
        }, 500);
        return;
    }
    
    // Populate dropdown
    data.profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.handle;
        option.textContent = profile.handle;
        if (profile.is_active) {
            option.selected = true;
            currentProfileHandle = profile.handle;
        }
        if (!profile.has_credentials) {
            option.textContent += ' (!)';
            option.style.color = '#dc3545';
        }
        selector.appendChild(option);
    });
    
    // Update current profile display
    if (data.active_profile) {
        currentProfileHandle = data.active_profile;
    }
    
} catch (error) {
    console.error('Error loading profiles:', error);
}
}

function onProfileChange(newHandle) {
if (!newHandle || newHandle === currentProfileHandle) return;

// Show confirmation
if (!confirm(`Switch to profile "${newHandle}"?\n\nThis will require a restart.`)) {
    // Revert selection
    document.getElementById('profile-selector').value = currentProfileHandle;
    return;
}

switchProfile(newHandle);
}

async function switchProfile(handle) {
try {
    const data = await api.profiles.switch({ handle: handle });
    
    
    if (data.success) {
        // Show restart banner
        showRestartBanner(`Switched to "${handle}".`);
    } else {
        alert('Failed to switch profile: ' + data.error);
        document.getElementById('profile-selector').value = currentProfileHandle;
    }
} catch (error) {
    alert('Error switching profile: ' + error.message);
    document.getElementById('profile-selector').value = currentProfileHandle;
}
}

function showRestartBanner(message) {
const banner = document.getElementById('restart-banner');
const text = document.getElementById('restart-banner-text');
text.textContent = message + ' Restart required to apply changes.';
banner.style.display = 'block';
}

function hideRestartBanner() {
document.getElementById('restart-banner').style.display = 'none';
}

async function restartApplication() {
if (!confirm('Restart the application now?')) return;

try {
    document.getElementById('restart-banner').innerHTML = 
        '<strong><i class="bi bi-hourglass-split"></i> Restarting...</strong> Please wait...';
    
    await api.setup.restart();
    
    // The page will become unresponsive, show message
    setTimeout(() => {
        document.body.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: sans-serif;">
                <div style="font-size: 3em; margin-bottom: 20px;"><i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i></div>
                <h2>Application Restarting...</h2>
                <p>This page will automatically reload when ready.</p>
                <p style="color: #666;">If it doesn't reload, <a href="/" onclick="location.reload()">click here</a></p>
            </div>
            <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
        `;
        
        // Try to reload every 2 seconds
        const reloadInterval = setInterval(() => {
            api.setup.browserStatus()
                .then(r => r.json())
                .then(() => {
                    clearInterval(reloadInterval);
                    location.reload();
                })
                .catch(() => {});
        }, 2000);
    }, 500);
    
} catch (error) {
    console.log('Restart initiated');
}
}

// ============================================================================
// REGISTER PROFILE MODAL FUNCTIONS
// ============================================================================

function openRegisterModal() {
// Reset state
document.getElementById('new-profile-handle').value = '';
document.getElementById('handle-error').style.display = 'none';
document.getElementById('register-step1').style.display = 'block';
document.getElementById('register-step2').style.display = 'none';
document.getElementById('register-step3').style.display = 'none';
updateStepBadges(1);

const modal = new bootstrap.Modal(document.getElementById('registerProfileModal'));
modal.show();
}

function openRegisterFromFirstRun() {
// Close first run modal
const firstRunModal = bootstrap.Modal.getInstance(document.getElementById('firstRunModal'));
if (firstRunModal) firstRunModal.hide();

// Open register modal
setTimeout(() => openRegisterModal(), 300);
}

function updateStepBadges(currentStep) {
const badges = ['step1-badge', 'step2-badge', 'step3-badge'];
badges.forEach((id, idx) => {
    const badge = document.getElementById(id);
    if (idx + 1 < currentStep) {
        badge.className = 'badge bg-success rounded-pill px-3 py-2';
    } else if (idx + 1 === currentStep) {
        badge.className = 'badge bg-primary rounded-pill px-3 py-2';
    } else {
        badge.className = 'badge bg-secondary rounded-pill px-3 py-2';
    }
});
}

async function registerStep1Next() {
const handle = document.getElementById('new-profile-handle').value.trim().toLowerCase();
const errorDiv = document.getElementById('handle-error');

// Validate
if (!handle) {
    errorDiv.textContent = 'Please enter an email handle.';
    errorDiv.style.display = 'block';
    return;
}

if (!/^[a-z0-9._-]+$/.test(handle)) {
    errorDiv.textContent = 'Handle can only contain: letters, numbers, dots, underscores, hyphens';
    errorDiv.style.display = 'block';
    return;
}

errorDiv.style.display = 'none';
pendingProfileHandle = handle;

// Check if credentials exist
try {
    const data = await api.profiles.checkCreds(handle);
    
    if (data.exists) {
        // Credentials found - try to register
        await registerCompleteProfile(handle);
    } else {
        // Show step 2 - need credentials
        document.getElementById('expected-creds-path').textContent = data.expected_path;
        document.getElementById('register-step1').style.display = 'none';
        document.getElementById('register-step2').style.display = 'block';
        updateStepBadges(2);
    }
} catch (error) {
    errorDiv.textContent = 'Error checking credentials: ' + error.message;
    errorDiv.style.display = 'block';
}
}

function registerGoBack() {
document.getElementById('register-step1').style.display = 'block';
document.getElementById('register-step2').style.display = 'none';
updateStepBadges(1);
}

async function registerCheckCredentials() {
try {
    const data = await api.profiles.checkCreds(pendingProfileHandle);
    
    if (data.exists) {
        await registerCompleteProfile(pendingProfileHandle);
    } else {
        alert('Credentials file still not found.\n\nPlease place the file at:\n' + data.expected_path);
    }
} catch (error) {
    alert('Error: ' + error.message);
}
}

async function registerCompleteProfile(handle) {
try {
    const data = await api.profiles.register({ handle: handle });
    
    
    if (data.success) {
        // Show success step
        document.getElementById('register-step1').style.display = 'none';
        document.getElementById('register-step2').style.display = 'none';
        document.getElementById('register-step3').style.display = 'block';
        document.getElementById('register-success-msg').textContent = 
            `Profile "${handle}" has been created.`;
        updateStepBadges(3);
    } else if (data.error === 'credentials_not_found') {
        // Show step 2
        document.getElementById('expected-creds-path').textContent = data.expected_path;
        document.getElementById('register-step1').style.display = 'none';
        document.getElementById('register-step2').style.display = 'block';
        updateStepBadges(2);
    } else {
        alert('Error: ' + data.error);
    }
} catch (error) {
    alert('Error registering profile: ' + error.message);
}
}

function restartAfterRegister() {
// Close modal
const modal = bootstrap.Modal.getInstance(document.getElementById('registerProfileModal'));
if (modal) modal.hide();

// Restart
restartApplication();
}

// ============================================================================
// TAX RATES EDITING FUNCTIONS (Setup Tab)
async function loadTaxRatesForEdit() {
try {
    const data = await api.setup.getTaxRates();
    
    if (!data.success) {
        alert('Failed to load tax rates: ' + data.error);
        return;
    }
    
    const rates = data.rates;
    const container = document.getElementById('tax-rates-container');
    container.innerHTML = '';
    
    // Sort stores alphabetically
    const stores = Object.keys(rates).sort();
    
    stores.forEach(store => {
        const rate = rates[store];
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4';
        
        col.innerHTML = `
            <div class="input-group input-group-sm mb-2">
                <span class="input-group-text" style="width: 140px; font-size: 0.85em;">${store}</span>
                <input type="number" 
                       class="form-control tax-rate-input" 
                       data-store="${store}" 
                       value="${rate}" 
                       step="0.000001"
                       style="font-size: 0.85em;">
            </div>
        `;
        
        container.appendChild(col);
    });
    
    document.getElementById('tax-save-status').innerHTML = '';
    
} catch (err) {
    console.error('Error loading tax rates:', err);
    alert('Error loading tax rates: ' + err.message);
}
}

async function saveTaxRates() {
try {
    const inputs = document.querySelectorAll('.tax-rate-input');
    const rates = {};
    
    inputs.forEach(input => {
        const store = input.dataset.store;
        const value = parseFloat(input.value);
        
        if (isNaN(value)) {
            throw new Error(`Invalid rate for ${store}: ${input.value}`);
        }
        
        rates[store] = value;
    });
    
    const data = await api.setup.saveTaxRates({rates: rates});
    
    const statusDiv = document.getElementById('tax-save-status');
    
    if (data.success) {
        statusDiv.innerHTML = '<span class="text-success">[SUCCESS] ' + data.message + '</span>';
        // Reload calculator rates
        await loadTaxRates();
    } else {
        statusDiv.innerHTML = '<span class="text-danger">[X] ' + data.error + '</span>';
    }
    
} catch (err) {
    console.error('Error saving tax rates:', err);
    document.getElementById('tax-save-status').innerHTML = 
        '<span class="text-danger">[X] Error: ' + err.message + '</span>';
}
}

// Load tax rates on page load
document.addEventListener('DOMContentLoaded', function() {
loadTaxRatesForEdit();
});

// v63: Tax Calculator JavaScript
let TAX_RATES = {};
let currentStore = '';

// Load tax rates on page load
async function loadTaxRates() {
try {
    const data = await api.setup.getTaxRates();
    
    if (data.success) {
        TAX_RATES = data.rates;
        populateStoreDropdown();
    } else {
        console.error('Failed to load tax rates:', data.error);
        document.getElementById('calcStoreSelect').innerHTML = '<option value="">-- No tax rates found --</option>';
    }
} catch (err) {
    console.error('Error loading tax rates:', err);
    document.getElementById('calcStoreSelect').innerHTML = '<option value="">-- Error loading rates --</option>';
}
}

// Populate store dropdown (alphabetically)
function populateStoreDropdown() {
const select = document.getElementById('calcStoreSelect');
const stores = Object.keys(TAX_RATES).sort();

select.innerHTML = '<option value="">-- Select Store --</option>';
stores.forEach(store => {
    const option = document.createElement('option');
    option.value = store;
    option.textContent = store;
    select.appendChild(option);
});

// Set default to first store
if (stores.length > 0) {
    select.value = stores[0];
    currentStore = stores[0];
    updateTaxRateDisplay();
}
}

// Update tax rate display when store changes
function updateTaxRateDisplay() {
const select = document.getElementById('calcStoreSelect');
currentStore = select.value;
const display = document.getElementById('calcTaxDisplay');

if (currentStore && TAX_RATES[currentStore]) {
    const rate = TAX_RATES[currentStore];
    const percentage = ((rate - 1) * 100).toFixed(2);
    display.textContent = `Tax Rate: ${rate.toFixed(4)} (${percentage}% tax)`;
} else {
    display.textContent = 'Tax Rate: Not selected';
}
}

// Simple toggle function for calculator modal
function toggleCalcModal() {
const modal = document.getElementById('calcModal');
if (modal.classList.contains('show')) {
    modal.classList.remove('show');
} else {
    modal.classList.add('show');
}
}

// Close on backdrop click
document.getElementById('calcModal').addEventListener('click', function(e) {
if (e.target === this) {
    toggleCalcModal();
}
});

// Close with Escape key
document.addEventListener('keydown', function(e) {
if (e.key === 'Escape') {
    const modal = document.getElementById('calcModal');
    if (modal.classList.contains('show')) {
        toggleCalcModal();
    }
}
});

// Calculator Functions
// Helper to trigger all calcs if store changes
function runAllCalculations() {
calculatePostTax();
calculatePreTax();
calculatePercentage();
calculateVendorRebate();
calculateReprice();
}

// Toggle Visibility based on Dropdown
function switchCalculator() {
const selected = document.getElementById('calcTypeSelect').value;
const sections = ['calc-postTax', 'calc-preTax', 'calc-percent', 'calc-rebate', 'calc-reprice'];

sections.forEach(id => {
    const el = document.getElementById(id);
    if (id === 'calc-' + selected) {
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
});
}

// 1. Post-Tax
function calculatePostTax() {
if (!currentStore || !TAX_RATES[currentStore]) {
    document.getElementById('postTaxResult').textContent = '-- (Select Store)';
    return;
}
const inputVal = document.getElementById('postTaxInput').value;
if (inputVal === '') {
    document.getElementById('postTaxResult').textContent = '--';
    return;
}
const discountValue = parseFloat(inputVal);
const taxRate = TAX_RATES[currentStore];
const afterTax = discountValue * taxRate;
document.getElementById('postTaxResult').textContent = '$' + afterTax.toFixed(2);
}

// 2. Pre-Tax
function calculatePreTax() {
if (!currentStore || !TAX_RATES[currentStore]) {
    document.getElementById('preTaxResult').textContent = '-- (Select Store)';
    return;
}
const inputVal = document.getElementById('preTaxInput').value;
if (inputVal === '') {
    document.getElementById('preTaxResult').textContent = '--';
    return;
}
const afterTaxPrice = parseFloat(inputVal);
const taxRate = TAX_RATES[currentStore];
const discountValue = afterTaxPrice / taxRate;
document.getElementById('preTaxResult').textContent = '$' + discountValue.toFixed(2);
}

// 3. Percentage
function calculatePercentage() {
const baseVal = document.getElementById('percBaseInput').value;
const resVal = document.getElementById('percResultInput').value;

if (baseVal === '' || resVal === '') {
    document.getElementById('percResult').textContent = '--';
    return;
}
const base = parseFloat(baseVal);
const result = parseFloat(resVal);

if (base === 0) {
    document.getElementById('percResult').textContent = 'Error';
    return;
}
const percentage = ((base - result) / base) * 100;
document.getElementById('percResult').textContent = percentage.toFixed(2) + '%';
}

// 4. Vendor Rebate
function calculateVendorRebate() {
const discVal = document.getElementById('vendorDiscountInput').value;
const rebateVal = document.getElementById('vendorRebateInput').value;

if (discVal === '' || rebateVal === '') {
    document.getElementById('vendorResult').textContent = '--';
    return;
}
const discountValue = parseFloat(discVal);
const rebatePercentage = parseFloat(rebateVal);

const vendorContribution = (discountValue * rebatePercentage) / 100;
document.getElementById('vendorResult').textContent = '$' + vendorContribution.toFixed(2);
}

// 5. NEW: Reprice Calculator
function calculateReprice() {
const origVal = document.getElementById('repriceOriginal').value;
const currVal = document.getElementById('repriceCurrent').value;
const targetVal = document.getElementById('repriceTargetPerc').value;

if (origVal === '' || currVal === '' || targetVal === '') {
    document.getElementById('repriceResult').textContent = '--';
    return;
}

const originalPrice = parseFloat(origVal);
const currentPrice = parseFloat(currVal);
const targetPercent = parseFloat(targetVal);

if (originalPrice === 0) return;

// Step 1: Calculate what the price SHOULD be at the target %
// e.g. 95.51 * (1 - 0.50) = 47.755
const desiredFinalPrice = originalPrice * (1 - (targetPercent / 100));

// Step 2: Calculate the difference needed to reach that price from current
// e.g. 57.31 - 47.755 = 9.555
const differenceNeeded = currentPrice - desiredFinalPrice;

// Display with 3 decimal places as requested for precision
document.getElementById('repriceResult').textContent = '$' + differenceNeeded.toFixed(3);
}

async function runTierUpdate(btn) {
if (!confirm("[!] 🚨🚨🚨🚨 This will take control of the browser to update 'Bag Day' tags across all valid stores.\n\nEnsure you are not actively using the browser.\n\nProceed?")) return;

btn.disabled = true;
const originalHtml = btn.innerHTML;
btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Running...';

try {
    // Pass credentials just in case auto-login is needed
    const misUsername = document.getElementById('mis-username').value;
    const misPassword = document.getElementById('mis-password').value;

    const data = await api.blaze.updateTags({
            mis_username: misUsername,
            mis_password: misPassword
        });

    
    if (data.success) {
        alert("[SUCCESS] " + data.message + "\n\nWatch the terminal console for progress.");
    } else {
        alert("[X] Error: " + data.error);
    }
} catch (e) {
    alert("[X] Network Error: " + e.message);
} finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
}
}

// v12.24.1: Blaze Ecom Sync to Tymber (Mission Control API)
async function syncToTymber(btn) {
const storeSelect = document.getElementById('ecom-sync-store');
const statusDiv = document.getElementById('ecom-sync-status');
const selectedStore = storeSelect.value;

// Validate store selection
if (!selectedStore) {
    statusDiv.innerHTML = '<span style="color: #dc3545;">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Please select a store first</span>';
    return;
}

// Get Blaze credentials from UI
const blazeEmail = document.getElementById('blaze-email').value.trim();
const blazePassword = document.getElementById('blaze-password').value.trim();

if (!blazeEmail || !blazePassword) {
    statusDiv.innerHTML = '<span style="color: #dc3545;">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Enter Blaze email/password above first</span>';
    return;
}

// Confirm action
if (!confirm(`Sync inventory to Tymber for ${selectedStore}?\n\nThis will update the ecommerce menu with current inventory data.`)) {
    return;
}

// Update UI to syncing state
btn.disabled = true;
storeSelect.disabled = true;
const originalHtml = btn.innerHTML;
btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Syncing...';
statusDiv.innerHTML = '<span style="color: #0d6efd;">ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â³ Authenticating...</span>';

try {
    const response = await api.blaze.ecomSync({ 
            store: selectedStore,
            email: blazeEmail,
            password: blazePassword
        });
    
    const data = await response.json();
    
    if (data.success) {
        statusDiv.innerHTML = `<span style="color: #198754;">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ ${data.message || 'Sync Complete'}</span>`;
        console.log('[ECOM-SYNC] Success:', data);
    } else {
        // Differentiate error types for better UX
        let errorMsg = data.error || 'Unknown error';
        let errorColor = '#dc3545';
        
        if (errorMsg.includes('credentials') || errorMsg.includes('Authentication')) {
            errorMsg = 'ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“ ' + errorMsg;
        } else if (errorMsg.includes('UUID') || errorMsg.includes('not found')) {
            errorMsg = 'ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚Â ' + errorMsg;
        } else if (errorMsg.includes('permission')) {
            errorMsg = 'ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â« ' + errorMsg;
        }
        
        statusDiv.innerHTML = `<span style="color: ${errorColor};">ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ ${errorMsg}</span>`;
        console.error('[ECOM-SYNC] Error:', data.error);
    }
} catch (e) {
    statusDiv.innerHTML = `<span style="color: #dc3545;">ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Network Error: ${e.message}</span>`;
    console.error('[ECOM-SYNC] Network Error:', e);
} finally {
    btn.disabled = false;
    storeSelect.disabled = false;
    btn.innerHTML = originalHtml;
    
    // Reset status after 15 seconds
    setTimeout(() => {
        statusDiv.innerHTML = '<span style="color: #6c757d;">Ready</span>';
    }, 15000);
}
}

// Initialize tax rates on page load (Restored)
document.addEventListener('DOMContentLoaded', function() {
loadTaxRates();
});
// --- BLAZE TAB SWITCHING ---
function switchBlazeTab(mode) {
    const promoContent = document.getElementById('blaze-promo-content');
    const invContent = document.getElementById('blaze-inv-content');
    const promoBtn = document.getElementById('btn-blaze-promo');
    const invBtn = document.getElementById('btn-blaze-inv');

    if (mode === 'promo') {
        promoContent.style.display = 'block';
        invContent.style.display = 'none';
        promoBtn.classList.add('active');
        invBtn.classList.remove('active');
        // Recalculate DataTable after tab becomes visible
        setTimeout(function() {
            if ($.fn.DataTable.isDataTable('#promotionsTable')) {
                const table = $('#promotionsTable').DataTable();
                table.columns.adjust();
                table.draw(false);
                $(window).trigger('resize');
            }
        }, 100);
    } else {
        promoContent.style.display = 'none';
        invContent.style.display = 'block';
        promoBtn.classList.remove('active');
        invBtn.classList.add('active');
    }
}

// --- INVENTORY REPORTER LOGIC ---
// Simplified single-table storage
let currentInventoryData = [];  // Full unfiltered dataset
let currentStoreName = '';       // Current store name  
let currentDataSource = '';      // 'fresh' or 'file'
let currentDataTimestamp = '';   // When loaded
let searchDebounceTimer = null;  // For debouncing  // For debouncing search input

// Debug Log Variables
let debugTimer = null;
let debugStartTime = null;
let debugPollInterval = null;
let debugLogMessages = [];

// Debug Log Helper Functions
function showDebugLog() {
const panel = document.getElementById('debugLogPanel');
const messages = document.getElementById('debugMessages');
panel.style.display = 'block';
messages.innerHTML = '';
debugLogMessages = [];
debugStartTime = Date.now();
updateDebugTimer();
debugTimer = setInterval(updateDebugTimer, 1000);
}

function hideDebugLog() {
const panel = document.getElementById('debugLogPanel');
panel.style.display = 'none';
if (debugTimer) clearInterval(debugTimer);
if (debugPollInterval) clearInterval(debugPollInterval);
debugTimer = null;
debugPollInterval = null;
}

function addDebugLog(message, type = 'info') {
const messages = document.getElementById('debugMessages');
const entry = document.createElement('div');
entry.className = `log-entry ${type}`;
entry.textContent = `> ${message}`;
messages.appendChild(entry);
messages.scrollTop = messages.scrollHeight;
debugLogMessages.push({ message, type, time: Date.now() });
}

function updateDebugTimer() {
if (!debugStartTime) return;
const elapsed = Math.floor((Date.now() - debugStartTime) / 1000);
const minutes = Math.floor(elapsed / 60);
const seconds = elapsed % 60;
document.getElementById('debugTimer').textContent = 
`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateDebugProgress(current, total, currentAction = '') {
const percent = total > 0 ? Math.round((current / total) * 100) : 0;
const progressBar = document.getElementById('debugProgress');
progressBar.style.width = percent + '%';
progressBar.textContent = percent + '%';

// Calculate ETA
if (debugStartTime && current > 0) {
const elapsed = (Date.now() - debugStartTime) / 1000;
const avgTimePerItem = elapsed / current;
const remaining = (total - current) * avgTimePerItem;
const etaMinutes = Math.floor(remaining / 60);
const etaSeconds = Math.floor(remaining % 60);

if (etaMinutes > 0) {
    document.getElementById('debugETA').textContent = `${etaMinutes}m ${etaSeconds}s`;
} else {
    document.getElementById('debugETA').textContent = `${etaSeconds}s`;
}
}

if (currentAction) {
addDebugLog(currentAction);
}
}

// Poll status endpoint for real-time updates
function startDebugPolling() {
debugPollInterval = setInterval(async () => {
try {
    const data = await api.blaze.inventory.status();
    
    if (data.running) {
        // Parse logs for progress info
        const logs = data.logs || [];
        const lastLog = logs[logs.length - 1] || '';
        
        // Look for page info (e.g., "Fetching Page 3 (Items 2000-3000)...")
        const pageMatch = lastLog.match(/Page (\d+)/);
        if (pageMatch) {
            const currentPage = parseInt(pageMatch[1]);
            // Estimate total pages (we'll update this dynamically)
            const estimatedTotal = Math.max(currentPage + 2, 5); // Rough estimate
            updateDebugProgress(currentPage, estimatedTotal, lastLog);
        }
    } else {
        // Operation completed
        if (debugPollInterval) {
            clearInterval(debugPollInterval);
            debugPollInterval = null;
        }
    }
} catch (err) {
    console.error('Debug poll error:', err);
}
}, 1000); // Poll every second
}

// Initialize: Load available saved reports on page load
async function loadSavedReportsList() {
try {
const data = await api.blaze.inventory.listReports();

const dropdown = document.getElementById('savedReportsDropdown');
dropdown.innerHTML = '<option value="">-- Select Report --</option>';

if (data.success && data.reports.length > 0) {
    data.reports.forEach(filename => {
        dropdown.innerHTML += `<option value="${filename}">${filename}</option>`;
    });
}
} catch (err) {
console.error('Failed to load saved reports list:', err);
}
}

// Load saved report from file
async function loadSavedReport() {
const dropdown = document.getElementById('savedReportsDropdown');
const filename = dropdown.value;

if (!filename) {
alert('Please select a report file first.');
return;
}

// Extract store name from filename (e.g., "Koreatown_BLAZE_INVENTORY_2024_12_09.csv")
const storeName = filename.split('_BLAZE_INVENTORY_')[0].replace(/_/g, ' ');

try {
const data = await api.blaze.inventory.loadReport({ filename: filename });


if (data.success && data.data) {
    // Store data globally for single-table view
    currentInventoryData = data.data;
    currentStoreName = storeName;
    currentDataSource = 'file';
    currentDataTimestamp = filename;  // Use filename as timestamp for loaded files
    
    // Populate filters and render table
    populateFilters(currentInventoryData);
    clearInventoryFilters();  // Reset filters
    renderInventoryTable(currentInventoryData);
    
    // Show status bar
    showInventoryStatus();
} else {
    alert(`Failed to load report: ${data.error || 'Unknown error'}`);
}
} catch (err) {
alert(`Network error: ${err.message}`);
}
}

// Fetch fresh data from Blaze
async function fetchInventoryData() {
const storeSelect = document.getElementById('invStoreSelect');
const store = storeSelect.value;

const btn = document.getElementById('btnFetchFresh');
const originalText = btn ? btn.innerHTML : 'Fetch';

if (!store) {
alert('Please select a store first.');
return;
}

const storeName = storeSelect.options[storeSelect.selectedIndex].text;

// SHOW DEBUG LOG & START TIMER
showDebugLog();
addDebugLog(`Starting fetch for: ${storeName}`, 'info');
addDebugLog('Initializing connection to Blaze API...', 'info');

// LOCK UI
if (btn) {
btn.disabled = true;
btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Fetching...';
}

// START STATUS POLLING
startDebugPolling();

try {
addDebugLog('Sending fetch request...', 'info');

// STEP 1: Fetch and cache data
const fetchData = await api.blaze.inventory.fetch({ 
        store: store, 
        fresh: true,
        force_reset: true
    });

if (!fetchData.success) {
    addDebugLog(`[OK]✅❌ Error: ${fetchData.error || 'Unknown error'}`, 'error');
    alert(`Failed to fetch data: ${fetchData.error || 'Unknown error'}`);
    setTimeout(() => hideDebugLog(), 5000);
    return;
}

addDebugLog(`[OK] Data cached successfully (${fetchData.row_count} rows)`, 'success');
updateDebugProgress(100, 100, 'Loading data from cache...');

// STEP 2: Load data from cache
const loadData = await api.blaze.inventory.getTabData({ store: store });


if (loadData.success && loadData.data) {
    addDebugLog(`[OK] Loaded ${loadData.data.length} items from cache`, 'success');
    
    // Store data globally for single-table view
    currentInventoryData = loadData.data;
    currentStoreName = storeName;
    currentDataSource = 'fresh';
    currentDataTimestamp = new Date().toLocaleString();
    
    // Populate filters and render table
    populateFilters(currentInventoryData);
    clearInventoryFilters();  // Reset filters
    renderInventoryTable(currentInventoryData);
    
    // Show status bar
    showInventoryStatus();
    
    addDebugLog('[OK] All done!', 'success');
    setTimeout(() => hideDebugLog(), 3000);
} else {
    addDebugLog(`[OK]✅❌ Error loading from cache: ${loadData.error}`, 'error');
    alert(`Failed to load data: ${loadData.error || 'Unknown error'}`);
    setTimeout(() => hideDebugLog(), 5000);
}
} catch (err) {
addDebugLog(`[OK]⚠️ Network error: ${err.message}`, 'error');
alert(`Network error: ${err.message}`);
setTimeout(() => hideDebugLog(), 5000);
} finally {
if (btn) {
    btn.disabled = false;
    btn.innerHTML = originalText;
}
}
}

// Show inventory status bar with current data info
function showInventoryStatus() {
const statusCard = document.getElementById('inventoryStatusCard');
const statusText = document.getElementById('inventoryStatusText');

if (statusCard && statusText) {
let statusMsg = `<strong>${currentStoreName}</strong> - `;
if (currentDataSource === 'fresh') {
    statusMsg += `Fresh Fetch - ${currentDataTimestamp}`;
} else {
    statusMsg += `Loaded File: ${currentDataTimestamp}`;
}
statusMsg += ` (${currentInventoryData.length} items)`;

statusText.innerHTML = statusMsg;
statusCard.style.display = 'block';
}
}

// Render tab navigation (DEPRECATED - tabs removed for performance)
function renderInventoryTabs() {
// No-op: tabs removed in v7.6 for performance
}

// Switch to inventory tab (DEPRECATED - tabs removed for performance)
async function switchInventoryTab(tabId) {
// No-op: tabs removed in v7.6 for performance
}


// Save current UI filter state to active tab
function saveCurrentFilters() {
// No-op: filter persistence removed with tabs in v7.6
}


// Restore tab's saved filters to UI
function restoreTabFilters(tabId) {
// No-op: filter persistence removed with tabs in v7.6
}


// Debounced search (300ms delay)
function debouncedInventorySearch() {
if (searchDebounceTimer) {
clearTimeout(searchDebounceTimer);
}
searchDebounceTimer = setTimeout(() => {
applyInventoryFilters();
}, 300);
}

// Clear individual search field
function clearSearchField(fieldId) {
document.getElementById(fieldId).value = '';
applyInventoryFilters();
}

// Show status bar with tab info (DEPRECATED - replaced by showInventoryStatus)
function showInventoryStatusBar(tabId) {
// No-op: replaced by showInventoryStatus() in v7.6
}

// Close current tab
function closeCurrentInventoryTab() {
// No-op: tabs removed in v7.6 for performance
}


// Populate brand and category filters
function populateFilters(data) {
const brands = [...new Set(data.map(row => row.Brand))].filter(Boolean).sort();
const categories = [...new Set(data.map(row => row.Category))].filter(Boolean).sort();

const brandSelect = document.getElementById('invFilterBrand');
const catSelect = document.getElementById('invFilterCategory');

brandSelect.innerHTML = '<option value="">All Brands</option>' + 
brands.map(b => `<option value="${b}">${b}</option>`).join('');

catSelect.innerHTML = '<option value="">All Categories</option>' + 
categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

// Apply filters with waterfall logic
function applyInventoryFilters() {
if (!currentInventoryData || currentInventoryData.length === 0) return;

// Get filter values
const search1 = document.getElementById('invSearchName').value.toLowerCase();
const search2 = document.getElementById('invSearchName2').value.toLowerCase();
const selectedBrand = document.getElementById('invFilterBrand').value;
const selectedCategory = document.getElementById('invFilterCategory').value;
const hideZeroQty = document.getElementById('invHideZeroQty').checked;

// Start with full data
let filtered = [...currentInventoryData];

// STEP 1: Apply Primary Search (Product Name only)
if (search1) {
filtered = filtered.filter(row => 
    (row['Product Name'] || '').toLowerCase().includes(search1)
);
}

// STEP 2: Apply Secondary Search (filters results of Step 1 - Product Name only)
if (search2) {
filtered = filtered.filter(row =>
    (row['Product Name'] || '').toLowerCase().includes(search2)
);
}

// STEP 3: Apply Brand filter
if (selectedBrand) {
filtered = filtered.filter(row => row.Brand === selectedBrand);
}

// STEP 4: Apply Category filter
if (selectedCategory) {
filtered = filtered.filter(row => row.Category === selectedCategory);
}

// STEP 5: Apply Hide Zero Quantity filter
if (hideZeroQty) {
filtered = filtered.filter(row => {
    const qty = row['Total Quantity'];
    // Keep rows with null/undefined, only hide rows that are exactly 0
    return qty !== 0;
});
}

// Re-render table with filtered data
renderInventoryTable(filtered);

// Save current filters to tab
saveCurrentFilters();
}

// Clear all filters
function clearInventoryFilters() {
// Clear UI fields
document.getElementById('invSearchName').value = '';
document.getElementById('invSearchName2').value = '';
document.getElementById('invFilterBrand').value = '';
document.getElementById('invFilterCategory').value = '';
document.getElementById('invHideZeroQty').checked = false;

// Reapply filters (will show all data)
applyInventoryFilters();
}

// Render table with data
function renderInventoryTable(data) {
const rowCount = document.getElementById('invRowCount');
rowCount.textContent = `${data.length} Items`;

// Check if DataTable already exists
if ($.fn.DataTable.isDataTable('#inventoryTable')) {
// Destroy existing DataTable
$('#inventoryTable').DataTable().destroy();
}

// Clear table body
const tbody = document.getElementById('inventoryTableBody');

if (!data || data.length === 0) {
tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No data available</td></tr>';
return;
}

// Build rows
tbody.innerHTML = data.map((row, index) => {
const blazeId = row['BLAZE ID'] || '';
const sku = row.SKU || 'N/A';
const name = row['Product Name'] || '';
const brand = row.Brand || 'N/A';
const category = row.Category || 'N/A';
const price = parseFloat(row['Unit Price ($)'] || 0).toFixed(2);
const qty = parseFloat(row['Total Quantity'] || 0).toFixed(2);
const weight = row['Weight / Unit'] || 'N/A';

return `
    <tr>
        <td>
            <button class="btn btn-sm btn-outline-primary sku-button" 
                    onclick="handleSkuClick('${sku}', '${blazeId}')">
                ${sku}
            </button>
        </td>
        <td>
            <div class="name-cell-wrapper">
                <span class="product-name clickable-name" 
                      id="product-name-${index}"
                      data-blaze-id="${blazeId}"
                      data-sku="${sku}"
                      onclick="handleProductNameClick(this, '${blazeId}', '${sku}')">
                    ${name}
                </span>
            </div>
        </td>
        <td>${brand}</td>
        <td>${category}</td>
        <td class="text-end">$${price}</td>
        <td class="text-end">${qty}</td>
        <td class="text-end">${weight}</td>
    </tr>
`;
}).join('');

// Initialize DataTable with no pagination (scrolling list)
$('#inventoryTable').DataTable({
paging: false,           // Disable pagination
searching: false,        // We handle search manually
info: false,             // Hide "Showing X of Y entries"
ordering: true,          // Allow column sorting
scrollY: '60vh',         // Enable vertical scrolling
scrollCollapse: true,    // Allow table to be smaller than scrollY
order: [[1, 'asc']]      // Default sort by Product Name
});

// Setup persistent tooltips for product names (will be triggered by click)
setupPersistentTooltips();
}

// ============================================================================
// PERSISTENT TOOLTIP SYSTEM FOR PRODUCT NAMES
// ============================================================================
let activeTooltip = null;  // Track currently visible tooltip
let activeTooltipElement = null;  // Track element with active tooltip

function setupPersistentTooltips() {
// Initialize tooltips for all product names (but don't trigger them yet)
const productNames = document.querySelectorAll('.product-name');

productNames.forEach(element => {
const blazeId = element.getAttribute('data-blaze-id');
const sku = element.getAttribute('data-sku');

// Create tooltip content
const tooltipContent = `
    <div class='text-start'>
        <strong>BLAZE ID:</strong> ${blazeId} 
        <i class='bi bi-paperclip' style='cursor:pointer' onclick='copyToClipboard("${blazeId}")'></i>
        <br>
        <strong>SKU:</strong> ${sku} 
        <i class='bi bi-paperclip' style='cursor:pointer' onclick='copyToClipboard("${sku}")'></i>
    </div>
`;

// Initialize Bootstrap tooltip (manual trigger)
const tooltip = new bootstrap.Tooltip(element, {
    html: true,
    title: tooltipContent,
    trigger: 'manual',  // We'll control show/hide manually
    placement: 'right'
});

// Store tooltip instance on element
element._tooltipInstance = tooltip;
});

// Add click-outside listener to dismiss active tooltip
document.addEventListener('click', function(e) {
// If clicking outside any product name and outside tooltip
if (!e.target.closest('.product-name') && !e.target.closest('.tooltip')) {
    dismissActiveTooltip();
}
});
}

function handleProductNameClick(element, blazeId, sku) {
// If clicking the same element that already has tooltip open, do nothing
if (activeTooltipElement === element) {
return;
}

// Dismiss any currently active tooltip
dismissActiveTooltip();

// Show tooltip for clicked element
if (element._tooltipInstance) {
element._tooltipInstance.show();
activeTooltip = element._tooltipInstance;
activeTooltipElement = element;
}
}

function dismissActiveTooltip() {
if (activeTooltip) {
activeTooltip.hide();
activeTooltip = null;
activeTooltipElement = null;
}
}

// ============================================================================
// SKU BUTTON CLICK HANDLER (PLACEHOLDER FOR FUTURE FUNCTIONALITY)
// ============================================================================
async function handleSkuClick(sku, blazeId) {
// Get current store name from global state
if (!currentStoreName) {
alert('Error: No inventory data loaded');
return;
}

console.log(`[SKU CLICK] Navigating to product ${blazeId} in store ${currentStoreName}`);

// Show status message
const statusText = document.getElementById('inventoryStatusText');
const originalStatus = statusText.innerHTML;
statusText.innerHTML = '<span class="text-primary"><i class="bi bi-arrow-repeat spin"></i> Navigating to product page...</span>';

try {
const result = await api.blaze.inventory.navigateToProduct({
        store_name: currentStoreName,
        blaze_id: blazeId
    });



if (result.success) {
    // Success message
    statusText.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> [OK] Navigated to product page!</span>';
    console.log(`[SKU CLICK] Success: ${result.message}`);
    
    // Restore original status after 3 seconds
    setTimeout(() => {
        statusText.innerHTML = originalStatus;
    }, 3000);
} else {
    // Error message
    statusText.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle"></i> Error: ${result.error}</span>`;
    console.error(`[SKU CLICK] Error: ${result.error}`);
    
    // Restore after 5 seconds
    setTimeout(() => {
        statusText.innerHTML = originalStatus;
    }, 5000);
}
} catch (err) {
statusText.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle"></i> Network error: ${err.message}</span>`;
console.error(`[SKU CLICK] Network error: ${err}`);

// Restore after 5 seconds
setTimeout(() => {
    statusText.innerHTML = originalStatus;
}, 5000);
}
}

// Copy to clipboard utility
function copyToClipboard(text) {
navigator.clipboard.writeText(text).then(() => {
const statusText = document.getElementById('inventoryStatusText');
const original = statusText.innerHTML;
statusText.innerHTML = '<span class="text-success">[OK] Copied to clipboard</span>';
setTimeout(() => {
    statusText.innerHTML = original;
}, 1500);
});
}

// Open export modal
function openInventoryExportModal() {
// Check if data is loaded
if (!currentInventoryData || currentInventoryData.length === 0) {
alert('No data loaded. Please fetch or load data first.');
return;
}

const exportTabsList = document.getElementById('exportTabsList');
const exportNoTabs = document.getElementById('exportNoTabs');
const exportTabsSection = document.getElementById('exportTabsSection');
const exportDownloadBtn = document.getElementById('exportDownloadBtn');

exportNoTabs.style.display = 'none';
exportTabsSection.style.display = 'block';
exportDownloadBtn.disabled = false;

// Show current data info
exportTabsList.innerHTML = `
<div class="alert alert-info">
    <strong>Current Data:</strong> ${currentStoreName}<br>
    <strong>Items:</strong> ${currentInventoryData.length}<br>
    <strong>Source:</strong> ${currentDataSource === 'fresh' ? 'Fresh Fetch' : 'Loaded File'}
</div>
`;

const modal = new bootstrap.Modal(document.getElementById('inventoryExportModal'));
modal.show();
}

// Toggle all tabs selection (deprecated)
function toggleAllTabsExport(checkbox) {
// No-op: tabs removed in v7.6
}

// Update export button state (deprecated)
function updateExportButton() {
// No-op: tabs removed in v7.6
}

// Generate inventory report
async function generateInventoryReport() {
if (!currentInventoryData || currentInventoryData.length === 0) {
alert('No data to export.');
return;
}

// Prepare single-store export data
const exportData = {};
exportData[currentStoreName] = currentInventoryData;

try {
const response = await api.blaze.inventory.exportTabs({ tabs: exportData });

if (response.ok) {
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Single store always exports as CSV
    const timestamp = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const safeName = currentStoreName.replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `${safeName}_Inventory_${timestamp}.csv`;
    
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    // Close modal
    bootstrap.Modal.getInstance(document.getElementById('inventoryExportModal')).hide();
} else {
    const error = await response.json();
    alert(`Export failed: ${error.error || 'Unknown error'}`);
}
} catch (err) {
alert(`Network error: ${err.message}`);
}
}

// Auto-load saved reports list on page load
document.addEventListener('DOMContentLoaded', () => {
loadSavedReportsList();
});