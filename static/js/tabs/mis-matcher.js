// static/js/tabs/mis-matcher.js
// ID Matcher tab: CSV generation, match display, approve/reject, Create Deal popup
// Extracted from monolith v12.27 by Step 7

// ── CSV Generation ───────────────────────────────────────────────────────────
function switchDealTypeTab(containerId, dealType, btnElement) {
    // Find the parent container
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // v88: Special handling for match-results which uses unified table with filtering
    if (containerId === 'match-results') {
        // Just filter rows by section, don't hide containers
        filterMatchResultsBySection(dealType);
        
        // Update button active state
        container.querySelectorAll('.deal-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (btnElement) {
            btnElement.classList.add('active');
        }
        console.log(`[TAB] Filtered match-results to ${dealType}`);
        return;
    }
    
    // 1. Hide all deal-type-content sections within this container
    container.querySelectorAll('.deal-type-content').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });
    
    // 2. Deactivate all deal-type buttons within this container
    container.querySelectorAll('.deal-type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 3. Show the target content
    const targetContent = container.querySelector(`#${containerId}-${dealType}`);
    if (targetContent) {
        targetContent.style.display = 'block';
        targetContent.classList.add('active');
    }
    
    // 4. Activate the clicked button
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    console.log(`[TAB] Switched to ${dealType} in ${containerId}`);
}

// Helper to generate deal-type sub-tab HTML structure
function generateDealTypeTabsHTML(containerId, counts = {weekly: 0, monthly: 0, sale: 0}) {
    return `
        <div class="deal-type-tabs" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <button class="deal-type-btn" onclick="switchDealTypeTab('${containerId}', 'weekly', this)">
                &#x1F4C5; Weekly Deals <span class="badge bg-primary">${counts.weekly}</span>
            </button>
            <button class="deal-type-btn" onclick="switchDealTypeTab('${containerId}', 'monthly', this)">
                 Monthly Deals <span class="badge bg-info">${counts.monthly}</span>
            </button>
            <button class="deal-type-btn" onclick="switchDealTypeTab('${containerId}', 'sale', this)">
                 Sale Deals <span class="badge bg-warning text-dark">${counts.sale}</span>
            </button>
            <button class="deal-type-btn active" onclick="switchDealTypeTab('${containerId}', 'all', this)">
                 All Deals <span class="badge bg-secondary">${counts.weekly + counts.monthly + counts.sale}</span>
            </button>
            
            <div style="margin-left:auto; display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f8f9fa; border-radius:6px; border:1px solid #dee2e6;">
                <span style="font-size:0.85em; font-weight:500; color:#6c757d;">Weekly View:</span>
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn btn-outline-secondary" id="weekly-view-breakdown" onclick="toggleWeeklyView('breakdown')" style="font-size:0.85em; padding:4px 12px;">
                        Breakdown List
                    </button>
                    <button type="button" class="btn btn-outline-secondary" id="weekly-view-full" onclick="toggleWeeklyView('full')" style="font-size:0.85em; padding:4px 12px;">
                        Full List
                    </button>
                </div>
            </div>
        </div>
    `;
}

// v12.2: Weekly view mode tracker (default: breakdown)
let weeklyViewMode = 'breakdown';
let originalTableState = null; // Store original table HTML before breakdown modifies it

// v12.2: Toggle between Breakdown List and Full List for Weekly deals
function toggleWeeklyView(mode) {
    weeklyViewMode = mode;
    
    // Update button states
    const breakdownBtn = document.getElementById('weekly-view-breakdown');
    const fullBtn = document.getElementById('weekly-view-full');
    if (breakdownBtn) breakdownBtn.classList.toggle('active', mode === 'breakdown');
    if (fullBtn) fullBtn.classList.toggle('active', mode === 'full');
    
    console.log('[TOGGLE] Switching to:', mode);
    
    if (mode === 'full') {
        // RESTORE ORIGINAL TABLE STATE
        const table = document.getElementById('match-results-unified-table');
        if (table && originalTableState) {
            const tbody = table.querySelector('tbody');
            if (tbody) {
                console.log('[TOGGLE] Restoring original table state');
                tbody.innerHTML = originalTableState;
                
                // Re-apply section filter
                const activeBtn = document.querySelector('.deal-type-btn.active');
                if (activeBtn) {
                    const btnText = activeBtn.textContent.toLowerCase();
                    if (btnText.includes('weekly')) {
                        filterMatchResultsBySection('weekly');
                    } else if (btnText.includes('all')) {
                        filterMatchResultsBySection('all');
                    }
                }
            }
        }
    } else {
        // Re-trigger the current filter to rebuild breakdown view
        const activeBtn = document.querySelector('.deal-type-btn.active');
        if (activeBtn) {
            const btnText = activeBtn.textContent.toLowerCase();
            if (btnText.includes('weekly')) {
                filterMatchResultsBySection('weekly');
            } else if (btnText.includes('all')) {
                filterMatchResultsBySection('all');
            }
        }
    }
}

// v12.2: Insert weekday headers - works from LIVE visible rows in Full List
function insertWeekdayHeaders() {
    console.log('[BREAKDOWN] === STARTING BREAKDOWN LIST BUILD ===');
    
    const table = document.getElementById('match-results-unified-table');
    if (!table) {
        console.log('[BREAKDOWN] ERROR: Table not found');
        return;
    }
    
    const tbody = table.querySelector('tbody');
    if (!tbody) {
        console.log('[BREAKDOWN] ERROR: tbody not found');
        return;
    }
    
    // Get ALL currently visible rows from tbody
    const allVisibleRows = Array.from(tbody.querySelectorAll('tr[data-section="weekly"]'));
    console.log('[BREAKDOWN] Found', allVisibleRows.length, 'total weekly rows');
    
    if (allVisibleRows.length === 0) {
        console.log('[BREAKDOWN] No weekly rows found!');
        return;
    }
    
    // Find section header
    const sectionHeader = allVisibleRows.find(r => r.classList.contains('section-header-row'));
    if (!sectionHeader) {
        console.log('[BREAKDOWN] ERROR: No section header found');
        return;
    }
    
    // Get data rows (everything except section header)
    const dataRows = allVisibleRows.filter(r => !r.classList.contains('section-header-row'));
    console.log('[BREAKDOWN] Found', dataRows.length, 'data rows to organize');
    
    // STEP 1: Initialize Buckets
    const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const buckets = {};
    weekdayOrder.forEach(day => {
        buckets[day] = [];
    });
    
    // STEP 2: Sort rows into buckets
    const processedGroups = new Set();
    
    dataRows.forEach((row, idx) => {
        const isGroupMember = row.classList.contains('group-member-row');
        const isGroupHeader = row.classList.contains('group-header-row');
        
        console.log(`[BREAKDOWN] Row ${idx}: groupHeader=${isGroupHeader}, groupMember=${isGroupMember}`);
        
        // Skip group members - they'll be collected with their header
        if (isGroupMember) {
            console.log(`[BREAKDOWN]   Skipping group member`);
            return;
        }
        
        // Variables for processing
        let weekdayText = '';
        let groupId = null;
        let memberRows = [];
        
        if (isGroupHeader) {
            // GROUP HEADER: Extract groupId, find members, detect multi-day
            const toggleIcon = row.querySelector('[id^="toggle-"]');
            if (!toggleIcon) {
                console.log(`[BREAKDOWN]   ERROR: Group header has no toggle icon`);
                return;
            }
            
            groupId = toggleIcon.id.replace('toggle-', '');
            
            if (processedGroups.has(groupId)) {
                console.log(`[BREAKDOWN]   Already processed group ${groupId}`);
                return;
            }
            processedGroups.add(groupId);
            
            // Find all member rows for this group
            memberRows = dataRows.filter(r => r.classList.contains(`group-${groupId}`));
            
            if (memberRows.length === 0) {
                console.log(`[BREAKDOWN]   ERROR: No members found for group ${groupId}`);
                return;
            }
            
            console.log(`[BREAKDOWN]   Group ${groupId}: Found ${memberRows.length} members`);
            
            // Collect ALL unique weekdays from ALL member rows
            const allWeekdaysSet = new Set();
            memberRows.forEach(member => {
                const memberCells = member.getElementsByTagName('td');
                if (memberCells.length > 3) {
                    const memberWeekdayText = memberCells[3].textContent.trim();
                    if (memberWeekdayText && !memberWeekdayText.includes('MISSING')) {
                        // Normalize to proper case
                        const normalized = memberWeekdayText.trim().toLowerCase();
                        const properCase = normalized.charAt(0).toUpperCase() + normalized.slice(1);
                        allWeekdaysSet.add(properCase);
                    }
                }
            });
            
            const weekdays = Array.from(allWeekdaysSet);
            weekdays.sort((a, b) => {
                const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                return order.indexOf(a) - order.indexOf(b);
            });
            
            console.log(`[BREAKDOWN]   All weekdays in group:`, weekdays);
            
            if (weekdays.length === 0) {
                console.log(`[BREAKDOWN]   ERROR: No valid weekdays found`);
                return;
            }
            
            const firstWeekday = weekdays[0];
            const isMultiDay = weekdays.length > 1;
            
            // FIRST WEEKDAY: Add full group
            if (buckets[firstWeekday]) {
                buckets[firstWeekday].push({
                    type: 'dom',
                    element: row,
                    members: memberRows
                });
                console.log(`[BREAKDOWN]   ✅ Added group to ${firstWeekday} bucket`);
            } else {
                console.log(`[BREAKDOWN]   ERROR: Bucket "${firstWeekday}" not found!`);
            }
            
            // SUBSEQUENT WEEKDAYS: Add multi-day reference rows + header notes
            if (isMultiDay) {
                // Extract group data for notes
                const firstMember = memberRows[0];
                const memberCells = firstMember.getElementsByTagName('td');
                const brand = memberCells[1] ? memberCells[1].textContent.trim() : '';
                const discountText = memberCells[6] ? memberCells[6].textContent.trim() : '';
                const discount = discountText.replace('%', '').replace('EMPTY', '');
                const vendorText = memberCells[7] ? memberCells[7].textContent.trim() : '';
                const vendor = vendorText.replace('%', '').replace('-', '');
                
                // Collect brands and row numbers for dropdown
                const brandRowMap = {}; // {brandName: {Monday: rowNum, Thursday: rowNum}}
                memberRows.forEach(member => {
                    const mCells = member.getElementsByTagName('td');
                    const mBrand = mCells[1] ? mCells[1].textContent.trim() : '';
                    const mWeekdayText = mCells[3] ? mCells[3].textContent.trim() : '';
                    const mWeekday = mWeekdayText.trim().toLowerCase().charAt(0).toUpperCase() + mWeekdayText.trim().toLowerCase().slice(1);
                    const rowBtn = mCells[0] ? mCells[0].querySelector('button') : null;
                    const rowNum = rowBtn ? rowBtn.textContent.replace('Row ', '').trim() : '';
                    
                    // Extract just brand name (remove multi-brand badge like "1/4")
                    let cleanBrand = mBrand.replace(/^\d+\/\d+\s+/, '');
                    
                    if (!brandRowMap[cleanBrand]) {
                        brandRowMap[cleanBrand] = {};
                    }
                    brandRowMap[cleanBrand][mWeekday] = rowNum;
                });
                
                const abbrDays = weekdays.map(d => d.substring(0, 3)).join(', ');
                
                // Add header note to ALL weekdays (including first)
                weekdays.forEach(day => {
                    if (buckets[day]) {
                        buckets[day].push({
                            type: 'header_note',
                            brand: brand,
                            discount: discount,
                            vendor: vendor,
                            days: abbrDays,
                            brandRowMap: brandRowMap
                        });
                        console.log(`[BREAKDOWN]   ✅ Added header note to ${day} bucket`);
                    }
                });
                
                // Add multi-day reference rows to subsequent weekdays
                weekdays.slice(1).forEach(day => {
                    if (buckets[day]) {
                        // Find members that match this specific weekday
                        const dayMembers = memberRows.filter(member => {
                            const mCells = member.getElementsByTagName('td');
                            const mWeekdayText = mCells[3] ? mCells[3].textContent.trim() : '';
                            const mWeekday = mWeekdayText.trim().toLowerCase().charAt(0).toUpperCase() + mWeekdayText.trim().toLowerCase().slice(1);
                            return mWeekday === day;
                        });
                        
                        if (dayMembers.length > 0) {
                            buckets[day].push({
                                type: 'grey_reference',
                                members: dayMembers,
                                firstWeekday: firstWeekday
                            });
                            console.log(`[BREAKDOWN]   ✅ Added multi-day reference to ${day} bucket (${dayMembers.length} members)`);
                        }
                    }
                });
            }
        } else {
            // SINGLE ROW: Get weekday from the row itself
            const cells = row.getElementsByTagName('td');
            if (cells.length <= 3) {
                console.log(`[BREAKDOWN]   Not enough cells (${cells.length})`);
                return;
            }
            
            const weekdayText = cells[3].textContent.trim();
            console.log(`[BREAKDOWN]   Weekday text: "${weekdayText}"`);
            
            if (!weekdayText || weekdayText.includes('MISSING')) {
                console.log(`[BREAKDOWN]   Skipping - missing weekday`);
                return;
            }
            
            // Normalize to proper case
            const normalized = weekdayText.trim().toLowerCase();
            const firstWeekday = normalized.charAt(0).toUpperCase() + normalized.slice(1);
            console.log(`[BREAKDOWN]   First weekday: "${firstWeekday}"`);
            console.log(`[BREAKDOWN]   Single row - adding to ${firstWeekday}`);
            
            if (buckets[firstWeekday]) {
                buckets[firstWeekday].push({
                    type: 'dom',
                    element: row
                });
                console.log(`[BREAKDOWN]   ✅ Added single row to ${firstWeekday} bucket`);
            } else {
                console.log(`[BREAKDOWN]   ERROR: Bucket "${firstWeekday}" not found!`);
            }
        }
    });
    
    // Log final bucket counts
    console.log('[BREAKDOWN] === BUCKET SUMMARY ===');
    weekdayOrder.forEach(day => {
        const domCount = buckets[day].filter(item => item.type === 'dom').length;
        const noteCount = buckets[day].filter(item => item.type === 'header_note').length;
        const greyCount = buckets[day].filter(item => item.type === 'grey_reference').length;
        console.log(`  ${day}: ${domCount} deals, ${noteCount} header notes, ${greyCount} multi-day refs`);
    });
    
    // STEP 3: Rebuild table (PRESERVE Monthly and Sale sections!)
    console.log('[BREAKDOWN] Rebuilding table...');
    
    // v12.5 FIX: Save monthly and sale rows BEFORE clearing tbody
    const monthlyRows = Array.from(tbody.querySelectorAll('tr[data-section="monthly"]'));
    const saleRows = Array.from(tbody.querySelectorAll('tr[data-section="sale"]'));
    console.log(`[BREAKDOWN] Preserving ${monthlyRows.length} monthly rows and ${saleRows.length} sale rows`);
    
    tbody.innerHTML = '';
    tbody.appendChild(sectionHeader);
    
    weekdayOrder.forEach(day => {
        const dayBucket = buckets[day];
        const domItems = dayBucket.filter(item => item.type === 'dom');
        const headerNotes = dayBucket.filter(item => item.type === 'header_note');
        const greyRefs = dayBucket.filter(item => item.type === 'grey_reference');
        
        // Calculate deal count and brands
        const dealCount = domItems.length + greyRefs.length;
        const brands = new Set();
        
        domItems.forEach(item => {
            if (item.element) {
                const cells = item.element.getElementsByTagName('td');
                const brandText = cells[1] ? cells[1].textContent.trim() : '';
                if (brandText) brands.add(brandText);
            }
            if (item.members) {
                item.members.forEach(member => {
                    const memberCells = member.getElementsByTagName('td');
                    const memberBrand = memberCells[1] ? memberCells[1].textContent.trim() : '';
                    if (memberBrand) brands.add(memberBrand);
                });
            }
        });
        
        // Add brands from multi-day reference rows
        greyRefs.forEach(item => {
            if (item.members) {
                item.members.forEach(member => {
                    const memberCells = member.getElementsByTagName('td');
                    const memberBrand = memberCells[1] ? memberCells[1].textContent.trim() : '';
                    if (memberBrand) brands.add(memberBrand);
                });
            }
        });
        
        // Create weekday header
        const headerRow = createWeekdayHeaderRow(day, dealCount, Array.from(brands), headerNotes);
        tbody.appendChild(headerRow);
        console.log(`[BREAKDOWN] Added header for ${day}`);
        
        // v12.6: Wrap multi-day reference rows in collapsible section with summary
        if (greyRefs.length > 0) {
            // Collect brands from all reference rows
            const refBrands = new Set();
            greyRefs.forEach(item => {
                if (item.members) {
                    item.members.forEach(member => {
                        const memberCells = member.getElementsByTagName('td');
                        const memberBrand = memberCells[1] ? memberCells[1].textContent.trim() : '';
                        if (memberBrand) refBrands.add(memberBrand);
                    });
                }
            });
            
            const brandsList = Array.from(refBrands).join(', ');
            
            // Create collapsible header for multi-day references
            const multiDayHeader = document.createElement('tr');
            multiDayHeader.classList.add('multi-day-ref-header');
            multiDayHeader.setAttribute('data-weekday', day);
            multiDayHeader.innerHTML = `
                <td colspan="14" style="padding:6px 10px; background:#ffe6f0; cursor:pointer; border:2px solid #ff69b4;" 
                    onclick="toggleMultiDayRefs('${day}')">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span id="multi-day-toggle-${day}" style="font-size:1em; color:#c2185b;">▶</span>
                        <strong style="color:#c2185b; font-size:0.95em;">Multi Day Deals Present:</strong>
                        <span style="color:#c2185b; font-size:0.85em;">${brandsList}</span>
                    </div>
                </td>
            `;
            tbody.appendChild(multiDayHeader);
            
            // Append all multi-day reference rows
            const allGreyRows = [];
            greyRefs.forEach(item => {
                if (item.members) {
                    item.members.forEach(member => {
                        const greyRow = createMultiDayReferenceRow(member, item.firstWeekday);
                        greyRow.classList.add(`multi-day-ref-${day}`);
                        allGreyRows.push(greyRow);
                    });
                }
            });
            
            // Add border styling to first and last reference rows
            if (allGreyRows.length > 0) {
                allGreyRows[0].style.borderTop = '2px solid #ff69b4';
                allGreyRows[allGreyRows.length - 1].style.borderBottom = '2px solid #ff69b4';
                allGreyRows.forEach((row, idx) => {
                    row.style.borderLeft = '2px solid #ff69b4';
                    row.style.borderRight = '2px solid #ff69b4';
                    tbody.appendChild(row);
                    console.log(`[BREAKDOWN] Added multi-day reference row to ${day}`);
                });
            }
        }
        
        // Append DOM rows (groups and singles)
        domItems.forEach(item => {
            tbody.appendChild(item.element);
            if (item.members) {
                item.members.forEach(member => tbody.appendChild(member));
            }
            console.log(`[BREAKDOWN] Added deal row to ${day}`);
        });
    });
    
    // v12.5 FIX: Re-append Monthly and Sale sections
    if (monthlyRows.length > 0) {
        console.log(`[BREAKDOWN] Re-appending ${monthlyRows.length} monthly rows`);
        monthlyRows.forEach(row => tbody.appendChild(row));
    }
    if (saleRows.length > 0) {
        console.log(`[BREAKDOWN] Re-appending ${saleRows.length} sale rows`);
        saleRows.forEach(row => tbody.appendChild(row));
    }
    
    // v12.6: Collapse all weekday sections by default
    console.log('[BREAKDOWN] Collapsing all weekday sections by default...');
    weekdayOrder.forEach(day => {
        const allRows = Array.from(tbody.querySelectorAll('tr'));
        const headerIndex = allRows.findIndex(r => 
            r.classList.contains('weekday-header-row') && 
            r.getAttribute('data-weekday-header') === day
        );
        
        if (headerIndex !== -1) {
            // Find next weekday header or end
            let nextHeaderIndex = allRows.length;
            for (let i = headerIndex + 1; i < allRows.length; i++) {
                if (allRows[i].classList.contains('weekday-header-row') && 
                    allRows[i].getAttribute('data-weekday-header')) {
                    nextHeaderIndex = i;
                    break;
                }
            }
            
            // Hide all rows between this header and next header
            const rowsToHide = allRows.slice(headerIndex + 1, nextHeaderIndex);
            rowsToHide.forEach(row => {
                if (!row.classList.contains('section-header-row') && 
                    !row.classList.contains('weekday-header-row')) {
                    row.style.display = 'none';
                }
            });
            
            console.log(`[BREAKDOWN] Collapsed ${day} section (${rowsToHide.length} rows)`);
        }
        
        // v12.6: Also collapse multi-day reference sections by default
        const multiDayRows = tbody.querySelectorAll(`.multi-day-ref-${day}`);
        if (multiDayRows.length > 0) {
            multiDayRows.forEach(row => row.style.display = 'none');
            console.log(`[BREAKDOWN] Collapsed multi-day refs for ${day} (${multiDayRows.length} rows)`);
        }
    });
    
    console.log('[BREAKDOWN] === BREAKDOWN LIST BUILD COMPLETE ===');
}

