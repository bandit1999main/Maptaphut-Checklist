/**
 * app.js - Main Application Logic, State Controller & Dashboard Renderer
 * Implements full Task CRUD, Category Management, Drag & Drop attachments,
 * local alerts, and interactive SVG analytics.
 */

// ====================================================
// 1. CONSTANTS & SYSTEM CONFIGURATION
// ====================================================
const DEFAULT_CATEGORIES = [
    { id: 'cat-daily', name: 'บัญชีประจำวัน ส่วนการเงิน', color: '#737c68', isDefault: true },
    { id: 'cat-bsk60', name: 'บสค.60 ส่วนการเงิน', color: '#a39580', isDefault: true },
    { id: 'cat-invoice', name: 'ใบแจ้งหนี้ ส่วนการเงิน', color: '#788896', isDefault: true },
    { id: 'cat-monthly', name: 'บัญชีประจำเดือน ส่วนการเงิน', color: '#b58970', isDefault: true },
    { id: 'cat-whtax', name: 'ภาษีเงินได้หัก ณ ที่จ่าย ส่วนการเงิน', color: '#bd7878', isDefault: true }
];

const PRESETS_COLORS = [
    '#737c68', // Sage Green
    '#b58970', // Warm Clay
    '#a39580', // Soft Taupe
    '#788896', // Slate Blue
    '#bd7878', // Dusty Rose
    '#c5a059', // Warm Amber
    '#d4b28c', // Muted Ochre
    '#5c6353', // Earthy Olive
    '#c4bdae', // Sand
    '#a26b5c'  // Terracotta
];

const STATUS_DATA = {
    'รับงาน': { label: 'รับงาน', color: '#788896', bg: 'rgba(120, 136, 150, 0.15)', border: 'rgba(120, 136, 150, 0.3)' },
    'กำลังทำ': { label: 'กำลังทำ', color: '#b58970', bg: 'rgba(181, 137, 112, 0.15)', border: 'rgba(181, 137, 112, 0.3)' },
    'เสร็จแล้ว': { label: 'เสร็จแล้ว', color: '#737c68', bg: 'rgba(115, 124, 104, 0.15)', border: 'rgba(115, 124, 104, 0.3)' },
    'ยกเลิก': { label: 'ยกเลิก', color: '#bd7878', bg: 'rgba(189, 120, 120, 0.15)', border: 'rgba(189, 120, 120, 0.3)' }
};

// ====================================================
// 2. STATE MANAGER
// ====================================================
const AppState = {
    tasks: [],
    categories: [],
    currentView: 'dashboard', // dashboard | tasks | categories
    
    // Temporaries for Modals / Editing
    pendingFiles: [], // Attached files in creation modal
    selectedCategoryColor: PRESETS_COLORS[0],
    
    // Auto-update timer
    countdownInterval: null
};

// ====================================================
// 3. INITIALIZATION & DATA LOADING
// ====================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize Database Router (Firebase or IndexedDB)
        await window.TaskDB.init();
        
        // Update DB mode indicator in UI
        updateDbModeUI();
        
        // Load or initialize categories
        await loadCategories();
        
        // Load tasks
        await loadTasks();
        
        // Render UI
        setupNavigation();
        setupCategoryForm();
        setupTaskForm();
        setupSyncSettings(); // Initialize Cloud Sync settings page listeners
        renderView();
        
        // Start live countdown updater (updates every minute)
        AppState.countdownInterval = setInterval(() => {
            if (AppState.currentView === 'dashboard') {
                renderDashboardAlerts();
            } else if (AppState.currentView === 'tasks') {
                renderTasksList();
            }
        }, 60000);
        
        console.log("Application started successfully");
    } catch (err) {
        console.error("Critical start failure", err);
        alert("ไม่สามารถเปิดระบบฐานข้อมูลในเครื่องได้ กรุณารีเฟรชหรือสลับเบราว์เซอร์");
    }
});

// Load categories from database or set defaults
async function loadCategories() {
    let dbCategories = await window.TaskDB.getAllCategories();
    if (dbCategories.length === 0) {
        // Seed default categories
        for (const cat of DEFAULT_CATEGORIES) {
            await window.TaskDB.saveCategory(cat);
        }
        dbCategories = await window.TaskDB.getAllCategories();
    } else {
        // Migration: automatically align old default category colors with our cozy earth tone theme
        let modified = false;
        for (const dbCat of dbCategories) {
            const match = DEFAULT_CATEGORIES.find(c => c.id === dbCat.id);
            if (match && dbCat.color !== match.color) {
                dbCat.color = match.color;
                await window.TaskDB.saveCategory(dbCat);
                modified = true;
            }
        }
        if (modified) {
            dbCategories = await window.TaskDB.getAllCategories();
        }
    }
    AppState.categories = dbCategories;
    populateCategoryFilters();
}

// Load tasks from database
async function loadTasks() {
    AppState.tasks = await window.TaskDB.getAllTasks();
}

// Populate categories in all select dropdowns
function populateCategoryFilters() {
    const filterSelect = document.getElementById('filter-category-select');
    const formSelect = document.getElementById('task-category-select');
    
    // Clear old options (keep 'all' in filter)
    filterSelect.innerHTML = '<option value="all">ทุกหมวดหมู่</option>';
    formSelect.innerHTML = '';
    
    AppState.categories.forEach(cat => {
        // Add to filter dropdown
        const filterOpt = document.createElement('option');
        filterOpt.value = cat.id;
        filterOpt.textContent = cat.name;
        filterSelect.appendChild(filterOpt);
        
        // Add to form dropdown
        const formOpt = document.createElement('option');
        formOpt.value = cat.id;
        formOpt.textContent = cat.name;
        formSelect.appendChild(formOpt);
    });
}

