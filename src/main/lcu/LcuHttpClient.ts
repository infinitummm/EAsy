/**
 * Cliente HTTPS local para la LCU API (*League Client Update API*) de League of Legends.
 *
 * Se comunica exclusivamente con `https://127.0.0.1:[Puerto]` utilizando autenticación
 * Basic Auth (`riot:[PasswordAutenticacion]`) y omitiendo la validación del certificado
 * SSL autofirmado de Riot (`rejectUnauthorized: false`), tal como exige la especificación.
 */

import { request as solicitarHttps, type RequestOptions as OpcionesHttps } from 'node:https';
import { request as solicitarHttp, type RequestOptions as OpcionesHttp } from 'node:http';
import type { LcuCredentials } from '@shared/types';

/** Métodos HTTP soportados por la LCU API. */
export type MetodoHttp = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Opciones de construcción del cliente HTTP LCU. */
export interface OpcionesLcuHttpClient {
  /** Host de conexión. Por defecto `127.0.0.1`. */
  host?: string;
  /** Protocolo a utilizar. Por defecto `https` (el real de la LCU). */
  protocolo?: 'https' | 'http';
  /** Tiempo máximo de espera por petición en milisegundos. Por defecto 10000. */
  timeoutMs?: number;
  /**
   * Si es `true`, se valida el certificado TLS. Por defecto `false`, ya que la LCU
   * utiliza un certificado autofirmado propio de Riot en `127.0.0.1`.
   */
  rejectUnauthorized?: boolean;
}

/** Error lanzado al intentar usar el cliente sin credenciales LCU configuradas. */
export class ErrorLcuNoConfigurado extends Error {
  constructor() {
    super('El cliente HTTP LCU no tiene credenciales configuradas. Se requiere leer el lockfile primero.');
    this.name = 'ErrorLcuNoConfigurado';
  }
}

/** Error lanzado cuando la LCU API responde con un código HTTP de error (>= 400). */
export class ErrorPeticionLcu extends Error {
  constructor(
    public readonly codigoEstado: number,
    public readonly cuerpo: string,
    public readonly endpoint: string
  ) {
    let detalle = '';
    try {
      const parsed = JSON.parse(cuerpo);
      detalle = parsed.message || parsed.errorCode || '';
    } catch {
      detalle = cuerpo ? cuerpo.slice(0, 100) : '';
    }
    const extra = detalle ? ` (${detalle})` : '';
    super(`La petición LCU a "${endpoint}" falló con estado HTTP ${codigoEstado}${extra}.`);
    this.name = 'ErrorPeticionLcu';
  }
}

/** Error lanzado cuando la respuesta no puede interpretarse como JSON válido. */
export class ErrorRespuestaInvalida extends Error {
  constructor(mensaje: string, public readonly endpoint: string) {
    super(mensaje);
    this.name = 'ErrorRespuestaInvalida';
  }
}

/**
 * Cliente HTTP local para la LCU API. Mantiene las credenciales actuales del lockfile
 * y expone una llamada genérica `request` para cualquier endpoint del cliente de League.
 */
export class LcuHttpClient {
  private credenciales: LcuCredentials | null;
  private readonly opciones: Required<OpcionesLcuHttpClient>;

  constructor(credenciales: LcuCredentials | null = null, opciones: OpcionesLcuHttpClient = {}) {
    this.credenciales = credenciales;
    this.opciones = {
      host: opciones.host ?? '127.0.0.1',
      protocolo: opciones.protocolo ?? 'https',
      timeoutMs: opciones.timeoutMs ?? 10_000,
      rejectUnauthorized: opciones.rejectUnauthorized ?? false,
    };
  }

  /** Actualiza las credenciales de conexión (por ejemplo, tras reiniciarse el cliente de LoL). */
  actualizarCredenciales(credenciales: LcuCredentials | null): void {
    this.credenciales = credenciales;
  }

  /** Devuelve `true` si el cliente ya tiene credenciales LCU configuradas. */
  estaConfigurado(): boolean {
    return this.credenciales !== null;
  }

