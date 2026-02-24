// static/js/tabs/mis-updown.js
// Up-Down Planning (Split Audit) tab: Phase 1 planning, Phase 2 final verification
// Extracted from monolith v12.27 by Step 7

function switchSplitPhase(phaseName, btnElement) {
    document.querySelectorAll('.split-phase-content').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    document.querySelectorAll('.split-phase-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const target = document.getElementById('split-phase-' + phaseName);
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
    }
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    // Update Phase 2 CSV status when switching to that tab
    if (phaseName === 'final-check') {
        updatePhase2CsvStatus();
    }
    
    console.log('[SPLIT AUDIT] Switched to phase:', phaseName);
}

async function runSplitPlanningAudit() {
    const resultsDiv = document.getElementById('split-planning-results');
    const statsEl = document.getElementById('split-audit-stats');
    const tabName = document.getElementById('mis-tab').value;
    
    if (!tabName) {
        alert('Please select a Google Sheet tab in Setup first.');
        return;
    }
    
    resultsDiv.innerHTML = '<div class="text-center"><div class="spinner-border text-primary"></div><p>Analyzing sheet for split requirements...</p></div>';
    statsEl.textContent = 'Analyzing...';
    statsEl.className = 'badge bg-warning fs-6';
    
    try {
        const data = await api.updown.planning({ tab: tabName });
        
        if (!data.success) {
            resultsDiv.innerHTML = '<div class="alert alert-danger">' + data.error + '</div>';
            statsEl.textContent = 'Error';
            statsEl.className = 'badge bg-danger fs-6';
            return;
        }
        
        renderSplitPlanningResults(data, resultsDiv);
        const splitCount = data.splits_required ? data.splits_required.length : 0;
        const noConflictCount = data.no_conflict ? data.no_conflict.length : 0;
        statsEl.textContent = splitCount + ' Splits | ' + noConflictCount + ' Clean';
        statsEl.className = splitCount > 0 ? 'badge bg-warning fs-6' : 'badge bg-success fs-6';
    } catch (err) {
        resultsDiv.innerHTML = '<div class="alert alert-danger">Error: ' + err.message + '</div>';
        statsEl.textContent = 'Error';
        statsEl.className = 'badge bg-danger fs-6';
    }
}

// v88: Store split planning data for apply functionality
var splitPlanningData = {};
var approvedSplitIds = {};

