export type Category = 'frozen' | 'refrigerated' | 'room_temp';
export type Status = 'active' | 'consumed' | 'discarded';

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: Date;
}

export interface FridgeItem {
  id?: string;
  userId: string;
  name: string;
  category: Category;
  expiryDate?: Date;
  addedDate: Date;
  status: Status;
  quantity?: number;
  unit?: string;
  lastModified?: Date;
}

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
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