// v12.6: Create collapsible weekday header row with cyan background and multi-day notes
function createWeekdayHeaderRow(weekday, dealCount, brands, headerNotes) {
    const row = document.createElement('tr');
    row.classList.add('weekday-header-row');
    row.setAttribute('data-section', 'weekly');
    row.setAttribute('data-weekday-header', weekday);
    
    const statusText = dealCount === 0 ? 'No deals' : `${dealCount} deal${dealCount > 1 ? 's' : ''}`;
    
    // Build brands HTML (vertical stack)
    let brandsHtml = '<div style="color:#003366; font-size:0.85em; max-height:150px; overflow-y:auto;">';
    if (brands.length === 0) {
        brandsHtml += 'None';
    } else {
        brandsHtml += brands.map((b, i) => `${i + 1}. ${b}`).join('<br>');
    }
    brandsHtml += '</div>';
    
    // Build notes HTML with [Rows] button (vertical stack)
    let notesHtml = '<div style="color:#003366; font-size:0.8em; max-height:150px; overflow-y:auto;">';
    if (headerNotes.length === 0) {
        notesHtml += '-';
    } else {
        const noteLines = headerNotes.map((note, idx) => {
            // Extract clean brand names for display
            const brandNames = Object.keys(note.brandRowMap);
            let displayBrand = '';
            
            if (brandNames.length === 1) {
                // Single brand: just show the brand name
                displayBrand = brandNames[0];
            } else {
                // Multi-brand: show first brand + "...+"
                const firstName = brandNames[0];
                displayBrand = firstName + '...+';
            }
            
            // Create dropdown ID for this note
            const dropdownId = `note-dropdown-${weekday}-${idx}`;
            
            // Build dropdown content
            let dropdownHtml = '<div class="note-dropdown" id="' + dropdownId + '" style="display:none; position:absolute; background:white; border:1px solid #ccc; padding:8px; z-index:1000; box-shadow:0 2px 8px rgba(0,0,0,0.15); min-width:200px;">';
            brandNames.forEach(brandName => {
                const rowMap = note.brandRowMap[brandName];
                dropdownHtml += '<div style="margin-bottom:4px;"><strong>' + brandName + '</strong> ';
                Object.keys(rowMap).forEach(day => {
                    const rowNum = rowMap[day];
                    dropdownHtml += '<button class="btn btn-sm btn-outline-primary py-0 px-1" onclick="openSheetRow(' + rowNum + ')" style="font-size:0.7em; margin-left:2px;" title="Go to row ' + rowNum + '">Row ' + rowNum + ' ' + day.substring(0, 3) + '</button> ';
                });
                dropdownHtml += '</div>';
            });
            dropdownHtml += '</div>';
            
            // Append dropdown to body (we'll position it later)
            setTimeout(() => {
                if (!document.getElementById(dropdownId)) {
                    document.body.insertAdjacentHTML('beforeend', dropdownHtml);
                }
            }, 10);
            
            return `<div class="multi-day-note" style="margin-bottom:4px;">` +
                   `<button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="toggleNoteDropdown('${dropdownId}', event)" style="font-size:0.75em;" title="Click to see all brands/rows">[Rows]</button> ` +
                   `${displayBrand} - D: ${note.discount}% V: ${note.vendor}% ${note.days}` +
                   `</div>`;
        }).join('');
        notesHtml += noteLines;
    }
    notesHtml += '</div>';
    
    // v12.6: Add collapse/expand indicator
    row.innerHTML = `
        <td colspan="14" style="padding:8px 10px; background:#00ffff; cursor:pointer;" onclick="toggleWeekdaySection('${weekday}')">
            <div style="display:flex; align-items:flex-start; gap:15px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span id="weekday-toggle-${weekday}" style="font-size:1.2em; color:#003366;">▶</span>
                    <strong style="font-size:1.4em; color:#003366; min-width:120px;">${weekday}</strong>
                </div>
                <span style="color:#003366; font-size:0.9em; align-self:center;">${statusText}</span>
                <div style="flex:1; min-width:200px;">
                    <strong style="color:#003366; font-size:0.85em;">Brands:</strong>
                    ${brandsHtml}
                </div>
                <div style="flex:1; min-width:250px;">
                    <strong style="color:#003366; font-size:0.85em;">Notes:</strong>
                    ${notesHtml}
                </div>
            </div>
        </td>
    `;
    
    return row;
}

// v12.6: Toggle weekday section visibility
function toggleWeekdaySection(weekday) {
    const tbody = document.querySelector('#match-results-unified-table tbody');
    if (!tbody) return;
    
    // Find all rows for this weekday (until next weekday header or end)
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    const headerIndex = allRows.findIndex(r => 
        r.classList.contains('weekday-header-row') && 
        r.getAttribute('data-weekday-header') === weekday
    );
    
    if (headerIndex === -1) return;
    
    // Find next weekday header or end
    let nextHeaderIndex = allRows.length;
    for (let i = headerIndex + 1; i < allRows.length; i++) {
        if (allRows[i].classList.contains('weekday-header-row') && 
            allRows[i].getAttribute('data-weekday-header')) {
            nextHeaderIndex = i;
            break;
        }
    }
    
    // Toggle all rows between this header and next header
    const rowsToToggle = allRows.slice(headerIndex + 1, nextHeaderIndex);
    const isCurrentlyVisible = rowsToToggle.length > 0 && rowsToToggle[0].style.display !== 'none';
    const toggleIcon = document.getElementById(`weekday-toggle-${weekday}`);
    
    rowsToToggle.forEach(row => {
        // Don't hide section headers or other weekday headers
        if (!row.classList.contains('section-header-row') && 
            !row.classList.contains('weekday-header-row')) {
            row.style.display = isCurrentlyVisible ? 'none' : '';
        }
    });
    
    // Update toggle icon
    if (toggleIcon) {
        toggleIcon.textContent = isCurrentlyVisible ? '▼' : '▶';
    }
}

// v12.6: Toggle multi-day reference section visibility
function toggleMultiDayRefs(weekday) {
    const tbody = document.querySelector('#match-results-unified-table tbody');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll(`.multi-day-ref-${weekday}`);
    const isCurrentlyVisible = rows.length > 0 && rows[0].style.display !== 'none';
    const toggleIcon = document.getElementById(`multi-day-toggle-${weekday}`);
    
    rows.forEach(row => {
        row.style.display = isCurrentlyVisible ? 'none' : '';
    });
    
    // Update toggle icon
    if (toggleIcon) {
        toggleIcon.textContent = isCurrentlyVisible ? '▼' : '▶';
    }
}

// v12.3: Toggle note dropdown visibility
function toggleNoteDropdown(dropdownId, event) {
    event.stopPropagation();
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    // Close all other dropdowns first
    document.querySelectorAll('.note-dropdown').forEach(d => {
        if (d.id !== dropdownId) d.style.display = 'none';
    });
    
    // Toggle this dropdown
    if (dropdown.style.display === 'none') {
        // Position dropdown near the button
        const rect = event.target.getBoundingClientRect();
        dropdown.style.display = 'block';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 5) + 'px';
    } else {
        dropdown.style.display = 'none';
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.btn-outline-secondary')) {
        document.querySelectorAll('.note-dropdown').forEach(d => {
            d.style.display = 'none';
        });
    }
});

// v12.6: Create multi-day reference row (PINK background with orange border)
function createMultiDayReferenceRow(memberRow, firstWeekday) {
    const newRow = memberRow.cloneNode(true);
    newRow.style.backgroundColor = '#ffe6f0'; // v12.6: PINK background instead of yellow
    newRow.classList.add('multi-day-reference-row');
    newRow.classList.remove('group-member-row'); // Remove group styling
    
    // Update row button to pink/magenta theme
    const cells = newRow.getElementsByTagName('td');
    if (cells.length > 0) {
        const rowBtn = cells[0].querySelector('button');
        if (rowBtn) {
            rowBtn.classList.remove('btn-outline-primary');
            rowBtn.classList.add('btn-outline-danger');
            rowBtn.style.backgroundColor = '#ffe6f0';
            rowBtn.style.borderColor = '#ff69b4';
            rowBtn.style.color = '#c2185b';
        }
    }
    
    // Update Notes column to show "First instance: Monday"
    if (cells.length >= 5) {
        cells[4].innerHTML = `<span style="font-style:italic; color:#c2185b;">First instance: ${firstWeekday}</span>`;
    }
    
    return newRow;
}

// v12.2: Remove all weekday header rows
function removeWeekdayHeaders() {
    document.querySelectorAll('tr.weekday-header-row[data-weekday-header]').forEach(row => row.remove());
}


// ============================================
// SPLIT AUDIT FUNCTIONS (V29)
// ============================================

