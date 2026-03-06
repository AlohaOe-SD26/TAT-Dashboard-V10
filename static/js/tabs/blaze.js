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

// ============================================
// BLAZE TABLE RENDER + DATA FETCH
// Extracted from monolith lines 18422–19950
// These were missing from the modular blaze.js
// ============================================

// Price Check scope: false = Davis+Dixon only (default), true = all stores
let priceCheckAll = false;
// The restricted two-store audit set when priceCheckAll is OFF
const DAVIS_DIXON_STORES = ["Davis", "Dixon"];

// Only Price Errors: when true, hide rows that are NOT critical (red) pricing errors
let priceErrorsOnly = false;

function onPriceCheckAllChange() {
    const toggle = document.getElementById('priceCheckAllToggle');
    priceCheckAll = toggle ? toggle.checked : false;
    console.log('[PRICE-CHECK] All stores:', priceCheckAll);
    // Re-render table with current rows so value button colors update immediately
    if (blazeData.currentRows && blazeData.currentRows.length > 0) {
        renderBlazeTable(blazeData.currentRows);
    }
}

function onPriceErrorsOnlyChange() {
    const toggle = document.getElementById('priceErrorsOnlyToggle');
    priceErrorsOnly = toggle ? toggle.checked : false;
    console.log('[PRICE-ERRORS-ONLY]', priceErrorsOnly);
    const dt = $.fn.dataTable.isDataTable('#promotionsTable');
    if (dt) $('#promotionsTable').DataTable().draw();
}