function renderSplitPlanningResults(data, container) {
    // Store data for later use
    splitPlanningData = data;
    approvedSplitIds = {};
    
    var html = '<div class="alert alert-info mb-3"><strong>Analysis Complete:</strong> ' + (data.date_context || 'Unknown Month') +
        '<br>Weekly Deals: ' + (data.summary?.weekly_count || 0) + ' | Tier 1 Deals: ' + ((data.summary?.monthly_count || 0) + (data.summary?.sale_count || 0)) + '</div>';
    
    if (data.splits_required && data.splits_required.length > 0) {
        html += '<h5 class="text-danger mb-3"><i class="bi bi-exclamation-triangle"></i> Splits Required (' + data.splits_required.length + ')</h5>';
        data.splits_required.forEach(function(split, idx) {
            var conflictType = split.conflict_type || 'FULL';
            var badgeClass = conflictType === 'LOCATION_PARTIAL' ? 'bg-info' : 'bg-danger';
            
            // v88: Enhanced header with Row button
            html += '<div class="card mb-3 border-danger">';
            html += '<div class="card-header bg-danger text-white d-flex justify-content-between align-items-center">';
            html += '<span>';
            if (split.google_row) {
                html += '<button class="btn btn-sm btn-light me-2" onclick="openSheetRow(' + split.google_row + ')">Row ' + split.google_row + '</button>';
            }
            html += '<strong>' + split.brand + '</strong> - Weekly (' + split.weekday + ')';
            html += '</span>';
            html += '<span class="badge ' + badgeClass + '">' + (conflictType === 'LOCATION_PARTIAL' ? 'Location-Partial' : 'Full Conflict') + '</span>';
            html += '</div>';
            
            html += '<div class="card-body">';
            
            // v93: Stacked comparison tables with horizontal headers
            
            // TABLE 1: Weekly Deal
            html += '<h6 class="text-primary mb-2"> Weekly Deal</h6>';
            html += '<div class="table-responsive mb-3">';
            html += '<table class="table table-sm table-bordered" style="font-size:0.85em; table-layout:fixed; width:100%;">';
            html += '<thead class="table-light"><tr>';
            html += '<th style="width:80px;">Row</th><th style="width:120px;">Brand</th><th style="width:100px;">Weekday</th><th style="width:100px;">Discount</th><th style="width:90px;">Vendor %</th>';
            html += '<th style="width:140px;">Locations</th><th style="width:120px;">Deal Info</th><th style="width:120px;">Categories</th><th style="width:120px;">Notes</th><th style="width:110px;">MIS ID</th>';
            html += '</tr></thead>';
            html += '<tbody><tr>';
            
            // Row button
            html += '<td>';
            if (split.google_row) {
                html += '<button class="btn btn-sm btn-outline-primary" onclick="openSheetRow(' + split.google_row + ')">Row ' + split.google_row + '</button>';
            } else {
                html += '-';
            }
            html += '</td>';
            
            // Brand
            html += '<td><strong>' + (split.brand || '-') + '</strong></td>';
            
            // Weekday
            html += '<td>' + (split.weekday || '-') + '</td>';
            
            // Discount
            html += '<td>' + (split.discount || '-') + '</td>';
            
            // Vendor %
            html += '<td>' + (split.vendor_contrib || '-') + '</td>';
            
            // Locations
            html += '<td title="' + (split.locations || '') + '">' + truncateText(split.locations || '-', 25) + '</td>';
            
            // Deal Info
            html += '<td title="' + (split.deal_info || '') + '">' + truncateText(split.deal_info || '-', 25) + '</td>';
            
            // Categories
            html += '<td title="' + (split.categories || '') + '">' + truncateText(split.categories || '-', 20) + '</td>';
            
            // Notes
            html += '<td title="' + (split.special_notes || '') + '">' + truncateText(split.special_notes || '-', 20) + '</td>';
            
            // MIS ID
            html += '<td>';
            if (split.original_mis_id) {
                html += renderClickableMisId(split.original_mis_id, split);
            } else {
                html += '<span style="color:#999; font-style:italic;">No ID</span>';
            }
            html += '</td>';
            
            html += '</tr></tbody></table>';
            html += '</div>';
            
            // TABLE 2: Conflict Deal (Interrupting)
            html += '<h6 class="text-danger mb-2">[!]⚠️ Conflict Deal (' + split.interrupting_deal_type + ')</h6>';
            html += '<div class="table-responsive mb-3">';
            html += '<table class="table table-sm table-bordered" style="font-size:0.85em; table-layout:fixed; width:100%;">';
            html += '<thead class="table-warning"><tr>';
            html += '<th style="width:80px;">Row</th><th style="width:120px;">Brand</th><th style="width:100px;">Date(s)</th><th style="width:100px;">Discount</th><th style="width:90px;">Vendor %</th>';
            html += '<th style="width:140px;">Locations</th><th style="width:120px;">Deal Info</th><th style="width:120px;">Categories</th><th style="width:120px;">Notes</th><th style="width:110px;">MIS ID</th>';
            html += '</tr></thead>';
            html += '<tbody>';
            
            if (split.interrupting_deal) {
                html += '<tr>';
                
                // Row button
                html += '<td>';
                if (split.interrupting_deal.google_row) {
                    html += '<button class="btn btn-sm btn-warning" onclick="openSheetRow(' + split.interrupting_deal.google_row + ')">Row ' + split.interrupting_deal.google_row + '</button>';
                } else {
                    html += '-';
                }
                html += '</td>';
                
                // Brand
                html += '<td><strong>' + (split.interrupting_deal.brand || split.brand || '-') + '</strong></td>';
                
                // Date(s)
                html += '<td>' + (split.conflict_dates ? split.conflict_dates.join(', ') : '-') + '</td>';
                
                // Discount
                html += '<td>' + (split.interrupting_deal.discount || '-') + '</td>';
                
                // Vendor %
                html += '<td>' + (split.interrupting_deal.vendor_contrib || '-') + '</td>';
                
                // Locations
                html += '<td title="' + (split.interrupting_deal.locations || '') + '">' + truncateText(split.interrupting_deal.locations || '-', 25) + '</td>';
                
                // Deal Info
                html += '<td title="' + (split.interrupting_deal.deal_info || '') + '">' + truncateText(split.interrupting_deal.deal_info || '-', 25) + '</td>';
                
                // Categories
                html += '<td title="' + (split.interrupting_deal.categories || '') + '">' + truncateText(split.interrupting_deal.categories || '-', 20) + '</td>';
                
                // Notes
                html += '<td title="' + (split.interrupting_deal.special_notes || '') + '">' + truncateText(split.interrupting_deal.special_notes || '-', 20) + '</td>';
                
                // MIS ID
                html += '<td>';
                if (split.interrupting_deal.mis_id) {
                    html += renderClickableMisId(split.interrupting_deal.mis_id, split.interrupting_deal);
                } else {
                    html += '<span style="color:#999; font-style:italic;">No ID</span>';
                }
                html += '</td>';
                
                html += '</tr>';
            } else {
                html += '<tr><td colspan="10" class="text-muted text-center">No conflict deal data available</td></tr>';
            }
            
            html += '</tbody></table>';
            html += '</div>';
            
                                if (conflictType === 'LOCATION_PARTIAL') {
                html += '<p class="mb-2 text-info"><i class="bi bi-geo-alt"></i> <strong>Overlap Locations:</strong> ' + (split.overlap_locations?.join(', ') || 'N/A') + '<br><small>Weekly continues at other locations without split.</small></p>';
            }
            
            // v88: MIS Entry Plan table with Discount, Vendor %, Location columns
            // v12.12.14: Added Automate column for Create/End Date buttons
            html += '<hr><p class="mb-1"><strong>MIS Entry Plan:</strong></p>';
            html += '<table class="table table-sm table-bordered" style="table-layout:fixed; width:100%;"><thead class="table-light"><tr>';
            html += '<th style="width:90px;">Action</th><th style="width:140px;">Date Range</th><th style="width:100px;">Discount</th><th style="width:90px;">Vendor %</th><th style="width:140px;">Location</th><th style="width:110px;">MIS ID</th><th style="width:90px;">Automate</th><th style="width:80px;">Approve</th><th style="width:80px;">Apply</th><th style="width:150px;">Notes</th>';
            html += '</tr></thead><tbody>';
            
            split.plan.forEach(function(step, stepIdx) {
                var rowClass = step.action === 'GAP' ? 'table-warning' : (step.action === 'PATCH' ? 'table-info' : '');
                html += '<tr class="' + rowClass + '" id="split-row-' + idx + '-' + stepIdx + '">';
                
                // v10.8: Action column with dynamic labels based on section
                const dealSection = split.section || 'weekly';
                const intSection = split.interrupting_deal_type || '';
                html += '<td>';
                if (step.action === 'CREATE_PART1') {
                    html += '<span class="badge bg-primary">' + formatActionLabel(step.action, dealSection, intSection) + '</span>';
                }
                if (step.action === 'GAP') {
                    html += '<span class="badge bg-warning text-dark">' + formatActionLabel(step.action, dealSection, intSection) + '</span>';
                }
                if (step.action === 'PATCH') {
                    html += '<span class="badge bg-info text-dark">' + formatActionLabel(step.action, dealSection, intSection) + '</span>';
                }
                if (step.action === 'CREATE_PART2') {
                    html += '<span class="badge bg-success">' + formatActionLabel(step.action, dealSection, intSection) + '</span>';
                }
                html += '</td>';
                
                // Date Range column
                html += '<td>' + (step.dates || '-') + '</td>';
                
                // v94: Discount column - PATCH uses Weekly discount
                html += '<td>';
                if (step.action === 'GAP' && split.interrupting_deal) {
                    html += '<span class="text-warning">' + (split.interrupting_deal.discount || '-') + '</span>';
                } else if (step.action === 'PATCH') {
                    html += '<span class="text-info">' + (step.discount || split.discount || '-') + '</span>';
                } else {
                    html += (split.discount || '-');
                }
                html += '</td>';
                
                // v94: Vendor % column - PATCH uses Weekly vendor %
                html += '<td>';
                if (step.action === 'GAP' && split.interrupting_deal) {
                    html += '<span class="text-warning">' + (split.interrupting_deal.vendor_contrib || '-') + '</span>';
                } else if (step.action === 'PATCH') {
                    html += '<span class="text-info">' + (step.vendor_contrib || split.vendor_contrib || '-') + '</span>';
                } else {
                    html += (split.vendor_contrib || '-');
                }
                html += '</td>';
                
                // v94: Location column - PATCH shows non-conflicting stores
                html += '<td title="' + (step.action === 'GAP' && split.interrupting_deal ? (split.interrupting_deal.locations || '') : (step.action === 'PATCH' ? (step.locations || '') : (split.locations || ''))) + '">';
                if (step.action === 'GAP' && split.interrupting_deal) {
                    html += '<span class="text-warning">' + truncateText(split.interrupting_deal.locations || '-', 20) + '</span>';
                } else if (step.action === 'PATCH') {
                    html += '<span class="text-info">' + truncateText(step.locations || '-', 20) + '</span>';
                } else {
                    html += truncateText(split.locations || '-', 20);
                }
                html += '</td>';
                
                // v94: MIS ID column - PATCH needs input like Part 2
                // v10.8: Use section-based parsed MIS IDs (W1, W2, WP, M1, M2, MP, S1, S2, SP)
                html += '<td>';
                const parsedIds = split.parsed_mis_ids || {weekly: {parts: [], patch: null}, monthly: {parts: [], patch: null}, sale: {parts: [], patch: null}};
                const sectionKey = (dealSection || 'weekly').toLowerCase();
                const sectionIds = parsedIds[sectionKey] || {parts: [], patch: null};
                const sectionPrefix = sectionKey === 'monthly' ? 'M' : (sectionKey === 'sale' ? 'S' : 'W');
                
                if (step.action === 'CREATE_PART1') {
                    // Show Original ID from parsed parts (first in list)
                    if (sectionIds.parts && sectionIds.parts.length > 0) {
                        // v12.22.7: Pass split data for validation
                        html += renderClickableMisId(sectionPrefix + '1: ' + sectionIds.parts[0], split);
                    } else if (split.original_mis_id && !split.original_mis_id.includes(':')) {
                        // Legacy: no tags, use as-is
                        html += renderClickableMisId(split.original_mis_id, split);
                    } else {
                        html += '<em>From Sheet</em>';
                    }
                }
                if (step.action === 'CREATE_PART2') {
                    // v10.8: Check if Continuation already exists in parsed IDs
                    if (sectionIds.parts && sectionIds.parts.length > 1) {
                        // Continuation already entered - show clickable ID
                        // v12.22.7: Pass split data for validation
                        html += renderClickableMisId(sectionPrefix + '2: ' + sectionIds.parts[1], split);
                    } else {
                        // No Continuation yet - show input field
                        html += '<input type="text" class="form-control form-control-sm" placeholder="New MIS ID" id="split-id-' + idx + '-' + stepIdx + '" style="width:100px;" data-split-idx="' + idx + '" data-step-idx="' + stepIdx + '" data-google-row="' + (split.google_row || '') + '" data-section="' + sectionKey + '">';
                    }
                }
                if (step.action === 'GAP') {
                    // v10.8: GAP ID comes from interrupting deal's row, not the split row
                    // Check the interrupting deal's MIS ID first
                    if (split.interrupting_deal && split.interrupting_deal.mis_id) {
                        html += renderClickableMisId(split.interrupting_deal.mis_id, split.interrupting_deal);
                    } else {
                        html += '<input type="text" class="form-control form-control-sm" placeholder="New MIS ID" id="split-gap-id-' + idx + '-' + stepIdx + '" style="width:100px;" data-split-idx="' + idx + '" data-step-idx="' + stepIdx + '" data-google-row="' + (split.interrupting_deal?.google_row || '') + '" data-section="' + (intSection || '').toLowerCase() + '">';
                    }
                }
                if (step.action === 'PATCH') {
                    // v10.8: Check for Patch ID using section prefix (WP, MP, SP)
                    if (sectionIds.patch) {
                        // v12.22.7: Pass split data for validation
                        html += renderClickableMisId(sectionPrefix + 'P: ' + sectionIds.patch, split);
                    } else {
                        html += '<input type="text" class="form-control form-control-sm" placeholder="New MIS ID" id="split-patch-id-' + idx + '-' + stepIdx + '" style="width:100px;" data-split-idx="' + idx + '" data-step-idx="' + stepIdx + '" data-google-row="' + (split.google_row || '') + '" data-section="' + sectionKey + '">';
                    }
                }
                html += '</td>';
                
                // v12.12.14: Automate column - Create/End Date buttons
                html += '<td>';
                const hasOriginalMisId = sectionIds.parts && sectionIds.parts.length > 0;
                
                if (step.action === 'CREATE_PART1') {
                    // Original row: End Date button if has MIS ID, Create if not
                    if (hasOriginalMisId) {
                        const originalId = sectionIds.parts[0];
                        html += '<button class="btn btn-warning btn-sm py-0 px-2" onclick="automateEndDate(' + idx + ', ' + stepIdx + ', \'' + originalId + '\', \'' + (step.dates || '') + '\', \'' + (split.google_row || '') + '\')" title="Automate End Date adjustment in MIS">End Date</button>';
                    } else {
                        html += '<button class="btn btn-success btn-sm py-0 px-2" onclick="automateCreateDeal(' + idx + ', ' + stepIdx + ', \'' + (step.dates || '') + '\', \'' + (split.google_row || '') + '\', \'' + sectionKey + '\')" title="Create new deal in MIS">Create</button>';
                    }
                } else if (step.action === 'GAP') {
                    // Interrupting row: Create button
                    const intGoogleRow = split.interrupting_deal?.google_row || '';
                    const intSectionKey = (intSection || 'monthly').toLowerCase();
                    html += '<button class="btn btn-success btn-sm py-0 px-2" onclick="automateCreateDeal(' + idx + ', ' + stepIdx + ', \'' + (step.dates || '') + '\', \'' + intGoogleRow + '\', \'' + intSectionKey + '\')" title="Create interrupting deal in MIS">Create</button>';
                } else if (step.action === 'PATCH') {
                    // Patch row: Create button
                    html += '<button class="btn btn-success btn-sm py-0 px-2" onclick="automateCreateDeal(' + idx + ', ' + stepIdx + ', \'' + (step.dates || '') + '\', \'' + (split.google_row || '') + '\', \'' + sectionKey + '\')" title="Create patch deal in MIS">Create</button>';
                } else if (step.action === 'CREATE_PART2') {
                    // Continued row: Create button
                    html += '<button class="btn btn-success btn-sm py-0 px-2" onclick="automateCreateDeal(' + idx + ', ' + stepIdx + ', \'' + (step.dates || '') + '\', \'' + (split.google_row || '') + '\', \'' + sectionKey + '\')" title="Create continued deal in MIS">Create</button>';
                } else {
                    html += '-';
                }
                html += '</td>';
                
                // v10.8: Approve column - use section-based checks
                html += '<td>';
                const hasExistingCont = sectionIds.parts && sectionIds.parts.length > 1;
                const hasExistingPatch = sectionIds.patch !== null;
                const hasExistingInterrupt = split.interrupting_deal && split.interrupting_deal.mis_id;
                
                if (step.action === 'CREATE_PART2') {
                    if (hasExistingCont) {
                        html += '<span class="text-success" title="Already entered">&#10003;</span>';
                    } else {
                        html += '<button class="btn btn-success btn-sm" onclick="approveSplitId(' + idx + ', ' + stepIdx + ', \'' + sectionKey + '\')" title="Approve this MIS ID">&#10003;</button>';
                    }
                } else if (step.action === 'GAP') {
                    if (hasExistingInterrupt) {
                        html += '<span class="text-success" title="Already entered">&#10003;</span>';
                    } else {
                        html += '<button class="btn btn-success btn-sm" onclick="approveGapId(' + idx + ', ' + stepIdx + ', \'' + (intSection || '').toLowerCase() + '\')" title="Approve this MIS ID">&#10003;</button>';
                    }
                } else if (step.action === 'PATCH') {
                    if (hasExistingPatch) {
                        html += '<span class="text-success" title="Already entered">&#10003;</span>';
                    } else {
                        html += '<button class="btn btn-success btn-sm" onclick="approvePatchId(' + idx + ', ' + stepIdx + ', \'' + sectionKey + '\')" title="Approve this MIS ID">&#10003;</button>';
                    }
                } else {
                    html += '-';
                }
                html += '</td>';
                
                // v10.8: Apply column - use section-based checks
                html += '<td>';
                if (step.action === 'CREATE_PART2') {
                    if (hasExistingCont) {
                        html += '<span class="badge bg-success">Done</span>';
                    } else {
                        html += '<button class="btn btn-primary btn-sm" id="apply-split-btn-' + idx + '-' + stepIdx + '" onclick="applySplitIdToSheet(' + idx + ', ' + stepIdx + ', \'' + sectionKey + '\')" title="Apply to Google Sheet" disabled>Apply</button>';
                    }
                } else if (step.action === 'GAP') {
                    if (hasExistingInterrupt) {
                        html += '<span class="badge bg-success">Done</span>';
                    } else {
                        html += '<button class="btn btn-primary btn-sm" id="apply-gap-btn-' + idx + '-' + stepIdx + '" onclick="applyGapIdToSheet(' + idx + ', ' + stepIdx + ', \'' + (intSection || '').toLowerCase() + '\')" title="Apply to Google Sheet" disabled>Apply</button>';
                    }
                } else if (step.action === 'PATCH') {
                    if (hasExistingPatch) {
                        html += '<span class="badge bg-success">Done</span>';
                    } else {
                        html += '<button class="btn btn-primary btn-sm" id="apply-patch-btn-' + idx + '-' + stepIdx + '" onclick="applyPatchIdToSheet(' + idx + ', ' + stepIdx + ', \'' + sectionKey + '\')" title="Apply to Google Sheet" disabled>Apply</button>';
                    }
                } else {
                    html += '-';
                }
                html += '</td>';
                
                // Notes column
                html += '<td><small>' + (step.notes || '') + '</small></td>';
                html += '</tr>';
            });
            
            html += '</tbody></table>';
            
            if (split.attribute_comparison) {
                html += '<details class="mt-2"><summary class="text-muted" style="cursor:pointer;">View Attribute Comparison</summary><pre class="bg-light p-2 mt-1" style="font-size:0.8em;">' + JSON.stringify(split.attribute_comparison, null, 2) + '</pre></details>';
            }
            html += '</div></div>';
        });
    } else {
        html += '<div class="alert alert-success"><i class="bi bi-check-circle"></i> No splits required! All Weekly deals can run without interruption.</div>';
    }
    
    // v88: Enhanced Clean Deals section with full ID MATCHER columns
    if (data.no_conflict && data.no_conflict.length > 0) {
        html += '<details class="mt-4" open><summary class="h5 text-success" style="cursor:pointer;"><i class="bi bi-check-circle"></i> Clean Deals (' + data.no_conflict.length + ') - No Split Needed</summary>';
        html += '<div class="mt-2">';
        html += '<div class="scrollable-table-container" style="max-height:400px;">';
        html += '<table class="table table-sm table-striped" style="font-size:0.85em;">';
        html += '<thead class="table-light"><tr>';
        html += '<th>Row</th><th>Brand</th><th>Weekday</th><th>Notes</th><th>Deal Info</th>';
        html += '<th>Discount</th><th>Vendor %</th><th>Locations</th><th>Categories</th><th>MIS ID</th>';
        html += '</tr></thead><tbody>';
        
        data.no_conflict.forEach(function(deal, idx) {
            html += '<tr>';
            // Row button
            html += '<td>';
            if (deal.google_row) {
                html += '<button class="btn btn-sm btn-outline-primary" onclick="openSheetRow(' + deal.google_row + ')">Row ' + deal.google_row + '</button>';
            } else {
                html += '-';
            }
            html += '</td>';
            // Brand
            html += '<td><strong>' + (deal.brand || '-') + '</strong></td>';
            // Weekday
            html += '<td>' + (deal.weekday || '-') + '</td>';
            // Notes
            html += '<td title="' + (deal.special_notes || '') + '">' + truncateText(deal.special_notes || '-', 20) + '</td>';
            // Deal Info
            html += '<td title="' + (deal.deal_info || '') + '">' + truncateText(deal.deal_info || '-', 20) + '</td>';
            // Discount
            html += '<td>' + (deal.discount || '-') + '</td>';
            // Vendor %
            html += '<td>' + (deal.vendor_contrib || '-') + '</td>';
            // Locations
            html += '<td title="' + (deal.locations || '') + '">' + truncateText(deal.locations || '-', 25) + '</td>';
            // Categories
            html += '<td title="' + (deal.categories || '') + '">' + truncateText(deal.categories || '-', 15) + '</td>';
            // MIS ID - clickable
            html += '<td>';
            if (deal.mis_id) {
                html += renderClickableMisId(deal.mis_id, deal);
            } else {
                html += '<span style="color:#999; font-style:italic;">No ID</span>';
            }
            html += '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table></div></div></details>';
    }
    
    container.innerHTML = html;
}

// v88: Helper to truncate text
function truncateText(text, maxLen) {
    if (!text) return '-';
    text = String(text);
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

// v88: Helper to render clickable MIS ID(s)
function renderClickableMisId(misIdStr, rowData) {
    if (!misIdStr || misIdStr === '-') {
        return '<span style="color:#999; font-style:italic;">No ID</span>';
    }
    
    // Helper to strip tag prefix (Part 1:, GAP:, Patch:, etc.)
    function stripTag(str) {
        if (!str) return '';
        str = String(str).trim();
        if (str.indexOf(':') !== -1) {
            return str.split(':').pop().trim();
        }
        return str;
    }
    
    // Handle both newline-separated (new format) and comma-separated (legacy)
    var rawStr = String(misIdStr);
    var ids = [];
    
    if (rawStr.indexOf('\n') !== -1) {
        // New tagged format with newlines
        ids = rawStr.split('\n').map(function(line) { return line.trim(); }).filter(function(line) { return line; });
    } else {
        // Legacy comma-separated format
        ids = rawStr.split(',').map(function(id) { return id.trim(); }).filter(function(id) { return id; });
    }
    
    if (ids.length === 0) {
        return '<span style="color:#999; font-style:italic;">No ID</span>';
    }
    
    // Prepare row data for validation (if provided)
    var rowDataJson = null;
    if (rowData) {
        var validationData = {
            brand: rowData.brand || '',
            linked_brand: rowData.linked_brand || '',
            weekday: rowData.weekday || '',
            categories: rowData.categories || '',
            discount: rowData.discount || '',
            vendor_contrib: rowData.vendor_contrib || rowData.vendor_percentage || '',
            locations: rowData.locations || 'All Locations',
            rebate_type: rowData.rebate_type || '',
            after_wholesale: rowData.after_wholesale || false
        };
        rowDataJson = JSON.stringify(validationData).replace(/"/g, '&quot;');
    }
    
    return ids.map(function(id) {
        var cleanId = stripTag(id);  // Strip tag for lookup
        var displayId = id;  // Keep full display (with tag)
        
        // Use enhanced validation if row data is available
        if (rowDataJson) {
            return '<span data-row=\'' + rowDataJson + '\' onclick="lookupMisIdWithValidation(this, \'' + cleanId + '\')" style="cursor:pointer; font-weight:bold; padding:2px 6px; border-radius:4px; background:#667eea; color:white; text-decoration:underline; display:inline-block; margin:1px;" title="Click to lookup and validate in MIS">' + displayId + '</span>';
        } else {
            return '<span onclick="lookupMisIdWithValidation(this, \'' + cleanId + '\')" style="cursor:pointer; font-weight:bold; padding:2px 6px; border-radius:4px; background:#667eea; color:white; text-decoration:underline; display:inline-block; margin:1px;" title="Click to lookup in MIS (backend will search Google Sheet)">' + displayId + '</span>';
        }
    }).join(' ');
}

// v12.12.14: Automate End Date adjustment in MIS
async function automateEndDate(splitIdx, stepIdx, misId, dateRange, googleRow) {
    console.log('[AUTOMATE END DATE] Starting...', {splitIdx, stepIdx, misId, dateRange, googleRow});
    
    // Parse the date range to get the end date (first date in range for Part 1/Original)
    // dateRange format: "01/01 - 01/15" or "01/15"
    let newEndDate = '';
    if (dateRange.includes(' - ')) {
        // Range format: take the end date (second part)
        const parts = dateRange.split(' - ');
        newEndDate = parts[1].trim();
    } else {
        newEndDate = dateRange.trim();
    }
    
    if (!newEndDate) {
        alert('Could not determine end date from: ' + dateRange);
        return;
    }
    
    // Add year if not present (use current tab year)
    if (newEndDate.split('/').length === 2) {
        // Get year from tab name
        const tabName = document.getElementById('mis-tab')?.value || '';
        const yearMatch = tabName.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
        newEndDate = newEndDate + '/' + year;
    }
    
    // Show loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'automate-loading';
    loadingOverlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:10003; display:flex; justify-content:center; align-items:center; flex-direction:column;';
    loadingOverlay.innerHTML = '<div class="spinner-border text-light" style="width:3rem; height:3rem;"></div><div style="color:white; margin-top:15px; font-size:1.2em;">Updating End Date in MIS...</div><div id="automate-status" style="color:#aaa; margin-top:10px; font-size:0.9em;">Opening MIS entry ' + misId + '...</div>';
    document.body.appendChild(loadingOverlay);
    
    try {
        const response = await api.automation.autoEndDate({
                mis_id: misId,
                new_end_date: newEndDate,
                google_row: googleRow,
                split_idx: splitIdx,
                step_idx: stepIdx
            });
        
        const data = await response.json();
        document.getElementById('automate-loading')?.remove();
        
        if (data.success) {
            alert('✅ End Date updated to ' + newEndDate + '\\n\\nPlease review and click Save in MIS if everything looks correct.\\n\\nValidation is active - check the banner for any warnings.');
            
            // Visual feedback on the row
            const row = document.getElementById('split-row-' + splitIdx + '-' + stepIdx);
            if (row) {
                row.style.backgroundColor = '#fff3cd';
            }
        } else {
            alert('Error updating end date: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        document.getElementById('automate-loading')?.remove();
        alert('Error: ' + error.message);
    }
}

// // v12.18.2: Automate Create Deal with PRE-FLIGHT CONFIRMATION POPUP
async function automateCreateDeal(splitIdx, stepIdx, dateRange, googleRow, sectionType) {
    console.log('[AUTOMATE CREATE] Starting...', {splitIdx, stepIdx, dateRange, googleRow, sectionType});
    
    // 1. Retrieve the Source Data from Memory
    const split = splitPlanningData.splits_required[splitIdx];
    const step = split.plan[stepIdx];
    
    if (!split) {
        alert("Error: Could not find deal data in memory. Please re-run Phase 1 analysis.");
        return;
    }

    // 2. Determine Source Profile (Weekly vs Interrupting)
    let sourceData = split; 
    let dealType = 'CONTINUE';
    
    if (step.action === 'GAP' && split.interrupting_deal) {
         sourceData = split.interrupting_deal;
         dealType = 'GAP';
         console.log('[AUTOMATE] Using Interrupting Deal profile for GAP');
    } else {
         console.log('[AUTOMATE] Using Main Deal profile');
    }

    console.log('[AUTOMATE] Full sourceData:', JSON.stringify(sourceData, null, 2));

    // 3. Parse Dates
    let startDate = '', endDate = '';
    if (dateRange.includes(' - ')) {
        const parts = dateRange.split(' - ');
        startDate = parts[0].trim();
        endDate = parts[1].trim();
    } else {
        startDate = dateRange.trim();
        endDate = dateRange.trim();
    }
    
    const tabName = document.getElementById('mis-tab')?.value || '';
    const yearMatch = tabName.match(/\d{4}/);
    const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
    
    if (startDate.split('/').length === 2) startDate = startDate + '/' + year;
    if (endDate.split('/').length === 2) endDate = endDate + '/' + year;

    // 4. Calculate weekday from dates if not specified
    let weekdayValue = sourceData.weekday || '';
    if (!weekdayValue && startDate && endDate) {
        weekdayValue = calculateWeekdaysFromDateRange(startDate, endDate);
        console.log('[AUTOMATE] Calculated weekday from dates:', weekdayValue);
    }

    // 5. Determine Rebate Type from checkboxes
    // v12.22.2: More robust detection - handle 'TRUE', 'true', true, etc.
    let rebateType = '';
    const wholesaleVal = String(sourceData.wholesale || '').toUpperCase();
    const retailVal = String(sourceData.retail || '').toUpperCase();
    if (wholesaleVal === 'TRUE') {
        rebateType = 'Wholesale';
    } else if (retailVal === 'TRUE') {
        rebateType = 'Retail';
    }
    console.log('[AUTOMATE] Rebate Type:', rebateType, '(W:', sourceData.wholesale, '->', wholesaleVal, ', R:', sourceData.retail, '->', retailVal, ')');

    // 6. Build Pre-Flight Data
    const preFlightData = {
        brand: sourceData.brand || '',
        linked_brand: sourceData.linked_brand || '',
        weekday: weekdayValue,
        categories: sourceData.categories || '',
        locations: sourceData.locations || '',
        // v12.26.4: Use ?? (nullish coalescing) â€” 0 is valid, only null/undefined â†’ ''
        discount: String(sourceData.discount ?? '').replace('%', ''),
        vendor_contrib: String(sourceData.vendor_contrib ?? '').replace('%', ''),
        rebate_type: rebateType,
        after_wholesale: sourceData.after_wholesale === 'TRUE',
        start_date: startDate,
        end_date: endDate
    };

    // v12.26.4: step overrides â€” check != null to allow 0 values
    if (step.discount != null && String(step.discount) !== '') preFlightData.discount = String(step.discount).replace('%', '');
    if (step.vendor_contrib != null && String(step.vendor_contrib) !== '') preFlightData.vendor_contrib = String(step.vendor_contrib).replace('%', '');

    console.log('[AUTOMATE] Pre-flight data:', preFlightData);

    // v12.21.3: Load settings before opening Pre-Flight popup
    await loadSettingsDropdownData();
    
    openUnifiedPreFlight(preFlightData, googleRow, sectionType, splitIdx, stepIdx);
}

function calculateWeekdaysFromDateRange(startStr, endStr) {
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdaysFound = new Set();
    try {
        const startParts = startStr.split('/');
        const endParts = endStr.split('/');
        let startDate = new Date(startParts[2], startParts[0] - 1, startParts[1]);
        let endDate = new Date(endParts[2], endParts[0] - 1, endParts[1]);
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            weekdaysFound.add(weekdayNames[currentDate.getDay()]);
            currentDate.setDate(currentDate.getDate() + 1);
        }
    } catch (e) {
        console.error('[AUTOMATE] Error calculating weekdays:', e);
    }
    return Array.from(weekdaysFound).join(', ');
}

// v12.21: Renamed from showPreFlightPopup to openUnifiedPreFlight
// Enhanced with Smart Data parsing and Original Value tracking
function openUnifiedPreFlight(data, googleRow, sectionType, splitIdx, stepIdx) {
    document.getElementById('preflight-popup')?.remove();
    
    // v12.21: Smart Location Code Mapping
    // Expands abbreviations to full store names
    const locationCodeMap = {
        'dv': 'Davis',
        'davis': 'Davis',
        'mod': 'Modesto',
        'modesto': 'Modesto',
        'sj': 'San Jose',
        'san jose': 'San Jose',
        'sc': 'Santa Cruz',
        'santa cruz': 'Santa Cruz',
        'fre': 'Fresno',
        'fresno': 'Fresno',
        'dtsj': 'DTSJ',
        'cb': 'Campbell',
        'campbell': 'Campbell',
        'bw': 'Brentwood',
        'brentwood': 'Brentwood',
        'ant': 'Antioch',
        'antioch': 'Antioch',
        'sf': 'San Francisco',
        'san francisco': 'San Francisco'
    };
    
    // v12.21: Smart Location Expansion
    // Convert location codes to full names
    function expandLocationCodes(locationStr) {
        if (!locationStr) return [];
        
        // Handle "All Locations Except:" logic
        // Example: "All Locations Except: Davis, Hawthorne" ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ Returns 10 stores (all except Davis, Hawthorne)
        if (locationStr.toLowerCase().includes('all locations')) {
            if (locationStr.toLowerCase().includes('except')) {
                // v12.21.4: FIXED - Return all stores EXCEPT the listed ones
                
                // Step 1: Start with Master List (all 12 stores from Settings tab)
                const masterList = settingsCache.stores && settingsCache.stores.length > 0
                    ? settingsCache.stores
                    : ['Dixon', 'Davis', 'Beverly Hills', 'El Sobrante', 'Fresno (Palm)', 'Fresno (Shaw)', 
                       'Hawthorne', 'Koreatown', 'Laguna Woods', 'Oxnard', 'Riverside', 'West Hollywood'];
                
                // Step 2: Extract exceptions from "Except: X, Y, Z"
                // Handle various formats: "Except:", "Except :", "(Except: X)", etc.
                // v12.26.3: Use greedy (.+) to avoid truncating paren-containing store names
                const exceptMatch = locationStr.match(/except[:\s]+(.+)/i);
                if (exceptMatch) {
                    const exceptionsStr = exceptMatch[1].trim();
                    console.log('[SMART-LOCATION] Raw exception string:', JSON.stringify(exceptionsStr));
                    
                    const exceptionsRaw = exceptionsStr
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);  // Remove empty strings
                    
                    // Step 3: Expand exception codes (e.g., "DV" ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ "Davis")
                    const exceptions = exceptionsRaw.map(code => 
                        locationCodeMap[code.toLowerCase()] || code
                    );
                    
                    console.log('[SMART-LOCATION] All Locations Except logic:');
                    console.log('  Input String:', locationStr);
                    console.log('  Master List:', masterList);
                    console.log('  Exceptions Raw:', exceptionsRaw);
                    console.log('  Exceptions Expanded:', exceptions);
                    
                    // Step 4: Subtract - Remove exceptions from master list
                    const result = masterList.filter(store => {
                        // Case-insensitive comparison
                        const storeLower = store.toLowerCase();
                        const isExcluded = exceptions.some(exc => {
                            const excLower = exc.toLowerCase();
                            const matches = excLower === storeLower;
                            if (matches) {
                                console.log(`  ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ EXCLUDING: "${store}" (matches exception "${exc}")`);
                            }
                            return matches;
                        });
                        
                        if (!isExcluded) {
                            console.log(`  ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ KEEPING: "${store}"`);
                        }
                        
                        return !isExcluded;
                    });
                    
                    console.log('  Final Result (Master - Exceptions):', result);
                    console.log(`  Summary: ${masterList.length} total ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ ${exceptions.length} excluded ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ ${result.length} remaining`);
                    return result;
                }
            }
            // Just "All Locations" with no exceptions ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ return empty array (auto-selects all)
            console.log('[SMART-LOCATION] All Locations (no exceptions) - returning empty array');
            return [];
        }
        
        // Parse comma-separated codes (specific stores)
        const codes = locationStr.split(',').map(s => s.trim());
        const expanded = codes.map(code => {
            const codeLower = code.toLowerCase();
            return locationCodeMap[codeLower] || code; // Use mapping or original if not found
        });
        
        console.log('[SMART-LOCATION] Expanded:', locationStr, 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢', expanded);
        return expanded;
    }
    
    // v12.21: Apply smart expansion to incoming data
    const smartLocations = expandLocationCodes(data.locations);
    console.log('[PRE-FLIGHT v12.21] Smart locations:', smartLocations);
    console.log('[PRE-FLIGHT v12.21] Original data:', JSON.stringify(data, null, 2));
    
    // v12.21: Smart Rebate Type Detection
    // Detects "Rebate After Wholesale" vs plain "Retail"/"Wholesale"
    function detectSmartRebateType(rebateType, afterWholesale) {
        if (!rebateType) return '';
        
        // If Retail AND after_wholesale is true, it's "Rebate After Wholesale"
        if (rebateType.toLowerCase() === 'retail' && afterWholesale) {
            return 'Rebate After Wholesale';
        }
        
        // Otherwise return the plain type
        return rebateType;
    }
    
    const smartRebateType = detectSmartRebateType(data.rebate_type, data.after_wholesale);
    console.log('[PRE-FLIGHT v12.21] Smart rebate type:', smartRebateType, '(raw:', data.rebate_type, ', after_wholesale:', data.after_wholesale, ')');
    
    const weekdayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    // v12.18.3: Dynamic category options from Settings tab
    const categoryOptions = splitPlanningData.category_list && splitPlanningData.category_list.length > 0 
        ? splitPlanningData.category_list 
        : ['Flower', 'Prerolls', 'Vapes', 'Edibles', 'Concentrates', 'Tinctures', 'Topicals', 'Accessories', 'Capsules', 'CBD', 'Other'];
    // v12.21.3: Use stores from Settings tab (loaded via settingsCache)
    const storeOptions = settingsCache.stores && settingsCache.stores.length > 0
        ? settingsCache.stores
        : ['San Jose', 'Santa Cruz', 'Fresno', 'DTSJ', 'Campbell', 'Brentwood', 'Antioch', 'San Francisco'];  // Fallback
    const rebateTypeOptions = ['', 'Retail', 'Wholesale'];
    
    // v12.21.4.1: Build brand options from Settings cache (includes both main brands and linked brands)
    // Extract all unique brand names from settingsCache.brandLinkedMap (keys = main brands, values = linked brands)
    function getBrandOptionsFromSettings() {
        if (!settingsCache.brandLinkedMap || Object.keys(settingsCache.brandLinkedMap).length === 0) {
            // Fallback to splitPlanningData if settings not loaded
            return splitPlanningData.brand_list || [];
        }
        
        const brandSet = new Set();
        
        // Add all main brands (keys in the map)
        Object.keys(settingsCache.brandLinkedMap).forEach(brand => {
            // Keys are lowercase, so capitalize first letter for display
            const displayBrand = brand.charAt(0).toUpperCase() + brand.slice(1);
            brandSet.add(displayBrand);
        });
        
        // Add all linked brands (values in the map)
        Object.values(settingsCache.brandLinkedMap).forEach(linkedBrand => {
            if (linkedBrand && linkedBrand.trim()) {
                brandSet.add(linkedBrand.trim());
            }
        });
        
        // Convert set to sorted array
        return Array.from(brandSet).sort();
    }
    
    const brandOptions = getBrandOptionsFromSettings();
    console.log('[PRE-FLIGHT] Brand options from Settings:', brandOptions.length, 'brands');
    
    const brandLinkedMap = splitPlanningData.brand_linked_map || {};
    
    const currentWeekdays = data.weekday ? data.weekday.split(',').map(s => s.trim()) : [];
    const currentCategories = data.categories ? data.categories.split(',').map(s => s.trim()) : [];
    // v12.21: Use smartLocations instead of parsing data.locations directly
    // currentStores is now replaced by smartLocations (already expanded above)
    
    const popup = document.createElement('div');
    popup.id = 'preflight-popup';
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:100000;display:flex;justify-content:center;align-items:center;font-family:Segoe UI,system-ui,sans-serif;';
    
    let weekdayOptionsHtml = weekdayOptions.map(opt => {
        const sel = currentWeekdays.some(cw => cw.toLowerCase() === opt.toLowerCase()) ? ' selected' : '';
        return '<option value="' + opt + '"' + sel + '>' + opt + '</option>';
    }).join('');
    
    let categoryOptionsHtml = categoryOptions.map(opt => {
        const sel = currentCategories.some(cc => cc.toLowerCase().includes(opt.toLowerCase()) || opt.toLowerCase().includes(cc.toLowerCase())) ? ' selected' : '';
        return '<option value="' + opt + '"' + sel + '>' + opt + '</option>';
    }).join('');
    
    // v12.21: Use smartLocations for automatic checkbox selection
    let storeOptionsHtml = storeOptions.map(opt => {
        const sel = smartLocations.some(sl => sl.toLowerCase() === opt.toLowerCase()) ? ' selected' : '';
        return '<option value="' + opt + '"' + sel + '>' + opt + '</option>';
    }).join('');
    
    let rebateTypeOptionsHtml = rebateTypeOptions.map(opt => {
        const sel = opt === data.rebate_type ? ' selected' : '';
        return '<option value="' + opt + '"' + sel + '>' + (opt || '-- Select --') + '</option>';
    }).join('');
    
    // v12.18.3: Brand dropdown options
    let brandOptionsHtml = '<option value="">-- Select Brand --</option>';
    if (brandOptions.length > 0) {
        brandOptionsHtml += brandOptions.map(opt => {
            const sel = data.brand && opt.toLowerCase() === data.brand.toLowerCase() ? ' selected' : '';
            return '<option value="' + opt + '"' + sel + '>' + opt + '</option>';
        }).join('');
    } else {
        // Fallback: show current brand as only option
        brandOptionsHtml = '<option value="' + (data.brand || '') + '" selected>' + (data.brand || '(No brands loaded)') + '</option>';
    }
    
    // v12.18.3: Linked Brand dropdown options (with empty option for "no linked brand")
    let linkedBrandOptionsHtml = '<option value="">(No Linked Brand)</option>';
    
    // v12.21.4.1: DEBUG - Log linked brand selection
    console.log('[LINKED-BRAND-DROPDOWN] data.linked_brand:', data.linked_brand);
    console.log('[LINKED-BRAND-DROPDOWN] brandOptions:', brandOptions);
    
    if (brandOptions.length > 0) {
        linkedBrandOptionsHtml += brandOptions.map(opt => {
            const sel = data.linked_brand && opt.toLowerCase() === data.linked_brand.toLowerCase() ? ' selected' : '';
            if (sel) {
                console.log(`[LINKED-BRAND-DROPDOWN] ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ SELECTED: "${opt}" (matches data.linked_brand: "${data.linked_brand}")`);
            }
            return '<option value="' + opt + '"' + sel + '>' + opt + '</option>';
        }).join('');
    }
    
    console.log('[LINKED-BRAND-DROPDOWN] Final linkedBrandOptionsHtml length:', linkedBrandOptionsHtml.length);
    
    popup.innerHTML = '<div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border:2px solid #4a90d9;border-radius:12px;padding:25px;max-width:600px;width:90%;max-height:90vh;overflow-y:auto;color:#fff;">' +
        '<h3 style="margin:0 0 20px 0;color:#4a90d9;">🚀 Pre-Flight Confirmation <span style="font-size:12px;color:#888;">(Row ' + googleRow + ')</span></h3>' +
        '<p style="color:#aaa;font-size:13px;margin-bottom:20px;">Review and modify values. <strong style="color:#ffc107;">Ctrl+Click for multi-select</strong></p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">' +
        '<div><label style="font-size:12px;color:#aaa;">Brand</label><select id="pf-brand" style="width:100%;padding:8px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;">' + brandOptionsHtml + '</select></div>' +
        '<div><label style="font-size:12px;color:#aaa;">Linked Brand</label><select id="pf-linked-brand" style="width:100%;padding:8px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;">' + linkedBrandOptionsHtml + '</select></div>' +
        '<div><label style="font-size:12px;color:#aaa;">Weekday <span style="color:#dc3545;">*</span></label><select id="pf-weekday" multiple size="4" style="width:100%;padding:4px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;">' + weekdayOptionsHtml + '</select></div>' +
        '<div><label style="font-size:12px;color:#aaa;">Rebate Type <span style="color:#dc3545;">*</span></label><select id="pf-rebate-type" style="width:100%;padding:8px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;">' + rebateTypeOptionsHtml + '</select></div>' +
        '<div><label style="font-size:12px;color:#aaa;">Category</label><select id="pf-categories" multiple size="4" style="width:100%;padding:4px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;">' + categoryOptionsHtml + '</select></div>' +
        '<div><label style="font-size:12px;color:#aaa;">Store/Locations</label><select id="pf-stores" multiple size="4" style="width:100%;padding:4px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;">' + storeOptionsHtml + '</select></div>' +
        '<div><label style="font-size:12px;color:#aaa;">Discount %</label><input type="text" id="pf-discount" value="' + data.discount + '" style="width:100%;padding:8px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;"></div>' +
        '<div><label style="font-size:12px;color:#aaa;">Vendor Rebate %</label><input type="text" id="pf-vendor" value="' + data.vendor_contrib + '" style="width:100%;padding:8px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;"></div>' +
        '<div><label style="font-size:12px;color:#aaa;">Start Date</label>' +
        '<div style="display:flex;gap:4px;">' +
        '<select id="pf-start-month" style="width:70px;padding:6px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;font-size:12px;">' +
        '<option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option>' +
        '<option value="04">Apr</option><option value="05">May</option><option value="06">Jun</option>' +
        '<option value="07">Jul</option><option value="08">Aug</option><option value="09">Sep</option>' +
        '<option value="10">Oct</option><option value="11">Nov</option><option value="12">Dec</option>' +
        '</select>' +
        '<select id="pf-start-day" style="width:55px;padding:6px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;font-size:12px;"></select>' +
        '<select id="pf-start-year" style="width:75px;padding:6px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;font-size:12px;"></select>' +
        '</div></div>' +
        '<div><label style="font-size:12px;color:#aaa;">End Date</label>' +
        '<div style="display:flex;gap:4px;">' +
        '<select id="pf-end-month" style="width:70px;padding:6px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;font-size:12px;">' +
        '<option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option>' +
        '<option value="04">Apr</option><option value="05">May</option><option value="06">Jun</option>' +
        '<option value="07">Jul</option><option value="08">Aug</option><option value="09">Sep</option>' +
        '<option value="10">Oct</option><option value="11">Nov</option><option value="12">Dec</option>' +
        '</select>' +
        '<select id="pf-end-day" style="width:55px;padding:6px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;font-size:12px;"></select>' +
        '<select id="pf-end-year" style="width:75px;padding:6px;border:1px solid #4a90d9;border-radius:4px;background:#2a2a4a;color:#fff;font-size:12px;"></select>' +
        '</div></div>' +
        '<div style="grid-column:span 2;"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="pf-after-wholesale"' + (data.after_wholesale ? ' checked' : '') + ' style="width:18px;height:18px;"><span>After Wholesale Discount?</span></label></div>' +
        '</div>' +
        '<!-- v12.21: Hidden fields for original value tracking -->' +
        '<input type="hidden" id="pf-original-discount" value="' + (data.discount || '') + '">' +
        '<input type="hidden" id="pf-original-vendor" value="' + (data.vendor_contrib || '') + '">' +
        '<input type="hidden" id="pf-original-brand" value="' + (data.brand || '') + '">' +
        '<input type="hidden" id="pf-original-linked" value="' + (data.linked_brand || '') + '">' +
        '<input type="hidden" id="pf-original-weekday" value="' + (data.weekday || '') + '">' +
        '<input type="hidden" id="pf-original-categories" value="' + (data.categories || '') + '">' +
        '<input type="hidden" id="pf-original-locations" value="' + (data.locations || '') + '">' +
        '<input type="hidden" id="pf-original-rebate-type" value="' + (data.rebate_type || '') + '">' +
        '<input type="hidden" id="pf-original-after-wholesale" value="' + (data.after_wholesale ? 'true' : 'false') + '">' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:25px;padding-top:15px;border-top:1px solid #4a90d9;">' +
        '<button id="pf-cancel" style="padding:10px 25px;border:1px solid #dc3545;background:transparent;color:#dc3545;border-radius:6px;cursor:pointer;">❌ Cancel</button>' +
        '<button id="pf-continue" style="padding:10px 25px;border:none;background:linear-gradient(135deg,#28a745,#20c997);color:white;border-radius:6px;cursor:pointer;font-weight:600;">🚀 Continue to MIS</button>' +
        '</div></div>';
    
    document.body.appendChild(popup);
    
    // v12.20: Initialize date dropdowns (Day: 1-31, Year: current ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±2 years)
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
    
    // Populate day dropdowns (1-31)
    const startDaySelect = document.getElementById('pf-start-day');
    const endDaySelect = document.getElementById('pf-end-day');
    for (let d = 1; d <= 31; d++) {
        const dayStr = String(d).padStart(2, '0');
        startDaySelect.add(new Option(dayStr, dayStr));
        endDaySelect.add(new Option(dayStr, dayStr));
    }
    
    // Populate year dropdowns
    const startYearSelect = document.getElementById('pf-start-year');
    const endYearSelect = document.getElementById('pf-end-year');
    years.forEach(function(y) {
        startYearSelect.add(new Option(y, y));
        endYearSelect.add(new Option(y, y));
    });
    
    // Parse and set initial date values from data.start_date and data.end_date
    // Expected format: MM/DD/YY or MM/DD/YYYY
    function parseAndSetDate(dateStr, monthId, dayId, yearId) {
        if (!dateStr) return;
        const parts = dateStr.split('/');
        if (parts.length >= 2) {
            const month = parts[0].padStart(2, '0');
            const day = parts[1].padStart(2, '0');
            let year = parts[2];
            if (year && year.length === 2) year = '20' + year; // Convert YY to YYYY
            
            const monthSel = document.getElementById(monthId);
            const daySel = document.getElementById(dayId);
            const yearSel = document.getElementById(yearId);
            
            if (monthSel) monthSel.value = month;
            if (daySel) daySel.value = day;
            if (yearSel && year) yearSel.value = year;
        }
    }
    
    parseAndSetDate(data.start_date, 'pf-start-month', 'pf-start-day', 'pf-start-year');
    parseAndSetDate(data.end_date, 'pf-end-month', 'pf-end-day', 'pf-end-year');
    
    // v12.18.3: Auto-update Linked Brand when Brand changes
    document.getElementById('pf-brand').onchange = function() {
        const selectedBrand = this.value.toLowerCase();
        const linkedBrandSelect = document.getElementById('pf-linked-brand');
        const linkedBrand = brandLinkedMap[selectedBrand] || '';
        if (linkedBrand) {
            // Find and select the matching linked brand option
            for (let i = 0; i < linkedBrandSelect.options.length; i++) {
                if (linkedBrandSelect.options[i].value.toLowerCase() === linkedBrand.toLowerCase()) {
                    linkedBrandSelect.selectedIndex = i;
                    break;
                }
            }
        } else {
            linkedBrandSelect.selectedIndex = 0; // Select "(No Linked Brand)"
        }
    };
    
    document.getElementById('pf-cancel').onclick = function() { popup.remove(); };
    
    document.getElementById('pf-continue').onclick = async function() {
        const selectedWeekdays = Array.from(document.getElementById('pf-weekday').selectedOptions).map(function(o) { return o.value; });
        const selectedCategories = Array.from(document.getElementById('pf-categories').selectedOptions).map(function(o) { return o.value; });
        const selectedStores = Array.from(document.getElementById('pf-stores').selectedOptions).map(function(o) { return o.value; });
        
        // v12.20: Read dates from dropdowns (Month/Day/Year format)
        const startMonth = document.getElementById('pf-start-month').value;
        const startDay = document.getElementById('pf-start-day').value;
        const startYear = document.getElementById('pf-start-year').value;
        const endMonth = document.getElementById('pf-end-month').value;
        const endDay = document.getElementById('pf-end-day').value;
        const endYear = document.getElementById('pf-end-year').value;
        
        // Format as MM/DD/YYYY
        const startDate = startMonth + '/' + startDay + '/' + startYear;
        const endDate = endMonth + '/' + endDay + '/' + endYear;
        
        const finalData = {
            brand: document.getElementById('pf-brand').value.trim(),
            linked_brand: document.getElementById('pf-linked-brand').value.trim(),
            weekday: selectedWeekdays.join(', '),
            categories: selectedCategories.join(', '),
            locations: selectedStores.join(', '),
            discount: document.getElementById('pf-discount').value.trim(),
            vendor_contrib: document.getElementById('pf-vendor').value.trim(),
            rebate_type: document.getElementById('pf-rebate-type').value,
            after_wholesale: document.getElementById('pf-after-wholesale').checked,
            start_date: startDate,
            end_date: endDate
        };
        
        if (!finalData.weekday) { alert('Weekday is required!'); return; }
        if (!finalData.rebate_type) { alert('Rebate Type is required!'); return; }
        
        console.log('[PREFLIGHT] Final data:', finalData);
        popup.remove();
        
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'automate-loading';
        loadingOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10003;display:flex;justify-content:center;align-items:center;flex-direction:column;';
        loadingOverlay.innerHTML = '<div class="spinner-border text-light" style="width:3rem;height:3rem;"></div><div style="color:white;margin-top:15px;">Creating Deal in MIS...</div>';
        document.body.appendChild(loadingOverlay);
        
        try {
            const sheetPayload = {
                brand: finalData.brand,
                linked_brand: finalData.linked_brand,
                weekday: finalData.weekday,
                categories: finalData.categories,
                locations: finalData.locations,
                discount: finalData.discount,
                vendor_contrib: finalData.vendor_contrib,
                retail: finalData.rebate_type === 'Retail' ? 'TRUE' : 'FALSE',
                wholesale: finalData.rebate_type === 'Wholesale' ? 'TRUE' : 'FALSE',
                after_wholesale: finalData.after_wholesale ? 'TRUE' : 'FALSE'
            };
            
            const response = await api.automation.autoCreate({
                    google_row: googleRow,
                    start_date: finalData.start_date,
                    end_date: finalData.end_date,
                    section_type: sectionType,
                    split_idx: splitIdx,
                    step_idx: stepIdx,
                    sheet_data: sheetPayload
                });
            
            const result = await response.json();
            document.getElementById('automate-loading')?.remove();
            
            if (result.success) {
                const row = document.getElementById('split-row-' + splitIdx + '-' + stepIdx);
                if (row) row.style.backgroundColor = '#d4edda';
            } else {
                alert('Error: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            document.getElementById('automate-loading')?.remove();
            alert('Error: ' + error.message);
        }
    };
}

// v88: Approve split ID
function approveSplitId(splitIdx, stepIdx) {
    var inputEl = document.getElementById('split-id-' + splitIdx + '-' + stepIdx);
    if (!inputEl) {
        alert('Input field not found');
        return;
    }
    
    var misId = inputEl.value.trim();
    if (!misId) {
        alert('Please enter a MIS ID first');
        return;
    }
    
    // Store the approved ID
    var key = splitIdx + '-' + stepIdx;
    approvedSplitIds[key] = {
        mis_id: misId,
        google_row: inputEl.getAttribute('data-google-row')
    };
    
    // Visual feedback
    var row = document.getElementById('split-row-' + splitIdx + '-' + stepIdx);
    if (row) {
        row.style.backgroundColor = '#d4edda';
    }
    inputEl.style.backgroundColor = '#d4edda';
    inputEl.style.fontWeight = 'bold';
    
    // Enable apply button
    var applyBtn = document.getElementById('apply-split-btn-' + splitIdx + '-' + stepIdx);
    if (applyBtn) {
        applyBtn.disabled = false;
    }
    
    console.log('[SPLIT] Approved MIS ID:', misId, 'for row:', inputEl.getAttribute('data-google-row'));
}

// v88: Apply split ID to Google Sheet (appends if existing)
// Updated v10.3: Uses tagged format (Part 2, Part 3, etc.)
async function applySplitIdToSheet(splitIdx, stepIdx) {
    var key = splitIdx + '-' + stepIdx;
    var approvedData = approvedSplitIds[key];
    
    if (!approvedData || !approvedData.mis_id) {
        alert('Please approve a MIS ID first');
        return;
    }
    
    if (!approvedData.google_row) {
        alert('No Google Sheet row associated with this split');
        return;
    }
    
    var applyBtn = document.getElementById('apply-split-btn-' + splitIdx + '-' + stepIdx);
    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Applying...';
    }
    
    // Determine the part number (Part 2, Part 3, etc.)
    var partNumber = approvedData.part_number || 2;
    var tag = 'part' + partNumber;
    
    try {
        // Call API to apply with tag
        var response = await api.matcher.applySplitId({
                google_row: parseInt(approvedData.google_row),
                new_mis_id: approvedData.mis_id,
                tag: tag,
                append: true
            });
        
        var data = await response.json();
        
        if (data.success) {
            alert('Part ' + partNumber + ' applied!\n\nRow: ' + approvedData.google_row + '\nMIS ID: ' + approvedData.mis_id);
            
            // Update UI
            if (applyBtn) {
                applyBtn.textContent = 'Applied';
                applyBtn.className = 'btn btn-outline-success btn-sm';
            }
            
            // Make the ID clickable now
            var inputEl = document.getElementById('split-id-' + splitIdx + '-' + stepIdx);
            if (inputEl && inputEl.parentNode) {
                inputEl.parentNode.innerHTML = renderClickableMisId(approvedData.mis_id);
            }
        } else {
            alert('Error: ' + data.error);
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Apply';
            }
        }
    } catch (err) {
        alert('Error: ' + err.message);
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = 'Apply';
        }
    }
}


function approveGapId(splitIdx, stepIdx) {
    var inputEl = document.getElementById('split-gap-id-' + splitIdx + '-' + stepIdx);
    if (!inputEl) { alert('Input field not found'); return; }
    var misId = inputEl.value.trim();
    if (!misId) { alert('Please enter a MIS ID first'); return; }
    var key = 'gap-' + splitIdx + '-' + stepIdx;
    approvedSplitIds[key] = { mis_id: misId, google_row: inputEl.getAttribute('data-google-row') };
    var row = document.getElementById('split-row-' + splitIdx + '-' + stepIdx);
    if (row) row.style.backgroundColor = '#d4edda';
    inputEl.style.backgroundColor = '#d4edda';
    inputEl.style.fontWeight = 'bold';
    var applyBtn = document.getElementById('apply-gap-btn-' + splitIdx + '-' + stepIdx);
    if (applyBtn) applyBtn.disabled = false;
}

async function applyGapIdToSheet(splitIdx, stepIdx) {
    var key = 'gap-' + splitIdx + '-' + stepIdx;
    var approvedData = approvedSplitIds[key];
    if (!approvedData || !approvedData.mis_id) { alert('Please approve a MIS ID first'); return; }
    if (!approvedData.google_row) { alert('No Google Sheet row associated'); return; }
    var applyBtn = document.getElementById('apply-gap-btn-' + splitIdx + '-' + stepIdx);
    if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying...'; }
    try {
        const data = await api.matcher.applySplitId({ google_row: parseInt(approvedData.google_row), new_mis_id: approvedData.mis_id, tag: 'gap', append: true });
        if (data.success) {
            alert('[OK] MIS ID applied successfully!\n\nRow: ' + approvedData.google_row + '\nNew Value: ' + data.new_value);
            if (applyBtn) { applyBtn.textContent = '[OK] Applied'; applyBtn.className = 'btn btn-outline-success btn-sm'; }
            var inputEl = document.getElementById('split-gap-id-' + splitIdx + '-' + stepIdx);
            if (inputEl && inputEl.parentNode) inputEl.parentNode.innerHTML = renderClickableMisId(data.new_value);
        } else {
            alert('Error: ' + data.error);
            if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply'; }
        }
    } catch (err) {
        alert('Error: ' + err.message);
        if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply'; }
    }
}

// v94: PATCH approve and apply functions (for partial location conflicts)
function approvePatchId(splitIdx, stepIdx) {
    var inputEl = document.getElementById('split-patch-id-' + splitIdx + '-' + stepIdx);
    if (!inputEl) { alert('Input field not found'); return; }
    var misId = inputEl.value.trim();
    if (!misId) { alert('Please enter a MIS ID first'); return; }
    var key = 'patch-' + splitIdx + '-' + stepIdx;
    approvedSplitIds[key] = { mis_id: misId, google_row: inputEl.getAttribute('data-google-row') };
    var row = document.getElementById('split-row-' + splitIdx + '-' + stepIdx);
    if (row) row.style.backgroundColor = '#d1ecf1';
    inputEl.style.backgroundColor = '#d1ecf1';
    inputEl.style.fontWeight = 'bold';
    var applyBtn = document.getElementById('apply-patch-btn-' + splitIdx + '-' + stepIdx);
    if (applyBtn) applyBtn.disabled = false;
}

async function applyPatchIdToSheet(splitIdx, stepIdx) {
    var key = 'patch-' + splitIdx + '-' + stepIdx;
    var approvedData = approvedSplitIds[key];
    if (!approvedData || !approvedData.mis_id) { alert('Please approve a MIS ID first'); return; }
    if (!approvedData.google_row) { alert('No Google Sheet row associated'); return; }
    var applyBtn = document.getElementById('apply-patch-btn-' + splitIdx + '-' + stepIdx);
    if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying...'; }
    try {
        const data = await api.matcher.applySplitId({ google_row: parseInt(approvedData.google_row), new_mis_id: approvedData.mis_id, tag: 'patch', append: true });
        if (data.success) {
            alert('[OK] MIS ID applied successfully!\n\nRow: ' + approvedData.google_row + '\nNew Value: ' + data.new_value);
            if (applyBtn) { applyBtn.textContent = '[OK] Applied'; applyBtn.className = 'btn btn-outline-success btn-sm'; }
            var inputEl = document.getElementById('split-patch-id-' + splitIdx + '-' + stepIdx);
            if (inputEl && inputEl.parentNode) inputEl.parentNode.innerHTML = renderClickableMisId(data.new_value);
        } else {
            alert('Error: ' + data.error);
            if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply'; }
        }
    } catch (err) {
        alert('Error: ' + err.message);
        if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply'; }
    }
}

// ============================================
// PHASE 2: FINAL VERIFICATION FUNCTIONS
// ============================================

let phase2ApprovedSuggestions = {}; // Store approved suggestions: {splitIdx_actionIdx: {mis_id, ...}}

// Update Phase 2 CSV status display (called when switching to Phase 2 tab)
function updatePhase2CsvStatus() {
    const statusEl = document.getElementById('phase2-csv-status');
    if (!statusEl) return;
    
    if (misData.localPath || misData.csvFile || misData.pulledCSVPath) {
        const filename = misData.csvFilename || 'CSV Loaded';
        statusEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> ' + filename + '</span>';
    } else {
        statusEl.innerHTML = '<span class="text-secondary"><i class="bi bi-file-earmark-x"></i> No CSV Loaded</span>';
    }
}

async function pullMisCsvForPhase2() {
    // Same as Setup tab - uses /api/mis/pull-csv with credentials
    const statusEl = document.getElementById('phase2-csv-status');
    statusEl.innerHTML = '<span class="text-warning"><i class="bi bi-hourglass-split"></i> Pulling CSV...</span>';
    
    // Get credentials from Setup tab
    const misUsername = document.getElementById('mis-username').value;
    const misPassword = document.getElementById('mis-password').value;
    
    if (!misUsername || !misPassword) {
        statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> Enter MIS credentials in Setup tab first</span>';
        return;
    }
    
    try {
        const data = await api.sheet.pullCSV({
                mis_username: misUsername,
                mis_password: misPassword
            });

        
        if (data.success) {
            // Update global misData (same as Setup tab)
            misData.localPath = data.path;
            misData.csvFile = null;
            misData.csvFilename = data.filename;
            misData.pulledCSVPath = data.path;
            
            statusEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> ' + data.filename + '</span>';
            
            // Also update Setup tab status
            const setupStatus = document.getElementById('mis-csv-status');
            if (setupStatus) {
                setupStatus.innerHTML = '<div class="alert alert-success p-2 mb-0" style="font-size: 0.9rem;"><strong>Active CSV:</strong> ' + data.filename + '<br><small class="text-muted">Pulled from Phase 2 tab</small></div>';
            }
            
            console.log('[PHASE2-CSV] CSV pulled successfully:', data.filename);
        } else {
            statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> ' + data.error + '</span>';
        }
    } catch (err) {
        statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> Error: ' + err.message + '</span>';
    }
}

async function runPhase2FinalCheck() {
    const resultsDiv = document.getElementById('split-final-check-results');
    const statsEl = document.getElementById('split-audit-stats');
    const csvStatusEl = document.getElementById('phase2-csv-status');
    const tabName = document.getElementById('mis-tab').value;
    
    if (!tabName) {
        alert('Please select a Google Sheet tab in Setup first.');
        return;
    }
    
    // CSV VALIDATION - check all possible sources
    const hasCSV = misData.csvFile || misData.localPath || misData.pulledCSVPath;
    if (!hasCSV) {
        alert('No MIS CSV found.\n\nPlease either:\n1. Upload a CSV in the Setup Tab\n2. Click "Pull MIS CSV" button above\n3. Use "MIS CSV" button in Setup tab');
        return;
    }
    
    resultsDiv.innerHTML = '<div class="text-center"><div class="spinner-border text-success"></div><p>Running final verification...</p></div>';
    statsEl.textContent = 'Verifying...';
    statsEl.className = 'badge bg-warning fs-6';
    
    // BUILD FORM DATA - check all possible CSV sources
    const formData = new FormData();
    formData.append('tab', tabName);
    if (misData.csvFile) {
        formData.append('csv', misData.csvFile);
    } else if (misData.localPath) {
        formData.append('local_csv_path', misData.localPath);
    } else if (misData.pulledCSVPath) {
        formData.append('local_csv_path', misData.pulledCSVPath);
    }
    // If none of the above, backend will use GLOBAL_DATA fallback
    
    try {
        const data = await api.updown.finalCheck(formData, true);
        
        if (!data.success) {
            resultsDiv.innerHTML = '<div class="alert alert-danger">' + data.error + '</div>';
            statsEl.textContent = 'Error';
            statsEl.className = 'badge bg-danger fs-6';
            return;
        }
        
        renderPhase2Results(data, resultsDiv);
        
        // Update stats
        const summary = data.summary || {};
        const correct = summary.fully_correct || 0;
        const errors = summary.partial_errors || 0;
        const missing = summary.missing_ids || 0;
        
        if (errors === 0 && missing === 0) {
            statsEl.textContent = correct + ' Verified';
            statsEl.className = 'badge bg-success fs-6';
        } else {
            statsEl.textContent = correct + ' OK | ' + errors + ' Errors | ' + missing + ' Missing';
            statsEl.className = 'badge bg-danger fs-6';
        }
        
    } catch (err) {
        resultsDiv.innerHTML = '<div class="alert alert-danger">Error: ' + err.message + '</div>';
        statsEl.textContent = 'Error';
        statsEl.className = 'badge bg-danger fs-6';
    }
}

function renderPhase2Results(data, container) {
    const results = data.verification_results || [];
    const noConflict = data.no_conflict || [];
    const summary = data.summary || {};
    
    let html = '';
    
    // Summary Stats
    html += '<div class="row mb-3">';
    html += '<div class="col-12">';
    html += '<div class="d-flex gap-2 flex-wrap">';
    html += '<span class="badge bg-success fs-6"><i class="bi bi-check-circle"></i> ' + (summary.fully_correct || 0) + ' Verified</span>';
    html += '<span class="badge bg-danger fs-6"><i class="bi bi-x-circle"></i> ' + (summary.partial_errors || 0) + ' Errors</span>';
    html += '<span class="badge bg-warning text-dark fs-6"><i class="bi bi-question-circle"></i> ' + (summary.missing_ids || 0) + ' Missing IDs</span>';
    html += '<span class="badge bg-secondary fs-6"><i class="bi bi-dash-circle"></i> ' + (summary.no_conflict_count || 0) + ' No Conflict</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    
    // Verification Results Table
    if (results.length > 0) {
        html += '<h5 class="mb-3"><i class="bi bi-list-check"></i> Verification Results</h5>';
        
        results.forEach((split, splitIdx) => {
            const statusClass = split.overall_status === 'CORRECT' ? 'border-success' : 
                               split.overall_status === 'MISSING_ID' ? 'border-warning' : 'border-danger';
            const headerClass = split.overall_status === 'CORRECT' ? 'bg-success text-white' : 
                               split.overall_status === 'MISSING_ID' ? 'bg-warning text-dark' : 'bg-danger text-white';
            
            html += '<div class="card mb-3 ' + statusClass + '" style="border-width: 2px;">';
            html += '<div class="card-header ' + headerClass + '">';
            html += '<div class="d-flex justify-content-between align-items-center">';
            html += '<strong>' + (split.brand || 'Unknown') + '</strong>';
            html += '<span class="badge bg-white text-dark">' + (split.weekday || '-') + ' | Row ' + (split.google_row || '-') + '</span>';
            html += '</div>';
            html += '<small>Conflict Type: ' + (split.conflict_type || 'FULL') + ' | Dates: ' + (split.conflict_dates || []).join(', ') + '</small>';
            html += '</div>';
            html += '<div class="card-body p-0">';
            
            // Details table
            html += '<div class="table-responsive">';
            html += '<table class="table table-sm table-bordered mb-0" style="font-size: 0.85rem;">';
            html += '<thead class="table-light">';
            html += '<tr>';
            html += '<th style="width: 100px;">Action</th>';
            html += '<th style="width: 80px;">MIS ID</th>';
            html += '<th>Expected</th>';
            html += '<th>Actual (CSV)</th>';
            html += '<th style="width: 80px;">Status</th>';
            html += '<th>Issues / Suggestions</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            
            const details = split.details || [];
            details.forEach((entry, actionIdx) => {
                const rowClass = entry.status === 'CORRECT' ? 'table-success' : 
                                entry.status === 'MISSING_ID' ? 'table-warning' : 'table-danger';
                const statusIcon = entry.status === 'CORRECT' ? '<i class="bi bi-check-circle text-success"></i>' : 
                                  entry.status === 'MISSING_ID' ? '<i class="bi bi-question-circle text-warning"></i>' : 
                                  '<i class="bi bi-x-circle text-danger"></i>';
                
                html += '<tr class="' + rowClass + '">';
                // v10.8: Pass section info for dynamic labels
                const dealSection = split.section || 'weekly';
                const intSection = split.interrupting_deal_type || '';
                html += '<td><strong>' + formatActionLabel(entry.action, dealSection, intSection) + '</strong><br><small class="text-muted">' + (entry.expected_dates || '') + '</small></td>';
                
                // MIS ID - make clickable for browser automation
                html += '<td>';
                if (entry.mis_id) {
                    html += renderClickableMisId(entry.mis_id, entry);
                } else {
                    html += '<em class="text-muted">-</em>';
                }
                html += '</td>';
                
                html += '<td>' + formatExpectedAttrs(entry.expected) + '</td>';
                
                // Actual (CSV) - add tooltip with suggestions when available
                html += '<td>';
                if (entry.actual) {
                    html += formatActualAttrs(entry.actual);
                } else if (entry.status === 'MISSING_ID' && entry.suggestions && entry.suggestions.length > 0) {
                    // Show suggestions in tooltip like ID MATCHER
                    const tooltipContent = entry.suggestions.map(s => 
                        s.score + '%: ID ' + s.mis_id + ' - ' + (s.brand || '') + ' ' + (s.discount || '')
                    ).join('&#10;');
                    html += '<span class="badge bg-info" data-bs-toggle="tooltip" data-bs-html="true" title="' + tooltipContent + '" style="cursor:help;">?? Suggestions</span>';
                } else {
                    html += '<em class="text-muted">Not found</em>';
                }
                html += '</td>';
                
                html += '<td class="text-center">' + statusIcon + '</td>';
                html += '<td>';
                
                if (entry.issues && entry.issues.length > 0) {
                    html += '<ul class="mb-0 ps-3 small text-danger">';
                    entry.issues.forEach(issue => {
                        html += '<li>' + escapeHtml(issue) + '</li>';
                    });
                    html += '</ul>';
                }
                
                if (entry.status === 'MISSING_ID' && entry.suggestions && entry.suggestions.length > 0) {
                    html += '<div class="mt-2">';
                    html += '<strong class="small">Suggestions:</strong>';
                    html += '<div class="d-flex flex-column gap-1 mt-1">';
                    entry.suggestions.forEach((sug, sugIdx) => {
                        const sugKey = splitIdx + '_' + actionIdx + '_' + sugIdx;
                        const confClass = sug.score >= 80 ? 'bg-success' : sug.score >= 60 ? 'bg-warning text-dark' : 'bg-secondary';
                        html += '<div class="d-flex align-items-center gap-2">';
                        html += '<span class="badge ' + confClass + '">' + sug.score + '%</span>';
                        html += '<span class="small">' + renderClickableMisId(sug.mis_id, sug) + ' - ' + (sug.brand || '') + ' ' + (sug.discount || '') + '</span>';
                        html += '<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="selectPhase2Suggestion(' + splitIdx + ', ' + actionIdx + ', \'' + sug.mis_id + '\')">Select</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<div class="mt-2" id="phase2-approve-' + splitIdx + '-' + actionIdx + '" style="display:none;">';
                    html += '<input type="text" class="form-control form-control-sm mb-1" id="phase2-selected-id-' + splitIdx + '-' + actionIdx + '" placeholder="Selected MIS ID">';
                    html += '<button class="btn btn-success btn-sm" onclick="approvePhase2Suggestion(' + splitIdx + ', ' + actionIdx + ', ' + split.google_row + ')"><i class="bi bi-check"></i> Approve & Apply</button>';
                    html += '</div>';
                    html += '</div>';
                }
                
                html += '</td>';
                html += '</tr>';
            });
            
            html += '</tbody>';
            html += '</table>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
        });
    }
    
    // No Conflict deals (collapsible)
    if (noConflict.length > 0) {
        html += '<details class="mt-4">';
        html += '<summary class="h5" style="cursor: pointer;"><i class="bi bi-check-all text-success"></i> No Conflict Deals (' + noConflict.length + ')</summary>';
        html += '<div class="table-responsive mt-2">';
        html += '<table class="table table-sm table-striped">';
        html += '<thead><tr><th>Row</th><th>Brand</th><th>Weekday</th><th>Discount</th><th>Locations</th><th>MIS ID</th></tr></thead>';
        html += '<tbody>';
        noConflict.forEach(deal => {
            html += '<tr>';
            html += '<td>' + (deal.google_row || '-') + '</td>';
            html += '<td>' + (deal.brand || '-') + '</td>';
            html += '<td>' + (deal.weekday || '-') + '</td>';
            html += '<td>' + (deal.discount || '-') + '</td>';
            html += '<td>' + (deal.locations || '-') + '</td>';
            html += '<td>' + (deal.mis_id || '-') + '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        html += '</div>';
        html += '</details>';
    }
    
    if (results.length === 0 && noConflict.length === 0) {
        html += '<div class="alert alert-info"><i class="bi bi-info-circle"></i> No deals to verify. Run Phase 1 first to identify splits.</div>';
    }
    
    container.innerHTML = html;
    
    // Initialize Bootstrap tooltips for suggestion hovers
    if (typeof bootstrap !== 'undefined') {
        const tooltipTriggerList = container.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
    }
}

// v10.8: Format action labels based on section and action type
function formatActionLabel(action, section, interruptingSection) {
    // section: 'weekly', 'monthly', 'sale' - the deal being split
    // interruptingSection: 'monthly', 'sale' - what's causing the interruption (for GAP)
    section = section || 'weekly';
    
    const sectionNames = {
        'weekly': 'Weekly',
        'monthly': 'Monthly',
        'sale': 'Sale'
    };
    
    const sectionName = sectionNames[section.toLowerCase()] || 'Weekly';
    const intName = interruptingSection ? (sectionNames[interruptingSection.toLowerCase()] || interruptingSection) : '';
    
    if (action === 'CREATE_PART1' || action === 'ORIGINAL') {
        return sectionName + ' (Original)';
    } else if (action === 'CREATE_PART2' || action === 'CONTINUATION') {
        return sectionName + ' (Cont.)';
    } else if (action === 'GAP' || action === 'INTERRUPTING') {
        return intName || 'Interrupting Deal';
    } else if (action === 'PATCH') {
        return sectionName + ' (Patch)';
    }
    
    return action;
}

function formatExpectedAttrs(expected) {
    if (!expected) return '<em class="text-muted">-</em>';
    let parts = [];
    if (expected.discount) parts.push('Disc: ' + expected.discount);
    if (expected.vendor_pct) parts.push('Vendor: ' + expected.vendor_pct);
    if (expected.locations) parts.push('Loc: ' + expected.locations.substring(0, 30) + (expected.locations.length > 30 ? '...' : ''));
    return parts.length > 0 ? '<small>' + parts.join('<br>') + '</small>' : '<em class="text-muted">-</em>';
}

function formatActualAttrs(actual) {
    if (!actual) return '<em class="text-muted">Not Found</em>';
    let parts = [];
    if (actual.discount) parts.push('Disc: ' + actual.discount);
    if (actual.vendor_pct) parts.push('Vendor: ' + actual.vendor_pct);
    if (actual.locations) parts.push('Loc: ' + actual.locations.substring(0, 30) + (actual.locations.length > 30 ? '...' : ''));
    if (actual.start_date && actual.end_date) parts.push('Dates: ' + actual.start_date + ' - ' + actual.end_date);
    return parts.length > 0 ? '<small>' + parts.join('<br>') + '</small>' : '<em class="text-muted">-</em>';
}

function selectPhase2Suggestion(splitIdx, actionIdx, misId) {
    // Show the approve section and fill in the selected ID
    const approveDiv = document.getElementById('phase2-approve-' + splitIdx + '-' + actionIdx);
    const inputEl = document.getElementById('phase2-selected-id-' + splitIdx + '-' + actionIdx);
    
    if (approveDiv) approveDiv.style.display = 'block';
    if (inputEl) {
        inputEl.value = misId;
        inputEl.style.backgroundColor = '#d4edda';
    }
}

async function approvePhase2Suggestion(splitIdx, actionIdx, googleRow) {
    const inputEl = document.getElementById('phase2-selected-id-' + splitIdx + '-' + actionIdx);
    if (!inputEl || !inputEl.value.trim()) {
        alert('Please select or enter a MIS ID first.');
        return;
    }
    
    const misId = inputEl.value.trim();
    
    // Determine the prefix based on action type - ask user
    const actionType = prompt('What type of entry is this?\nEnter: gap, patch, part1, or part2', 'part2');
    if (!actionType) return;
    
    let prefix = '';
    if (actionType.toLowerCase() === 'gap') {
        prefix = 'Gap: ';
    } else if (actionType.toLowerCase() === 'patch') {
        prefix = 'Patch: ';
    }
    
    const finalValue = prefix + misId;
    
    try {
        const response = await api.matcher.applySplitId({
                google_row: googleRow,
                new_mis_id: finalValue,
                append: true
            });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Applied MIS ID to row ' + googleRow + ': ' + data.new_value);
            inputEl.style.backgroundColor = '#c3e6cb';
            inputEl.disabled = true;
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// END PHASE 2 FINAL VERIFICATION FUNCTIONS
// ============================================

async function searchMisBrand(brandName) {
    closeBrandPopup();
    const originalTitle = document.title;
    document.title = "Searching: " + brandName;
    try {
        await api.audit.searchBrand({ brand: brandName });
    } catch (e) { 
        alert('Search Error: ' + e.message); 
    } finally { 
        setTimeout(() => document.title = originalTitle, 2000); 
    }
}

function toggleBrandPopup(event, brandsStr) {
    event.stopPropagation();
    const popup = document.getElementById('brand-sticky-popup');
    const listContainer = document.getElementById('brand-popup-list');
    
    if (popup.style.display === 'block' && popup.dataset.trigger === event.target.id) {
        closeBrandPopup(); 
        return;
    }

    const brands = brandsStr.split(',').map(b => b.trim()).filter(b => b);
    listContainer.innerHTML = '';
    brands.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'brand-select-btn';
        btn.innerText = b;
        btn.onclick = () => searchMisBrand(b);
        listContainer.appendChild(btn);
    });

    const rect = event.target.getBoundingClientRect();
    popup.style.top = (window.scrollY + rect.bottom + 5) + 'px';
    popup.style.left = (window.scrollX + rect.left) + 'px';
    popup.style.display = 'block';
    popup.dataset.trigger = event.target.id;
}

function closeBrandPopup() {
    document.getElementById('brand-sticky-popup').style.display = 'none';
}

function renderBrandCell(brandStr, rowIdx, prefix = '') {
    if (!brandStr) return '<span style="color:#999;">-</span>';
    
    const brandList = brandStr.split(',').map(s => s.trim()).filter(s => s);
    const uniqueId = `${prefix}-brand-${rowIdx}`;
    
    if (brandList.length > 1) {
        return `<div id="${uniqueId}" class="brand-multi" onclick="toggleBrandPopup(event, '${brandStr.replace(/'/g, "&apos;")}')">${brandList[0]}...</div>`;
    } else {
        return `<span class="brand-single" onclick="searchMisBrand('${brandStr.replace(/'/g, "&apos;")}')">${brandStr}</span>`;
    }
}

// v12.1: Navigate to specific row in Google Sheet
function goToSheetRow(rowNum) {
    // Use the globally stored spreadsheet ID
    // This is set when /api/mis/load-sheet returns the spreadsheet_id
    const spreadsheetId = window.globalSpreadsheetId || '';
    if (!spreadsheetId) {
        alert('Spreadsheet ID not available. Please load the sheet first.');
        return;
    }
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0&range=A${rowNum}`;
    window.open(url, '_blank');
}

// v12.2: Global helper - Parse month/year from tab name (e.g., "January 2026")
function parseTabMonthYear(tabName) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const parts = (tabName || '').toLowerCase().trim().split(/\s+/);
    let month = -1, year = -1;
    for (const p of parts) {
        const mIdx = months.indexOf(p);
        if (mIdx >= 0) month = mIdx;
        if (/^\d{4}$/.test(p)) year = parseInt(p);
    }
    return { month, year };
}

// v12.2: Global helper - Get last day of month (handles leap years)
function getLastDayOfMonth(year, month) {
    // month is 0-indexed (0=Jan, 11=Dec)
    return new Date(year, month + 1, 0).getDate();
}

async function lookupMisId(misId) {
    if (!misId || misId === '-') return;
    
    const originalTitle = document.title;
    document.title = "Looking up: " + misId;
    try {
        await api.audit.lookupMisId({ mis_id: misId });
    } catch (e) { 
        console.error('Lookup Error:', e); 
    } finally { 
        setTimeout(() => document.title = originalTitle, 2000); 
    }
}

async function lookupMisIdWithValidation(buttonElement, misId) {
    /**
     * Enhanced MIS ID lookup that includes row data for validation.
     * Extracts row data from button's data-row attribute and sends to backend.
     */
    if (!misId || misId === '-') return;
    
    const originalTitle = document.title;
    document.title = "Looking up: " + misId;
    
    try {
        // Try to get row data from button element
        let rowData = null;
        if (buttonElement && buttonElement.getAttribute) {
            try {
                const rowDataJson = buttonElement.getAttribute('data-row');
                if (rowDataJson) {
                    rowData = JSON.parse(rowDataJson);
                    console.log('[MIS ID LOOKUP] Row data found:', rowData);
                }
            } catch (e) {
                console.warn('[MIS ID LOOKUP] Could not parse row data:', e);
            }
        }
        
        // Send request with optional row data
        await api.audit.lookupMisId({ 
                mis_id: misId,
                row_data: rowData  // Will be null if not available
            });
        
        if (rowData) {
            console.log('[MIS ID LOOKUP] Validation will be applied');
        } else {
            console.log('[MIS ID LOOKUP] No validation (no row data)');
        }
        
    } catch (e) { 
        console.error('[MIS ID LOOKUP] Error:', e); 
    } finally { 
        setTimeout(() => document.title = originalTitle, 2000); 
    }
}

function renderMisIdCell(misIdStr, rowData) {
    if (!misIdStr || misIdStr === '-') {
        return '<span style="color:#999; font-style:italic;">No ID</span>';
    }
    
    // Helper to strip tag prefix (Part 1:, GAP:, Patch:, etc.)
    function stripTag(str) {
        if (!str) return '';
        str = String(str).trim();
        if (str.indexOf(':') !== -1) {
            return str.split(':').pop().trim();
        }
        return str;
    }
    
    // Handle both newline-separated (new format) and comma-separated (legacy)
    const rawStr = String(misIdStr);
    let ids = [];
    
    if (rawStr.indexOf('\n') !== -1) {
        // New tagged format with newlines
        ids = rawStr.split('\n').map(line => line.trim()).filter(line => line);
    } else {
        // Legacy comma-separated format
        ids = rawStr.split(',').map(id => id.trim()).filter(id => id);
    }
    
    if (ids.length === 0) {
        return '<span style="color:#999; font-style:italic;">No ID</span>';
    }
    
    // Prepare row data for validation (if provided)
    let rowDataJson = null;
    if (rowData) {
        const validationData = {
            brand: rowData.brand || '',
            linked_brand: rowData.linked_brand || '',
            weekday: rowData.weekday || '',
            categories: rowData.categories || '',
            discount: rowData.discount || '',
            vendor_contrib: rowData.vendor_contrib || rowData.vendor_percentage || '',
            locations: rowData.locations || 'All Locations',
            rebate_type: rowData.rebate_type || '',
            after_wholesale: rowData.after_wholesale || false
        };
        rowDataJson = JSON.stringify(validationData).replace(/"/g, '&quot;');
    }
    
    // Make each ID clickable
    const clickableIds = ids.map(id => {
        let cleanId = stripTag(id.replace(' (Estimated)', '').trim());
        const displayId = id; // Keep original format with tag and (Estimated) if present
        
        // Use enhanced validation if row data is available
        if (rowDataJson) {
            return `<span data-row='${rowDataJson}' 
                          onclick="lookupMisIdWithValidation(this, '${cleanId}')" 
                          style="cursor:pointer; font-weight:bold; text-decoration:underline; color:#667eea;" 
                          title="Click to lookup and validate in MIS">${displayId}</span>`;
        } else {
            // Fallback to old method without validation
            return `<span onclick="lookupMisIdWithValidation(this, '${cleanId}')" 
                          style="cursor:pointer; font-weight:bold; text-decoration:underline; color:#667eea;" 
                          title="Click to lookup in MIS (backend will search Google Sheet)">${displayId}</span>`;
        }
    });
    
    return clickableIds.join(', ');
}

async function openSheetRow(rowNum) {
    try {
        await api.sheet.openRow({ row: rowNum });
    } catch (e) { 
        console.error('Row Navigation Error:', e); 
    }
}

function renderRowButton(rowNum) {
    return `<button class="btn" style="padding:4px 8px; font-size:0.85em;" onclick="openSheetRow(${rowNum})">Row ${rowNum}</button>`;
}