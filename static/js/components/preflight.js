// static/js/components/preflight.js
// Enhanced Create Deal popup + Pre-flight validation UI
// Extracted from monolith v12.27 by Step 7

function showEndDateEditor(rowIdx, sIdx, misId, currentEndDate) {
    // Hide display, show editor
    const displayEl = document.getElementById(`end-date-display-${rowIdx}-${sIdx}`);
    const editorEl = document.getElementById(`end-date-editor-${rowIdx}-${sIdx}`);
    if (displayEl) displayEl.style.display = 'none';
    if (editorEl) editorEl.style.display = 'block';
    
    // Calculate default end date (last day of month from tab name)
    const defaultDate = calculateDefaultEndDate();
    
    // Populate dropdowns
    const monthSelect = document.getElementById(`end-month-${rowIdx}-${sIdx}`);
    const daySelect = document.getElementById(`end-day-${rowIdx}-${sIdx}`);
    const yearSelect = document.getElementById(`end-year-${rowIdx}-${sIdx}`);
    
    // Populate year dropdown (current year and next 2 years)
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = currentYear; y <= currentYear + 2; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }
    
    // Set default values
    if (defaultDate) {
        monthSelect.value = defaultDate.month;
        yearSelect.value = defaultDate.year;
        updateDayDropdown(rowIdx, sIdx);
        daySelect.value = defaultDate.day;
    } else {
        // Fallback: try to parse current end date
        const parsed = parseEndDateString(currentEndDate);
        if (parsed) {
            monthSelect.value = parsed.month;
            yearSelect.value = parsed.year;
            updateDayDropdown(rowIdx, sIdx);
            daySelect.value = parsed.day;
        } else {
            updateDayDropdown(rowIdx, sIdx);
        }
    }
    
    // Add change listeners to update day dropdown when month/year changes
    monthSelect.onchange = () => updateDayDropdown(rowIdx, sIdx);
    yearSelect.onchange = () => updateDayDropdown(rowIdx, sIdx);
}

function cancelEndDateEditor(rowIdx, sIdx) {
    const displayEl = document.getElementById(`end-date-display-${rowIdx}-${sIdx}`);
    const editorEl = document.getElementById(`end-date-editor-${rowIdx}-${sIdx}`);
    if (displayEl) displayEl.style.display = 'block';
    if (editorEl) editorEl.style.display = 'none';
}

function updateDayDropdown(rowIdx, sIdx) {
    const monthSelect = document.getElementById(`end-month-${rowIdx}-${sIdx}`);
    const daySelect = document.getElementById(`end-day-${rowIdx}-${sIdx}`);
    const yearSelect = document.getElementById(`end-year-${rowIdx}-${sIdx}`);
    
    if (!monthSelect || !daySelect || !yearSelect) return;
    
    const month = parseInt(monthSelect.value);
    const year = parseInt(yearSelect.value);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const currentDay = daySelect.value;
    daySelect.innerHTML = '';
    
    for (let d = 1; d <= daysInMonth; d++) {
        const opt = document.createElement('option');
        opt.value = String(d).padStart(2, '0');
        opt.textContent = d;
        daySelect.appendChild(opt);
    }
    
    // Try to restore previous selection or default to last day
    if (currentDay && parseInt(currentDay) <= daysInMonth) {
        daySelect.value = currentDay;
    } else {
        daySelect.value = String(daysInMonth).padStart(2, '0');
    }
}

function calculateDefaultEndDate() {
    // Get tab name and calculate last day of that month
    const currentTabName = document.getElementById('mis-tab')?.value || '';
    if (!currentTabName) return null;
    
    // Parse tab name for month/year (reuse logic from checkContinueEligibility)
    const tabInfo = parseTabMonthYear(currentTabName);
    if (tabInfo.month < 0 || tabInfo.year < 0) return null;
    
    // Calculate last day of month
    const lastDay = getLastDayOfMonth(tabInfo.year, tabInfo.month);
    
    return {
        month: String(tabInfo.month + 1).padStart(2, '0'), // Convert 0-indexed to 1-indexed
        day: String(lastDay).padStart(2, '0'),
        year: String(tabInfo.year)
    };
}

