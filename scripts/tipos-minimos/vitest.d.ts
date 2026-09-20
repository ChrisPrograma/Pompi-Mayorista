/**
 * Declaraciones mínimas de vitest, SOLO para verificar en un entorno sin npm.
 *
 * Existe por un error concreto y evitable: al sacar el stock del auto quedaron
 * dos importaciones sin usar en un archivo de test. El chequeo local salteaba
 * los tests —porque no tenía los tipos de vitest— y el de Vercel no, así que
 * `tsc --noEmit` falló allá con TS6196, el deploy se canceló y el sitio siguió
 * sirviendo la versión anterior. Desde afuera parecía que los cambios no se
 * habían hecho.
 *
 * Con esto, `tsconfig.completo.json` puede incluir los tests y el chequeo local
 * mira exactamente los mismos archivos que el build de producción.
 *
 * NO forma parte del proyecto: vive fuera de `src/`. En una máquina con las
 * dependencias instaladas se usa `npm run typecheck`, que toma los tipos reales
 * de vitest y no pasa por acá.
 */

declare module 'vitest' {
  interface Afirmacion<T = any> {
    toBe(esperado: any): void;
    toEqual(esperado: any): void;
    toStrictEqual(esperado: any): void;
    toBeCloseTo(esperado: number, digitos?: number): void;
    toBeGreaterThan(esperado: number): void;
    toBeGreaterThanOrEqual(esperado: number): void;
    toBeLessThan(esperado: number): void;
    toBeLessThanOrEqual(esperado: number): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeInstanceOf(clase: any): void;
    toContain(esperado: any): void;
    toContainEqual(esperado: any): void;
    toHaveLength(esperado: number): void;
    toHaveProperty(clave: string, valor?: any): void;
    toThrow(esperado?: any): void;
    toMatch(esperado: string | RegExp): void;
    toMatchObject(esperado: any): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(n: number): void;
    toHaveBeenCalledWith(...args: any[]): void;
    readonly not: Afirmacion<T>;
    readonly resolves: Afirmacion<T>;
    readonly rejects: Afirmacion<T>;
  }

  interface Bloque {
    (nombre: string, fn: () => void | Promise<void>): void;
    only: Bloque;
    skip: Bloque;
    todo: (nombre: string) => void;
    each: (casos: readonly any[]) => Bloque;
  }

  export const describe: Bloque;
  export const it: Bloque;
  export const test: Bloque;

  export function expect<T>(valor: T): Afirmacion<T>;

  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;

  export const vi: {
    fn: (impl?: (...args: any[]) => any) => any;
    spyOn: (objeto: any, metodo: any) => any;
    stubGlobal: (nombre: string, valor: any) => void;
    unstubAllGlobals: () => void;
    useFakeTimers: () => void;
    useRealTimers: () => void;
    resetAllMocks: () => void;
    restoreAllMocks: () => void;
  };
}
