// ==========================================
// 1. STATE & STORAGE
// ==========================================
let userProgress = {
    activeTasks: [],
    completedTasks: [],
    skippedTasks: [],
    completedTaskDetails: {},
    environment: '',
    offeredByEnvironment: {},
    lastSavedCount: 0 
};

// Lagringslagret hålls samlat här så att en framtida molnsynk kan läggas till
// utan att spelmotorn behöver känna till var framstegen sparas.
const STORAGE_KEY = 'vixen_progress';
const STORAGE_BACKUP_KEYS = ['vixen_progress_backup_1', 'vixen_progress_backup_2', 'vixen_progress_backup_3'];
const BACKUP_HANDLE_DB = 'vixen_dare_backup';
const BACKUP_HANDLE_STORE = 'handles';
let automaticBackupFile = null;
let currentDrawLevel = null;

function openBackupHandleDb() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return reject(new Error('IndexedDB saknas'));
        const request = indexedDB.open(BACKUP_HANDLE_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(BACKUP_HANDLE_STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Kunde inte öppna backupminnet'));
    });
}

async function loadAutomaticBackupFile() {
    try {
        const db = await openBackupHandleDb();
        const handle = await new Promise((resolve, reject) => {
            const request = db.transaction(BACKUP_HANDLE_STORE, 'readonly').objectStore(BACKUP_HANDLE_STORE).get('backup');
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        db.close();
        automaticBackupFile = handle;
        updateBackupFileStatus();
        await writeAutomaticBackupFile();
    } catch (e) { /* Äldre webbläsare saknar detta; vanlig backup fungerar ändå. */ }
}

function updateBackupFileStatus(message) {
    const status = document.getElementById('file-backup-status');
    if (!status) return;
    status.textContent = message || (automaticBackupFile
        ? 'Automatisk backup är aktiverad.'
        : '');
}

async function chooseAutomaticBackupFile() {
    if (!window.showSaveFilePicker) {
        updateBackupFileStatus('Din webbläsare stöder inte automatisk uppdatering av samma fil. Använd Vixen Key som backup.');
        return;
    }
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'vixen-dare-backup.json',
            types: [{ description: 'Vixen Dare backup', accept: { 'application/json': ['.json'] } }]
        });
        automaticBackupFile = handle;
        const db = await openBackupHandleDb();
        await new Promise((resolve, reject) => {
            const request = db.transaction(BACKUP_HANDLE_STORE, 'readwrite').objectStore(BACKUP_HANDLE_STORE).put(handle, 'backup');
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
        db.close();
        await writeAutomaticBackupFile();
        updateBackupFileStatus(`Automatisk backup sparas i ${handle.name}.`);
    } catch (e) {
        if (e && e.name !== 'AbortError') updateBackupFileStatus('Backupfilen kunde inte väljas.');
    }
}

async function writeAutomaticBackupFile() {
    if (!automaticBackupFile || !automaticBackupFile.createWritable) return;
    try {
        const writable = await automaticBackupFile.createWritable();
        await writable.write(JSON.stringify({ ...userProgress, exportedAt: new Date().toISOString() }, null, 2));
        await writable.close();
        updateBackupFileStatus(`Senast sparad: ${new Date().toLocaleString('sv-SE')}`);
    } catch (e) {
        updateBackupFileStatus('Backupfilen behöver väljas igen.');
    }
}

function isProgressShape(value) {
    return value && typeof value === 'object' &&
        Array.isArray(value.activeTasks) &&
        Array.isArray(value.completedTasks) &&
        Array.isArray(value.skippedTasks);
}

function readProgressCandidate(raw) {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return isProgressShape(parsed) ? parsed : null;
    } catch (e) {
        return null;
    }
}

