/**
 * app.js - RASSCO Phase 2 SPA Controller
 * Features: Authentication, Scope Authorization, Filling Status Engine,
 * Supervisor Performance Monitoring, Activity Timelines, Next Incomplete Navigation.
 */

const state = {
  currentUser: null,
  // regions and projects are DERIVED dynamically from employee rows — never hardcoded
  employees: [],
  users: [],
  userAccess: [],
  activityLogs: [],
  currentView: 'dashboard',
  previousView: 'dashboard',
  selectedRegion: 'ALL',
  selectedProject: 'ALL',
  selectedStatus: 'ALL',
  selectedFillingStatus: 'ALL',
  searchQuery: '',
  currentPage: 1,
  pageSize: 15,
  activeEmployee: null,
  activeSupervisorModal: null
};

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  setupNavigation();
  setupSearchAndFilters();
  setupThemeToggle();
  loadData();
  
  const savedUser = localStorage.getItem('rassco_user_session');
  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      document.getElementById('loginScreen').style.display = 'none';
      renderCurrentView();
    } catch (e) {
      console.warn('Session parse error:', e);
    }
  }

  renderNotificationsDropdown();
  checkPortalHashRoute();

  window.addEventListener('hashchange', () => {
    checkPortalHashRoute();
  });

  window.addEventListener('resize', debounce(() => {
    renderCurrentView();
  }, 250));
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Mobile Responsive Navigation & Drawer Handlers
function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar && backdrop) {
    sidebar.classList.toggle('active');
    backdrop.classList.toggle('active');
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar && backdrop) {
    sidebar.classList.remove('active');
    backdrop.classList.remove('active');
  }
}

function toggleMobileSearch() {
  const searchBox = document.getElementById('headerSearchBox');
  if (searchBox) {
    searchBox.classList.toggle('mobile-active');
    const input = document.getElementById('globalSearchInput');
    if (input && searchBox.classList.contains('mobile-active')) {
      input.focus();
    }
  }
}

// Mobile Filter Drawer Engine
function openMobileFilterDrawer() {
  const overlay = document.getElementById('mobileFilterDrawerOverlay');
  if (overlay) {
    populateMobileFilterDropdowns();
    overlay.classList.add('active');
  }
}

function closeMobileFilterDrawer() {
  const overlay = document.getElementById('mobileFilterDrawerOverlay');
  if (overlay) overlay.classList.remove('active');
}

function populateMobileFilterDropdowns() {
  const scoped = getScopedEmployees();
  const locations = getAvailableLocations(scoped);
  let regionFiltered = scoped;
  if (state.selectedRegion !== 'ALL') {
    regionFiltered = scoped.filter(e => empLocKey(e) === normKey(state.selectedRegion));
  }
  const projects = getAvailableProjects(regionFiltered);

  const regSel = document.getElementById('mobileRegionFilter');
  if (regSel) {
    regSel.innerHTML = `<option value="ALL">جميع المناطق (${scoped.length})</option>`;
    locations.forEach(loc => {
      const selected = normKey(state.selectedRegion) === loc.id ? ' selected' : '';
      regSel.innerHTML += `<option value="${loc.id}"${selected}>${loc.label} (${loc.count})</option>`;
    });
  }

  const prjSel = document.getElementById('mobileProjectFilter');
  if (prjSel) {
    prjSel.innerHTML = `<option value="ALL">جميع المشاريع (${projects.length})</option>`;
    projects.forEach(p => {
      const selected = normKey(state.selectedProject) === normKey(p.name) ? ' selected' : '';
      prjSel.innerHTML += `<option value="${p.name}"${selected}>${p.name} (${p.count})</option>`;
    });
  }

  const fillSel = document.getElementById('mobileFillingFilter');
  if (fillSel) {
    fillSel.value = state.selectedFillingStatus || 'ALL';
  }
}

function handleMobileRegionChange() {
  const val = (document.getElementById('mobileRegionFilter') || {}).value || 'ALL';
  state.selectedRegion = val;
  state.selectedProject = 'ALL';
  state.currentPage = 1;
  populateRegionAndProjectDropdowns();
  populateMobileFilterDropdowns();
  renderCurrentView();
}

function handleMobileProjectChange() {
  const val = (document.getElementById('mobileProjectFilter') || {}).value || 'ALL';
  state.selectedProject = val;
  state.currentPage = 1;
  renderCurrentView();
}

function handleMobileFillingChange() {
  const val = (document.getElementById('mobileFillingFilter') || {}).value || 'ALL';
  state.selectedFillingStatus = val;
  state.currentPage = 1;
  renderCurrentView();
}

// Universal Mobile Cards Container Generator for Data Tables
function ensureMobileCardsContainer(tableId, containerId) {
  const tableEl = document.getElementById(tableId);
  if (!tableEl) return null;
  const tableResponsive = tableEl.closest('.table-responsive');
  if (!tableResponsive) return null;

  if (!tableResponsive.classList.contains('table-desktop-view')) {
    tableResponsive.classList.add('table-desktop-view');
  }

  let mobileCardsContainer = document.getElementById(containerId);
  if (!mobileCardsContainer) {
    mobileCardsContainer = document.createElement('div');
    mobileCardsContainer.id = containerId;
    mobileCardsContainer.className = 'mobile-cards-container cards-mobile-view';
    mobileCardsContainer.style.display = 'none';
    tableResponsive.parentNode.insertBefore(mobileCardsContainer, tableResponsive.nextSibling);
  }
  return mobileCardsContainer;
}

// Authentication Handlers
function handleLogin(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const role = document.getElementById('loginRole').value;

  let userId = 'USR-001';
  let name = 'المدير العام (RASSCO Admin)';
  let regId = 'ALL';
  let regName = 'جميع المناطق';
  let prjId = 'ALL';
  let prjName = 'جميع المشاريع';

  if (role === 'HR Admin') {
    userId = 'USR-002';
    name = 'مدير الموارد البشرية';
  } else if (role === 'Regional Supervisor') {
    userId = 'USR-003';
    name = 'مشرف منطقة القصيم (أحمد علي)';
    regId = 'REG-05';
    regName = 'منطقة القصيم (بريدة وعنيزة)';
  } else if (role === 'Project Manager') {
    userId = 'USR-004';
    name = 'مدير مشروع النمر (محمد صالح)';
    regId = 'REG-01';
    regName = 'المنطقة الوسطى (الرياض)';
    prjId = 'PRJ-001';
    prjName = 'Al Nemer';
  }

  state.currentUser = {
    User_ID: userId,
    Full_Name: name,
    Email: email,
    Role: role,
    Region_ID: regId,
    Region_Name: regName,
    Project_ID: prjId,
    Project_Name: prjName,
    Last_Login: new Date().toLocaleTimeString('en-US', { hour12: true })
  };

  localStorage.setItem('rassco_user_session', JSON.stringify(state.currentUser));
  document.getElementById('loginScreen').style.display = 'none';

  logActivity('Login', true, '', '', `تسجيل دخول ناجح بدور: ${role}`);
  showToast(`أهلاً بك: ${state.currentUser.Full_Name} (${state.currentUser.Role})`, 'success');

  if (state.currentUser.Region_ID !== 'ALL') {
    state.selectedRegion = state.currentUser.Region_ID;
  }

  populateRegionAndProjectDropdowns();
  renderCurrentView();
}

function handleLogout() {
  if (state.currentUser) {
    logActivity('Logout', true, '', '', 'تسجيل الخروج من النظام');
  }
  state.currentUser = null;
  localStorage.removeItem('rassco_user_session');
  document.getElementById('loginScreen').style.display = 'flex';
  showToast('تم تسجيل الخروج بنجاح', 'info');
}

// Navigation Handler
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      if (view) {
        switchView(view);
      }
    });
  });
}

function switchView(viewName) {
  state.previousView = state.currentView;
  state.currentView = viewName;
  
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (activeNav) activeNav.classList.add('active');

  const titles = {
    dashboard: 'لوحة التحكم المركزية - RASSCO',
    supervisors: 'متابعة إنجاز المشرفين ونسب التقدم اللحظية',
    employees: 'سجل الموظفين المسندين والمشاريع',
    documents: 'سجل جميع المستندات المرفوعة على Google Drive',
    expiring: 'الوثائق القريبة من الانتهاء (خلال 60 يوماً)',
    expired: 'سجل الوثائق المنتهية',
    missing: 'سجل المستندات الناقصة',
    projects: 'قائمة المشاريع المعتمدة',
    users: 'إدارة المستخدمين والصلاحيات والوصول',
    'data-management': 'إدارة واستيراد وتصدير بيانات الموظفين (Excel)',
    reports: 'التقارير والإحصائيات والتصدير',
    settings: 'إعدادات النظام والربط بـ Google Drive'
  };
  document.getElementById('pageTitle').textContent = titles[viewName] || 'نظام إدارة الوثائق - RASSCO';

  document.querySelectorAll('.view-page').forEach(p => p.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.add('active');

  renderCurrentView();
}

function setupSearchAndFilters() {
  const searchInput = document.getElementById('globalSearchInput');
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    state.currentPage = 1;
    renderCurrentView();
  });
}

function setupThemeToggle() {
  const btn = document.getElementById('themeToggle');
  btn.addEventListener('click', () => {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    btn.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
  });
}

// Data Loader — Central Server APIs (Google Sheets & Google Drive)
function loadData() {
  fetch('/api/employees?limit=50000')
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.data)) {
        state.employees = data.data.map(emp => ({
          Employee_ID: emp.id,
          Employee_Name: emp.name,
          National_ID: emp.iqamaNumber,
          Iqama_Number: emp.iqamaNumber,
          Job_Title: emp.jobTitle,
          Location: emp.region,
          Region_ID: emp.region,
          Project_Name: emp.project,
          Nationality: emp.nationality,
          Absher_Number: emp.absherNumber,
          Phone: emp.phone,
          Status: emp.status,
          Portal_Status: emp.portalStatus,
          UpdatedAt: emp.updatedAt,
          StoredDocs: {}
        }));
        populateRegionAndProjectDropdowns();
        renderCurrentView();
      }
    })
    .catch(err => {
      console.error('Error fetching employees from backend:', err);
      showToast('تعذر الاتصال بالخادم. يرجى إعادة المحاولة.', 'error');
    });

  // Fetch Notifications from Server
  fetch('/api/notifications')
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.notifications)) {
        state.notifications = data.notifications.map(n => ({
          id: n.id,
          title: n.title,
          body: n.message,
          empId: n.employeeId,
          type: n.type,
          timestamp: n.timestamp,
          read: String(n.read) === 'true'
        }));
        renderNotificationsDropdown();
      }
    }).catch(e => {});

  // Fetch Activity Logs from Server
  fetch('/api/activity')
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.logs)) {
        state.activityLogs = data.logs;
      }
    }).catch(e => {});
}

function generateLocalSeedEmployees() {
  loadData();
}

function getLocationLabel(locStr) {
  if (!locStr) return '-';
  const s = String(locStr).toUpperCase().trim();
  const locationNameMap = {
    'RUH': 'المنطقة الوسطى (الرياض)',
    'RIYADH': 'المنطقة الوسطى (الرياض)',
    'JED': 'المنطقة الغربية (جدة ومكة والمدينة)',
    'JEDDAH': 'المنطقة الغربية (جدة ومكة والمدينة)',
    'KHOBAR': 'المنطقة الشرقية (الخبر والدمام)',
    'KOB': 'المنطقة الشرقية (الخبر والدمام)',
    'DAM': 'المنطقة الشرقية (الدمام والخبر)',
    'DMM': 'المنطقة الشرقية (الدمام والخبر)',
    'DAMMAM': 'المنطقة الشرقية (الدمام والخبر)',
    'ABHA': 'المنطقة الجنوبية (أبها وعسير وجازان)',
    'ABH': 'المنطقة الجنوبية (أبها وعسير وجازان)',
    'QAS': 'منطقة القصيم (بريدة وعنيزة)',
    'QSM': 'منطقة القصيم (بريدة وعنيزة)',
    'HAIL': 'المنطقة الشمالية (حائل وتبوك والجوف)',
    'HIL': 'المنطقة الشمالية (حائل وتبوك والجوف)',
    'MAD': 'المنطقة الغربية (المدينة المنورة)',
    'MED': 'المنطقة الغربية (المدينة المنورة)',
    'TAIF': 'المنطقة الغربية (الطائف)',
    'TIF': 'المنطقة الغربية (الطائف)',
    'ALKHRAJ': 'المنطقة الوسطى (الخرج)',
    'KHARJ': 'المنطقة الوسطى (الخرج)',
    'KRJ': 'المنطقة الوسطى (الخرج)',
    'JAZAN': 'المنطقة الجنوبية (جازان)',
    'GIZ': 'المنطقة الجنوبية (جازان)',
    'NAJRAN': 'المنطقة الجنوبية (نجران)',
    'NAJ': 'المنطقة الجنوبية (نجران)',
    'TABUK': 'المنطقة الشمالية (تبوك)',
    'TBK': 'المنطقة الشمالية (تبوك)',
    'JUBAIL': 'المنطقة الشرقية (الجبيل)',
    'YANBU': 'المنطقة الغربية (ينبع)',
    'YNB': 'المنطقة الغربية (ينبع)'
  };

  if (locationNameMap[s]) {
    return `${locationNameMap[s]} (${s})`;
  }
  return locStr;
}

// =====================================================================
// FILTER ENGINE — Excel AutoFilter Cascading Model
// =====================================================================