function parseEndDateString(dateStr) {
    if (!dateStr || dateStr === '-' || dateStr === 'N/A') return null;
    
    // Try MM/DD/YYYY or MM/DD/YY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        let year = parts[2];
        if (year.length === 2) {
            year = '20' + year;
        }
        return {
            month: parts[0].padStart(2, '0'),
            day: parts[1].padStart(2, '0'),
            year: year
        };
    }
    return null;
}

// v12.22.3: Fixed updateMisEndDate to use working automateEndDate endpoint
async function updateMisEndDate(rowIdx, sIdx, misId) {
    const monthSelect = document.getElementById(`end-month-${rowIdx}-${sIdx}`);
    const daySelect = document.getElementById(`end-day-${rowIdx}-${sIdx}`);
    const yearSelect = document.getElementById(`end-year-${rowIdx}-${sIdx}`);
    
    if (!monthSelect || !daySelect || !yearSelect) {
        alert('Date selectors not found');
        return;
    }
    
    const month = monthSelect.value;
    const day = daySelect.value;
    const year = yearSelect.value; // Full year for working endpoint
    
    // Format as MM/DD/YYYY for the working endpoint
    const newEndDate = `${month}/${day}/${year}`;
    
    console.log('[UPDATE-END-DATE] Starting with date:', newEndDate, 'MIS ID:', misId);
    
    // Get googleRow from matchesData if available
    const match = matchesData[rowIdx];
    const googleRow = match ? match.google_row : null;
    
    // Show loading overlay (same style as working automateEndDate)
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'automate-loading';
    loadingOverlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:10003; display:flex; justify-content:center; align-items:center; flex-direction:column;';
    loadingOverlay.innerHTML = '<div class="spinner-border text-light" style="width:3rem; height:3rem;"></div><div style="color:white; margin-top:15px; font-size:1.2em;">Updating End Date in MIS...</div><div id="automate-status" style="color:#aaa; margin-top:10px; font-size:0.9em;">Opening MIS entry ' + misId + '...</div>';
    document.body.appendChild(loadingOverlay);
    
    try {
        // Use the WORKING endpoint from automateEndDate
        const response = await api.automation.autoEndDate({
                mis_id: misId,
                new_end_date: newEndDate,
                google_row: googleRow,
                split_idx: null,  // Not from splits, from suggestions
                step_idx: null
            });
        
        const data = await response.json();
        document.getElementById('automate-loading')?.remove();
        
        if (data.success) {
            // Update the display in the Suggestions popup
            const displayEl = document.getElementById(`end-date-display-${rowIdx}-${sIdx}`);
            if (displayEl) {
                displayEl.innerHTML = `<span style="color:#155724; font-weight:bold;">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ ${newEndDate}</span>`;
            }
            
            // Hide the editor
            const editorEl = document.getElementById(`end-date-editor-${rowIdx}-${sIdx}`);
            if (editorEl) {
                editorEl.style.display = 'none';
            }
            
            alert('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ End Date updated to ' + newEndDate + '\\n\\nPlease review and click Save in MIS if everything looks correct.\\n\\nValidation is active - check the banner for any warnings.');
        } else {
            alert('Error updating end date: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        document.getElementById('automate-loading')?.remove();
        alert('Error: ' + error.message);
    }
}

// ============================================
// v12.3: CREATE DEAL IN MIS - Functions
// ============================================

// v12.21: Adapter function for ID Matcher ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ Unified Pre-Flight
async function useUnifiedPreFlightForIDMatcher(rowIdx) {
    const match = matchesData[rowIdx];
    if (!match) {
        alert('Error: Could not find row data');
        return;
    }
    
    // Load settings dropdown data
    await loadSettingsDropdownData();
    
    // Extract values from match
    const brand = match.brand || '';
    const linkedBrand = match.linked_brand || settingsCache.brandLinkedMap[brand.toLowerCase()] || '';
    
    // v12.21.4.1: DEBUG - Log linked brand resolution
    console.log('[LINKED-BRAND-DEBUG] Brand:', brand);
    console.log('[LINKED-BRAND-DEBUG] match.linked_brand:', match.linked_brand);
    console.log('[LINKED-BRAND-DEBUG] settingsCache.brandLinkedMap:', settingsCache.brandLinkedMap);
    console.log('[LINKED-BRAND-DEBUG] Lookup result for brand.toLowerCase():', settingsCache.brandLinkedMap[brand.toLowerCase()]);
    console.log('[LINKED-BRAND-DEBUG] Final linkedBrand:', linkedBrand);
    
    // v12.22: Handle multi-day groups - collect ALL weekdays from group
    // If this row is part of a multi-day group, the Pre-Flight popup should show
    // all weekdays (e.g., "Monday, Wednesday, Friday") instead of just this row's weekday
    let weekday = match.weekday || '';
    if (match.multi_day_group && match.multi_day_group.weekdays) {
        const weekdaysList = match.multi_day_group.weekdays.filter(w => w && !w.toLowerCase().includes('missing'));
        if (weekdaysList.length > 0) {
            weekday = weekdaysList.join(', ');
            console.log('[MULTI-DAY-FIX] Group detected! group_id:', match.multi_day_group.group_id);
            console.log('[MULTI-DAY-FIX] All weekdays in group:', weekdaysList);
            console.log('[MULTI-DAY-FIX] Combined weekday string:', weekday);
        }
    } else {
        console.log('[MULTI-DAY-FIX] Single-day deal, weekday:', weekday);
    }
    
    const categories = match.categories || '';
    const locations = match.locations || '';
    // v12.26.4: Use ?? (nullish coalescing) â€” 0 is valid, only null/undefined â†’ ''
    const discount = String(match.discount ?? '').replace('%', '');
    const vendorContrib = String(match.vendor_contrib ?? '').replace('%', '');
    
    // Determine Rebate Type from checkboxes
    // v12.21.3: Check both 'Wholesale?' and 'Wholesale' (with and without ?)
    let rebateType = '';
    const retailVal = String(
        match.retail || 
        match.raw_row_data?.['Retail?'] ||  // Google Sheet column name with ?
        match.raw_row_data?.['Retail'] ||   // Fallback without ?
        ''
    ).toUpperCase();
    const wholesaleVal = String(
        match.wholesale || 
        match.raw_row_data?.['Wholesale?'] ||  // Google Sheet column name with ?
        match.raw_row_data?.['Wholesale'] ||   // Fallback without ?
        ''
    ).toUpperCase();
    if (wholesaleVal === 'TRUE') rebateType = 'Wholesale';
    else if (retailVal === 'TRUE') rebateType = 'Retail';
    
    console.log('[REBATE-TYPE-DEBUG] retailVal:', retailVal, ', wholesaleVal:', wholesaleVal, ', result:', rebateType);
    
    // Determine After Wholesale
    const afterWholesaleVal = String(match.after_wholesale || match.raw_row_data?.['After Wholesale Discount'] || '').toUpperCase();
    const afterWholesale = afterWholesaleVal === 'TRUE';
    
    // v12.22.1: Smart Date Auto-Fill for Weekly Deals
    // For Weekly deals: Start = 1st of month, End = last day of month
    // Month/Year derived from tab name (e.g., "January 2026") or fallback to current month
    let startDate = '';
    let endDate = '';
    const sectionType = match.section_type || 'weekly';
    
    if (sectionType === 'weekly') {
        // Try to parse month/year from tab name
        const tabName = document.getElementById('mis-tab')?.value || '';
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                           'july', 'august', 'september', 'october', 'november', 'december'];
        
        let targetMonth = -1;
        let targetYear = -1;
        
        // Parse tab name like "January 2026" or "Feb 2026"
        const tabMatch = tabName.match(/([a-zA-Z]+)\s*(\d{4})/);
        if (tabMatch) {
            const monthStr = tabMatch[1].toLowerCase();
            const yearStr = tabMatch[2];
            
            // Find month index (supports full names and 3-letter abbreviations)
            targetMonth = monthNames.findIndex(m => m.startsWith(monthStr.substring(0, 3)));
            targetYear = parseInt(yearStr);
            
            console.log('[WEEKLY-DATE-FIX] Parsed tab name:', tabName, '-> Month:', targetMonth, ', Year:', targetYear);
        }
        
        // Fallback to current date if parsing failed
        if (targetMonth < 0 || targetYear < 0 || isNaN(targetYear)) {
            const now = new Date();
            targetMonth = now.getMonth();
            targetYear = now.getFullYear();
            console.log('[WEEKLY-DATE-FIX] Fallback to current month:', targetMonth, ', Year:', targetYear);
        }
        
        // Calculate first and last day of month
        const firstDay = 1;
        const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate(); // Day 0 of next month = last day of current month
        
        // Format as MM/DD/YYYY
        const monthNum = String(targetMonth + 1).padStart(2, '0');
        startDate = `${monthNum}/01/${targetYear}`;
        endDate = `${monthNum}/${String(lastDay).padStart(2, '0')}/${targetYear}`;
        
        console.log('[WEEKLY-DATE-FIX] Auto-filled dates for Weekly deal:');
        console.log('  Start Date:', startDate, '(1st of month)');
        console.log('  End Date:', endDate, '(last day of month)');
    } else {
        // Non-weekly deals: Parse dates from date_raw as before
        const dateRaw = match.date_raw || '';
        if (dateRaw) {
            const rangeMatch = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-\u2013\u2014]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (rangeMatch) {
                startDate = rangeMatch[1] + '/' + rangeMatch[2] + '/' + (rangeMatch[3].length === 2 ? '20' + rangeMatch[3] : rangeMatch[3]);
                endDate = rangeMatch[4] + '/' + rangeMatch[5] + '/' + (rangeMatch[6].length === 2 ? '20' + rangeMatch[6] : rangeMatch[6]);
            } else {
                const singleMatch = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
                if (singleMatch) {
                    startDate = singleMatch[1] + '/' + singleMatch[2] + '/' + (singleMatch[3].length === 2 ? '20' + singleMatch[3] : singleMatch[3]);
                    endDate = startDate;
                }
            }
        }
        console.log('[DATE-PARSE] Non-weekly deal, parsed from date_raw:', startDate, '-', endDate);
    }
    
    // Build preFlightData object
    const preFlightData = {
        brand: brand,
        linked_brand: linkedBrand,
        weekday: weekday,
        categories: categories,
        locations: locations,
        discount: discount,
        vendor_contrib: vendorContrib,
        rebate_type: rebateType,
        after_wholesale: afterWholesale,
        start_date: startDate,
        end_date: endDate
    };
    
    console.log('[ID-MATCHER ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ PRE-FLIGHT] Converted data:', preFlightData);
    
    // Call unified Pre-Flight popup
    openUnifiedPreFlight(preFlightData, match.google_row, match.section_type || 'weekly', null, null);
}

