/**
 * db.js - Smart Dual-Storage Management for Task Tracker Webapp
 * This utility dynamically routes database calls to Google Firebase (Cloud Firestore & Storage)
 * when configured, with a seamless offline fallback to Local IndexedDB.
 */

const DB_NAME = 'TaskTrackerDB';
const DB_VERSION = 1;

window.TaskDB = {
    db: null,           // IndexedDB database reference
    mode: 'local',      // Current storage mode: 'local' | 'firebase'
    prefix: 'finance_', // Collection prefix in Firestore
    firebaseApp: null,  // Firebase App reference
    firestore: null,    // Cloud Firestore reference
    storage: null,      // Cloud Storage reference

    /**
     * Initialize the Database Router
     * @returns {Promise<any>} Resolves when initialized
     */
    init() {
        return new Promise((resolve, reject) => {
            // Check if Firebase config is saved in localStorage
            const savedConfigStr = localStorage.getItem('finance_checklist_firebase_config');
            
            if (savedConfigStr) {
                try {
                    const config = JSON.parse(savedConfigStr);
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
                        this.storage = firebase.storage();
                        this.mode = 'firebase';
                        
                        console.log("Firebase mode active. Connected with prefix: " + this.prefix);
                        return resolve(this.mode);
                    } else {
                        console.warn("Firebase SDK not loaded, falling back to IndexedDB local-first mode.");
                    }
                } catch (e) {
                    console.error("Failed to parse Firebase config, falling back to IndexedDB:", e);
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
            const storageRef = this.storage.ref();
            const path = `attachments/${attachment.taskId}/${attachment.id}_${attachment.fileName}`;
            const fileRef = storageRef.child(path);

            return fileRef.put(attachment.blob).then(() => {
                return fileRef.getDownloadURL();
            }).then((downloadURL) => {
                const metadata = {
                    id: attachment.id,
                    taskId: attachment.taskId,
                    fileName: attachment.fileName,
                    fileSize: attachment.fileSize,
                    fileType: attachment.fileType,
                    downloadURL: downloadURL,
                    path: path,
                    createdAt: new Date().toISOString()
                };
                return this.firestore.collection(`${this.prefix}attachments`).doc(attachment.id).set(metadata);
            }).then(() => true);
        }

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

                // Try fetching the blob from Firebase Cloud Storage downloadURL
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
                        // Return metadata with direct reference flag for client fallback
                        return {
                            ...data,
                            blob: null,
                            isDirectUrl: true
                        };
                    });
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
            return this.firestore.collection(`${this.prefix}attachments`).doc(attachmentId).get().then(doc => {
                const data = doc.data();
                if (!data) return true;

                const promises = [];
                if (data.path) {
                    const storageRef = this.storage.ref();
                    promises.push(
                        storageRef.child(data.path).delete()
                            .catch(e => console.error("Error deleting file from Firebase Storage:", e))
                    );
                }
                promises.push(this.firestore.collection(`${this.prefix}attachments`).doc(attachmentId).delete());

                return Promise.all(promises).then(() => true);
            });
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

        // 3. Sync Attachments (Upload files & save Firestore metadata)
        for (const att of localAttachments) {
            if (progressCallback) updateProgress(`กำลังอัปโหลดไฟล์แนบ: ${att.fileName}`);
            try {
                const storageRef = this.storage.ref();
                const path = `attachments/${att.taskId}/${att.id}_${att.fileName}`;
                const fileRef = storageRef.child(path);

                // Upload the stored blob
                await fileRef.put(att.blob);
                const downloadURL = await fileRef.getDownloadURL();

                const metadata = {
                    id: att.id,
                    taskId: att.taskId,
                    fileName: att.fileName,
                    fileSize: att.fileSize,
                    fileType: att.fileType,
                    downloadURL: downloadURL,
                    path: path,
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