// ── Match Results + Approve/Reject + End-Date + Create Deal ──────────────────
function displayMatchResults(matchesObj) {
    const containerId = 'match-results';
    const titles = {'weekly': ' WEEKLY DEALS', 'monthly': ' MONTHLY DEALS', 'sale': ' SALE DEALS'};
    
    // DEBUG: Log what we received
    console.log('[DISPLAY] Received matchesObj:', Object.keys(matchesObj));
    console.log('[DISPLAY] Weekly count:', (matchesObj.weekly || []).length);
    console.log('[DISPLAY] Monthly count:', (matchesObj.monthly || []).length);
    console.log('[DISPLAY] Sale count:', (matchesObj.sale || []).length);
    
    // 1. Flatten Matches for Global Indexing (Source of Truth)
    matchesData = [];
    ['weekly', 'monthly', 'sale'].forEach(key => {
        if (matchesObj[key]) {
            console.log(`[DISPLAY] Adding ${matchesObj[key].length} ${key} matches to matchesData`);
            matchesData = matchesData.concat(matchesObj[key]);
        }
    });
    console.log('[DISPLAY] Total matchesData:', matchesData.length);

    // Count items per section
    const counts = {
        weekly: (matchesObj.weekly || []).length,
        monthly: (matchesObj.monthly || []).length,
        sale: (matchesObj.sale || []).length
    };

    // Header and actions
    let headerHtml = '<h3>Match Results</h3>';
    headerHtml += '<p>&#x3030; Multi-day deals are grouped. Use <b>Approve All Days</b> for bulk approval.</p>';
    headerHtml += `
        <div style="margin-bottom:15px;">
            <button class="btn btn-success btn-sm" onclick="approveAll()" style="margin-right: 5px;" title="Approve all visible matches">[OK] Approve All Sections</button>
            <button class="btn btn-danger btn-sm" onclick="denyAll()" title="Deny all visible matches">[X] Deny All Sections</button>
        </div>
    `;
    
    // Generate deal type tabs
    headerHtml += generateDealTypeTabsHTML(containerId, counts);

    // Build a single unified table with data-section attributes for filtering
    let unifiedHtml = '<div class="scrollable-table-container" style="max-height:600px; margin-bottom:20px;">';
    unifiedHtml += '<table class="table table-sm" id="match-results-unified-table" style="font-size:0.85em;">';
    unifiedHtml += '<thead><tr>';
    unifiedHtml += '<th>Row</th><th>Brand</th><th style="color:#6c757d;">Linked</th><th>Weekday</th><th>Notes</th><th>Deal Info</th><th>Discount</th>';
    unifiedHtml += '<th>Vendor %</th><th>Locations</th><th>Categories</th><th>Confidence</th><th>Current ID</th>';
    unifiedHtml += '<th>Suggested MIS ID</th>';
    unifiedHtml += '<th style="white-space: nowrap;">Actions</th>';
    unifiedHtml += '</tr></thead><tbody>';

    // Re-render all matches into unified table with section markers
    let globalIdx = 0;
    ['weekly', 'monthly', 'sale'].forEach(sectionKey => {
        const sectionMatches = matchesObj[sectionKey] || [];
        console.log(`[DISPLAY] Processing section ${sectionKey}: ${sectionMatches.length} matches`);
        if (sectionMatches.length === 0) {
            console.log(`[DISPLAY] Skipping empty section: ${sectionKey}`);
            return;
        }

        // Add section header row
        unifiedHtml += `<tr class="section-header-row" data-section="${sectionKey}"><td colspan="14" style="background:#e9ecef; font-weight:bold; padding:10px;">${titles[sectionKey]} <small class="text-muted">(${sectionMatches.length} Items)</small></td></tr>`;
        console.log(`[DISPLAY] Added section header for ${sectionKey}`);

        const renderedGroups = new Set();

        sectionMatches.forEach((m) => {
            const idx = globalIdx++;
            const isGrouped = m.multi_day_group !== null && m.multi_day_group !== undefined;
            const isFirstInGroup = isGrouped && m.multi_day_group.is_first;
            const groupId = isGrouped ? m.multi_day_group.group_id : null;

            if (isGrouped && !isFirstInGroup) {
                return; // Skip non-first members
            }

            if (isGrouped && isFirstInGroup) {
                renderedGroups.add(groupId);
                const groupData = m.multi_day_group;
                const hasMissingWeekday = groupData.has_missing_weekday;
                const warningIcon = hasMissingWeekday ? '<span class="weekday-missing-icon" title="Missing weekday data!">[!] </span>' : '';
                
                // v12.1: Get weekdays list for display
                const weekdaysList = (groupData.weekdays || []).filter(w => w && !w.toLowerCase().includes('missing')).join(', ');
                
                // v12.1: For multi-brand groups, show full brand string and total entries
                const headerBrand = groupData.brand_raw || m.brand;
                const isMultiBrandGroup = groupData.is_multi_brand || false;
                const totalEntries = groupData.total_entries || groupData.total_days;
                const totalBrands = groupData.total_brands || 1;
                
                // Badge text: show days and brands info for multi-brand
                let badgeText = '';
                if (isMultiBrandGroup) {
                    badgeText = `📅 ${groupData.total_days}-Day 🏷 ${totalBrands}-Brand Deal`;
                } else {
                    badgeText = `📅 ${groupData.total_days}-Day Deal`;
                }
                
                // Button text: use total entries for multi-brand
                const buttonText = isMultiBrandGroup ? 
                    `[OK] Approve All ${totalEntries} Entries` : 
                    `[OK] Approve All ${groupData.total_days} Days`;
                
                unifiedHtml += `<tr class="group-header-row" data-section="${sectionKey}" onclick="toggleGroup('${groupId}')" title="Click to collapse/expand">`;
                unifiedHtml += `<td colspan="14">`;
                unifiedHtml += `<span class="group-toggle-icon" id="toggle-${groupId}">&#x25BC;</span>`;
                unifiedHtml += `${warningIcon}<strong>${headerBrand}</strong>`;
                unifiedHtml += `<span class="multi-day-badge">${badgeText}</span>`;
                unifiedHtml += ` (Rows: ${[...new Set(groupData.row_numbers)].join(', ')}) `;
                unifiedHtml += `<span style="color:#6c757d; font-size:0.85em;">[${weekdaysList}]</span>`;
                
                if (!hasMissingWeekday) {
                    unifiedHtml += `<button class="bulk-approve-btn" onclick="event.stopPropagation(); approveAllDaysInGroup('${groupId}')">${buttonText}</button>`;
                }
                unifiedHtml += `</td></tr>`;

                // Render group members
                const groupMembers = sectionMatches.filter(gm => gm.multi_day_group && gm.multi_day_group.group_id === groupId);
                groupMembers.forEach((gm) => {
                    const memberGlobalIdx = matchesData.indexOf(gm);
                    unifiedHtml += renderMatchRowWithSection(gm, memberGlobalIdx, groupId, hasMissingWeekday, sectionKey);
                });
            } else {
                // Single (non-grouped) row
                unifiedHtml += renderMatchRowWithSection(m, idx, null, false, sectionKey);
            }
        });
    });

    unifiedHtml += '</tbody></table></div>';

    // Build final HTML
    let finalHtml = headerHtml;
    finalHtml += `<div id="${containerId}-unified" class="deal-type-content active" style="display:block;">${unifiedHtml}</div>`;
    
    document.getElementById('match-results').innerHTML = finalHtml;
    
    // v12.2: Set default weekly view button state
    setTimeout(() => {
        const breakdownBtn = document.getElementById('weekly-view-breakdown');
        const fullBtn = document.getElementById('weekly-view-full');
        if (breakdownBtn && fullBtn) {
            breakdownBtn.classList.add('active');
            fullBtn.classList.remove('active');
        }
    }, 10);
    
    // Apply initial filter - this will trigger breakdown view if enabled
    filterMatchResultsBySection('all');
}

