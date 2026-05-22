/**
 * db.js - IndexedDB Management for Task Tracker Webapp
 * This utility provides asynchronous local storage for tasks, categories, and large file attachments.
 */

const DB_NAME = 'TaskTrackerDB';
const DB_VERSION = 1;

window.TaskDB = {
    db: null,

    /**
     * Initialize the IndexedDB database
     * @returns {Promise<IDBDatabase>}
     */
    init() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                return resolve(this.db);
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("Database error: ", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("Database initialized successfully");
                resolve(this.db);
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
                    // Index by taskId to quickly query attachments belonging to a task
                    attachmentStore.createIndex('taskId', 'taskId', { unique: false });
                }
            };
        });
    },

    /**
     * Generic helper for read/write transactions
     * @private
     */
    _transaction(storeName, mode, callback) {
        return this.init().then((db) => {
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
                    // If request had a result, resolve with it, otherwise resolve true
                    resolve(request && request.result !== undefined ? request.result : true);
                };

                transaction.onerror = (event) => {
                    reject(event.target.error);
                };

                if (request) {
                    request.onerror = (event) => {
                        event.stopPropagation(); // Prevent transaction rollback if handled
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
        return this._transaction('tasks', 'readonly', (store) => {
            return store.getAll();
        }).then((tasks) => {
            // Sort tasks by due date (nulls last, then ascending)
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
        // First delete the task itself
        return this._transaction('tasks', 'readwrite', (store) => {
            return store.delete(taskId);
        }).then(() => {
            // Then delete all associated attachments
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
        return this._transaction('categories', 'readwrite', (store) => {
            return store.delete(categoryId);
        });
    },

    // ==========================================
    // ATTACHMENT OPERATIONS
    // ==========================================

    /**
     * Get all attachments for a specific task (excluding the binary blob for speed)
     * @param {String} taskId 
     * @returns {Promise<Array>}
     */
    getAttachmentsForTask(taskId) {
        return this.init().then((db) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction('attachments', 'readonly');
                const store = transaction.objectStore('attachments');
                const index = store.index('taskId');
                const request = index.getAll(taskId);

                request.onsuccess = () => {
                    // Return metadata and blobs
                    resolve(request.result || []);
                };

                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        });
    },

    /**
     * Save an attachment
     * @param {Object} attachment { id, taskId, fileName, fileSize, fileType, blob }
     * @returns {Promise<Boolean>}
     */
    saveAttachment(attachment) {
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
        return this._transaction('attachments', 'readwrite', (store) => {
            return store.delete(attachmentId);
        });
    }
};