// ====================================================
// 4. ROUTING & VIEW CONTROLLER
// ====================================================
function setupNavigation() {
    const navDashboard = document.getElementById('btn-nav-dashboard');
    const navTasks = document.getElementById('btn-nav-tasks');
    const navCategories = document.getElementById('btn-nav-categories');
    const navSync = document.getElementById('btn-nav-sync');
    
    const menuDashboardLi = document.getElementById('menu-dashboard-li');
    const menuTasksLi = document.getElementById('menu-tasks-li');
    const menuCategoriesLi = document.getElementById('menu-categories-li');
    const menuSyncLi = document.getElementById('menu-sync-li');
    
    const btnCreateTaskMain = document.getElementById('btn-create-task-main');
    
    navDashboard.addEventListener('click', () => switchView('dashboard'));
    navTasks.addEventListener('click', () => switchView('tasks'));
    navCategories.addEventListener('click', () => switchView('categories'));
    navSync.addEventListener('click', () => switchView('sync'));
    
    btnCreateTaskMain.addEventListener('click', () => {
        openTaskModal();
    });
    
    function switchView(viewName) {
        AppState.currentView = viewName;
        
        // Remove active class from all menu items
        menuDashboardLi.classList.remove('active');
        menuTasksLi.classList.remove('active');
        menuCategoriesLi.classList.remove('active');
        menuSyncLi.classList.remove('active');
        
        // Hide all views
        document.getElementById('view-dashboard').classList.add('hidden');
        document.getElementById('view-tasks').classList.add('hidden');
        document.getElementById('view-categories').classList.add('hidden');
        document.getElementById('view-sync').classList.add('hidden');
        
        // Show active view & menu item
        if (viewName === 'dashboard') {
            menuDashboardLi.classList.add('active');
            document.getElementById('view-dashboard').classList.remove('hidden');
            document.getElementById('page-title-text').textContent = 'ภาพรวมของงาน (Dashboard)';
            document.getElementById('page-subtitle-text').textContent = 'วิเคราะห์สถานะงานการเงิน ดำเนินการ และสถิติต่างๆ ในปัจจุบัน';
        } else if (viewName === 'tasks') {
            menuTasksLi.classList.add('active');
            document.getElementById('view-tasks').classList.remove('hidden');
            document.getElementById('page-title-text').textContent = 'รายการตรวจตามงานทั้งหมด';
            document.getElementById('page-subtitle-text').textContent = 'จัดการ ค้นหา กรองงานการเงิน และดาวน์โหลดเอกสารไฟล์แนบ';
        } else if (viewName === 'categories') {
            menuCategoriesLi.classList.add('active');
            document.getElementById('view-categories').classList.remove('hidden');
            document.getElementById('page-title-text').textContent = 'จัดการหมวดหมู่/ประเภทงาน';
            document.getElementById('page-subtitle-text').textContent = 'เพิ่ม หมวดหมู่เฉพาะ เพื่อความยืดหยุ่นในการจัดหมวดหมู่เอกสารและงานบัญชี';
        } else if (viewName === 'sync') {
            menuSyncLi.classList.add('active');
            document.getElementById('view-sync').classList.remove('hidden');
            document.getElementById('page-title-text').textContent = 'ระบบเชื่อมต่อคลาวด์และแบ่งปัน (Cloud Sync)';
            document.getElementById('page-subtitle-text').textContent = 'เชื่อมโยงฐานข้อมูลส่วนกลางผ่าน Google Firebase และย้ายข้อมูลของคุณขึ้น Cloud';
            renderSyncSettings();
        }
        
        renderView();
    }
}

function renderView() {
    lucide.createIcons();
    if (AppState.currentView === 'dashboard') {
        renderDashboard();
    } else if (AppState.currentView === 'tasks') {
        renderTasksList();
    } else if (AppState.currentView === 'categories') {
        renderCategoriesList();
    } else if (AppState.currentView === 'sync') {
        renderSyncSettings();
    }
}

// ====================================================
// 5. DATE & ALERT ENGINE
// ====================================================

/**
 * Calculates due status and outputs elegant visual descriptors
 * @param {string} dueDateISO 
 * @param {string} status 
 * @returns {object} status details
 */
function calculateDueDetails(dueDateISO, status) {
    if (status === 'เสร็จแล้ว' || status === 'ยกเลิก') {
        return {
            class: 'on-track',
            text: 'เสร็จสิ้นภารกิจ',
            icon: 'check',
            urgency: 0
        };
    }
    
    if (!dueDateISO) {
        return {
            class: 'on-track',
            text: 'ไม่ได้ระบุกำหนดส่ง',
            icon: 'calendar',
            urgency: 0
        };
    }

    const now = new Date();
    const due = new Date(dueDateISO);
    const diffMs = due - now;
    
    if (diffMs < 0) {
        // Overdue (เลยกำหนด)
        const absDiff = Math.abs(diffMs);
        const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        let timeStr = 'เลยกำหนดส่งแล้ว';
        if (days > 0) {
            timeStr = `เลยกำหนดส่งไปแล้ว ${days} วัน ${hours} ชม.`;
        } else if (hours > 0) {
            timeStr = `เลยกำหนดส่งไปแล้ว ${hours} ชม.`;
        } else {
            timeStr = `เลยกำหนดส่งไปแล้วไม่กี่นาที`;
        }
        
        return {
            class: 'overdue',
            text: timeStr,
            icon: 'alert-octagon',
            urgency: 3
        };
    }
    
    // Remaining time
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    let timeText = '';
    if (days > 0) {
        timeText = `เหลือเวลา ${days} วัน ${hours} ชม.`;
    } else if (hours > 0) {
        timeText = `เหลือเวลาอีก ${hours} ชม.`;
    } else {
        timeText = `เหลือเวลาน้อยกว่า 1 ชม. !`;
    }

    // Urgency ranking: 2 = urgent (<=24h), 1 = warning (<=3 days), 0 = normal (>3 days)
    if (diffMs <= 1000 * 60 * 60 * 24) {
        return {
            class: 'urgent',
            text: `⚠️ ด่วนที่สุด! ${timeText}`,
            icon: 'alert-triangle',
            urgency: 2
        };
    } else if (diffMs <= 1000 * 60 * 60 * 24 * 3) {
        return {
            class: 'urgent',
            text: timeText,
            icon: 'clock',
            urgency: 1
        };
    } else {
        return {
            class: 'on-track',
            text: timeText,
            icon: 'calendar',
            urgency: 0
        };
    }
}

// Utility to format date nicely
function formatDateString(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) + ' น.';
}

// ====================================================
// 6. DASHBOARD CONTROLLER (INTERACTIVE GRAPHS)
// ====================================================
function renderDashboard() {
    const totalCount = AppState.tasks.length;
    
    let completedCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    
    AppState.tasks.forEach(task => {
        if (task.status === 'เสร็จแล้ว') {
            completedCount++;
        } else if (task.status === 'กำลังทำ' || task.status === 'รับงาน') {
            pendingCount++;
            
            // Check if overdue
            if (task.dueDate && new Date(task.dueDate) < new Date()) {
                overdueCount++;
            }
        }
    });

    // Write numerical metrics
    document.getElementById('stat-total-tasks').textContent = totalCount;
    document.getElementById('stat-pending-tasks').textContent = pendingCount;
    document.getElementById('stat-completed-tasks').textContent = completedCount;
    document.getElementById('stat-overdue-tasks').textContent = overdueCount;
    
    // Render dynamic visualizations
    renderStatusDonutChart();
    renderWorkloadBreakdown();
    renderDashboardAlerts();
}