async function renderBlazeTable(rows) {
    // [CRITICAL] Store rows globally so buttons can access data by index
    blazeData.currentRows = rows || [];

    // 0. PRE-FETCH TAX RATES (Blocking) - Ensures Audit Logic has data
    TAX_RATES = {};  // assign to global from state.js — NOT let (would shadow the global)
    try {
        const response = await fetch('/api/tax-rates');
        const data = await response.json();
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
        today.setHours(0, 0, 0, 0);

        rows.forEach(r => {
            const status = (r.Status || '').trim();
            if (status === 'Active') totActive++;
            else if (status === 'Inactive') totInactive++;

            if (status === 'Active') {
                const endDateStr = (r['End Date'] || '').trim();
                if (endDateStr) {
                    try {
                        const parts = endDateStr.split('-');
                        if (parts.length === 3) {
                            const endDate = new Date(parts[0], parts[1] - 1, parts[2]);
                            endDate.setHours(0, 0, 0, 0);
                            if (endDate.getTime() < today.getTime()) {
                                totZombie++;
                            }
                        }
                    } catch (e) {}
                }
            }
        });
    }

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

    const ALL_LOCATIONS_LIST = [
        "Beverly Hills", "Davis", "Dixon", "El Sobrante", "Fresno (Palm)",
        "Fresno Shaw", "Hawthorne", "Koreatown", "Laguna Woods",
        "Oxnard", "Riverside", "West Hollywood"
    ].sort();

    if (rows && Array.isArray(rows)) {
        rows.forEach((row, index) => {
            const tr = document.createElement('tr');

            // STATUS BADGE
            const status = (row.Status || '').trim();
            const statusBadge = status === 'Active'
                ? '<span class="badge bg-success">Active</span>'
                : '<span class="badge bg-danger">Inactive</span>';

            // DAYS UNTIL END
            const startDateStr = row['Start Date'] || '';
            const endDateStr = row['End Date'] || '';
            let daysDisplay = '-';
            let isExpired = false;

            if (endDateStr && endDateStr !== '') {
                try {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const parseLocal = (dateStr) => {
                        if (!dateStr) return null;
                        const parts = dateStr.split('-');
                        if (parts.length === 3) {
                            const d = new Date(parts[0], parts[1] - 1, parts[2]);
                            d.setHours(0, 0, 0, 0);
                            return d;
                        }
                        const d = new Date(dateStr);
                        d.setHours(0, 0, 0, 0);
                        return d;
                    };

                    const endDate = parseLocal(endDateStr);
                    const startDate = parseLocal(startDateStr);

                    if (endDate) {
                        if (startDate && startDate.getTime() > today.getTime()) {
                            const startDiff = startDate.getTime() - today.getTime();
                            const daysToStart = Math.round(startDiff / (1000 * 3600 * 24));
                            const durationDiff = endDate.getTime() - startDate.getTime();
                            const durationDays = Math.round(durationDiff / (1000 * 3600 * 24));
                            daysDisplay = `<div style="line-height:1.2;">
                                <span style="color:#0d6efd; font-weight:bold;">Starts in ${daysToStart} Day${daysToStart===1?'':'s'}</span><br>
                                <span style="color:#6c757d; font-size:0.85em;">Runs for ${durationDays} Day${durationDays===1?'':'s'}</span>
                            </div>`;
                        } else {
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

            // ROW HIGHLIGHTING
            const isExpiredAlt = daysDisplay.includes('Ended') && daysDisplay.includes('ago');
            if (status === 'Active' && (isExpired || isExpiredAlt)) {
                tr.style.backgroundColor = '#dc3545';
                tr.style.color = '#ffffff';
                tr.style.fontWeight = 'bold';
                tr.style.border = '3px solid #a02030';
            } else if (status === 'Inactive') {
                tr.style.backgroundColor = '#f4cccc';
            }
            if (isExpiredAlt && !isExpired && status === 'Active') {
                tr.style.color = '#dc3545';
                tr.style.fontWeight = 'bold';
            }

            // ID BUTTON
            const idButton = `<button onclick="navBlaze('promo', '${row.ID}'); return false;"
                class="btn btn-sm btn-primary"
                style="font-size: 0.75rem; padding: 2px 8px;"
                title="ID: ${row.ID}">View Discount</button>`;

            // LOCATIONS
            let locationsRaw = row.Locations || '';
            let locationsDisplay = '';
            let applicableStores = [];

            if (locationsRaw === 'All Locations') {
                applicableStores = ALL_LOCATIONS_LIST;
                const tooltipHTML = ALL_LOCATIONS_LIST.join('<br>');
                locationsDisplay = `<span class="badge bg-info text-white" style="cursor:help;"
                    data-bs-toggle="tooltip" data-bs-html="true" data-bs-placement="right"
                    title="${tooltipHTML}">All Locations</span>`;
            } else {
                applicableStores = locationsRaw.split(',').map(l => l.trim()).filter(l => l);
                let displayText = locationsRaw;
                if (displayText.length > 50) displayText = displayText.substring(0, 47) + '...';
                const locationsList = locationsRaw.split(',').map(l => l.trim()).filter(l => l).sort();
                const tooltipHTML = locationsList.join('<br>');
                locationsDisplay = `<span style="cursor:help; text-decoration:underline dotted;"
                    data-bs-toggle="tooltip" data-bs-html="true" data-bs-placement="right"
                    title="${tooltipHTML}">${displayText}</span>`;
            }

            // DETAIL BUTTON
            const detailCell = `<button
                class="btn btn-sm btn-outline-secondary py-0 px-2"
                style="font-size:0.75rem; font-weight:bold;"
                onmouseenter="showDetailModal(blazeData.currentRows[${index}], false)"
                onmouseleave="hideDetailModal()"
                onclick="toggleDetailPin(blazeData.currentRows[${index}]); event.stopPropagation();">
                DETAIL</button>`;

            // AUTO/MANUAL
            const autoManualText = row.auto_apply ? 'Automatic' : 'Manual';
            const autoManualColor = row.auto_apply ? '#0066ff' : '#ff8800';
            const autoManualCell = `<span style="color:${autoManualColor}; font-weight:bold;">${autoManualText}</span>`;

            // GROUP LINKS
            const makeGroupLinks = (groups) => {
                if (!groups || groups.length === 0) return '-';
                const list = Array.isArray(groups) ? groups : [];
                return list.map(g => {
                    const displayName = g.name.length > 20 ? g.name.substring(0, 20) + '...' : g.name;
                    return `<a href="#" onclick="navBlaze('coll', '${g.id}'); return false;"
                        class="badge bg-light text-dark border"
                        style="margin:1px; text-decoration:none; display:block; width:fit-content; margin-bottom:2px;"
                        title="${g.name}">${displayName}</a>`;
                }).join('');
            };

            // DISCOUNT VALUE WITH OTD AUDIT
            let discountValueContent = row['Discount Value'];
            const discType = row['Discount Value Type'] || '';
            const isFinalPrice = discType.toLowerCase().includes('final');
            let rowHasPriceError = false;  // stamped onto <tr> for "Only Price Errors" filter

            if (isFinalPrice && discountValueContent && discountValueContent !== '-') {
                let btnStyle = "color:#0d6efd; border:1px solid #0d6efd;";
                let btnEmoji = "";
                let targetOtd = null;

                if (/BOGO|B2G1|B1G2/i.test(row.Name)) {
                    const bracketMatch = row.Name.match(/\[\$([0-9.]+)\]/);
                    if (bracketMatch) targetOtd = parseFloat(bracketMatch[1]);
                } else {
                    const bulkMatch = row.Name.match(/(\d+)\s+for\s+\$([0-9.]+)/i);
                    if (bulkMatch) targetOtd = parseFloat(bulkMatch[2]);
                }

                if (targetOtd !== null && Object.keys(TAX_RATES).length > 0) {
                    const discValue = parseFloat(String(discountValueContent).replace(/[^0-9.-]/g, ''));
                    let worstState = 0;

                    // When priceCheckAll is ON use every store; when OFF only Davis + Dixon
                    const auditStores = priceCheckAll ? Object.keys(TAX_RATES) : DAVIS_DIXON_STORES;
                    auditStores.forEach(strictStore => {
                        const isApplicable = applicableStores.some(loc =>
                            loc.includes(strictStore) || strictStore.includes(loc));
                        if (isApplicable && TAX_RATES[strictStore]) {
                            const rate = TAX_RATES[strictStore];
                            const calculatedRounded = Math.round(discValue * rate * 100) / 100;
                            const targetRounded = Math.round(targetOtd * 100) / 100;
                            const diffCents = Math.round((calculatedRounded - targetRounded) * 100);
                            let currentState = 0;
                            if (diffCents === 0) currentState = 0;
                            else if (diffCents === -1) currentState = 1;
                            else if (diffCents === 1) currentState = 2;
                            else currentState = 3;
                            if (currentState > worstState) worstState = currentState;
                        }
                    });

                    if (worstState === 3) { btnStyle = "color:#dc3545; border:1px solid #dc3545;"; btnEmoji = " ⚠️⚠️"; rowHasPriceError = true; }
                    else if (worstState === 2) { btnStyle = "color:#fd7e14; border:1px solid #fd7e14;"; btnEmoji = " ⚠️"; }
                    else if (worstState === 1) { btnStyle = "color:#198754; border:1px solid #198754;"; btnEmoji = " ⚠️"; }
                    else { btnStyle = "color:#198754; border:1px solid #198754;"; btnEmoji = " ✅"; }
                }

                discountValueContent = `<button class="btn btn-sm"
                    style="font-weight:bold; padding:0px 6px; background:white; ${btnStyle}"
                    onclick="showOtdModal(${index})">
                    ${discountValueContent} ${btnEmoji}</button>`;
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
                <td><span style="font-size:0.85rem; font-style:italic;">${daysDisplay}</span></td>
            `;
            tr.setAttribute('data-promo-id', row.ID);
            tr.setAttribute('data-price-error', rowHasPriceError ? 'true' : 'false');
            tbody.appendChild(tr);
        });
    }

    // Add checkbox header for draft mode
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
        const thead = document.querySelector('#promotionsTable thead tr');
        const existingCheckboxHeader = thead.querySelector('.draft-checkbox-header-cell');
        if (existingCheckboxHeader) existingCheckboxHeader.remove();
    }

    // Initialize DataTable
    const table = $('#promotionsTable').DataTable({
        paging: false,
        scrollY: '60vh',
        scrollCollapse: false,
        dom: 't',
        autoWidth: true,
        deferRender: true
    });

    if (draftSelectionState.isActive) updateDraftSelectedCount();

    const promoContent = document.getElementById('blaze-promo-content');
    if (promoContent && promoContent.style.display !== 'none') {
        setTimeout(function() { table.columns.adjust().draw(false); }, 50);
    }

    setTimeout(function() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(el => new bootstrap.Tooltip(el));
    }, 300);

    // DYNAMIC FILTER COUNTER
    table.on('draw', function() {
        const filteredData = table.rows({ search: 'applied' }).data();
        let filtActive = 0, filtInactive = 0, filtZombie = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const statusColIdx = getBlazeColumnIndex('status');
        const endColIdx = getBlazeColumnIndex('end');

        filteredData.each(function(value) {
            const statusHTML = String(value[statusColIdx] || '');
            const endDateHTML = String(value[endColIdx] || '');
            if (statusHTML.includes('Active')) {
                filtActive++;
                const dateMatch = endDateHTML.match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) {
                    try {
                        const endDate = new Date(dateMatch[0]);
                        endDate.setHours(0, 0, 0, 0);
                        if (endDate < today) filtZombie++;
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

        if (draftSelectionState.isActive) updateDraftCheckboxes();

        const nameFilter = document.getElementById('blazeNameSearch').value;
        const subFilter = document.getElementById('blazeSubSearch').value;
        const filteredGroup = document.getElementById('filteredStatsGroup');
        const downloadFilteredBtn = document.getElementById('downloadFilteredBtn');
        const hasActiveFilter = nameFilter.trim().length > 0 || subFilter.trim().length > 0;
        if (hasActiveFilter) {
            if (filteredGroup) filteredGroup.style.display = 'block';
            if (downloadFilteredBtn) downloadFilteredBtn.style.display = 'block';
        } else {
            if (filteredGroup) filteredGroup.style.display = 'none';
            if (downloadFilteredBtn) downloadFilteredBtn.style.display = 'none';
        }
    });

    table.draw();

    // PERSIST SEARCH STATE
    const primaryVal = document.getElementById('blazeNameSearch').value;
    const subVal = document.getElementById('blazeSubSearch').value;
    const subContainer = document.getElementById('subSearchContainer');
    if (primaryVal.trim().length > 0) {
        subContainer.style.display = 'flex';
        const nameColIndex = getBlazeColumnIndex('name');
        table.column(nameColIndex).search(primaryVal);
        table.search(subVal);
        table.draw();
    } else if (subVal.trim().length > 0) {
        document.getElementById('blazeSubSearch').value = '';
        subContainer.style.display = 'none';
    }
}

// ============================================
// FETCH + SYNC FUNCTIONS (monolith lines 19802–19950)
// Uses raw fetch() — DO NOT convert to api.blaze.refresh()
// The api wrapper returns parsed JSON; response.ok/.json() would be undefined
// ============================================

async function fetchBlazeData(isAuto = false) {
    const btn = document.querySelector("button[onclick='fetchBlazeData()']");
    const statusDiv = document.getElementById('blaze-sync-status');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ' + (isAuto ? 'Auto-Syncing...' : 'Syncing...');
    }
    if (isAuto && statusDiv) {
        statusDiv.innerHTML = '<span class="text-muted">Checking Blaze Token...</span>';
    }

    try {
        const response = await fetch('/api/blaze/refresh');
        if (!response.ok) throw new Error("Server Error");
        const data = await response.json();

        if (data.success) {
            renderBlazeTable(data.data);
            lastUpdateTS = Date.now() / 1000;
            if (isAuto) {
                console.log("[AUTO] Sync successful.");
                if (statusDiv) statusDiv.innerHTML = '<span class="text-success fw-bold">[OK] Connected</span>';
            }
        } else {
            const errorMsg = data.message || "Unknown Error";
            if (isAuto) {
                console.log("[AUTO] Sync failed: " + errorMsg);
                if (statusDiv) statusDiv.innerHTML = `<span class="text-danger fw-bold">[!] 🚨🚨🚨🚨 ${errorMsg}</span>`;
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

async function loadTableFromCache() {
    try {
        const response = await fetch('/api/blaze/get-cache');
        if (!response.ok) return;
        const data = await response.json();
        if (data.success) {
            console.log("Background update applied.");
            renderBlazeTable(data.data);
            lastUpdateTS = data.ts;
        }
    } catch (e) { console.log("Background load error:", e); }
}

// AUTO-REFRESH POLLING (monolith line 19867)
let lastUpdateTS = Date.now() / 1000;
setInterval(() => {
    const invContent = document.getElementById('blaze-inv-content');
    const isInventoryVisible = invContent && invContent.style.display !== 'none';
    const isZombieCleanupActive = zombieCleanupState && zombieCleanupState.isActive && !zombieCleanupState.isManualMode;

    if (typeof currentMainTab !== 'undefined' && currentMainTab === 'blaze' && !isInventoryVisible && !isZombieCleanupActive) {
        fetch(`/api/blaze/poll-update?ts=${lastUpdateTS}`)
            .then(r => r.json())
            .then(data => { if (data.update) loadTableFromCache(); })
            .catch(e => console.log("Poll error:", e));
    }
}, 2000);

// AUTO-SYNC ON STARTUP (monolith line 19895)
async function autoSyncBlazeData() {
    console.log('[AUTO-SYNC] Checking for Blaze token...');
    try {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const response = await fetch('/api/blaze/refresh');
        const data = await response.json();

        if (data.success) {
            console.log('[AUTO-SYNC] Blaze data synced successfully on startup');
            renderBlazeTable(data.data);
            const statusDiv = document.getElementById('blaze-sync-status');
            if (statusDiv) statusDiv.innerHTML = '<span class="text-success fw-bold">[OK] Auto-synced on startup</span>';
        } else {
            console.log('[AUTO-SYNC] Blaze sync skipped:', data.message || 'No token or error');
        }
    } catch (error) {
        console.log('[AUTO-SYNC] Blaze auto-sync not available:', error.message);
    }
}


// ============================================
// BROWSER STATUS CHECKER (monolith line 19716)
// ============================================
async function checkBrowserStatus() {
    try {
        const response = await fetch('/api/browser-status');
        const data = await response.json();

        const statusDiv = document.getElementById('browser-ready-status');
        const statusText = document.getElementById('browser-ready-text');

        if (data.ready) {
            if (statusDiv) statusDiv.className = 'alert alert-success';
            if (statusDiv) statusDiv.style.display = 'block';
            if (statusText) statusText.textContent = 'Ready!';
            console.log("[STARTUP] Browser Ready. Auto-sync disabled - use manual sync.");
        } else {
            if (statusDiv) statusDiv.className = 'alert alert-info';
            if (statusDiv) statusDiv.style.display = 'block';
            if (statusText) statusText.textContent = 'Initializing...';
            setTimeout(checkBrowserStatus, 1000);
        }
    } catch (error) {
        setTimeout(checkBrowserStatus, 2000);
    }
}

// ============================================
// BLAZE COLUMN INDEX HELPER (monolith line 19761)
// When draft mode is ON, checkbox col shifts all indices by 1
// ============================================
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

// ============================================
// BLAZE SEARCH FILTERS (monolith line 19745)
// ============================================
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

function applyBlazeFilters() {
    if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;

    const table = $('#promotionsTable').DataTable();
    const primaryVal = document.getElementById('blazeNameSearch').value;
    const subVal = document.getElementById('blazeSubSearch').value;

    const nameColIndex = getBlazeColumnIndex('name');
    table.column(nameColIndex).search(primaryVal);
    table.search(subVal);
    table.draw();
}

// ============================================
// PAGE LOAD BOOTSTRAP (monolith line 19885)
// This wires up all startup functions exactly as the monolith does.
// autoSyncBlazeData is called here — NOT from any other file.
// ============================================
window.addEventListener('load', function() {
    checkBrowserStatus();
    setupSearchEnhancements();
    autoLoadCredentials();
    autoAuthenticateGoogle();
    loadMisReportsFolderPath();
    autoSyncBlazeData();
    loadTaxRatesForEdit();
    loadTaxRates();
    initBlazeTableFilters();
});


// ============================================
// navBlaze — navigate Blaze browser to promo or collection (monolith line 18268)
// ============================================
async function navBlaze(type, id) {
    let url = '';
    if (type === 'promo') url = `https://retail.blaze.me/company-promotions/promotions/${id}#setup`;
    if (type === 'coll') url = `https://retail.blaze.me/company-promotions/smart-collections/${id}`;
    await fetch('/api/blaze/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });
}

// ============================================
// showOtdModal — OTD price breakdown with audit (monolith line 18282)
// ============================================
function showOtdModal(rowIndex) {
    const row = blazeData.currentRows[rowIndex];
    if (!row) return;

    const discountValueStr = String(row['Discount Value']).replace(/[^0-9.-]/g, '');
    const discValue = parseFloat(discountValueStr);
    if (isNaN(discValue)) { alert("Invalid price value"); return; }

    const modal = document.getElementById('detailModal');
    const backdrop = document.getElementById('detailModalBackdrop');

    document.getElementById('detailModalTitle').textContent = "OTD Price Breakdown";
    document.getElementById('detailModalId').textContent = `Base Price: $${discValue.toFixed(2)}`;
    document.getElementById('detailModalType').textContent = row.Name;

    const ALL_LOCATIONS_LIST = [
        "Beverly Hills", "Davis", "Dixon", "El Sobrante", "Fresno (Palm)",
        "Fresno Shaw", "Hawthorne", "Koreatown", "Laguna Woods",
        "Oxnard", "Riverside", "West Hollywood"
    ];

    let applicableStores = [];
    const locRaw = row.Locations || '';
    if (locRaw === 'All Locations') {
        applicableStores = ALL_LOCATIONS_LIST;
    } else {
        applicableStores = locRaw.split(',').map(l => l.trim()).filter(l => l);
    }

    let targetOtd = null;
    let skipAudit = false;
    if (/BOGO|B2G1|B1G2/i.test(row.Name)) {
        const bracketMatch = row.Name.match(/\[\$([0-9.]+)\]/);
        if (bracketMatch) { targetOtd = parseFloat(bracketMatch[1]); }
        else { skipAudit = true; }
    } else {
        const bulkMatch = row.Name.match(/(\d+)\s+for\s+\$([0-9.]+)/i);
        if (bulkMatch) targetOtd = parseFloat(bulkMatch[2]);
    }

    let bodyHTML = '<div class="section-header" style="color:#28a745;"> OUT THE DOOR PRICES</div>';

    if (typeof TAX_RATES === 'undefined' || Object.keys(TAX_RATES).length === 0) {
        bodyHTML += '<div class="alert alert-warning">Tax rates not loaded yet. Please wait or check Setup tab.</div>';
    } else {
        const sortedStores = Object.keys(TAX_RATES).sort();
        let foundAny = false;

        sortedStores.forEach(store => {
            const isApplicable = applicableStores.some(loc =>
                loc.includes(store) || store.includes(loc));
            if (!isApplicable) return;

            foundAny = true;
            const rate = TAX_RATES[store];
            const otdPrice = discValue * rate;
            const otdDisplay = otdPrice.toFixed(2);

            let rowColor = "color:#198754;";
            let auditInfo = "";
            let fixAction = "";

            if (!skipAudit && targetOtd !== null && (priceCheckAll ? true : DAVIS_DIXON_STORES.includes(store))) {
                const otdRounded = parseFloat(otdDisplay);
                const diff = Math.abs(otdRounded - targetOtd);
                if (diff < 0.009) {
                    auditInfo = ` <span style="color:#198754; font-size:0.8em;">([OK]✅ Target: $${targetOtd.toFixed(2)})</span>`;
                } else if (diff <= 0.019) {
                    rowColor = "color:#fd7e14;";
                    auditInfo = ` <span style="color:#fd7e14; font-size:0.8em;">([!] ⚠️ Target: $${targetOtd.toFixed(2)})</span>`;
                } else {
                    rowColor = "color:#dc3545; font-weight:bold;";
                    auditInfo = ` <span style="color:#dc3545; font-size:0.8em;">([X] Target: $${targetOtd.toFixed(2)})</span>`;
                    const correctPreTax = (targetOtd / rate).toFixed(2);
                    fixAction = `<button class="btn btn-sm btn-outline-danger"
                        style="padding:0px 6px; font-size:0.75em; margin-left:10px;"
                        onclick="navigator.clipboard.writeText('${correctPreTax}'); this.innerText='Copied!';">
                        Copy Fix: $${correctPreTax}</button>`;
                }
            }

            bodyHTML += `<div class="data-row" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:6px 0;">
                <div><span class="data-label" style="font-size:1.1em;">${store}</span>${auditInfo}</div>
                <div style="display:flex; align-items:center;">
                    <span class="data-value" style="${rowColor} font-size:1.1em;">$${otdDisplay}</span>
                    ${fixAction}
                </div>
            </div>`;
        });

        if (!foundAny) {
            bodyHTML += '<div class="data-row">No matching stores found for this promotion.</div>';
        }
    }

    document.getElementById('detailModalBody').innerHTML = bodyHTML;
    modal.style.display = 'block';
    backdrop.style.display = 'block';
}

// ============================================
// DETAIL HOVER MODAL (monolith lines 19950–20095)
// ============================================
function showDetailModal(row, isPinned = false) {
    const modal = document.getElementById('detailModal');
    const backdrop = document.getElementById('detailModalBackdrop');
    if (!modal || !backdrop) return;

    document.getElementById('detailModalTitle').textContent = row.Name || 'N/A';
    document.getElementById('detailModalId').textContent = `ID: ${row.ID || 'N/A'}`;
    document.getElementById('detailModalType').textContent = `Type: ${row['Discount Value Type'] || 'N/A'}`;

    let bodyHTML = '';

    // SETUP
    bodyHTML += '<div class="section-header" style="color:#0066cc;"> SETUP</div>';
    bodyHTML += `<div class="data-row"><span class="data-label">Description:</span> ${row.description || 'None'}</div>`;

    if (row.buy_requirements && row.buy_requirements.length > 0) {
        bodyHTML += '<div class="data-row"><span class="data-label">Buy Requirements:</span></div>';
        row.buy_requirements.forEach(req => {
            bodyHTML += `<div class="data-row" style="padding-left:30px;">&#x2022; Qty: ${req.quantity} | Items: ${req.items.join(', ')}</div>`;
        });
    } else {
        bodyHTML += '<div class="data-row"><span class="data-label">Buy Requirements:</span> None</div>';
    }

    if (row.buy_qty || row.get_qty) {
        bodyHTML += `<div class="data-row"><span class="data-label">Buy/Get Qty:</span> Buy ${row.buy_qty || 1} / Get ${row.get_qty || 1}</div>`;
    }

    bodyHTML += `<div class="data-row"><span class="data-label">Get/Target:</span> ${row.target_type || 'N/A'} - ${row.target_value || 'N/A'}</div>`;

    // ADVANCED
    bodyHTML += '<div class="section-header" style="color:#cc6600;">&#x2699;️ ADVANCED</div>';
    bodyHTML += `<div class="data-row"><span class="data-label">Auto Apply:</span> ${row.auto_apply ? 'Yes' : 'No'}</div>`;
    bodyHTML += `<div class="data-row"><span class="data-label">Stackable:</span> ${row.stackable ? 'Yes' : 'No'}</div>`;
    bodyHTML += `<div class="data-row"><span class="data-label">Lowest Price First:</span> ${row.apply_lowest_price_first ? 'Yes' : 'No'}</div>`;
    bodyHTML += `<div class="data-row"><span class="data-label">Priority:</span> ${row.priority || '5 - Lowest'}</div>`;

    if (row.enable_promo_code) {
        bodyHTML += `<div class="data-row"><span class="data-label">Promo Code:</span> ${row.promo_code || 'N/A'}</div>`;
    }

    bodyHTML += `<div class="data-row"><span class="data-label">Max Uses (Total):</span> ${row.max_uses || 'Unlimited'}</div>`;
    bodyHTML += `<div class="data-row"><span class="data-label">Max Uses (Per Member):</span> ${row.max_uses_per_consumer || 'Unlimited'}</div>`;

    if (row.restrictions) {
        const hasR = row.restrictions.member_groups.length > 0 ||
                     row.restrictions.consumer_types.length > 0 ||
                     row.restrictions.sales_channels.length > 0;
        if (hasR) {
            bodyHTML += '<div class="data-row"><span class="data-label">Restrictions:</span></div>';
            if (row.restrictions.member_groups.length > 0)
                bodyHTML += `<div class="data-row" style="padding-left:30px;">&#x2022; Member Groups: ${row.restrictions.member_groups.join(', ')}</div>`;
            if (row.restrictions.consumer_types.length > 0)
                bodyHTML += `<div class="data-row" style="padding-left:30px;">&#x2022; Consumer Types: ${row.restrictions.consumer_types.join(', ')}</div>`;
            if (row.restrictions.sales_channels.length > 0)
                bodyHTML += `<div class="data-row" style="padding-left:30px;">&#x2022; Sales Channels: ${row.restrictions.sales_channels.join(', ')}</div>`;
        }
    }

    // SCHEDULE
    bodyHTML += '<div class="section-header" style="color:#009933;"> SCHEDULE</div>';
    bodyHTML += `<div class="data-row"><span class="data-label">Date Range:</span> ${row['Start Date']} to ${row['End Date']}</div>`;

    if (row.time_constraint) {
        if (row.time_constraint.days && row.time_constraint.days.length > 0)
            bodyHTML += `<div class="data-row"><span class="data-label">Days:</span> ${row.time_constraint.days.join(', ')}</div>`;
        if (row.time_constraint.start_time && row.time_constraint.end_time)
            bodyHTML += `<div class="data-row"><span class="data-label">Time:</span> ${row.time_constraint.start_time} - ${row.time_constraint.end_time}</div>`;
    }

    document.getElementById('detailModalBody').innerHTML = bodyHTML;

    detailModalState.isPinned = isPinned;
    detailModalState.currentPromoId = row.ID;

    modal.style.display = 'block';
    if (isPinned) backdrop.style.display = 'block';
}

function hideDetailModal() {
    if (detailModalState.isPinned) return;
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
        closeDetailModal();
    } else {
        if (detailModalState.currentPromoId && detailModalState.currentPromoId !== row.ID) {
            closeDetailModal();
        }
        showDetailModal(row, true);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const backdrop = document.getElementById('detailModalBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeDetailModal);
});

// ============================================
// switchBlazeTab — toggle Promos / Inventory sub-tab (monolith line 21383)
// ============================================
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


// ============================================================
// EXPORT FUNCTIONS (monolith lines 18949–19035)
// ============================================================
async function exportData(mode) {
    if (mode === 'full') {
        window.location.href = '/api/blaze/export-csv';
    } else {
        console.log('Export mode not implemented:', mode);
    }
}

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

    // Collect visible row IDs via data-promo-id (most reliable)
    const visibleIds = [];
    const visibleRows = table.rows({ search: 'applied' }).nodes();
    $(visibleRows).each(function() {
        const promoId = $(this).attr('data-promo-id');
        if (promoId) visibleIds.push(promoId);
    });

    // Fallback: parse from ID column HTML
    if (visibleIds.length === 0) {
        const idColIndex = draftSelectionState.isActive ? 2 : 1;
        filteredData.each(function(rowData) {
            const idMatch = String(rowData[idColIndex]).match(/(\d+)/);
            if (idMatch) visibleIds.push(idMatch[1]);
        });
    }

    if (visibleIds.length === 0) {
        alert('Could not extract IDs from filtered data');
        return;
    }

    console.log('[EXPORT] Exporting ' + visibleIds.length + ' filtered rows');

    try {
        const response = await fetch('/api/blaze/export-filtered-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: visibleIds })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `blaze_filtered_report_${new Date().toISOString().slice(0,19).replace(/[:-]/g,'')}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            alert('Export failed: ' + await response.text());
        }
    } catch (e) {
        alert('Export error: ' + e.message);
    }
}

// ============================================================
// ZOMBIE CLEANUP (monolith lines 19051–19310)
// ============================================================
function toggleZombieCleanupMode() {
    const toggle = document.getElementById('zombieCleanupToggle');
    const btn = document.getElementById('zombieCleanupBtn');
    if (toggle.checked) {
        btn.style.display = 'inline-block';
    } else {
        btn.style.display = 'none';
        if (zombieCleanupState.isActive) finishZombieCleanup();
    }
}

function startZombieCleanup() {
    zombieCleanupState.originalFilters.nameFilter = document.getElementById('blazeNameSearch').value;
    zombieCleanupState.originalFilters.subFilter  = document.getElementById('blazeSubSearch').value;

    const zombieIds = findZombieIds();
    if (zombieIds.length === 0) {
        alert('No zombie deals found! All active deals have valid end dates.');
        return;
    }

    zombieCleanupState.zombieIds    = zombieIds;
    zombieCleanupState.currentIndex = 0;

    document.getElementById('zombieCountDisplay').textContent         = zombieIds.length;
    document.getElementById('zombieModalBackdrop').style.display      = 'block';
    document.getElementById('zombieModal').style.display              = 'block';
    document.getElementById('zombieActionButtons').style.display      = 'flex';
    document.getElementById('zombieProgressContainer').style.display  = 'none';
}

function findZombieIds() {
    const zombieIds = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (blazeData.currentRows && Array.isArray(blazeData.currentRows)) {
        blazeData.currentRows.forEach(row => {
            const status     = (row.Status || '').trim();
            const endDateStr = (row['End Date'] || '').trim();
            if (status === 'Active' && endDateStr) {
                try {
                    const parts = endDateStr.split('-');
                    if (parts.length === 3) {
                        const endDate = new Date(parts[0], parts[1] - 1, parts[2]);
                        endDate.setHours(0, 0, 0, 0);
                        if (endDate.getTime() < today.getTime()) zombieIds.push(row.ID);
                    }
                } catch (e) { console.error('Date parse error', e); }
            }
        });
    }
    return zombieIds;
}

function applyZombieFilter() {
    if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;
    const table = $('#promotionsTable').DataTable();

    document.getElementById('blazeNameSearch').value = '';
    document.getElementById('blazeSubSearch').value  = '';
    const nameColIndex   = getBlazeColumnIndex('name');
    const statusColIndex = getBlazeColumnIndex('status');
    const endColIndex    = getBlazeColumnIndex('end');
    table.column(nameColIndex).search('');
    table.search('');

    $.fn.dataTable.ext.search.push(function(settings, data) {
        if (settings.nTable.id !== 'promotionsTable') return true;
        const statusHTML  = data[statusColIndex] || '';
        const endDateHTML = data[endColIndex]    || '';
        if (!statusHTML.includes('Active')) return false;
        const dateMatch = endDateHTML.match(/\d{4}-\d{2}-\d{2}/);
        if (!dateMatch) return false;
        try {
            const endDate = new Date(dateMatch[0]);
            const today   = new Date();
            endDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            return endDate < today;
        } catch (e) { return false; }
    });

    table.draw();
}

function clearZombieFilter() {
    $.fn.dataTable.ext.search.pop();
    if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;
    $('#promotionsTable').DataTable().draw();
}

function runManualCleanup() {
    zombieCleanupState.isActive    = true;
    zombieCleanupState.isManualMode = true;
    document.getElementById('zombieModalBackdrop').style.display = 'none';
    document.getElementById('zombieModal').style.display         = 'none';
    applyZombieFilter();
    const btn = document.getElementById('zombieCleanupBtn');
    btn.innerHTML = '[OK]✅ Finish Cleanup';
    btn.classList.add('cleanup-mode');
    btn.onclick = finishZombieCleanup;
}

async function runAutoCleanup() {
    zombieCleanupState.isActive     = true;
    zombieCleanupState.isManualMode = false;
    zombieCleanupState.currentIndex = 0;

    document.getElementById('zombieActionButtons').style.display     = 'none';
    document.getElementById('zombieProgressContainer').style.display = 'block';
    applyZombieFilter();

    const btn = document.getElementById('zombieCleanupBtn');
    btn.innerHTML = '<span class="spin"></span> Processing...';
    btn.disabled  = true;

    const total = zombieCleanupState.zombieIds.length;
    for (let i = 0; i < total; i++) {
        zombieCleanupState.currentIndex = i;
        const promoId = zombieCleanupState.zombieIds[i];
        const percent = Math.round(((i + 1) / total) * 100);
        document.getElementById('zombieProgressFill').style.width = percent + '%';
        document.getElementById('zombieProgressText').textContent = `Processing ${i + 1} of ${total}: ID ${promoId}`;

        try {
            const response = await fetch('/api/blaze/zombie-disable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ promo_id: promoId })
            });
            const result = await response.json();
            if (!result.success) {
                document.getElementById('zombieProgressText').textContent =
                    `[!] ⚠️ Error on ID ${promoId}: ${result.error}. Continuing...`;
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (e) {
            document.getElementById('zombieProgressText').textContent =
                `[!] ⚠️ Network error on ID ${promoId}. Continuing...`;
            await new Promise(r => setTimeout(r, 2000));
        }
        await new Promise(r => setTimeout(r, 500));
    }

    document.getElementById('zombieProgressText').textContent         = `[OK]✅ Completed! Disabled ${total} zombie deal(s).`;
    document.getElementById('zombieProgressFill').style.width         = '100%';
    document.getElementById('zombieProgressFill').style.background    = '#28a745';
    await new Promise(r => setTimeout(r, 2000));
    finishZombieCleanup();
    fetchBlazeData();
}

function cancelZombieCleanup() {
    document.getElementById('zombieModalBackdrop').style.display = 'none';
    document.getElementById('zombieModal').style.display         = 'none';
    zombieCleanupState.isActive  = false;
    zombieCleanupState.zombieIds = [];
}

function finishZombieCleanup() {
    clearZombieFilter();
    document.getElementById('zombieModalBackdrop').style.display     = 'none';
    document.getElementById('zombieModal').style.display             = 'none';
    document.getElementById('zombieActionButtons').style.display     = 'flex';
    document.getElementById('zombieProgressContainer').style.display = 'none';
    document.getElementById('zombieProgressFill').style.width        = '0%';
    document.getElementById('zombieProgressFill').style.background   = 'linear-gradient(90deg, #dc3545, #fd7e14)';

    const btn = document.getElementById('zombieCleanupBtn');
    btn.innerHTML = ' Zombie Cleanup';
    btn.classList.remove('cleanup-mode');
    btn.onclick  = startZombieCleanup;
    btn.disabled = false;

    document.getElementById('blazeNameSearch').value = zombieCleanupState.originalFilters.nameFilter;
    document.getElementById('blazeSubSearch').value  = zombieCleanupState.originalFilters.subFilter;
    applyBlazeFilters();

    zombieCleanupState.isActive     = false;
    zombieCleanupState.isManualMode = false;
    zombieCleanupState.zombieIds    = [];
    zombieCleanupState.currentIndex = 0;
}

// ============================================================
// DRAFT SELECTED (monolith lines 19325–19700)
// ============================================================
function toggleDraftSelectionMode() {
    const toggle = document.getElementById('draftSelectionToggle');
    const btn    = document.getElementById('draftSelectedBtn');
    if (toggle.checked) {
        draftSelectionState.isActive = true;
        btn.style.display = 'inline-block';
        rerenderBlazeTableWithCheckboxes();
        updateDraftSelectedCount();
    } else {
        draftSelectionState.isActive = false;
        btn.style.display = 'none';
        draftSelectionState.selectedDealIds.clear();
        rerenderBlazeTableWithCheckboxes();
    }
}

function rerenderBlazeTableWithCheckboxes() {
    if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;
    const table    = $('#promotionsTable').DataTable();
    const isActive = draftSelectionState.isActive;
    const thead    = document.querySelector('#promotionsTable thead tr');
    const existing = thead.querySelector('.draft-checkbox-header-cell');

    if (isActive && !existing) {
        const th = document.createElement('th');
        th.className  = 'draft-checkbox-header-cell';
        th.style.cssText = 'width:30px !important; text-align:center;';
        th.innerHTML  = '<input type="checkbox" class="draft-checkbox-header" onclick="toggleSelectAllVisible(this)" title="Select all visible">';
        thead.insertBefore(th, thead.firstChild);
    } else if (!isActive && existing) {
        existing.remove();
    }

    const rows = document.querySelectorAll('#promotionsTable tbody tr');
    rows.forEach(row => {
        const existingCell = row.querySelector('.draft-checkbox-cell');
        const rowId        = row.getAttribute('data-promo-id');
        if (isActive) {
            if (!existingCell && rowId) {
                const td       = document.createElement('td');
                td.className   = 'draft-checkbox-cell';
                const isChecked = draftSelectionState.selectedDealIds.has(rowId);
                td.innerHTML   = `<input type="checkbox" class="draft-checkbox" data-promo-id="${rowId}" ${isChecked ? 'checked' : ''} onchange="toggleDraftSelection('${rowId}', this.checked)">`;
                row.insertBefore(td, row.firstChild);
            } else if (existingCell && rowId) {
                const cb = existingCell.querySelector('input');
                if (cb) cb.checked = draftSelectionState.selectedDealIds.has(rowId);
            }
        } else if (existingCell) {
            existingCell.remove();
        }
    });

    table.columns.adjust().draw(false);
}

function toggleDraftSelection(promoId, isChecked) {
    if (isChecked) draftSelectionState.selectedDealIds.add(promoId);
    else           draftSelectionState.selectedDealIds.delete(promoId);
    updateDraftSelectedCount();
}

function toggleSelectAllVisible(headerCheckbox) {
    const visibleIds = getVisibleDealIds();
    if (headerCheckbox.checked) {
        if (!confirm(`This will select ${visibleIds.length} currently visible deal(s). Continue?`)) {
            headerCheckbox.checked = false;
            return;
        }
        visibleIds.forEach(id => draftSelectionState.selectedDealIds.add(id));
    } else {
        visibleIds.forEach(id => draftSelectionState.selectedDealIds.delete(id));
    }
    updateDraftCheckboxes();
    updateDraftSelectedCount();
}

function getVisibleDealIds() {
    const ids  = [];
    const rows = document.querySelectorAll('#promotionsTable tbody tr');
    rows.forEach(row => {
        if (row.style.display !== 'none') {
            const promoId = row.getAttribute('data-promo-id');
            if (promoId) ids.push(promoId);
        }
    });
    return ids;
}

function updateDraftCheckboxes() {
    document.querySelectorAll('.draft-checkbox').forEach(cb => {
        cb.checked = draftSelectionState.selectedDealIds.has(cb.getAttribute('data-promo-id'));
    });
}

function updateDraftSelectedCount() {
    const count = draftSelectionState.selectedDealIds.size;
    document.getElementById('draftSelectedCount').textContent = count;
    const btn = document.getElementById('draftSelectedBtn');
    if (count > 0) { btn.classList.add('has-selections');    btn.disabled = false; }
    else           { btn.classList.remove('has-selections'); btn.disabled = true;  }
}

function startDraftSelected() {
    const count = draftSelectionState.selectedDealIds.size;
    if (count === 0) { alert('No deals selected. Use the checkboxes to select deals first.'); return; }
    document.getElementById('draftCountDisplay').textContent           = count;
    document.getElementById('draftModalBackdrop').style.display        = 'block';
    document.getElementById('draftModal').style.display                = 'block';
    document.getElementById('draftActionButtons').style.display        = 'flex';
    document.getElementById('draftProgressContainer').style.display    = 'none';
}

function cancelDraftModal() {
    document.getElementById('draftModalBackdrop').style.display = 'none';
    document.getElementById('draftModal').style.display         = 'none';
}

async function runDraftAutomation() {
    const selectedIds = Array.from(draftSelectionState.selectedDealIds);
    const total       = selectedIds.length;
    draftSelectionState.isAutomating = true;
    draftSelectionState.shouldStop   = false;
    draftSelectionState.currentIndex = 0;
    draftSelectionState.draftedDeals = [];
    draftSelectionState.totalToDraft = total;

    document.getElementById('draftActionButtons').style.display     = 'none';
    document.getElementById('draftProgressContainer').style.display = 'block';
    document.getElementById('draftStopBtn').style.display           = 'block';

    for (let i = 0; i < total; i++) {
        if (draftSelectionState.shouldStop) {
            document.getElementById('draftProgressText').textContent =
                `Stopped at ${i} of ${total}. ${draftSelectionState.draftedDeals.length} drafted.`;
            break;
        }

        draftSelectionState.currentIndex = i;
        const promoId  = selectedIds[i];
        const dealInfo = blazeData.currentRows?.find(r => String(r.ID) === String(promoId));
        const percent  = Math.round(((i + 1) / total) * 100);
        document.getElementById('draftProgressFill').style.width = percent + '%';
        document.getElementById('draftProgressText').textContent =
            `Drafting ${i + 1} of ${total}: ${dealInfo?.Name || 'ID ' + promoId}`;

        try {
            const response = await fetch('/api/blaze/zombie-disable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ promo_id: promoId })
            });
            const result = await response.json();
            if (result.success) {
                draftSelectionState.draftedDeals.push({
                    id: promoId, name: dealInfo?.Name || 'Unknown', status: 'Drafted',
                    locations: dealInfo?.Locations || '-',
                    startDate: dealInfo?.['Start Date'] || '-', endDate: dealInfo?.['End Date'] || '-'
                });
            } else {
                document.getElementById('draftProgressText').textContent =
                    `Error on ${dealInfo?.Name || promoId}: ${result.error}. Continuing...`;
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (e) {
            document.getElementById('draftProgressText').textContent =
                `Network error on ${dealInfo?.Name || promoId}. Continuing...`;
            await new Promise(r => setTimeout(r, 2000));
        }
        await new Promise(r => setTimeout(r, 500));
    }

    draftSelectionState.isAutomating = false;
    if (!draftSelectionState.shouldStop) {
        document.getElementById('draftProgressText').textContent =
            `Complete! Drafted ${draftSelectionState.draftedDeals.length} deal(s).`;
        document.getElementById('draftProgressFill').style.width      = '100%';
        document.getElementById('draftProgressFill').style.background = '#28a745';
    }
    document.getElementById('draftStopBtn').style.display = 'none';
    await new Promise(r => setTimeout(r, 1500));

    document.getElementById('draftModalBackdrop').style.display     = 'none';
    document.getElementById('draftModal').style.display             = 'none';
    document.getElementById('draftActionButtons').style.display     = 'flex';
    document.getElementById('draftProgressContainer').style.display = 'none';
    document.getElementById('draftProgressFill').style.width        = '0%';
    document.getElementById('draftProgressFill').style.background   = 'linear-gradient(90deg, #fd7e14, #ffc107)';

    draftSelectionState.selectedDealIds.clear();
    updateDraftSelectedCount();
    updateDraftCheckboxes();
    showDraftReviewModal();
    fetchBlazeData();
}

function stopDraftAutomation() {
    draftSelectionState.shouldStop = true;
    const btn = document.getElementById('draftStopBtn');
    btn.disabled    = true;
    btn.textContent = 'Stopping...';
}

function showDraftReviewModal() {
    const drafted = draftSelectionState.draftedDeals;
    if (drafted.length === 0) { alert('No deals were drafted.'); return; }
    document.getElementById('draftReviewCount').textContent = drafted.length;

    let tableHtml = `<table class="table table-sm table-striped" style="font-size:0.85em;">
        <thead style="background:#e9ecef;">
            <tr><th>ID</th><th>Name</th><th>Status</th><th>Locations</th><th>Start</th><th>End</th></tr>
        </thead><tbody>`;
    drafted.forEach(deal => {
        tableHtml += `<tr>
            <td>${deal.id}</td><td>${deal.name}</td>
            <td><span class="badge bg-success">${deal.status}</span></td>
            <td title="${deal.locations}" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${deal.locations}</td>
            <td>${deal.startDate}</td><td>${deal.endDate}</td>
        </tr>`;
    });
    tableHtml += '</tbody></table>';

    document.getElementById('draftReviewTableContainer').innerHTML = tableHtml;
    document.getElementById('draftReviewModalBackdrop').style.display = 'block';
    document.getElementById('draftReviewModal').style.display         = 'block';
}

function closeDraftReviewModal() {
    document.getElementById('draftReviewModalBackdrop').style.display = 'none';
    document.getElementById('draftReviewModal').style.display         = 'none';
    draftSelectionState.draftedDeals = [];
}

function filterToDraftedDeals() {
    const draftedIds = draftSelectionState.draftedDeals.map(d => d.id);
    if (draftedIds.length === 0) return;
    closeDraftReviewModal();
    if (!$.fn.DataTable.isDataTable('#promotionsTable')) return;
    const table = $('#promotionsTable').DataTable();

    document.getElementById('blazeNameSearch').value = '';
    document.getElementById('blazeSubSearch').value  = '';
    const nameColIndex = getBlazeColumnIndex('name');
    const idColIndex   = getBlazeColumnIndex('id');
    table.column(nameColIndex).search('');
    table.search('');

    $.fn.dataTable.ext.search.push(function(settings, data) {
        if (settings.nTable.id !== 'promotionsTable') return true;
        const idMatch = (data[idColIndex] || '').match(/\d+/);
        if (!idMatch) return false;
        return draftedIds.includes(idMatch[0]);
    });
    table.draw();

    // Auto-clear filter after 30 seconds
    setTimeout(() => { $.fn.dataTable.ext.search.pop(); table.draw(); }, 30000);
}

// ============================================================================
// BLAZE TABLE FILTERS — one-time init (monolith pattern: register filter once,
// never inside renderBlazeTable which is called every 2s on auto-sync)
// ============================================================================

let _blazeFiltersInitialized = false;
function initBlazeTableFilters() {
    if (_blazeFiltersInitialized) return;
    _blazeFiltersInitialized = true;

    // Hide Inactive filter — registered ONCE so it doesn't accumulate on each render
    $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
        if (settings.nTable.id !== 'promotionsTable') return true;
        const hideInactive = document.getElementById('hideInactiveToggle');
        if (hideInactive && hideInactive.checked) {
            const statusColIdx = getBlazeColumnIndex('status');
            const statusValue = data[statusColIdx] ? data[statusColIdx].toString().toLowerCase() : '';
            if (statusValue.includes('inactive')) return false;
        }
        return true;
    });

    const toggle = document.getElementById('hideInactiveToggle');
    if (toggle) {
        toggle.addEventListener('change', function() {
            const dt = $.fn.dataTable.isDataTable('#promotionsTable');
            if (dt) $('#promotionsTable').DataTable().draw();
        });
    }

    // Only Price Errors filter — show only rows where worstState === 3 (red button)
    $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
        if (settings.nTable.id !== 'promotionsTable') return true;
        if (!priceErrorsOnly) return true;
        const rowNode = $(settings.nTable).DataTable().row(dataIndex).node();
        return rowNode && rowNode.getAttribute('data-price-error') === 'true';
    });

    const errToggle = document.getElementById('priceErrorsOnlyToggle');
    if (errToggle) {
        errToggle.addEventListener('change', onPriceErrorsOnlyChange);
    }
}


// ============================================================================
// TAX RATES EDITING FUNCTIONS (Setup Tab) — extracted from monolith lines 20963–21050
// ============================================================================

async function loadTaxRatesForEdit() {
    try {
        const resp = await fetch('/api/tax-rates');
        const data = await resp.json();

        if (!data.success) {
            alert('Failed to load tax rates: ' + data.error);
            return;
        }

        const rates = data.rates;
        const container = document.getElementById('tax-rates-container');
        if (!container) return;
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

        const statusEl = document.getElementById('tax-save-status');
        if (statusEl) statusEl.innerHTML = '';

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

        const resp = await fetch('/api/save-tax-rates', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({rates: rates})
        });

        const data = await resp.json();
        const statusDiv = document.getElementById('tax-save-status');

        if (data.success) {
            statusDiv.innerHTML = '<span class="text-success">[SUCCESS] ' + data.message + '</span>';
            // Refresh the editor inputs and repopulate calculator dropdown
            await loadTaxRatesForEdit();
            await loadTaxRates();
        } else {
            statusDiv.innerHTML = '<span class="text-danger">[X] ' + data.error + '</span>';
        }

    } catch (err) {
        console.error('Error saving tax rates:', err);
        const statusDiv = document.getElementById('tax-save-status');
        if (statusDiv) {
            statusDiv.innerHTML = '<span class="text-danger">[X] Error: ' + err.message + '</span>';
        }
    }
}

// ============================================================================
// TAX CALCULATOR FUNCTIONS — extracted from monolith lines 21058–21260
// Powers calcModal: loadTaxRates, populateStoreDropdown, updateTaxRateDisplay,
// runAllCalculations, switchCalculator, calculatePostTax/PreTax/Percentage/
// VendorRebate/Reprice
// ============================================================================
// currentStore declared in state.js — used here by reference

async function loadTaxRates() {
    try {
        const resp = await fetch('/api/tax-rates');
        const data = await resp.json();

        if (data.success) {
            TAX_RATES = data.rates;
            populateStoreDropdown();
        } else {
            console.error('Failed to load tax rates:', data.error);
            const el = document.getElementById('calcStoreSelect');
            if (el) el.innerHTML = '<option value="">-- No tax rates found --</option>';
        }
    } catch (err) {
        console.error('Error loading tax rates:', err);
        const el = document.getElementById('calcStoreSelect');
        if (el) el.innerHTML = '<option value="">-- Error loading rates --</option>';
    }
}

function populateStoreDropdown() {
    const select = document.getElementById('calcStoreSelect');
    if (!select) return;
    const stores = Object.keys(TAX_RATES).sort();

    select.innerHTML = '<option value="">-- Select Store --</option>';
    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store;
        option.textContent = store;
        select.appendChild(option);
    });

    if (stores.length > 0) {
        select.value = stores[0];
        currentStore = stores[0];
        updateTaxRateDisplay();
    }
}

function updateTaxRateDisplay() {
    const select = document.getElementById('calcStoreSelect');
    if (!select) return;
    currentStore = select.value;
    const display = document.getElementById('calcTaxDisplay');
    if (!display) return;

    if (currentStore && TAX_RATES[currentStore]) {
        const rate = TAX_RATES[currentStore];
        const percentage = ((rate - 1) * 100).toFixed(2);
        display.textContent = `Tax Rate: ${rate.toFixed(4)} (${percentage}% tax)`;
    } else {
        display.textContent = 'Tax Rate: Not selected';
    }
}

function toggleCalcModal() {
    const modal = document.getElementById('calcModal');
    if (!modal) return;
    if (modal.classList.contains('show')) {
        modal.classList.remove('show');
    } else {
        modal.classList.add('show');
    }
}

function runAllCalculations() {
    calculatePostTax();
    calculatePreTax();
    calculatePercentage();
    calculateVendorRebate();
    calculateReprice();
}

function switchCalculator() {
    const selected = document.getElementById('calcTypeSelect').value;
    const sections = ['calc-postTax', 'calc-preTax', 'calc-percent', 'calc-rebate', 'calc-reprice'];

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === 'calc-' + selected) ? 'block' : 'none';
    });
}

