/**
 * Envoltorio mínimo de IndexedDB.
 *
 * Reemplaza a Dexie con unas 100 líneas. La razón no es evitar Dexie por
 * capricho: de toda su superficie este proyecto usa cinco operaciones
 * (guardar muchos, leer todos, leer uno, borrar uno, contar). Para eso, una
 * dependencia de ~25 kB que hay que seguir actualizando durante años no se paga.
 *
 * Todas las escrituras son `put` por clave primaria, que es exactamente lo que
 * el modelo append-only necesita: reescribir una fila con el mismo id es
 * idempotente y un reintento nunca duplica.
 */

export interface DefinicionTabla {
  nombre: string;
  /** Campo que hace de clave primaria. */
  clave: string;
  /** Índices secundarios, por nombre de campo. */
  indices?: string[];
}

const promesa = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((ok, falla) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falla(req.error);
  });

export class BaseLocal {
  private db: IDBDatabase | null = null;

  constructor(
    private nombre: string,
    private version: number,
    private tablas: DefinicionTabla[],
  ) {}

  async abrir(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    this.db = await new Promise<IDBDatabase>((ok, falla) => {
      const req = indexedDB.open(this.nombre, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const t of this.tablas) {
          const store = db.objectStoreNames.contains(t.nombre)
            ? req.transaction!.objectStore(t.nombre)
            : db.createObjectStore(t.nombre, { keyPath: t.clave });
          for (const i of t.indices ?? []) {
            if (!store.indexNames.contains(i)) store.createIndex(i, i);
          }
        }
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falla(req.error);
    });
    return this.db;
  }

  private async store(tabla: string, modo: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.abrir();
    return db.transaction(tabla, modo).objectStore(tabla);
  }

  /** Guarda muchas filas de una. Idempotente por clave primaria. */
  async guardarMuchos<T>(tabla: string, filas: T[]): Promise<void> {
    if (!filas.length) return;
    const db = await this.abrir();
    await new Promise<void>((ok, falla) => {
      const tx = db.transaction(tabla, 'readwrite');
      const store = tx.objectStore(tabla);
      for (const f of filas) store.put(f);
      tx.oncomplete = () => ok();
      tx.onerror = () => falla(tx.error);
      tx.onabort = () => falla(tx.error);
    });
  }

  async guardar<T>(tabla: string, fila: T): Promise<void> {
    await this.guardarMuchos(tabla, [fila]);
  }

  async todos<T>(tabla: string): Promise<T[]> {
    return promesa((await this.store(tabla, 'readonly')).getAll() as IDBRequest<T[]>);
  }

  async uno<T>(tabla: string, clave: IDBValidKey): Promise<T | undefined> {
    return promesa((await this.store(tabla, 'readonly')).get(clave) as IDBRequest<T | undefined>);
  }

  async borrar(tabla: string, clave: IDBValidKey): Promise<void> {
    await promesa((await this.store(tabla, 'readwrite')).delete(clave) as IDBRequest<undefined>);
  }

  /**
   * Vacía una tabla entera.
   *
   * Es la única operación destructiva de todo el archivo y tiene un solo uso
   * legítimo: tirar los datos de ejemplo cuando llegan los datos de verdad del
   * servidor. Ver `descartarSemilla` en local.ts.
   */
  async vaciar(tabla: string): Promise<void> {
    await promesa((await this.store(tabla, 'readwrite')).clear() as IDBRequest<undefined>);
  }

  /** Modifica campos de una fila existente. No crea si no existe. */
  async modificar<T extends object>(
    tabla: string,
    clave: IDBValidKey,
    cambios: Partial<T>,
  ): Promise<void> {
    const actual = await this.uno<T>(tabla, clave);
    if (!actual) return;
    await this.guardar(tabla, { ...actual, ...cambios });
  }

  /** Filas cuyo campo indexado está en la lista de valores dada. */
  async porIndice<T>(tabla: string, indice: string, valores: string[]): Promise<T[]> {
    const store = await this.store(tabla, 'readonly');
    const idx = store.index(indice);
    const partes = await Promise.all(
      valores.map((v) => promesa(idx.getAll(v) as IDBRequest<T[]>)),
    );
    return partes.flat();
  }

  async contarPorIndice(tabla: string, indice: string, valores: string[]): Promise<number> {
    const store = await this.store(tabla, 'readonly');
    const idx = store.index(indice);
    const partes = await Promise.all(
      valores.map((v) => promesa(idx.count(v) as IDBRequest<number>)),
    );
    return partes.reduce((a, b) => a + b, 0);
  }
}

/** ¿Hay IndexedDB? En un contexto sin navegador (tests, render estático) no lo hay. */
export const hayIndexedDB = (): boolean =>
  typeof indexedDB !== 'undefined' && indexedDB !== null;