function loadStoredProgress() {
    try {
        const candidates = [STORAGE_KEY, ...STORAGE_BACKUP_KEYS];
        for (const key of candidates) {
            const parsed = readProgressCandidate(localStorage.getItem(key));
            if (parsed) return parsed;
        }
    } catch (e) {
        console.error('Kunde inte läsa sparade framsteg:', e);
    }
    return null;
}

const ENVIRONMENTS = {
    on_the_town: {
        label: 'På stan',
        description: 'Ni rör er mellan vuxna sociala platser i stan. Nya uppdrag väljs för möten som kan uppstå längs kvällen.'
    },
    bar_pub: {
        label: 'Bar eller pub',
        description: 'Ni är på en bar eller pub där samtal med nya vuxna människor får växa naturligt under kvällen.'
    },
    nightclub: {
        label: 'Uteställe eller klubb',
        description: 'Ni är i en klubbmiljö med musik, rörelse och plats för spontana samtal med vuxna människor.'
    },
    private_party: {
        label: 'Privat fest',
        description: 'Ni är på en privat vuxenfest där stämningen och sällskapet redan känns bekant och tryggt.'
    },
    at_home: {
        label: 'Hemma',
        description: 'Ni har fest hemma med inbjudna gäster och möjlighet till lekfulla möten i en bekant miljö.'
    },
    swingers_club: {
        label: 'Swingersklubb',
        description: 'Ni är på en vuxenklubb med tydliga husregler och utrymme att ta saker i er egen takt.'
    }
};

try {
    const parsed = loadStoredProgress();
    if (parsed) {
            userProgress = {
                activeTasks: Array.isArray(parsed.activeTasks) ? parsed.activeTasks : [],
                completedTasks: Array.isArray(parsed.completedTasks) ? parsed.completedTasks : [],
                skippedTasks: Array.isArray(parsed.skippedTasks) ? parsed.skippedTasks : [],
                completedTaskDetails: parsed.completedTaskDetails && typeof parsed.completedTaskDetails === 'object' ? parsed.completedTaskDetails : {},
                environment: typeof parsed.environment === 'string' ? parsed.environment : '',
                offeredByEnvironment: parsed.offeredByEnvironment && typeof parsed.offeredByEnvironment === 'object' ? parsed.offeredByEnvironment : {},
                lastSavedCount: typeof parsed.lastSavedCount === 'number' ? parsed.lastSavedCount : 0
            };
            if (typeof parsed.lastSavedCount === 'undefined') {
                userProgress.lastSavedCount = userProgress.completedTasks.length;
            }
    }
} catch (e) {
    console.error("Kunde inte läsa från minnet:", e);
}

function normalizeProgress(progress) {
    const validIds = new Set(VIXEN_DATABASE.map(task => task.id));
    const uniqueValidIds = ids => [...new Set(ids.filter(id => typeof id === 'string' && validIds.has(id)))];
    const completedTasks = uniqueValidIds(progress.completedTasks || []);
    const skippedTasks = uniqueValidIds((progress.skippedTasks || []).filter(id => !completedTasks.includes(id)));
    const activeTasks = uniqueValidIds((progress.activeTasks || []).filter(id =>
        !completedTasks.includes(id) && !skippedTasks.includes(id)
    ));
    const rawDetails = progress.completedTaskDetails && typeof progress.completedTaskDetails === 'object'
        ? progress.completedTaskDetails
        : {};
    const completedTaskDetails = {};

    completedTasks.forEach(id => {
        const detail = rawDetails[id] && typeof rawDetails[id] === 'object' ? rawDetails[id] : {};
        completedTaskDetails[id] = {
            completedAt: typeof detail.completedAt === 'string' ? detail.completedAt : '',
            reflection: typeof detail.reflection === 'string' ? detail.reflection.slice(0, 2000) : ''
        };
    });

    const environmentAliases = { city: 'on_the_town', club: 'nightclub' };
    const environment = environmentAliases[progress.environment] || progress.environment;
    const offeredByEnvironment = {};
    if (progress.offeredByEnvironment && typeof progress.offeredByEnvironment === 'object') {
        Object.entries(progress.offeredByEnvironment).forEach(([key, ids]) => {
            const normalizedKey = environmentAliases[key] || key;
            if (ENVIRONMENTS[normalizedKey] && Array.isArray(ids)) {
                offeredByEnvironment[normalizedKey] = uniqueValidIds(ids);
            }
        });
    }

    return {
        activeTasks,
        completedTasks,
        skippedTasks,
        completedTaskDetails,
        environment: ENVIRONMENTS[environment] ? environment : '',
        offeredByEnvironment,
        lastSavedCount: Math.max(0, Math.min(
            typeof progress.lastSavedCount === 'number' ? progress.lastSavedCount : completedTasks.length,
            completedTasks.length
        ))
    };
}

