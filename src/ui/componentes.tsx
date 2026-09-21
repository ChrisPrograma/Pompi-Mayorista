import { useEffect, useState, type ChangeEvent, type FocusEvent, type ReactNode } from 'react';
import { formatear, type Cent } from '../domain/money.ts';
import { compartirArchivo, reciboComoArchivo, type DatosRecibo } from './recibo.ts';

export const Icono = ({ id, clase = '' }: { id: string; clase?: string }) => (
  <svg className={`ico ${clase}`} aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
);

export const plata = (c: Cent): string => formatear(c);

/** Abreviado para lugares angostos: $148 mil, $1,3 M */
export const plataCorta = (c: Cent): string => {
  const p = c / 100;
  if (p >= 1_000_000) return `$${(p / 1_000_000).toFixed(p >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  if (p >= 1000) return `$${Math.round(p / 1000)} mil`;
  return formatear(c);
};

export const Hoja = ({ children, alCerrar }: { children: ReactNode; alCerrar: () => void }) => (
  <div className="sheet-layer">
    <div className="scrim" onClick={alCerrar} />
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="grab" />
      {children}
    </div>
  </div>
);

export interface DatosExito {
  titulo: string;
  monto: string;
  texto: string;
  deltas: { etiqueta: string; valor: string }[];
  extra?: ReactNode;
  /** Si viene, aparece el botón para mandarle el comprobante al comercio. */
  recibo?: DatosRecibo;
}

/**
 * "Compartir comprobante".
 *
 * El archivo se genera al montar el botón y no al tocarlo, y eso no es un
 * capricho: Safari exige que `navigator.share` salga directamente del toque del
 * usuario, y si en el medio hay un `await` para dibujar la imagen, cancela el
 * menú sin decir nada. Teniéndolo hecho de antes, el toque comparte y listo.
 *
 * Dibujar el recibo son unos milisegundos, así que hacerlo de más —por ejemplo
 * si nunca lo comparte— no le cuesta nada a nadie.
 */
export const BotonCompartir = ({ datos, secundario = false }: { datos: DatosRecibo; secundario?: boolean }) => {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<'listo' | 'mandando' | 'descargado' | 'error'>('listo');

  useEffect(() => {
    let vivo = true;
    reciboComoArchivo(datos)
      .then((f) => { if (vivo) setArchivo(f); })
      .catch(() => { if (vivo) setEstado('error'); });
    return () => { vivo = false; };
  }, [datos]);

  if (estado === 'error') {
    return <p className="compartir-nota">No se pudo armar el comprobante en este navegador.</p>;
  }

  return (
    <>
      <button className={`btn ${secundario ? 'outline' : 'accent'} block compartir`}
        disabled={!archivo || estado === 'mandando'}
        onClick={async () => {
          if (!archivo) return;
          setEstado('mandando');
          const r = await compartirArchivo(archivo, `Comprobante · ${datos.cliente}`);
          setEstado(r === 'descargado' ? 'descargado' : 'listo');
        }}>
        <Icono id="i-share" clase="ico-s" />
        {archivo ? 'Compartir comprobante' : 'Preparando…'}
      </button>
      {estado === 'descargado' && (
        <p className="compartir-nota" role="status">
          Se bajó la imagen a tu computadora. Arrastrala al chat de WhatsApp.
        </p>
      )}
    </>
  );
};

export const Exito = ({ datos, alCerrar }: { datos: DatosExito; alCerrar: () => void }) => (
  <div className="exito" role="status">
    <div className="burst"><Icono id="i-check" /></div>
    <h2>{datos.titulo}</h2>
    <div className="amt num">{datos.monto}</div>
    <p>{datos.texto}</p>
    <div className="deltas">
      {datos.deltas.map((d) => (
        <div key={d.etiqueta}>{d.etiqueta}<b>{d.valor}</b></div>
      ))}
    </div>
    {datos.extra}
    {datos.recibo && <BotonCompartir datos={datos.recibo} />}
    <button className="btn lg" onClick={alCerrar}>Listo</button>
  </div>
);

/**
 * El selector de cantidad: menos, el número, más.
 *
 * El número dejó de ser un texto y pasó a ser un campo que se puede escribir.
 * Motivo del cliente, y es de los pedidos más sensatos que hizo: cargar 100
 * unidades de una entrada eran cien toques en el +. Los botones siguen igual,
 * porque para una venta de tres collares tocar dos veces es más rápido que
 * escribir.
 *
 * Tres detalles que hacen que un campo numérico no moleste:
 *
 *  - **Se escribe en un estado de texto, no en el número.** Si cada tecla se
 *    convirtiera a número, borrar el último dígito daría `NaN` → 0, y el campo
 *    volvería a "0" en la mitad de lo que está escribiendo. Acá el vacío se
 *    permite mientras tenga el foco, y al salir se acomoda solo.
 *  - **Mientras el usuario NO está escribiendo, manda el valor de afuera**, que
 *    es lo que permite que el botón + actualice el campo, y que "vaciar todo"
 *    lo vuelva a cero.
 *  - **Se recorta contra el mínimo y el máximo**, así no hay forma de anotar
 *    una cantidad negativa escribiéndola a mano.
 */
export const Cantidad = ({
  valor, alCambiar, maximo, minimo = 0, etiqueta = 'Cantidad',
}: {
  valor: number;
  alCambiar: (n: number) => void;
  maximo?: number;
  minimo?: number;
  /** Para el lector de pantalla: "Cantidad de Collar reflectivo". */
  etiqueta?: string;
}) => {
  const [escribiendo, setEscribiendo] = useState<string | null>(null);

  const acotar = (n: number) =>
    Math.max(minimo, maximo !== undefined ? Math.min(maximo, n) : n);

  const alTipear = (texto: string) => {
    // Solo dígitos: ni signo menos, ni coma, ni "e". Son unidades enteras.
    const limpio = texto.replace(/[^0-9]/g, '');
    setEscribiendo(limpio);
    if (limpio === '') return;            // todavía está borrando, no es un cero
    alCambiar(acotar(Number(limpio)));
  };

  return (
    <span className="qty">
      <button className="qbtn" aria-label="Sacar uno" type="button"
        disabled={valor <= minimo} onClick={() => alCambiar(valor - 1)}>
        <Icono id="i-minus" clase="ico-s" />
      </button>
      <input
        className="qnum" type="number" inputMode="numeric" min={minimo}
        {...(maximo !== undefined ? { max: maximo } : {})}
        aria-label={etiqueta}
        value={escribiendo ?? String(valor)}
        onFocus={(ev: FocusEvent<HTMLInputElement>) => ev.target.select()}
        onChange={(ev: ChangeEvent<HTMLInputElement>) => alTipear(ev.target.value)}
        onBlur={() => {
          // Si se fue dejándolo vacío, queda en el mínimo: un campo en blanco no
          // es una cantidad, y dejarlo así rompería el total.
          if (escribiendo === '') alCambiar(minimo);
          setEscribiendo(null);
        }}
      />
      <button className="qbtn plus" aria-label="Agregar uno" type="button"
        disabled={maximo !== undefined && valor >= maximo} onClick={() => alCambiar(valor + 1)}>
        <Icono id="i-plus" clase="ico-s" />
      </button>
    </span>
  );
};

export const Alerta = ({
  tipo, icono, titulo, texto, accion,
}: {
  tipo: 'bad' | 'warn' | 'ok';
  icono: string;
  titulo: string;
  texto: string;
  accion?: { texto: string; alTocar: () => void };
}) => (
  <div className={`alert ${tipo}`}>
    <Icono id={icono} />
    <div style={{ flex: 1 }}>
      <strong>{titulo}</strong>
      <p>{texto}</p>
    </div>
    {accion && (
      <button className="alert-act" onClick={accion.alTocar}>
        {accion.texto} <Icono id="i-arrow" clase="ico-s" />
      </button>
    )}
  </div>
);

const CLASE_CATEGORIA: Record<string, string> = {
  juguete: 'c-juguete',
  higiene: 'c-higiene',
  descanso: 'c-descanso',
};

export const claseCategoria = (cat?: string): string =>
  cat ? (CLASE_CATEGORIA[cat] ?? '') : '';

/**
 * La tarjeta del recorrido guiado.
 *
 * Va abajo de todo, encima de la app, sin tapar el elemento destacado: el
 * cliente tiene que poder ver la pantalla real mientras se le explica. Por eso
 * es una tarjeta al pie y no un modal centrado.
 */
export const Coach = ({
  paso, total, titulo, texto, alSiguiente, alSalir,
}: {
  paso: number; total: number; titulo: string; texto: string;
  alSiguiente: () => void; alSalir: () => void;
}) => (
  <div className="coach on" role="dialog" aria-label="Recorrido guiado">
    <div className="ceyebrow">Paso {paso + 1} de {total}</div>
    <h4>{titulo}</h4>
    <p>{texto}</p>
    <div className="coach-foot">
      <span className="coach-dots">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i <= paso ? 'on' : ''} />
        ))}
      </span>
      <button className="link" onClick={alSalir}>Salir</button>
      <button className="btn accent" onClick={alSiguiente}>
        {paso === total - 1 ? 'Terminar' : 'Siguiente'}
      </button>
    </div>
  </div>
);