// Render dynamic interactive SVG Donut chart
function renderStatusDonutChart() {
    const svg = document.getElementById('status-donut-svg');
    const legend = document.getElementById('status-chart-legend');
    
    svg.innerHTML = '';
    legend.innerHTML = '';
    
    const statusCounts = {
        'รับงาน': 0,
        'กำลังทำ': 0,
        'เสร็จแล้ว': 0,
        'ยกเลิก': 0
    };
    
    AppState.tasks.forEach(t => {
        if (statusCounts[t.status] !== undefined) {
            statusCounts[t.status]++;
        }
    });

    const total = AppState.tasks.length;
    document.getElementById('donut-total-count').textContent = total;

    if (total === 0) {
        // Draw empty indicator state
        svg.innerHTML = `
            <circle class="donut-segment" cx="100" cy="100" r="70" 
                    stroke="var(--glass-border)" stroke-dasharray="439.82" stroke-dashoffset="0" />
        `;
        legend.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">ไม่มีงานที่จะแสดงกราฟ</div>`;
        return;
    }

    // Geometry parameters for SVG circles with radius 70
    const radius = 70;
    const circ = 2 * Math.PI * radius; // 439.82
    let accumulatedOffset = 0;
    
    Object.keys(STATUS_DATA).forEach((statusKey) => {
        const count = statusCounts[statusKey];
        const config = STATUS_DATA[statusKey];
        
        if (count === 0) return;
        
        const percentage = (count / total) * 100;
        const segmentLength = (count / total) * circ;
        const offset = circ - segmentLength + accumulatedOffset;
        
        // Render glowing visual segment path
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'donut-segment');
        circle.setAttribute('cx', '100');
        circle.setAttribute('cy', '100');
        circle.setAttribute('r', radius.toString());
        circle.setAttribute('stroke', config.color);
        circle.setAttribute('stroke-dasharray', `${segmentLength} ${circ - segmentLength}`);
        circle.setAttribute('stroke-dashoffset', accumulatedOffset.toString());
        circle.setAttribute('style', `--glow-color: ${config.color}`);
        
        // Hover effects in donut center
        circle.addEventListener('mouseover', () => {
            document.getElementById('donut-total-count').textContent = count;
            document.getElementById('donut-total-count').style.color = config.color;
            const labelEl = document.querySelector('.donut-center-lbl');
            labelEl.textContent = `${statusKey} (${percentage.toFixed(0)}%)`;
        });
        
        circle.addEventListener('mouseout', () => {
            document.getElementById('donut-total-count').textContent = total;
            document.getElementById('donut-total-count').style.color = 'var(--text-primary)';
            const labelEl = document.querySelector('.donut-center-lbl');
            labelEl.textContent = 'งานทั้งหมด';
        });
        
        svg.appendChild(circle);
        accumulatedOffset -= segmentLength;
        
        // Add legend elements dynamically
        const legItem = document.createElement('div');
        legItem.className = 'legend-item';
        legItem.setAttribute('style', `--color: ${config.color}`);
        legItem.innerHTML = `
            <div class="legend-left">
                <div class="legend-color"></div>
                <span>${config.label}</span>
            </div>
            <div class="legend-right">
                <span class="legend-val">${count}</span>
                <span class="legend-pct">(${percentage.toFixed(0)}%)</span>
            </div>
        `;
        
        // Connect legend items with filtering directly
        legItem.addEventListener('click', () => {
            document.getElementById('filter-status-select').value = statusKey;
            document.getElementById('btn-nav-tasks').click();
        });
        
        legend.appendChild(legItem);
    });
}

// Workload representation
function renderWorkloadBreakdown() {
    const list = document.getElementById('workload-breakdown-list');
    list.innerHTML = '';
    
    if (AppState.tasks.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.9rem;">ไม่มีงานจัดกลุ่มตามหมวดหมู่</div>`;
        return;
    }
    
    // Group tasks by category
    const catWorkload = {};
    AppState.categories.forEach(cat => {
        catWorkload[cat.id] = {
            name: cat.name,
            color: cat.color,
            total: 0,
            completed: 0
        };
    });
    
    AppState.tasks.forEach(t => {
        // Safeguard if category was deleted or unmapped
        if (!catWorkload[t.categoryId]) {
            catWorkload[t.categoryId] = {
                name: 'หมวดหมู่ทั่วไป / อื่นๆ',
                color: '#6b7280',
                total: 0,
                completed: 0
            };
        }
        catWorkload[t.categoryId].total++;
        if (t.status === 'เสร็จแล้ว') {
            catWorkload[t.categoryId].completed++;
        }
    });

    // Render progress rows
    Object.keys(catWorkload).forEach(catId => {
        const item = catWorkload[catId];
        if (item.total === 0) return; // Skip empty workloads for clean visual interface

        const percent = (item.completed / item.total) * 100;
        
        const workItem = document.createElement('div');
        workItem.className = 'workload-item';
        workItem.innerHTML = `
            <div class="workload-info">
                <span class="workload-name">${item.name}</span>
                <span class="workload-count">
                    <span>${item.completed}</span> / ${item.total} งาน
                </span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: ${percent}%; background: ${item.color}; --primary-glow: rgba(${hexToRgb(item.color)}, 0.45);"></div>
            </div>
        `;
        
        workItem.style.cursor = 'pointer';
        workItem.addEventListener('click', () => {
            document.getElementById('filter-category-select').value = catId;
            document.getElementById('btn-nav-tasks').click();
        });
        
        list.appendChild(workItem);
    });
}

// Convert Hex colors safely to RGB strings for shadows
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
        : '99, 102, 241';
}