  /** Devuelve el puerto actual de conexión o `null` si no hay credenciales. */
  obtenerPuerto(): number | null {
    return this.credenciales?.port ?? null;
  }

  /** Devuelve una copia de las credenciales actuales o `null` si no hay. */
  obtenerCredenciales(): LcuCredentials | null {
    return this.credenciales ? { ...this.credenciales } : null;
  }

  /**
   * Ejecuta una petición HTTP contra la LCU API.
   * @throws {ErrorLcuNoConfigurado} Si no hay credenciales configuradas.
   * @throws {ErrorPeticionLcu} Si la LCU API responde con estado HTTP >= 400.
   * @throws {ErrorRespuestaInvalida} Si la respuesta JSON no puede parsearse.
   */
  async request<T>(metodo: MetodoHttp, endpoint: string, cuerpo?: unknown): Promise<T> {
    const credenciales = this.credenciales;
    if (!credenciales) {
      throw new ErrorLcuNoConfigurado();
    }

    const ruta = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const datos = cuerpo === undefined ? undefined : JSON.stringify(cuerpo);

    const cabeceras: Record<string, string> = {
      Authorization: credenciales.tokenBase64,
      Accept: 'application/json',
    };
    if (datos !== undefined) {
      cabeceras['Content-Type'] = 'application/json';
      cabeceras['Content-Length'] = String(Buffer.byteLength(datos, 'utf-8'));
    }

    const opcionesBase = {
      host: this.opciones.host,
      port: credenciales.port,
      path: ruta,
      method: metodo,
      headers: cabeceras,
      timeout: this.opciones.timeoutMs,
    };

    return new Promise<T>((resolver, rechazar) => {
      const manejarRespuesta = (respuesta: import('node:http').IncomingMessage): void => {
        const fragmentos: Buffer[] = [];
        respuesta.on('data', (fragmento: Buffer) => fragmentos.push(fragmento));
        respuesta.on('end', () => {
          const texto = Buffer.concat(fragmentos).toString('utf-8');
          const estado = respuesta.statusCode ?? 0;
          const tipoContenido = String(respuesta.headers['content-type'] ?? '');

          if (estado >= 400) {
            rechazar(new ErrorPeticionLcu(estado, texto, ruta));
            return;
          }

          if (!texto.trim()) {
            resolver(undefined as T);
            return;
          }

          if (tipoContenido.includes('json')) {
            try {
              resolver(JSON.parse(texto) as T);
            } catch {
              rechazar(new ErrorRespuestaInvalida(`La respuesta de "${ruta}" no es JSON válido.`, ruta));
            }
            return;
          }

          if (pareceJson(texto)) {
            try {
              resolver(JSON.parse(texto) as T);
              return;
            } catch {
              // El cuerpo parecía JSON pero no lo es: se devuelve como texto plano.
            }
          }

          resolver(texto as unknown as T);
        });
      };

      const peticion =
        this.opciones.protocolo === 'https'
          ? solicitarHttps(
              { ...opcionesBase, rejectUnauthorized: this.opciones.rejectUnauthorized } as OpcionesHttps,
              manejarRespuesta
            )
          : solicitarHttp(opcionesBase as OpcionesHttp, manejarRespuesta);

      peticion.on('error', (error: Error) => {
        rechazar(error);
      });

      peticion.on('timeout', () => {
        peticion.destroy(
          new Error(`Tiempo de espera agotado (${this.opciones.timeoutMs} ms) al llamar a "${ruta}".`)
        );
      });

      if (datos !== undefined) {
        peticion.write(datos);
      }
      peticion.end();
    });
  }
}

/** Comprueba de forma heurística si un texto parece una estructura JSON serializada. */
function pareceJson(texto: string): boolean {
  const recortado = texto.trim();
  return (
    (recortado.startsWith('{') && recortado.endsWith('}')) ||
    (recortado.startsWith('[') && recortado.endsWith(']')) ||
    (recortado.startsWith('"') && recortado.endsWith('"') && recortado.length >= 2)
  );
}
