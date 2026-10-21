/**
 * Servicio de seguridad local de Itero Local:
 * - Prioridad 1: Windows DPAPI via Electron safeStorage (seguridad respaldada por el SO).
 * - Prioridad 2: Cifrado simétrico AES-256-GCM con clave derivada por usuario/máquina + sal única.
 * - Soporta migración transparente desde claves previamente cifradas en formato `IV:AuthTag:CipherText`.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { userInfo, hostname } from 'node:os';
import type { ISecurityService } from '../../shared/contracts';

/** Proveedor compatible con electron.safeStorage */
export interface SafeStorageProvider {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** Intenta cargar el safeStorage de electron dinámicamente si estamos en Electron. */
function obtenerElectronSafeStorage(): SafeStorageProvider | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    if (electron && electron.safeStorage && typeof electron.safeStorage.isEncryptionAvailable === 'function') {
      return electron.safeStorage;
    }
  } catch {
    // No estamos en runtime de Electron o no está disponible
  }
  return null;
}

/** Longitud de la clave maestra en bytes (AES-256). */
export const LONGITUD_CLAVE_BYTES = 32;

/** Longitud del vector de inicialización (IV) en bytes para GCM. */
export const LONGITUD_IV_BYTES = 12;

/** Longitud del AuthTag de GCM en bytes. */
export const LONGITUD_AUTH_TAG_BYTES = 16;

const ALGORITMO = 'aes-256-gcm';
const HEX_CLAVE = LONGITUD_CLAVE_BYTES * 2;
const HEX_IV = LONGITUD_IV_BYTES * 2;
const HEX_AUTH_TAG = LONGITUD_AUTH_TAG_BYTES * 2;
const PATRON_HEX = /^[0-9a-fA-F]*$/;
const PREFIJO_DPAPI = 'dpapi:';

/** Error lanzado ante claves, formatos o procesos de cifrado inválidos. */
export class ErrorSeguridad extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorSeguridad';
  }
}

/** Genera una clave maestra aleatoria de 32 bytes en formato hexadecimal. */
export function generarClaveMaestraHex(): string {
  return randomBytes(LONGITUD_CLAVE_BYTES).toString('hex');
}

/**
 * Enmascara una clave de API para logs o UI (ej. 'AIzaSy...1234' o 'RGAPI-...5678').
 * Nunca expone la clave completa.
 */
export function enmascararClave(clave: string | null | undefined): string {
  if (!clave || typeof clave !== 'string') return '';
  const limpia = clave.trim();
  if (limpia.length <= 8) return '********';
  const inicio = limpia.slice(0, 6);
  const fin = limpia.slice(-4);
  return `${inicio}...${fin}`;
}

/** Normaliza y valida una clave maestra (Buffer de 32 bytes o hex de 64 caracteres). */
function normalizarClave(claveMaestra: Buffer | string): Buffer {
  if (Buffer.isBuffer(claveMaestra)) {
    if (claveMaestra.length !== LONGITUD_CLAVE_BYTES) {
      throw new ErrorSeguridad(
        `La clave maestra debe tener ${LONGITUD_CLAVE_BYTES} bytes y se recibieron ${claveMaestra.length}.`
      );
    }
    return Buffer.from(claveMaestra);
  }

  if (typeof claveMaestra !== 'string' || claveMaestra.length !== HEX_CLAVE || !PATRON_HEX.test(claveMaestra)) {
    throw new ErrorSeguridad(
      `La clave maestra en texto debe ser hexadecimal de ${HEX_CLAVE} caracteres (32 bytes).`
    );
  }
  return Buffer.from(claveMaestra, 'hex');
}

/** Valida que una cadena sea hexadecimal y de la longitud exacta indicada. */
function esHexDeLongitud(valor: string, longitud: number): boolean {
  return valor.length === longitud && PATRON_HEX.test(valor);
}

/**
 * Servicio de cifrado y descifrado local con safeStorage (Windows DPAPI) y AES-256-GCM.
 * Implementa el contrato `ISecurityService` de `src/shared/contracts.ts`.
 */
export class SecurityService implements ISecurityService {
  private readonly clave: Buffer;
  private readonly safeStorage: SafeStorageProvider | null;

  constructor(claveMaestra: Buffer | string, customSafeStorage?: SafeStorageProvider | null) {
    this.clave = normalizarClave(claveMaestra);
    this.safeStorage = customSafeStorage !== undefined ? customSafeStorage : obtenerElectronSafeStorage();
  }

  /**
   * Crea una instancia segura. Si DPAPI está disponible en Electron se usará por defecto,
   * y se mantiene una clave secundaria (o derivada con salt) para migración transparente.
   */
  static async desdeArchivoClave(
    rutaClave: string,
    customSafeStorage?: SafeStorageProvider | null
  ): Promise<SecurityService> {
    const ss = customSafeStorage !== undefined ? customSafeStorage : obtenerElectronSafeStorage();

    let contenido: string | null = null;
    try {
      contenido = (await readFile(rutaClave, 'utf-8')).trim();
    } catch (error) {
      const codigo = (error as NodeJS.ErrnoException).code;
      if (codigo !== 'ENOENT') {
        throw new ErrorSeguridad(`No se pudo leer la clave local en "${rutaClave}": ${String(error)}`);
      }
    }

    if (contenido === null) {
      // Derivar clave basada en máquina + sal única generada aleatoriamente
      const saltPath = join(dirname(rutaClave), 'itero.salt');
      let salt: Buffer;
      try {
        salt = await readFile(saltPath);
      } catch {
        salt = randomBytes(16);
        await mkdir(dirname(rutaClave), { recursive: true });
        await writeFile(saltPath, salt, { mode: 0o600 });
      }

      let user = 'user';
      try {
        user = userInfo().username;
      } catch {}
      const host = hostname() || 'local';
      const seed = `itero-local-key:${user}@${host}`;
      const claveDerivada = scryptSync(seed, salt, LONGITUD_CLAVE_BYTES);

      await mkdir(dirname(rutaClave), { recursive: true });
      await writeFile(rutaClave, claveDerivada.toString('hex'), { encoding: 'utf-8', mode: 0o600 });
      return new SecurityService(claveDerivada, ss);
    }

    if (contenido.length !== HEX_CLAVE || !PATRON_HEX.test(contenido)) {
      throw new ErrorSeguridad(
        `El archivo de clave "${rutaClave}" no contiene una clave hexadecimal válida de ${HEX_CLAVE} caracteres.`
      );
    }
    return new SecurityService(contenido, ss);
  }