function saveToDevice() {
    try {
        const serialized = JSON.stringify(userProgress);
        const previous = localStorage.getItem(STORAGE_KEY);
        if (previous && readProgressCandidate(previous)) {
            for (let i = STORAGE_BACKUP_KEYS.length - 1; i > 0; i--) {
                const older = localStorage.getItem(STORAGE_BACKUP_KEYS[i - 1]);
                if (older) localStorage.setItem(STORAGE_BACKUP_KEYS[i], older);
            }
            localStorage.setItem(STORAGE_BACKUP_KEYS[0], previous);
        }
        localStorage.setItem(STORAGE_KEY, serialized);
    } catch (e) {
        console.error("Kunde inte spara på enheten:", e);
        alert("Kunde inte spara dina framsteg på den här enheten.");
    }
    renderLists();
    checkUnsavedProgress(); 
    void writeAutomaticBackupFile();
}

// ==========================================
// 2. KÄRNLOGIK (MOTORN)
// ==========================================

function drawTasks(level) {
    if (typeof VIXEN_DATABASE === 'undefined') { 
        alert("Systemfel: tasks.js saknas!"); 
        return; 
    }

    if (!ENVIRONMENTS[userProgress.environment]) {
        alert('Välj först var du är i kväll.');
        const select = document.getElementById('environment-select');
        if (select) select.focus();
        return;
    }

    currentDrawLevel = level;

    const available = VIXEN_DATABASE.filter(t =>
        t.level === level && 
        !userProgress.activeTasks.includes(t.id) && 
        !userProgress.completedTasks.includes(t.id) &&
        !userProgress.skippedTasks.includes(t.id) &&
        isTaskCompatibleWithEnvironment(t, userProgress.environment)
    );
    if (available.length === 0) {
        alert("Det finns inga fler passande uppdrag på nivå " + level + " i den valda miljön.");
        return; 
    }

    const count = Math.min(5, available.length);
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const targeted = shuffled.filter(task => hasExplicitEnvironment(task));
    const general = shuffled.filter(task => !hasExplicitEnvironment(task));
    const selected = [...targeted, ...general].slice(0, count);

    // Ett nytt drag ersätter alltid de aktiva korten. De gamla blir tillgängliga igen senare.
    userProgress.activeTasks = [];
    selected.forEach(task => { 
        userProgress.activeTasks.push(task.id); 
    });
    
    saveToDevice();
}

function getTaskEnvironments(task) {
    if (Array.isArray(task.environments) && task.environments.length) {
        const explicit = task.environments.filter(environment => ENVIRONMENTS[environment]);
        if (explicit.length) return explicit;
    }

    const text = task.text.toLowerCase();
    if (/(?<![\p{L}])swingersklubb(?![\p{L}])/iu.test(text)) return ['swingers_club'];
    if (/(?<![\p{L}])(?:privat fest|hemma|hem|bjud hem)(?![\p{L}])/iu.test(text)) return ['private_party'];
    if (/(?<![\p{L}])(?:klubb|dansgolv|bås|toalett)(?![\p{L}])/iu.test(text)) return ['nightclub', 'swingers_club'];
    if (/(?<![\p{L}])(?:bar|pub|uteställe|drink|bardisk)(?![\p{L}])/iu.test(text)) return ['bar_pub', 'nightclub'];
    if (/(?<![\p{L}])(?:på stan|stan|gatan|butik|taxi|tåg)(?![\p{L}])/iu.test(text)) return ['on_the_town'];
    return Object.keys(ENVIRONMENTS);
}

