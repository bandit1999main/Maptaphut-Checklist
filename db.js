/**
 * db.js - Smart Dual-Storage Management for Task Tracker Webapp
 * This utility dynamically routes database calls to Google Firebase (Cloud Firestore & Storage)
 * when configured, with a seamless offline fallback to Local IndexedDB.
 * Version 1.0.5 - Mobile Responsive Optimization - 2026-05-22
 */

const DB_NAME = 'TaskTrackerDB';
const DB_VERSION = 1;

// Default Firebase Configuration (pre-configured for instant team sync)
const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDG8nBp0Bq8pVFpAL-yCT5E7KorZHG-_dw",
    authDomain: "maptaphut-checklist.firebaseapp.com",
    projectId: "maptaphut-checklist",
    storageBucket: "maptaphut-checklist.firebasestorage.app",
    messagingSenderId: "592356498045",
    appId: "1:592356498045:web:958aad90005db36073ef14",
    measurementId: "G-2WXL9GVTY9"
};

window.TaskDB = {
    db: null,           // IndexedDB database reference
    mode: 'local',      // Current storage mode: 'local' | 'firebase'
    prefix: 'finance_', // Collection prefix in Firestore
    firebaseApp: null,  // Firebase App reference
    firestore: null,    // Cloud Firestore reference
    storage: null,      // Cloud Storage reference
    
    // Google Drive Configurations (Option A)
    gdriveConfig: {
        clientId: '',
        apiKey: '',
        folderId: ''
    },
    gdriveAccessToken: null,
    gdriveTokenExpiresAt: 0,

    /**
     * Load Google Drive config from localStorage & active session
     */
    loadGDriveConfig() {
        const savedClientId = localStorage.getItem('finance_checklist_gdrive_client_id') || '';
        const savedApiKey = localStorage.getItem('finance_checklist_gdrive_api_key') || '';
        const savedFolderId = localStorage.getItem('finance_checklist_gdrive_folder_id') || '';
        
        this.gdriveConfig = {
            clientId: savedClientId,
            apiKey: savedApiKey,
            folderId: savedFolderId
        };
        
        // Retrieve session token
        this.gdriveAccessToken = sessionStorage.getItem('finance_checklist_gdrive_access_token') || null;
        this.gdriveTokenExpiresAt = parseInt(sessionStorage.getItem('finance_checklist_gdrive_token_expires_at') || '0', 10);
    },

    /**
     * Save Google Drive config to localStorage
     */
    saveGDriveConfig(clientId, apiKey, folderId) {
        localStorage.setItem('finance_checklist_gdrive_client_id', clientId);
        localStorage.setItem('finance_checklist_gdrive_api_key', apiKey);
        localStorage.setItem('finance_checklist_gdrive_folder_id', folderId);
        
        this.gdriveConfig = { clientId, apiKey, folderId };
    },

    /**
     * Clear Google Drive config and session tokens
     */
    clearGDriveConfig() {
        localStorage.removeItem('finance_checklist_gdrive_client_id');
        localStorage.removeItem('finance_checklist_gdrive_api_key');
        localStorage.removeItem('finance_checklist_gdrive_folder_id');
        sessionStorage.removeItem('finance_checklist_gdrive_access_token');
        sessionStorage.removeItem('finance_checklist_gdrive_token_expires_at');
        
        this.gdriveConfig = { clientId: '', apiKey: '', folderId: '' };
        this.gdriveAccessToken = null;
        this.gdriveTokenExpiresAt = 0;
    },

    /**
     * Check if Google Drive is configured and authenticated
     */
    isGDriveReady() {
        return this.gdriveConfig.clientId && 
               this.gdriveConfig.apiKey && 
               this.gdriveAccessToken && 
               Date.now() < this.gdriveTokenExpiresAt;
    },

    /**
     * Launch Google Identity Services OAuth 2.0 Sign In
     * @returns {Promise<String>}
     */
    signInGDrive() {
        return new Promise((resolve, reject) => {
            if (!this.gdriveConfig.clientId) {
                return reject(new Error("กรุณากรอก Google Client ID ในการตั้งค่าและกดบันทึกก่อน"));
            }
            if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                return reject(new Error("ไลบรารี Google Identity Services ยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วกดใหม่อีกครั้ง"));
            }

            try {
                const tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.gdriveConfig.clientId,
                    scope: 'https://www.googleapis.com/auth/drive.file', // safe & scoped access
                    callback: (response) => {
                        if (response.error !== undefined) {
                            console.error("OAuth error:", response);
                            return reject(new Error("เข้าสู่ระบบไม่สำเร็จ: " + response.error));
                        }

                        this.gdriveAccessToken = response.access_token;
                        this.gdriveTokenExpiresAt = Date.now() + (response.expires_in * 1000);

                        sessionStorage.setItem('finance_checklist_gdrive_access_token', this.gdriveAccessToken);
                        sessionStorage.setItem('finance_checklist_gdrive_token_expires_at', this.gdriveTokenExpiresAt.toString());

                        resolve(this.gdriveAccessToken);
                    }
                });

                tokenClient.requestAccessToken({ prompt: 'consent' });
            } catch (err) {
                console.error("GSI init failure:", err);
                reject(err);
            }
        });
    },

    /**
     * Upload File Blob to Google Drive using multipart upload
     * @param {String} fileName 
     * @param {String} fileType 
     * @param {Blob} blob 
     * @returns {Promise<Object>}
     */
    async uploadToGoogleDrive(fileName, fileType, blob) {
        if (!this.isGDriveReady()) {
            throw new Error("Google Drive Token หมดอายุหรือยังไม่พร้อมใช้งาน กรุณากดลงชื่อเข้าใช้อีกครั้ง");
        }

        const metadata = {
            name: fileName,
            mimeType: fileType
        };

        if (this.gdriveConfig.folderId) {
            metadata.parents = [this.gdriveConfig.folderId];
        }

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.gdriveAccessToken}`
            },
            body: form
        });

        if (!response.ok) {
            const errStr = await response.text();
            console.error("Gdrive API error response:", errStr);
            throw new Error("อัปโหลดไฟล์ไป Google Drive ล้มเหลว: " + response.statusText);
        }

        return await response.json(); // contains { id, name, webViewLink }
    },

    /**
     * Delete file from Google Drive
     * @param {String} fileId 
     * @returns {Promise<Boolean>}
     */
    async deleteFromGoogleDrive(fileId) {
        if (!this.isGDriveReady()) return false;

        try {
            const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
            const response = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${this.gdriveAccessToken}`
                }
            });
            return response.ok;
        } catch (err) {
            console.error("Gdrive deletion failure:", err);
            return false;
        }
    },

    /**
     * Initialize the Database Router
     * @returns {Promise<any>} Resolves when initialized
     */
    init() {
        // Load Google Drive Config from Storage
        this.loadGDriveConfig();

        return new Promise((resolve, reject) => {
            // Check if Firebase config is saved in localStorage
            const savedConfigStr = localStorage.getItem('finance_checklist_firebase_config');
            const isLocalOverride = localStorage.getItem('finance_checklist_local_override') === 'true';
            
            let config = null;
            if (savedConfigStr) {
                try {
                    config = JSON.parse(savedConfigStr);
                } catch (e) {
                    console.error("Failed to parse Firebase config:", e);
                }
            } else if (!isLocalOverride) {
                // If there's no saved config and no local override, use the default config
                config = DEFAULT_FIREBASE_CONFIG;
            }
            
            if (config) {
                try {
                    this.prefix = localStorage.getItem('finance_checklist_firebase_prefix') || 'finance_';

                    // Check if Firebase Compat SDK is loaded
                    if (typeof firebase !== 'undefined') {
                        // Initialize Firebase if not already initialized
                        if (!firebase.apps.length) {
                            this.firebaseApp = firebase.initializeApp(config);
                        } else {
                            this.firebaseApp = firebase.app();
                        }
                        this.firestore = firebase.firestore();
                        try {
                            this.storage = firebase.storage();
                        } catch (storageErr) {
                            console.warn("Storage not initialized or skipped:", storageErr);
                            this.storage = null;
                        }
                        this.mode = 'firebase';
                        
                        console.log("Firebase active (Mode: " + (savedConfigStr ? "Custom" : "Default") + "). Prefix: " + this.prefix);
                        return resolve(this.mode);
                    } else {
                        console.warn("Firebase SDK not loaded, falling back to IndexedDB local-first mode.");
                    }
                } catch (e) {
                    console.error("Failed to initialize Firebase, falling back to IndexedDB:", e);
                }
            }

            // Fallback: Local IndexedDB mode
            this.mode = 'local';
            if (this.db) {
                return resolve(this.mode);
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("Local Database error: ", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("Local IndexedDB initialized successfully");
                resolve(this.mode);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store for Tasks
                if (!db.objectStoreNames.contains('tasks')) {
                    db.createObjectStore('tasks', { keyPath: 'id' });
                }

                // Store for Custom Categories
                if (!db.objectStoreNames.contains('categories')) {
                    db.createObjectStore('categories', { keyPath: 'id' });
                }

                // Store for File Attachments
                if (!db.objectStoreNames.contains('attachments')) {
                    const attachmentStore = db.createObjectStore('attachments', { keyPath: 'id' });
                    attachmentStore.createIndex('taskId', 'taskId', { unique: false });
                }
            };
        });
    },

    /**
     * Generic helper for read/write IndexedDB transactions
     * @private
     */
    _transaction(storeName, mode, callback) {
        // Force local init
        return new Promise((resolve, reject) => {
            if (this.db) {
                return resolve(this.db);
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
            request.onerror = (event) => reject(event.target.error);
        }).then((db) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(storeName, mode);
                const store = transaction.objectStore(storeName);
                
                let request;
                try {
                    request = callback(store, transaction);
                } catch (err) {
                    reject(err);
                    return;
                }

                transaction.oncomplete = () => {
                    resolve(request && request.result !== undefined ? request.result : true);
                };

                transaction.onerror = (event) => {
                    reject(event.target.error);
                };

                if (request) {
                    request.onerror = (event) => {
                        event.stopPropagation();
                        reject(event.target.error);
                    };
                }
            });
        });
    },

    // ==========================================
    // TASK OPERATIONS
    // ==========================================

    /**
     * Get all tasks sorted by due date
     * @returns {Promise<Array>}
     */
    getAllTasks() {
        if (this.mode === 'firebase') {
            return this.firestore.collection(`${this.prefix}tasks`).get().then(snapshot => {
                const tasks = [];
                snapshot.forEach(doc => tasks.push(doc.data()));
                return tasks.sort((a, b) => {
                    if (!a.dueDate) return 1;
                    if (!b.dueDate) return -1;
                    return new Date(a.dueDate) - new Date(b.dueDate);
                });
            });
        }

        // Local IndexedDB fallback
        return this._transaction('tasks', 'readonly', (store) => {
            return store.getAll();
        }).then((tasks) => {
            return tasks.sort((a, b) => {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            });
        });
    },

    /**
     * Save or update a task
     * @param {Object} task 
     * @returns {Promise<Boolean>}
     */
    saveTask(task) {
        if (this.mode === 'firebase') {
            return this.firestore.collection(`${this.prefix}tasks`).doc(task.id).set(task).then(() => true);
        }

        return this._transaction('tasks', 'readwrite', (store) => {
            return store.put(task);
        });
    },

    /**
     * Delete a task and all its associated attachments
     * @param {String} taskId 
     * @returns {Promise<Boolean>}
     */
    deleteTask(taskId) {
        if (this.mode === 'firebase') {
            return this.firestore.collection(`${this.prefix}tasks`).doc(taskId).delete().then(() => {
                return this.getAttachmentsForTask(taskId).then((attachments) => {
                    const promises = attachments.map((att) => this.deleteAttachment(att.id));
                    return Promise.all(promises).then(() => true);
                });
            });
        }

        return this._transaction('tasks', 'readwrite', (store) => {
            return store.delete(taskId);
        }).then(() => {
            return this.getAttachmentsForTask(taskId).then((attachments) => {
                const promises = attachments.map((att) => this.deleteAttachment(att.id));
                return Promise.all(promises).then(() => true);
            });
        });
    },

    // ==========================================
    // CATEGORY OPERATIONS
    // ==========================================

    /**
     * Get all custom categories
     * @returns {Promise<Array>}
     */
    getAllCategories() {
        if (this.mode === 'firebase') {
            return this.firestore.collection(`${this.prefix}categories`).get().then(snapshot => {
                const categories = [];
                snapshot.forEach(doc => categories.push(doc.data()));
                return categories;
            });
        }

        return this._transaction('categories', 'readonly', (store) => {
            return store.getAll();
        });
    },

    /**
     * Save or update a category
     * @param {Object} category 
     * @returns {Promise<Boolean>}
     */
    saveCategory(category) {
        if (this.mode === 'firebase') {
            return this.firestore.collection(`${this.prefix}categories`).doc(category.id).set(category).then(() => true);
        }

        return this._transaction('categories', 'readwrite', (store) => {
            return store.put(category);
        });
    },

    /**
     * Delete a category
     * @param {String} categoryId 
     * @returns {Promise<Boolean>}
     */
    deleteCategory(categoryId) {
        if (this.mode === 'firebase') {
            return this.firestore.collection(`${this.prefix}categories`).doc(categoryId).delete().then(() => true);
        }

        return this._transaction('categories', 'readwrite', (store) => {
            return store.delete(categoryId);
        });
    },

    // ==========================================
    // ATTACHMENT OPERATIONS
    // ==========================================

    /**
     * Get all attachments for a specific task
     * @param {String} taskId 
     * @returns {Promise<Array>}
     */
    getAttachmentsForTask(taskId) {
        if (this.mode === 'firebase') {
            return this.firestore.collection(`${this.prefix}attachments`)
                .where('taskId', '==', taskId)
                .get()
                .then(snapshot => {
                    const attachments = [];
                    snapshot.forEach(doc => attachments.push(doc.data()));
                    return attachments;
                });
        }

        return this.init().then(() => {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction('attachments', 'readonly');
                const store = transaction.objectStore('attachments');
                const index = store.index('taskId');
                const request = index.getAll(taskId);

                request.onsuccess = () => {
                    resolve(request.result || []);
                };

                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        });
    },

    /**
     * Save an attachment (uploads to Cloud Storage in Firebase mode)
     * @param {Object} attachment { id, taskId, fileName, fileSize, fileType, blob }
     * @returns {Promise<Boolean>}
     */
    saveAttachment(attachment) {
        if (this.mode === 'firebase') {
            // If Google Drive configuration is ready, upload to Google Drive!
            if (this.isGDriveReady()) {
                return this.uploadToGoogleDrive(attachment.fileName, attachment.fileType, attachment.blob)
                    .then((gdriveFile) => {
                        const metadata = {
                            id: attachment.id,
                            taskId: attachment.taskId,
                            fileName: attachment.fileName,
                            fileSize: attachment.fileSize,
                            fileType: attachment.fileType,
                            storageType: 'google_drive',
                            googleDriveFileId: gdriveFile.id,
                            googleDriveLink: gdriveFile.webViewLink,
                            dataUrl: '', // Empty, as it is safely stored in Google Drive!
                            createdAt: new Date().toISOString()
                        };
                        return this.firestore.collection(`${this.prefix}attachments`).doc(attachment.id).set(metadata);
                    })
                    .then(() => true)
                    .catch((err) => {
                        console.error("Google Drive upload failed, falling back to Firestore base64:", err);
                        // Fallback logic
                        return this._saveAttachmentAsBase64(attachment);
                    });
            } else {
                return this._saveAttachmentAsBase64(attachment);
            }
        }

        return this._transaction('attachments', 'readwrite', (store) => {
            return store.put(attachment);
        });
    },

    /**
     * Helper to save attachment as Base64 in Firestore
     * @private
     */
    _saveAttachmentAsBase64(attachment) {
        const blobToDataURL = (blob) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        };

        return blobToDataURL(attachment.blob).then((dataUrl) => {
            const metadata = {
                id: attachment.id,
                taskId: attachment.taskId,
                fileName: attachment.fileName,
                fileSize: attachment.fileSize,
                fileType: attachment.fileType,
                storageType: 'firestore_base64',
                dataUrl: dataUrl,
                createdAt: new Date().toISOString()
            };
            return this.firestore.collection(`${this.prefix}attachments`).doc(attachment.id).set(metadata);
        }).then(() => true);
    },

        return this._transaction('attachments', 'readwrite', (store) => {
            return store.put(attachment);
        });
    },

    /**
     * Get a specific attachment with its full blob data
     * @param {String} attachmentId 
     * @returns {Promise<Object>}
     */
    getAttachment(attachmentId) {
        if (this.mode === 'firebase') {
            return this.firestore.collection(`${this.prefix}attachments`).doc(attachmentId).get().then(doc => {
                const data = doc.data();
                if (!data) return null;

                if (data.dataUrl) {
                    // Convert Data URL back to Blob
                    return fetch(data.dataUrl)
                        .then(res => res.blob())
                        .then(blob => {
                            return {
                                ...data,
                                blob: blob
                            };
                        })
                        .catch(err => {
                            console.error("Error converting dataUrl to blob:", err);
                            return {
                                ...data,
                                blob: null
                            };
                        });
                } else if (data.downloadURL) {
                    // Fallback to fetch from Storage downloadURL for backward compatibility
                    return fetch(data.downloadURL)
                        .then(res => res.blob())
                        .then(blob => {
                            return {
                                ...data,
                                blob: blob
                            };
                        })
                        .catch(err => {
                            console.warn("CORS block or fetch error, fallback to direct download URL reference:", err);
                            return {
                                ...data,
                                blob: null,
                                isDirectUrl: true
                            };
                        });
                }
                return {
                    ...data,
                    blob: null
                };
            });
        }

        return this._transaction('attachments', 'readonly', (store) => {
            return store.get(attachmentId);
        });
    },

    /**
     * Delete a specific attachment
     * @param {String} attachmentId 
     * @returns {Promise<Boolean>}
     */
    deleteAttachment(attachmentId) {
        if (this.mode === 'firebase') {
            const docRef = this.firestore.collection(`${this.prefix}attachments`).doc(attachmentId);
            return docRef.get().then(doc => {
                const data = doc.data();
                if (data && data.storageType === 'google_drive' && data.googleDriveFileId) {
                    // Call Google Drive Delete API in background (non-blocking)
                    this.deleteFromGoogleDrive(data.googleDriveFileId).catch(err => {
                        console.warn("Failed to delete file from Google Drive:", err);
                    });
                }
                return docRef.delete();
            }).then(() => true);
        }

        return this._transaction('attachments', 'readwrite', (store) => {
            return store.delete(attachmentId);
        });
    },

    // ==========================================
    // MIGRATION UTILITY
    // ==========================================

    /**
     * Scans local IndexedDB data and syncs all tasks, categories, and attachments to the Cloud.
     * @param {Function} progressCallback (percent, message)
     * @returns {Promise<Boolean>}
     */
    async migrateLocalToCloud(progressCallback) {
        if (this.mode !== 'firebase') {
            throw new Error("ต้องอยู่ในโหมดเชื่อมต่อ Firebase จึงจะทำการย้ายข้อมูลได้");
        }

        // Fetch all local records from IndexedDB
        const localCategories = await this._transaction('categories', 'readonly', (store) => store.getAll());
        const localTasks = await this._transaction('tasks', 'readonly', (store) => store.getAll());
        const localAttachments = await this._transaction('attachments', 'readonly', (store) => store.getAll());

        const totalItems = localCategories.length + localTasks.length + localAttachments.length;
        if (totalItems === 0) {
            if (progressCallback) progressCallback(100, "ไม่พบข้อมูลเดิมในเครื่องที่ต้องย้าย");
            return true;
        }

        let processed = 0;
        const updateProgress = (message) => {
            processed++;
            const percent = Math.min(Math.round((processed / totalItems) * 100), 99);
            if (progressCallback) progressCallback(percent, message);
        };

        // 1. Sync Categories
        for (const cat of localCategories) {
            if (progressCallback) updateProgress(`กำลังซิงค์หมวดหมู่: ${cat.name}`);
            await this.firestore.collection(`${this.prefix}categories`).doc(cat.id).set(cat);
        }

        // 2. Sync Tasks
        for (const task of localTasks) {
            if (progressCallback) updateProgress(`กำลังซิงค์งาน: ${task.title}`);
            await this.firestore.collection(`${this.prefix}tasks`).doc(task.id).set(task);
        }

        // Helper to convert blob to base64
        const blobToDataURL = (blob) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        };

        // 3. Sync Attachments (Save directly to Firestore as DataURL)
        for (const att of localAttachments) {
            if (progressCallback) updateProgress(`กำลังซิงค์ไฟล์แนบ: ${att.fileName}`);
            try {
                const dataUrl = await blobToDataURL(att.blob);
                const metadata = {
                    id: att.id,
                    taskId: att.taskId,
                    fileName: att.fileName,
                    fileSize: att.fileSize,
                    fileType: att.fileType,
                    dataUrl: dataUrl,
                    createdAt: new Date().toISOString()
                };

                await this.firestore.collection(`${this.prefix}attachments`).doc(att.id).set(metadata);
            } catch (err) {
                console.error("Failed to migrate attachment " + att.fileName, err);
            }
        }

        if (progressCallback) progressCallback(100, "ซิงค์ข้อมูลสำเร็จแล้ว! ดึงข้อมูลเก่าของคุณทั้งหมดขึ้นสู่ Firebase เรียบร้อย 🚀");
        return true;
    }
};