// System Alerts for urgent and overdue tasks
function renderDashboardAlerts() {
    const list = document.getElementById('alert-notifications-list');
    list.innerHTML = '';
    
    // Filter active warning tasks (excluding complete and cancelled)
    const alertTasks = AppState.tasks.filter(t => t.status !== 'เสร็จแล้ว' && t.status !== 'ยกเลิก' && t.dueDate)
        .map(t => {
            const details = calculateDueDetails(t.dueDate, t.status);
            return { task: t, details };
        })
        .filter(item => item.details.urgency > 0) // Urgency 1 (Warning <= 3 days), 2 (Urgent <= 24h), 3 (Overdue)
        .sort((a, b) => b.details.urgency - a.details.urgency); // Most urgent first

    if (alertTasks.length === 0) {
        list.innerHTML = `
            <div class="empty-alerts">
                <i data-lucide="check-circle" style="color: var(--status-done); margin-bottom: 0.25rem;"></i>
                <div style="font-weight: 600;">ยอดเยี่ยม! ไม่มีงานใกล้กำหนดส่ง หรือเกินกำหนดส่งเลย</div>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Render alert cards
    alertTasks.forEach(item => {
        const card = document.createElement('div');
        const isOverdue = item.details.urgency === 3;
        card.className = `alert-card ${isOverdue ? 'overdue' : 'warning-near'}`;
        
        card.innerHTML = `
            <div class="alert-icon">${isOverdue ? '🔴' : '🟠'}</div>
            <div class="alert-content">
                <div class="alert-task-title">${item.task.title}</div>
                <div class="alert-task-due">${item.details.text}</div>
                <span class="alert-task-status" style="background: ${STATUS_DATA[item.task.status].bg}; color: ${STATUS_DATA[item.task.status].color}; border: 1px solid ${STATUS_DATA[item.task.status].border};">
                    ${item.task.status}
                </span>
            </div>
        `;
        
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            openTaskDetailsModal(item.task.id);
        });
        
        list.appendChild(card);
    });
}

// ====================================================
// 7. TASK MANAGEMENT VIEWS & FORM SUBMISSION
// ====================================================
function renderTasksList() {
    const container = document.getElementById('tasks-cards-container');
    container.innerHTML = '';
    
    // Retrieve values from filters
    const searchVal = document.getElementById('filter-search-input').value.toLowerCase().trim();
    const statusVal = document.getElementById('filter-status-select').value;
    const categoryVal = document.getElementById('filter-category-select').value;
    const sortVal = document.getElementById('filter-sort-select').value;
    
    // Filter tasks array
    let filtered = AppState.tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchVal) || 
                              (task.description && task.description.toLowerCase().includes(searchVal));
        const matchesStatus = statusVal === 'all' || task.status === statusVal;
        const matchesCategory = categoryVal === 'all' || task.categoryId === categoryVal;
        
        return matchesSearch && matchesStatus && matchesCategory;
    });

    // Sort tasks array
    filtered.sort((a, b) => {
        if (sortVal === 'due-asc') {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        } else if (sortVal === 'due-desc') {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(b.dueDate) - new Date(a.dueDate);
        } else if (sortVal === 'title-asc') {
            return a.title.localeCompare(b.title, 'th');
        } else if (sortVal === 'created-desc') {
            return new Date(b.createdAt) - new Date(a.createdAt);
        }
        return 0;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="inbox"></i></div>
                <h3>ไม่พบรายการตรวจสอบงาน</h3>
                <p>ไม่มีงานที่ตรงตามตัวกรองที่เลือกไว้ในปัจจุบัน ลองเพิ่มงานใหม่หรือค้นหาคำค้นอื่น</p>
                <button class="btn-primary" onclick="openTaskModal()" style="margin: 0 auto;">
                    <i data-lucide="plus"></i>
                    <span>เริ่มลงบันทึกงานใหม่</span>
                </button>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Render task cards
    filtered.forEach(task => {
        const card = document.createElement('div');
        card.className = 'glass-card task-card';
        
        // Find category color & name
        const cat = AppState.categories.find(c => c.id === task.categoryId) || { name: 'อื่นๆ', color: '#6b7280' };
        
        // Calculate due warning
        const dueDetails = calculateDueDetails(task.dueDate, task.status);
        const hasAttachments = task.hasAttachments;
        
        card.innerHTML = `
            <div class="task-card-header">
                <span class="category-tag" style="--cat-bg: rgba(${hexToRgb(cat.color)}, 0.12); --cat-color: ${cat.color}; --cat-border: rgba(${hexToRgb(cat.color)}, 0.25);">
                    ${cat.name}
                </span>
                <div class="task-card-actions">
                    <button class="icon-btn edit-task-btn" title="แก้ไขข้อมูลงาน"><i data-lucide="edit-2"></i></button>
                    <button class="icon-btn delete-btn delete-task-btn" title="ลบงานนี้"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
            
            <h3 class="task-title">${task.title}</h3>
            <p class="task-desc">${task.description || '<span style="color: var(--text-muted); font-style: italic;">ไม่มีคำอธิบายเพิ่มเติม</span>'}</p>
            
            <div class="task-meta">
                <div class="due-indicator ${dueDetails.class}">
                    <i data-lucide="${dueDetails.icon}"></i>
                    <span>${dueDetails.text}</span>
                </div>
                
                <span class="status-badge ${getStatusClass(task.status)}">
                    ${task.status}
                </span>
            </div>
            
            ${hasAttachments ? `
                <div class="card-attachment-count" style="margin-top: -0.4rem; font-size: 0.75rem;">
                    <i data-lucide="paperclip" style="width: 12px; height: 12px;"></i>
                    <span>มีไฟล์เอกสารแนบเรียบร้อย</span>
                </div>
            ` : ''}
        `;

        // Event listener for opening details
        card.querySelector('.task-title').addEventListener('click', () => {
            openTaskDetailsModal(task.id);
        });
        
        // Quick edits and deletes
        card.querySelector('.edit-task-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openTaskModal(task.id);
        });
        
        card.querySelector('.delete-task-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteTask(task.id, task.title);
        });
        
        card.querySelector('.status-badge').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTaskStatus(task.id);
        });

        container.appendChild(card);
    });

    lucide.createIcons();
}

function getStatusClass(status) {
    if (status === 'รับงาน') return 'recv';
    if (status === 'กำลังทำ') return 'prog';
    if (status === 'เสร็จแล้ว') return 'done';
    if (status === 'ยกเลิก') return 'canc';
    return '';
}

// Toggle status quickly on badge click
async function toggleTaskStatus(taskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const statusCycle = ['รับงาน', 'กำลังทำ', 'เสร็จแล้ว', 'ยกเลิก'];
    const currentIndex = statusCycle.indexOf(task.status);
    const nextIndex = (currentIndex + 1) % statusCycle.length;
    
    task.status = statusCycle[nextIndex];
    task.updatedAt = new Date().toISOString();
    
    await window.TaskDB.saveTask(task);
    await loadTasks();
    renderTasksList();
}

// Setup Event listeners for search filter inputs
function setupTaskForm() {
    const searchInput = document.getElementById('filter-search-input');
    const statusSelect = document.getElementById('filter-status-select');
    const categorySelect = document.getElementById('filter-category-select');
    const sortSelect = document.getElementById('filter-sort-select');

    searchInput.addEventListener('input', renderTasksList);
    statusSelect.addEventListener('change', renderTasksList);
    categorySelect.addEventListener('change', renderTasksList);
    sortSelect.addEventListener('change', renderTasksList);
    
    // Add/Edit Modal controls
    const btnCloseTaskModal = document.getElementById('btn-close-task-modal');
    const btnCancelTaskModal = document.getElementById('btn-cancel-task-modal');
    const form = document.getElementById('task-form');
    
    btnCloseTaskModal.addEventListener('click', closeTaskModal);
    btnCancelTaskModal.addEventListener('click', closeTaskModal);
    
    // File inputs & Drag and drop
    const dropZone = document.getElementById('task-drag-drop-zone');
    const fileInput = document.getElementById('task-file-input');
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        handleSelectedFiles(e.target.files);
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleSelectedFiles(e.dataTransfer.files);
        }
    });

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveTaskSubmit();
    });
}

// Handles files temporarily held in AppState.pendingFiles
function handleSelectedFiles(filesList) {
    for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        
        // Prevent duplicate file names inside pending zone
        if (AppState.pendingFiles.some(f => f.name === file.name)) {
            continue;
        }
        
        AppState.pendingFiles.push({
            id: 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            type: file.type,
            fileObject: file // Actual File object to save later
        });
    }
    
    renderModalAttachments();
}

function renderModalAttachments() {
    const list = document.getElementById('modal-attachments-list');
    list.innerHTML = '';
    
    if (AppState.pendingFiles.length === 0) return;
    
    AppState.pendingFiles.forEach(file => {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        
        // Format size
        const sizeFormatted = formatFileSize(file.size);
        
        item.innerHTML = `
            <div class="file-info">
                <i data-lucide="file-text" class="file-icon"></i>
                <span class="file-name" title="${file.name}">${file.name}</span>
                <span class="file-size">(${sizeFormatted})</span>
            </div>
            <div class="attachment-actions">
                <button type="button" class="icon-btn delete-btn" onclick="removePendingFile('${file.id}')" title="ลบไฟล์">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;
        list.appendChild(item);
    });
    
    lucide.createIcons();
}