function hasExplicitEnvironment(task) {
    return Array.isArray(task.environments) && task.environments.length > 0 ||
        getTaskEnvironments(task).length < Object.keys(ENVIRONMENTS).length;
}

function isTaskCompatibleWithEnvironment(task, environment) {
    return getTaskEnvironments(task).includes(environment);
}

function setEnvironment(environment) {
    if (!ENVIRONMENTS[environment]) return;
    const previousEnvironment = userProgress.environment;
    const activeTask = VIXEN_DATABASE.find(task => userProgress.activeTasks.includes(task.id));
    const levelToRedraw = currentDrawLevel || activeTask?.level || null;
    userProgress.environment = environment;

    if (environment !== previousEnvironment && levelToRedraw) {
        drawTasks(levelToRedraw);
        return;
    }

    saveToDevice();
}

function completeTask(id) {
    userProgress.activeTasks = userProgress.activeTasks.filter(tid => tid !== id);
    userProgress.skippedTasks = userProgress.skippedTasks.filter(tid => tid !== id);
    if (!userProgress.completedTasks.includes(id)) {
        userProgress.completedTasks.push(id);
    }
    userProgress.completedTaskDetails[id] = userProgress.completedTaskDetails[id] || {
        completedAt: new Date().toISOString(),
        reflection: ''
    };
    saveToDevice();
}

function saveReflection(id, reflection) {
    if (!userProgress.completedTasks.includes(id)) return;
    const previous = userProgress.completedTaskDetails[id] || {};
    userProgress.completedTaskDetails[id] = {
        completedAt: previous.completedAt || new Date().toISOString(),
        reflection: String(reflection).slice(0, 2000)
    };
    saveToDevice();
}

function skipTask(id) {
    userProgress.activeTasks = userProgress.activeTasks.filter(tid => tid !== id);
    if (!userProgress.skippedTasks.includes(id)) {
        userProgress.skippedTasks.push(id);
    }
    saveToDevice();
}

function reactivateTask(id) {
    userProgress.skippedTasks = userProgress.skippedTasks.filter(tid => tid !== id);
    if (!userProgress.activeTasks.includes(id)) {
        userProgress.activeTasks.push(id);
    }
    saveToDevice();
}

// FIX: Varningsrutan är nu helt borttagen. Uppdraget stängs direkt vid klick på krysset.
function cancelActiveTask(id) {
    userProgress.activeTasks = userProgress.activeTasks.filter(tid => tid !== id);
    saveToDevice();
}

// ==========================================
// 3. THE VAULT & SÄKERHET
// ==========================================

function buildVixenKey() {
    userProgress.lastSavedCount = userProgress.completedTasks.length;
    saveToDevice();

    const dataString = JSON.stringify(userProgress);
    return btoa(unescape(encodeURIComponent(dataString)));
}

function showVixenKey(vixenKey) {
    const area = document.getElementById('backup-key-area');
    const copyBtn = document.getElementById('copy-backup-btn');

    if (area) {
        area.value = vixenKey;
        area.style.display = 'block';
        area.select();
    }

    if (copyBtn) {
        copyBtn.style.display = 'block';
    }
}

function exportProgress() {
    const vixenKey = buildVixenKey();
    showVixenKey(vixenKey);
    alert("Ny Vixen Key genererad. Spara eller kopiera denna kod!");
    checkUnsavedProgress();
}

