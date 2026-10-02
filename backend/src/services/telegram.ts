import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../dbHelpers';

interface MensajeLogueado {
  id: string;
  grupo_nombre: string;
  chat_id: string;
  message_id: number;
  texto: string | null;
  orden_id: string | null;
  borrado: number | null;
  created_at: string;
}

interface GrupoTelegram {
  id: string;
  nombre: string;
  chat_id: string | null;
  // Nunca se devuelve el token (es un secreto): solo si el grupo tiene bot propio.
  bot_propio: number;
}

interface RespuestaTelegram {
  result?: { message_id?: number };
}

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
    const grupo = await dbGet<{ bot_token: string | null }>('SELECT bot_token FROM telegram_grupos WHERE nombre = ?', [nombreGrupo]);
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
    const data = (await resp.json()) as RespuestaTelegram;
    return data?.result?.message_id as number;
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
    const fila = await dbGet<MensajeLogueado>('SELECT * FROM telegram_mensajes WHERE id = ?', [logId]);
    if (!fila) {
      throw new Error('No se encontró ese mensaje en el log de Telegram.');
    }
    if (fila.borrado) {
      return;
    }
    const token = await this.tokenParaGrupo(fila.grupo_nombre);
    await this.borrarMensaje(token, fila.chat_id, fila.message_id);
    await dbRun('UPDATE telegram_mensajes SET borrado = 1 WHERE id = ?', [logId]);
  }

  static async listarMensajes(limit = 30): Promise<MensajeLogueado[]> {
    return dbAll<MensajeLogueado>('SELECT * FROM telegram_mensajes ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  static async enviarAGrupo(nombreGrupo: string, texto: string, ordenId?: string): Promise<EnvioTelegram> {
    const grupo = await dbGet<{ chat_id: string | null; bot_token: string | null }>(
      'SELECT chat_id, bot_token FROM telegram_grupos WHERE nombre = ?',
      [nombreGrupo]
    );
    if (!grupo?.chat_id) {
      console.log(`[Telegram] Grupo "${nombreGrupo}" todavía sin chat_id configurado — no se mandó: ${texto}`);
      return { enviado: false };
    }
    const token = grupo.bot_token || this.tokenPorDefecto();
    const messageId = await this.enviarMensaje(token, grupo.chat_id, texto);
    if (messageId) {
      await dbRun(
        'INSERT INTO telegram_mensajes (id, grupo_nombre, chat_id, message_id, texto, orden_id) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), nombreGrupo, grupo.chat_id, messageId, texto, ordenId || null]
      );
    }
    return { enviado: true, messageId };
  }

  static async listarGrupos(): Promise<GrupoTelegram[]> {
    return dbAll<GrupoTelegram>(
      'SELECT id, nombre, chat_id, (bot_token IS NOT NULL) AS bot_propio FROM telegram_grupos ORDER BY nombre'
    );
  }

  static async guardarChatId(nombreGrupo: string, chatId: string): Promise<void> {
    await dbRun('UPDATE telegram_grupos SET chat_id = ? WHERE nombre = ?', [chatId, nombreGrupo]);
  }

  static async guardarBotToken(nombreGrupo: string, token: string): Promise<void> {
    await dbRun('UPDATE telegram_grupos SET bot_token = ? WHERE nombre = ?', [token, nombreGrupo]);
  }
}