// Remove pending file from memory state
window.removePendingFile = function(tempId) {
    AppState.pendingFiles = AppState.pendingFiles.filter(f => f.id !== tempId);
    renderModalAttachments();
};

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Opens the Task editor modal (handles both Add and Edit)
async function openTaskModal(taskId = null) {
    const overlay = document.getElementById('task-modal-overlay');
    const modalTitle = document.getElementById('task-modal-title');
    const form = document.getElementById('task-form');
    
    form.reset();
    AppState.pendingFiles = [];
    document.getElementById('modal-attachments-list').innerHTML = '';
    
    // Set default due datetime value to tomorrow same time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
    document.getElementById('task-due-input').value = tomorrow.toISOString().slice(0, 16);
    
    // Reload categories options
    populateCategoryFilters();
    
    if (taskId) {
        // Edit mode
        const task = AppState.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        modalTitle.textContent = 'แก้ไขข้อมูลภารกิจ';
        document.getElementById('task-edit-id').value = task.id;
        document.getElementById('task-title-input').value = task.title;
        document.getElementById('task-category-select').value = task.categoryId;
        document.getElementById('task-status-select').value = task.status;
        document.getElementById('task-due-input').value = task.dueDate.slice(0, 16);
        document.getElementById('task-desc-input').value = task.description || '';
        
        // Fetch saved attachments to show in pending for reference
        const attachments = await window.TaskDB.getAttachmentsForTask(taskId);
        attachments.forEach(att => {
            AppState.pendingFiles.push({
                id: att.id,
                name: att.fileName,
                size: att.fileSize,
                type: att.fileType,
                isSaved: true
            });
        });
        
        renderModalAttachments();
    } else {
        // Create mode
        modalTitle.textContent = 'ลงบันทึกงานใหม่';
        document.getElementById('task-edit-id').value = '';
    }
    
    overlay.classList.add('open');
    lucide.createIcons();
}

function closeTaskModal() {
    document.getElementById('task-modal-overlay').classList.remove('open');
    AppState.pendingFiles = [];
}

// Handles submitting the form to IndexedDB
async function saveTaskSubmit() {
    const id = document.getElementById('task-edit-id').value || 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const title = document.getElementById('task-title-input').value.trim();
    const categoryId = document.getElementById('task-category-select').value;
    const status = document.getElementById('task-status-select').value;
    const dueDate = new Date(document.getElementById('task-due-input').value).toISOString();
    const description = document.getElementById('task-desc-input').value.trim();
    const isEdit = !!document.getElementById('task-edit-id').value;
    
    const originalTask = isEdit ? AppState.tasks.find(t => t.id === id) : null;
    const createdAt = originalTask ? originalTask.createdAt : new Date().toISOString();
    const updatedAt = new Date().toISOString();
    
    // Check if there are attachments
    const hasAttachments = AppState.pendingFiles.length > 0;
    
    const taskData = {
        id,
        title,
        categoryId,
        status,
        dueDate,
        description,
        createdAt,
        updatedAt,
        hasAttachments
    };
    
    // 1. Save Task to IndexedDB
    await window.TaskDB.saveTask(taskData);
    
    // 2. Manage attachments
    // Find attachments to delete (if in edit mode and user removed some from UI)
    if (isEdit) {
        const savedAttachments = await window.TaskDB.getAttachmentsForTask(id);
        for (const savedAtt of savedAttachments) {
            // If saved attachment is no longer in pendingFiles list, delete it
            if (!AppState.pendingFiles.some(f => f.id === savedAtt.id)) {
                await window.TaskDB.deleteAttachment(savedAtt.id);
            }
        }
    }
    
    // Upload newly added files
    for (const pendingFile of AppState.pendingFiles) {
        if (pendingFile.isSaved) continue; // Skip already saved ones in database
        
        const attachmentData = {
            id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            taskId: id,
            fileName: pendingFile.name,
            fileSize: pendingFile.size,
            fileType: pendingFile.type,
            blob: pendingFile.fileObject // Store directly as a raw Blob/File
        };
        await window.TaskDB.saveAttachment(attachmentData);
    }
    
    // Update local state and close
    await loadTasks();
    closeTaskModal();
    
    if (AppState.currentView === 'dashboard') {
        renderDashboard();
    } else {
        renderTasksList();
    }
}

// Remove task completely
async function confirmDeleteTask(taskId, title) {
    if (confirm(`คุณต้องการลบงาน "${title}" และเอกสารแนบทั้งหมดใช่หรือไม่?\n(การกระทำนี้ไม่สามารถย้อนคืนได้)`)) {
        await window.TaskDB.deleteTask(taskId);
        await loadTasks();
        
        if (AppState.currentView === 'dashboard') {
            renderDashboard();
        } else {
            renderTasksList();
        }
    }
}

// ====================================================
// 8. TASK DETAILS CONTROLLER & WORKFLOWS
// ====================================================
async function openTaskDetailsModal(taskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const cat = AppState.categories.find(c => c.id === task.categoryId) || { name: 'ทั่วไป', color: '#6b7280' };
    const dueDetails = calculateDueDetails(task.dueDate, task.status);
    
    // Set static fields
    document.getElementById('detail-task-title').textContent = task.title;
    
    const categoryTag = document.getElementById('detail-category-tag');
    categoryTag.textContent = cat.name;
    categoryTag.setAttribute('style', `--cat-bg: rgba(${hexToRgb(cat.color)}, 0.12); --cat-color: ${cat.color}; --cat-border: rgba(${hexToRgb(cat.color)}, 0.25);`);
    
    const statusBadge = document.getElementById('detail-status-badge');
    statusBadge.textContent = task.status;
    statusBadge.className = `status-badge ${getStatusClass(task.status)}`;
    
    document.getElementById('detail-due-value').textContent = formatDateString(task.dueDate);
    
    const countdownVal = document.getElementById('detail-countdown-value');
    countdownVal.textContent = dueDetails.text;
    countdownVal.className = `detail-meta-val ${dueDetails.class}`;
    
    document.getElementById('detail-created-value').textContent = formatDateString(task.createdAt);
    document.getElementById('detail-updated-value').textContent = formatDateString(task.updatedAt);
    document.getElementById('detail-desc-value').innerHTML = task.description ? task.description.replace(/\n/g, '<br>') : '<span style="color: var(--text-muted); font-style: italic;">ไม่มีคำอธิบายเพิ่มเติม</span>';
    
    // Load Attachments list with download capabilities
    const attachments = await window.TaskDB.getAttachmentsForTask(taskId);
    document.getElementById('detail-attachment-count-text').textContent = attachments.length + ' ไฟล์';
    
    const attachmentsContainer = document.getElementById('detail-attachments-container');
    attachmentsContainer.innerHTML = '';
    
    if (attachments.length === 0) {
        attachmentsContainer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; font-style: italic; padding: 0.5rem 0;">ไม่มีเอกสารแนบในงานชิ้นนี้</div>`;
    } else {
        attachments.forEach(att => {
            const item = document.createElement('div');
            item.className = 'attachment-item';
            
            const sizeFormatted = formatFileSize(att.fileSize);
            
            item.innerHTML = `
                <div class="file-info">
                    <i data-lucide="file-check" class="file-icon" style="color: var(--status-done);"></i>
                    <span class="file-name" title="${att.fileName}">${att.fileName}</span>
                    <span class="file-size">(${sizeFormatted})</span>
                </div>
                <div class="attachment-actions">
                    <button class="icon-btn download-btn" title="ดาวน์โหลดเอกสาร"><i data-lucide="download"></i></button>
                </div>
            `;
            
            // Register download function
            item.querySelector('.download-btn').addEventListener('click', async () => {
                await downloadAttachmentFile(att.id);
            });
            
            attachmentsContainer.appendChild(item);
        });
    }
    
    // Wire modal buttons
    const overlay = document.getElementById('detail-modal-overlay');
    
    document.getElementById('btn-close-detail-modal').onclick = () => overlay.classList.remove('open');
    document.getElementById('btn-close-detail-footer').onclick = () => overlay.classList.remove('open');
    
    document.getElementById('btn-detail-edit').onclick = () => {
        overlay.classList.remove('open');
        openTaskModal(task.id);
    };
    
    document.getElementById('btn-detail-delete').onclick = () => {
        overlay.classList.remove('open');
        confirmDeleteTask(task.id, task.title);
    };
    
    overlay.classList.add('open');
    lucide.createIcons();
}