function copyBackupKey() {
    const area = document.getElementById('backup-key-area');
    if (!area) return;

    if (!area.value.trim()) {
        const vixenKey = buildVixenKey();
        showVixenKey(vixenKey);
    }

    area.focus();
    area.select();

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(area.value)
            .then(() => alert("Vixen Key kopierad."))
            .catch(() => {
                document.execCommand('copy');
                alert("Vixen Key kopierad.");
            });
    } else {
        document.execCommand('copy');
        alert("Vixen Key kopierad.");
    }
}

function importProgress() {
    const key = document.getElementById('import-key-input').value.trim();
    if (!key) return;
    if(!confirm("Detta skriver över nuvarande data. Fortsätt?")) return;

    try {
        const decoded = decodeURIComponent(escape(atob(key)));
        const data = JSON.parse(decoded);

        const hasValidShape = data &&
            Array.isArray(data.activeTasks) &&
            Array.isArray(data.completedTasks) &&
            Array.isArray(data.skippedTasks);

        if (!hasValidShape) {
            alert("Nyckeln innehåller ingen giltig Vixen Dare-backup.");
            return;
        }

        userProgress = normalizeProgress(data);

        saveToDevice();
        location.reload();
    } catch (e) {
        alert("Ogiltig nyckel.");
    }
}

function panicReset() {
    if(confirm("Radera ALLA framsteg permanent?")) {
        localStorage.removeItem(STORAGE_KEY);
        STORAGE_BACKUP_KEYS.forEach(key => localStorage.removeItem(key));
        localStorage.removeItem('vixen_visited_before');
        location.reload();
    }
}

// ==========================================
// 4. RENDERING
// ==========================================

function checkUnsavedProgress() {
    const unsavedCount = userProgress.completedTasks.length - userProgress.lastSavedCount;
    const vaultBtn = document.getElementById('export-btn'); 
    const vaultInfo = document.getElementById('vault-info-text');

    if (unsavedCount >= 3) { 
        if (vaultBtn) vaultBtn.classList.add('pulsing-warning');
        if (vaultInfo) vaultInfo.innerHTML = `⚠️ Du har <strong>${unsavedCount}</strong> osparade framsteg!`;
    } else {
        if (vaultBtn) vaultBtn.classList.remove('pulsing-warning');
        if (vaultInfo) vaultInfo.innerHTML = "Spara din backup med en <strong>Vixen Key</strong>.";
    }
}