// Normalize string for reliable comparison (trim + uppercase)
function normKey(str) {
  return (str || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

// Get employee's Location key (raw value from Excel, source of truth)
function empLocKey(emp) {
  return normKey(emp.Location || emp.Region_ID || '');
}

// Step 1: Apply user permission scope
function getScopedEmployees() {
  const user = state.currentUser;
  if (!user) return state.employees;
  if (user.Role === 'Super Admin' || user.Role === 'HR Admin' || user.Role === 'Viewer') {
    return state.employees;
  }
  if (user.Role === 'Regional Supervisor' && user.Region_ID && user.Region_ID !== 'ALL') {
    const allowedKeys = (user.Regions || [user.Region_ID]).map(normKey);
    return state.employees.filter(e => allowedKeys.includes(empLocKey(e)));
  }
  if (user.Role === 'Project Manager' && user.Project_Name && user.Project_Name !== 'ALL') {
    return state.employees.filter(e => normKey(e.Project_Name) === normKey(user.Project_Name));
  }
  return state.employees;
}

// Step 2: Apply UI filters (AND logic)
function applyFilters(scopedEmps) {
  const dashFill = document.getElementById('dashFillingFilter');
  const empFill  = document.getElementById('empFillingFilter');
  const fillFilter =
    (dashFill && dashFill.value !== 'ALL') ? dashFill.value :
    (empFill  && empFill.value  !== 'ALL') ? empFill.value  : 'ALL';

  return scopedEmps.filter(emp => {
    // Region filter
    if (state.selectedRegion !== 'ALL') {
      if (empLocKey(emp) !== normKey(state.selectedRegion)) return false;
    }
    // Project filter
    if (state.selectedProject !== 'ALL') {
      if (normKey(emp.Project_Name) !== normKey(state.selectedProject)) return false;
    }
    // Filling status filter
    if (fillFilter !== 'ALL') {
      if (emp.Filling_Status !== fillFilter) return false;
    }
    // Search (within current scope only)
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      if (!(emp.Employee_Name   || '').toLowerCase().includes(q) &&
          !(emp.Employee_Number || '').toLowerCase().includes(q) &&
          !(emp.Iqama_Number    || '').toLowerCase().includes(q) &&
          !(emp.Location        || emp.Region_ID || '').toLowerCase().includes(q) &&
          !(emp.Project_Name    || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

// Build region options from scoped employees — uses EXACT Excel Location values as labels
function getAvailableLocations(scopedEmps) {
  const emps = scopedEmps || getScopedEmployees();
  // Use raw Location string (exact from Excel) as both ID and display label
  const counts = {};
  const origLabels = {};  // normKey → original Location string (first seen)
  emps.forEach(e => {
    const raw = (e.Location || e.Region_ID || '').trim();  // EXACT Excel value
    const k   = normKey(raw);
    if (k) {
      counts[k] = (counts[k] || 0) + 1;
      if (!origLabels[k]) origLabels[k] = raw;  // preserve original casing
    }
  });
  return Object.keys(counts)
    .map(k => ({ id: k, label: origLabels[k] || k, count: counts[k] }))
    .sort((a, b) => b.count - a.count);
}

// Build project options from region-filtered employees
function getAvailableProjects(regionFilteredEmps) {
  const counts = {};
  regionFilteredEmps.forEach(e => {
    const p = (e.Project_Name || '').trim();
    if (p) counts[p] = (counts[p] || 0) + 1;
  });
  return Object.keys(counts)
    .map(k => ({ name: k, count: counts[k] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

// Cascade: Rebuild ALL dropdowns from real imported data
function populateRegionAndProjectDropdowns() {
  const scoped = getScopedEmployees();
  const locations = getAvailableLocations(scoped);

  // Region-filtered set for project dropdown
  let regionFiltered = scoped;
  if (state.selectedRegion !== 'ALL') {
    regionFiltered = scoped.filter(e => empLocKey(e) === normKey(state.selectedRegion));
  }
  const projects = getAvailableProjects(regionFiltered);

  ['dash', 'emp', 'sup'].forEach(prefix => {
    // Region dropdown — show EXACT Excel Location value as display text
    const regSelect = document.getElementById(`${prefix}RegionFilter`);
    if (regSelect) {
      regSelect.innerHTML =
        `<option value="ALL">جميع المناطق (${scoped.length.toLocaleString('ar-SA')})</option>`;
      locations.forEach(loc => {
        const selected = normKey(state.selectedRegion) === loc.id ? ' selected' : '';
        // Display: raw Excel value + employee count  (NO Arabic translation)
        regSelect.innerHTML +=
          `<option value="${loc.id}"${selected}>${loc.label} (${loc.count})</option>`;
      });
    }

    // Project dropdown — always derived from current region filter
    const prjSelect = document.getElementById(`${prefix}ProjectFilter`);
    if (prjSelect) {
      prjSelect.innerHTML =
        `<option value="ALL">جميع المشاريع (${projects.length})</option>`;
      projects.forEach(p => {
        const selected = normKey(state.selectedProject) === normKey(p.name) ? ' selected' : '';
        prjSelect.innerHTML +=
          `<option value="${p.name}"${selected}>${p.name} (${p.count})</option>`;
      });
      // If current selection no longer valid, reset
      if (state.selectedProject !== 'ALL' && !projects.find(p => normKey(p.name) === normKey(state.selectedProject))) {
        state.selectedProject = 'ALL';
        prjSelect.value = 'ALL';
      }
    }
  });
}

// Region changed → cascade reset project → rebuild → render
function handleRegionChange(prefix) {
  const regSelect = document.getElementById(`${prefix}RegionFilter`);
  if (!regSelect) return;
  state.selectedRegion  = regSelect.value;
  state.selectedProject = 'ALL'; // Always reset downstream
  state.currentPage     = 1;
  populateRegionAndProjectDropdowns();
  renderCurrentView();
}

// Project changed → just re-filter → render
function handleProjectChange(prefix) {
  const prjSelect = document.getElementById(`${prefix}ProjectFilter`);
  if (!prjSelect) return;
  state.selectedProject = prjSelect.value;
  state.currentPage     = 1;
  // Sync other project dropdowns
  ['dash', 'emp'].forEach(p => {
    const other = document.getElementById(`${p}ProjectFilter`);
    if (other && other !== prjSelect) other.value = state.selectedProject;
  });
  renderCurrentView();
}

// Reset all filters
function resetFilters() {
  state.selectedRegion  = 'ALL';
  state.selectedProject = 'ALL';
  state.currentPage     = 1;
  state.searchQuery     = '';
  const srch = document.getElementById('globalSearchInput');
  if (srch) srch.value = '';
  ['dashFillingFilter', 'empFillingFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 'ALL';
  });
  populateRegionAndProjectDropdowns();
  renderCurrentView();
  showToast('تم إعادة تعيين جميع الفلاتر', 'info');
}

function parseLocationToRegion(locStr) {
  if (!locStr) return { id: 'RUH', name: getLocationLabel('RUH') };
  const s = String(locStr).trim();
  return { id: s, name: getLocationLabel(s) };
}




function calculateDaysRemaining(expDate) {
  if (!expDate) return null;
  const exp = new Date(expDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
}

function getStatusBadgeHTML(expDate, avail) {
  if (avail === 'No') return '<span class="badge badge-na">غير مطلوب</span>';
  if (!expDate) return '<span class="badge badge-missing">مفقود</span>';

  const days = calculateDaysRemaining(expDate);
  if (days === null) return '<span class="badge badge-missing">مفقود</span>';
  if (days < 0) return `<span class="badge badge-expired"><i class="fa-solid fa-circle-xmark"></i> منتهي (${Math.abs(days)} يوم)</span>`;
  if (days <= 15) return `<span class="badge badge-critical"><i class="fa-solid fa-triangle-exclamation"></i> حرج (${days} يوم)</span>`;
  if (days <= 30) return `<span class="badge badge-expiring"><i class="fa-solid fa-clock"></i> ينتهي قريباً (${days} يوم)</span>`;
  if (days <= 60) return `<span class="badge badge-expiring"><i class="fa-solid fa-triangle-exclamation"></i> تحذير (${days} يوم)</span>`;
  return `<span class="badge badge-valid"><i class="fa-solid fa-circle-check"></i> ساري</span>`;
}

function getFillingStatusBadgeHTML(status) {
  if (status === 'Completed') return '<span class="badge badge-valid"><i class="fa-solid fa-check-double"></i> مكتمل بالكامل (Completed)</span>';
  if (status === 'In Progress') return '<span class="badge badge-expiring"><i class="fa-solid fa-spinner"></i> جاري التعبئة (In Progress)</span>';
  if (status === 'Needs Review') return '<span class="badge badge-critical"><i class="fa-solid fa-triangle-exclamation"></i> يحتاج مراجعة (Needs Review)</span>';
  return '<span class="badge badge-missing"><i class="fa-solid fa-circle-pause"></i> لم يبدأ (Not Started)</span>';
}

function calculateCompletionLocal(emp) {
  let points = 20;
  let total = 60;
  let missing = [];

  if (emp.Iqama_Number && emp.Iqama_Expiry_Date) points += 20;
  else missing.push('الإقامة');

  if (emp.Passport_Number && emp.Passport_Expiry_Date) points += 20;
  else missing.push('الجواز');

  if (emp.Driving_License_Available === 'Yes') {
    total += 20;
    if (emp.Driving_License_Number && emp.Driving_License_Expiry_Date) points += 20;
    else missing.push('رخصة القيادة');
  }

  if (emp.Forklift_License_Available === 'Yes') {
    total += 20;
    if (emp.Forklift_License_Number && emp.Forklift_License_Expiry_Date) points += 20;
    else missing.push('رخصة الفوركلفت');
  }

  const pct = Math.round((points / total) * 100);
  return { percentage: pct, missingDocs: missing };
}

// =====================================================================
// MASTER RENDER ENGINE — single filtered dataset for everything
// =====================================================================
function filterEmployees() {
  return applyFilters(getScopedEmployees());
}

function updateHeaderStats(filteredEmps) {
  const emps = filteredEmps || filterEmployees();
  let expiredCount = 0, expiringSoonCount = 0, missingDocsCount = 0;

  emps.forEach(emp => {
    const days = calculateDaysRemaining(emp.Iqama_Expiry_Date);
    if (days !== null) {
      if (days < 0) expiredCount++;
      else if (days <= 60) expiringSoonCount++;
    }
    if ((emp.Profile_Completion_Percentage || 0) < 100) missingDocsCount++;
  });

  const uniqueLocs = new Set(emps.map(e => empLocKey(e)).filter(Boolean));

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('statTotalEmps',    emps.length.toLocaleString('ar-SA'));
  set('statActiveEmps',   emps.length.toLocaleString('ar-SA'));
  set('statRegions',      uniqueLocs.size.toLocaleString('ar-SA'));
  set('statExpiredIqama', expiredCount.toLocaleString('ar-SA'));
  set('statExpiringSoon', expiringSoonCount.toLocaleString('ar-SA'));
  set('statMissingDocs',  missingDocsCount.toLocaleString('ar-SA'));
  set('expiringBadge',    expiringSoonCount);
  set('expiredBadge',     expiredCount);
  updatePortalDashboardStats();
}

function renderCurrentView() {
  const filtered = filterEmployees(); // ONE pipeline for everything

  updateHeaderStats(filtered);

  if (state.currentView === 'dashboard') {
    renderDashboard(filtered);
  } else if (state.currentView === 'supervisors') {
    renderSupervisorPerformanceView();
  } else if (state.currentView === 'employees') {
    renderEmployeesTable(filtered);
  } else if (state.currentView === 'documents') {
    renderDocumentsTable();
  } else if (state.currentView === 'expiring') {
    renderExpiringTable();
  } else if (state.currentView === 'expired') {
    renderExpiredTable();
  } else if (state.currentView === 'missing') {
    renderMissingTable();
  } else if (state.currentView === 'projects') {
    renderProjectsTable();
  } else if (state.currentView === 'users') {
    if (!state.users || state.users.length === 0) initUsersState();
    renderUsersTable();
  }
}



// Render Dashboard View
function renderDashboard(employees) {
  const tbody = document.getElementById('dashboardTbody');
  if (!tbody) return;

  const sample = employees.slice(0, 10);
  tbody.innerHTML = sample.map(emp => `
    <tr>
      <td><strong>${emp.Employee_Number}</strong></td>
      <td><a href="#" onclick="openEmployeeDetailsPage('${emp.Employee_ID}')" style="color: var(--rassco-turquoise); font-weight: 700;">${emp.Employee_Name}</a></td>
      <td><strong>${emp.Location || emp.Region_ID || '-'}</strong></td>
      <td>${emp.Project_Name}</td>
      <td>${getFillingStatusBadgeHTML(emp.Filling_Status)}</td>
      <td>${getStatusBadgeHTML(emp.Iqama_Expiry_Date, 'Yes')}</td>
      <td>${getStatusBadgeHTML(emp.Passport_Expiry_Date, 'Yes')}</td>
      <td>
        <div class="progress-container">
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${emp.Profile_Completion_Percentage}%"></div></div>
          <span class="progress-text">${emp.Profile_Completion_Percentage}%</span>
        </div>
      </td>
      <td>
        <button class="btn-sm btn-secondary" onclick="openEmployeeDetailsPage('${emp.Employee_ID}')"><i class="fa-solid fa-eye"></i> عرض الملف</button>
      </td>
    </tr>
  `).join('');

  const mobileContainer = ensureMobileCardsContainer('dashboardTbody', 'dashboardMobileCards');
  if (mobileContainer) {
    if (sample.length === 0) {
      mobileContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">لا توجد سجلات لعرضها</div>`;
    } else {
      mobileContainer.innerHTML = sample.map(emp => `
        <div class="mobile-card-item">
          <div class="mobile-card-top">
            <div>
              <div class="mobile-card-title">
                <a href="#" onclick="openEmployeeDetailsPage('${emp.Employee_ID}')" style="color: var(--rassco-turquoise-dark); font-weight: 800; text-decoration: none;">${emp.Employee_Name}</a>
              </div>
              <div class="mobile-card-sub"># ${emp.Employee_Number} | ${emp.Location || emp.Region_ID || '-'}</div>
            </div>
            ${getFillingStatusBadgeHTML(emp.Filling_Status)}
          </div>
          <div class="mobile-card-grid">
            <div class="mobile-card-field">
              <span class="mobile-card-label">المشروع</span>
              <span class="mobile-card-value">${emp.Project_Name || '-'}</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">نسبة الاكتمال</span>
              <span class="mobile-card-value" style="color: var(--rassco-turquoise-dark);">${emp.Profile_Completion_Percentage}%</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">الإقامة</span>
              <span class="mobile-card-value">${getStatusBadgeHTML(emp.Iqama_Expiry_Date, 'Yes')}</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">الجواز</span>
              <span class="mobile-card-value">${getStatusBadgeHTML(emp.Passport_Expiry_Date, 'Yes')}</span>
            </div>
          </div>
          <div class="mobile-card-actions">
            <button class="btn-primary" onclick="openEmployeeDetailsPage('${emp.Employee_ID}')" style="width: 100%; justify-content: center;">
              <i class="fa-solid fa-eye"></i> عرض وتحديث الملف
            </button>
          </div>
        </div>
      `).join('');
    }
  }
}

// =====================================================================
// SUPERVISORS PERFORMANCE MONITORING ENGINE (Fully Dynamic)
// =====================================================================

/**
 * getSupervisorsList() - Derives supervisor data dynamically from imported Excel employees and activity logs
 */
function getSupervisorsList() {
  const scopedEmps = getScopedEmployees();
  if (!scopedEmps || scopedEmps.length === 0) return [];

  // Default supervisor identity mappings per location key
  const defaultSupMap = {
    'QAS': { name: 'أحمد علي (مشرف القصيم)', email: 'sup.qassim@rassco.com.sa', role: 'مشرف منطقة القصيم' },
    'QSM': { name: 'أحمد علي (مشرف القصيم)', email: 'sup.qassim@rassco.com.sa', role: 'مشرف منطقة القصيم' },
    'RUH': { name: 'محمد صالح (مشرف الرياض)', email: 'pm.nemer@rassco.com.sa', role: 'مشرف المنطقة الوسطى' },
    'RIYADH': { name: 'محمد صالح (مشرف الرياض)', email: 'pm.nemer@rassco.com.sa', role: 'مشرف المنطقة الوسطى' },
    'JED': { name: 'عبدالله الغامدي (مشرف جدة)', email: 'sup.jeddah@rassco.com.sa', role: 'مشرف المنطقة الغربية' },
    'JEDDAH': { name: 'عبدالله الغامدي (مشرف جدة)', email: 'sup.jeddah@rassco.com.sa', role: 'مشرف المنطقة الغربية' },
    'KHOBAR': { name: 'سعد الدوسري (مشرف الخبر)', email: 'sup.khobar@rassco.com.sa', role: 'مشرف المنطقة الشرقية' },
    'DAM': { name: 'فهد القحطاني (مشرف الدمام)', email: 'sup.dammam@rassco.com.sa', role: 'مشرف المنطقة الشرقية' },
    'ABHA': { name: 'سعيد العسيري (مشرف أبها)', email: 'sup.abha@rassco.com.sa', role: 'مشرف المنطقة الجنوبية' },
    'HAIL': { name: 'خالد حسن (مشرف حائل)', email: 'sup.hail@rassco.com.sa', role: 'مشرف المنطقة الشمالية' }
  };

  // Group scoped employees by location
  const groups = {};
  scopedEmps.forEach(emp => {
    const rawLoc = (emp.Location || emp.Region_ID || 'غير محدد').trim();
    const locKey = normKey(rawLoc);
    if (!groups[locKey]) {
      groups[locKey] = {
        locKey: locKey,
        rawLocation: rawLoc,
        label: getLocationLabel(rawLoc),
        employees: []
      };
    }
    groups[locKey].employees.push(emp);
  });

  const supervisors = [];

  Object.keys(groups).forEach(locKey => {
    const g = groups[locKey];
    const emps = g.employees;

    // Lookup registered user in state.users first
    const registeredUser = (state.users || []).find(u => {
      if (u.Status === 'Inactive' || u.Status === 'Suspended') return false;
      const uRegs = (u.Regions || []).map(normKey);
      if (uRegs.includes('ALL') || uRegs.includes(locKey)) return true;
      return false;
    });

    const supInfo = registeredUser ? {
      name: registeredUser.Full_Name,
      email: registeredUser.Email,
      role: registeredUser.Role === 'Regional Supervisor' ? `مشرف منطقة ${g.rawLocation}` : (registeredUser.Role === 'Project Manager' ? `مدير مشروع (${g.rawLocation})` : registeredUser.Role)
    } : (defaultSupMap[locKey] || {
      name: `مشرف ${g.rawLocation}`,
      email: `sup.${locKey.toLowerCase()}@rassco.com.sa`,
      role: `مشرف منطقة ${g.rawLocation}`
    });

    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    let needsReview = 0;

    const projectSet = new Set();
    let latestActivityTime = null;
    let lastProductiveActDesc = 'لا يوجد نشاط مسجل مؤخراً';
    let whoCompletedLast = '-';
    let lastCompletedAt = null;

    emps.forEach(emp => {
      if (emp.Project_Name) projectSet.add(emp.Project_Name.trim());

      const { percentage, missingDocs } = calculateCompletionLocal(emp);
      emp.Profile_Completion_Percentage = percentage;
      emp.Missing_Docs_List = missingDocs;

      if (emp.Filling_Status === 'Completed') {
        completed++;
        if (emp.Completed_By_Name) whoCompletedLast = emp.Completed_By_Name;
        if (emp.Last_Updated_At) lastCompletedAt = emp.Last_Updated_At;
      } else if (emp.Filling_Status === 'In Progress') {
        inProgress++;
      } else if (emp.Filling_Status === 'Needs Review') {
        needsReview++;
      } else {
        notStarted++;
      }

      if (emp.Last_Updated_At) {
        latestActivityTime = emp.Last_Updated_At;
        if (emp.Last_Updated_By_Name) {
          lastProductiveActDesc = `تحديث بيانات الموظف: ${emp.Employee_Name} (${emp.Last_Updated_By_Name})`;
        }
      }
    });

    const assigned = emps.length;
    const remaining = assigned - completed;
    const completionRate = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;

    // Check activity logs
    const supLogs = state.activityLogs.filter(l => 
      (l.User_Name && l.User_Name.includes(supInfo.name.split(' ')[0])) ||
      emps.some(e => e.Employee_ID === l.Employee_ID)
    );

    if (supLogs.length > 0) {
      lastProductiveActDesc = supLogs[0].Details || lastProductiveActDesc;
      latestActivityTime = supLogs[0].Timestamp || latestActivityTime;
    }

    const activityStatus = supLogs.length > 0 || latestActivityTime ? 'Active Today' : 'Inactive';

    supervisors.push({
      key: locKey,
      name: supInfo.name,
      email: supInfo.email,
      role: supInfo.role,
      regionKey: locKey,
      regionLabel: g.label,
      projects: Array.from(projectSet),
      employees: emps,
      assigned: assigned,
      completed: completed,
      inProgress: inProgress,
      notStarted: notStarted,
      needsReview: needsReview,
      remaining: remaining,
      completionRate: completionRate,
      lastProductiveAct: lastProductiveActDesc,
      lastActTime: latestActivityTime || 'اليوم 08:00 AM',
      whoCompletedLast: whoCompletedLast,
      activityStatus: activityStatus,
      supLogs: supLogs
    });
  });

  return supervisors;
}

// Cascading Supervisor Filters Engine
function handleSupRegionChange() {
  const regSel = document.getElementById('supRegionFilter');
  if (!regSel) return;
  const regVal = regSel.value;

  const scoped = getScopedEmployees();
  let filteredEmps = scoped;
  if (regVal !== 'ALL') {
    filteredEmps = scoped.filter(e => empLocKey(e) === normKey(regVal));
  }

  // Update Project filter options
  const prjSel = document.getElementById('supProjectFilter');
  if (prjSel) {
    const projects = getAvailableProjects(filteredEmps);
    prjSel.innerHTML = `<option value="ALL">جميع المشاريع (${projects.length})</option>`;
    projects.forEach(p => {
      prjSel.innerHTML += `<option value="${p.name}">${p.name} (${p.count})</option>`;
    });
    prjSel.value = 'ALL';
  }

  // Update Supervisor filter options
  handleSupProjectChange();
}

function handleSupProjectChange() {
  const regVal = (document.getElementById('supRegionFilter') || {}).value || 'ALL';
  const prjVal = (document.getElementById('supProjectFilter') || {}).value || 'ALL';

  const supervisors = getSupervisorsList();
  const filteredSups = supervisors.filter(sup => {
    if (regVal !== 'ALL' && normKey(sup.regionKey) !== normKey(regVal)) return false;
    if (prjVal !== 'ALL' && !sup.projects.some(p => normKey(p) === normKey(prjVal))) return false;
    return true;
  });

  const supSel = document.getElementById('supSupervisorFilter');
  if (supSel) {
    supSel.innerHTML = `<option value="ALL">جميع المشرفين (${filteredSups.length})</option>`;
    filteredSups.forEach(s => {
      supSel.innerHTML += `<option value="${s.key}">${s.name}</option>`;
    });
    supSel.value = 'ALL';
  }

  renderSupervisorPerformanceView();
}

function resetSupervisorFilters() {
  ['supRegionFilter', 'supProjectFilter', 'supSupervisorFilter', 'supCompletionFilter', 'supActivityFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 'ALL';
  });
  const sort = document.getElementById('supSortFilter');
  if (sort) sort.value = 'Highest';

  populateRegionAndProjectDropdowns();
  renderSupervisorPerformanceView();
  showToast('تم إعادة تعيين جميع فلاتر المشرفين', 'info');
}

// Initials generator helper — clean Arabic & English prefix handling
function getInitials(nameStr) {
  if (!nameStr) return 'RS';
  
  let cleaned = nameStr.trim();
  // If name contains parentheses like "مشرف الرياض (محمد صالح)", extract inside name first
  const parenMatch = cleaned.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inside = parenMatch[1].trim();
    if (!inside.startsWith('مشرف') && !inside.startsWith('مدير')) {
      cleaned = inside;
    } else {
      cleaned = cleaned.replace(/\([^)]+\)/g, '').trim();
    }
  }

  // Strip prefix roles
  cleaned = cleaned.replace(/^(مشرف\s+منطقة\s+|مدير\s+مشروع\s+|مشرف\s+|مدير\s+)/i, '').trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  } else if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return 'RS';
}

// Master Render Supervisor Performance View (Corporate SaaS Layout)
function renderSupervisorPerformanceView() {
  const tbody = document.getElementById('supervisorsTbody');
  if (!tbody) return;

  const allSups = getSupervisorsList();

  const regVal = (document.getElementById('supRegionFilter') || {}).value || 'ALL';
  const prjVal = (document.getElementById('supProjectFilter') || {}).value || 'ALL';
  const supVal = (document.getElementById('supSupervisorFilter') || {}).value || 'ALL';
  const compVal = (document.getElementById('supCompletionFilter') || {}).value || 'ALL';
  const actVal = (document.getElementById('supActivityFilter') || {}).value || 'ALL';
  const sortVal = (document.getElementById('supSortFilter') || {}).value || 'Highest';
  const srchVal = ((document.getElementById('supSearchInput') || {}).value || '').toLowerCase().trim();

  // Apply cascading filters & search
  let filteredSups = allSups.filter(sup => {
    if (regVal !== 'ALL' && normKey(sup.regionKey) !== normKey(regVal)) return false;
    if (prjVal !== 'ALL' && !sup.projects.some(p => normKey(p) === normKey(prjVal))) return false;
    if (supVal !== 'ALL' && sup.key !== supVal) return false;

    if (compVal === 'High' && sup.completionRate < 80) return false;
    if (compVal === 'Medium' && (sup.completionRate < 50 || sup.completionRate >= 80)) return false;
    if (compVal === 'Low' && sup.completionRate >= 50) return false;

    if (actVal !== 'ALL' && sup.activityStatus !== actVal) return false;

    if (srchVal) {
      const matchName = (sup.name || '').toLowerCase().includes(srchVal);
      const matchEmail = (sup.email || '').toLowerCase().includes(srchVal);
      const matchRegion = (sup.regionLabel || '').toLowerCase().includes(srchVal);
      const matchEmp = sup.employees.some(e => 
        (e.Employee_Name || '').toLowerCase().includes(srchVal) ||
        (e.Employee_Number || '').toLowerCase().includes(srchVal)
      );
      if (!matchName && !matchEmail && !matchRegion && !matchEmp) return false;
    }

    return true;
  });

  // Apply sorting
  filteredSups.sort((a, b) => {
    if (sortVal === 'Highest') return b.completionRate - a.completionRate;
    if (sortVal === 'Lowest') return a.completionRate - b.completionRate;
    if (sortVal === 'MostRemaining') return b.remaining - a.remaining;
    if (sortVal === 'MostActive') return (b.supLogs || []).length - (a.supLogs || []).length;
    if (sortVal === 'MostCompleted') return b.completed - a.completed;
    return b.completionRate - a.completionRate;
  });

  // Calculate 6 KPI Summary stats
  let totalAssigned = 0;
  let totalCompleted = 0;
  let totalInProgress = 0;
  let totalNotStarted = 0;

  filteredSups.forEach(s => {
    totalAssigned += s.assigned;
    totalCompleted += s.completed;
    totalInProgress += s.inProgress;
    totalNotStarted += s.notStarted;
  });

  const overallPct = totalAssigned > 0 ? (totalCompleted / totalAssigned * 100).toFixed(1) : '0';

  // Set KPI stats elements
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('supStatTotalSupervisors', filteredSups.length.toLocaleString('ar-SA'));
  setTxt('supStatTotalAssigned',     totalAssigned.toLocaleString('ar-SA'));
  setTxt('supStatCompleted',         totalCompleted.toLocaleString('ar-SA'));
  setTxt('supStatInProgress',        totalInProgress.toLocaleString('ar-SA'));
  setTxt('supStatNotStarted',        totalNotStarted.toLocaleString('ar-SA'));
  setTxt('supStatOverallPct',        `${overallPct}%`);

  const timeEl = document.getElementById('supHeaderLastUpdated');
  if (timeEl) timeEl.textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`;

  // Populate Supervisors Table (Desktop)
  if (filteredSups.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fa-solid fa-folder-open fa-2x" style="margin-bottom: 12px; color: var(--text-dim);"></i><br>
          لا يوجد مشرفون يطابقون خيارات الفلترة أو البحث المحددة
        </td>
      </tr>
    `;
    const mobileContainer = ensureMobileCardsContainer('supervisorsTbody', 'supervisorsMobileCards');
    if (mobileContainer) mobileContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">لا يوجد مشرفون يطابقون الفلترة</div>`;
    return;
  }

  tbody.innerHTML = filteredSups.map(sup => {
    const initials = getInitials(sup.name);
    
    // Project Tags
    let prjTagsHTML = '';
    if (sup.projects.length <= 2) {
      prjTagsHTML = sup.projects.map(p => `<span style="display: inline-block; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 700; margin: 1px;">${p}</span>`).join('');
    } else {
      const firstTwo = sup.projects.slice(0, 2).map(p => `<span style="display: inline-block; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 700; margin: 1px;">${p}</span>`).join('');
      prjTagsHTML = `${firstTwo} <span dir="ltr" style="display: inline-block; background: var(--rassco-turquoise-mint); color: var(--rassco-turquoise-dark); border: 1px solid rgba(20, 184, 166, 0.3); padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 800;">+${sup.projects.length - 2}</span>`;
    }

    const dotClass = sup.activityStatus === 'Active Today' ? 'status-dot-active' : 'status-dot-inactive';
    const statusText = sup.activityStatus === 'Active Today' ? 'نشط اليوم' : 'غير نشط';

    return `
      <tr style="height: 72px;">
        <td style="padding-right: 20px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="avatar-circle" style="font-weight: 900; background: linear-gradient(135deg, var(--rassco-turquoise), #0D9488); color: #FFFFFF; font-size: 13px;">${initials}</div>
            <div>
              <div style="font-weight: 800; color: var(--text-main); font-size: 14px; display: flex; align-items: center; gap: 6px;">
                <span class="status-dot ${dotClass}" title="${statusText}"></span>
                ${sup.name}
              </div>
              <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${sup.email}</div>
            </div>
          </div>
        </td>
        <td>
          <span style="display: inline-block; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 800; color: var(--text-main);">
            ${sup.regionKey}
          </span>
        </td>
        <td style="max-width: 170px;">${prjTagsHTML || '-'}</td>
        <td style="text-align: center;"><strong style="font-size: 15px; color: var(--text-main);">${sup.assigned}</strong></td>
        <td>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            <span class="chip chip-completed">${sup.completed} مكتمل</span>
            <span class="chip chip-progress">${sup.inProgress} جاري</span>
            <span class="chip chip-notstarted">${sup.notStarted} لم يبدأ</span>
          </div>
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 4px; width: 160px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
              <span style="font-weight: 900; color: var(--rassco-turquoise-dark);">${sup.completionRate}%</span>
              <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">${sup.completed} من ${sup.assigned}</span>
            </div>
            <div class="progress-bar-bg" style="height: 8px; border-radius: 4px;">
              <div class="progress-bar-fill" style="width: ${sup.completionRate}%; border-radius: 4px;"></div>
            </div>
          </div>
        </td>
        <td style="max-width: 180px;">
          <div style="font-size: 12px; font-weight: 700; color: var(--text-main); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${sup.lastProductiveAct}">${sup.lastProductiveAct}</div>
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 3px; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-clock" style="font-size: 10px;"></i> ${sup.lastActTime}</div>
        </td>
        <td style="text-align: center; padding-left: 20px;">
          <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
            <button class="btn-primary" onclick="openSupervisorDrawer('${sup.key}', 'remaining')" style="padding: 6px 12px; font-size: 12px; height: 34px;">
              <i class="fa-solid fa-sidebar"></i> التفاصيل
            </button>
            <button class="btn-secondary" onclick="openSupervisorDrawer('${sup.key}', 'remaining')" style="padding: 6px 10px; font-size: 11px; height: 34px; color: #D97706; border-color: rgba(245, 158, 11, 0.35);">
              المتبقي (${sup.remaining})
            </button>
            <button class="btn-secondary" onclick="openSupervisorDrawer('${sup.key}', 'activity')" style="padding: 6px 10px; font-size: 11px; height: 34px;">
              النشاط
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Populate Mobile Cards View
  const mobileContainer = ensureMobileCardsContainer('supervisorsTbody', 'supervisorsMobileCards');
  if (mobileContainer) {
    mobileContainer.innerHTML = filteredSups.map(sup => `
      <div class="mobile-card-item">
        <div class="mobile-card-top">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="avatar-circle" style="width:38px; height:38px; font-size:12px; background: linear-gradient(135deg, var(--rassco-turquoise), #0D9488); color: #fff;">${getInitials(sup.name)}</div>
            <div>
              <div class="mobile-card-title">${sup.name}</div>
              <div class="mobile-card-sub">${sup.email}</div>
            </div>
          </div>
          <span style="background: var(--bg-primary); border: 1px solid var(--border-color); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800;">${sup.regionKey}</span>
        </div>
        <div class="mobile-card-grid">
          <div class="mobile-card-field">
            <span class="mobile-card-label">المسندون</span>
            <span class="mobile-card-value">${sup.assigned} موظف</span>
          </div>
          <div class="mobile-card-field">
            <span class="mobile-card-label">نسبة الإنجاز</span>
            <span class="mobile-card-value" style="color: var(--rassco-turquoise-dark);">${sup.completionRate}% (${sup.completed} من ${sup.assigned})</span>
          </div>
          <div class="mobile-card-field">
            <span class="mobile-card-label">حالات الملفات</span>
            <span class="mobile-card-value">
              <span class="chip chip-completed">${sup.completed} مكتمل</span>
              <span class="chip chip-progress">${sup.inProgress} جاري</span>
            </span>
          </div>
          <div class="mobile-card-field">
            <span class="mobile-card-label">المتبقي</span>
            <span class="mobile-card-value" style="color: #D97706;">${sup.remaining} موظف</span>
          </div>
        </div>
        <div style="font-size: 11px; color: var(--text-dim); display: flex; align-items: center; gap: 4px;">
          <i class="fa-solid fa-clock" style="font-size: 10px;"></i> ${sup.lastProductiveAct} (${sup.lastActTime})
        </div>
        <div class="mobile-card-actions">
          <button class="btn-secondary" onclick="openSupervisorDrawer('${sup.key}', 'remaining')" style="padding: 6px 12px; font-size: 12px; color: #D97706; border-color: rgba(245, 158, 11, 0.35);">
            المتبقي (${sup.remaining})
          </button>
          <button class="btn-primary" onclick="openSupervisorDrawer('${sup.key}', 'remaining')" style="padding: 6px 14px; font-size: 12px;">
            <i class="fa-solid fa-eye"></i> التفاصيل
          </button>
        </div>
      </div>
    `).join('');
  }
}

// =====================================================================
// EXECUTIVE SIDE DRAWER ENGINE FOR SUPERVISOR DRILLDOWN
// =====================================================================

let activeDrawerSupKey = null;

function openSupervisorDrawer(supKey, defaultTab = 'remaining') {
  activeDrawerSupKey = supKey;
  const sups = getSupervisorsList();
  const sup = sups.find(s => s.key === supKey);
  if (!sup) return;

  const initials = getInitials(sup.name);
  document.getElementById('drawerAvatar').textContent = initials;
  document.getElementById('drawerSupName').textContent = sup.name;
  document.getElementById('drawerSupEmail').textContent = sup.email;
  document.getElementById('drawerSupRole').textContent = `${sup.role} — ${sup.regionLabel}`;

  document.getElementById('drawerCompletionPct').textContent = `${sup.completionRate}%`;
  document.getElementById('drawerProgressBar').style.width = `${sup.completionRate}%`;

  document.getElementById('drawerAssigned').textContent = sup.assigned;
  document.getElementById('drawerCompleted').textContent = sup.completed;
  document.getElementById('drawerInProgress').textContent = sup.inProgress;
  document.getElementById('drawerRemaining').textContent = sup.remaining;

  document.getElementById('drawerTabRemainingCount').textContent = sup.remaining;
  document.getElementById('drawerTabCompletedCount').textContent = sup.completed;

  // Render Remaining Tab Content
  const remEmps = sup.employees.filter(e => e.Filling_Status !== 'Completed');
  const remTbody = document.getElementById('drawerRemainingTbody');
  if (remEmps.length === 0) {
    remTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px; color: #10B981; font-weight: 800;">🎉 لا يوجد أي موظف متبقٍ! جميع الملفات مكتملة بالكامل.</td></tr>`;
  } else {
    remTbody.innerHTML = remEmps.map(emp => `
      <tr>
        <td>
          <a href="#" onclick="closeSupervisorDrawer(); openEmployeeDetailsPage('${emp.Employee_ID}');" style="color: var(--rassco-turquoise-dark); font-weight: 700;">
            ${emp.Employee_Name}
          </a>
          <div style="font-size: 11px; color: var(--text-dim);"># ${emp.Employee_Number}</div>
        </td>
        <td><span style="font-size: 12px; font-weight: 600;">${emp.Project_Name}</span></td>
        <td><span style="color: #EF4444; font-weight: 700; font-size: 11px;">${(emp.Missing_Docs_List || []).join('، ') || 'بيانات ووثائق ناقصة'}</span></td>
        <td>
          <button class="btn-primary" onclick="closeSupervisorDrawer(); openEmployeeDetailsPage('${emp.Employee_ID}');" style="padding: 4px 10px; font-size: 11px;">
            استكمال
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Render Completed Tab Content
  const compEmps = sup.employees.filter(e => e.Filling_Status === 'Completed');
  const compTbody = document.getElementById('drawerCompletedTbody');
  if (compEmps.length === 0) {
    compTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px; color: var(--text-muted);">لا يوجد موظفون مكتملون بعد لدقة الإنجاز لهذا المشرف.</td></tr>`;
  } else {
    compTbody.innerHTML = compEmps.map(emp => `
      <tr>
        <td>
          <a href="#" onclick="closeSupervisorDrawer(); openEmployeeDetailsPage('${emp.Employee_ID}');" style="color: var(--rassco-turquoise-dark); font-weight: 700;">
            ${emp.Employee_Name}
          </a>
          <div style="font-size: 11px; color: var(--text-dim);"># ${emp.Employee_Number}</div>
        </td>
        <td><span style="font-size: 12px; font-weight: 600;">${emp.Project_Name}</span></td>
        <td style="font-size: 12px; font-weight: 700; color: #10B981;">${emp.Completed_By_Name || 'المشرف المسؤول'}</td>
        <td style="font-size: 11px; color: var(--text-muted);">${emp.Last_Updated_At || 'اليوم'}</td>
      </tr>
    `).join('');
  }

  // Render Activity Timeline Tab Content
  const actContainer = document.getElementById('drawerActivityTimelineList');
  if (sup.supLogs.length === 0) {
    actContainer.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
        لا توجد أنشطة مسجلة في السجل لهذا المشرف مؤخراً.
      </div>
    `;
  } else {
    actContainer.innerHTML = sup.supLogs.map(log => `
      <div class="timeline-item">
        <div style="font-size: 11px; font-weight: 800; color: var(--rassco-turquoise-dark); margin-bottom: 2px;">
          ${log.Timestamp} ${log.Date ? '(' + log.Date + ')' : ''}
        </div>
        <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">${log.Details}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">بواسطة: ${log.User_Name || sup.name} (${log.Role || 'مشرف'})</div>
      </div>
    `).join('');
  }

  switchDrawerTab(defaultTab);
  document.getElementById('supervisorDrawer').classList.add('active');
}

function closeSupervisorDrawer() {
  document.getElementById('supervisorDrawer').classList.remove('active');
}

function switchDrawerTab(tabName) {
  ['remaining', 'completed', 'activity'].forEach(t => {
    const content = document.getElementById(`drawerTab${t.charAt(0).toUpperCase() + t.slice(1)}Content`);
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (content) content.style.display = (t === tabName) ? 'block' : 'none';
    if (btn) {
      if (t === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
}

// 1. Open Supervisor Full Details Modal (Legacy Compatibility Router)
function openSupervisorDetailsModal(supKey) {
  openSupervisorDrawer(supKey, 'remaining');
}

function closeSupervisorModal() {
  closeSupervisorDrawer();
}

// 2. Open Remaining Employees Modal (قسم المتبقي بالأسماء)
function openSupRemainingModal(supKey) {
  const supervisors = getSupervisorsList();
  const sup = supervisors.find(s => s.key === supKey);
  if (!sup) return;

  document.getElementById('supRemainingModalTitle').innerHTML = `<i class="fa-solid fa-list-check" style="color: #F97316;"></i> الموظفون المتبقون لدى المشرف: ${sup.name}`;

  document.getElementById('supRemainingBanner').innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
      <div>
        <h4 style="font-size: 16px; font-weight: 800; color: #C2410C;">إجمالي الموظفين غير المكتملين: ${sup.remaining} موظف</h4>
        <p style="font-size: 12px; color: var(--text-muted);">المشرف: <strong>${sup.name}</strong> | المنطقة: <strong>${sup.regionLabel}</strong></p>
      </div>
      <button class="btn-primary" onclick="closeSupRemainingModal(); openSupervisorDetailsModal('${sup.key}');" style="background: linear-gradient(135deg, #F97316, #EA580C);">
        <i class="fa-solid fa-eye"></i> عرض كافة التاصيل
      </button>
    </div>
  `;

  const remainingEmps = sup.employees.filter(e => e.Filling_Status !== 'Completed');
  const tbody = document.getElementById('supRemainingTbody');

  if (remainingEmps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: #10B981; font-weight: 800;">🎉 لا يوجد أي موظف متبقٍ! جميع الملفات مكتملة بالكامل.</td></tr>`;
  } else {
    tbody.innerHTML = remainingEmps.map(emp => `
      <tr>
        <td><strong>${emp.Employee_Number}</strong></td>
        <td><a href="#" onclick="closeSupRemainingModal(); openEmployeeDetailsPage('${emp.Employee_ID}');" style="color: var(--rassco-turquoise); font-weight: 700;">${emp.Employee_Name}</a></td>
        <td>${emp.Project_Name}</td>
        <td>${getFillingStatusBadgeHTML(emp.Filling_Status)}</td>
        <td><span style="color: #EF4444; font-weight: 700; font-size: 12px;">${(emp.Missing_Docs_List || []).join('، ') || 'بيانات ووثائق ناقصة'}</span></td>
        <td style="font-size: 12px;">${emp.Last_Updated_By_Name || 'المشرف'}</td>
        <td style="font-size: 11px; color: var(--text-muted);">${emp.Last_Updated_At || 'اليوم'}</td>
        <td>
          <button class="btn-sm btn-primary" onclick="closeSupRemainingModal(); openEmployeeDetailsPage('${emp.Employee_ID}');" style="background: linear-gradient(135deg, #F97316, #EA580C);">
            <i class="fa-solid fa-file-pen"></i> استكمال
          </button>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('supRemainingModal').classList.add('active');
}

function closeSupRemainingModal() {
  document.getElementById('supRemainingModal').classList.remove('active');
}

// 3. Open Completed Employees Modal (قسم الموظفون المكتملون)
function openSupCompletedModal(supKey) {
  const supervisors = getSupervisorsList();
  const sup = supervisors.find(s => s.key === supKey);
  if (!sup) return;

  document.getElementById('supCompletedModalTitle').innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10B981;"></i> الموظفون المكتملة ملفاتهم لـ: ${sup.name}`;

  document.getElementById('supCompletedBanner').innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
      <div>
        <h4 style="font-size: 16px; font-weight: 800; color: #047857;">إجمالي الملفات المكتملة 100%: ${sup.completed} موظف</h4>
        <p style="font-size: 12px; color: var(--text-muted);">المشرف: <strong>${sup.name}</strong> | نسبة الإنجاز: <strong>${sup.completionRate}%</strong></p>
      </div>
    </div>
  `;

  const completedEmps = sup.employees.filter(e => e.Filling_Status === 'Completed');
  const tbody = document.getElementById('supCompletedTbody');

  if (completedEmps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">لا يوجد موظفون مكتملون بعد لدقة الإنجاز لهذا المشرف.</td></tr>`;
  } else {
    tbody.innerHTML = completedEmps.map(emp => `
      <tr>
        <td><strong>${emp.Employee_Number}</strong></td>
        <td><a href="#" onclick="closeSupCompletedModal(); openEmployeeDetailsPage('${emp.Employee_ID}');" style="color: var(--rassco-turquoise); font-weight: 700;">${emp.Employee_Name}</a></td>
        <td>${emp.Project_Name}</td>
        <td>${emp.Location || sup.regionLabel}</td>
        <td style="font-weight: 700; color: #10B981;">${emp.Completed_By_Name || 'المشرف المسؤول'}</td>
        <td style="font-size: 11px; color: var(--text-muted);">${emp.Last_Updated_At || 'اليوم'}</td>
        <td><span class="badge badge-valid">100% مكتمل</span></td>
        <td>
          <button class="btn-sm btn-secondary" onclick="closeSupCompletedModal(); openEmployeeDetailsPage('${emp.Employee_ID}');">
            <i class="fa-solid fa-eye"></i> عرض الملف
          </button>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('supCompletedModal').classList.add('active');
}

function closeSupCompletedModal() {
  document.getElementById('supCompletedModal').classList.remove('active');
}

// 4. Open Supervisor Activity Log Modal (قسم تتبع النشاط)
function openSupActivityModal(supKey) {
  const supervisors = getSupervisorsList();
  const sup = supervisors.find(s => s.key === supKey);
  if (!sup) return;

  document.getElementById('supActivityLogTitle').innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="color: var(--rassco-turquoise);"></i> سجل نشاط وتعديلات المشرف: ${sup.name}`;

  document.getElementById('supActivityBanner').innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
      <div>
        <h4 style="font-size: 16px; font-weight: 800;">سجل العمليات الإدارية والإنتاجية (${sup.supLogs.length} عملية)</h4>
        <p style="font-size: 12px; color: var(--text-muted);">المشرف: <strong>${sup.name}</strong> | المنطقة: <strong>${sup.regionLabel}</strong></p>
      </div>
    </div>
  `;

  const container = document.getElementById('supActivityTimelineList');

  if (sup.supLogs.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-primary); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center; color: var(--text-muted);">
        <i class="fa-solid fa-info-circle fa-2x" style="margin-bottom: 8px; color: var(--text-dim);"></i><br>
        لا توجد أنشطة مسجلة لهذا المشرف في السجل اللحظي بعد.
      </div>
    `;
  } else {
    container.innerHTML = sup.supLogs.map(log => `
      <div style="background: var(--bg-card); padding: 14px 18px; border-radius: var(--radius-md); border-right: 4px solid var(--rassco-turquoise); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <span class="badge badge-valid" style="margin-bottom: 4px;">${log.Type || 'تحديث بيانات'}</span>
          <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">${log.Details}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">بواسطة: ${log.User_Name || sup.name} (${log.Role || 'مشرف'})</div>
        </div>
        <div style="font-size: 12px; color: var(--text-dim); font-weight: 700;">
          <i class="fa-solid fa-clock"></i> ${log.Timestamp} ${log.Date ? '(' + log.Date + ')' : ''}
        </div>
      </div>
    `).join('');
  }

  document.getElementById('supActivityLogModal').classList.add('active');
}

function closeSupActivityModal() {
  document.getElementById('supActivityLogModal').classList.remove('active');
}

// Export Supervisor Performance Report (Excel / CSV)
function exportSupervisorPerformanceReport() {
  const sups = getSupervisorsList();
  if (sups.length === 0) {
    showToast('لا توجد بيانات مشرفين للتصدير', 'warning');
    return;
  }

  let csvContent = "\uFEFFالمشرف,البريد الإلكتروني,الدور,المنطقة,المشاريع التابعة,المسندون,مكتمل,جاري,لم يبدأ,المتبقي,نسبة الإنجاز %,آخر نشاط,من استكمل آخر موظف\n";

  sups.forEach(s => {
    const projectsStr = (s.projects || []).join(' | ');
    csvContent += `"${s.name}","${s.email}","${s.role}","${s.regionLabel}","${projectsStr}",${s.assigned},${s.completed},${s.inProgress},${s.notStarted},${s.remaining},"${s.completionRate}%","${s.lastProductiveAct}","${s.whoCompletedLast}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `تقرير_أداء_المشرفين_RASSCO_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('✓ تم تصدير تقرير أداء المشرفين بنجاح', 'success');
}


// Render Employees Table View
function renderEmployeesTable(employees) {
  const tbody = document.getElementById('employeesTbody');
  if (!tbody) return;

  const total = employees.length;
  const start = (state.currentPage - 1) * state.pageSize;
  const paginated = employees.slice(start, start + state.pageSize);

  tbody.innerHTML = paginated.map(emp => `
    <tr>
      <td><strong>${emp.Employee_Number}</strong></td>
      <td><a href="#" onclick="openEmployeeDetailsPage('${emp.Employee_ID}')" style="color: var(--rassco-turquoise); font-weight: 700;">${emp.Employee_Name}</a></td>
      <td><strong>${emp.Location || emp.Region_ID || '-'}</strong></td>
      <td>${emp.Project_Name}</td>
      <td>${getFillingStatusBadgeHTML(emp.Filling_Status)}</td>
      <td>${getStatusBadgeHTML(emp.Iqama_Expiry_Date, 'Yes')}</td>
      <td>${getStatusBadgeHTML(emp.Passport_Expiry_Date, 'Yes')}</td>
      <td>${emp.Last_Updated_By_Name || 'مشرف المشروع'}</td>
      <td>
        <div class="progress-container">
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${emp.Profile_Completion_Percentage}%"></div></div>
          <span class="progress-text">${emp.Profile_Completion_Percentage}%</span>
        </div>
      </td>
      <td>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="btn-sm btn-primary" onclick="openEmployeeDetailsPage('${emp.Employee_ID}')"><i class="fa-solid fa-pen-to-square"></i> عرض وتحديث</button>
          <button class="btn-sm" onclick="deleteEmployeePrompt('${emp.Employee_ID}', '${emp.Employee_Name}')" style="background:#EF4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;" title="حذف الموظف"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');

function deleteEmployeePrompt(empId, empName) {
  if (!confirm(`هل أنت محقق من رغبتك في حذف الموظف "${empName}" نهائياً من قاعدة البيانات؟`)) return;

  fetch(`/api/employees/${encodeURIComponent(empId)}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast(`✓ تم حذف الموظف ${empName} بنجاح من قاعدة البيانات`, 'success');
        loadData();
      } else {
        showToast(`❌ تعذر الحذف: ${data.error || 'خطأ في السيرفر'}`, 'error');
      }
    })
    .catch(err => {
      console.error('Delete employee error:', err);
      showToast('❌ تعذر الاتصال بالخادم لحذف الموظف', 'error');
    });
}

  // Mobile Cards View Container
  const mobileCardsContainer = ensureMobileCardsContainer('employeesTbody', 'employeesMobileCards');
  if (mobileCardsContainer) {
    if (paginated.length === 0) {
      mobileCardsContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">لا يوجد موظفون يطابقون خيارات البحث</div>`;
    } else {
      mobileCardsContainer.innerHTML = paginated.map(emp => `
        <div class="mobile-card-item">
          <div class="mobile-card-top">
            <div>
              <div class="mobile-card-title">
                <a href="#" onclick="openEmployeeDetailsPage('${emp.Employee_ID}')" style="color: var(--rassco-turquoise-dark); font-weight: 800; text-decoration: none;">${emp.Employee_Name}</a>
              </div>
              <div class="mobile-card-sub"># ${emp.Employee_Number} | الإقامة: ${emp.Iqama_Number || '-'}</div>
            </div>
            ${getFillingStatusBadgeHTML(emp.Filling_Status)}
          </div>
          <div class="mobile-card-grid">
            <div class="mobile-card-field">
              <span class="mobile-card-label">المنطقة</span>
              <span class="mobile-card-value">${emp.Location || emp.Region_ID || '-'}</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">المشروع</span>
              <span class="mobile-card-value">${emp.Project_Name || '-'}</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">الإقامة</span>
              <span class="mobile-card-value">${getStatusBadgeHTML(emp.Iqama_Expiry_Date, 'Yes')}</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">الجواز</span>
              <span class="mobile-card-value">${getStatusBadgeHTML(emp.Passport_Expiry_Date, 'Yes')}</span>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px;">
              <span style="font-weight: 800; color: var(--rassco-turquoise-dark);">اكتمال الملف: ${emp.Profile_Completion_Percentage}%</span>
              <span style="color: var(--text-dim);">${emp.Last_Updated_By_Name || 'المشرف'}</span>
            </div>
            <div class="progress-bar-bg" style="height: 6px;">
              <div class="progress-bar-fill" style="width: ${emp.Profile_Completion_Percentage}%;"></div>
            </div>
          </div>
          <div class="mobile-card-actions">
            <button class="btn-primary" onclick="openEmployeeDetailsPage('${emp.Employee_ID}')" style="width: 100%; justify-content: center;">
              <i class="fa-solid fa-pen-to-square"></i> عرض وتحديث الملف
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  const totalPages = Math.ceil(total / state.pageSize) || 1;
  document.getElementById('paginationInfo').textContent = `عرض ${start + 1} - ${Math.min(start + state.pageSize, total)} من إجمالي ${total}`;
  
  let buttonsHTML = '';
  if (state.currentPage > 1) {
    buttonsHTML += `<button class="btn-sm btn-secondary" onclick="changePage(${state.currentPage - 1})">السابق</button>`;
  }
  buttonsHTML += `<span style="padding: 6px 12px; font-weight: 700;">صفحة ${state.currentPage} من ${totalPages}</span>`;
  if (state.currentPage < totalPages) {
    buttonsHTML += `<button class="btn-sm btn-secondary" onclick="changePage(${state.currentPage + 1})">التالي</button>`;
  }
  document.getElementById('paginationButtons').innerHTML = buttonsHTML;
}

function changePage(newPage) {
  state.currentPage = newPage;
  renderCurrentView();
}

// Dedicated Employee Details View Router
function openEmployeeDetailsPage(employeeId) {
  const emp = state.employees.find(e => e.Employee_ID === employeeId);
  if (!emp) return;

  state.currentEmployee = emp;
  state.activeEmployee = emp;

  logActivity('Employee Opened', false, emp.Employee_ID, emp.Employee_Name, 'فتح شاشة تفاصيل الموظف');

  // Header Banner
  document.getElementById('detEmpName').textContent = emp.Employee_Name;
  document.getElementById('detEmpSubtitle').textContent = `الرقم الوظيفي: ${emp.Employee_Number} | ${emp.Region_Name || 'المنطقة الوسطى'} | مشروع ${emp.Project_Name}`;
  document.getElementById('detEmpAuditorInfo').innerHTML = `<i class="fa-solid fa-user-pen"></i> تم الإنشاء بواسطة: ${emp.First_Filled_By_Name || 'System Migration'} | آخر تحديث بواسطة: ${emp.Last_Updated_By_Name || 'المشرف'} (${emp.Last_Updated_At || 'اليوم'})`;
  
  document.getElementById('detCompletionFill').style.width = `${emp.Profile_Completion_Percentage}%`;
  document.getElementById('detCompletionText').textContent = `${emp.Profile_Completion_Percentage}%`;
  document.getElementById('detFillingStatusBadge').innerHTML = getFillingStatusBadgeHTML(emp.Filling_Status);

  // Portal status badge
  const portalBadge = document.getElementById('detPortalStatusBadge');
  if (portalBadge) {
    if (emp.Portal_Status === 'Completed') {
      portalBadge.className = 'badge-status status-green';
      portalBadge.innerHTML = `<i class="fa-solid fa-globe"></i> البوابة الخارجية: مكتمل`;
    } else if (emp.Portal_Status === 'Submitted By Employee') {
      portalBadge.className = 'badge-status status-orange';
      portalBadge.innerHTML = `<i class="fa-solid fa-globe"></i> البوابة الخارجية: بانتظار الاعتماد`;
    } else if (emp.Portal_Status === 'Re-upload Requested') {
      portalBadge.className = 'badge-status status-red';
      portalBadge.innerHTML = `<i class="fa-solid fa-globe"></i> البوابة الخارجية: مطلوب إعادة الرفع`;
    } else if (emp.Portal_Status === 'Awaiting Employee' || emp.Portal_Status === 'Employee Started') {
      portalBadge.className = 'badge-status status-blue';
      portalBadge.innerHTML = `<i class="fa-solid fa-globe"></i> البوابة الخارجية: جاري الاستكمال بواسطة الموظف`;
    } else {
      portalBadge.className = 'badge-status status-gray';
      portalBadge.innerHTML = `<i class="fa-solid fa-globe"></i> البوابة الخارجية: لم تنشأ`;
    }
  }

  // Render Supervisor Review Box
  const reviewBox = document.getElementById('supervisorReviewBox');
  if (reviewBox) {
    if (emp.Portal_Status === 'Submitted By Employee' || emp.Filling_Status === 'Pending Supervisor Review') {
      reviewBox.style.display = 'block';
      document.getElementById('reviewSubmissionMeta').textContent = `تاريخ التحديث: ${emp.Portal_Submitted_At || 'مؤخراً'} | رقم الطلب: ${emp.Portal_Submission_ID || '-'} | المصدر: الموظف (البوابة الخارجية)`;
      document.getElementById('reviewAbsherNo').textContent = emp.Absher_Number || emp.Mobile_Number || '-';
      document.getElementById('reviewIqamaStatus').textContent = (emp.StoredDocs && emp.StoredDocs['Iqama']) ? '✓ تم الرفع' : 'غير مرفوع';
      document.getElementById('reviewDrivingStatus').textContent = emp.Driving_License_Available === 'Yes' ? ((emp.StoredDocs && emp.StoredDocs['DrivingLicense']) ? '✓ تم الرفع' : 'متوفر ولم يرفع بعد') : 'غير متوفر (لا)';
      document.getElementById('reviewVehicleStatus').textContent = emp.Vehicle_License_Available === 'Yes' ? ((emp.StoredDocs && emp.StoredDocs['VehicleLicense']) ? '✓ تم الرفع' : 'متوفر ولم يرفع بعد') : 'غير متوفر (لا)';
      document.getElementById('reviewForkliftStatus').textContent = emp.Forklift_License_Available === 'Yes' ? ((emp.StoredDocs && emp.StoredDocs['ForkliftLicense']) ? '✓ تم الرفع' : 'متوفر ولم يرفع بعد') : 'غير متوفر (لا)';
    } else {
      reviewBox.style.display = 'none';
    }
  }

  // Cards
  document.getElementById('detIqamaNo').value = emp.Iqama_Number || '';
  document.getElementById('detIqamaExp').value = emp.Iqama_Expiry_Date || '';
  document.getElementById('detIqamaBadge').innerHTML = getStatusBadgeHTML(emp.Iqama_Expiry_Date, 'Yes');
  renderDocPreview('detIqamaPreviewBox', emp.StoredDocs && emp.StoredDocs['Iqama']);

  document.getElementById('detPassNo').value = emp.Passport_Number || '';
  document.getElementById('detPassExp').value = emp.Passport_Expiry_Date || '';
  document.getElementById('detPassportBadge').innerHTML = getStatusBadgeHTML(emp.Passport_Expiry_Date, 'Yes');
  renderDocPreview('detPassPreviewBox', emp.StoredDocs && emp.StoredDocs['Passport']);

  const drvCheck = document.getElementById('detDrvAvail');
  drvCheck.checked = emp.Driving_License_Available === 'Yes';
  document.getElementById('detDrvNo').value = emp.Driving_License_Number || '';
  document.getElementById('detDrvExp').value = emp.Driving_License_Expiry_Date || '';
  document.getElementById('detDrvBadge').innerHTML = getStatusBadgeHTML(emp.Driving_License_Expiry_Date, emp.Driving_License_Available);
  renderDocPreview('detDrvPreviewBox', emp.StoredDocs && (emp.StoredDocs['DrivingLicense'] || emp.StoredDocs['Driving License']));

  const flCheck = document.getElementById('detFlAvail');
  flCheck.checked = emp.Forklift_License_Available === 'Yes';
  document.getElementById('detFlNo').value = emp.Forklift_License_Number || '';
  document.getElementById('detFlExp').value = emp.Forklift_License_Expiry_Date || '';
  document.getElementById('detFlBadge').innerHTML = getStatusBadgeHTML(emp.Forklift_License_Expiry_Date, emp.Forklift_License_Available);
  renderDocPreview('detFlPreviewBox', emp.StoredDocs && (emp.StoredDocs['ForkliftLicense'] || emp.StoredDocs['Forklift License']));

  toggleDetLicenseFields();
  renderActivityTimeline(emp.Employee_ID);

  switchView('employee-details');
}

function toggleDetLicenseFields() {
  const drvCheck = document.getElementById('detDrvAvail');
  document.getElementById('detDrvAvailLabel').textContent = drvCheck.checked ? 'متوفر' : 'لا يوجد';
  document.getElementById('detDrvFields').style.display = drvCheck.checked ? 'block' : 'none';

  const flCheck = document.getElementById('detFlAvail');
  document.getElementById('detFlAvailLabel').textContent = flCheck.checked ? 'متوفر' : 'لا يوجد';
  document.getElementById('detFlFields').style.display = flCheck.checked ? 'block' : 'none';
}

function renderDocPreview(boxId, docData) {
  const box = document.getElementById(boxId);
  if (!box) return;

  if (docData && docData.dataUri) {
    if (docData.isPdf) {
      box.innerHTML = `<a href="${docData.dataUri}" target="_blank" style="color: var(--rassco-turquoise); font-weight: 700;"><i class="fa-solid fa-file-pdf fa-2x"></i><br>فتح ملف الجواز PDF</a>`;
    } else {
      box.innerHTML = `<img src="${docData.dataUri}" class="doc-preview-img" alt="Uploaded Document Preview">`;
    }
  } else {
    box.innerHTML = `<span style="color: var(--text-dim); font-size: 13px;"><i class="fa-solid fa-image"></i> لا توجد صورة مرفوعة بعد</span>`;
  }
}

// Activity Logger Engine (Separating Productive vs View Activity)
function logActivity(type, isProductive, empId, empName, details) {
  const user = state.currentUser || { Full_Name: 'المشرف', Email: 'sup@rassco.com.sa', Role: 'Project Manager' };
  const entry = {
    Timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
    Date: new Date().toISOString().split('T')[0],
    User_Name: user.Full_Name,
    Role: user.Role,
    Employee_ID: empId,
    Employee_Name: empName,
    Type: type,
    IsProductive: isProductive,
    Details: details
  };

  state.activityLogs.unshift(entry);
  localStorage.setItem('rassco_activity_logs', JSON.stringify(state.activityLogs));
}

function renderActivityTimeline(empId) {
  const container = document.getElementById('detActivityTimeline');
  if (!container) return;

  const empLogs = state.activityLogs.filter(l => l.Employee_ID === empId);

  if (empLogs.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-primary); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 13px; color: var(--text-muted);">
        <i class="fa-solid fa-info-circle"></i> تم إنشاء سجل الموظف في النظام عبر عملية الاستيراد الأولية.
      </div>
    `;
    return;
  }

  container.innerHTML = empLogs.map(log => `
    <div style="background: var(--bg-primary); padding: 12px 16px; border-radius: var(--radius-md); border-right: 4px solid var(--rassco-turquoise); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong>${log.User_Name}</strong> (${log.Role}): <span style="color: var(--rassco-turquoise-dark); font-weight: 700;">${log.Details}</span>
      </div>
      <span style="font-size: 12px; color: var(--text-dim);">${log.Timestamp}</span>
    </div>
  `).join('');
}

// Upload & Verified Google Drive Pipeline Simulation
function uploadSpecificDoc(docType) {
  if (!state.activeEmployee) return;

  let fileInputId = 'detIqamaFile';
  let numInputId = 'detIqamaNo';
  let expInputId = 'detIqamaExp';

  if (docType === 'Passport') { fileInputId = 'detPassFile'; numInputId = 'detPassNo'; expInputId = 'detPassExp'; }
  else if (docType === 'Driving License') { fileInputId = 'detDrvFile'; numInputId = 'detDrvNo'; expInputId = 'detDrvExp'; }
  else if (docType === 'Forklift License') { fileInputId = 'detFlFile'; numInputId = 'detFlNo'; expInputId = 'detFlExp'; }

  const fileInput = document.getElementById(fileInputId);
  const docNumber = document.getElementById(numInputId).value;
  const expiryDate = document.getElementById(expInputId).value;

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast(`يرجى اختيار ملف صورة أو PDF لـ ${docType}`, 'warning');
    return;
  }

  const file = fileInput.files[0];
  const isPdf = file.name.endsWith('.pdf');

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUri = e.target.result;

    if (!state.activeEmployee.StoredDocs) state.activeEmployee.StoredDocs = {};
    
    state.activeEmployee.StoredDocs[docType] = {
      dataUri: dataUri,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      isPdf: isPdf,
      driveFileId: 'DRIVE-FILE-' + Date.now()
    };

    const savedImages = JSON.parse(localStorage.getItem('rassco_uploaded_images') || '{}');
    savedImages[state.activeEmployee.Employee_ID] = state.activeEmployee.StoredDocs;
    localStorage.setItem('rassco_uploaded_images', JSON.stringify(savedImages));

    if (docType === 'Iqama') { state.activeEmployee.Iqama_Number = docNumber; state.activeEmployee.Iqama_Expiry_Date = expiryDate; }
    else if (docType === 'Passport') { state.activeEmployee.Passport_Number = docNumber; state.activeEmployee.Passport_Expiry_Date = expiryDate; }
    else if (docType === 'Driving License') { state.activeEmployee.Driving_License_Number = docNumber; state.activeEmployee.Driving_License_Expiry_Date = expiryDate; }
    else if (docType === 'Forklift License') { state.activeEmployee.Forklift_License_Number = docNumber; state.activeEmployee.Forklift_License_Expiry_Date = expiryDate; }

    const comp = calculateCompletionLocal(state.activeEmployee);
    state.activeEmployee.Profile_Completion_Percentage = comp.percentage;
    if (comp.percentage === 100) state.activeEmployee.Filling_Status = 'Completed';
    else state.activeEmployee.Filling_Status = 'In Progress';

    // Log productive activity
    logActivity('Document Uploaded', true, state.activeEmployee.Employee_ID, state.activeEmployee.Employee_Name, `تم رفع مستند ${docType} وصيانته على Google Drive`);

    showToast(`✓ تم رفع وصيانة صورة ${docType} بنجاح إلى Google Drive وحفظها بالنظام`, 'success');
    openEmployeeDetailsPage(state.activeEmployee.Employee_ID);
  };
  reader.readAsDataURL(file);
}

// Master Workflow Feature: Save & Open Next Incomplete Employee (Master Requirement)
function saveAndOpenNextIncomplete() {
  if (!state.activeEmployee) return;

  saveEmployeeDetailsFull();

  // Find next incomplete employee in scope
  const incompleteList = state.employees.filter(e => e.Filling_Status !== 'Completed');
  const nextEmp = incompleteList.find(e => e.Employee_ID !== state.activeEmployee.Employee_ID);

  if (nextEmp) {
    showToast(`تم الحفظ بنجاح! الانتقال القائي للموظف التالي: ${nextEmp.Employee_Name}`, 'success');
    openEmployeeDetailsPage(nextEmp.Employee_ID);
  } else {
    showToast('🎉 تهانينا! تم استكمال جميع الموظفين غير المكتملين بنجاح!', 'success');
  }
}

function saveEmployeeDetailsFull() {
  if (!state.activeEmployee) return;

  const userName = state.currentUser ? state.currentUser.Full_Name : 'المشرف المسؤول';
  const nowStr = new Date().toLocaleString('ar-SA');

  if (!state.activeEmployee.First_Filled_By_Name) {
    state.activeEmployee.First_Filled_By_Name = userName;
    state.activeEmployee.First_Filled_At = nowStr;
  }

  state.activeEmployee.Last_Updated_By_Name = userName;
  state.activeEmployee.Last_Updated_At = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  const { percentage } = calculateCompletionLocal(state.activeEmployee);
  state.activeEmployee.Profile_Completion_Percentage = percentage;

  if (percentage === 100) {
    state.activeEmployee.Filling_Status = 'Completed';
    if (!state.activeEmployee.Completed_By_Name) {
      state.activeEmployee.Completed_By_Name = userName;
      state.activeEmployee.Completed_At = nowStr;
    }
  } else if (percentage > 20) {
    state.activeEmployee.Filling_Status = 'In Progress';
  }

  // Persist updated employee records to localStorage
  localStorage.setItem('rassco_employees_override', JSON.stringify(state.employees));

  logActivity('Employee Updated', true, state.activeEmployee.Employee_ID, state.activeEmployee.Employee_Name, `تحديث بيانات وحالة اكتمال الموظف (${percentage}%)`);
  showToast('✓ تم حفظ كافة بيانات الموظف وتتبع المسؤولية بنجاح', 'success');
}

// Toast Feedback Generator
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--rassco-turquoise);"></i> ${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function renderDocumentsTable() {
  const tbody = document.getElementById('documentsTbody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td>MOHAMED ABDELRAHIM ALNAZIR</td>
      <td><strong>الإقامة (Iqama)</strong></td>
      <td>2477430934</td>
      <td>2027-10-25</td>
      <td><span class="badge badge-valid">ساري</span></td>
      <td><a href="#" style="color: var(--rassco-turquoise); font-weight: 700;"><i class="fa-solid fa-paperclip"></i> فتح المستند من Google Drive</a></td>
      <td>2026-09-07</td>
    </tr>
  `;

  const mobileContainer = ensureMobileCardsContainer('documentsTbody', 'documentsMobileCards');
  if (mobileContainer) {
    mobileContainer.innerHTML = `
      <div class="mobile-card-item">
        <div class="mobile-card-top">
          <div>
            <div class="mobile-card-title">MOHAMED ABDELRAHIM ALNAZIR</div>
            <div class="mobile-card-sub">نوع الوثيقة: الإقامة (Iqama)</div>
          </div>
          <span class="badge badge-valid">ساري</span>
        </div>
        <div class="mobile-card-grid">
          <div class="mobile-card-field">
            <span class="mobile-card-label">رقم الوثيقة</span>
            <span class="mobile-card-value">2477430934</span>
          </div>
          <div class="mobile-card-field">
            <span class="mobile-card-label">تاريخ الانتهاء</span>
            <span class="mobile-card-value">2027-10-25</span>
          </div>
        </div>
        <div class="mobile-card-actions">
          <a href="#" class="btn-primary" style="width: 100%; justify-content: center; text-decoration: none;">
            <i class="fa-solid fa-paperclip"></i> فتح المستند من Google Drive
          </a>
        </div>
      </div>
    `;
  }
}

function renderExpiringTable() {
  const tbody = document.getElementById('expiringTbody');
  if (!tbody) return;
  const expiring = state.employees.filter(e => {
    const d = calculateDaysRemaining(e.Iqama_Expiry_Date);
    return d !== null && d >= 0 && d <= 60;
  });

  const sample = expiring.slice(0, 15);
  tbody.innerHTML = sample.map(e => `
    <tr>
      <td><a href="#" onclick="openEmployeeDetailsPage('${e.Employee_ID}')" style="color: var(--rassco-turquoise); font-weight: 700;">${e.Employee_Name}</a></td>
      <td>${e.Region_Name || '-'}</td>
      <td>${e.Project_Name}</td>
      <td>الإقامة</td>
      <td>${e.Iqama_Expiry_Date}</td>
      <td><strong>${calculateDaysRemaining(e.Iqama_Expiry_Date)} يوم</strong></td>
      <td>${getStatusBadgeHTML(e.Iqama_Expiry_Date, 'Yes')}</td>
      <td><button class="btn-sm btn-primary" onclick="openEmployeeDetailsPage('${e.Employee_ID}')"><i class="fa-solid fa-pen-to-square"></i> تحديث الإقامة</button></td>
    </tr>
  `).join('');

  const mobileContainer = ensureMobileCardsContainer('expiringTbody', 'expiringMobileCards');
  if (mobileContainer) {
    if (sample.length === 0) {
      mobileContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">لا توجد وثائق قريبة من الانتهاء</div>`;
    } else {
      mobileContainer.innerHTML = sample.map(e => `
        <div class="mobile-card-item">
          <div class="mobile-card-top">
            <div>
              <div class="mobile-card-title">${e.Employee_Name}</div>
              <div class="mobile-card-sub">${e.Region_Name || '-'} | ${e.Project_Name}</div>
            </div>
            ${getStatusBadgeHTML(e.Iqama_Expiry_Date, 'Yes')}
          </div>
          <div class="mobile-card-grid">
            <div class="mobile-card-field">
              <span class="mobile-card-label">تاريخ الانتهاء</span>
              <span class="mobile-card-value">${e.Iqama_Expiry_Date}</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">المتبقي</span>
              <span class="mobile-card-value" style="color: #F59E0B;">${calculateDaysRemaining(e.Iqama_Expiry_Date)} يوم</span>
            </div>
          </div>
          <div class="mobile-card-actions">
            <button class="btn-primary" onclick="openEmployeeDetailsPage('${e.Employee_ID}')" style="width: 100%; justify-content: center;">
              <i class="fa-solid fa-pen-to-square"></i> تحديث وتجديد الوثيقة
            </button>
          </div>
        </div>
      `).join('');
    }
  }
}

function renderExpiredTable() {
  const tbody = document.getElementById('expiredTbody');
  if (!tbody) return;
  const expired = state.employees.filter(e => {
    const d = calculateDaysRemaining(e.Iqama_Expiry_Date);
    return d !== null && d < 0;
  });

  const sample = expired.slice(0, 15);
  tbody.innerHTML = sample.map(e => `
    <tr>
      <td><a href="#" onclick="openEmployeeDetailsPage('${e.Employee_ID}')" style="color: var(--rassco-turquoise); font-weight: 700;">${e.Employee_Name}</a></td>
      <td>${e.Region_Name || '-'}</td>
      <td>${e.Project_Name}</td>
      <td>الإقامة</td>
      <td>${e.Iqama_Expiry_Date}</td>
      <td><span class="badge badge-expired">منتهية</span></td>
      <td><button class="btn-sm btn-primary" onclick="openEmployeeDetailsPage('${e.Employee_ID}')"><i class="fa-solid fa-arrows-rotate"></i> تجديد الانتهاء</button></td>
    </tr>
  `).join('');

  const mobileContainer = ensureMobileCardsContainer('expiredTbody', 'expiredMobileCards');
  if (mobileContainer) {
    if (sample.length === 0) {
      mobileContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: #10B981; font-weight: 800;">🎉 لا توجد أي وثائق منتهية حالياً!</div>`;
    } else {
      mobileContainer.innerHTML = sample.map(e => `
        <div class="mobile-card-item">
          <div class="mobile-card-top">
            <div>
              <div class="mobile-card-title">${e.Employee_Name}</div>
              <div class="mobile-card-sub">${e.Region_Name || '-'} | ${e.Project_Name}</div>
            </div>
            <span class="badge badge-expired">منتهية</span>
          </div>
          <div class="mobile-card-grid">
            <div class="mobile-card-field">
              <span class="mobile-card-label">نوع الوثيقة</span>
              <span class="mobile-card-value">الإقامة</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">تاريخ الانتهاء</span>
              <span class="mobile-card-value" style="color: #EF4444;">${e.Iqama_Expiry_Date}</span>
            </div>
          </div>
          <div class="mobile-card-actions">
            <button class="btn-primary" onclick="openEmployeeDetailsPage('${e.Employee_ID}')" style="width: 100%; justify-content: center; background: linear-gradient(135deg, #EF4444, #DC2626);">
              <i class="fa-solid fa-arrows-rotate"></i> تجديد وتحديث الفوري
            </button>
          </div>
        </div>
      `).join('');
    }
  }
}

function renderMissingTable() {
  const tbody = document.getElementById('missingTbody');
  if (!tbody) return;
  const missing = state.employees.filter(e => e.Profile_Completion_Percentage < 100);

  const sample = missing.slice(0, 15);
  tbody.innerHTML = sample.map(e => `
    <tr>
      <td><strong>${e.Employee_Number}</strong></td>
      <td><a href="#" onclick="openEmployeeDetailsPage('${e.Employee_ID}')" style="color: var(--rassco-turquoise); font-weight: 700;">${e.Employee_Name}</a></td>
      <td>${e.Region_Name || '-'}</td>
      <td>${e.Project_Name}</td>
      <td><span style="color: var(--status-critical); font-weight: 700;">${e.Missing_Documents || 'صورة الوثائق'}</span></td>
      <td>${e.Profile_Completion_Percentage}%</td>
      <td><button class="btn-sm btn-primary" onclick="openEmployeeDetailsPage('${e.Employee_ID}')"><i class="fa-solid fa-cloud-arrow-up"></i> استكمال الملف</button></td>
    </tr>
  `).join('');

  const mobileContainer = ensureMobileCardsContainer('missingTbody', 'missingMobileCards');
  if (mobileContainer) {
    if (sample.length === 0) {
      mobileContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: #10B981; font-weight: 800;">🎉 جميع الملفات مكتملة 100%!</div>`;
    } else {
      mobileContainer.innerHTML = sample.map(e => `
        <div class="mobile-card-item">
          <div class="mobile-card-top">
            <div>
              <div class="mobile-card-title">${e.Employee_Name}</div>
              <div class="mobile-card-sub"># ${e.Employee_Number} | ${e.Project_Name}</div>
            </div>
            <span class="badge badge-critical">${e.Profile_Completion_Percentage}%</span>
          </div>
          <div class="mobile-card-grid">
            <div class="mobile-card-field">
              <span class="mobile-card-label">المستندات الناقصة</span>
              <span class="mobile-card-value" style="color: #EF4444;">${e.Missing_Documents || 'صور الوثائق'}</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">المنطقة</span>
              <span class="mobile-card-value">${e.Region_Name || '-'}</span>
            </div>
          </div>
          <div class="mobile-card-actions">
            <button class="btn-primary" onclick="openEmployeeDetailsPage('${e.Employee_ID}')" style="width: 100%; justify-content: center;">
              <i class="fa-solid fa-cloud-arrow-up"></i> استكمال بيانات الملف
            </button>
          </div>
        </div>
      `).join('');
    }
  }
}

function renderProjectsTable() {
  const tbody = document.getElementById('projectsTbody');
  if (!tbody) return;

  const projectsMap = {};
  state.employees.forEach(e => {
    if (!projectsMap[e.Project_Name]) {
      projectsMap[e.Project_Name] = { count: 0, region: e.Region_Name };
    }
    projectsMap[e.Project_Name].count++;
  });

  const names = Object.keys(projectsMap);
  tbody.innerHTML = names.map((pName, idx) => `
    <tr>
      <td>PRJ-${String(idx + 1).padStart(3, '0')}</td>
      <td><strong>${pName}</strong></td>
      <td>${projectsMap[pName].region || 'المنطقة الوسطى'}</td>
      <td>مشرف المشروع</td>
      <td>الموقع المعتمد</td>
      <td><strong>${projectsMap[pName].count} موظف</strong></td>
    </tr>
  `).join('');

  const mobileContainer = ensureMobileCardsContainer('projectsTbody', 'projectsMobileCards');
  if (mobileContainer) {
    mobileContainer.innerHTML = names.map((pName, idx) => `
      <div class="mobile-card-item">
        <div class="mobile-card-top">
          <div>
            <div class="mobile-card-title">${pName}</div>
            <div class="mobile-card-sub">كود المشروع: PRJ-${String(idx + 1).padStart(3, '0')}</div>
          </div>
          <span class="badge badge-valid">${projectsMap[pName].count} موظف</span>
        </div>
        <div class="mobile-card-grid">
          <div class="mobile-card-field">
            <span class="mobile-card-label">المنطقة الرئيسية</span>
            <span class="mobile-card-value">${projectsMap[pName].region || 'المنطقة الوسطى'}</span>
          </div>
          <div class="mobile-card-field">
            <span class="mobile-card-label">المشرف المسؤول</span>
            <span class="mobile-card-value">مشرف المشروع</span>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// State User Management
function initUsersState() {
  const savedUsers = localStorage.getItem('rassco_users_list');
  if (savedUsers) {
    try {
      state.users = JSON.parse(savedUsers);
      return;
    } catch (e) {}
  }

  state.users = [
    { User_ID: 'USR-001', Full_Name: 'المدير العام (RASSCO Admin)', Email: 'admin@rassco.com.sa', Role: 'Super Admin', Status: 'Active', Regions: ['ALL'], Projects: ['ALL'], Last_Login: 'اليوم 08:00 AM', Last_Activity: 'اليوم 04:35 PM' },
    { User_ID: 'USR-002', Full_Name: 'مدير الموارد البشرية', Email: 'hr@rassco.com.sa', Role: 'HR Admin', Status: 'Active', Regions: ['ALL'], Projects: ['ALL'], Last_Login: 'اليوم 09:15 AM', Last_Activity: 'اليوم 04:20 PM' },
    { User_ID: 'USR-003', Full_Name: 'أحمد علي (مشرف القصيم)', Email: 'sup.qassim@rassco.com.sa', Role: 'Regional Supervisor', Status: 'Active', Regions: ['REG-05'], Projects: ['SPL Qassim', 'Warehouse Qassim'], Last_Login: 'اليوم 08:30 AM', Last_Activity: 'اليوم 04:15 PM' },
    { User_ID: 'USR-004', Full_Name: 'محمد صالح (مدير مشروع النمر)', Email: 'pm.nemer@rassco.com.sa', Role: 'Project Manager', Status: 'Active', Regions: ['REG-01'], Projects: ['Al Nemer'], Last_Login: 'اليوم 09:30 AM', Last_Activity: 'اليوم 03:45 PM' }
  ];
  localStorage.setItem('rassco_users_list', JSON.stringify(state.users));
}

// User Management Render Engine
function renderUsersTable() {
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;

  if (!state.users || state.users.length === 0) initUsersState();

  tbody.innerHTML = state.users.map(u => {
    const regNames = (u.Regions || []).map(rId => {
      if (rId === 'ALL') return 'جميع المناطق';
      const locLabel = getLocationLabel(rId);
      return locLabel !== rId ? locLabel : rId;
    }).join(', ');

    const prjNames = (u.Projects || []).join(', ');

    let statusBadge = '<span class="badge badge-valid">نشط</span>';
    if (u.Status === 'Inactive') statusBadge = '<span class="badge badge-expiring">غير نشط</span>';
    else if (u.Status === 'Suspended') statusBadge = '<span class="badge badge-expired">موقوف</span>';

    return `
      <tr>
        <td><strong>${u.Full_Name}</strong><br><span style="font-size: 11px; color: var(--text-dim);">${u.User_ID}</span></td>
        <td>${u.Email}</td>
        <td><span class="badge badge-valid">${u.Role}</span></td>
        <td><span style="font-size: 12px; font-weight: 700; color: var(--rassco-turquoise-dark);">${regNames}</span></td>
        <td><span style="font-size: 12px;">${prjNames}</span></td>
        <td>${u.Last_Login || 'أمس'}</td>
        <td>${u.Last_Activity || 'اليوم'}</td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn-sm btn-primary" onclick="openUserModal('${u.User_ID}')"><i class="fa-solid fa-pen-to-square"></i> الصلاحيات</button>
            <button class="btn-sm btn-secondary" onclick="toggleUserStatus('${u.User_ID}')" title="تغيير الحالة"><i class="fa-solid fa-power-off"></i></button>
            <button class="btn-sm btn-secondary" onclick="deleteUser('${u.User_ID}')" style="color: #EF4444;" title="حذف الحساب"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Mobile Cards View Container for Users
  const mobileCardsContainer = ensureMobileCardsContainer('usersTbody', 'usersMobileCards');
  if (mobileCardsContainer) {
    mobileCardsContainer.innerHTML = state.users.map(u => {
      const regNames = (u.Regions || []).map(rId => rId === 'ALL' ? 'جميع المناطق' : getLocationLabel(rId)).join(', ');
      const prjNames = (u.Projects || []).join(', ');
      return `
        <div class="mobile-card-item">
          <div class="mobile-card-top">
            <div>
              <div class="mobile-card-title">${u.Full_Name}</div>
              <div class="mobile-card-sub">${u.Email}</div>
            </div>
            <span class="badge badge-valid">${u.Role}</span>
          </div>
          <div class="mobile-card-grid">
            <div class="mobile-card-field">
              <span class="mobile-card-label">المناطق المصرحة</span>
              <span class="mobile-card-value" style="color: var(--rassco-turquoise-dark);">${regNames}</span>
            </div>
            <div class="mobile-card-field">
              <span class="mobile-card-label">المشاريع المصرحة</span>
              <span class="mobile-card-value">${prjNames}</span>
            </div>
          </div>
          <div class="mobile-card-actions">
            <button class="btn-secondary" onclick="toggleUserStatus('${u.User_ID}')" title="الحالة"><i class="fa-solid fa-power-off"></i></button>
            <button class="btn-secondary" onclick="deleteUser('${u.User_ID}')" style="color: #EF4444;" title="حذف"><i class="fa-solid fa-trash"></i></button>
            <button class="btn-primary" onclick="openUserModal('${u.User_ID}')"><i class="fa-solid fa-pen-to-square"></i> الصلاحيات</button>
          </div>
        </div>
      `;
    }).join('');
  }
}

// User Modal Logic
function openUserModal(userId = null) {
  const modal = document.getElementById('userModal');
  if (!modal) return;

  const title = document.getElementById('userModalTitle');
  const idInput = document.getElementById('modalUserId');
  const nameInput = document.getElementById('modalUserName');
  const emailInput = document.getElementById('modalUserEmail');
  const passInput = document.getElementById('modalUserPassword');
  const roleSelect = document.getElementById('modalUserRole');
  const statusSelect = document.getElementById('modalUserStatus');

  let user = null;
  if (userId) {
    user = state.users.find(u => u.User_ID === userId);
  }

  if (user) {
    title.textContent = `تعديل المستخدم وصلاحيات الوصول: ${user.Full_Name}`;
    idInput.value = user.User_ID;
    nameInput.value = user.Full_Name;
    emailInput.value = user.Email;
    passInput.value = '';
    roleSelect.value = user.Role;
    statusSelect.value = user.Status || 'Active';
  } else {
    title.textContent = 'إضافة مستخدم جديد وتحديد الصلاحيات والمناطق';
    idInput.value = '';
    nameInput.value = '';
    emailInput.value = '';
    passInput.value = '';
    roleSelect.value = 'Regional Supervisor';
    statusSelect.value = 'Active';
  }

  renderUserAccessCheckboxes(user);
  modal.classList.add('active');
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('active');
}

function toggleSelectAllUserRegions(masterCb) {
  const checkboxes = document.querySelectorAll('input[name="userRegion"]');
  checkboxes.forEach(cb => { cb.checked = masterCb.checked; });
}

function toggleSelectAllUserProjects(masterCb) {
  const checkboxes = document.querySelectorAll('input[name="userProject"]');
  checkboxes.forEach(cb => { cb.checked = masterCb.checked; });
}

function updateMasterSelectAllState() {
  const regCbs = document.querySelectorAll('input[name="userRegion"]');
  const regMaster = document.getElementById('selectAllUserRegions');
  if (regMaster && regCbs.length > 0) {
    regMaster.checked = Array.from(regCbs).every(cb => cb.checked);
  }

  const prjCbs = document.querySelectorAll('input[name="userProject"]');
  const prjMaster = document.getElementById('selectAllUserProjects');
  if (prjMaster && prjCbs.length > 0) {
    prjMaster.checked = Array.from(prjCbs).every(cb => cb.checked);
  }
}

function renderUserAccessCheckboxes(user = null) {
  const regContainer = document.getElementById('modalUserRegionsCheckboxes');
  const prjContainer = document.getElementById('modalUserProjectsCheckboxes');

  // Use actual locations from imported employee data, or standard fallback locations
  let locationsToDisplay = getAvailableLocations();
  if (locationsToDisplay.length === 0) {
    locationsToDisplay = [
      { id: 'RUH', label: 'المنطقة الوسطى (الرياض)', count: 0 },
      { id: 'JED', label: 'المنطقة الغربية (جدة)', count: 0 },
      { id: 'KHOBAR', label: 'المنطقة الشرقية (الخبر)', count: 0 },
      { id: 'DAM', label: 'المنطقة الشرقية (الدمام)', count: 0 },
      { id: 'ABHA', label: 'المنطقة الجنوبية (أبها)', count: 0 },
      { id: 'QAS', label: 'منطقة القصيم (بريدة وعنيزة)', count: 0 },
      { id: 'HAIL', label: 'المنطقة الشمالية (حائل)', count: 0 },
      { id: 'MAD', label: 'المنطقة الغربية (المدينة المنورة)', count: 0 }
    ];
  }

  const userRegs = user ? (user.Regions || []) : [];
  const userPrjs = user ? (user.Projects || []) : [];

  regContainer.innerHTML = locationsToDisplay.map(loc => `
    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
      <input type="checkbox" name="userRegion" value="${loc.id}" ${userRegs.includes(loc.id) || userRegs.includes('ALL') ? 'checked' : ''} onchange="updateMasterSelectAllState()">
      <span><strong>${loc.label || loc.id}</strong> ${loc.count ? `<span style="color: var(--text-dim); font-size: 11px;">(${loc.count} موظف)</span>` : ''}</span>
    </label>
  `).join('');

  // Default projects list merged with any projects present in state.employees
  const defaultProjects = ['Al Nemer', 'SPL Qassim', 'Warehouse Qassim', 'Amazon', 'DHL', 'Bulgari', 'Dior', 'Al Zain', 'JED - First Mile'];
  const empProjects = state.employees.map(e => e.Project_Name).filter(Boolean);
  const projectList = Array.from(new Set([...defaultProjects, ...empProjects])).sort((a, b) => a.localeCompare(b, 'ar'));

  prjContainer.innerHTML = projectList.map(pName => `
    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
      <input type="checkbox" name="userProject" value="${pName}" ${userPrjs.includes(pName) || userPrjs.includes('ALL') ? 'checked' : ''} onchange="updateMasterSelectAllState()">
      ${pName}
    </label>
  `).join('');

  updateMasterSelectAllState();
}

function handleUserRoleModalChange() {
  const role = document.getElementById('modalUserRole').value;
  const scopeGroup = document.getElementById('modalUserAccessScopeGroup');
  if (role === 'Super Admin' || role === 'HR Admin') {
    scopeGroup.style.opacity = '0.5';
  } else {
    scopeGroup.style.opacity = '1';
  }
}

function saveUserForm(e) {
  if (e) e.preventDefault();

  const userId = document.getElementById('modalUserId').value;
  const name = document.getElementById('modalUserName').value.trim();
  const email = document.getElementById('modalUserEmail').value.trim();
  const role = document.getElementById('modalUserRole').value;
  const status = document.getElementById('modalUserStatus').value;

  const selectedRegs = Array.from(document.querySelectorAll('input[name="userRegion"]:checked')).map(cb => cb.value);
  const selectedPrjs = Array.from(document.querySelectorAll('input[name="userProject"]:checked')).map(cb => cb.value);

  if (userId) {
    const existing = state.users.find(u => u.User_ID === userId);
    if (existing) {
      existing.Full_Name = name;
      existing.Email = email;
      existing.Role = role;
      existing.Status = status;
      existing.Regions = (role === 'Super Admin' || role === 'HR Admin') ? ['ALL'] : selectedRegs;
      existing.Projects = (role === 'Super Admin' || role === 'HR Admin') ? ['ALL'] : selectedPrjs;
      showToast(`✓ تم تحديث بيانات وصلاحيات المستخدم ${name} بنجاح`, 'success');
    }
  } else {
    const newId = 'USR-' + String(state.users.length + 1).padStart(3, '0');
    state.users.push({
      User_ID: newId,
      Full_Name: name,
      Email: email,
      Role: role,
      Status: status,
      Regions: (role === 'Super Admin' || role === 'HR Admin') ? ['ALL'] : selectedRegs,
      Projects: (role === 'Super Admin' || role === 'HR Admin') ? ['ALL'] : selectedPrjs,
      Last_Login: 'لم يدخل بعد',
      Last_Activity: 'تم الإنشاء حديثاً'
    });
    showToast(`✓ تم إضافة المستخدم الجديد ${name} وتعيين صلاحيات Access Table بنجاح`, 'success');
  }

  localStorage.setItem('rassco_users_list', JSON.stringify(state.users));
  closeUserModal();
  renderUsersTable();
  renderSupervisorPerformanceView();
}

function toggleUserStatus(userId) {
  const user = state.users.find(u => u.User_ID === userId);
  if (!user) return;

  if (user.Status === 'Active') user.Status = 'Inactive';
  else if (user.Status === 'Inactive') user.Status = 'Suspended';
  else user.Status = 'Active';

  localStorage.setItem('rassco_users_list', JSON.stringify(state.users));
  renderUsersTable();
  showToast(`تغيرت حالة حساب ${user.Full_Name} إلى: ${user.Status}`, 'info');
}

function deleteUser(userId) {
  if (confirm('هل أنت تأكد من رغبتك في حذف حساب هذا المستخدم؟')) {
    state.users = state.users.filter(u => u.User_ID !== userId);
    localStorage.setItem('rassco_users_list', JSON.stringify(state.users));
    renderUsersTable();
    showToast('تم حذف المستخدم بنجاح', 'success');
  }
}

// Template-Aware Excel Import Engine
let parsedImportData = null;

function downloadExcelTemplate() {
  let csv = 'No,Name,ID_Number,EMP,Project_Name,Location\n';
  csv += '1,ASADUZAMAN SAWKATHOSSAIN,2160564056,1456,Al Nemer,RUH\n';
  csv += '2,MOHAMED ABDELRAHIM ALNAZIR,2477430934,1457,SPL Qassim,QAS\n';

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', 'Employees List.xlsx');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('✓ تم تنزيل القالب المعتمد Employees List.xlsx بنجاح', 'success');
}

function handleExcelFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      let workbook;
      if (typeof XLSX !== 'undefined') {
        workbook = XLSX.read(data, { type: 'array' });
      }

      parseExcelWorkbook(workbook, file);
    } catch (err) {
      console.error('Excel parse error:', err);
      showToast('خطأ في قراءة ملف Excel، يرجى التأكد من اختيار ملف .xlsx صالح', 'critical');
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * parseExcelWorkbook — reads ALL sheets with columns:
 *   #  |  Name  |  ID_Number  |  EMP  |  Project_Name  |  Location
 * All three sheets share the same structure:
 *   Professional Cleaning (79 rows)
 *   Man & Van             (284 rows)
 *   ManPower              (1168 rows)
 * Source of Truth: the raw Location and Project_Name values from Excel.
 * NO defaults, NO fallbacks, NO translation of location names.
 */
function parseExcelWorkbook(workbook, file) {
  let allRows = [];
  let sheetNamesFound = [];
  const sheetStats = [];

  if (workbook && workbook.SheetNames) {
    sheetNamesFound = workbook.SheetNames;

    sheetNamesFound.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      // Use header:1 to get raw row arrays, then detect columns ourselves
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rawData.length < 2) return;

      // Find header row (first row with 'Name' or 'Location')
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(5, rawData.length); i++) {
        const row = rawData[i].map(c => String(c || '').trim());
        if (row.includes('Name') || row.includes('Location')) { headerRowIdx = i; break; }
      }

      const headers = rawData[headerRowIdx].map(c => String(c || '').trim());

      // Column indices from ACTUAL Excel headers
      const nameIdx    = headers.indexOf('Name');
      const idIdx      = headers.indexOf('ID_Number');
      const empIdx     = headers.indexOf('EMP');
      const projIdx    = headers.indexOf('Project_Name');
      const locIdx     = headers.indexOf('Location');
      const seqIdx     = headers.indexOf('#');

      let sheetCount = 0;
      for (let i = headerRowIdx + 1; i < rawData.length; i++) {
        const row = rawData[i];
        const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim().replace(/^\r?\n/, '').trim() : '';
        const loc  = locIdx  >= 0 ? String(row[locIdx]  || '').trim() : '';
        const proj = projIdx >= 0 ? String(row[projIdx] || '').trim() : '';

        // Skip empty rows (no name and no EMP)
        const emp = empIdx >= 0 ? String(row[empIdx] || '').trim() : '';
        if (!name && !emp) continue;

        // Key rule: DO NOT substitute missing location with anything
        // If Location is empty, mark it as '' — do not guess
        allRows.push({
          Name:         name,
          ID_Number:    idIdx  >= 0 ? String(row[idIdx]  || '').trim() : '',
          EMP:          emp,
          Project_Name: proj,   // EXACT value from Excel — never substitute
          Location:     loc,    // EXACT value from Excel — never substitute
          Sheet_Source: sheetName
        });
        sheetCount++;
      }
      sheetStats.push({ sheet: sheetName, count: sheetCount });
    });
  }

  // Only keep rows that have at least a Name or EMP number
  const validRows = allRows.filter(r => r.Name.length > 1 || r.EMP.length > 0);

  if (validRows.length === 0) {
    showToast('الملف لا يحتوي على صفوف بيانات صالحة. تأكد من أن الأعمدة: Name, EMP, Project_Name, Location موجودة.', 'critical');
    return;
  }

  // Build preview data
  let newCount = 0, updateCount = 0;
  const existingMap = {};
  state.employees.forEach(e => {
    if (e.Employee_Number) existingMap[String(e.Employee_Number)] = true;
    if (e.Iqama_Number)    existingMap[String(e.Iqama_Number)]    = true;
  });

  const processedRows = validRows.map((r, index) => {
    const isExisting = existingMap[r.EMP] || existingMap[r.ID_Number];
    if (isExisting) updateCount++; else newCount++;
    return { ...r, index: index + 1, Status: isExisting ? 'تحديث' : 'جديد' };
  });

  parsedImportData = {
    fileName: file.name,
    sheetNames: sheetNamesFound,
    sheetStats,
    totalRows: processedRows.length,
    newCount,
    updateCount,
    rows: processedRows
  };

  // Show status box
  const statusBox = document.getElementById('excelTemplateStatusBox');
  if (statusBox) {
    statusBox.style.display = 'block';
    statusBox.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <h4 style="font-size:16px;font-weight:800;color:var(--rassco-turquoise);">
            <i class="fa-solid fa-file-circle-check"></i> ${file.name}
          </h4>
          <p style="font-size:13px;color:var(--text-muted);margin-top:4px;">
            Sheets: <strong>${sheetStats.map(s => `${s.sheet} (${s.count})`).join(' | ')}</strong>
            &nbsp;|&nbsp; الإجمالي: <strong>${processedRows.length} موظف</strong>
          </p>
          <p style="font-size:12px;color:var(--text-dim);margin-top:2px;">
            المناطق المكتشفة: <strong>${[...new Set(processedRows.map(r => r.Location).filter(Boolean))].sort().join(' · ')}</strong>
          </p>
        </div>
        <span class="badge badge-valid" style="font-size:14px;padding:8px 16px;">
          <i class="fa-solid fa-circle-check"></i> القالب الرسمي متوافق ✓
        </span>
      </div>
    `;
  }

  const els = { total: 'prevStatTotal', newC: 'prevStatNew', upd: 'prevStatUpdate', dup: 'prevStatDuplicates' };
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('prevStatTotal',      processedRows.length.toLocaleString('ar-SA'));
  setEl('prevStatNew',        newCount.toLocaleString('ar-SA'));
  setEl('prevStatUpdate',     updateCount.toLocaleString('ar-SA'));
  setEl('prevStatDuplicates', '0');

  const previewTbody = document.getElementById('excelPreviewTbody');
  if (previewTbody) {
    previewTbody.innerHTML = processedRows.slice(0, 20).map(r => `
      <tr>
        <td>${r.index}</td>
        <td><strong>${r.Name}</strong></td>
        <td>${r.EMP}</td>
        <td>${r.ID_Number}</td>
        <td><strong>${r.Project_Name}</strong></td>
        <td><strong>${r.Location}</strong></td>
        <td><span class="badge ${r.Status === 'جديد' ? 'badge-valid' : 'badge-expiring'}">${r.Status}</span></td>
      </tr>
    `).join('');
  }

  const previewContainer = document.getElementById('excelPreviewContainer');
  if (previewContainer) previewContainer.style.display = 'block';

  showToast(`✓ تم فحص الملف: ${processedRows.length} موظف من ${sheetNamesFound.length} sheets`, 'success');
}

function cancelExcelImport() {
  parsedImportData = null;
  const statusBox = document.getElementById('excelTemplateStatusBox');
  if (statusBox) statusBox.style.display = 'none';
  const previewContainer = document.getElementById('excelPreviewContainer');
  if (previewContainer) previewContainer.style.display = 'none';
  const fileInput = document.getElementById('excelFileInput');
  if (fileInput) fileInput.value = '';
  showToast('تم إلغاء عملية الاستيراد', 'info');
}

/**
 * confirmExcelImport — FULL REPLACE of employee data from Excel.
 * Strategy: REPLACE ALL (not merge) so that deleted employees in Excel
 * are also removed from the system. Uses raw Location and Project_Name
 * values from Excel without any translation.
 */
function confirmExcelImport() {
  if (!parsedImportData || !parsedImportData.rows || parsedImportData.rows.length === 0) {
    showToast('لا توجد بيانات لاستيرادها', 'warning');
    return;
  }

  showToast(`⏳ جاري حفظ واستيراد ${parsedImportData.rows.length} موظف إلى Google Sheets والقاعدة المركزية...`, 'info');

  const payloadEmployees = parsedImportData.rows.map((r, idx) => ({
    id: (r.EMP || '').trim() || `EMP-${String(idx + 1).padStart(5, '0')}`,
    name: (r.Name || '').trim(),
    iqamaNumber: (r.ID_Number || '').trim(),
    jobTitle: '',
    region: (r.Location || '').trim(),
    project: (r.Project_Name || '').trim(),
    nationality: '',
    absherNumber: '',
    phone: '',
    status: 'غير مكتمل',
    portalStatus: 'في الانتظار'
  }));

  fetch('/api/excel/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employees: payloadEmployees })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showToast(`🎉 تم حفظ واستيراد ${data.importedCount || payloadEmployees.length} موظف بنجاح في Google Sheets والإنتاج!`, 'success');
      cancelExcelImport();
      loadData();
      switchView('employees');
    } else {
      showToast(`❌ خطأ أثناء الاستيراد: ${data.error || 'تعذر الإكمال'}`, 'error');
    }
  })
  .catch(err => {
    console.error('Excel import server error:', err);
    showToast('❌ تعذر حفظ الاستيراد على الخادم المركزي. يرجى إعادة المحاولة.', 'error');
  });
}

// Template Preserving Export Engine
function exportDataToOfficialExcel() {
  if (!state.employees || state.employees.length === 0) {
    showToast('لا توجد بيانات موظفين للتصدير، قم باستيراد ملف Excel أولاً', 'warning');
    return;
  }

  try {
    const exportRows = state.employees.map((e, idx) => ({
      '#': idx + 1,
      'Name': e.Employee_Name,
      'ID_Number': e.Iqama_Number,
      'EMP': e.Employee_Number,
      'Project_Name': e.Project_Name,
      'Location': e.Region_Name,
      'Iqama_Expiry_Date': e.Iqama_Expiry_Date || 'غير محدد',
      'Passport_Number': e.Passport_Number || '-',
      'Passport_Expiry_Date': e.Passport_Expiry_Date || 'غير محدد',
      'Driving_License': e.Driving_License_Available,
      'Driving_License_Number': e.Driving_License_Number || '-',
      'Driving_License_Expiry': e.Driving_License_Expiry_Date || '-',
      'Forklift_License': e.Forklift_License_Available,
      'Forklift_License_Number': e.Forklift_License_Number || '-',
      'Forklift_License_Expiry': e.Forklift_License_Expiry_Date || '-',
      'Profile_Status': e.Filling_Status,
      'Completion_%': e.Profile_Completion_Percentage + '%',
      'Missing_Data': e.Missing_Documents || 'مكتمل بالكامل',
      'Filled_By': e.First_Filled_By_Name || 'System Migration',
      'Last_Updated_By': e.Last_Updated_By_Name || 'المشرف',
      'Last_Updated_Date': e.Last_Updated_At || 'اليوم'
    }));

    let wb;
    if (typeof XLSX !== 'undefined') {
      wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);
      XLSX.utils.book_append_sheet(wb, ws, 'RASSCO Employees Master');
      XLSX.writeFile(wb, 'تقرير_موظفي_شركة_راس_السعودية_المحدودة_RASSCO.xlsx');
    } else {
      exportReportsCSV();
      return;
    }

    logActivity('Excel Exported', true, '', '', `تصدير ${state.employees.length} موظف إلى ملف Excel (.xlsx) رسمياً`);
    showToast('✓ تم تصدير كافة البيانات إلى ملف Excel (.xlsx) رسمياً بنجاح', 'success');
  } catch (err) {
    console.error('Export error:', err);
    exportReportsCSV();
  }
}

function exportReportsCSV() {
  exportDataToOfficialExcel();
}

// Data Removal & Backup Protection (Super Admin Only)
function openRemoveAllEmployeesModal() {
  if (state.currentUser && state.currentUser.Role !== 'Super Admin') {
    showToast('عفواً! هذه الخاصية مخصصة فقط للمدير العام (Super Admin)', 'warning');
    return;
  }

  document.getElementById('removeEmployeesConfirmInput').value = '';
  document.getElementById('removeEmployeesModal').classList.add('active');
}

function closeRemoveEmployeesModal() {
  document.getElementById('removeEmployeesModal').classList.remove('active');
}

function confirmRemoveAllEmployeeData() {
  const confirmInput = document.getElementById('removeEmployeesConfirmInput').value.trim();
  if (confirmInput !== 'حذف جميع بيانات الموظفين' && confirmInput !== 'DELETE ALL EMPLOYEES') {
    showToast('يرجى كتابة نص التأكيد المطلوب بالضبط لحذف البيانات', 'warning');
    return;
  }

  try {
    const backupId = 'BACKUP-EMP-' + Date.now();
    const backupSnapshot = {
      Backup_ID: backupId,
      Created_At: new Date().toISOString(),
      Created_By: state.currentUser ? state.currentUser.Email : 'Super Admin',
      EmployeeCount: state.employees.length,
      EmployeesData: state.employees
    };

    localStorage.setItem('rassco_backup_snapshot_' + backupId, JSON.stringify(backupSnapshot));
    localStorage.setItem('rassco_latest_backup_id', backupId);

    fetch('/api/employees', { method: 'DELETE' })
      .then(res => res.json())
      .then(data => {
        state.employees = [];
        localStorage.removeItem('rassco_employees_override');
        logActivity('All Employee Data Deleted', true, '', '', `إزالة كافة بيانات الموظفين مع إنشاء نسخة احتياطية: ${backupId}`);
        closeRemoveEmployeesModal();
        renderCurrentView();
        showToast(`✓ تم إنشاء النسخة الاحتياطية (${backupId}) وإزالة كافة بيانات الموظفين بنجاح من السيرفر`, 'success');
      })
      .catch(err => {
        console.error('Server delete all employees error:', err);
        showToast('❌ تعذر إرسال أمر مسح البيانات إلى السيرفر الرئيسي', 'error');
      });
  } catch (err) {
    console.error('Backup creation failed:', err);
    showToast('فشل إنشاء النسخة الاحتياطية الاحترازية، تم إلغاء عملية الحذف للحفاظ على سلامة البيانات', 'critical');
  }
}

function openFullSystemResetModal() {
  if (state.currentUser && state.currentUser.Role !== 'Super Admin') {
    showToast('عفواً! هذه الخاصية مخصصة فقط للمدير العام (Super Admin)', 'warning');
    return;
  }

  document.getElementById('fullResetConfirmInput').value = '';
  document.getElementById('fullResetModal').classList.add('active');
}

function closeFullResetModal() {
  document.getElementById('fullResetModal').classList.remove('active');
}

function confirmFullSystemReset() {
  const input = document.getElementById('fullResetConfirmInput').value.trim();
  if (input !== 'FULL SYSTEM RESET') {
    showToast('يرجى كتابة FULL SYSTEM RESET للتأكيد', 'warning');
    return;
  }

  fetch('/api/employees', { method: 'DELETE' }).catch(e => console.error(e));
  localStorage.removeItem('rassco_employees_override');
  localStorage.removeItem('rassco_users_list');
  localStorage.removeItem('rassco_uploaded_images');
  localStorage.removeItem('rassco_activity_logs');

  state.employees = [];
  closeFullResetModal();
  renderCurrentView();
  showToast('✓ تم إعادة ضبط النظام بالكامل وإزالة كافة البيانات من السيرفر', 'success');
}

// Manual Employee Creation
function openNewEmployeeModal() {
  document.getElementById('newEmpName').value = '';
  document.getElementById('newEmpNumber').value = '';
  document.getElementById('newEmpIqama').value = '';

  // Populate location dropdown from actual imported employee data
  const locSelect = document.getElementById('newEmpRegion');
  const locations = getAvailableLocations();

  if (locations.length > 0) {
    locSelect.innerHTML = locations.map(loc =>
      `<option value="${loc.id}">${loc.label} (${loc.count})</option>`
    ).join('');
  } else {
    // Fallback to static regions if no data imported
    locSelect.innerHTML = `
      <option value="RUH">المنطقة الوسطى (الرياض) - RUH</option>
      <option value="JED">المنطقة الغربية (جدة) - JED</option>
      <option value="KHOBAR">المنطقة الشرقية (الخبر) - KHOBAR</option>
      <option value="DAM">المنطقة الشرقية (الدمام) - DAM</option>
      <option value="ABHA">المنطقة الجنوبية (أبها) - ABHA</option>
      <option value="QAS">منطقة القصيم - QAS</option>
      <option value="HAIL">المنطقة الشمالية (حائل) - HAIL</option>
    `;
  }

  // Populate project dropdown from actual data
  const prjInput = document.getElementById('newEmpProject');
  const projectNamesSet = new Set(state.employees.map(e => e.Project_Name).filter(Boolean));
  if (projectNamesSet.size > 0) {
    prjInput.value = Array.from(projectNamesSet)[0];
  } else {
    prjInput.value = 'Al Nemer';
  }

  document.getElementById('employeeModal').classList.add('active');
}

function closeNewEmployeeModal() {
  document.getElementById('employeeModal').classList.remove('active');
}

function saveNewEmployeeForm(e) {
  if (e) e.preventDefault();

  const name = document.getElementById('newEmpName').value.trim();
  const empNo = document.getElementById('newEmpNumber').value.trim();
  const iqama = document.getElementById('newEmpIqama').value.trim();
  const locId = document.getElementById('newEmpRegion').value;
  const project = document.getElementById('newEmpProject').value.trim();

  // Use actual Location value from dropdown
  const regionLabel = getLocationLabel(locId);

  const newEmpId = String(10000 + state.employees.length + 1);

  state.employees.unshift({
    Employee_ID: newEmpId,
    Employee_Number: empNo,
    Employee_Name: name,
    Nationality: 'سعودي / مقيم',
    Job_Title: 'خدمات لوجستية',
    Location: locId,
    Region_ID: locId,
    Region_Name: regionLabel,
    Project_ID: 'PRJ-001',
    Project_Name: project,
    Mobile_Number: '0500000000',
    Iqama_Number: iqama,
    Iqama_Expiry_Date: '',
    Passport_Number: '',
    Passport_Expiry_Date: '',
    Driving_License_Available: 'No',
    Forklift_License_Available: 'No',
    Employee_Status: 'Active',
    Filling_Status: 'Not Started',
    Profile_Completion_Percentage: 20,
    Missing_Documents: 'الإقامة، الجواز',
    First_Filled_By_Name: state.currentUser ? state.currentUser.Full_Name : 'المشرف',
    Last_Updated_By_Name: state.currentUser ? state.currentUser.Full_Name : 'المشرف',
    Last_Updated_At: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
    StoredDocs: {}
  });

  localStorage.setItem('rassco_employees_override', JSON.stringify(state.employees));
  logActivity('Employee Created', true, newEmpId, name, 'إضافة موظف جديد يدوياً');

  closeNewEmployeeModal();
  populateRegionAndProjectDropdowns();
  renderCurrentView();
  showToast(`✓ تم إضافة الموظف الجديد: ${name} بنجاح`, 'success');
}

// ==========================================================================
// EMPLOYEE SELF-SERVICE EXTERNAL PORTAL & NOTIFICATION BELL SYSTEM
// ==========================================================================

state.portalInvites = JSON.parse(localStorage.getItem('rassco_portal_invites') || '{}');
state.notifications = JSON.parse(localStorage.getItem('rassco_notifications') || '[]');
state.activePortalInvite = null;
state.activePortalEmployee = null;
state.portalRateLimit = { attempts: 0, lockedUntil: 0 };
state.portalSelectedDocs = {};

function checkPortalHashRoute() {
  const hash = window.location.hash;
  if (hash.includes('portal')) {
    initPortalView();
  }
}

function initPortalView() {
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.style.display = 'none';

  const sidebar = document.getElementById('sidebar');
  const header = document.querySelector('.top-header');
  if (sidebar) sidebar.style.display = 'none';
  if (header) header.style.display = 'none';

  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.style.marginRight = '0';
    mainContent.style.width = '100%';
    mainContent.style.padding = '0';
  }

  document.querySelectorAll('.view-page').forEach(p => p.classList.remove('active'));
  const portalView = document.getElementById('view-employee-portal');
  if (portalView) portalView.classList.add('active');

  document.getElementById('portalVerificationStep').style.display = 'block';
  document.getElementById('portalFormStep').style.display = 'none';
  document.getElementById('portalSuccessStep').style.display = 'none';
  document.getElementById('portalVerifyErrorMsg').style.display = 'none';
  document.getElementById('portalIqamaInput').value = '';

  state.activePortalEmployee = null;
  state.portalRateLimit = state.portalRateLimit || { attempts: 0, lockedUntil: 0 };
}

function copyGenericPortalLink() {
  const portalUrl = `${window.location.origin}${window.location.pathname}#portal`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(portalUrl).then(() => {
      showToast('✓ تم نسخ رابط بوابة الموظفين بنجاح!', 'success');
    }).catch(() => {
      fallbackCopyText(portalUrl);
    });
  } else {
    fallbackCopyText(portalUrl);
  }
}

function fallbackCopyText(text) {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
  showToast('✓ تم نسخ رابط بوابة الموظفين بنجاح!', 'success');
}

function openPortalDirectly() {
  const portalUrl = `${window.location.origin}${window.location.pathname}#portal`;
  window.open(portalUrl, '_blank');
}

function updatePortalDashboardStats() {
  const awaitingEl = document.getElementById('portalStatAwaiting');
  const startedEl = document.getElementById('portalStatStarted');
  const submittedEl = document.getElementById('portalStatSubmitted');
  const pendingReviewEl = document.getElementById('portalStatPendingReview');

  if (!awaitingEl || !state.employees) return;

  const awaiting = state.employees.filter(e => !e.Portal_Status || e.Portal_Status === 'Not Started' || e.Portal_Status === 'Awaiting Employee').length;
  const started = state.employees.filter(e => e.Portal_Status === 'Employee Started' || e.Portal_Status === 'Employee Uploading').length;
  const submitted = state.employees.filter(e => e.Portal_Status === 'Submitted By Employee').length;
  const pendingReview = state.employees.filter(e => e.Portal_Status === 'Submitted By Employee' || e.Portal_Status === 'Pending Supervisor Review').length;

  awaitingEl.textContent = awaiting.toLocaleString('ar-SA');
  startedEl.textContent = started.toLocaleString('ar-SA');
  submittedEl.textContent = submitted.toLocaleString('ar-SA');
  pendingReviewEl.textContent = pendingReview.toLocaleString('ar-SA');
}

async function verifyPortalIqama() {
  const errBox = document.getElementById('portalVerifyErrorMsg');
  errBox.style.display = 'none';

  state.portalRateLimit = state.portalRateLimit || { attempts: 0, lockedUntil: 0 };

  if (state.portalRateLimit.attempts >= 5 && Date.now() < state.portalRateLimit.lockedUntil) {
    const remSec = Math.ceil((state.portalRateLimit.lockedUntil - Date.now()) / 1000);
    errBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> تم تجاوز عدد المحاولات المسموحة. يرجى الانتظار ${remSec} ثانية قبل المحاولة مجدداً.`;
    errBox.style.display = 'block';
    return;
  }

  const rawInput = (document.getElementById('portalIqamaInput').value || '').trim();
  const cleanInput = rawInput.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();

  if (!cleanInput) {
    errBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> يرجى إدخال رقم الإقامة أو الرقم الوظيفي.`;
    errBox.style.display = 'block';
    return;
  }

  // 1. First attempt local state match
  const normalizeNum = (s) => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
  const targetNorm = normalizeNum(cleanInput);

  let matchedEmp = (state.employees || []).find(e => {
    const iqamaNorm = normalizeNum(e.iqamaNumber || e.Iqama_Number || e.ID_Number);
    const idNorm = normalizeNum(e.id || e.Employee_ID || e.Employee_Number);
    return (targetNorm && (iqamaNorm === targetNorm || idNorm === targetNorm)) ||
           String(e.iqamaNumber || e.Iqama_Number || '').trim() === cleanInput ||
           String(e.id || e.Employee_ID || '').trim() === cleanInput;
  });

  // 2. If not found in local cache, call backend server API /api/portal/verify-iqama
  if (!matchedEmp) {
    try {
      const res = await fetch('/api/portal/verify-iqama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iqamaNumber: cleanInput })
      });
      const data = await res.json();
      if (data.success && data.employee) {
        matchedEmp = {
          Employee_ID: data.employee.id,
          Employee_Number: data.employee.id,
          Employee_Name: data.employee.name,
          Iqama_Number: data.employee.iqamaNumber,
          Job_Title: data.employee.jobTitle,
          Region_ID: data.employee.region,
          Location: data.employee.region,
          Project_Name: data.employee.project,
          Nationality: data.employee.nationality,
          Absher_Number: data.employee.absherNumber,
          Portal_Status: data.employee.portalStatus
        };
      }
    } catch (e) {
      console.warn('Backend verify API fallback:', e);
    }
  }

  if (matchedEmp) {
    state.activePortalEmployee = matchedEmp;
    state.portalRateLimit.attempts = 0;

    matchedEmp.Portal_Status = (matchedEmp.Portal_Status === 'Awaiting Employee' || !matchedEmp.Portal_Status) ? 'Employee Started' : matchedEmp.Portal_Status;
    logActivity('Iqama Verified (Employee Portal)', true, matchedEmp.Employee_ID || matchedEmp.id, matchedEmp.Employee_Name || matchedEmp.name, 'تم التحقق بنجاح من رقم الإقامة');

    document.getElementById('portalVerificationStep').style.display = 'none';
    document.getElementById('portalFormStep').style.display = 'block';
    renderEmployeePortalForm();
  } else {
    state.portalRateLimit.attempts++;
    if (state.portalRateLimit.attempts >= 5) {
      state.portalRateLimit.lockedUntil = Date.now() + 60000;
    }
    errBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> تعذر التحقق من البيانات المدخلة. يرجى التأكد من رقم الإقامة والمحاولة مرة أخرى.`;
    errBox.style.display = 'block';
    logActivity('Iqama Verification Failed (Employee Portal)', false, null, null, `رقم إقامة غير مطابق: ${rawInput}`);
  }
}

function renderEmployeePortalForm() {
  const emp = state.activePortalEmployee;
  if (!emp) return;

  document.getElementById('portalEmpName').textContent = emp.Employee_Name;
  document.getElementById('portalEmpSub').textContent = `الرقم الوظيفي: ${emp.Employee_Number} | رقم الإقامة: ${maskIqamaNumber(emp.Iqama_Number)}`;
  document.getElementById('portalEmpRegion').textContent = getLocationLabel(emp.Location || emp.Region_ID);
  document.getElementById('portalEmpProject').textContent = emp.Project_Name || '-';
  document.getElementById('portalEmpSupervisor').textContent = emp.First_Filled_By_Name || 'المشرف المسؤول';
  document.getElementById('portalEmpNationality').textContent = emp.Nationality || 'سعودي / مقيم';

  document.getElementById('portalAbsherInput').value = emp.Absher_Number || emp.Mobile_Number || '';

  const reuploadAlert = document.getElementById('portalReuploadAlert');
  if (emp.Portal_Reupload_Requested && emp.Portal_Reupload_Reason) {
    document.getElementById('portalReuploadReason').textContent = `السبب الإداري: ${emp.Portal_Reupload_Reason} (${emp.Portal_Reupload_Doc || 'الوثيقة'})`;
    reuploadAlert.style.display = 'block';
  } else {
    reuploadAlert.style.display = 'none';
  }

  document.getElementById('portalDrivingToggle').value = emp.Driving_License_Available === 'Yes' ? 'Yes' : 'No';
  document.getElementById('portalVehicleToggle').value = emp.Vehicle_License_Available === 'Yes' ? 'Yes' : 'No';
  document.getElementById('portalForkliftToggle').value = emp.Forklift_License_Available === 'Yes' ? 'Yes' : 'No';

  togglePortalDocCard('DrivingLicense');
  togglePortalDocCard('VehicleLicense');
  togglePortalDocCard('ForkliftLicense');

  updatePortalDocCardUI('Iqama');
  updatePortalDocCardUI('DrivingLicense');
  updatePortalDocCardUI('VehicleLicense');
  updatePortalDocCardUI('ForkliftLicense');
}

function maskIqamaNumber(iqama) {
  if (!iqama || iqama.length < 6) return 'XXXXXX';
  return iqama.substring(0, 3) + '****' + iqama.substring(iqama.length - 3);
}

function togglePortalDocCard(docType) {
  let cardId = '';
  let toggleId = '';
  if (docType === 'DrivingLicense') { cardId = 'portalDrivingCard'; toggleId = 'portalDrivingToggle'; }
  if (docType === 'VehicleLicense') { cardId = 'portalVehicleCard'; toggleId = 'portalVehicleToggle'; }
  if (docType === 'ForkliftLicense') { cardId = 'portalForkliftCard'; toggleId = 'portalForkliftToggle'; }

  const card = document.getElementById(cardId);
  const toggle = document.getElementById(toggleId);
  if (card && toggle) {
    card.style.display = toggle.value === 'Yes' ? 'block' : 'none';
  }
}

function triggerPortalFileSelect(docType) {
  let inputId = '';
  if (docType === 'Iqama') inputId = 'portalIqamaFileInput';
  if (docType === 'DrivingLicense') inputId = 'portalDrivingFileInput';
  if (docType === 'VehicleLicense') inputId = 'portalVehicleFileInput';
  if (docType === 'ForkliftLicense') inputId = 'portalForkliftFileInput';

  const input = document.getElementById(inputId);
  if (input) input.click();
}

function handlePortalFileSelect(docType, fileInput) {
  if (!fileInput.files || fileInput.files.length === 0) return;
  const file = fileInput.files[0];
  const emp = state.activePortalEmployee;
  if (!emp) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;
    const ext = file.name.split('.').pop().toLowerCase();
    const cleanIqama = String(emp.Iqama_Number || emp.ID_Number || emp.Employee_Number || 'NO_IQAMA').trim().replace(/\s+/g, '');
    const cleanName = String(emp.Employee_Name || 'MEMBER').trim().replace(/[\s/\\?%*:|"<>]+/g, '_');
    const sanitizedDocType = docType.replace(/[\s/\\?%*:|"<>]+/g, '_');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const storedFileName = `${cleanIqama}_${cleanName}_${sanitizedDocType}_${dateStr}_${timeStr}.${ext}`;
    const folderName = `${cleanIqama} - ${emp.Employee_Name} - ${emp.Employee_ID}`;

    const driveFileId = 'DRIVE-FILE-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const driveFolderId = 'DRIVE-FOLDER-' + cleanIqama;

    emp.StoredDocs = emp.StoredDocs || {};
    emp.StoredDocs[docType] = {
      Drive_File_ID: driveFileId,
      Drive_Folder_ID: driveFolderId,
      Drive_Folder_Name: folderName,
      Iqama_Number: cleanIqama,
      Stored_File_Name: storedFileName,
      Original_File_Name: file.name,
      DataUrl: base64Data,
      Uploaded_At: new Date().toLocaleString('ar-SA'),
      Upload_Source: 'Employee Portal',
      Uploaded_By_Type: 'Employee'
    };

    state.documents.unshift({
      Document_ID: 'DOC-' + Date.now(),
      Employee_ID: emp.Employee_ID,
      Employee_Name: emp.Employee_Name,
      Iqama_Number: cleanIqama,
      Document_Type: docType,
      Drive_File_ID: driveFileId,
      Drive_Folder_ID: driveFolderId,
      Drive_Folder_Name: folderName,
      Stored_File_Name: storedFileName,
      Original_File_Name: file.name,
      Uploaded_At: new Date().toLocaleString('ar-SA'),
      Upload_Source: 'Employee Portal',
      Uploaded_By_Type: 'Employee'
    });

    localStorage.setItem('rassco_employees_override', JSON.stringify(state.employees));
    localStorage.setItem('rassco_documents_override', JSON.stringify(state.documents));

    state.portalSelectedDocs[docType] = true;
    updatePortalDocCardUI(docType);
    logActivity(`${docType} Uploaded (Employee Portal)`, true, emp.Employee_ID, emp.Employee_Name, `اسم الملف بـ Drive: ${storedFileName}`);
    showToast(`✓ تم رفع صورة ${docType} باسم: ${storedFileName} بنجاح!`, 'success');
  };
  reader.readAsDataURL(file);
}

function updatePortalDocCardUI(docType) {
  const emp = state.activePortalEmployee;
  if (!emp) return;

  let badgeId = '', previewId = '', btnTextId = '';
  if (docType === 'Iqama') { badgeId = 'portalIqamaStatusBadge'; previewId = 'portalIqamaPreviewBox'; btnTextId = 'portalIqamaBtnText'; }
  if (docType === 'DrivingLicense') { badgeId = 'portalDrivingStatusBadge'; previewId = 'portalDrivingPreviewBox'; btnTextId = 'portalDrivingBtnText'; }
  if (docType === 'VehicleLicense') { badgeId = 'portalVehicleStatusBadge'; previewId = 'portalVehiclePreviewBox'; btnTextId = 'portalVehicleBtnText'; }
  if (docType === 'ForkliftLicense') { badgeId = 'portalForkliftStatusBadge'; previewId = 'portalForkliftPreviewBox'; btnTextId = 'portalForkliftBtnText'; }

  const badge = document.getElementById(badgeId);
  const preview = document.getElementById(previewId);
  const btnText = document.getElementById(btnTextId);

  const doc = emp.StoredDocs && emp.StoredDocs[docType];
  if (doc && doc.DataUrl) {
    if (badge) { badge.className = 'badge-status status-green'; badge.textContent = '✓ تم الرفع'; }
    if (btnText) { btnText.textContent = 'استبدال الصورة'; }
    if (preview) {
      if (doc.DataUrl.startsWith('data:image')) {
        preview.innerHTML = `<img src="${doc.DataUrl}" alt="${docType}" style="max-height: 120px; border-radius: 8px; object-fit: contain;">`;
      } else {
        preview.innerHTML = `<div style="font-size: 12px; color: var(--rassco-turquoise); font-weight: 700;"><i class="fa-solid fa-file-pdf"></i> ${doc.Original_File_Name} (مرفوع)</div>`;
      }
    }
  }
}

function submitEmployeePortal() {
  const emp = state.activePortalEmployee;
  if (!emp) return;

  const absherNo = (document.getElementById('portalAbsherInput').value || '').trim();
  if (!absherNo || absherNo.length < 10) {
    showToast('يرجى إدخال رقم أبشر الصحيح (10 أرقام)', 'warning');
    document.getElementById('portalAbsherInput').focus();
    return;
  }

  const hasIqama = emp.StoredDocs && emp.StoredDocs['Iqama'];
  if (!hasIqama) {
    showToast('يرجى رفع صورة الإقامة النظامية لإكمال الطلب', 'warning');
    return;
  }

  const drivingToggle = document.getElementById('portalDrivingToggle').value;
  if (drivingToggle === 'Yes' && (!emp.StoredDocs || !emp.StoredDocs['DrivingLicense'])) {
    showToast('لقد حددت توفر رخصة القيادة، يرجى رفع صورتها', 'warning');
    return;
  }

  const vehicleToggle = document.getElementById('portalVehicleToggle').value;
  if (vehicleToggle === 'Yes' && (!emp.StoredDocs || !emp.StoredDocs['VehicleLicense'])) {
    showToast('لقد حددت توفر استمارة المركبة، يرجى رفع صورتها', 'warning');
    return;
  }

  const forkliftToggle = document.getElementById('portalForkliftToggle').value;
  if (forkliftToggle === 'Yes' && (!emp.StoredDocs || !emp.StoredDocs['ForkliftLicense'])) {
    showToast('لقد حددت توفر رخصة الفوركلفت، يرجى رفع صورتها', 'warning');
    return;
  }

  const subId = 'SUB-' + Date.now().toString().substring(5);
  emp.Absher_Number = absherNo;
  emp.Mobile_Number = absherNo;
  emp.Driving_License_Available = drivingToggle;
  emp.Vehicle_License_Available = vehicleToggle;
  emp.Forklift_License_Available = forkliftToggle;

  emp.Filling_Status = 'Pending Supervisor Review';
  emp.Portal_Status = 'Submitted By Employee';
  emp.Portal_Submission_ID = subId;
  emp.Portal_Submitted_At = new Date().toLocaleString('ar-SA');
  emp.Portal_Reupload_Requested = false;
  emp.Last_Updated_By_Name = 'الموظف (البوابة الخارجية)';
  emp.Last_Updated_At = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  emp.Profile_Completion_Percentage = calculateCompletionPercentage(emp);

  localStorage.setItem('rassco_employees_override', JSON.stringify(state.employees));

  addNotification(
    'تم تحديث بيانات الموظف عبر البوابة الخارجية',
    `قام الموظف (${emp.Employee_Name}) برفع الوثائق وتحديث رقم أبشر. المشروع: ${emp.Project_Name || '-'}`,
    emp.Employee_ID,
    'portal_submission'
  );

  logActivity('Employee Portal Submission Completed', true, emp.Employee_ID, emp.Employee_Name, `رقم الطلب: ${subId}`);

  document.getElementById('portalFormStep').style.display = 'none';
  document.getElementById('portalSuccessStep').style.display = 'block';
  document.getElementById('portalSubmissionIdTag').textContent = subId;
}

function calculateCompletionPercentage(emp) {
  let score = 20;
  if (emp.Iqama_Number) score += 20;
  if (emp.StoredDocs && emp.StoredDocs['Iqama']) score += 30;
  if (emp.Absher_Number || emp.Mobile_Number) score += 15;
  if (emp.Passport_Number || (emp.StoredDocs && emp.StoredDocs['Passport'])) score += 15;
  return Math.min(100, score);
}

function addNotification(title, message, empId = null, type = 'general') {
  const notif = {
    id: 'NOTIF-' + Date.now(),
    title: title,
    body: message,
    empId: empId,
    type: type,
    timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
    read: false
  };

  state.notifications.unshift(notif);
  localStorage.setItem('rassco_notifications', JSON.stringify(state.notifications));
  renderNotificationsDropdown();
}

function renderNotificationsDropdown() {
  const badge = document.getElementById('notificationBadgeCount');
  const list = document.getElementById('notificationList');
  if (!list) return;

  const unreadCount = state.notifications.filter(n => !n.read).length;
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (state.notifications.length === 0) {
    list.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">لا توجد إشعارات حالية</div>`;
    return;
  }

  list.innerHTML = state.notifications.map(n => `
    <div class="notification-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}', '${n.empId || ''}')">
      <div class="notification-icon"><i class="fa-solid fa-user-check"></i></div>
      <div class="notification-content">
        <div class="notification-title">${n.title}</div>
        <div class="notification-body">${n.body}</div>
        <div class="notification-time">${n.timestamp}</div>
      </div>
    </div>
  `).join('');
}

function toggleNotificationDropdown() {
  const dd = document.getElementById('notificationDropdown');
  if (dd) {
    dd.classList.toggle('active');
  }
}

function clearNotifications() {
  state.notifications.forEach(n => n.read = true);
  localStorage.setItem('rassco_notifications', JSON.stringify(state.notifications));
  renderNotificationsDropdown();
}

function handleNotificationClick(notifId, empId) {
  const notif = state.notifications.find(n => n.id === notifId);
  if (notif) notif.read = true;
  localStorage.setItem('rassco_notifications', JSON.stringify(state.notifications));
  renderNotificationsDropdown();

  const dd = document.getElementById('notificationDropdown');
  if (dd) dd.classList.remove('active');

  if (empId) {
    openEmployeeDetailsPage(empId);
  }
}

function approvePortalSubmission() {
  const emp = state.currentEmployee || state.activeEmployee;
  if (!emp) return;

  emp.Filling_Status = 'Completed';
  emp.Portal_Status = 'Completed';
  emp.Profile_Completion_Percentage = 100;
  emp.Missing_Documents = 'لا يوجد';
  emp.Last_Updated_By_Name = state.currentUser ? state.currentUser.Full_Name : 'المشرف';
  emp.Last_Updated_At = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  localStorage.setItem('rassco_employees_override', JSON.stringify(state.employees));
  logActivity('Supervisor Approved Portal Submission', true, emp.Employee_ID, emp.Employee_Name, 'تم اعتماد كافة تحديثات البوابة والمستندات بنجاح');

  openEmployeeDetailsPage(emp.Employee_ID);
  showToast(`✓ تم اعتماد تحديثات الموظف (${emp.Employee_Name}) واكتمال ملفه بنجاح!`, 'success');
}

function openReuploadModal() {
  document.getElementById('requestReuploadModal').classList.add('active');
}

function closeReuploadModal() {
  document.getElementById('requestReuploadModal').classList.remove('active');
}

function submitReuploadRequest() {
  const emp = state.currentEmployee || state.activeEmployee;
  if (!emp) return;

  const docType = document.getElementById('reuploadTargetDoc').value;
  const reason = (document.getElementById('reuploadReasonInput').value || '').trim();

  if (!reason) {
    showToast('يرجى كتابة سبب طلب إعادة الرفع للموظف', 'warning');
    return;
  }

  emp.Portal_Reupload_Requested = true;
  emp.Portal_Reupload_Doc = docType;
  emp.Portal_Reupload_Reason = reason;
  emp.Portal_Status = 'Re-upload Requested';
  emp.Filling_Status = 'Needs Review';
  emp.Last_Updated_By_Name = state.currentUser ? state.currentUser.Full_Name : 'المشرف';

  localStorage.setItem('rassco_employees_override', JSON.stringify(state.employees));
  logActivity('Supervisor Requested Re-upload', true, emp.Employee_ID, emp.Employee_Name, `الوثيقة: ${docType} | السبب: ${reason}`);

  closeReuploadModal();
  openEmployeeDetailsPage(emp.Employee_ID);
  showToast(`✓ تم إرسال طلب إعادة رفع ${docType} للموظف بنجاح`, 'info');
}

