// static/js/tabs/blaze.js
// BLAZE tab: promo library, queue, draft automation, zombie cleanup, detail modal
// Extracted from monolith v12.27 by Step 7

function renderBlazePromoList(promos, type) {
    if (!promos || promos.length === 0) {
        return '<div style="padding: 10px; text-align: center; color: #999;">No promotions found</div>';
    }
    
    return promos.map(promo => {
        const isSelected = blazeModalData.selectedTitles.includes(promo.Name);
        const statusColor = promo.Status === 'Active' ? '#198754' : '#dc3545';
        const bgColor = isSelected ? '#d4edda' : '#fff';
        
        // v12.7: Add View button for each promo
        return `
            <div style="padding: 8px 12px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px; background: ${bgColor};"
                 onmouseover="this.style.background='${isSelected ? '#c3e6cb' : '#f8f9fa'}'"
                 onmouseout="this.style.background='${bgColor}'">
                <input type="checkbox" ${isSelected ? 'checked' : ''} style="cursor: pointer;" 
                       onclick="toggleBlazeSelection('${escapeHtml(promo.Name)}')">
                <div style="flex: 1; min-width: 0; cursor: pointer;" onclick="toggleBlazeSelection('${escapeHtml(promo.Name)}')">
                    <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(promo.Name)}">
                        ${escapeHtml(promo.Name)}
                    </div>
                    <div style="font-size: 0.8em; color: #6c757d;">
                        <span style="color: ${statusColor};">${promo.Status}</span>
                        ${promo['Discount Value'] ? ' | ' + promo['Discount Value'] + ' ' + (promo['Discount Value Type'] || '') : ''}
                        ${promo['Start Date'] ? ' | ' + promo['Start Date'] : ''}
                    </div>
                </div>
                <button class="btn btn-info btn-sm" style="padding: 2px 6px; font-size: 0.75em; white-space: nowrap;" 
                        onclick="event.stopPropagation(); showDetailModal(${JSON.stringify(promo).replace(/"/g, '&quot;')}, true)">
                    <i class="bi bi-eye"></i> View
                </button>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function toggleBlazeSelection(promoName) {
    const idx = blazeModalData.selectedTitles.indexOf(promoName);
    if (idx >= 0) {
        blazeModalData.selectedTitles.splice(idx, 1);
    } else {
        blazeModalData.selectedTitles.push(promoName);
    }
    
    // Re-render lists
    renderBlazeQueue();
    
    // v12.5: Use current filter settings for suggestions
    const match = matchesData[blazeModalData.rowIdx];
    const suggestions = generateBlazeSuggestions(
        match, 
        blazeModalData.allPromotions,
        blazeModalData.filterType,
        blazeModalData.alternateBrands
    );
    document.getElementById('blaze-suggestions-container').innerHTML = renderBlazePromoList(suggestions, 'suggestion');
    
    // Update count
    const countEl = document.getElementById('suggestion-count');
    if (countEl) countEl.textContent = suggestions.length;
    
    // Re-render library with current search and status filter
    filterBlazeLibrary();
}

function renderBlazeQueue() {
    const container = document.getElementById('blaze-queue-container');
    if (!container) return;
    
    // v12.6: Update counter
    const counterSpan = document.getElementById('queue-counter');
    if (counterSpan) {
        counterSpan.textContent = blazeModalData.selectedTitles.length;
    }
    
    if (blazeModalData.selectedTitles.length === 0) {
        container.innerHTML = '<span style="color: #999; font-style: italic;">No discounts selected</span>';
        return;
    }
    
    // v12.7: Render items with different styling for not-found titles
    container.innerHTML = blazeModalData.selectedTitles.map((title, idx) => {
        const isNotFound = blazeModalData.notFoundTitles.includes(title);
        
        // Find promo to get View button
        const promo = blazeModalData.allPromotions.find(p => 
            (p.Name || '').toLowerCase() === title.toLowerCase()
        );
        
        if (isNotFound) {
            // Not found in Blaze - show warning with Create button
            return `
                <div class="blaze-queue-item" data-idx="${idx}" data-not-found="true"
                     style="background: #f8f9fa; border: 1px solid #6c757d; border-radius: 4px; padding: 4px 8px; 
                            display: flex; align-items: center; gap: 5px; opacity: 0.7;">
                    <span style="font-weight: bold; color: #6c757d;">${idx + 1}.</span>
                    <i class="bi bi-exclamation-triangle" style="color: #ffc107;" title="Not found in Blaze"></i>
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; color: #6c757d;" title="${escapeHtml(title)}">
                        ${escapeHtml(title)}
                    </span>
                    <button class="btn btn-success btn-sm" style="padding: 1px 4px; font-size: 0.75em;" 
                            onclick="event.stopPropagation(); createBlazeDiscountFromQueue('${escapeHtml(title)}')">
                        <i class="bi bi-plus-circle"></i> Create
                    </button>
                    <button class="btn btn-sm" style="padding: 0 4px; color: #dc3545;" onclick="event.stopPropagation(); removeFromBlazeQueue(${idx})">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
            `;
        } else {
            // Found in Blaze - normal item with drag and View button
            return `
                <div class="blaze-queue-item" draggable="true" data-idx="${idx}"
                     style="background: #fff; border: 1px solid #ffc107; border-radius: 4px; padding: 4px 8px; 
                            display: flex; align-items: center; gap: 5px; cursor: move;">
                    <span style="font-weight: bold; color: #856404;">${idx + 1}.</span>
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${escapeHtml(title)}">
                        ${escapeHtml(title)}
                    </span>
                    ${promo ? `
                        <button class="btn btn-info btn-sm" style="padding: 1px 4px; font-size: 0.75em;" 
                                onclick="event.stopPropagation(); showDetailModal(${JSON.stringify(promo).replace(/"/g, '&quot;')}, true)">
                            <i class="bi bi-eye"></i> View
                        </button>
                    ` : ''}
                    <button class="btn btn-sm" style="padding: 0 4px; color: #dc3545;" onclick="event.stopPropagation(); removeFromBlazeQueue(${idx})">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
            `;
        }
    }).join('');
    
    // Add drag-and-drop handlers only to items that are found (draggable)
    const items = container.querySelectorAll('.blaze-queue-item[draggable="true"]');
    items.forEach(item => {
        item.addEventListener('dragstart', handleQueueDragStart);
        item.addEventListener('dragover', handleQueueDragOver);
        item.addEventListener('drop', handleQueueDrop);
        item.addEventListener('dragend', handleQueueDragEnd);
    });
}

let queueDraggedItem = null;

function handleQueueDragStart(e) {
    queueDraggedItem = this;
    this.style.opacity = '0.5';
}

function handleQueueDragOver(e) {
    e.preventDefault();
    this.style.borderLeft = '3px solid #0d6efd';
}

function handleQueueDrop(e) {
    e.preventDefault();
    this.style.borderLeft = '';
    
    if (queueDraggedItem === this) return;
    
    const fromIdx = parseInt(queueDraggedItem.dataset.idx);
    const toIdx = parseInt(this.dataset.idx);
    
    // Reorder array
    const [removed] = blazeModalData.selectedTitles.splice(fromIdx, 1);
    blazeModalData.selectedTitles.splice(toIdx, 0, removed);
    
    renderBlazeQueue();
}

function handleQueueDragEnd(e) {
    this.style.opacity = '1';
    document.querySelectorAll('.blaze-queue-item').forEach(item => {
        item.style.borderLeft = '';
    });
}

function removeFromBlazeQueue(idx) {
    blazeModalData.selectedTitles.splice(idx, 1);
    renderBlazeQueue();
    
    // v12.5: Use current filter settings for suggestions
    const match = matchesData[blazeModalData.rowIdx];
    const suggestions = generateBlazeSuggestions(
        match, 
        blazeModalData.allPromotions,
        blazeModalData.filterType,
        blazeModalData.alternateBrands
    );
    document.getElementById('blaze-suggestions-container').innerHTML = renderBlazePromoList(suggestions, 'suggestion');
    
    // Update count
    const countEl = document.getElementById('suggestion-count');
    if (countEl) countEl.textContent = suggestions.length;
    
    filterBlazeLibrary();
}

function filterBlazeLibrary() {
    const container = document.getElementById('blaze-library-container');
    if (!container) return;
    
    const searchTerm = (document.getElementById('blaze-library-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('blaze-library-status')?.value || 'All';
    
    blazeModalData.libraryStatusFilter = statusFilter;
    
    let filtered = blazeModalData.allPromotions;
    
    // Apply search term filter
    if (searchTerm) {
        filtered = filtered.filter(p => 
            (p.Name || '').toLowerCase().includes(searchTerm)
        );
    }
    
    // Apply status filter
    if (statusFilter !== 'All') {
        filtered = filtered.filter(p => p.Status === statusFilter);
    }
    
    container.innerHTML = renderBlazePromoList(filtered.slice(0, 50), 'library');
}

// v12.5: Add alternate brand name
function addAlternateBrand() {
    const input = document.getElementById('blaze-alt-brand-input');
    if (!input) return;
    
    const value = input.value.trim();
    if (!value) return;
    
    // Check for duplicates
    if (blazeModalData.alternateBrands.includes(value)) {
        input.value = '';
        return;
    }
    
    blazeModalData.alternateBrands.push(value);
    input.value = '';
    
    renderAlternateBrands();
    updateBlazeSuggestions();
}

// v12.5: Remove alternate brand name
function removeAlternateBrand(idx) {
    blazeModalData.alternateBrands.splice(idx, 1);
    renderAlternateBrands();
    updateBlazeSuggestions();
}

// v12.5: Render alternate brands list
function renderAlternateBrands() {
    const container = document.getElementById('blaze-alt-brands-container');
    if (!container) return;
    
    if (blazeModalData.alternateBrands.length === 0) {
        container.innerHTML = '<span style="color: #999; font-size: 0.85em; font-style: italic;">No alternate brands added</span>';
        return;
    }
    
    container.innerHTML = blazeModalData.alternateBrands.map((brand, idx) => `
        <span style="background: #e7f1ff; border: 1px solid #0d6efd; border-radius: 15px; padding: 2px 10px; 
                     font-size: 0.85em; display: inline-flex; align-items: center; gap: 5px;">
            ${escapeHtml(brand)}
            <button class="btn btn-sm" style="padding: 0 2px; color: #dc3545; line-height: 1;" 
                    onclick="removeAlternateBrand(${idx})" title="Remove">
                <i class="bi bi-x"></i>
            </button>
        </span>
    `).join('');
}

// v12.5: Update suggestions based on filter and alternate brands
function updateBlazeSuggestions() {
    const filterSelect = document.getElementById('blaze-suggestion-filter');
    const filterType = filterSelect?.value || 'NONE';
    blazeModalData.filterType = filterType;
    
    const match = matchesData[blazeModalData.rowIdx];
    if (!match) return;
    
    const suggestions = generateBlazeSuggestions(
        match, 
        blazeModalData.allPromotions, 
        filterType, 
        blazeModalData.alternateBrands
    );
    
    // Update count
    const countEl = document.getElementById('suggestion-count');
    if (countEl) countEl.textContent = suggestions.length;
    
    // Update list
    document.getElementById('blaze-suggestions-container').innerHTML = renderBlazePromoList(suggestions, 'suggestion');
}

function confirmBlazeSelection() {
    const match = matchesData[blazeModalData.rowIdx];
    if (!match) return;
    
    // Update approvedMatches
    if (!approvedMatches[match.google_row]) {
        approvedMatches[match.google_row] = {
            mis_ids: [],
            brands: [],
            section: match.section || 'weekly',
            blaze_titles: [],
            blaze_titles_not_found: []  // v12.7: Track not-found titles
        };
    }
    
    approvedMatches[match.google_row].blaze_titles = [...blazeModalData.selectedTitles];
    approvedMatches[match.google_row].blaze_titles_not_found = [...blazeModalData.notFoundTitles];  // v12.7
    
    // Update the Blaze button in the table
    const row = document.getElementById('match-row-' + blazeModalData.rowIdx);
    if (row) {
        const blazeBtn = row.querySelector('.btn-blaze');
        if (blazeBtn) {
            if (blazeModalData.selectedTitles.length > 0) {
                blazeBtn.classList.remove('btn-outline-primary');
                blazeBtn.classList.add('btn-primary');
                blazeBtn.innerHTML = '<i class="bi bi-lightning-charge-fill"></i> ' + blazeModalData.selectedTitles.length;
                blazeBtn.title = blazeModalData.selectedTitles.join('\\n');
            } else {
                blazeBtn.classList.remove('btn-primary');
                blazeBtn.classList.add('btn-outline-primary');
                blazeBtn.innerHTML = '<i class="bi bi-lightning-charge"></i>';
                blazeBtn.title = 'Select Blaze Discount';
            }
        }
    }
    
    // Update visibility of apply buttons
    updateApplyButtonsVisibility();
    
    // Close modal
    document.getElementById('blaze-modal-overlay').remove();
}

// v12.6: Toggle Full Library section visibility
function toggleFullLibrary() {
    const content = document.getElementById('full-library-content');
    const icon = document.getElementById('library-toggle-icon');
    
    if (!content || !icon) return;
    
    const isCurrentlyVisible = content.style.display !== 'none';
    content.style.display = isCurrentlyVisible ? 'none' : 'block';
    icon.textContent = isCurrentlyVisible ? '▼' : '▶';
}

// v12.7: Create Blaze Discount Modal and Automation
let createBlazeModalData = {
    rowIdx: null,
    suggestedTitle: '',
    typedTitle: '',
    canUndo: false
};

function openCreateBlazeModal(rowIdx) {
    const match = matchesData[rowIdx];
    if (!match) return;
    
    // Store for later use
    createBlazeModalData.rowIdx = rowIdx;
    createBlazeModalData.suggestedTitle = '';
    createBlazeModalData.typedTitle = '';
    createBlazeModalData.canUndo = false;
    
    // Generate suggested title variations
    const brand = match.brand || '';
    const discount = match.discount !== null ? match.discount + '%' : '';
    const weekday = match.weekday || '';
    
    const suggestions = [
        `${brand} ${discount} ${weekday}`.trim(),
        `${brand} ${discount} Off ${weekday}`.trim(),
        `${weekday} ${brand} ${discount}`.trim(),
        `${discount} Off ${brand} - ${weekday}`.trim()
    ].filter(s => s.length > 0);
    
    // Auto-detect discount type from pattern
    const dealInfo = (match.deal_info || '').toLowerCase();
    let detectedType = '';
    if (dealInfo.includes('bogo') || dealInfo.includes('buy') && dealInfo.includes('get')) {
        detectedType = 'BOGO';
    } else if (dealInfo.includes('bundle')) {
        detectedType = 'Bundle';
    } else if (dealInfo.includes('bulk') || dealInfo.includes('mix')) {
        detectedType = 'BULK (likely Global Product Discount)';
    } else {
        detectedType = 'Unknown (manual selection required)';
    }
    
    // Create modal
    const existing = document.getElementById('create-blaze-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'create-blaze-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.7); z-index: 10000;
        display: flex; justify-content: center; align-items: center;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fff; padding: 25px; border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.4);
        width: 600px; max-width: 95%;
    `;
    
    const currentDate = new Date().toLocaleString();
    
    modal.innerHTML = `
        <h4 style="margin: 0 0 15px 0; color: #198754;">
            <i class="bi bi-plus-circle-fill"></i> Create Blaze Discount
        </h4>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; font-weight: bold; margin-bottom: 5px;">Title:</label>
            <div style="position: relative;">
                <input type="text" id="create-blaze-title" class="form-control" placeholder="Enter discount title..."
                       onfocus="showTitleSuggestions()"
                       oninput="handleTitleInput(event)"
                       onblur="setTimeout(() => hideTitleSuggestions(), 150)">
                <div id="title-suggestions" style="display: none; position: absolute; top: 100%; left: 0; right: 0; 
                        background: white; border: 1px solid #ccc; border-top: none; max-height: 150px; overflow-y: auto; z-index: 1000;">
                    ${suggestions.map(s => `
                        <div style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;"
                             onmouseover="this.style.background='#f8f9fa'"
                             onmouseout="this.style.background='white'"
                             onclick="selectTitleSuggestion('${escapeHtml(s)}')">
                            ${escapeHtml(s)}
                        </div>
                    `).join('')}
                </div>
            </div>
            <button id="title-undo-btn" class="btn btn-sm btn-outline-warning mt-1" style="display: none;" onclick="undoTitleSelection()">
                <i class="bi bi-arrow-counterclockwise"></i> Undo
            </button>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; font-weight: bold; margin-bottom: 5px;">Discount Type:</label>
            <select id="create-blaze-type" class="form-select">
                <option value="">-- Select Type --</option>
                <option value="Bundle">Bundle</option>
                <option value="BOGO">BOGO</option>
                <option value="Global Product Discount">Global Product Discount</option>
                <option value="Collection Discount">Collection Discount</option>
            </select>
            <small style="color: #6c757d; font-style: italic;">Suggested: ${detectedType}</small>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; font-weight: bold; margin-bottom: 5px;">Description:</label>
            <textarea id="create-blaze-description" class="form-control" rows="4" placeholder="Enter description..."></textarea>
            <button class="btn btn-sm btn-outline-secondary mt-1" onclick="autofillDescription()">
                <i class="bi bi-magic"></i> Autofill
            </button>
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #dee2e6; padding-top: 15px;">
            <button class="btn btn-outline-secondary" onclick="document.getElementById('create-blaze-overlay').remove()">Cancel</button>
            <button class="btn btn-success" onclick="executeCreateBlazeAutomation()">
                <i class="bi bi-check-lg"></i> Create in Blaze
            </button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close on outside click
    overlay.onclick = function(e) {
        if (e.target === overlay) overlay.remove();
    };
}

function createBlazeDiscountFromQueue(title) {
    // Find the row index and open create modal with pre-filled title
    const rowIdx = createBlazeModalData.rowIdx || blazeModalData.rowIdx;
    if (rowIdx === null) return;
    
    openCreateBlazeModal(rowIdx);
    
    // Pre-fill title after modal opens
    setTimeout(() => {
        const titleInput = document.getElementById('create-blaze-title');
        if (titleInput) {
            titleInput.value = title;
            createBlazeModalData.typedTitle = title;
        }
    }, 100);
}

function showTitleSuggestions() {
    const dropdown = document.getElementById('title-suggestions');
    if (dropdown) dropdown.style.display = 'block';
}

function hideTitleSuggestions() {
    const dropdown = document.getElementById('title-suggestions');
    if (dropdown) dropdown.style.display = 'none';
}

function handleTitleInput(event) {
    createBlazeModalData.typedTitle = event.target.value;
    // Hide undo button if user types new text
    if (createBlazeModalData.canUndo && event.target.value !== createBlazeModalData.suggestedTitle) {
        createBlazeModalData.canUndo = false;
        const undoBtn = document.getElementById('title-undo-btn');
        if (undoBtn) undoBtn.style.display = 'none';
    }
}

function selectTitleSuggestion(suggestion) {
    const titleInput = document.getElementById('create-blaze-title');
    const undoBtn = document.getElementById('title-undo-btn');
    const dropdown = document.getElementById('title-suggestions');
    
    if (titleInput) {
        titleInput.value = suggestion;
        createBlazeModalData.suggestedTitle = suggestion;
        createBlazeModalData.canUndo = true;
        
        if (undoBtn) undoBtn.style.display = 'inline-block';
    }
    
    if (dropdown) dropdown.style.display = 'none';
}

function undoTitleSelection() {
    const titleInput = document.getElementById('create-blaze-title');
    const undoBtn = document.getElementById('title-undo-btn');
    
    if (titleInput) {
        titleInput.value = createBlazeModalData.typedTitle;
        createBlazeModalData.canUndo = false;
        
        if (undoBtn) undoBtn.style.display = 'none';
    }
}

function autofillDescription() {
    const match = matchesData[createBlazeModalData.rowIdx];
    if (!match) return;
    
    const descArea = document.getElementById('create-blaze-description');
    if (!descArea) return;
    
    const brand = match.brand || '-';
    const discountType = document.getElementById('create-blaze-type')?.value || 'Not Selected';
    const discountValue = match.discount !== null ? match.discount + '%' : '-';
    const locations = match.locations || '-';
    const creationDate = new Date().toLocaleString();
    
    descArea.value = `Brand: ${brand}\nDiscount Type: ${discountType}\nDiscount Value: ${discountValue}\nLocations: ${locations}\nCreation Date + Time: ${creationDate}`;
}

async function executeCreateBlazeAutomation() {
    const title = document.getElementById('create-blaze-title')?.value.trim();
    const type = document.getElementById('create-blaze-type')?.value;
    const description = document.getElementById('create-blaze-description')?.value.trim();
    
    if (!title) {
        alert('Please enter a title');
        return;
    }
    
    if (!type) {
        alert('Please select a discount type');
        return;
    }
    
    // Check for duplicate names in Blaze
    const existingPromo = blazeModalData.allPromotions.find(p => 
        (p.Name || '').toLowerCase() === title.toLowerCase()
    );
    
    if (existingPromo) {
        const userChoice = confirm(
            `A discount with the name "${title}" already exists in Blaze.\n\n` +
            `Do you want to:\n` +
            `- OK: Select the existing discount\n` +
            `- Cancel: Continue creating with a modified name`
        );
        
        if (userChoice) {
            // User chose to use existing - add it to queue
            if (!blazeModalData.selectedTitles.includes(title)) {
                blazeModalData.selectedTitles.push(title);
                renderBlazeQueue();
            }
            document.getElementById('create-blaze-overlay').remove();
            return;
        } else {
            // User wants to create anyway - ask for note
            const note = prompt('Enter a note to append to the title (e.g., "v2", "2025"):', 'v2');
            if (note) {
                document.getElementById('create-blaze-title').value = `${title} ${note}`;
                return; // Don't proceed, let user review and click Create again
            } else {
                return; // User cancelled
            }
        }
    }
    
    // Proceed with automation
    console.log('[CREATE-BLAZE] Starting automation...');
    console.log('[CREATE-BLAZE] Title:', title);
    console.log('[CREATE-BLAZE] Type:', type);
    console.log('[CREATE-BLAZE] Description:', description);
    
    try {
        // Call backend to execute Blaze automation
        const data = await api.blaze.createDiscount({ title, type, description });
        
        
        if (data.success) {
            alert('Discount creation started in Blaze!\n\nThe title has been filled in. Please complete the remaining fields manually.');
            document.getElementById('create-blaze-overlay').remove();
        } else {
            alert('Error starting automation: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('[CREATE-BLAZE] Error:', error);
        alert('Error communicating with server: ' + error.message);
    }
}

function displayAuditResults(resultsObj) {
    const containerId = 'audit-results';
    const titles = {'weekly': ' WEEKLY DEALS', 'monthly': ' MONTHLY DEALS', 'sale': ' SALE DEALS'};
    
    // Count items per section
    const counts = {
        weekly: (resultsObj.weekly || []).length,
        monthly: (resultsObj.monthly || []).length,
        sale: (resultsObj.sale || []).length
    };
    
    // Header
    let headerHtml = '<h3>Audit Results</h3>';
    headerHtml += generateDealTypeTabsHTML(containerId, counts);
    
    // Build content for each section
    const sectionContents = {};
    
    ['weekly', 'monthly', 'sale'].forEach(key => {
        const results = resultsObj[key] || [];
        let sectionHtml = '';
        
        sectionHtml += `<h5 class="mt-2 border-bottom pb-2">${titles[key]} (${results.length} Items)</h5>`;
        
        if (results.length === 0) {
            sectionHtml += '<p class="text-muted">No data.</p>';
        } else {
            sectionHtml += '<div class="scrollable-table-container" style="max-height:500px;">';
            sectionHtml += '<table class="table table-sm"><thead>';
            sectionHtml += '<tr><th>Row</th><th>MIS ID</th><th>Brand</th><th>Weekday</th><th>Notes</th><th>Deal Info</th><th>Discount</th><th>Vendor %</th><th>Locations</th><th>Categories</th><th>Status</th><th>Issues</th><th>Action</th></tr>';
            sectionHtml += '</thead><tbody>';
            
            const renderedGroups = new Set();
            
            results.forEach((r, idx) => {
                const isGrouped = r.multi_day_group !== null && r.multi_day_group !== undefined;
                const isFirstInGroup = isGrouped && r.multi_day_group.is_first;
                const groupId = isGrouped ? r.multi_day_group.group_id : null;
                
                if (isGrouped && !isFirstInGroup) return;
                
                if (isGrouped && isFirstInGroup) {
                    renderedGroups.add(groupId);
                    const groupData = r.multi_day_group;
                    const hasMissingWeekday = groupData.has_missing_weekday;
                    const warningIcon = hasMissingWeekday ? '<span class="weekday-missing-icon">[!] ⚠️⚠️ </span>' : '';
                    
                    sectionHtml += `<tr class="group-header-row" onclick="toggleGroup('${groupId}')" title="Click to collapse/expand">`;
                    sectionHtml += `<td colspan="13">`;
                    sectionHtml += `<span class="group-toggle-icon" id="toggle-${groupId}">→</span>`;
                    sectionHtml += `${warningIcon}<strong>${r.brand}</strong>`;
                    sectionHtml += `<span class="multi-day-badge">&#x3030;📅 ${groupData.total_days}-Day Deal</span>`;
                    sectionHtml += ` (Rows: ${groupData.row_numbers.join(', ')})`;
                    sectionHtml += `</td></tr>`;
                    
                    const groupResults = results.filter(gr => 
                        gr.multi_day_group && gr.multi_day_group.group_id === groupId
                    );
                    
                    groupResults.forEach((gr) => {
                        const grIdx = results.indexOf(gr);
                        sectionHtml += renderAuditRow(gr, grIdx + key, groupId, hasMissingWeekday);
                    });
                    
                } else {
                    sectionHtml += renderAuditRow(r, idx + key, null, false);
                }
            });
            
            sectionHtml += '</tbody></table></div>';
        }
        
        sectionContents[key] = sectionHtml;
    });
    
    // Build the "All Deals" view (stacked)
    let allHtml = sectionContents.weekly + sectionContents.monthly + sectionContents.sale;
    
    // Build final HTML with containers
    let finalHtml = headerHtml;
    finalHtml += `<div id="${containerId}-weekly" class="deal-type-content">${sectionContents.weekly}</div>`;
    finalHtml += `<div id="${containerId}-monthly" class="deal-type-content">${sectionContents.monthly}</div>`;
    finalHtml += `<div id="${containerId}-sale" class="deal-type-content">${sectionContents.sale}</div>`;
    finalHtml += `<div id="${containerId}-all" class="deal-type-content active" style="display:block;">${allHtml}</div>`;
    
    document.getElementById('audit-results').innerHTML = finalHtml;
}

// ============================================
// SEARCH ENHANCEMENT: Click-to-Search
// ============================================