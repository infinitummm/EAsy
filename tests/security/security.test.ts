/**
 * Pruebas unitarias del servicio de seguridad local (T-3.1).
 * Verifica el cifrado/descifrado AES-256-GCM con formato IV:AuthTag:CipherText,
 * la detección de manipulación y la persistencia segura de la clave maestra.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ErrorSeguridad,
  SecurityService,
  generarClaveMaestraHex,
  LONGITUD_CLAVE_BYTES,
  LONGITUD_IV_BYTES,
  LONGITUD_AUTH_TAG_BYTES,
} from '../../src/main/security/SecurityService';

const CLAVE_HEX = 'a'.repeat(64);
const PATRON_HEX = /^[0-9a-f]+$/;

let servicio: SecurityService;
let directorioTemporal: string;

beforeEach(async () => {
  servicio = new SecurityService(CLAVE_HEX);
  directorioTemporal = await mkdtemp(join(tmpdir(), 'itero-security-'));
});

afterEach(async () => {
  await rm(directorioTemporal, { recursive: true, force: true });
});

describe('SecurityService (AES-256-GCM)', () => {
  describe('cifrado y descifrado', () => {
    it('cifra y descifra una cadena simple (ida y vuelta)', () => {
      const original = 'clave-riot-1234567890';
      const cifrado = servicio.encrypt(original);

      expect(cifrado).not.toBe(original);
      expect(servicio.decrypt(cifrado)).toBe(original);
    });

    it('cifra y descifra texto con acentos, emojis y saltos de línea', () => {
      const original = 'contraseña ñandú\n🔥 línea 2\ttabulada';
      expect(servicio.decrypt(servicio.encrypt(original))).toBe(original);
    });

    it('cifra y descifra la cadena vacía', () => {
      const cifrado = servicio.encrypt('');
      expect(servicio.decrypt(cifrado)).toBe('');
    });

    it('cifra y descifra cadenas largas (10.000 caracteres)', () => {
      const original = 'x'.repeat(10_000);
      expect(servicio.decrypt(servicio.encrypt(original))).toBe(original);
    });

    it('genera cifrados distintos para el mismo texto (IV aleatorio)', () => {
      const texto = 'mismo-texto';
      const cifradoA = servicio.encrypt(texto);
      const cifradoB = servicio.encrypt(texto);

      expect(cifradoA).not.toBe(cifradoB);
      expect(cifradoA.split(':')[0]).not.toBe(cifradoB.split(':')[0]);
      expect(servicio.decrypt(cifradoA)).toBe(texto);
      expect(servicio.decrypt(cifradoB)).toBe(texto);
    });

    it('reutiliza el IV en un segundo ciclo de descifrado (sin estado interno)', () => {
      const cifrado = servicio.encrypt('repetible');
      expect(servicio.decrypt(cifrado)).toBe('repetible');
      expect(servicio.decrypt(cifrado)).toBe('repetible');
    });
  });

  describe('formato de salida', () => {
    it('devuelve tres segmentos separados por dos puntos', () => {
      const partes = servicio.encrypt('dato').split(':');
      expect(partes).toHaveLength(3);
    });

    it('usa IV de 12 bytes y AuthTag de 16 bytes en hexadecimal', () => {
      const [ivHex, authTagHex, contenidoHex] = servicio.encrypt('formato').split(':');

      expect(ivHex).toHaveLength(LONGITUD_IV_BYTES * 2);
      expect(authTagHex).toHaveLength(LONGITUD_AUTH_TAG_BYTES * 2);
      expect(ivHex).toMatch(PATRON_HEX);
      expect(authTagHex).toMatch(PATRON_HEX);
      expect(contenidoHex).toMatch(PATRON_HEX);
      expect(contenidoHex.length % 2).toBe(0);
    });
  });

  describe('detección de manipulación y claves incorrectas', () => {
    it('rechaza un texto cifrado alterado (falla el AuthTag)', () => {
      const cifrado = servicio.encrypt('secreto-original');
      const [iv, tag, contenido] = cifrado.split(':');
      const ultimoCaracter = contenido.at(-1) ?? '0';
      const alterado = contenido.slice(0, -1) + (ultimoCaracter === 'f' ? 'e' : 'f');

      expect(() => servicio.decrypt(`${iv}:${tag}:${alterado}`)).toThrow(ErrorSeguridad);
    });

    it('rechaza un AuthTag alterado', () => {
      const cifrado = servicio.encrypt('secreto-original');
      const [iv, tag, contenido] = cifrado.split(':');
      const primerCaracter = tag[0];
      const tagAlterado = (primerCaracter === 'f' ? 'e' : 'f') + tag.slice(1);

      expect(() => servicio.decrypt(`${iv}:${tagAlterado}:${contenido}`)).toThrow(ErrorSeguridad);
    });

    it('rechaza el descifrado con una clave distinta', () => {
      const cifrado = servicio.encrypt('secreto');
      const otroServicio = new SecurityService('b'.repeat(64));

      expect(() => otroServicio.decrypt(cifrado)).toThrow(ErrorSeguridad);
    });

    it('rechaza un IV alterado', () => {
      const cifrado = servicio.encrypt('secreto');
      const [iv, tag, contenido] = cifrado.split(':');
      const ivAlterado = (iv[0] === '0' ? '1' : '0') + iv.slice(1);

      expect(() => servicio.decrypt(`${ivAlterado}:${tag}:${contenido}`)).toThrow(ErrorSeguridad);
    });
  });

  describe('formatos inválidos', () => {
    it('rechaza cadenas sin los tres segmentos', () => {
      expect(() => servicio.decrypt('sin-separadores')).toThrow(ErrorSeguridad);
      expect(() => servicio.decrypt('aa:bb')).toThrow(ErrorSeguridad);
      expect(() => servicio.decrypt('aa:bb:cc:dd')).toThrow(ErrorSeguridad);
    });

    it('rechaza un IV de longitud incorrecta', () => {
      expect(() => servicio.decrypt(`${'0'.repeat(23)}:${'0'.repeat(32)}:`)).toThrow(ErrorSeguridad);
      expect(() => servicio.decrypt(`00:${'0'.repeat(32)}:`)).toThrow(ErrorSeguridad);
    });

    it('rechaza un AuthTag de longitud incorrecta', () => {
      const iv = '0'.repeat(24);
      expect(() => servicio.decrypt(`${iv}:00:`)).toThrow(ErrorSeguridad);
    });

    it('rechaza contenido cifrado no hexadecimal o de longitud impar', () => {
      const iv = '0'.repeat(24);
      const tag = '0'.repeat(32);
      expect(() => servicio.decrypt(`${iv}:${tag}:zz`)).toThrow(ErrorSeguridad);
      expect(() => servicio.decrypt(`${iv}:${tag}:abc`)).toThrow(ErrorSeguridad);
    });

    it('rechaza entradas que no sean cadenas', () => {
      expect(() => servicio.encrypt(undefined as unknown as string)).toThrow(ErrorSeguridad);
      expect(() => servicio.decrypt(null as unknown as string)).toThrow(ErrorSeguridad);
    });
  });

  describe('clave maestra', () => {
    it('acepta la clave como Buffer de 32 bytes', () => {
      const clave = Buffer.from(CLAVE_HEX, 'hex');
      const desdeBuffer = new SecurityService(clave);
      expect(desdeBuffer.decrypt(servicio.encrypt('compatible'))).toBe('compatible');
    });

    it('acepta la clave como Buffer propio y no muta el externo', () => {
      const clave = Buffer.from(CLAVE_HEX, 'hex');
      const original = Buffer.from(clave);
      new SecurityService(clave);
      expect(clave.equals(original)).toBe(true);
    });

    it('rechaza un Buffer que no tenga 32 bytes', () => {
      expect(() => new SecurityService(Buffer.alloc(16))).toThrow(ErrorSeguridad);
      expect(() => new SecurityService(Buffer.alloc(LONGITUD_CLAVE_BYTES - 1))).toThrow(ErrorSeguridad);
    });

    it('rechaza claves hex inválidas o de longitud incorrecta', () => {
      expect(() => new SecurityService('abc')).toThrow(ErrorSeguridad);
      expect(() => new SecurityService('z'.repeat(64))).toThrow(ErrorSeguridad);
      expect(() => new SecurityService('a'.repeat(63))).toThrow(ErrorSeguridad);
    });

    it('genera claves maestras hex de 64 caracteres distintas entre sí', () => {
      const claveA = generarClaveMaestraHex();
      const claveB = generarClaveMaestraHex();

      expect(claveA).toHaveLength(64);
      expect(claveA).toMatch(PATRON_HEX);
      expect(claveA).not.toBe(claveB);
    });
  });

  describe('SecurityService.desdeArchivoClave', () => {
    it('crea el archivo de clave si no existe y permite descifrar tras reiniciar', async () => {
      const rutaClave = join(directorioTemporal, 'sub', 'clave-maestra.hex');

      const primera = await SecurityService.desdeArchivoClave(rutaClave);
      const cifrado = primera.encrypt('clave-persistida');

      const contenido = await readFile(rutaClave, 'utf-8');
      expect(contenido.trim()).toHaveLength(64);
      expect(contenido.trim()).toMatch(PATRON_HEX);

      const segunda = await SecurityService.desdeArchivoClave(rutaClave);
      expect(segunda.decrypt(cifrado)).toBe('clave-persistida');
    });

    it('reutiliza la clave existente sin regenerarla', async () => {
      const rutaClave = join(directorioTemporal, 'clave.hex');
      await SecurityService.desdeArchivoClave(rutaClave);
      const contenidoOriginal = await readFile(rutaClave, 'utf-8');

      await SecurityService.desdeArchivoClave(rutaClave);
      const contenidoFinal = await readFile(rutaClave, 'utf-8');

      expect(contenidoFinal).toBe(contenidoOriginal);
    });

    it('lanza ErrorSeguridad si el archivo no contiene una clave válida', async () => {
      const rutaClave = join(directorioTemporal, 'clave-invalida.hex');
      await writeFile(rutaClave, 'no-es-hexadecimal', 'utf-8');

      await expect(SecurityService.desdeArchivoClave(rutaClave)).rejects.toThrow(ErrorSeguridad);
    });

    it('ignora espacios y saltos de línea alrededor de la clave', async () => {
      const rutaClave = join(directorioTemporal, 'clave-espacios.hex');
      await writeFile(rutaClave, `\n  ${CLAVE_HEX}  \n`, 'utf-8');

      const servicioArchivo = await SecurityService.desdeArchivoClave(rutaClave);
      expect(servicioArchivo.decrypt(servicio.encrypt('espacios'))).toBe('espacios');
    });
  });
});
