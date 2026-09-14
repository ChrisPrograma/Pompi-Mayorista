/**
 * Declaraciones mínimas de React, SOLO para verificar en un entorno sin npm.
 *
 * NO forma parte del proyecto: vive fuera de `src/` y se incluye únicamente desde
 * `tsconfig.verificacion.json`. En una máquina normal se instala `@types/react`
 * y esto no se usa nunca (de hecho entraría en conflicto, por eso está aparte).
 *
 * Tipa los hooks con sus genéricos reales, así el chequeo SÍ valida el código
 * propio: props mal pasadas, estados con el tipo equivocado, argumentos de más.
 * Lo que queda sin verificar es React en sí, que no es lo que escribimos acá.
 */

interface ElementoReact { type: any; props: any; key: any }

declare namespace JSX {
  interface IntrinsicElements {
    [nombre: string]: any;
  }
  interface Element extends ElementoReact {}
  interface ElementAttributesProperty { props: {}; }
  interface ElementChildrenAttribute { children: {}; }
}

declare module 'react' {
  export type ReactNode =
    | ReactElement | string | number | boolean | null | undefined | Iterable<ReactNode>;
  export interface ReactElement extends ElementoReact {}
  export type Key = string | number;

  export interface ChangeEvent<T = Element> {
    target: T & { value: string };
    currentTarget: T & { value: string };
    preventDefault(): void;
  }

  export interface MutableRefObject<T> { current: T }
  export interface RefObject<T> { readonly current: T | null }

  export type Dispatch<A> = (valor: A) => void;
  export type SetStateAction<S> = S | ((anterior: S) => S);

  export function useState<S>(inicial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(efecto: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(calcular: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(inicial: T): MutableRefObject<T>;
  export function useRef<T>(inicial: T | null): RefObject<T>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;

  export const StrictMode: (props: { children?: ReactNode }) => ReactElement;
  export const Fragment: (props: { children?: ReactNode }) => ReactElement;

  export interface CSSProperties { [prop: string]: string | number | undefined }
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export interface Root { render(hijo: ReactNode): void; unmount(): void }
  export function createRoot(contenedor: Element | DocumentFragment): Root;
}

declare module '*.css';

interface HTMLInputElement { value: string }