function calculatePostTax() {
    if (!currentStore || !TAX_RATES[currentStore]) {
        document.getElementById('postTaxResult').textContent = '-- (Select Store)';
        return;
    }
    const inputVal = document.getElementById('postTaxInput').value;
    if (inputVal === '') { document.getElementById('postTaxResult').textContent = '--'; return; }
    const afterTax = parseFloat(inputVal) * TAX_RATES[currentStore];
    document.getElementById('postTaxResult').textContent = '$' + afterTax.toFixed(2);
}

function calculatePreTax() {
    if (!currentStore || !TAX_RATES[currentStore]) {
        document.getElementById('preTaxResult').textContent = '-- (Select Store)';
        return;
    }
    const inputVal = document.getElementById('preTaxInput').value;
    if (inputVal === '') { document.getElementById('preTaxResult').textContent = '--'; return; }
    const discountValue = parseFloat(inputVal) / TAX_RATES[currentStore];
    document.getElementById('preTaxResult').textContent = '$' + discountValue.toFixed(2);
}

function calculatePercentage() {
    const baseVal = document.getElementById('percBaseInput').value;
    const resVal = document.getElementById('percResultInput').value;
    if (baseVal === '' || resVal === '') { document.getElementById('percResult').textContent = '--'; return; }
    const base = parseFloat(baseVal);
    if (base === 0) { document.getElementById('percResult').textContent = 'Error'; return; }
    const percentage = ((base - parseFloat(resVal)) / base) * 100;
    document.getElementById('percResult').textContent = percentage.toFixed(2) + '%';
}

