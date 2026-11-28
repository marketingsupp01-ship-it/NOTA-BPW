import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { InvoiceData, SavedInvoiceRecord } from '../types/invoice';
import { firebaseApp, firebaseAuth } from './googleAuth';
import { DEFAULT_CREATOR_COLOR } from './invoiceLogic';
import {
  SHARED_WORKSPACE_KEY,
  deriveUserDisplayLabel,
  sanitizeInvoiceDataForFirestore,
  toSafeInvoiceDocId,
} from './sharedHistoryHelpers';

export const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo:
        firebaseAuth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function subscribeToSharedInvoices(
  onRecords: (records: SavedInvoiceRecord[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const path = 'invoices';
  const q = query(
    collection(db, path),
    where('workspaceKey', '==', SHARED_WORKSPACE_KEY),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const nextRecords: SavedInvoiceRecord[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        if (!raw || typeof raw !== 'object' || !raw.data) return;
        nextRecords.push({
          id: String(raw.id || docSnap.id),
          savedAt: String(raw.savedAt || new Date().toISOString()),
          label: String(raw.label || 'Nota Tanpa Nama'),
          total: typeof raw.total === 'number' && Number.isFinite(raw.total) ? raw.total : 0,
          creatorColor:
            typeof raw.creatorColor === 'string' && raw.creatorColor
              ? raw.creatorColor
              : DEFAULT_CREATOR_COLOR,
          updatedByLabel:
            typeof raw.updatedByLabel === 'string' && raw.updatedByLabel
              ? raw.updatedByLabel
              : undefined,
          data: raw.data as InvoiceData,
        });
      });

      nextRecords.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      onRecords(nextRecords);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped);
      }
    },
  );
}

export async function upsertSharedInvoice(
  record: SavedInvoiceRecord,
): Promise<void> {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) return;

  const safeId = toSafeInvoiceDocId(record.id);
  const path = `invoices/${safeId}`;
  const docRef = doc(db, 'invoices', safeId);
  const sanitizedData = sanitizeInvoiceDataForFirestore({
    ...record.data,
    id: safeId,
  });
  const safeLabel = (record.label || 'Nota Tanpa Nama').trim().slice(0, 200) || 'Nota Tanpa Nama';
  const safeTotal =
    typeof record.total === 'number' && Number.isFinite(record.total)
      ? Math.max(0, record.total)
      : 0;
  const safeSavedAt = (record.savedAt || new Date().toISOString()).slice(0, 64);
  const safeColor = (record.creatorColor || sanitizedData.creatorColor || DEFAULT_CREATOR_COLOR).slice(0, 24);
  const updatedByLabel = deriveUserDisplayLabel(
    currentUser.displayName,
    currentUser.email,
  );

  let existingSnap;
  try {
    existingSnap = await getDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (existingSnap.exists()) {
    try {
      await updateDoc(docRef, {
        label: safeLabel,
        total: safeTotal,
        savedAt: safeSavedAt,
        creatorColor: safeColor,
        updatedByUid: currentUser.uid,
        updatedByLabel,
        updatedAt: serverTimestamp(),
        data: sanitizedData,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(docRef, {
        id: safeId,
        workspaceKey: SHARED_WORKSPACE_KEY,
        label: safeLabel,
        total: safeTotal,
        savedAt: safeSavedAt,
        creatorColor: safeColor,
        createdByUid: currentUser.uid,
        updatedByUid: currentUser.uid,
        updatedByLabel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        data: sanitizedData,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function deleteSharedInvoice(id: string): Promise<void> {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) return;

  const safeId = toSafeInvoiceDocId(id);
  const path = `invoices/${safeId}`;
  try {
    await deleteDoc(doc(db, 'invoices', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
