export type QueuedAnswer = {
  attemptId: string;
  questionId: number;
  responseText: string | null;
  responseUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  queuedAt: number;
};

const DATABASE = "volopay-assessment-offline";
const STORE = "answers";
const VERSION = 1;
const memoryFallback = new Map<string, QueuedAnswer>();

function key(attemptId: string, questionId: number) {
  return `${attemptId}:${questionId}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueAnswer(answer: QueuedAnswer) {
  const answerKey = key(answer.attemptId, answer.questionId);
  memoryFallback.set(answerKey, answer);
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({ ...answer, key: answerKey });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // The in-memory copy keeps online autosave working if browser storage is blocked.
  }
}

export async function queuedAnswers(attemptId: string) {
  try {
    const database = await openDatabase();
    const records = await new Promise<(QueuedAnswer & { key: string })[]>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    records.forEach((record) => {
      const current = memoryFallback.get(record.key);
      if (!current || record.queuedAt > current.queuedAt) memoryFallback.set(record.key, record);
    });
  } catch {
    // Fall back to this page's memory queue.
  }
  return [...memoryFallback.values()].filter((record) => record.attemptId === attemptId);
}

export async function removeQueuedAnswer(attemptId: string, questionId: number, queuedAt: number) {
  const answerKey = key(attemptId, questionId);
  if (memoryFallback.get(answerKey)?.queuedAt === queuedAt) memoryFallback.delete(answerKey);
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const request = store.get(answerKey);
      request.onsuccess = () => {
        if (request.result?.queuedAt === queuedAt) store.delete(answerKey);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // The matching in-memory entry was already removed.
  }
}
