import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { FileMutex } from '../utils.js';

const ACCOUNT_FILE_VERSION = 1;
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const DUMMY_CREDENTIAL: StoredCredential = {
  algorithm: 'scrypt',
  salt: 'bm90LWEtcmVhbC1hY2NvdW50LXNhbHQ',
  hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  cost: SCRYPT_COST,
  blockSize: SCRYPT_BLOCK_SIZE,
  parallelization: SCRYPT_PARALLELIZATION,
  keyLength: SCRYPT_KEY_LENGTH,
};

export interface PublicAccount {
  id: string;
  username: string;
  createdAt: string;
}

interface StoredCredential {
  algorithm: 'scrypt';
  salt: string;
  hash: string;
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
}

interface StoredAccount extends PublicAccount {
  normalizedUsername: string;
  password: StoredCredential;
  recoveryPin: StoredCredential;
  updatedAt: string;
  authVersion: number;
}

interface AccountFile {
  version: typeof ACCOUNT_FILE_VERSION;
  accounts: StoredAccount[];
}

export type AccountValidationCode =
  | 'INVALID_USERNAME'
  | 'INVALID_PASSWORD'
  | 'INVALID_RECOVERY_PIN';

export class AccountValidationError extends Error {
  readonly code: AccountValidationCode;

  constructor(code: AccountValidationCode) {
    super(code);
    this.name = 'AccountValidationError';
    this.code = code;
  }
}

export class AccountExistsError extends Error {
  constructor() {
    super('ACCOUNT_EXISTS');
    this.name = 'AccountExistsError';
  }
}

export interface AccountStorage {
  register(username: string, password: string, recoveryPin: string): Promise<PublicAccount>;
  authenticate(username: string, password: string): Promise<PublicAccount | null>;
  recover(username: string, recoveryPin: string, newPassword: string): Promise<PublicAccount | null>;
  delete(accountId: string, password: string): Promise<boolean>;
  findById(accountId: string): Promise<PublicAccount | null>;
}

function normalizeUsername(username: string): string {
  return username.normalize('NFKC').trim().toLowerCase();
}

function validateUsername(username: string): string {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3 || normalized.length > 24 || !/^[\p{L}\p{N}_.-]+$/u.test(normalized)) {
    throw new AccountValidationError('INVALID_USERNAME');
  }
  return normalized;
}

function validatePassword(password: string): void {
  if (password.length < 10 || password.length > 128) {
    throw new AccountValidationError('INVALID_PASSWORD');
  }
}

function validateRecoveryPin(recoveryPin: string): void {
  if (!/^\d{8}$/.test(recoveryPin)) {
    throw new AccountValidationError('INVALID_RECOVERY_PIN');
  }
}