  /**
   * Indica si Windows DPAPI (Electron safeStorage) está disponible en el entorno actual.
   */
  public isDpapiAvailable(): boolean {
    return Boolean(this.safeStorage && this.safeStorage.isEncryptionAvailable());
  }

  /**
   * Cifra un texto plano.
   * Si safeStorage (DPAPI) está disponible, genera `dpapi:<base64>`.
   * Si no, genera `IV:AuthTag:CipherText` con AES-256-GCM.
   */
  encrypt(plainText: string): string {
    if (typeof plainText !== 'string') {
      throw new ErrorSeguridad('El texto a cifrar debe ser una cadena.');
    }

    if (this.safeStorage && this.safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = this.safeStorage.encryptString(plainText);
        return `${PREFIJO_DPAPI}${buffer.toString('base64')}`;
      } catch {
        // Fallback a AES-256-GCM si safeStorage falla en tiempo de ejecución
      }
    }

    const iv = randomBytes(LONGITUD_IV_BYTES);
    const cifrador = createCipheriv(ALGORITMO, this.clave, iv);
    const cifrado = Buffer.concat([cifrador.update(plainText, 'utf-8'), cifrador.final()]);
    const authTag = cifrador.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${cifrado.toString('hex')}`;
  }

  /**
   * Descifra un texto cifrado.
   * - Si inicia con `dpapi:`, usa Electron safeStorage (DPAPI).
   * - Si tiene formato `IV:AuthTag:CipherText` (antiguo), lo descifra con AES-256-GCM (migración).
   */
  decrypt(cipherText: string): string {
    if (typeof cipherText !== 'string') {
      throw new ErrorSeguridad('El texto cifrado debe ser una cadena.');
    }

    // 1. Formato DPAPI
    if (cipherText.startsWith(PREFIJO_DPAPI)) {
      if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) {
        throw new ErrorSeguridad('El texto fue cifrado con DPAPI pero safeStorage no está disponible en este entorno.');
      }
      try {
        const base64 = cipherText.slice(PREFIJO_DPAPI.length);
        const buffer = Buffer.from(base64, 'base64');
        return this.safeStorage.decryptString(buffer);
      } catch (error) {
        const detalle = error instanceof Error ? error.message : String(error);
        throw new ErrorSeguridad(`No se pudo descifrar con DPAPI: ${detalle}`);
      }
    }

    // 2. Formato antiguo o alternativo AES-256-GCM (IV:AuthTag:CipherText)
    const partes = cipherText.split(':');
    if (partes.length !== 3) {
      throw new ErrorSeguridad(
        'Formato cifrado inválido: se esperaba "dpapi:..." o "IV:AuthTag:CipherText" en hexadecimal.'
      );
    }

    const [ivHex, authTagHex, contenidoHex] = partes;
    if (!esHexDeLongitud(ivHex, HEX_IV)) {
      throw new ErrorSeguridad(`El IV debe ser hexadecimal de ${HEX_IV} caracteres (12 bytes).`);
    }
    if (!esHexDeLongitud(authTagHex, HEX_AUTH_TAG)) {
      throw new ErrorSeguridad(`El AuthTag debe ser hexadecimal de ${HEX_AUTH_TAG} caracteres (16 bytes).`);
    }
    if (contenidoHex.length % 2 !== 0 || !PATRON_HEX.test(contenidoHex)) {
      throw new ErrorSeguridad('El texto cifrado debe ser hexadecimal de longitud par.');
    }

    try {
      const descifrador = createDecipheriv(ALGORITMO, this.clave, Buffer.from(ivHex, 'hex'));
      descifrador.setAuthTag(Buffer.from(authTagHex, 'hex'));
      const plano = Buffer.concat([
        descifrador.update(Buffer.from(contenidoHex, 'hex')),
        descifrador.final(),
      ]);
      return plano.toString('utf-8');
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      throw new ErrorSeguridad(`No se pudo descifrar el contenido: ${detalle}`);
    }
  }

  /**
   * Si una clave está en formato antiguo (`IV:AuthTag:CipherText`), la migra al formato actual (DPAPI si está disponible).
   * Devuelve la clave en el nuevo formato seguro, o el mismo string si ya estaba en DPAPI.
   */
  migrarSiEsNecesario(cipherText: string): { migrado: boolean; nuevoTexto: string } {
    if (!cipherText || cipherText.startsWith(PREFIJO_DPAPI)) {
      return { migrado: false, nuevoTexto: cipherText };
    }
    if (cipherText.includes(':')) {
      const plano = this.decrypt(cipherText);
      const nuevoTexto = this.encrypt(plano);
      return { migrado: true, nuevoTexto };
    }
    return { migrado: false, nuevoTexto: cipherText };
  }
}