async function showCreateDealPopup(rowIdx, context = 'id-matcher') {
    // v12.17: Enhanced Create Deal Popup with all fields
    const match = matchesData[rowIdx];
    if (!match) {
        alert('Error: Could not find row data');
        return;
    }
    
    // Load settings dropdown data
    await loadSettingsDropdownData();
    
    // Remove any existing popup
    const existingPopup = document.getElementById('create-deal-popup-overlay');
    if (existingPopup) existingPopup.remove();
    
    // Calculate default dates
    const defaultDate = calculateDefaultEndDate();
    const today = new Date();
    const todayStr = {
        month: String(today.getMonth() + 1).padStart(2, '0'),
        day: String(today.getDate()).padStart(2, '0'),
        year: String(today.getFullYear())
    };
    
    // v12.17: Parse date_raw for Sale section auto-fill
    let parsedStartDate = null;
    let parsedEndDate = null;
    const dateRaw = match.date_raw || '';
    if (dateRaw) {
        const rangeMatch = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (rangeMatch) {
            parsedStartDate = {
                month: rangeMatch[1].padStart(2, '0'),
                day: rangeMatch[2].padStart(2, '0'),
                year: rangeMatch[3].length === 2 ? '20' + rangeMatch[3] : rangeMatch[3]
            };
            parsedEndDate = {
                month: rangeMatch[4].padStart(2, '0'),
                day: rangeMatch[5].padStart(2, '0'),
                year: rangeMatch[6].length === 2 ? '20' + rangeMatch[6] : rangeMatch[6]
            };
            console.log('[DATE-PARSE] Range:', dateRaw, '->', parsedStartDate, parsedEndDate);
        } else {
            const singleMatch = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (singleMatch) {
                parsedStartDate = {
                    month: singleMatch[1].padStart(2, '0'),
                    day: singleMatch[2].padStart(2, '0'),
                    year: singleMatch[3].length === 2 ? '20' + singleMatch[3] : singleMatch[3]
                };
            }
        }
    }
    
    // Popup title based on context
    let popupTitle = 'Create New Deal in MIS';
    let titleColor = '#28a745';
    if (context === 'phase1-gap') {
        popupTitle = 'GAP/Interrupt Deal';
        titleColor = '#ffc107';
    } else if (context === 'phase1-continue') {
        popupTitle = 'Continue Deal';
        titleColor = '#007bff';
    }
    
    // Extract values
    const brand = match.brand || '';
    const linkedBrand = match.linked_brand || settingsCache.brandLinkedMap[brand.toLowerCase()] || '';
    const weekday = match.weekday || '';
    const categories = match.categories || '';
    const locations = match.locations || '';
    const discount = match.discount || '';
    const vendorContrib = match.vendor_contrib || '';
    const dealInfo = match.deal_info || '';
    const specialNotes = match.special_notes || '';
    const minWeight = match.min_weight || match.raw_row_data?.['Min Weight'] || '';
    const maxWeight = match.max_weight || match.raw_row_data?.['Max Weight'] || '';
    
    // Determine Rebate Type from checkboxes
    let rebateType = '';
    const retailVal = String(match.retail || match.raw_row_data?.['Retail'] || '').toUpperCase();
    const wholesaleVal = String(match.wholesale || match.raw_row_data?.['Wholesale'] || '').toUpperCase();
    if (wholesaleVal === 'TRUE') rebateType = 'Wholesale';
    else if (retailVal === 'TRUE') rebateType = 'Retail';
    
    // Determine After Wholesale
    const afterWholesaleVal = String(match.after_wholesale || match.raw_row_data?.['After Wholesale Discount'] || '').toUpperCase();
    const afterWholesale = afterWholesaleVal === 'TRUE' ? 'Yes' : 'No';
    
    // Build stores dropdown options
    let storesOptions = '';
    settingsCache.stores.forEach(store => {
        storesOptions += `<option value="${store}">${store}</option>`;
    });
    
    // Build categories dropdown options
    let categoriesOptions = '';
    settingsCache.categories.forEach(cat => {
        categoriesOptions += `<option value="${cat}">${cat}</option>`;
    });
    
    // Build linked brand dropdown options
    let linkedBrandOptions = '<option value="">-- Select --</option>';
    const uniqueLinkedBrands = [...new Set(Object.values(settingsCache.brandLinkedMap).filter(v => v))];
    uniqueLinkedBrands.sort().forEach(lb => {
        const selected = lb.toLowerCase() === linkedBrand.toLowerCase() ? 'selected' : '';
        linkedBrandOptions += `<option value="${lb}" ${selected}>${lb}</option>`;
    });
    
    // Build popup HTML
    const overlay = document.createElement('div');
    overlay.id = 'create-deal-popup-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:10002; display:flex; justify-content:center; align-items:center;';
    
    const popup = document.createElement('div');
    popup.style.cssText = 'background:white; border-radius:10px; padding:25px; max-width:700px; width:95%; max-height:90vh; overflow-y:auto; box-shadow:0 10px 40px rgba(0,0,0,0.3);';
    
    popup.innerHTML = `
        <h5 style="margin-bottom:15px; color:${titleColor}; border-bottom:2px solid ${titleColor}; padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <span><i class="bi bi-plus-circle"></i> ${popupTitle}</span>
            <button class="btn btn-sm btn-outline-secondary" onclick="loadSettingsDropdownData(true).then(() => alert('Settings refreshed!'))" title="Refresh Settings">🔄</button>
        </h5>
        
        <div class="alert alert-secondary" style="font-size:0.85em; padding:10px;">
            <strong>Brand:</strong> ${brand} | <strong>Row:</strong> ${match.google_row} | <strong>Deal:</strong> ${dealInfo || '-'}
            ${specialNotes ? '<br><strong>Notes:</strong> ' + specialNotes : ''}
        </div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
            <!-- Left Column -->
            <div>
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Linked Brand:</label>
                    <select id="create-linked-brand" class="form-select form-select-sm">${linkedBrandOptions}</select>
                </div>
                
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Rebate Type: <span style="color:red;">*</span></label>
                    <select id="create-rebate-type" class="form-select form-select-sm" required>
                        <option value="">-- Select --</option>
                        <option value="Retail" ${rebateType === 'Retail' ? 'selected' : ''}>Retail</option>
                        <option value="Wholesale" ${rebateType === 'Wholesale' ? 'selected' : ''}>Wholesale</option>
                    </select>
                </div>
                
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Weekday:</label>
                    <select id="create-weekday" class="form-select form-select-sm" multiple size="3">
                        <option value="Monday">Monday</option>
                        <option value="Tuesday">Tuesday</option>
                        <option value="Wednesday">Wednesday</option>
                        <option value="Thursday">Thursday</option>
                        <option value="Friday">Friday</option>
                        <option value="Saturday">Saturday</option>
                        <option value="Sunday">Sunday</option>
                    </select>
                </div>
                
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Rebate After Wholesale:</label>
                    <select id="create-after-wholesale" class="form-select form-select-sm">
                        <option value="No" ${afterWholesale === 'No' ? 'selected' : ''}>No</option>
                        <option value="Yes" ${afterWholesale === 'Yes' ? 'selected' : ''}>Yes</option>
                    </select>
                </div>
                
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Discount %:</label>
                    <input type="text" id="create-discount" class="form-control form-control-sm" value="${discount}">
                </div>
                
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Vendor %:</label>
                    <input type="text" id="create-vendor" class="form-control form-control-sm" value="${vendorContrib}">
                </div>
            </div>
            
            <!-- Right Column -->
            <div>
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Min Weight:</label>
                    <input type="text" id="create-min-weight" class="form-control form-control-sm" value="${minWeight}">
                </div>
                
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Max Weight:</label>
                    <input type="text" id="create-max-weight" class="form-control form-control-sm" value="${maxWeight}">
                </div>
                
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Category:</label>
                    <select id="create-category" class="form-select form-select-sm" multiple size="3">${categoriesOptions}</select>
                </div>
                
                <div class="mb-2">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Locations Mode:</label>
                    <select id="create-location-mode" class="form-select form-select-sm" onchange="toggleLocationExceptions()">
                        <option value="ALL_LOCATIONS">All Locations</option>
                        <option value="ALL_EXCEPT">All Locations Except...</option>
                        <option value="SPECIFIC">Specific Locations...</option>
                    </select>
                </div>
                
                <div class="mb-2" id="location-select-container" style="display:none;">
                    <label class="form-label fw-bold" style="font-size:0.85em;">Select Stores:</label>
                    <select id="create-locations" class="form-select form-select-sm" multiple size="4">${storesOptions}</select>
                    <small id="location-help" class="text-muted"></small>
                </div>
            </div>
        </div>
        
        <!-- Date Row -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px; padding-top:15px; border-top:1px solid #dee2e6;">
            <div>
                <label class="form-label fw-bold" style="font-size:0.85em;">Start Date:</label>
                <div style="display:flex; gap:5px;">
                    <select id="create-start-month" class="form-select form-select-sm" style="width:70px;">
                        <option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option>
                        <option value="04">Apr</option><option value="05">May</option><option value="06">Jun</option>
                        <option value="07">Jul</option><option value="08">Aug</option><option value="09">Sep</option>
                        <option value="10">Oct</option><option value="11">Nov</option><option value="12">Dec</option>
                    </select>
                    <select id="create-start-day" class="form-select form-select-sm" style="width:60px;"></select>
                    <select id="create-start-year" class="form-select form-select-sm" style="width:80px;"></select>
                </div>
            </div>
            <div>
                <label class="form-label fw-bold" style="font-size:0.85em;">End Date:</label>
                <div style="display:flex; gap:5px;">
                    <select id="create-end-month" class="form-select form-select-sm" style="width:70px;">
                        <option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option>
                        <option value="04">Apr</option><option value="05">May</option><option value="06">Jun</option>
                        <option value="07">Jul</option><option value="08">Aug</option><option value="09">Sep</option>
                        <option value="10">Oct</option><option value="11">Nov</option><option value="12">Dec</option>
                    </select>
                    <select id="create-end-day" class="form-select form-select-sm" style="width:60px;"></select>
                    <select id="create-end-year" class="form-select form-select-sm" style="width:80px;"></select>
                </div>
            </div>
        </div>
        
        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px; padding-top:15px; border-top:1px solid #dee2e6;">
            <button class="btn btn-secondary" onclick="closeCreateDealPopup()">Cancel</button>
            <button class="btn btn-success" onclick="executeCreateDeal(${rowIdx})">
                <i class="bi bi-check-lg"></i> Confirm & Create
            </button>
        </div>
    `;
    
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    
    // Helper: Toggle location exceptions visibility
    window.toggleLocationExceptions = function() {
        const mode = document.getElementById('create-location-mode').value;
        const container = document.getElementById('location-select-container');
        const help = document.getElementById('location-help');
        
        if (mode === 'ALL_LOCATIONS') {
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
            help.textContent = mode === 'ALL_EXCEPT' ? 'Select stores to EXCLUDE' : 'Select specific stores';
        }
    };
    
    // Initialize location dropdown based on current value
    function initializeLocationDropdown(locValue) {
        const modeSelect = document.getElementById('create-location-mode');
        const locSelect = document.getElementById('create-locations');
        const locLower = (locValue || '').toLowerCase().trim();
        
        if (locLower === 'all locations' || locLower === '') {
            modeSelect.value = 'ALL_LOCATIONS';
        } else if (locLower.includes('all locations except') || locLower.includes('except')) {
            // v12.26.2: Detect "All Locations Except" ANYWHERE in string
            modeSelect.value = 'ALL_EXCEPT';
            const exceptMatch = locValue.match(/except[:\s]*(.+)/i);
            const exceptions = exceptMatch ? exceptMatch[1].trim() : '';
            const excList = exceptions.split(',').map(s => s.trim()).filter(s => s);
            Array.from(locSelect.options).forEach(opt => {
                if (excList.some(e => e.toLowerCase() === opt.value.toLowerCase())) {
                    opt.selected = true;
                }
            });
        } else {
            modeSelect.value = 'SPECIFIC';
            const storeList = locValue.split(',').map(s => s.trim());
            Array.from(locSelect.options).forEach(opt => {
                if (storeList.some(s => s.toLowerCase() === opt.value.toLowerCase())) {
                    opt.selected = true;
                }
            });
        }
        toggleLocationExceptions();
    }
    
    // Populate year dropdowns
    const currentYear = new Date().getFullYear();
    ['create-start-year', 'create-end-year'].forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = '';
        for (let y = currentYear; y <= currentYear + 2; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            select.appendChild(opt);
        }
    });
    
    // Set date values - use parsed dates if available
    if (parsedStartDate) {
        document.getElementById('create-start-month').value = parsedStartDate.month;
        document.getElementById('create-start-year').value = parsedStartDate.year;
        updateCreateDayDropdown('start');
        document.getElementById('create-start-day').value = parsedStartDate.day;
    } else {
        document.getElementById('create-start-month').value = todayStr.month;
        document.getElementById('create-start-year').value = todayStr.year;
        updateCreateDayDropdown('start');
        document.getElementById('create-start-day').value = todayStr.day;
    }
    
    if (parsedEndDate) {
        document.getElementById('create-end-month').value = parsedEndDate.month;
        document.getElementById('create-end-year').value = parsedEndDate.year;
        updateCreateDayDropdown('end');
        document.getElementById('create-end-day').value = parsedEndDate.day;
    } else if (defaultDate) {
        document.getElementById('create-end-month').value = defaultDate.month;
        document.getElementById('create-end-year').value = defaultDate.year;
        updateCreateDayDropdown('end');
        document.getElementById('create-end-day').value = defaultDate.day;
    } else {
        updateCreateDayDropdown('end');
    }
    
    // Pre-select weekdays
    if (weekday) {
        const weekdaySelect = document.getElementById('create-weekday');
        const weekdayParts = weekday.split(',').map(w => w.trim());
        Array.from(weekdaySelect.options).forEach(opt => {
            if (weekdayParts.some(w => opt.value.toLowerCase().includes(w.toLowerCase()))) {
                opt.selected = true;
            }
        });
    }
    
    // Pre-select categories
    if (categories) {
        const categorySelect = document.getElementById('create-category');
        const categoryParts = categories.split(',').map(c => c.trim());
        Array.from(categorySelect.options).forEach(opt => {
            if (categoryParts.some(c => opt.value.toLowerCase() === c.toLowerCase())) {
                opt.selected = true;
            }
        });
    }
    
    // Initialize locations
    initializeLocationDropdown(locations);
    
    // Add change listeners
    document.getElementById('create-start-month').onchange = () => updateCreateDayDropdown('start');
    document.getElementById('create-start-year').onchange = () => updateCreateDayDropdown('start');
    document.getElementById('create-end-month').onchange = () => updateCreateDayDropdown('end');
    document.getElementById('create-end-year').onchange = () => updateCreateDayDropdown('end');
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) closeCreateDealPopup();
    };
}