function calculateVendorRebate() {
    const discVal = document.getElementById('vendorDiscountInput').value;
    const rebateVal = document.getElementById('vendorRebateInput').value;
    if (discVal === '' || rebateVal === '') { document.getElementById('vendorResult').textContent = '--'; return; }
    const vendorContribution = (parseFloat(discVal) * parseFloat(rebateVal)) / 100;
    document.getElementById('vendorResult').textContent = '$' + vendorContribution.toFixed(2);
}

function calculateReprice() {
    const origVal = document.getElementById('repriceOriginal').value;
    const currVal = document.getElementById('repriceCurrent').value;
    const targetVal = document.getElementById('repriceTargetPerc').value;
    if (origVal === '' || currVal === '' || targetVal === '') {
        document.getElementById('repriceResult').textContent = '--';
        return;
    }
    const originalPrice = parseFloat(origVal);
    if (originalPrice === 0) return;
    const desiredFinalPrice = originalPrice * (1 - (parseFloat(targetVal) / 100));
    const differenceNeeded = parseFloat(currVal) - desiredFinalPrice;
    document.getElementById('repriceResult').textContent = '$' + differenceNeeded.toFixed(3);
}

// calcModal event listeners (set up once on DOMContentLoaded)
document.addEventListener('DOMContentLoaded', function() {
    const calcModal = document.getElementById('calcModal');
    if (calcModal) {
        calcModal.addEventListener('click', function(e) {
            if (e.target === this) toggleCalcModal();
        });
    }
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('calcModal');
            if (modal && modal.classList.contains('show')) toggleCalcModal();
        }
    });
});