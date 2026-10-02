import { v4 as uuid } from 'uuid';
import db from '../database';

export interface EnvioTelegram {
  enviado: boolean;
  messageId?: number;
}

export class TelegramService {
  private static headers(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  private static tokenPorDefecto(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        'Falta configurar TELEGRAM_BOT_TOKEN en el .env del backend — creá un bot con @BotFather en Telegram y pegá el token que te da en backend/.env.'
      );
    }
    return token;
  }

  // Cada grupo puede tener su propio bot (su propio token, guardado en
  // telegram_grupos.bot_token) — si no tiene uno propio, usa el bot por
  // defecto del .env (así Operaciones, el primer grupo configurado, sigue
  // andando sin cambios).
  static async tokenParaGrupo(nombreGrupo: string): Promise<string> {
    const grupo: any = await new Promise((resolve, reject) => {
      db.get('SELECT bot_token FROM telegram_grupos WHERE nombre = ?', [nombreGrupo], (err, row) =>
        err ? reject(err) : resolve(row)
      );
    });
    return grupo?.bot_token || this.tokenPorDefecto();
  }

  static async enviarMensaje(token: string, chatId: string, texto: string): Promise<number> {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' }),
    });
    if (!resp.ok) {
      throw new Error(`Telegram rechazó el mensaje (${resp.status}): ${await resp.text()}`);
    }
    const data: any = await resp.json();
    return data?.result?.message_id;
  }

  static async borrarMensaje(token: string, chatId: string, messageId: number): Promise<void> {
    const resp = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    if (!resp.ok) {
      throw new Error(`Telegram rechazó el borrado (${resp.status}): ${await resp.text()}`);
    }
  }

  static async borrarMensajeLogueado(logId: string): Promise<void> {
    const fila: any = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM telegram_mensajes WHERE id = ?', [logId], (err, row) =>
        err ? reject(err) : resolve(row)
      );
    });
    if (!fila) {
      throw new Error('No se encontró ese mensaje en el log de Telegram.');
    }
    if (fila.borrado) {
      return;
    }
    const token = await this.tokenParaGrupo(fila.grupo_nombre);
    await this.borrarMensaje(token, fila.chat_id, fila.message_id);
    await new Promise<void>((resolve, reject) => {
      db.run('UPDATE telegram_mensajes SET borrado = 1 WHERE id = ?', [logId], (err) =>
        err ? reject(err) : resolve()
      );
    });
  }

  static async listarMensajes(limit = 30): Promise<any[]> {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM telegram_mensajes ORDER BY created_at DESC LIMIT ?',
        [limit],
        (err, rows: any[]) => (err ? reject(err) : resolve(rows || []))
      );
    });
  }

  static async enviarAGrupo(nombreGrupo: string, texto: string, ordenId?: string): Promise<EnvioTelegram> {
    const grupo: any = await new Promise((resolve, reject) => {
      db.get('SELECT chat_id, bot_token FROM telegram_grupos WHERE nombre = ?', [nombreGrupo], (err, row) =>
        err ? reject(err) : resolve(row)
      );
    });
    if (!grupo?.chat_id) {
      console.log(`[Telegram] Grupo "${nombreGrupo}" todavía sin chat_id configurado — no se mandó: ${texto}`);
      return { enviado: false };
    }
    const token = grupo.bot_token || this.tokenPorDefecto();
    const messageId = await this.enviarMensaje(token, grupo.chat_id, texto);
    if (messageId) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO telegram_mensajes (id, grupo_nombre, chat_id, message_id, texto, orden_id) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid(), nombreGrupo, grupo.chat_id, messageId, texto, ordenId || null],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }
    return { enviado: true, messageId };
  }

  static async listarGrupos(): Promise<Array<{ id: string; nombre: string; chat_id: string | null; bot_token: string | null }>> {
    return new Promise((resolve, reject) => {
      db.all('SELECT id, nombre, chat_id, bot_token FROM telegram_grupos ORDER BY nombre', [], (err, rows: any[]) =>
        err ? reject(err) : resolve(rows || [])
      );
    });
  }

  static async guardarChatId(nombreGrupo: string, chatId: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      db.run('UPDATE telegram_grupos SET chat_id = ? WHERE nombre = ?', [chatId, nombreGrupo], (err) =>
        err ? reject(err) : resolve()
      );
    });
  }

  static async guardarBotToken(nombreGrupo: string, token: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      db.run('UPDATE telegram_grupos SET bot_token = ? WHERE nombre = ?', [token, nombreGrupo], (err) =>
        err ? reject(err) : resolve()
      );
    });
  }
}