function deriveKey(secret: string, credential: StoredCredential): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, Buffer.from(credential.salt, 'base64url'), credential.keyLength, {
      N: credential.cost,
      r: credential.blockSize,
      p: credential.parallelization,
      maxmem: SCRYPT_MAX_MEMORY,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashSecret(secret: string): Promise<StoredCredential> {
  const credential: StoredCredential = {
    algorithm: 'scrypt',
    salt: randomBytes(16).toString('base64url'),
    hash: '',
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
    keyLength: SCRYPT_KEY_LENGTH,
  };
  credential.hash = (await deriveKey(secret, credential)).toString('base64url');
  return credential;
}

async function verifySecret(secret: string, credential: StoredCredential): Promise<boolean> {
  const expected = Buffer.from(credential.hash, 'base64url');
  const actual = await deriveKey(secret, credential);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function toPublicAccount(account: StoredAccount): PublicAccount {
  return {
    id: account.id,
    username: account.username,
    createdAt: account.createdAt,
  };
}

function isCredential(value: unknown): value is StoredCredential {
  if (!value || typeof value !== 'object') return false;
  const credential = value as Partial<StoredCredential>;
  return credential.algorithm === 'scrypt'
    && typeof credential.salt === 'string'
    && typeof credential.hash === 'string'
    && Number.isSafeInteger(credential.cost)
    && Number.isSafeInteger(credential.blockSize)
    && Number.isSafeInteger(credential.parallelization)
    && Number.isSafeInteger(credential.keyLength);
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== 'object') return false;
  const account = value as Partial<StoredAccount>;
  return typeof account.id === 'string'
    && typeof account.username === 'string'
    && typeof account.normalizedUsername === 'string'
    && typeof account.createdAt === 'string'
    && typeof account.updatedAt === 'string'
    && Number.isSafeInteger(account.authVersion)
    && isCredential(account.password)
    && isCredential(account.recoveryPin);
}

function parseAccountFile(source: string): AccountFile {
  const parsed = JSON.parse(source) as Partial<AccountFile>;
  if (parsed.version !== ACCOUNT_FILE_VERSION || !Array.isArray(parsed.accounts) || !parsed.accounts.every(isStoredAccount)) {
    throw new Error('Nieprawidłowy format pliku kont. Dane nie zostały nadpisane.');
  }
  return { version: ACCOUNT_FILE_VERSION, accounts: parsed.accounts };
}

export function createAccountStorage(filePath: string): AccountStorage {
  const mutex = new FileMutex();

  async function readAccounts(): Promise<AccountFile> {
    try {
      return parseAccountFile(await readFile(filePath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: ACCOUNT_FILE_VERSION, accounts: [] };
      }
      throw error;
    }
  }

  async function writeAccounts(data: AccountFile): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      await rename(temporaryPath, filePath);
    } finally {
      await unlink(temporaryPath).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
  }

  return {
    async register(username, password, recoveryPin) {
      const normalizedUsername = validateUsername(username);
      validatePassword(password);
      validateRecoveryPin(recoveryPin);
      const release = await mutex.acquire();
      try {
        const data = await readAccounts();
        if (data.accounts.some(account => account.normalizedUsername === normalizedUsername)) {
          throw new AccountExistsError();
        }
        const now = new Date().toISOString();
        const account: StoredAccount = {
          id: randomUUID(),
          username: username.normalize('NFKC').trim(),
          normalizedUsername,
          password: await hashSecret(password),
          recoveryPin: await hashSecret(recoveryPin),
          createdAt: now,
          updatedAt: now,
          authVersion: 1,
        };
        data.accounts.push(account);
        await writeAccounts(data);
        return toPublicAccount(account);
      } finally {
        release();
      }
    },

    async authenticate(username, password) {
      const normalizedUsername = normalizeUsername(username);
      const data = await readAccounts();
      const account = data.accounts.find(candidate => candidate.normalizedUsername === normalizedUsername);
      const valid = await verifySecret(password, account?.password ?? DUMMY_CREDENTIAL);
      return account && valid ? toPublicAccount(account) : null;
    },

    async recover(username, recoveryPin, newPassword) {
      validateRecoveryPin(recoveryPin);
      validatePassword(newPassword);
      const normalizedUsername = normalizeUsername(username);
      const release = await mutex.acquire();
      try {
        const data = await readAccounts();
        const account = data.accounts.find(candidate => candidate.normalizedUsername === normalizedUsername);
        const valid = await verifySecret(recoveryPin, account?.recoveryPin ?? DUMMY_CREDENTIAL);
        if (!account || !valid) return null;
        account.password = await hashSecret(newPassword);
        account.updatedAt = new Date().toISOString();
        account.authVersion++;
        await writeAccounts(data);
        return toPublicAccount(account);
      } finally {
        release();
      }
    },

    async delete(accountId, password) {
      const release = await mutex.acquire();
      try {
        const data = await readAccounts();
        const accountIndex = data.accounts.findIndex(candidate => candidate.id === accountId);
        const account = data.accounts[accountIndex];
        const valid = await verifySecret(password, account?.password ?? DUMMY_CREDENTIAL);
        if (!account || !valid) return false;
        data.accounts.splice(accountIndex, 1);
        await writeAccounts(data);
        return true;
      } finally {
        release();
      }
    },

    async findById(accountId) {
      const account = (await readAccounts()).accounts.find(candidate => candidate.id === accountId);
      return account ? toPublicAccount(account) : null;
    },
  };
}