// Download binary attachment from IndexedDB / Cloud Storage
async function downloadAttachmentFile(attachmentId) {
    const att = await window.TaskDB.getAttachment(attachmentId);
    if (!att) {
        alert("ไม่พบไฟล์เอกสารแนบ หรือไฟล์เกิดข้อผิดพลาด");
        return;
    }
    
    // In Firebase mode, if fetching the blob directly failed (CORS block),
    // getAttachment will return isDirectUrl: true. We can open the link in a new tab!
    if (att.isDirectUrl && att.downloadURL) {
        // Open downloadURL in a new tab as fallback
        const win = window.open(att.downloadURL, '_blank');
        if (win) {
            win.focus();
        } else {
            // Fallback to window navigation
            window.location.href = att.downloadURL;
        }
        return;
    }

    if (!att.blob) {
        alert("ไม่สามารถเข้าถึงไฟล์เอกสารแนบชิ้นนี้ได้");
        return;
    }
    
    // Create an object URL from the Blob and trigger browser download
    const url = URL.createObjectURL(att.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = att.fileName;
    document.body.appendChild(link);
    link.click();
    
    // Cleanup URL immediately after download click
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

// ====================================================
// 9. CATEGORY MANAGEMENT SYSTEM
// ====================================================
function setupCategoryForm() {
    const picker = document.getElementById('category-color-picker');
    picker.innerHTML = '';
    
    // Injects color presets circles
    PRESETS_COLORS.forEach((color, idx) => {
        const option = document.createElement('div');
        option.className = `color-option ${idx === 0 ? 'selected' : ''}`;
        option.style.backgroundColor = color;
        option.setAttribute('style', `background-color: ${color}; --color-glow: ${color};`);
        
        option.addEventListener('click', () => {
            // Remove selection of others
            document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
            option.classList.add('selected');
            AppState.selectedCategoryColor = color;
        });
        
        picker.appendChild(option);
    });
    
    AppState.selectedCategoryColor = PRESETS_COLORS[0];
    
    // Save button event handler
    document.getElementById('btn-save-category').addEventListener('click', saveCategorySubmit);
    
    // Cancel editing
    document.getElementById('btn-cancel-category-edit').addEventListener('click', cancelCategoryEditing);
}

function renderCategoriesList() {
    const container = document.getElementById('categories-rows-container');
    container.innerHTML = '';
    
    if (AppState.categories.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.95rem; padding: 2rem;">ไม่มีหมวดหมู่งานที่แสดงข้อมูล</div>`;
        return;
    }

    // Render list rows of categories
    AppState.categories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'category-row';
        
        // Count tasks belonging to this category
        const count = AppState.tasks.filter(t => t.categoryId === cat.id).length;
        
        row.innerHTML = `
            <div class="cat-row-info">
                <div class="cat-color-dot" style="background-color: ${cat.color}; box-shadow: 0 0 8px ${cat.color};"></div>
                <div>
                    <div class="cat-row-name">${cat.name}</div>
                    <div class="cat-row-meta">
                        ${cat.isDefault ? 'หมวดหมู่การเงินเริ่มต้น' : 'หมวดหมู่สร้างเอง'} | <span>${count} งาน</span>
                    </div>
                </div>
            </div>
            <div class="attachment-actions">
                <button class="icon-btn edit-cat-btn" title="แก้ไขชื่อ/สีหมวดหมู่"><i data-lucide="edit-2"></i></button>
                ${!cat.isDefault ? `
                    <button class="icon-btn delete-btn delete-cat-btn" title="ลบหมวดหมู่"><i data-lucide="trash-2"></i></button>
                ` : ''}
            </div>
        `;
        
        // Edit category click handler
        row.querySelector('.edit-cat-btn').addEventListener('click', () => {
            startCategoryEdit(cat);
        });
        
        // Delete category click handler (only custom ones allowed to delete)
        const delBtn = row.querySelector('.delete-cat-btn');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                confirmDeleteCategory(cat.id, cat.name, count);
            });
        }
        
        container.appendChild(row);
    });
    
    lucide.createIcons();
}

function startCategoryEdit(cat) {
    document.getElementById('cat-form-title').textContent = 'แก้ไขข้อมูลหมวดหมู่';
    document.getElementById('category-edit-id').value = cat.id;
    document.getElementById('category-name-input').value = cat.name;
    
    // Highlight correct color picker
    document.querySelectorAll('.color-option').forEach(el => {
        el.classList.remove('selected');
        // Check if rgb matches hex or close representation
        const bgCol = el.style.backgroundColor;
        if (bgCol && (rgbToHex(bgCol) === cat.color || bgCol === cat.color)) {
            el.classList.add('selected');
        }
    });
    
    AppState.selectedCategoryColor = cat.color;
    document.getElementById('btn-cancel-category-edit').classList.remove('hidden');
}

// Convert style color RGB string back to Hex
function rgbToHex(rgb) {
    const result = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!result) return rgb;
    return "#" +
        ("0" + parseInt(result[1],10).toString(16)).slice(-2) +
        ("0" + parseInt(result[2],10).toString(16)).slice(-2) +
        ("0" + parseInt(result[3],10).toString(16)).slice(-2);
}

