import { useEffect, useState, type ReactNode } from 'react';
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

export const Cantidad = ({
  valor, alCambiar, maximo, minimo = 0,
}: { valor: number; alCambiar: (n: number) => void; maximo?: number; minimo?: number }) => (
  <span className="qty">
    <button className="qbtn" aria-label="Sacar uno"
      disabled={valor <= minimo} onClick={() => alCambiar(valor - 1)}>
      <Icono id="i-minus" clase="ico-s" />
    </button>
    <span className="qnum">{valor}</span>
    <button className="qbtn plus" aria-label="Agregar uno"
      disabled={maximo !== undefined && valor >= maximo} onClick={() => alCambiar(valor + 1)}>
      <Icono id="i-plus" clase="ico-s" />
    </button>
  </span>
);

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
