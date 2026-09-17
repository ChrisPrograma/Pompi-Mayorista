/**
 * Entrar y crear la cuenta.
 *
 * Una sola pantalla con dos solapas, no dos pantallas: quien llega la primera
 * vez no tiene cuenta y tiene que ver "Crear mi cuenta" sin buscarlo; quien ya
 * la tiene no tiene que salir de ningún lado para entrar.
 *
 * Solo aparece cuando hay backend configurado. Sin backend la app entra directa
 * y guarda todo en el dispositivo — no tiene sentido pedirle una contraseña a
 * alguien para después guardarle los datos en su propio teléfono.
 */

import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  contrasenaValida, entrar, ErrorIngreso, registrarse, reglasContrasena, type Sesion,
} from '../data/sesion.ts';
import { Icono } from './componentes.tsx';

type Modo = 'entrar' | 'registro';

export const PantallaAcceso = ({
  alEntrar, alCerrar, alReclamar, modoInicial = 'entrar',
}: {
  alEntrar: (s: Sesion) => void;
  /** Sin esto no habría forma de volver a la app sin cuenta. */
  alCerrar?: () => void;
  /** Asocia al usuario con el negocio. Devuelve el motivo si no se pudo. */
  alReclamar?: () => Promise<string | null>;
  modoInicial?: Modo;
}) => {
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [verContrasena, setVerContrasena] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const registrando = modo === 'registro';
  const listo = Boolean(email.trim()) && (registrando ? contrasenaValida(contrasena) : Boolean(contrasena));

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setError(null);
    setContrasena('');
  };

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (trabajando || !listo) return;
    setError(null);
    setTrabajando(true);
    try {
      const s = registrando ? await registrarse(email, contrasena) : await entrar(email, contrasena);
      const problema = alReclamar ? await alReclamar() : null;
      if (problema) { setError(problema); setTrabajando(false); return; }
      alEntrar(s);
    } catch (e) {
      setError(e instanceof ErrorIngreso
        ? e.message
        // Un fallo de red acá casi siempre es falta de señal, no datos mal puestos.
        : 'No se pudo conectar. Fijate que tengas señal y probá de nuevo.');
      setTrabajando(false);
    }
  };

  return (
    <div className="app">
      <div className="ingreso">
        {alCerrar && (
          <button className="ingreso-volver" onClick={alCerrar} aria-label="Volver a la app">
            <Icono id="i-back" clase="ico-s" /> Volver
          </button>
        )}

        <div className="ingreso-marca">
          <div className="brand-mark grande"><Icono id="i-paw" /></div>
          <h1>Pompi Mayorista</h1>
          <p>
            {registrando
              ? 'Creá tu cuenta para que tus ventas se guarden y las veas desde cualquier teléfono.'
              : 'Entrá para que tus ventas se guarden y las veas desde cualquier teléfono.'}
          </p>
        </div>

        <div className="solapas" role="tablist">
          <button role="tab" aria-selected={!registrando} onClick={() => cambiarModo('entrar')}>
            Ya tengo cuenta
          </button>
          <button role="tab" aria-selected={registrando} onClick={() => cambiarModo('registro')}>
            Crear mi cuenta
          </button>
        </div>

        <form className="ingreso-form" onSubmit={enviar}>
          <label className="campo">
            <span>Tu mail</span>
            <input className="texto" type="email" inputMode="email"
              autoComplete={registrando ? 'email' : 'username'}
              autoCapitalize="none" autoCorrect="off" value={email} placeholder="nombre@mail.com"
              onChange={(ev: ChangeEvent<HTMLInputElement>) => setEmail(ev.target.value)} />
          </label>

          <label className="campo">
            <span>Tu contraseña</span>
            <span className="campo-con-boton">
              <input className="texto" type={verContrasena ? 'text' : 'password'}
                autoComplete={registrando ? 'new-password' : 'current-password'} value={contrasena}
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setContrasena(ev.target.value)} />
              {/* Poder verla importa: escribir a ciegas en un celular, en la calle
                  y con el sol de frente, es la causa número uno de "no me deja entrar". */}
              <button type="button" className="ver-clave" onClick={() => setVerContrasena((v) => !v)}>
                {verContrasena ? 'Ocultar' : 'Ver'}
              </button>
            </span>
          </label>

          {/* Las reglas se muestran mientras escribe, tildándose solas. Decirle
              después de apretar "no cumple los requisitos" obliga a adivinar cuál. */}
          {registrando && (
            <ul className="reglas">
              {reglasContrasena.map((r) => {
                const ok = r.cumple(contrasena);
                return (
                  <li key={r.texto} className={ok ? 'ok' : ''}>
                    <Icono id={ok ? 'i-check' : 'i-minus'} clase="ico-s" /> {r.texto}
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <div className="ingreso-error" role="alert">
              <Icono id="i-alert" clase="ico-s" /> <span>{error}</span>
            </div>
          )}

          <button className="btn lg block" type="submit" disabled={trabajando || !listo}>
            {trabajando
              ? (registrando ? 'Creando…' : 'Entrando…')
              : (registrando ? 'Crear mi cuenta' : 'Entrar')}
          </button>
        </form>

        <p className="ingreso-pie">
          {registrando
            ? 'Con mayúsculas y números alcanza. No hacen falta símbolos raros.'
            : '¿No te acordás la contraseña? Escribile a quien te armó la aplicación y te la cambia.'}
        </p>
      </div>
    </div>
  );
};