function closeCreateDealPopup() {
    const popup = document.getElementById('create-deal-popup-overlay');
    if (popup) popup.remove();
}

function updateCreateDayDropdown(type) {
    const monthSelect = document.getElementById(`create-${type}-month`);
    const daySelect = document.getElementById(`create-${type}-day`);
    const yearSelect = document.getElementById(`create-${type}-year`);
    
    if (!monthSelect || !daySelect || !yearSelect) return;
    
    const month = parseInt(monthSelect.value);
    const year = parseInt(yearSelect.value);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const currentDay = daySelect.value;
    daySelect.innerHTML = '';
    
    for (let d = 1; d <= daysInMonth; d++) {
        const opt = document.createElement('option');
        opt.value = String(d).padStart(2, '0');
        opt.textContent = d;
        daySelect.appendChild(opt);
    }
    
    // Restore or default to last day
    if (currentDay && parseInt(currentDay) <= daysInMonth) {
        daySelect.value = currentDay;
    } else if (type === 'end') {
        daySelect.value = String(daysInMonth).padStart(2, '0');
    }
}

async function executeCreateDeal(rowIdx) {
    const match = matchesData[rowIdx];
    if (!match) {
        alert('Error: Could not find row data');
        return;
    }
    
    // Get dates from popup
    const startMonth = document.getElementById('create-start-month').value;
    const startDay = document.getElementById('create-start-day').value;
    const startYear = document.getElementById('create-start-year').value.slice(-2);
    const endMonth = document.getElementById('create-end-month').value;
    const endDay = document.getElementById('create-end-day').value;
    const endYear = document.getElementById('create-end-year').value.slice(-2);
    
    const startDate = `${startMonth}/${startDay}/${startYear}`;
    const endDate = `${endMonth}/${endDay}/${endYear}`;
    
    // Get all form values
    const selectedWeekdays = Array.from(document.getElementById('create-weekday').selectedOptions).map(o => o.value).join(', ');
    const selectedCategories = Array.from(document.getElementById('create-category').selectedOptions).map(o => o.value).join(', ');
    const linkedBrand = document.getElementById('create-linked-brand').value;
    const rebateType = document.getElementById('create-rebate-type').value;
    const afterWholesale = document.getElementById('create-after-wholesale').value === 'Yes';
    const discount = document.getElementById('create-discount').value.trim();
    const vendorContrib = document.getElementById('create-vendor').value.trim();
    const minWeight = document.getElementById('create-min-weight').value.trim();
    const maxWeight = document.getElementById('create-max-weight').value.trim();
    
    // Locations handling
    const locationMode = document.getElementById('create-location-mode').value;
    let locations = '';
    if (locationMode === 'ALL_LOCATIONS') {
        locations = 'All Locations';
    } else {
        const selectedStores = Array.from(document.getElementById('create-locations').selectedOptions).map(o => o.value);
        if (locationMode === 'ALL_EXCEPT') {
            locations = 'All Locations Except: ' + selectedStores.join(', ');
        } else {
            locations = selectedStores.join(', ');
        }
    }
    
    // Validation
    if (!selectedWeekdays) { alert('Weekday is required!'); return; }
    if (!rebateType) { alert('Rebate Type is required!'); return; }
    
    // Close popup and show loading
    closeCreateDealPopup();
    
    // Show loading indicator
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'create-deal-loading';
    loadingOverlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:10003; display:flex; justify-content:center; align-items:center; flex-direction:column;';
    loadingOverlay.innerHTML = `
        <div class="spinner-border text-light" style="width:3rem; height:3rem;"></div>
        <div style="color:white; margin-top:15px; font-size:1.2em;">Creating deal in MIS...</div>
        <div id="create-deal-status" style="color:#aaa; margin-top:10px; font-size:0.9em;">Initializing...</div>
    `;
    document.body.appendChild(loadingOverlay);
    
    try {
        // v12.20: Use unified automate-create-deal endpoint (includes checklist injection)
        const sheetPayload = {
            brand: match.brand,
            linked_brand: linkedBrand,
            weekday: selectedWeekdays,
            categories: selectedCategories,
            locations: locations,
            discount: discount,
            vendor_contrib: vendorContrib,
            retail: rebateType === 'Retail' ? 'TRUE' : 'FALSE',
            wholesale: rebateType === 'Wholesale' ? 'TRUE' : 'FALSE',
            after_wholesale: afterWholesale ? 'TRUE' : 'FALSE',
            min_weight: minWeight,
            max_weight: maxWeight
        };
        
        const response = await api.automation.autoCreate()