function cancelCategoryEditing() {
    document.getElementById('cat-form-title').textContent = 'สร้างหมวดหมู่ใหม่';
    document.getElementById('category-edit-id').value = '';
    document.getElementById('category-name-input').value = '';
    document.getElementById('btn-cancel-category-edit').classList.add('hidden');
    
    // Select first preset color
    document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
    const firstOption = document.querySelector('.color-option');
    if (firstOption) firstOption.classList.add('selected');
    AppState.selectedCategoryColor = PRESETS_COLORS[0];
}

async function saveCategorySubmit() {
    const name = document.getElementById('category-name-input').value.trim();
    if (!name) {
        alert("กรุณาระบุชื่อหมวดหมู่งาน");
        return;
    }
    
    const editId = document.getElementById('category-edit-id').value;
    const id = editId || 'cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    const isEdit = !!editId;
    const catData = {
        id,
        name,
        color: AppState.selectedCategoryColor,
        isDefault: isEdit ? (AppState.categories.find(c => c.id === id)?.isDefault || false) : false
    };
    
    await window.TaskDB.saveCategory(catData);
    await loadCategories();
    cancelCategoryEditing();
    renderCategoriesList();
}

async function confirmDeleteCategory(catId, name, taskCount) {
    if (taskCount > 0) {
        alert(`ไม่สามารถลบหมวดหมู่ "${name}" ได้ เนื่องจากยังมีงานในระบบที่ใช้งานหมวดหมู่นี้อยู่จำนวน ${taskCount} งาน\nกรุณาย้ายงานเหล่านั้นไปหมวดหมู่อื่นก่อนทำการลบ`);
        return;
    }
    
    if (confirm(`คุณต้องการลบหมวดหมู่ "${name}" ใช่หรือไม่?`)) {
        await window.TaskDB.deleteCategory(catId);
        await loadCategories();
        renderCategoriesList();
    }
}

// ====================================================
// 10. FIREBASE CLOUD SYNC CONTROLLER
// ====================================================

// Update dynamic database mode indicators in the sidebar and other regions
function updateDbModeUI() {
    const dbModeEl = document.getElementById('sidebar-db-mode');
    const dbDescEl = document.getElementById('sidebar-db-desc');
    
    if (!dbModeEl) return;
    
    if (window.TaskDB.mode === 'firebase') {
        dbModeEl.textContent = 'Cloud Sync';
        dbModeEl.style.background = 'rgba(115, 124, 104, 0.15)';
        dbModeEl.style.color = 'var(--status-done)';
        dbDescEl.textContent = `คลาวด์เรียลไทม์ (Namespace: ${window.TaskDB.prefix})`;
    } else {
        dbModeEl.textContent = 'Local DB';
        dbModeEl.style.background = 'rgba(181, 137, 112, 0.15)';
        dbModeEl.style.color = 'var(--accent-earth)';
        dbDescEl.textContent = 'Local Storage & IndexedDB';
    }
}

// Render Firebase Settings View state
function renderSyncSettings() {
    const apiKeyInput = document.getElementById('sync-apiKey');
    const authDomainInput = document.getElementById('sync-authDomain');
    const projectIdInput = document.getElementById('sync-projectId');
    const storageBucketInput = document.getElementById('sync-storageBucket');
    const messagingSenderIdInput = document.getElementById('sync-messagingSenderId');
    const appIdInput = document.getElementById('sync-appId');
    const prefixInput = document.getElementById('sync-prefix');
    const configJsonInput = document.getElementById('sync-config-json');
    
    const saveBtn = document.getElementById('btn-save-sync');
    const disconnectBtn = document.getElementById('btn-disconnect-sync');
    const statusCard = document.getElementById('sync-status-card');
    const statusTitle = document.getElementById('sync-status-title');
    const statusDesc = document.getElementById('sync-status-desc');

    // Populate current values from localStorage or active Firebase config
    const savedConfigStr = localStorage.getItem('finance_checklist_firebase_config');
    const isLocalOverride = localStorage.getItem('finance_checklist_local_override') === 'true';
    const savedPrefix = localStorage.getItem('finance_checklist_firebase_prefix') || 'finance_';
    
    prefixInput.value = savedPrefix;
    configJsonInput.value = '';

    let config = null;
    if (savedConfigStr) {
        try {
            config = JSON.parse(savedConfigStr);
        } catch (e) {
            console.error(e);
        }
    } else if (!isLocalOverride && window.TaskDB.mode === 'firebase' && window.TaskDB.firebaseApp) {
        config = window.TaskDB.firebaseApp.options;
    }

    if (config) {
        apiKeyInput.value = config.apiKey || '';
        authDomainInput.value = config.authDomain || '';
        projectIdInput.value = config.projectId || '';
        storageBucketInput.value = config.storageBucket || '';
        messagingSenderIdInput.value = config.messagingSenderId || '';
        appIdInput.value = config.appId || '';
        
        // Set dynamic button visibility
        disconnectBtn.classList.remove('hidden');
    } else {
        apiKeyInput.value = '';
        authDomainInput.value = '';
        projectIdInput.value = '';
        storageBucketInput.value = '';
        messagingSenderIdInput.value = '';
        appIdInput.value = '';
        disconnectBtn.classList.add('hidden');
    }

    // Render status card
    if (window.TaskDB.mode === 'firebase') {
        statusCard.className = 'sync-status-card status-online';
        statusTitle.textContent = 'สถานะ: 🟢 เชื่อมต่อ Cloud สำเร็จ';
        statusDesc.textContent = `แอปพลิเคชันกำลังเชื่อมโยงและแบ่งปันข้อมูลแบบเรียลไทม์กับทีมงานผ่านบัญชี Firebase คอนฟิกโครงการ "${window.TaskDB.firestore.app.options.projectId}" (ตารางนำหน้า: ${window.TaskDB.prefix})`;
        
        // Show migration option ONLY if there is data in IndexedDB
        checkAndShowMigration();
    } else {
        statusCard.className = 'sync-status-card status-offline';
        statusTitle.textContent = 'สถานะ: 🟡 โหมดใช้งานในเครื่อง (Offline Mode)';
        statusDesc.textContent = 'ข้อมูลทั้งหมดจะถูกเซฟไว้อย่างปลอดภัยในหน่วยความจำบราวเซอร์บนคอมพิวเตอร์เครื่องนี้เท่านั้น ไม่สามารถเปิดดูจากเครื่องอื่นได้';
        document.getElementById('sync-migration-box').classList.add('hidden');
    }
}

// Check if IndexedDB has any data, if yes, show migration card in Cloud Sync view
async function checkAndShowMigration() {
    const migrationBox = document.getElementById('sync-migration-box');
    try {
        const taskCount = await window.TaskDB._transaction('tasks', 'readonly', store => store.count());
        const catCount = await window.TaskDB._transaction('categories', 'readonly', store => store.count());
        const attCount = await window.TaskDB._transaction('attachments', 'readonly', store => store.count());
        
        // Show migration card if there are tasks, attachments, or custom categories
        if (taskCount > 0 || attCount > 0 || catCount > DEFAULT_CATEGORIES.length) {
            migrationBox.classList.remove('hidden');
        } else {
            migrationBox.classList.add('hidden');
        }
    } catch (e) {
        console.error("Error checking local data for migration", e);
        migrationBox.classList.add('hidden');
    }
}