function renderLists() {
    const activeEl = document.getElementById('active-list');
    const skippedEl = document.getElementById('skipped-list');
    const historyEl = document.getElementById('history-list');
    const statsEl = document.getElementById('stats');
    const journeySummaryEl = document.getElementById('journey-summary');
    const levelProgressEl = document.getElementById('level-progress');
    const environmentSelect = document.getElementById('environment-select');
    const environmentContextEl = document.getElementById('environment-context-text');

    if (environmentSelect) environmentSelect.value = userProgress.environment;
    if (environmentContextEl) environmentContextEl.textContent = ENVIRONMENTS[userProgress.environment]?.description || 'Välj miljö för att anpassa uppdragen.';

    if (activeEl) {
        activeEl.innerHTML = '';
        userProgress.activeTasks.forEach(id => {
            const t = VIXEN_DATABASE.find(x => x.id === id);
            if(t) {
                const context = typeof t.context === 'string' && t.context.trim()
                    ? `<p class="task-context">${t.context}</p>`
                    : '';
                activeEl.innerHTML += `
                <article class="task-card n${t.level}">
                    <div class="task-card-top">
                        <span class="task-level">Nivå ${t.level}</span>
                        <button type="button" class="close-card-x" onclick="cancelActiveTask('${t.id}')" title="Stäng uppdrag" aria-label="Stäng uppdrag">×</button>
                    </div>
                    ${context}
                    <p>${t.text}</p>
                    <div class="card-btns">
                        <button type="button" class="done-btn" onclick="completeTask('${t.id}')">Slutfört</button>
                        <button type="button" class="skip-btn" onclick="skipTask('${t.id}')">Lägg åt sidan</button>
                    </div>
                </article>`;
            }
        });
    }

    if (skippedEl) {
        skippedEl.innerHTML = '';
        userProgress.skippedTasks.forEach(id => {
            const t = VIXEN_DATABASE.find(x => x.id === id);
            if(t) {
                const context = typeof t.context === 'string' && t.context.trim()
                    ? `<p class="task-context">${t.context}</p>`
                    : '';
                skippedEl.innerHTML += `
                <article class="task-card skipped">
                    <div class="task-card-top"><span class="task-level">Nivå ${t.level} · Vilande</span></div>
                    ${context}
                    <p>${t.text}</p>
                    <button type="button" class="retry-btn" onclick="reactivateTask('${t.id}')">Ta tillbaka</button>
                </article>`;
            }
        });
    }

    if (historyEl) {
        historyEl.innerHTML = '';
        userProgress.completedTasks.slice().reverse().forEach(id => {
            const t = VIXEN_DATABASE.find(x => x.id === id);
            if(t) {
                const detail = userProgress.completedTaskDetails[id] || {};
                const completedAt = detail.completedAt ? new Date(detail.completedAt) : null;
                const dateText = completedAt && !Number.isNaN(completedAt.getTime())
                    ? completedAt.toLocaleDateString('sv-SE')
                    : 'Tidigare slutfört';
                historyEl.innerHTML += `<li><span class=\"history-lvl\">N${t.level}</span><div class=\"history-copy\">${t.text}<span class=\"history-date\">${dateText}</span><details class=\"reflection\"><summary>Reflektion</summary><textarea maxlength=\"2000\" placeholder=\"Vad tar du med dig från detta?\" onchange=\"saveReflection('${t.id}', this.value)\">${escapeHtml(detail.reflection || '')}</textarea></details></div></li>`;
            }
        });
    }

    if (statsEl) {
        statsEl.innerText = `Klarade: ${userProgress.completedTasks.length} | Vilande: ${userProgress.skippedTasks.length}`;
    }

    if (journeySummaryEl) {
        const total = VIXEN_DATABASE.length;
        journeySummaryEl.textContent = `${userProgress.completedTasks.length} av ${total} uppdrag genomförda. Din historik stannar på den här enheten.`;
    }

    if (levelProgressEl) {
        levelProgressEl.innerHTML = '';
        for (let level = 1; level <= 5; level++) {
            const total = VIXEN_DATABASE.filter(task => task.level === level).length;
            const completed = userProgress.completedTasks.filter(id =>
                VIXEN_DATABASE.find(task => task.id === id)?.level === level
            ).length;
            const percent = total ? Math.round((completed / total) * 100) : 0;
            levelProgressEl.innerHTML += `<div class=\"level-progress-row n${level}\"><span>N${level}</span><div class=\"level-progress-track\"><div class=\"level-progress-fill\" style=\"width:${percent}%\"></div></div><span>${completed}/${total}</span></div>`;
        }
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>\"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));
}

function closeWelcomeModal() {
    localStorage.setItem('vixen_visited_before', 'true');
    const modal = document.getElementById('welcome-modal');
    if (modal) modal.style.display = 'none';
}

window.onload = function() {
    userProgress = normalizeProgress(userProgress);
    // Miljön gäller bara för den aktuella spelsessionen. Vid varje ny öppning
    // måste användaren aktivt välja var kvällen utspelar sig.
    userProgress.environment = '';
    void loadAutomaticBackupFile();
    saveToDevice();
    renderLists();
    checkUnsavedProgress(); 
    if (!localStorage.getItem('vixen_visited_before')) {
        const modal = document.getElementById('welcome-modal');
        if (modal) modal.style.display = 'flex';
    }
};
