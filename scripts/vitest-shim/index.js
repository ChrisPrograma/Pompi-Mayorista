/**
 * Shim mínimo de vitest sobre el runner nativo de Node.
 *
 * POR QUÉ EXISTE: el entorno donde se escribió este proyecto tiene bloqueado el
 * registro de npm, así que no se pudo instalar vitest para verificar los tests.
 * Este archivo traduce la API que usan los tests (describe / it / expect) a
 * node:test + node:assert, que vienen con Node.
 *
 * EN TU MÁQUINA NO HACE FALTA: corré `npm install` y después `npm test`, y los
 * mismos archivos de test corren con vitest de verdad, sin tocar una línea.
 * Cuando eso funcione, se puede borrar `node_modules/vitest` (la copia local) y
 * esta carpeta.
 *
 * Uso sin npm:
 *   mkdir -p node_modules/vitest && cp scripts/vitest-shim/* node_modules/vitest/
 *   node --experimental-strip-types --test src/domain/__tests__/*.test.ts
 */

import { describe, it, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const tipo = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

const contiene = (real, esperado, ruta = '') => {
  for (const [k, v] of Object.entries(esperado)) {
    const r = ruta ? `${ruta}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      contiene(real?.[k] ?? {}, v, r);
    } else {
      assert.deepStrictEqual(real?.[k], v, `no coincide en "${r}"`);
    }
  }
};

export function expect(real) {
  const api = {
    toBe: (esp) => assert.strictEqual(real, esp),
    toEqual: (esp) => assert.deepStrictEqual(real, esp),
    toStrictEqual: (esp) => assert.deepStrictEqual(real, esp),
    toMatchObject: (esp) => contiene(real, esp),
    toBeNull: () => assert.strictEqual(real, null),
    toBeUndefined: () => assert.strictEqual(real, undefined),
    toBeDefined: () => assert.notStrictEqual(real, undefined),
    toBeTruthy: () => assert.ok(real),
    toBeFalsy: () => assert.ok(!real),
    toBeGreaterThan: (n) => assert.ok(real > n, `${real} no es mayor que ${n}`),
    toBeGreaterThanOrEqual: (n) => assert.ok(real >= n, `${real} no es mayor o igual que ${n}`),
    toBeLessThan: (n) => assert.ok(real < n, `${real} no es menor que ${n}`),
    toBeLessThanOrEqual: (n) => assert.ok(real <= n, `${real} no es menor o igual que ${n}`),
    toBeCloseTo: (n, digitos = 2) => {
      const tolerancia = Math.pow(10, -digitos) / 2;
      assert.ok(
        Math.abs(real - n) < tolerancia,
        `${real} no está lo bastante cerca de ${n} (tolerancia ${tolerancia})`,
      );
    },
    toMatch: (re) =>
      assert.ok(
        re instanceof RegExp ? re.test(real) : String(real).includes(re),
        `"${real}" no coincide con ${re}`,
      ),
    toContain: (x) => assert.ok(real.includes(x), `no contiene ${x}`),
    toHaveLength: (n) => assert.strictEqual(real.length, n),
    toThrow: (esp) => {
      assert.throws(real, (err) => {
        if (esp === undefined) return true;
        if (esp instanceof RegExp) return esp.test(err.message);
        if (typeof esp === 'string') return err.message.includes(esp);
        if (typeof esp === 'function') return err instanceof esp;
        return true;
      });
    },
    toBeInstanceOf: (C) => assert.ok(real instanceof C, `no es instancia de ${C.name}`),
    toBeTypeOf: (t) => assert.strictEqual(tipo(real), t),
  };

  api.not = {
    toBe: (esp) => assert.notStrictEqual(real, esp),
    toEqual: (esp) => assert.notDeepStrictEqual(real, esp),
    toBeNull: () => assert.notStrictEqual(real, null),
    toThrow: () => assert.doesNotThrow(real),
    // Lo usa el test que verifica que el recorrido no nombre funciones que ya
    // no existen. Sin esto, `expect(...).not.toContain` no era una función y el
    // test fallaba por el shim, no por el código.
    toContain: (x) => assert.ok(!real.includes(x), `no debería contener ${x}`),
    toMatch: (re) => assert.ok(
      !(re instanceof RegExp ? re.test(real) : String(real).includes(re)),
      `"${real}" no debería coincidir con ${re}`,
    ),
  };

  return api;
}

expect.soft = expect;

export { describe, it, test, before, after, beforeEach, afterEach };
export const suite = describe;
export const vi = {
  fn: (impl = () => {}) => {
    const f = (...args) => {
      f.mock.calls.push(args);
      return impl(...args);
    };
    f.mock = { calls: [] };
    return f;
  },
};