// Setup Firebase settings forms and event listeners
function setupSyncSettings() {
    const configJsonInput = document.getElementById('sync-config-json');
    const saveBtn = document.getElementById('btn-save-sync');
    const disconnectBtn = document.getElementById('btn-disconnect-sync');
    const migrateBtn = document.getElementById('btn-migrate-data');
    const prefixInput = document.getElementById('sync-prefix');

    // Auto-parse Firebase Config JSON if pasted
    configJsonInput.addEventListener('input', (e) => {
        const value = e.target.value;
        if (!value.trim()) return;

        try {
            // Find JSON-like structure within paste
            let jsonString = value;
            const openBrace = value.indexOf('{');
            const closeBrace = value.lastIndexOf('}');
            
            if (openBrace !== -1 && closeBrace !== -1) {
                jsonString = value.substring(openBrace, closeBrace + 1);
            }

            // Clean up standard JS object notation to make it valid JSON
            let cleaned = jsonString
                .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":') // keys
                .replace(/'([^']*)'/g, '"$1"') // values in single quotes
                .replace(/,\s*([}\]])/g, '$1'); // trailing commas

            const config = JSON.parse(cleaned);
            
            if (config.apiKey && config.projectId) {
                document.getElementById('sync-apiKey').value = config.apiKey || '';
                document.getElementById('sync-authDomain').value = config.authDomain || '';
                document.getElementById('sync-projectId').value = config.projectId || '';
                document.getElementById('sync-storageBucket').value = config.storageBucket || '';
                document.getElementById('sync-messagingSenderId').value = config.messagingSenderId || '';
                document.getElementById('sync-appId').value = config.appId || '';
                
                // Show success feedback
                configJsonInput.style.borderColor = 'var(--status-done)';
                setTimeout(() => {
                    configJsonInput.style.borderColor = 'var(--glass-border)';
                }, 2000);
            }
        } catch (err) {
            console.warn("Failed to auto-parse config JSON", err);
        }
    });

    // Save Sync Connection
    saveBtn.addEventListener('click', async () => {
        const apiKey = document.getElementById('sync-apiKey').value.trim();
        const authDomain = document.getElementById('sync-authDomain').value.trim();
        const projectId = document.getElementById('sync-projectId').value.trim();
        const storageBucket = document.getElementById('sync-storageBucket').value.trim();
        const messagingSenderId = document.getElementById('sync-messagingSenderId').value.trim();
        const appId = document.getElementById('sync-appId').value.trim();
        const prefix = prefixInput.value.trim() || 'finance_';

        if (!apiKey || !projectId) {
            alert("กรุณากรอกข้อมูล apiKey และ projectId เป็นอย่างน้อย");
            return;
        }

        const config = {
            apiKey,
            authDomain,
            projectId,
            storageBucket,
            messagingSenderId,
            appId
        };

        // Show loading state
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>กำลังเชื่อมต่อ...</span>';

        try {
            // Save config to localStorage temporarily
            localStorage.setItem('finance_checklist_firebase_config', JSON.stringify(config));
            localStorage.setItem('finance_checklist_firebase_prefix', prefix);
            localStorage.removeItem('finance_checklist_local_override'); // Clear local override

            // Re-initialize database
            const initMode = await window.TaskDB.init();

            if (initMode === 'firebase') {
                alert("เชื่อมต่อ Google Firebase Cloud สำเร็จแล้ว! 🎉");
                // Reload state with new database
                await loadCategories();
                await loadTasks();
                updateDbModeUI();
                renderSyncSettings();
            } else {
                throw new Error("เชื่อมต่อไม่สำเร็จ");
            }
        } catch (e) {
            console.error("Firebase connection error:", e);
            alert("ไม่สามารถเชื่อมต่อ Firebase ได้ กรุณาตรวจสอบข้อมูลคีย์หรือสิทธิ์การเข้าถึงอีกครั้ง (ฐานข้อมูลถูกสลับกลับไปใช้งานในเครื่องตามเดิม)");
            // Clean up invalid keys
            localStorage.removeItem('finance_checklist_firebase_config');
            window.TaskDB.mode = 'local';
            await window.TaskDB.init();
            updateDbModeUI();
            renderSyncSettings();
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i data-lucide="save"></i><span>บันทึกและเชื่อมต่อ Cloud</span>';
            lucide.createIcons();
        }
    });

    // Disconnect Sync Connection
    disconnectBtn.addEventListener('click', async () => {
        if (!confirm("คุณต้องการตัดการเชื่อมต่อกับ Cloud และสลับกลับไปใช้งานเฉพาะข้อมูลในเครื่องคอมพิวเตอร์นี้ใช่หรือไม่?")) {
            return;
        }

        localStorage.removeItem('finance_checklist_firebase_config');
        localStorage.setItem('finance_checklist_local_override', 'true'); // Persist local override
        window.TaskDB.mode = 'local';
        await window.TaskDB.init();

        alert("ตัดการเชื่อมต่อคลาวด์แล้ว ระบบถูกสลับกลับไปใช้งานข้อมูลในเครื่อง IndexedDB ตามเดิม");
        
        await loadCategories();
        await loadTasks();
        updateDbModeUI();
        renderSyncSettings();
    });

    // Migrate Local Data to Cloud
    migrateBtn.addEventListener('click', async () => {
        if (!confirm("คำเตือน: คุณแน่ใจหรือไม่ว่าต้องการนำส่งข้อมูลงานทั้งหมดที่เก็บอยู่ในคอมพิวเตอร์เครื่องนี้ ขึ้นไปรวมไว้บนระบบ Firebase Cloud? การซิงค์นี้อาจใช้เวลาครู่หนึ่งในกรณีที่คุณมีรูปภาพหรือเอกสารแนบหลายไฟล์")) {
            return;
        }

        const progressContainer = document.getElementById('migration-progress-container');
        const progressBar = document.getElementById('migration-progress-bar');
        const progressText = document.getElementById('migration-progress-text');

        migrateBtn.disabled = true;
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = 'กำลังเริ่มซิงค์...';

        try {
            await window.TaskDB.migrateLocalToCloud((percent, message) => {
                progressBar.style.width = `${percent}%`;
                progressText.textContent = `${message} (${percent}%)`;
            });

            // Reload data after migration
            await loadCategories();
            await loadTasks();
            
            // Reload views
            renderSyncSettings();
            
            alert("ระบบนำส่งและย้ายข้อมูลขึ้น Cloud เรียบร้อยสมบูรณ์แล้ว! 🚀");
            
            // Auto hide progress bar after 3 seconds
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                migrateBtn.disabled = false;
            }, 3000);

        } catch (e) {
            console.error("Migration failed:", e);
            alert("เกิดข้อผิดพลาดระหว่างซิงค์ข้อมูล: " + e.message);
            migrateBtn.disabled = false;
            progressContainer.classList.add('hidden');
        }
    });
}
