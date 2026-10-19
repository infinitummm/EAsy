/**
 * Servicio de seguridad local de Itero Local: cifrado simétrico AES-256-GCM
 * para proteger las claves de API (Riot y Gemini) antes de persistirlas.
 *
 * Formato de salida (hexadecimal): `IV:AuthTag:CipherText`
 *  - IV: 12 bytes (24 caracteres hex) generados aleatoriamente por operación.
 *  - AuthTag: 16 bytes (32 caracteres hex) del modo GCM.
 *  - CipherText: texto cifrado en hex (puede ser vacío para cadena vacía).
 *
 * La clave maestra de 32 bytes puede entregarse directamente (Buffer o hex) o
 * cargarse/crearse de forma segura con `SecurityService.desdeArchivoClave()`,
 * que persiste una clave aleatoria local en disco con permisos restringidos.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ISecurityService } from '@shared/contracts';

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
 * Servicio de cifrado y descifrado local con AES-256-GCM.
 * Implementa el contrato `ISecurityService` de `src/shared/contracts.ts`.
 */
export class SecurityService implements ISecurityService {
  private readonly clave: Buffer;

  constructor(claveMaestra: Buffer | string) {
    this.clave = normalizarClave(claveMaestra);
  }

  /**
   * Crea una instancia cargando la clave local desde `rutaClave`.
   * Si el archivo no existe, genera una clave aleatoria nueva y la persiste
   * (permisos 0o600). El formato del archivo es hexadecimal de 64 caracteres.
   */
  static async desdeArchivoClave(rutaClave: string): Promise<SecurityService> {
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
      const nuevaClave = generarClaveMaestraHex();
      await mkdir(dirname(rutaClave), { recursive: true });
      await writeFile(rutaClave, nuevaClave, { encoding: 'utf-8', mode: 0o600 });
      return new SecurityService(nuevaClave);
    }

    if (contenido.length !== HEX_CLAVE || !PATRON_HEX.test(contenido)) {
      throw new ErrorSeguridad(
        `El archivo de clave "${rutaClave}" no contiene una clave hexadecimal válida de ${HEX_CLAVE} caracteres.`
      );
    }
    return new SecurityService(contenido);
  }

  /**
   * Cifra un texto plano y devuelve `IV:AuthTag:CipherText` en hexadecimal.
   */
  encrypt(plainText: string): string {
    if (typeof plainText !== 'string') {
      throw new ErrorSeguridad('El texto a cifrar debe ser una cadena.');
    }

    const iv = randomBytes(LONGITUD_IV_BYTES);
    const cifrador = createCipheriv(ALGORITMO, this.clave, iv);
    const cifrado = Buffer.concat([cifrador.update(plainText, 'utf-8'), cifrador.final()]);
    const authTag = cifrador.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${cifrado.toString('hex')}`;
  }

  /**
   * Descifra un texto con formato `IV:AuthTag:CipherText` (hexadecimal).
   * @throws {ErrorSeguridad} Si el formato es inválido, la clave no corresponde
   * o el contenido fue alterado (falla la verificación del AuthTag).
   */
  decrypt(cipherText: string): string {
    if (typeof cipherText !== 'string') {
      throw new ErrorSeguridad('El texto cifrado debe ser una cadena.');
    }

    const partes = cipherText.split(':');
    if (partes.length !== 3) {
      throw new ErrorSeguridad(
        'Formato cifrado inválido: se esperaba "IV:AuthTag:CipherText" en hexadecimal.'
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
}