// v10.9.3: FIX 0% DISPLAY vs EMPTY
function renderMatchRowWithSection(m, idx, groupId, hasMissingWeekday, sectionKey) {
    const statusClass = m.status === 'HIGH' ? 'status-high' : m.status === 'MEDIUM' ? 'status-medium' : 'status-low';
    const rowBtn = renderRowButton(m.google_row);
    
    // v12.1: Add multi-brand badge if applicable, BOLD the brand name
    let brandCell = `<strong>${renderBrandCell(m.brand, idx, 'match')}</strong>`;
    if (m.is_multi_brand) {
        const brandIdx = (m.multi_brand_index || 0) + 1;
        const total = m.multi_brand_total || 1;
        brandCell = `<span class="badge bg-info text-dark me-1" title="Multi-brand deal: ${m.brand_raw}">${brandIdx}/${total}</span> <strong>${renderBrandCell(m.brand, idx, 'match')}</strong>`;
    }
    
    // v12.1: Get linked brand from Settings tab (same as Creation Checklist)
    let linkedBrandDisplay = '-';
    if (m.linked_brand && m.linked_brand !== '') {
        linkedBrandDisplay = `<span style="color:#6c757d;">${m.linked_brand}</span>`;
    }
    
    let weekdayDisplay = m.weekday || '-';
    if (!m.weekday || m.weekday.trim() === '') {
        weekdayDisplay = '<span class="weekday-missing-icon">[!] </span><span style="color:#dc3545; font-style:italic;">MISSING</span>';
    }

    // --- DISCOUNT DISPLAY LOGIC ---
    // If null/undefined/empty string -> Show RED "EMPTY"
    // If 0 or any number -> Show "0%" or "20%"
    let discountDisplay = '';
    if (m.discount === null || m.discount === undefined || m.discount === '') {
        discountDisplay = '<span style="color:#dc3545; font-weight:bold; font-size:0.85em;">EMPTY</span>';
    } else {
        discountDisplay = `${m.discount}%`;
    }

    // --- VENDOR DISPLAY LOGIC ---
    // Applying similar logic for consistency: Ensure 0% shows as 0%, not -%
    let vendorDisplay = '';
    if (m.vendor_contrib === null || m.vendor_contrib === undefined || m.vendor_contrib === '') {
        vendorDisplay = '-';
    } else {
        vendorDisplay = `${m.vendor_contrib}%`;
    }

    // v12.1: Handle tagged MIS IDs (W1: 12345, W2: 67890, etc.) - Individual clickable buttons
    let currentIdDisplay = '<span style="color:#999; font-style:italic;">No ID</span>';
    const currentIdStr = m.current_sheet_id ? String(m.current_sheet_id).trim() : '';
    const suggestedId = m.matched_mis_id ? String(m.matched_mis_id).trim() : '';

    if (currentIdStr) {
        // Parse tagged IDs: W1: 12345, W1: 67890, W2: 11111, WP: 99999, etc.
        const tagPattern = /([WwMmSs][1-9Pp]|[Pp]art\s*\d+|[Gg][Aa][Pp]|[Pp]atch)\s*:\s*(\d+)/g;
        let taggedIds = [];
        let match;
        while ((match = tagPattern.exec(currentIdStr)) !== null) {
            let tag = match[1].toUpperCase().replace(/\s+/g, '');
            // Normalize legacy tags
            if (tag.startsWith('PART')) {
                const partNum = tag.match(/\\d+/)[0];
                tag = 'W' + partNum;
            } else if (tag === 'GAP') {
                tag = 'GAP';
            } else if (tag === 'PATCH') {
                tag = 'WP';
            }
            taggedIds.push({ tag: tag, id: match[2] });
        }
        
        // If no tags found, try comma-separated plain IDs
        if (taggedIds.length === 0) {
            const plainIds = currentIdStr.split(',').map(s => s.trim()).filter(s => /^\\d{5,7}$/.test(s));
            taggedIds = plainIds.map(id => ({ tag: '', id: id }));
        }
        
        if (taggedIds.length > 0) {
            currentIdDisplay = taggedIds.map(item => {
                const isMatch = (item.id === suggestedId);
                const bg = isMatch ? '#d4edda' : '#e9ecef';
                const color = isMatch ? '#155724' : '#495057';
                const border = isMatch ? '1px solid #28a745' : '1px solid #ced4da';
                const tagDisplay = item.tag ? `<span style="font-size:0.75em; color:#6c757d;">${item.tag}:</span> ` : '';
                return `<span onclick="lookupMisId('${item.id}')" 
                              style="cursor:pointer; font-weight:bold; padding:2px 6px; border-radius:4px; 
                                     background:${bg}; color:${color}; border:${border};
                                     text-decoration:underline; display:inline-block; margin:2px;">
                            ${tagDisplay}${item.id}
                        </span>`;
            }).join('');
        }
    }

    let inputHtml = '';
    if (hasMissingWeekday && (!m.weekday || m.weekday.trim() === '')) {
        inputHtml = '<span style="color:#dc3545; font-style:italic;">[!] Manual entry required</span>';
    } else {
        // SUGGESTION LOGIC: ALWAYS USE MAGNIFYING GLASS (No Dropdowns)
        const hasSuggestions = m.suggestions && m.suggestions.length > 0;
        
        const iconColor = hasSuggestions ? '#ffc107' : '#e2e6ea'; 
        const iconCursor = hasSuggestions ? 'pointer' : 'default';
        const iconTitle = hasSuggestions ? `View ${m.suggestions.length} Suggestions` : 'No Suggestions found';
        const iconShadow = hasSuggestions ? 'text-shadow: 0 0 2px rgba(255, 193, 7, 0.5);' : '';
        
        const clickAction = hasSuggestions ? `onclick="showSuggestionTooltip(${idx})"` : '';

        inputHtml = `
            <div style="min-width:150px;" id="input-container-${idx}">
                <div style="display:flex; gap:5px; align-items:center;">
                    <input type="text" id="input-mis-${idx}" class="mis-id-input" value="${m.matched_mis_id || ''}" 
                           style="width:90px; font-weight:bold; padding:4px;" data-row="${idx}" placeholder="MIS ID">
                    
                    <span class="suggestion-indicator" ${clickAction} 
                          title="${iconTitle}" 
                          style="cursor:${iconCursor}; color:${iconColor}; font-size:1.3em; vertical-align:middle; ${iconShadow}">
                        &#128269;
                    </span>

                    <button class="btn btn-sm btn-outline-secondary" style="padding:0px 5px;" onclick="addIdField(${idx})">+</button>
                </div>
            </div>`;
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
    const locationsTooltip = formatLocationsNumbered(m.locations);

    let actionHtml = '';
    if (hasMissingWeekday && (!m.weekday || m.weekday.trim() === '')) {
        actionHtml = '<span style="color:#999; font-style:italic;">N/A</span>';
    } else {
        // v12.5: Smaller Approve/Deny buttons + Blue Blaze button
        const existingBlazeTitles = approvedMatches[m.google_row]?.blaze_titles || [];
        const blazeBtnClass = existingBlazeTitles.length > 0 ? 'btn-primary' : 'btn-outline-primary';
        const blazeBtnText = existingBlazeTitles.length > 0 ? '<i class="bi bi-lightning-charge-fill"></i> ' + existingBlazeTitles.length : '<i class="bi bi-lightning-charge"></i>';
        
        actionHtml = `
            <div style="display:flex; gap:2px; align-items:center; flex-wrap:nowrap;">
                <button class="btn btn-success btn-sm btn-approve" style="padding:1px 4px; font-size:0.7rem;" onclick="approveSingleMatch(${idx})" title="Approve">[OK]</button>
                <button class="btn btn-danger btn-sm btn-reject" style="padding:1px 4px; font-size:0.7rem;" onclick="rejectMatch(${idx})" title="Deny">[X]</button>
                <button class="btn ${blazeBtnClass} btn-sm btn-blaze" style="padding:1px 5px; font-size:0.7rem;" onclick="openBlazeModal(${idx})" title="Select Blaze Discount">${blazeBtnText}</button>
            </div>`;
    }

    const rowClass = groupId ? `group-member-row group-${groupId}` : '';
    const warningClass = (hasMissingWeekday && (!m.weekday || m.weekday.trim() === '')) ? 'missing-weekday-warning' : '';
    const bgStyle = groupId ? 'style="background-color: #fff3cd !important;"' : '';
    
    // v12.1: Add dashed border for multi-brand rows after first brand
    const multiBrandStyle = m.is_multi_brand && m.multi_brand_index > 0 ? 'style="border-top: 1px dashed #dee2e6 !important;"' : bgStyle;

    return `<tr id="match-row-${idx}" class="${rowClass} ${warningClass}" data-section="${sectionKey}" data-group="${groupId || ''}" ${multiBrandStyle}>
        <td>${rowBtn}</td>
        <td>${brandCell}</td>
        <td>${linkedBrandDisplay}</td>
        <td>${weekdayDisplay}</td>
        <td title="${m.special_notes || ''}">${truncate(m.special_notes, 15)}</td>
        <td title="${m.deal_info || ''}">${truncate(m.deal_info, 15)}</td>
        <td>${discountDisplay}</td>
        <td>${vendorDisplay}</td>
        <td title="${locationsTooltip}">${truncate(m.locations, 25)}</td>
        <td title="${m.categories || ''}">${truncate(m.categories, 15)}</td>
        <td><span class="status-badge ${statusClass}">${m.confidence || 0}%</span></td>
        <td>${currentIdDisplay}</td>
        <td>${inputHtml}</td>
        <td>${actionHtml}</td>
    </tr>`;
}

// v88: Filter function for section tabs
function filterMatchResultsBySection(section) {
    console.log('[FILTER] Filtering to section:', section);
    
    const rows = document.querySelectorAll('#match-results-unified-table tbody tr');
    rows.forEach(row => {
        const rowSection = row.getAttribute('data-section');
        if (section === 'all' || rowSection === section) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
    
    console.log('[FILTER] Rows visible, weeklyViewMode:', weeklyViewMode);
    
    // v12.2: If weekly section is visible AND breakdown mode is on, reorganize into weekday sections
    if ((section === 'weekly' || section === 'all') && weeklyViewMode === 'breakdown') {
        console.log('[FILTER] Triggering breakdown view');
        
        // SAVE ORIGINAL TABLE STATE before breakdown modifies it
        const table = document.getElementById('match-results-unified-table');
        if (table) {
            const tbody = table.querySelector('tbody');
            if (tbody && !originalTableState) {
                originalTableState = tbody.innerHTML;
                console.log('[FILTER] Saved original table state');
            }
        }
        
        setTimeout(() => insertWeekdayHeaders(), 50); // Small delay to ensure rows are visible
    }
}


function toggleGroup(groupId) {
    const members = document.querySelectorAll(`.group-${groupId}`);
    const toggleIcon = document.getElementById(`toggle-${groupId}`);
    
    members.forEach(member => {
        member.classList.toggle('collapsed');
    });
    
    if (toggleIcon) {
        toggleIcon.classList.toggle('collapsed');
        toggleIcon.textContent = toggleIcon.classList.contains('collapsed') ? '▶' : '▼';
    }
}

function approveAllDaysInGroup(groupId) {
    const members = document.querySelectorAll(`.group-${groupId}`);
    const rowIndices = [];
    
    members.forEach(member => {
        const rowId = member.id;
        if (rowId && rowId.startsWith('match-row-')) {
            const idx = parseInt(rowId.replace('match-row-', ''));
            rowIndices.push(idx);
        }
    });
    
    if (rowIndices.length === 0) {
        alert('No rows found in this group');
        return;
    }
    
    rowIndices.forEach(idx => {
        approveSingleMatch(idx);
    });
    
    alert(`[OK] Approved all ${rowIndices.length} days in this group`);
}

function addIdField(idx) {
    const container = document.getElementById(`input-container-${idx}`);
    if (!container) return;
    
    const newDiv = document.createElement('div');
    newDiv.style.cssText = "display:flex; gap:5px; align-items:center; margin-top:4px;";
    
    newDiv.innerHTML = `
        <input type="text" class="mis-id-input" value="" 
               style="width:80px; font-weight:bold; padding:4px;" data-row="${idx}">
        <span class="suggestion-indicator" onclick="showSuggestionTooltip(${idx}, this)" 
              title="View Suggestions" style="cursor:pointer;"></span>
        <button class="btn" style="padding:2px 6px; font-size:1.1em; color:#dc3545;" 
                onclick="this.parentElement.remove()">-</button>
    `;
    
    container.appendChild(newDiv);
}

function approveAll() {
    // v12.1: Show popup with section selection
    showBulkActionModal('approve');
}

function denyAll() {
    // v12.1: Show popup with section selection
    showBulkActionModal('deny');
}

// v12.1: Smart bulk action modal with section selection
function showBulkActionModal(actionType) {
    // Remove any existing modal
    const existing = document.getElementById('bulk-action-modal-overlay');
    if (existing) existing.remove();
    
    const actionLabel = actionType === 'approve' ? 'Approve' : 'Deny';
    const actionColor = actionType === 'approve' ? '#28a745' : '#dc3545';
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'bulk-action-modal-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.5); z-index: 9998;
        display: flex; justify-content: center; align-items: center;
    `;
    
    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fff; padding: 25px; border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3); text-align: center;
        min-width: 350px;
    `;
    
    modal.innerHTML = `
        <h4 style="margin-bottom: 20px; color: ${actionColor};">${actionLabel} MIS IDs</h4>
        <p style="color: #666; margin-bottom: 20px;">Select which section to ${actionType.toLowerCase()}:<br>
        <small>(Only rows with MIS IDs entered will be processed)</small></p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <button class="btn btn-lg" style="background: ${actionColor}; color: white; font-weight: bold;"
                    onclick="executeBulkAction('${actionType}', 'all')">
                All Sections!
            </button>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button class="btn btn-primary" style="flex: 1;"
                        onclick="executeBulkAction('${actionType}', 'weekly')">
                    Weekly
                </button>
                <button class="btn btn-success" style="flex: 1;"
                        onclick="executeBulkAction('${actionType}', 'monthly')">
                    Monthly
                </button>
                <button class="btn btn-warning" style="flex: 1;"
                        onclick="executeBulkAction('${actionType}', 'sale')">
                    Sale
                </button>
            </div>
            <button class="btn btn-outline-secondary" onclick="closeBulkActionModal()">
                Cancel
            </button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Click outside to close
    overlay.onclick = function(e) {
        if (e.target === overlay) closeBulkActionModal();
    };
}

function closeBulkActionModal() {
    const modal = document.getElementById('bulk-action-modal-overlay');
    if (modal) modal.remove();
}

function executeBulkAction(actionType, section) {
    let count = 0;
    let skipped = 0;
    
    matchesData.forEach((match, idx) => {
        // Check if this row matches the selected section
        if (section !== 'all' && match.section !== section) {
            return;
        }
        
        // Check if row is visible (not filtered out)
        const row = document.getElementById('match-row-' + idx);
        if (!row || row.style.display === 'none') {
            return;
        }
        
        if (actionType === 'approve') {
            // Only approve rows that have MIS IDs entered
            const container = document.getElementById(`input-container-${idx}`);
            if (container) {
                const inputs = container.querySelectorAll('input.mis-id-input');
                const values = Array.from(inputs)
                    .map(i => i.value.trim())
                    .filter(v => v.length > 0);
                
                if (values.length > 0) {
                    if (approveSingleMatch(idx)) {
                        count++;
                    }
                } else {
                    skipped++;
                }
            }
        } else {
            // Deny - remove from approved and mark as rejected
            rejectMatch(idx);
            count++;
        }
    });
    
    closeBulkActionModal();
    
    const sectionLabel = section === 'all' ? 'all sections' : section;
    if (actionType === 'approve') {
        let msg = `Approved ${count} rows in ${sectionLabel}.`;
        if (skipped > 0) {
            msg += `\\nSkipped ${skipped} rows without MIS IDs.`;
        }
        alert(msg);
    } else {
        alert(`Denied ${count} rows in ${sectionLabel}.`);
    }
    
    console.log(`[BULK] ${actionType} completed: ${count} rows in ${sectionLabel}`);
}

function approveSingleMatch(idx) {
    const container = document.getElementById(`input-container-${idx}`);
    if (!container) {
        console.error(`Container not found for idx ${idx}`);
        return;
    }
    
    const inputs = container.querySelectorAll('input.mis-id-input');
    const values = Array.from(inputs)
        .map(i => i.value.trim())
        .filter(v => v.length > 0);
    
    if (values.length === 0) {
        // For bulk operations, silently skip rows without IDs
        return false;
    }
    
    const newMisId = values.join(', ');
    const match = matchesData[idx];
    
    if (!match) {
        console.error(`Match data not found for idx ${idx}`);
        return false;
    }
    
    // v12.1: Handle multi-brand deals - append MIS IDs instead of overwriting
    const existingApproval = approvedMatches[match.google_row];
    
    if (existingApproval && match.is_multi_brand) {
        // Same row already has an approval - this is a multi-brand situation
        // Append the new MIS ID to existing ones
        const existingIds = existingApproval.mis_ids || [existingApproval.mis_id];
        const existingBrands = existingApproval.brands || [];
        
        // Check if this brand was already approved (avoid duplicates)
        if (!existingBrands.includes(match.brand)) {
            existingIds.push(newMisId);
            existingBrands.push(match.brand);
            
            // v12.6 FIX: Preserve existing blaze_titles when updating MIS IDs
            const existingBlazeTitles = existingApproval.blaze_titles || [];
            
            approvedMatches[match.google_row] = {
                mis_ids: existingIds,
                brands: existingBrands,
                section: match.section || 'weekly',
                is_multi_brand: true,
                blaze_titles: existingBlazeTitles  // 💾 PRESERVE blaze_titles
            };
            console.log(`[MULTI-BRAND] Row ${match.google_row}: Added ${match.brand} (${newMisId}). Total: ${existingIds.length} brands`);
        } else {
            // Brand already approved - update its MIS ID
            const brandIdx = existingBrands.indexOf(match.brand);
            existingIds[brandIdx] = newMisId;
            approvedMatches[match.google_row].mis_ids = existingIds;
            console.log(`[MULTI-BRAND] Row ${match.google_row}: Updated ${match.brand} to ${newMisId}`);
        }
    } else {
        // First approval for this row or single-brand deal
        // v12.6 FIX: Check if there are existing blaze_titles to preserve
        const existingBlazeTitles = existingApproval?.blaze_titles || [];
        
        approvedMatches[match.google_row] = {
            mis_ids: [newMisId],
            brands: [match.brand],
            section: match.section || 'weekly',
            is_multi_brand: match.is_multi_brand || false,
            blaze_titles: existingBlazeTitles  // 💾 PRESERVE blaze_titles
        };
    }
    
    const row = document.getElementById('match-row-' + idx);
    if (row) {
        row.classList.add('row-approved');
        row.classList.remove('row-rejected');
    }
    
    // v12.1: Turn input text box green to show approval
    inputs.forEach(input => {
        input.style.backgroundColor = '#d4edda';
        input.style.borderColor = '#28a745';
        input.style.color = '#155724';
    });
    
    updateApplyButtonsVisibility();
    return true; // Return true to indicate success
}

function rejectMatch(idx) {
    const match = matchesData[idx];
    if (!match) return;
    
    const row = document.getElementById('match-row-' + idx);
    
    // v12.1: Handle multi-brand rejection properly
    const existingApproval = approvedMatches[match.google_row];
    if (existingApproval) {
        if (existingApproval.is_multi_brand && existingApproval.brands && existingApproval.brands.length > 1) {
            // Multi-brand: Only remove this specific brand
            const brandIdx = existingApproval.brands.indexOf(match.brand);
            if (brandIdx !== -1) {
                existingApproval.mis_ids.splice(brandIdx, 1);
                existingApproval.brands.splice(brandIdx, 1);
                console.log(`[MULTI-BRAND] Row ${match.google_row}: Rejected ${match.brand}. Remaining: ${existingApproval.brands.join(', ')}`);
                
                // If only one brand left, convert back to simple format
                if (existingApproval.brands.length === 1) {
                    existingApproval.is_multi_brand = false;
                }
            }
        } else {
            // Single brand or last brand: delete entire entry
            delete approvedMatches[match.google_row];
        }
    }
    
    if (row) {
        row.classList.add('row-rejected');
        row.classList.remove('row-approved');
    }
    
    // v12.1: Clear green styling from input if it was approved
    const container = document.getElementById(`input-container-${idx}`);
    if (container) {
        const inputs = container.querySelectorAll('input.mis-id-input');
        inputs.forEach(input => {
            input.style.backgroundColor = '';
            input.style.borderColor = '';
            input.style.color = '';
        });
    }
}

// HELPER: Normalize date to YYYY-MM-DD format for comparison
function normalizeDate(dateStr) {
    if (!dateStr || dateStr === 'N/A') return null;
    
    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    
    // Handle MM/DD/YYYY or M/D/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const parts = dateStr.split('/');
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
    }
    
    // Handle MM/DD/YY or M/D/YY format (2-digit year)
    if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(dateStr)) {
        const parts = dateStr.split('/');
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        const year = '20' + parts[2]; // Assume 2000s
        return `${year}-${month}-${day}`;
    }
    
    return null; // Invalid format
}

  // v12.1: ENHANCED MODAL for Suggestions with full comparison
function showSuggestionTooltip(rowIdx) {
    // Remove any existing modals first
    const existing = document.getElementById('suggestion-modal-overlay');
    if (existing) existing.remove();

    const match = matchesData[rowIdx];
    if (!match || !match.suggestions || match.suggestions.length === 0) return;

    // Create Overlay (Dark Background)
    const overlay = document.createElement('div');
    overlay.id = 'suggestion-modal-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.5); z-index: 9998;
        display: flex; justify-content: center; align-items: center;
    `;
    overlay.onclick = function(e) {
        if(e.target === overlay) overlay.remove();
    };

    // v12.1: Adaptive width - 1500px or screen width minus padding, whichever is smaller
    const screenWidth = window.innerWidth;
    const modalWidth = Math.min(1500, screenWidth - 40); // 40px padding total
    
    // Create Modal Box - adaptive width with horizontal scroll
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fff; padding: 20px; border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        width: ${modalWidth}px; max-width: 98%; max-height: 85vh;
        overflow-y: auto; overflow-x: auto; z-index: 9999; position: relative;
    `;
    
    // v12.1: Helper to format locations vertically for tooltip
    const formatLocationsVertical = (locations) => {
        if (!locations || locations === '-') return '-';
        // Split by comma, trim each, join with newlines
        return locations.split(',').map(loc => loc.trim()).filter(loc => loc).join('&#10;');
    };

    // Helper: Get cell style based on match
    const getMatchStyle = (sourceVal, targetVal, isNumeric = false) => {
        // v12.26.0: Fix 0% matching - explicit null/undefined/empty checks
        const srcEmpty = (sourceVal === null || sourceVal === undefined || String(sourceVal).trim() === '' || String(sourceVal).trim() === '-' || String(sourceVal).toLowerCase() === 'nan');
        const tgtEmpty = (targetVal === null || targetVal === undefined || String(targetVal).trim() === '' || String(targetVal).trim() === '-' || String(targetVal).toLowerCase() === 'nan');
        
        if (srcEmpty && tgtEmpty) return '';
        if (srcEmpty || tgtEmpty) return 'background:#fff3cd; color:#856404;';
        
        let matches = false;
        if (isNumeric) {
            const s = parseFloat(String(sourceVal).replace(/[%$,]/g, ''));
            const t = parseFloat(String(targetVal).replace(/[%$,]/g, ''));
            if (isNaN(s) && isNaN(t)) return '';
            if (isNaN(s) || isNaN(t)) return 'background:#fff3cd; color:#856404;';
            matches = Math.abs(s - t) < 0.01;
        } else {
            matches = String(sourceVal).toLowerCase().trim() === String(targetVal).toLowerCase().trim();
        }
        
        return matches ? 'background:#d4edda; color:#155724;' : 'background:#f8d7da; color:#721c24;';
    };
    
    // Helper: Fuzzy match for brand
    const getBrandMatchStyle = (sourceBrand, targetBrand) => {
        if (!sourceBrand || !targetBrand) return 'background:#fff3cd; color:#856404;';
        const s = String(sourceBrand).toLowerCase().trim();
        const t = String(targetBrand).toLowerCase().trim();
        if (s === t) return 'background:#d4edda; color:#155724;'; // Exact match - green
        if (s.includes(t) || t.includes(s)) return 'background:#d4edda; color:#155724;'; // Contains - green
        return 'background:#f8d7da; color:#721c24;'; // No match - red
    };
    
    // v12.1: Get tab name for month/year parsing
    // v12.24.8: Fixed element ID from 'sheet-select' to 'mis-tab'
    const currentTabName = document.getElementById('mis-tab')?.value || '';
    
    // v12.1: Parse month/year from tab name (e.g., "January 2026")
    const parseTabMonthYear = (tabName) => {
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const parts = tabName.toLowerCase().trim().split(/\s+/);
        let month = -1, year = -1;
        for (const p of parts) {
            const mIdx = months.indexOf(p);
            if (mIdx >= 0) month = mIdx;
            if (/^\d{4}$/.test(p)) year = parseInt(p);
        }
        return { month, year };
    };
    
    // v12.1: Get last day of month (handles leap years)
    const getLastDayOfMonth = (year, month) => {
        // month is 0-indexed (0=Jan, 11=Dec)
        return new Date(year, month + 1, 0).getDate();
    };
    
    // v12.1: Format date as YYYY-MM-DD
    const formatDate = (year, month, day) => {
        const m = String(month + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        return year + '-' + m + '-' + d;
    };
    
    // v12.1: Parse date string to {year, month, day}
    const parseDate = (dateStr) => {
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
    };
    
    // v12.1: Normalize weekdays for comparison
    const normalizeWeekdays = (weekdayStr) => {
        if (!weekdayStr || weekdayStr === '-' || weekdayStr === 'N/A') return [];
        const days = ['mon','tue','wed','thu','fri','sat','sun'];
        const result = [];
        const lower = weekdayStr.toLowerCase();
        days.forEach(d => {
            if (lower.includes(d)) result.push(d);
        });
        return result.sort();
    };
    
    // v12.1: Normalize locations for comparison
    const normalizeLocations = (locStr) => {
        if (!locStr || locStr === '-') return [];
        return locStr.split(',').map(l => l.trim().toLowerCase()).filter(l => l).sort();
    };
    
    // v12.1: Check if suggestion is a perfect match for Continue/Recycle
    const checkContinueEligibility = (searchingFor, suggestion, sectionType) => {
        const result = {
            isContinue: false,
            isPartialContinue: false,
            mismatches: [],
            newEndDate: null,
            currentEndDate: null,
            needsManualReview: false,
            needsLinkedBrand: false,  // v12.1: Flag if MIS needs linked brand added
            cannotDetermineDate: false  // Flag when tab name can't be parsed
        };
        
        // Parse tab for target month/year
        const tabInfo = parseTabMonthYear(currentTabName);
        if (tabInfo.month < 0 || tabInfo.year < 0) {
            // Can't determine Continue eligibility without valid date - mark as indeterminate
            result.cannotDetermineDate = true;
            // Still check field matches for partial info
        }
        
        // Calculate new end date (last day of target month) - only if we have valid date
        if (!result.cannotDetermineDate) {
            const lastDay = getLastDayOfMonth(tabInfo.year, tabInfo.month);
            result.newEndDate = formatDate(tabInfo.year, tabInfo.month, lastDay);
        }
        
        // Get current MIS end date
        const misEndDate = suggestion.mis_data.end_date;
        result.currentEndDate = misEndDate;
        
        // Check each key field
        // 1. Brand - v12.1: STRICT match, no partial "includes" allowed
        const srcBrand = String(searchingFor.brand || '').toLowerCase().trim();
        const tgtBrand = String(suggestion.mis_data.brand || '').toLowerCase().trim();
        if (srcBrand !== tgtBrand) {
            // Strict match only - "Stiiizy" should NOT match "Stiiizy Accessories"
            result.mismatches.push('Brand');
        }
        
        // 2. Linked Brand - v12.1: Enhanced check with needsLinkedBrand flag
        const srcLinked = String(searchingFor.linked_brand || '').toLowerCase().trim();
        const tgtLinked = String(suggestion.mis_data.linked_brand || '').toLowerCase().trim();
        const srcHasLinked = srcLinked && srcLinked !== 'n/a' && srcLinked !== '';
        const tgtHasLinked = tgtLinked && tgtLinked !== 'n/a' && tgtLinked !== '';
        
        if (srcHasLinked) {
            if (!tgtHasLinked) {
                // Google Sheet has linked brand but MIS doesn't
                result.needsLinkedBrand = true;
            } else if (srcLinked !== tgtLinked) {
                // Both have linked brand but they don't match
                result.mismatches.push('Linked Brand');
            }
        }
        
        // 3. Discount
        const srcDiscount = parseFloat(String(searchingFor.discount || 0).replace(/[%]/g, '')) || 0;
        const tgtDiscount = parseFloat(String(suggestion.mis_data.discount || 0).replace(/[%]/g, '')) || 0;
        if (Math.abs(srcDiscount - tgtDiscount) > 0.01) {
            result.mismatches.push('Discount');
        }
        
        // 4. Vendor %
        const srcVendor = parseFloat(String(searchingFor.vendor_contrib || 0).replace(/[%]/g, '')) || 0;
        const tgtVendor = parseFloat(String(suggestion.mis_data.vendor_contribution || 0).replace(/[%]/g, '')) || 0;
        if (Math.abs(srcVendor - tgtVendor) > 0.01) {
            result.mismatches.push('Vendor %');
        }
        
        // 5. Locations
        const srcLocs = normalizeLocations(searchingFor.locations);
        const tgtLocs = normalizeLocations(suggestion.mis_data.locations);
        if (JSON.stringify(srcLocs) !== JSON.stringify(tgtLocs)) {
            result.mismatches.push('Locations');
        }
        
        // 6. Weekdays (for Weekly deals)
        if (sectionType === 'weekly') {
            // Get all weekdays from multi-day group if applicable
            let srcWeekdays = [];
            if (searchingFor.multi_day_group && searchingFor.multi_day_group.weekdays) {
                srcWeekdays = searchingFor.multi_day_group.weekdays.map(w => w.toLowerCase().substring(0,3)).filter(w => w && !w.includes('missing')).sort();
            } else {
                srcWeekdays = normalizeWeekdays(searchingFor.weekday);
            }
            const tgtWeekdays = normalizeWeekdays(suggestion.mis_data.weekdays);
            if (JSON.stringify(srcWeekdays) !== JSON.stringify(tgtWeekdays)) {
                result.mismatches.push('Weekdays');
            }
        }
        
        // 7. Categories
        const srcCat = String(searchingFor.categories || '').toLowerCase().trim();
        const tgtCat = String(suggestion.mis_data.category || '').toLowerCase().trim();
        // "all" or empty both mean all categories
        const srcIsAll = !srcCat || srcCat === 'all' || srcCat === '-' || srcCat.includes('all categories');
        const tgtIsAll = !tgtCat || tgtCat === 'all' || tgtCat === '-' || tgtCat === 'n/a' || tgtCat === 'nan';
        if (srcIsAll !== tgtIsAll) {
            result.mismatches.push('Categories');
        } else if (!srcIsAll && !tgtIsAll && srcCat !== tgtCat) {
            result.mismatches.push('Categories');
        }
        
        // Determine eligibility
        // Can only determine Continue eligibility if we could parse the tab date
        if (result.mismatches.length === 0 && !result.cannotDetermineDate) {
            result.isContinue = true;
            
            // Check if end date needs manual review
            const parsedEnd = parseDate(misEndDate);
            if (parsedEnd) {
                const endDateObj = new Date(parsedEnd.year, parsedEnd.month, parsedEnd.day);
                const targetMonthStart = new Date(tabInfo.year, tabInfo.month, 1);
                if (endDateObj >= targetMonthStart) {
                    result.needsManualReview = true;
                    result.isPartialContinue = true;
                }
            }
        }
        
        return result;
    };

    // Helper: Build More Info popup content
    const buildMoreInfoHtml = (data, title) => {
        if (!data || Object.keys(data).length === 0) return '<em>No additional data</em>';
        let html = '<table class="table table-sm table-bordered" style="font-size:0.8em; margin:0;">';
        html += '<thead><tr><th style="width:40%;">Field</th><th>Value</th></tr></thead><tbody>';
        Object.entries(data).forEach(([key, val]) => {
            html += '<tr><td><strong>' + key + '</strong></td><td>' + val + '</td></tr>';
        });
        html += '</tbody></table>';
        return html;
    };

    // Escape for JSON embedding
    const escapeForAttr = (str) => {
        if (!str) return '';
        return String(str).replace(/'/g, "\\'").replace(/"/g, "&quot;");
    };

    // --- HEADER ---
    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:2px solid #007bff; padding-bottom:10px;">
            <h5 style="margin:0; color:#007bff;">Suggestion Details for Row ${match.google_row}</h5>
            <button class="btn btn-sm btn-outline-danger" onclick="document.getElementById('suggestion-modal-overlay').remove()">Close</button>
        </div>
    `;

    // --- SEARCHING FOR SECTION ---
    const linkedBrandDisplay = match.linked_brand ? `<br><small style="color:#6c757d;">${match.linked_brand}</small>` : '';
    const rawRowDataJson = match.raw_row_data ? escapeForAttr(JSON.stringify(match.raw_row_data)) : '{}';
    
    // v12.1: Format weekdays vertically for display and tooltip
    let searchingWeekdays = match.weekday || '-';
    let searchingWeekdaysTooltip = match.weekday || '-';
    if (match.multi_day_group && match.multi_day_group.weekdays) {
        const weekdaysList = match.multi_day_group.weekdays.filter(w => w && !w.toLowerCase().includes('missing'));
        searchingWeekdays = weekdaysList.join('<br>');
        searchingWeekdaysTooltip = weekdaysList.join('&#10;');
    }
    
    // v12.1: Format categories vertically
    const formatCategoriesVertical = (catStr) => {
        if (!catStr || catStr === '-') return { display: '-', tooltip: '-' };
        const cats = catStr.split(',').map(c => c.trim()).filter(c => c);
        return { 
            display: cats.slice(0, 3).join('<br>') + (cats.length > 3 ? '<br>...' : ''),
            tooltip: cats.join('&#10;')
        };
    };
    const searchingCategories = formatCategoriesVertical(match.categories);
    
    html += `
        <div style="margin-bottom:20px;">
            <h6 style="color:#495057; margin-bottom:10px; border-bottom:1px solid #dee2e6; padding-bottom:5px;">
                Searching For (Google Sheet Data)
            </h6>
            <div style="overflow-x:auto;">
                <table class="table table-sm table-bordered" style="font-size:0.85em; white-space:nowrap;">
                    <thead class="table-primary">
                        <tr>
                            <th>Row</th>
                            <th>Weekday</th>
                            <th>Brand / Linked</th>
                            <th>Category</th>
                            <th>Discount</th>
                            <th>Vendor %</th>
                            <th>Deal Info</th>
                            <th>Notes</th>
                            <th>Locations</th>
                            <th>More Info</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="background:#e7f1ff;">
                            <td>
                                <button class="btn btn-sm btn-outline-primary py-0 px-2" 
                                        onclick="openSheetRow(${match.google_row})" 
                                        title="Go to row in Google Sheet">
                                    ${match.google_row}
                                </button>
                            </td>
                            <td title="${searchingWeekdaysTooltip}" style="white-space:normal;"><strong>${searchingWeekdays}</strong></td>
                            <td><strong>${match.brand}</strong>${linkedBrandDisplay}</td>
                            <td title="${searchingCategories.tooltip}" style="white-space:normal;">${searchingCategories.display}</td>
                            <td><strong>${match.discount !== null && match.discount !== '' ? match.discount + '%' : '-'}</strong></td>
                            <td>${match.vendor_contrib !== null && match.vendor_contrib !== '' ? match.vendor_contrib + '%' : '-'}</td>
                            <td title="${match.deal_info || ''}">${(match.deal_info || '-').substring(0, 20)}${(match.deal_info || '').length > 20 ? '...' : ''}</td>
                            <td title="${match.special_notes || ''}">${(match.special_notes || '-').substring(0, 20)}${(match.special_notes || '').length > 20 ? '...' : ''}</td>
                            <td title="${formatLocationsVertical(match.locations)}">${(match.locations || '-').substring(0, 25)}${(match.locations || '').length > 25 ? '...' : ''}</td>
                            <td>
                                <div class="more-info-container" style="position:relative; display:inline-block;">
                                    <button class="btn btn-sm btn-outline-info py-0 px-2" 
                                            onclick="showMoreInfoPopup(this, 'sheet', ${rowIdx})"
                                            onmouseenter="showMoreInfoPopup(this, 'sheet', ${rowIdx})"
                                            title="View all Google Sheet fields">
                                        Info
                                    </button>
                                </div>
                                <button class="btn btn-sm btn-success py-0 px-2 ms-1" 
                                    onclick="useUnifiedPreFlightForIDMatcher(${rowIdx})"
                                    title="Create new deal in MIS based on this Google Sheet data">
                                    Create
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // v12.24.6: Helper function to determine End Date button color based on month comparison
    // RED = past month (expired), GREEN = current month, ORANGE = future month
    const getEndDateButtonColor = (endDateStr) => {
        const tabInfo = parseTabMonthYear(currentTabName);
        if (tabInfo.month < 0 || tabInfo.year < 0) {
            // Cannot parse tab name - use PURPLE as "unknown" indicator
            return { 
                btnClass: 'btn-secondary', 
                style: 'background:#6c757d; border-color:#6c757d; color:white;',
                tooltip: 'Cannot determine month from tab name: ' + currentTabName
            };
        }
        
        const parsedEnd = parseDate(endDateStr);
        if (!parsedEnd) {
            // Cannot parse date - use GRAY as "invalid" indicator
            return { 
                btnClass: 'btn-secondary', 
                style: 'background:#6c757d; border-color:#6c757d; color:white;',
                tooltip: 'Invalid date format: ' + endDateStr
            };
        }
        
        // Compare year and month
        const tabYearMonth = tabInfo.year * 12 + tabInfo.month;
        const endYearMonth = parsedEnd.year * 12 + parsedEnd.month;
        
        if (endYearMonth < tabYearMonth) {
            // End date is in a PAST month - RED (expired/needs update)
            return { 
                btnClass: 'btn-danger', 
                style: 'background:#dc3545; border-color:#dc3545; color:white;',
                tooltip: 'EXPIRED: End date is before ' + currentTabName + ' - needs update!'
            };
        } else if (endYearMonth === tabYearMonth) {
            // End date is in CURRENT month - GREEN (correct)
            return { 
                btnClass: 'btn-success', 
                style: 'background:#28a745; border-color:#28a745; color:white;',
                tooltip: 'CURRENT: End date is within ' + currentTabName
            };
        } else {
            // End date is in a FUTURE month - ORANGE (already extended)
            return { 
                btnClass: 'btn-warning', 
                style: 'background:#fd7e14; border-color:#fd7e14; color:white;',
                tooltip: 'FUTURE: End date extends beyond ' + currentTabName
            };
        }
    };

    // --- v12.24.8: ASSIGNED MIS ID SECTION (supports multiple IDs, proper comparison) ---
    const assignedMisIdRaw = match.current_sheet_id ? String(match.current_sheet_id).trim() : '';
    
    // v12.24.7: Helper to clean MIS ID by stripping tag prefixes (e.g., "W1 12345" ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ "12345")
    const cleanMisId = (rawId) => {
        if (!rawId) return '';
        const str = String(rawId).trim();
        // Pattern: optional tag prefix (letters + optional digits) followed by space, then the actual ID
        // Examples: "W1 12345", "M2 67890", "S1 11111", "12345" (no tag)
        const tagMatch = str.match(/^([A-Za-z]+\d*)\s+(\d+)$/);
        if (tagMatch) return tagMatch[2];
        // Also try: just extract the last numeric sequence
        const numMatch = str.match(/(\d+)\s*$/);
        if (numMatch) return numMatch[1];
        return str;
    };
    
    // v12.24.8: Extract tag from raw MIS ID (e.g., "W1 12345" ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ "W1")
    const extractTag = (rawId) => {
        if (!rawId) return '';
        const str = String(rawId).trim();
        const tagMatch = str.match(/^([A-Za-z]+\d*)\s+\d+$/);
        return tagMatch ? tagMatch[1] : '';
    };
    
    // v12.24.8: Parse multiple MIS IDs from cell (line-separated or tag-detected)
    // v12.25.2: Added STIIIZY ignore logic
    const parseMultipleMisIds = (rawValue) => {
        if (!rawValue) return [];
        const str = String(rawValue).trim();
        
        // v12.25.2: Ignore known notes/non-ID text
        const ignorePhrases = [
            'stiiizy monthly + weekly deal planner',
            'stiiizy monthly+ weekly deal planner',
            'stiiizy monthly and weekly deal planner',
            'deal planner'
        ];
        const lowerStr = str.toLowerCase();
        // Check if entire string is just a note to ignore
        if (ignorePhrases.some(phrase => lowerStr === phrase || lowerStr.includes(phrase) && !/\d/.test(str))) {
            return [];
        }
        
        // Split by newlines first
        let parts = str.split(/\n|\r\n|\r/).map(p => p.trim()).filter(p => p);
        // If only one part, check if it contains multiple tagged IDs (space-separated tags)
        if (parts.length === 1) {
            // Try to find multiple tagged IDs like "W1 12345 W2 67890"
            const multiTagMatch = str.match(/([A-Za-z]+\d*\s+\d+)/g);
            if (multiTagMatch && multiTagMatch.length > 1) {
                parts = multiTagMatch;
            }
        }
        
        // v12.25.2: Filter out parts that are just notes (no digits)
        return parts.filter(p => {
            const lower = p.toLowerCase();
            if (ignorePhrases.some(phrase => lower.includes(phrase))) return false;
            if (!/\d/.test(p)) return false;
            return true;
        });
    };
    
    // v12.24.8: Enhanced comparison helpers
    // Weekday comparison - GREEN if MIS weekdays contain the Google Sheet weekday(s)
    const getWeekdayMatchStyle = (sheetWeekday, misWeekdays) => {
        if (!sheetWeekday || sheetWeekday === '-') return '';
        if (!misWeekdays || misWeekdays === '-' || misWeekdays === 'N/A') return 'background:#fff3cd; color:#856404;';
        
        // Normalize both to lowercase arrays of 3-letter codes
        const normalize = (str) => {
            const days = ['mon','tue','wed','thu','fri','sat','sun'];
            const lower = String(str).toLowerCase();
            return days.filter(d => lower.includes(d));
        };
        
        // Get sheet weekdays (may be from multi-day group)
        let sheetDays = [];
        if (match.multi_day_group && match.multi_day_group.weekdays) {
            sheetDays = match.multi_day_group.weekdays
                .map(w => String(w).toLowerCase().substring(0,3))
                .filter(w => w && !w.includes('missing'));
        } else {
            sheetDays = normalize(sheetWeekday);
        }
        
        const misDays = normalize(misWeekdays);
        
        if (sheetDays.length === 0 || misDays.length === 0) return 'background:#fff3cd; color:#856404;';
        
        // Check if all sheet days are in MIS days (MIS can have more, that's OK)
        const allMatch = sheetDays.every(d => misDays.includes(d));
        return allMatch ? 'background:#d4edda; color:#155724;' : 'background:#fff3cd; color:#856404;';
    };
    
    // v12.24.8: Category comparison - handles "All", blank=All, specific lists, "All Except"
    // v12.25.0: Category comparison - SET-BASED (order independent) with NaN/blank = All
    const getCategoryMatchStyle = (sheetCategory, misCategory) => {
        const sheetCat = String(sheetCategory || '').toLowerCase().trim();
        const misCat = String(misCategory || '').toLowerCase().trim();
        
        // v12.25.0: Treat blank/empty/NaN as "All" (universal match)
        const isSheetAll = !sheetCat || sheetCat === 'all' || sheetCat === '-' || 
                           sheetCat === 'all categories' || sheetCat.includes('all categories') ||
                           sheetCat === 'nan' || sheetCat === 'null' || sheetCat === 'undefined';
        const isMisAll = !misCat || misCat === 'all' || misCat === '-' || 
                         misCat === 'n/a' || misCat === 'nan' || misCat === 'all categories' ||
                         misCat === 'null' || misCat === 'undefined';
        
        // Check for "All Except" pattern
        const sheetExceptMatch = sheetCat.match(/all\s*(?:categories\s*)?except[:\s]*(.+)/i);
        const misExceptMatch = misCat.match(/all\s*(?:categories\s*)?except[:\s]*(.+)/i);
        
        // Both are "All" - GREEN
        if (isSheetAll && isMisAll) return 'background:#d4edda; color:#155724;';
        
        // Sheet is "All Except X" - compare exclusions as sets
        if (sheetExceptMatch) {
            if (misExceptMatch) {
                const sheetExcepts = new Set(sheetExceptMatch[1].split(',').map(s => s.trim().toLowerCase()).filter(s => s));
                const misExcepts = new Set(misExceptMatch[1].split(',').map(s => s.trim().toLowerCase()).filter(s => s));
                // Set equality check
                const setsEqual = sheetExcepts.size === misExcepts.size && 
                                 [...sheetExcepts].every(x => misExcepts.has(x));
                return setsEqual ? 'background:#d4edda; color:#155724;' : 'background:#fff3cd; color:#856404;';
            }
            return 'background:#fff3cd; color:#856404;';
        }
        
        // One is All, other is specific - YELLOW (mismatch)
        if (isSheetAll !== isMisAll) return 'background:#fff3cd; color:#856404;';
        
        // v12.25.0: Both are specific lists - SET-BASED comparison (order independent)
        const sheetSet = new Set(sheetCat.split(',').map(s => s.trim().toLowerCase()).filter(s => s));
        const misSet = new Set(misCat.split(',').map(s => s.trim().toLowerCase()).filter(s => s));
        
        // Set equality: same size and all elements match
        const setsEqual = sheetSet.size === misSet.size && [...sheetSet].every(x => misSet.has(x));
        return setsEqual ? 'background:#d4edda; color:#155724;' : 'background:#fff3cd; color:#856404;';
    };
    
    // v12.25.0: Location comparison - SET-BASED (order independent) with NaN/blank = All
    // v12.26.1: Master store list for "All Locations Except" set expansion
    const ALL_STORES_JS = new Set([
        'davis', 'dixon', 'beverly hills', 'el sobrante',
        'fresno (palm)', 'fresno (shaw)', 'hawthorne',
        'koreatown', 'laguna woods', 'oxnard',
        'riverside', 'west hollywood'
    ]);

    // v12.26.1: Normalize a single store name to canonical form (lowercase)
    const _STORE_NORM_MAP = {
        'beverly': 'beverly hills',
        'fresno': 'fresno (palm)',
        'fresno palm': 'fresno (palm)',
        'fresno shaw': 'fresno (shaw)',
    };
    const normalizeStoreJS = (name) => {
        const n = name.toLowerCase().trim()
            .replace(/^(the artist tree|davisville business enterprises,?\s*inc\.?|club 420)\s*[-\u2013\u2014]?\s*/i, '');
        return _STORE_NORM_MAP[n] || n;
    };

    // v12.26.2: Parse any location string into a normalized Set of store names
    // Detects "All Locations Except:" ANYWHERE in string (not just at start)
    const parseLocationSet = (locStr) => {
        const s = String(locStr || '').trim().toLowerCase();
        if (!s || s === '-' || s === 'nan' || s === 'n/a' || s === 'null' || s === 'undefined' ||
            s === 'all' || s === 'all locations') {
            return { isAll: true, stores: new Set(ALL_STORES_JS), isExcept: false };
        }
        // v12.26.3: "All Locations Except: X, Y" or "All Locations (Except: X, Y)"
        // Handles both parenthesized and non-parenthesized formats ANYWHERE in string
        const exceptMatch = s.match(/all\s*(?:locations\s*)?[\s(]*except[):\s]*(.+)/i);
        if (exceptMatch) {
            // Filter to only known stores (discards trailing garbage like "- 20% off")
            const exceptions = new Set(
                exceptMatch[1].split(',')
                    .map(e => normalizeStoreJS(e))
                    .filter(e => e && ALL_STORES_JS.has(e))
            );
            const included = new Set([...ALL_STORES_JS].filter(st => !exceptions.has(st)));
            return { isAll: false, stores: included, isExcept: true, exceptions };
        }
        // Comma-separated explicit list
        const stores = new Set(s.split(',').map(e => normalizeStoreJS(e)).filter(e => e));
        // If all 12 stores listed, treat as "All"
        if (stores.size >= ALL_STORES_JS.size && [...ALL_STORES_JS].every(st => stores.has(st))) {
            return { isAll: true, stores: new Set(ALL_STORES_JS), isExcept: false };
        }
        return { isAll: false, stores, isExcept: false };
    };

    const getLocationMatchStyle = (sheetLocations, misLocations) => {
        const GREEN = 'background:#d4edda; color:#155724;';
        const YELLOW = 'background:#fff3cd; color:#856404;';

        const sheet = parseLocationSet(sheetLocations);
        const mis = parseLocationSet(misLocations);

        // Both All â†’ GREEN
        if (sheet.isAll && mis.isAll) return GREEN;

        // Compare as normalized sets (handles All Except vs explicit list)
        const setsEqual = sheet.stores.size === mis.stores.size &&
                          [...sheet.stores].every(x => mis.stores.has(x));
        return setsEqual ? GREEN : YELLOW;
    };
    
    // v12.24.8: Parse multiple assigned MIS IDs
    const assignedMisIds = parseMultipleMisIds(assignedMisIdRaw);
    
    if (assignedMisIds.length > 0) {
        html += `
            <div style="margin-bottom:20px;">
                <h6 style="color:#198754; margin-bottom:10px; border-bottom:2px solid #198754; padding-bottom:5px;">
                    ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Currently Assigned in Google Sheet
                    ${assignedMisIds.length > 1 ? '<small style="color:#6c757d; font-weight:normal;"> (' + assignedMisIds.length + ' IDs)</small>' : ''}
                </h6>
                <div style="overflow-x:auto;">
                    <table class="table table-sm table-bordered" style="font-size:0.85em; white-space:nowrap; border:2px solid #198754;">
                        <thead style="background:#d4edda;">
                            <tr>
                                <th>Status</th>
                                <th>MIS ID</th>
                                <th>Weekday</th>
                                <th>Brand / Linked</th>
                                <th>Category</th>
                                <th>Discount</th>
                                <th>Vendor %</th>
                                <th>Locations</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>More Info</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        // v12.24.8: Render each assigned MIS ID as its own row
        assignedMisIds.forEach((rawId, aIdx) => {
            const cleanId = cleanMisId(rawId);
            const tag = extractTag(rawId);
            const assignedSuggestion = match.suggestions.find(s => String(s.mis_id) === cleanId);
            
            if (assignedSuggestion) {
                // We have full data for the assigned ID
                const aData = assignedSuggestion.mis_data;
                const aLinkedBrand = aData.linked_brand && aData.linked_brand !== 'N/A' ? aData.linked_brand : '';
                const aWeekday = aData.weekdays && aData.weekdays !== 'N/A' ? aData.weekdays : '-';
                const aCategory = aData.category && aData.category !== 'N/A' && aData.category !== '-' && aData.category !== 'nan' ? aData.category : '';
                const aDiscount = aData.discount !== null && aData.discount !== undefined ? aData.discount : '-';
                const aVendor = aData.vendor_contribution !== null && aData.vendor_contribution !== undefined ? aData.vendor_contribution : '-';
                const aLocations = aData.locations || '';
                const aStartDate = aData.start_date && aData.start_date !== 'N/A' ? aData.start_date : '-';
                const aEndDate = aData.end_date && aData.end_date !== 'N/A' ? aData.end_date : '-';
                
                // v12.24.8: Get end date button color with proper styling
                const endDateColor = getEndDateButtonColor(aEndDate);
                const endBtnStyle = endDateColor.style || 'background:#6c757d; border-color:#6c757d; color:white;';
                
                // Format weekday/category for display
                const aWeekdayParts = aWeekday.split(',').map(w => w.trim()).filter(w => w && w !== '-');
                const aWeekdayDisplay = aWeekdayParts.length > 0 ? aWeekdayParts.join('<br>') : '-';
                const aWeekdayTooltip = aWeekdayParts.length > 0 ? aWeekdayParts.join('&#10;') : '-';
                const aCategoryDisplay = aCategory || 'All Categories';
                const aCategoryParts = aCategoryDisplay.split(',').map(c => c.trim()).filter(c => c);
                const aCategoryDisplayShort = aCategoryParts.slice(0, 3).join('<br>') + (aCategoryParts.length > 3 ? '<br>...' : '');
                const aCategoryTooltip = aCategoryParts.join('&#10;');
                const aLocationsDisplay = aLocations || 'All Locations';
                
                // v12.24.8: Enhanced color coding for all comparable fields
                const weekdayStyle = getWeekdayMatchStyle(match.weekday, aWeekday);
                const brandStyle = getBrandMatchStyle(match.brand, aData.brand);
                const categoryStyle = getCategoryMatchStyle(match.categories, aCategory);
                const discountStyle = getMatchStyle(match.discount, aDiscount, true);
                const vendorStyle = getMatchStyle(match.vendor_contrib, aVendor, true);
                const locationStyle = getLocationMatchStyle(match.locations, aLocations);
                
                html += `
                    <tr style="background:#e8f5e9;">
                        <td style="text-align:center; background:#d4edda;">
                            <span style="color:#198754; font-weight:bold;">ASSIGNED</span>
                            ${tag ? '<br><small style="color:#6c757d;">(' + tag + ')</small>' : ''}
                        </td>
                        <td>
                            <button class="btn btn-sm btn-success py-0 px-2" 
                                    onclick="lookupMisIdWithValidation(this, '${cleanId}')" 
                                    style="font-weight:bold;" 
                                    title="Click to lookup in MIS">
                                ${cleanId}
                            </button>
                        </td>
                        <td title="${aWeekdayTooltip}" style="${weekdayStyle} white-space:normal;">${aWeekdayDisplay}</td>
                        <td style="${brandStyle}">
                            <strong>${aData.brand || '-'}</strong>
                            ${aLinkedBrand ? '<br><small style="color:#6c757d;">' + aLinkedBrand + '</small>' : ''}
                        </td>
                        <td title="${aCategoryTooltip}" style="${categoryStyle} white-space:normal;">${aCategoryDisplayShort}</td>
                        <td style="${discountStyle}"><strong>${aDiscount}%</strong></td>
                        <td style="${vendorStyle}">${aVendor}%</td>
                        <td title="${formatLocationsVertical(aLocationsDisplay)}" style="${locationStyle}">${aLocationsDisplay.substring(0, 20)}${aLocationsDisplay.length > 20 ? '...' : ''}</td>
                        <td>${aStartDate}</td>
                        <td title="${endDateColor.tooltip}">
                            <div id="end-date-display-assigned-${aIdx}">
                                <button class="btn btn-sm py-0 px-1" 
                                        style="${endBtnStyle}"
                                        onclick="showEndDateEditor('assigned', ${aIdx}, '${cleanId}', '${aEndDate}')"
                                        title="${endDateColor.tooltip}">
                                    ${aEndDate}
                                </button>
                            </div>
                            <div id="end-date-editor-assigned-${aIdx}" style="display:none;">
                                <div style="display:flex; gap:2px; align-items:center; flex-wrap:wrap;">
                                    <select id="end-month-assigned-${aIdx}" class="form-select form-select-sm" style="width:60px; padding:2px;">
                                        <option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option>
                                        <option value="04">Apr</option><option value="05">May</option><option value="06">Jun</option>
                                        <option value="07">Jul</option><option value="08">Aug</option><option value="09">Sep</option>
                                        <option value="10">Oct</option><option value="11">Nov</option><option value="12">Dec</option>
                                    </select>
                                    <select id="end-day-assigned-${aIdx}" class="form-select form-select-sm" style="width:55px; padding:2px;"></select>
                                    <select id="end-year-assigned-${aIdx}" class="form-select form-select-sm" style="width:70px; padding:2px;"></select>
                                    <button class="btn btn-sm btn-success py-0 px-2" onclick="updateMisEndDate('assigned', ${aIdx}, '${cleanId}')">Update</button>
                                    <button class="btn btn-sm btn-secondary py-0 px-1" onclick="cancelEndDateEditor('assigned', ${aIdx})">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢</button>
                                </div>
                            </div>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-outline-info py-0 px-2" 
                                    onclick="lookupMisIdWithValidation(this, '${cleanId}')"
                                    title="View full details in MIS">
                                View
                            </button>
                        </td>
                        <td>
                            <span class="badge bg-success">Current</span>
                        </td>
                    </tr>
                `;
            } else {
                // Assigned ID not found in suggestions - show minimal info
                html += `
                    <tr style="background:#e8f5e9;">
                        <td style="text-align:center; background:#d4edda;">
                            <span style="color:#198754; font-weight:bold;">ASSIGNED</span>
                            ${tag ? '<br><small style="color:#6c757d;">(' + tag + ')</small>' : ''}
                        </td>
                        <td>
                            <button class="btn btn-sm btn-success py-0 px-2" 
                                    onclick="lookupMisIdWithValidation(this, '${cleanId}')" 
                                    style="font-weight:bold;" 
                                    title="Click to lookup in MIS">
                                ${cleanId}
                            </button>
                        </td>
                        <td colspan="8" style="text-align:center; color:#6c757d; font-style:italic;">
                            MIS ID not found in current CSV data - click ID to view in MIS
                        </td>
                        <td>
                            <button class="btn btn-sm btn-outline-info py-0 px-2" 
                                    onclick="lookupMisIdWithValidation(this, '${cleanId}')"
                                    title="View full details in MIS">
                                View
                            </button>
                        </td>
                        <td>
                            <span class="badge bg-success">Current</span>
                        </td>
                    </tr>
                `;
            }
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // --- SUGGESTIONS SECTION ---
    html += `
        <div>
            <h6 style="color:#495057; margin-bottom:10px; border-bottom:1px solid #dee2e6; padding-bottom:5px;">
                Suggested Matches from MIS CSV <small class="text-muted">(${match.suggestions.length} found)</small>
            </h6>
            <div style="overflow-x:auto;">
                <table class="table table-sm table-bordered table-hover" style="font-size:0.85em; white-space:nowrap;">
                    <thead class="table-light">
                        <tr>
                            <th>Conf.</th>
                            <th>MIS ID</th>
                            <th>Weekday</th>
                            <th>Brand / Linked</th>
                            <th>Category</th>
                            <th>Discount</th>
                            <th>Vendor %</th>
                            <th>Locations</th>
                            <th>Start Date</th>
                            <th>End Date</th>
                            <th>More Info</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    match.suggestions.forEach((s, sIdx) => {
        // Confidence color
        const confColor = s.confidence >= 90 ? '#28a745' : (s.confidence >= 70 ? '#ffc107' : '#dc3545');
        const confBg = s.confidence >= 90 ? '#d4edda' : (s.confidence >= 70 ? '#fff3cd' : '#f8d7da');
        
        // Get values from suggestion
        const sLinkedBrand = s.mis_data.linked_brand && s.mis_data.linked_brand !== 'N/A' ? s.mis_data.linked_brand : '';
        const sWeekday = s.mis_data.weekdays && s.mis_data.weekdays !== 'N/A' ? s.mis_data.weekdays : '-';
        const sCategory = s.mis_data.category && s.mis_data.category !== 'N/A' && s.mis_data.category !== '-' && s.mis_data.category !== 'nan' ? s.mis_data.category : 'All Categories';
        const sDiscount = s.mis_data.discount !== null && s.mis_data.discount !== undefined ? s.mis_data.discount : '-';
        const sVendor = s.mis_data.vendor_contribution !== null && s.mis_data.vendor_contribution !== undefined ? s.mis_data.vendor_contribution : '-';
        const sLocations = s.mis_data.locations || '-';
        const sLocationsVertical = formatLocationsVertical(sLocations);
        const sStartDate = s.mis_data.start_date && s.mis_data.start_date !== 'N/A' ? s.mis_data.start_date : '-';
        const sEndDate = s.mis_data.end_date && s.mis_data.end_date !== 'N/A' ? s.mis_data.end_date : '-';
        
        // v12.1: Format weekday vertically with tooltip
        const sWeekdayParts = sWeekday.split(',').map(w => w.trim()).filter(w => w && w !== '-');
        const sWeekdayDisplay = sWeekdayParts.length > 0 ? sWeekdayParts.join('<br>') : '-';
        const sWeekdayTooltip = sWeekdayParts.length > 0 ? sWeekdayParts.join('&#10;') : '-';
        
        // v12.1: Format category vertically with tooltip
        const sCategoryParts = sCategory === 'All Categories' ? ['All Categories'] : sCategory.split(',').map(c => c.trim()).filter(c => c);
        const sCategoryDisplay = sCategoryParts.slice(0, 3).join('<br>') + (sCategoryParts.length > 3 ? '<br>...' : '');
        const sCategoryTooltip = sCategoryParts.join('&#10;');
        
        // v12.24.8: Enhanced color coding for all comparable fields
        const weekdayStyle = getWeekdayMatchStyle(match.weekday, sWeekday);
        const brandStyle = getBrandMatchStyle(match.brand, s.mis_data.brand);
        const categoryStyle = getCategoryMatchStyle(match.categories, s.mis_data.category);
        const discountStyle = getMatchStyle(match.discount, sDiscount, true);
        const vendorStyle = getMatchStyle(match.vendor_contrib, sVendor, true);
        const locationStyle = getLocationMatchStyle(match.locations, sLocations);
        
        // v12.1: Check Continue/Recycle eligibility
        const continueCheck = checkContinueEligibility(match, s, match.section || 'weekly');
        
        // v12.1: Build Continue/New Entry indicator
        let continueIndicator = '';
        let endDateStyle = '';
        let endDateTooltip = sEndDate;
        
        if (continueCheck.isContinue) {
            if (continueCheck.needsManualReview) {
                continueIndicator = '<br><span style="color:#856404; font-size:0.75em; font-weight:bold;">CONTINUE*</span>';
                endDateStyle = 'background:#fff3cd; font-weight:bold;';
                endDateTooltip = 'MANUAL REVIEW NEEDED: End date (' + sEndDate + ') is already within target month. Verify if extension to ' + continueCheck.newEndDate + ' is needed.';
            } else {
                continueIndicator = '<br><span style="color:#155724; font-size:0.75em; font-weight:bold;">CONTINUE</span>';
                endDateStyle = 'background:#fff3cd; font-weight:bold;';
                endDateTooltip = 'UPDATE END DATE: Change from ' + sEndDate + ' to ' + continueCheck.newEndDate + ' (last day of ' + currentTabName + ')';
            }
            // v12.1: Add warning if MIS needs linked brand
            if (continueCheck.needsLinkedBrand) {
                continueIndicator += '<br><span style="color:#856404; font-size:0.65em; background:#fff3cd; padding:1px 3px; border-radius:2px;" title="Google Sheet has Linked Brand but MIS entry does not">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Needs Linked Brand</span>';
            }
        } else {
            // Not a Continue - show as NEW ENTRY
            if (continueCheck.cannotDetermineDate) {
                // Can't determine Continue status due to unparseable tab name
                continueIndicator = '<br><span style="color:#856404; font-size:0.75em; font-weight:bold; background:#fff3cd; padding:1px 3px; border-radius:2px;" title="Cannot determine Continue eligibility - tab name could not be parsed for date">? UNDETERMINED</span>';
                if (continueCheck.mismatches.length > 0) {
                    continueIndicator += '<br><span style="color:#dc3545; font-size:0.65em;">Diff: ' + continueCheck.mismatches.join(', ') + '</span>';
                }
            } else {
                continueIndicator = '<br><span style="color:#721c24; font-size:0.75em; font-weight:bold;">NEW ENTRY</span>';
                if (continueCheck.mismatches.length > 0) {
                    continueIndicator += '<br><span style="color:#dc3545; font-size:0.65em;">Diff: ' + continueCheck.mismatches.join(', ') + '</span>';
                }
            }
            // v12.1: Also show needs linked brand warning for NEW ENTRY
            if (continueCheck.needsLinkedBrand) {
                continueIndicator += '<br><span style="color:#856404; font-size:0.65em; background:#fff3cd; padding:1px 3px; border-radius:2px;" title="Google Sheet has Linked Brand but MIS entry does not">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Needs Linked Brand</span>';
            }
        }
        
        const rawCsvDataJson = s.mis_data.raw_csv_data ? escapeForAttr(JSON.stringify(s.mis_data.raw_csv_data)) : '{}';
        
        // v12.24.8: Get end date button color with fallback styling
        const suggEndDateColor = getEndDateButtonColor(sEndDate);
        const suggEndBtnStyle = suggEndDateColor.style || 'background:#6c757d; border-color:#6c757d; color:white;';
        
        html += `
            <tr>
                <td style="background:${confBg}; text-align:center;">
                    <span style="color:${confColor}; font-weight:bold;">${s.confidence}%</span>
                    ${continueIndicator}
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2" 
                            onclick="lookupMisIdWithValidation(this, '${s.mis_id}')" 
                            style="font-weight:bold;" 
                            title="Click to lookup in MIS">
                        ${s.mis_id}
                    </button>
                </td>
                <td title="${sWeekdayTooltip}" style="${weekdayStyle} white-space:normal;">${sWeekdayDisplay}</td>
                <td style="${brandStyle}">
                    <strong>${s.mis_data.brand}</strong>
                    ${sLinkedBrand ? '<br><small style="color:#6c757d;">' + sLinkedBrand + '</small>' : ''}
                </td>
                <td title="${sCategoryTooltip}" style="${categoryStyle} white-space:normal;">${sCategoryDisplay}</td>
                <td style="${discountStyle}"><strong>${sDiscount}%</strong></td>
                <td style="${vendorStyle}">${sVendor}%</td>
                <td title="${sLocationsVertical}" style="${locationStyle}">${sLocations.substring(0, 20)}${sLocations.length > 20 ? '...' : ''}</td>
                <td>${sStartDate}</td>
                <td style="${endDateStyle}" title="${endDateTooltip}">
                    <div id="end-date-display-${rowIdx}-${sIdx}">
                        <button class="btn btn-sm py-0 px-1" 
                                style="${suggEndBtnStyle}"
                                onclick="showEndDateEditor(${rowIdx}, ${sIdx}, '${s.mis_id}', '${sEndDate}')"
                                title="${suggEndDateColor.tooltip}">
                            ${sEndDate}
                        </button>
                    </div>
                    <div id="end-date-editor-${rowIdx}-${sIdx}" style="display:none;">
                        <div style="display:flex; gap:2px; align-items:center; flex-wrap:wrap;">
                            <select id="end-month-${rowIdx}-${sIdx}" class="form-select form-select-sm" style="width:60px; padding:2px;">
                                <option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option>
                                <option value="04">Apr</option><option value="05">May</option><option value="06">Jun</option>
                                <option value="07">Jul</option><option value="08">Aug</option><option value="09">Sep</option>
                                <option value="10">Oct</option><option value="11">Nov</option><option value="12">Dec</option>
                            </select>
                            <select id="end-day-${rowIdx}-${sIdx}" class="form-select form-select-sm" style="width:55px; padding:2px;"></select>
                            <select id="end-year-${rowIdx}-${sIdx}" class="form-select form-select-sm" style="width:70px; padding:2px;"></select>
                            <button class="btn btn-sm btn-success py-0 px-2" onclick="updateMisEndDate(${rowIdx}, ${sIdx}, '${s.mis_id}')">Update</button>
                            <button class="btn btn-sm btn-secondary py-0 px-1" onclick="cancelEndDateEditor(${rowIdx}, ${sIdx})">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢</button>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="more-info-container" style="position:relative; display:inline-block;">
                        <button class="btn btn-sm btn-outline-info py-0 px-2" 
                                onclick="showMoreInfoPopup(this, 'csv', ${rowIdx}, ${sIdx})"
                                onmouseenter="showMoreInfoPopup(this, 'csv', ${rowIdx}, ${sIdx})"
                                title="View all MIS CSV fields">
                            Info
                        </button>
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" 
                        onclick="applySuggestionFromModal(${rowIdx}, '${s.mis_id}')">
                        Select
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
        
        <div style="margin-top:15px; padding-top:10px; border-top:1px solid #dee2e6; text-align:right;">
            <small class="text-muted">Field Match: </small>
            <span class="badge" style="background:#d4edda; color:#155724;">Match</span>
            <span class="badge" style="background:#fff3cd; color:#856404;">Partial/Missing</span>
            <span class="badge" style="background:#f8d7da; color:#721c24;">Mismatch</span>
            <span style="margin-left:15px;"></span>
            <small class="text-muted">End Date: </small>
            <span class="badge" style="background:#dc3545; color:white;">Past Month</span>
            <span class="badge" style="background:#28a745; color:white;">Current Month</span>
            <span class="badge" style="background:#fd7e14; color:white;">Future Month</span>
        </div>
    `;
    
    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

// v12.2: End Date Editor functions for updating MIS end dates
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
        
        const response = await api.automation.autoCreate({
                google_row: match.google_row,
                start_date: `${startMonth}/${startDay}/${startYear}`,
                end_date: `${endMonth}/${endDay}/${endYear}`,
                section_type: match.section_type || 'weekly',
                sheet_data: sheetPayload
            });
        
        const data = await response.json();
        
        // Remove loading
        document.getElementById('create-deal-loading')?.remove();
        
        if (data.success) {
            let message = '✅ Deal created in MIS!\\n\\n';
            if (data.warnings && data.warnings.length > 0) {
                message += '⚠️ Warnings:\\n' + data.warnings.join('\\n') + '\\n\\n';
            }
            message += 'Please review and click Save in MIS if everything looks correct.';
            alert(message);
        } else {
            alert('Error creating deal: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        document.getElementById('create-deal-loading')?.remove();
        alert('Error: ' + error.message);
    }
}

// v12.1: More Info popup for detailed field view - CENTERED on screen
function showMoreInfoPopup(btn, type, rowIdx, suggestionIdx = null) {
    // Remove any existing more-info popups
    const existingPopup = document.getElementById('more-info-popup');
    if (existingPopup) existingPopup.remove();
    
    const match = matchesData[rowIdx];
    if (!match) return;
    
    let data = {};
    let title = '';
    
    if (type === 'sheet') {
        data = match.raw_row_data || {};
        title = 'Google Sheet - All Fields';
    } else if (type === 'csv' && suggestionIdx !== null && match.suggestions[suggestionIdx]) {
        data = match.suggestions[suggestionIdx].mis_data.raw_csv_data || {};
        title = 'MIS CSV - All Fields';
    }
    
    if (Object.keys(data).length === 0) {
        return;
    }
    
    // Create popup - CENTERED on screen
    const popup = document.createElement('div');
    popup.id = 'more-info-popup';
    popup.style.cssText = `
        position: fixed; z-index: 10001;
        background: #fff; border: 1px solid #ccc; border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        padding: 15px; max-width: 500px; max-height: 500px;
        overflow-y: auto;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%);
    `;
    
    // Build content
    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
            <strong style="color:#007bff;">${title}</strong>
            <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="document.getElementById('more-info-popup').remove()">X</button>
        </div>
        <table class="table table-sm table-bordered" style="font-size:0.8em; margin:0;">
            <thead><tr><th style="width:40%;">Field</th><th>Value</th></tr></thead>
            <tbody>
    `;
    
    Object.entries(data).forEach(([key, val]) => {
        const displayVal = String(val).length > 100 ? String(val).substring(0, 100) + '...' : val;
        html += `<tr><td><strong>${key}</strong></td><td title="${String(val).replace(/"/g, '&quot;')}">${displayVal}</td></tr>`;
    });
    
    html += '</tbody></table>';
    popup.innerHTML = html;
    
    document.body.appendChild(popup);
    
    // Close on mouse leave after delay
    let closeTimeout = null;
    popup.onmouseenter = () => { if (closeTimeout) clearTimeout(closeTimeout); };
    popup.onmouseleave = () => { closeTimeout = setTimeout(() => popup.remove(), 300); };
    btn.onmouseleave = () => { closeTimeout = setTimeout(() => popup.remove(), 300); };
}

// Helper function to apply ID from the modal and close it
function applySuggestionFromModal(rowIdx, misId) {
    const input = document.getElementById(`input-mis-${rowIdx}`);
    if (input) {
        input.value = misId;
        // Highlight the input to show it changed
        input.style.backgroundColor = '#d4edda';
        setTimeout(() => { input.style.backgroundColor = ''; }, 1000);
    }
    // Close modal
    const overlay = document.getElementById('suggestion-modal-overlay');
    if (overlay) overlay.remove();
}

// v12.5: Enhanced applyMatches with mode parameter (mis, blaze, all)
async function applyMatches(mode = 'all') {
    // Check if there's anything to apply based on mode
    const hasMisIds = Object.keys(approvedMatches).some(row => {
        const data = approvedMatches[row];
        return data.mis_ids && data.mis_ids.length > 0;
    });
    const hasBlazeTitles = Object.keys(approvedMatches).some(row => {
        const data = approvedMatches[row];
        return data.blaze_titles && data.blaze_titles.length > 0;
    });
    
    if (mode === 'mis' && !hasMisIds) {
        alert('No MIS IDs approved yet');
        return;
    }
    if (mode === 'blaze' && !hasBlazeTitles) {
        alert('No Blaze Titles selected yet');
        return;
    }
    if (mode === 'all' && !hasMisIds && !hasBlazeTitles) {
        alert('No matches approved yet');
        return;
    }
    
    const btn = event.target;
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Applying...';
    
    try {
        let misUpdated = 0, blazeUpdated = 0;
        
        // Apply MIS IDs if mode is 'mis' or 'all'
        if ((mode === 'mis' || mode === 'all') && hasMisIds) {
            const data = await api.matcher.applyMatches({matches: approvedMatches});
            if (data.success) {
                misUpdated = data.updated || 0;
            } else {
                throw new Error('MIS ID Apply Error: ' + data.error);
            }
        }
        
        // Apply Blaze Titles if mode is 'blaze' or 'all'
        if ((mode === 'blaze' || mode === 'all') && hasBlazeTitles) {
            const blazeData = await api.matcher.applyBlaze({matches: approvedMatches});
            if (blazeData.success) {
                blazeUpdated = blazeData.updated || 0;
            } else {
                throw new Error('Blaze Title Apply Error: ' + blazeData.error);
            }
        }
        
        // Update table visually
        const rowToIndices = {};
        matchesData.forEach((m, idx) => {
            if (!rowToIndices[m.google_row]) {
                rowToIndices[m.google_row] = [];
            }
            rowToIndices[m.google_row].push(idx);
        });
        
        Object.keys(approvedMatches).forEach(googleRow => {
            const approvedData = approvedMatches[googleRow];
            const indices = rowToIndices[googleRow] || [];
            
            // Get applied IDs
            let appliedIds = [];
            if (approvedData.mis_ids && Array.isArray(approvedData.mis_ids)) {
                appliedIds = approvedData.mis_ids;
            } else if (approvedData.mis_id) {
                appliedIds = [approvedData.mis_id];
            }
            
            const appliedIdDisplay = appliedIds.join(', ');
            
            indices.forEach((idx, i) => {
                const specificId = appliedIds[i] || appliedIdDisplay;
                
                if (matchesData[idx]) {
                    if (mode === 'mis' || mode === 'all') {
                        matchesData[idx].current_sheet_id = specificId;
                        matchesData[idx].matched_mis_id = specificId;
                    }
                    if (mode === 'blaze' || mode === 'all') {
                        matchesData[idx].blaze_titles = approvedData.blaze_titles || [];
                    }
                }
                
                const row = document.getElementById('match-row-' + idx);
                if (row) {
                    row.style.backgroundColor = '#d4edda';
                    row.style.borderLeft = '4px solid #28a745';
                    row.classList.add('row-applied');
                    
                    // Update Current ID column if MIS was applied
                    if ((mode === 'mis' || mode === 'all') && specificId) {
                        const cells = row.getElementsByTagName('td');
                        if (cells.length >= 12) {
                            const currentIdCell = cells[11];
                            currentIdCell.innerHTML = `<span style="cursor:pointer; font-weight:bold; padding:2px 6px; border-radius:4px; 
                                background:#d4edda; color:#155724; border:1px solid #28a745;
                                text-decoration:underline; display:inline-block; margin:2px;"
                                onclick="lookupMisIdWithValidation(this, '${specificId}')">${specificId}</span>
                                <span class="badge bg-success ms-1">Applied</span>`;
                        }
                    }
                    
                    // Update Blaze button indicator if Blaze was applied
                    if ((mode === 'blaze' || mode === 'all') && approvedData.blaze_titles && approvedData.blaze_titles.length > 0) {
                        const blazeBtn = row.querySelector('.btn-blaze');
                        if (blazeBtn) {
                            blazeBtn.classList.remove('btn-outline-primary');
                            blazeBtn.classList.add('btn-success');
                            blazeBtn.innerHTML = '<i class="bi bi-lightning-charge-fill"></i> ' + approvedData.blaze_titles.length;
                        }
                    }
                    
                    // Disable action buttons
                    const approveBtn = row.querySelector('.btn-approve');
                    const rejectBtn = row.querySelector('.btn-reject');
                    if (approveBtn) {
                        approveBtn.disabled = true;
                        approveBtn.style.opacity = '0.5';
                    }
                    if (rejectBtn) {
                        rejectBtn.disabled = true;
                        rejectBtn.style.opacity = '0.5';
                    }
                }
            });
        });
        
        // Build result message
        let resultMsg = '[OK] Applied successfully!\n';
        if (mode === 'mis') resultMsg += 'MIS IDs updated: ' + misUpdated + ' rows';
        else if (mode === 'blaze') resultMsg += 'Blaze Titles updated: ' + blazeUpdated + ' rows';
        else resultMsg += 'MIS IDs: ' + misUpdated + ' rows\nBlaze Titles: ' + blazeUpdated + ' rows';
        
        alert(resultMsg);
        
        // Clear applied entries from approvedMatches based on mode
        if (mode === 'all') {
            approvedMatches = {};
        } else {
            // Only clear the part that was applied
            Object.keys(approvedMatches).forEach(row => {
                if (mode === 'mis') {
                    approvedMatches[row].mis_ids = [];
                    approvedMatches[row].brands = [];
                } else if (mode === 'blaze') {
                    approvedMatches[row].blaze_titles = [];
                }
                // If both are empty, remove the entry
                const d = approvedMatches[row];
                if ((!d.mis_ids || d.mis_ids.length === 0) && (!d.blaze_titles || d.blaze_titles.length === 0)) {
                    delete approvedMatches[row];
                }
            });
        }
        
        updateApplyButtonsVisibility();
        
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// v12.5: Update visibility of apply buttons based on approved data
function updateApplyButtonsVisibility() {
    const container = document.getElementById('apply-btns-container');
    if (!container) return;
    
    const hasMisIds = Object.keys(approvedMatches).some(row => {
        const data = approvedMatches[row];
        return data.mis_ids && data.mis_ids.length > 0;
    });
    const hasBlazeTitles = Object.keys(approvedMatches).some(row => {
        const data = approvedMatches[row];
        return data.blaze_titles && data.blaze_titles.length > 0;
    });
    
    container.style.display = (hasMisIds || hasBlazeTitles) ? 'flex' : 'none';
    container.style.gap = '5px';
    
    // Enable/disable individual buttons
    const misBtn = document.getElementById('apply-mis-btn');
    const blazeBtn = document.getElementById('apply-blaze-btn');
    const allBtn = document.getElementById('apply-all-btn');
    
    if (misBtn) {
        misBtn.disabled = !hasMisIds;
        misBtn.style.opacity = hasMisIds ? '1' : '0.5';
    }
    if (blazeBtn) {
        blazeBtn.disabled = !hasBlazeTitles;
        blazeBtn.style.opacity = hasBlazeTitles ? '1' : '0.5';
    }
    if (allBtn) {
        allBtn.disabled = !(hasMisIds || hasBlazeTitles);
    }
}

// ============================================================================
// v12.5: BLAZE DISCOUNT SELECTION MODAL
// ============================================================================

// Global state for Blaze modal
let blazeModalData = {
    rowIdx: null,
    selectedTitles: [],
    allPromotions: [],
    filterType: 'NONE',        // v12.5: NONE, BOGO, B2G1, BULK
    alternateBrands: [],       // v12.5: List of alternate brand names
    libraryStatusFilter: 'All' // v12.5: All, Active, Inactive
};

async function openBlazeModal(rowIdx) {
    const match = matchesData[rowIdx];
    if (!match) return;
    
    // Initialize modal data
    blazeModalData.rowIdx = rowIdx;
    blazeModalData.filterType = 'NONE';        // v12.5: Reset filter
    blazeModalData.alternateBrands = [];       // v12.5: Reset alternate brands
    blazeModalData.libraryStatusFilter = 'All'; // v12.5: Reset status filter
    
    // Get existing selections from approvedMatches
    const existingData = approvedMatches[match.google_row];
    blazeModalData.selectedTitles = existingData?.blaze_titles ? [...existingData.blaze_titles] : [];
    
    // v12.7: Auto-load existing titles from Google Sheet column
    // Track which titles exist in Blaze and which don't
    blazeModalData.notFoundTitles = [];  // Titles that don't exist in Blaze yet
    
    // Get all Blaze promotions - check if already loaded
    blazeModalData.allPromotions = blazeData.currentRows || [];
    
    // If no Blaze data loaded, try to fetch it
    if (blazeModalData.allPromotions.length === 0) {
        // Show loading indicator
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'blaze-loading-overlay';
        loadingOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.6); z-index: 9998;
            display: flex; justify-content: center; align-items: center;
        `;
        loadingOverlay.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 8px; text-align: center;">
                <div class="spinner-border text-primary" role="status"></div>
                <p style="margin-top: 15px; margin-bottom: 0;">Loading Blaze Promotions...</p>
            </div>
        `;
        document.body.appendChild(loadingOverlay);
        
        try {
            const data = await api.blaze.refresh();
            if (data.success && data.promotions) {
                // Store globally so Blaze tab also has it
                blazeData.currentRows = data.promotions;
                blazeModalData.allPromotions = data.promotions;
                console.log('[BLAZE-MODAL] Fetched ' + data.promotions.length + ' promotions');
            } else {
                throw new Error(data.error || 'Failed to fetch Blaze data');
            }
        } catch (e) {
            console.error('[BLAZE-MODAL] Error fetching Blaze data:', e);
            loadingOverlay.remove();
            alert('Could not load Blaze promotions.\n\nPlease go to the Blaze tab and click "Refresh / Sync Data" first, then try again.\n\nError: ' + e.message);
            return;
        }
        
        loadingOverlay.remove();
    }
    
    // v12.7: Auto-load existing Blaze titles from Google Sheet column "Blaze Discount Title"
    // Parse the current sheet value (may have newline-separated titles)
    const sheetBlazeTitle = match.blaze_discount_title || '';  // Assuming this field exists
    if (sheetBlazeTitle && sheetBlazeTitle.trim() !== '') {
        const titleLines = sheetBlazeTitle.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        
        titleLines.forEach(title => {
            // Check if this title exists in Blaze promotions
            const foundPromo = blazeModalData.allPromotions.find(p => 
                (p.Name || '').toLowerCase() === title.toLowerCase()
            );
            
            if (foundPromo) {
                // Title exists in Blaze - add to selected titles if not already there
                if (!blazeModalData.selectedTitles.includes(title)) {
                    blazeModalData.selectedTitles.push(title);
                }
            } else {
                // Title NOT found in Blaze - track it separately
                if (!blazeModalData.notFoundTitles.includes(title)) {
                    blazeModalData.notFoundTitles.push(title);
                }
                // Also add to selectedTitles so it appears in queue with warning
                if (!blazeModalData.selectedTitles.includes(title)) {
                    blazeModalData.selectedTitles.push(title);
                }
            }
        });
        
        console.log('[BLAZE-MODAL] Auto-loaded from sheet:', titleLines.length, 'titles');
        console.log('[BLAZE-MODAL] Not found in Blaze:', blazeModalData.notFoundTitles.length);
    }
    
    // Generate suggestions based on brand name
    const suggestions = generateBlazeSuggestions(match, blazeModalData.allPromotions);
    
    // Create modal overlay
    const existing = document.getElementById('blaze-modal-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'blaze-modal-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.6); z-index: 9998;
        display: flex; justify-content: center; align-items: center;
    `;
    overlay.onclick = function(e) {
        if(e.target === overlay) overlay.remove();
    };
    
    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fff; padding: 20px; border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        width: 900px; max-width: 95%; max-height: 90vh;
        overflow-y: auto; z-index: 9999; position: relative;
    `;
    
    // Build modal HTML
    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #0d6efd; padding-bottom: 10px;">
            <h4 style="margin: 0; color: #0d6efd;"><i class="bi bi-lightning-charge-fill"></i> Select Blaze Discounts</h4>
            <button class="btn btn-outline-secondary btn-sm" onclick="document.getElementById('blaze-modal-overlay').remove()">
                <i class="bi bi-x-lg"></i> Close
            </button>
        </div>
        
        <!-- Current Row Details -->
        <div style="background: #e7f1ff; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
            <h6 style="margin: 0 0 8px 0; color: #0d6efd;"><i class="bi bi-info-circle"></i> Google Sheet Row ${match.google_row}</h6>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; font-size: 0.9em;">
                <div><strong>Brand:</strong> ${match.brand || '-'}</div>
                <div><strong>Discount:</strong> ${match.discount !== null ? match.discount + '%' : '-'}</div>
                <div><strong>Weekday:</strong> ${match.weekday || '-'}</div>
                <div style="grid-column: span 2;">
                    <strong>Locations:</strong> ${(match.locations || '-').substring(0, 50)}${(match.locations || '').length > 50 ? '...' : ''}
                    <button class="btn btn-success btn-sm" style="margin-left: 10px; padding: 2px 8px; font-size: 0.85em;" 
                            onclick="openCreateBlazeModal(${rowIdx})" title="Create new Blaze discount">
                        <i class="bi bi-plus-circle"></i> Create
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Selection Queue (v12.6: Scrollable with counter) -->
        <div style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
            <h6 style="margin: 0 0 8px 0; color: #856404;">
                <i class="bi bi-list-ol"></i> Selected Queue (<span id="queue-counter">0</span> items) - drag to reorder
            </h6>
            <div id="blaze-queue-container" style="display: flex; flex-wrap: wrap; gap: 5px; min-height: 60px; max-height: 120px; overflow-y: auto;">
                ${blazeModalData.selectedTitles.length === 0 ? '<span style="color: #999; font-style: italic;">No discounts selected</span>' : ''}
            </div>
        </div>
        
        <!-- Suggested Matches -->
        <div style="margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #198754; padding-bottom: 5px; margin-bottom: 10px;">
                <h6 style="color: #198754; margin: 0;">
                    <i class="bi bi-stars"></i> Suggested Matches (<span id="suggestion-count">${suggestions.length}</span>)
                </h6>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <label style="font-size: 0.85em; margin: 0;">Filter:</label>
                    <select id="blaze-suggestion-filter" class="form-select form-select-sm" style="width: auto;" onchange="updateBlazeSuggestions()">
                        <option value="NONE" selected>NONE</option>
                        <option value="BOGO">BOGO</option>
                        <option value="B2G1">B2G1</option>
                        <option value="BULK">BULK</option>
                    </select>
                </div>
            </div>
            
            <!-- Alternate Brand Names -->
            <div style="margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <label style="font-size: 0.85em; margin: 0; white-space: nowrap;">Alt Brand Names:</label>
                    <input type="text" id="blaze-alt-brand-input" class="form-control form-control-sm" 
                           placeholder="e.g., Stizzy, Stizy" style="flex: 1;"
                           onkeypress="if(event.key==='Enter'){addAlternateBrand(); event.preventDefault();}">
                    <button class="btn btn-outline-success btn-sm" onclick="addAlternateBrand()" title="Add alternate brand">
                        <i class="bi bi-plus"></i> Add
                    </button>
                </div>
                <div id="blaze-alt-brands-container" style="display: flex; flex-wrap: wrap; gap: 5px; min-height: 20px;">
                    <span style="color: #999; font-size: 0.85em; font-style: italic;">No alternate brands added</span>
                </div>
            </div>
            
            <div id="blaze-suggestions-container" style="max-height: 250px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 4px;">
                ${renderBlazePromoList(suggestions, 'suggestion')}
            </div>
        </div>
        
        <!-- Full Library (v12.6: Collapsible) -->
        <div style="margin-bottom: 15px;">
            <h6 style="color: #6c757d; border-bottom: 1px solid #6c757d; padding-bottom: 5px; cursor: pointer; display: flex; align-items: center; gap: 8px;" 
                onclick="toggleFullLibrary()">
                <span id="library-toggle-icon">▼</span>
                <i class="bi bi-collection"></i> Full Library (${blazeModalData.allPromotions.length})
            </h6>
            <div id="full-library-content" style="display: none;">
                <div style="display: flex; gap: 8px; margin-bottom: 8px; margin-top: 8px; align-items: center;">
                    <input type="text" id="blaze-library-search" class="form-control form-control-sm" 
                           placeholder="Search by name..." style="flex: 1;" oninput="filterBlazeLibrary()">
                    <label style="font-size: 0.85em; margin: 0; white-space: nowrap;">Status:</label>
                    <select id="blaze-library-status" class="form-select form-select-sm" style="width: auto;" onchange="filterBlazeLibrary()">
                        <option value="All" selected>All</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </div>
                <div id="blaze-library-container" style="max-height: 250px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 4px;">
                    ${renderBlazePromoList(blazeModalData.allPromotions.slice(0, 50), 'library')}
                </div>
                ${blazeModalData.allPromotions.length > 50 ? '<small class="text-muted">Showing first 50. Use search to narrow results.</small>' : ''}
            </div>
        </div>
        
        <!-- Action Buttons -->
        <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #dee2e6; padding-top: 15px;">
            <button class="btn btn-outline-secondary" onclick="document.getElementById('blaze-modal-overlay').remove()">Cancel</button>
            <button class="btn btn-primary" onclick="confirmBlazeSelection()">
                <i class="bi bi-check-lg"></i> Confirm Selection
            </button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Render initial queue
    renderBlazeQueue();
}

function generateBlazeSuggestions(match, allPromos, filterType = 'NONE', alternateBrands = []) {
    if (!allPromos || allPromos.length === 0) return [];
    
    const brand = (match.brand || '').toLowerCase();
    // Combine primary brand words with alternate brands
    let brandWords = brand.split(/[\s,]+/).filter(w => w.length > 2);
    alternateBrands.forEach(alt => {
        const altWords = alt.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
        brandWords = brandWords.concat(altWords);
    });
    brandWords = [...new Set(brandWords)]; // Remove duplicates
    
    // Filter type patterns
    const bulkPatterns = [
        /bulk/i,
        /mix\s*&\s*match/i,
        /mix\s+and\s+match/i,
        /\d+\s*for\s*\$?\d+/i,  // "2 for $40", "3 for 60"
        /\d+\/\$?\d+/i           // "2/$40", "4/100"
    ];
    
    // Score each promotion
    const scored = allPromos.map(promo => {
        const name = (promo.Name || '').toLowerCase();
        let score = 0;
        let matchesFilter = true;
        let hasBrandMatch = false;  // v12.6: Track if brand matches
        
        // v12.6 FIX: Check for brand match FIRST
        // Check for brand word matches in title
        brandWords.forEach(word => {
            if (name.includes(word)) {
                score += 30;
                hasBrandMatch = true;
            }
        });
        
        // Exact brand name match
        if (name.includes(brand)) {
            score += 50;
            hasBrandMatch = true;
        }
        
        // Check alternate brands for exact match too
        alternateBrands.forEach(alt => {
            if (name.includes(alt.toLowerCase())) {
                score += 50;
                hasBrandMatch = true;
            }
        });
        
        // v12.6 FIX: If no brand match at all, return score 0 immediately
        if (!hasBrandMatch) {
            return { promo, score: 0 };
        }
        
        // Apply filter type (ONLY after confirming brand match)
        if (filterType === 'BOGO') {
            matchesFilter = name.includes('bogo');
        } else if (filterType === 'B2G1') {
            matchesFilter = name.includes('b2g1');
        } else if (filterType === 'BULK') {
            matchesFilter = bulkPatterns.some(pattern => pattern.test(promo.Name || ''));
        }
        // NONE = no additional filter (but still requires brand match)
        
        if (!matchesFilter) {
            return { promo, score: 0 };
        }
        
        // Active status bonus
        if (promo.Status === 'Active') {
            score += 10;
        }
        
        return { promo, score };
    });
    
    // Filter (require brand match) and sort by score - NO LIMIT
    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(s => s.promo);
}
