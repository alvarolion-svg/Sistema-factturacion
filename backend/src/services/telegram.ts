import db from '../database';

// Avisos automáticos a Telegram — mismo criterio que asana.ts: un service
// chico, sin estado, que le pega directo a la API (acá la de Telegram Bot,
// https://core.telegram.org/bots/api#sendmessage). El token del bot es
// secreto (va en .env); los chat_id de cada grupo destino viven en la tabla
// telegram_grupos porque van a ser varios (Operaciones hoy, un grupo por
// equipo comercial más adelante) y así cargar uno nuevo no pide redeploy.
export class TelegramService {
  private static headers(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  private static token(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        'Falta configurar TELEGRAM_BOT_TOKEN en el .env del backend — creá un bot con @BotFather en Telegram y pegá el token que te da en backend/.env.'
      );
    }
    return token;
  }

  /**
   * Manda un mensaje a un chat_id puntual. No lo usa nadie directo salvo
   * enviarAGrupo — separado para poder testear/loguear el envío crudo.
   */
  static async enviarMensaje(chatId: string, texto: string): Promise<void> {
    const resp = await fetch(`https://api.telegram.org/bot${this.token()}/sendMessage`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' }),
    });
    if (!resp.ok) {
      throw new Error(`Telegram rechazó el mensaje (${resp.status}): ${await resp.text()}`);
    }
  }

  /**
   * Busca el chat_id configurado para un grupo por nombre (ver tabla
   * telegram_grupos) y le manda el mensaje. Si el grupo no está configurado
   * todavía (chat_id NULL — caso normal antes de que el usuario lo cargue),
   * no rompe nada: solo avisa por consola y no manda nada.
   */
  static async enviarAGrupo(nombreGrupo: string, texto: string): Promise<void> {
    const grupo: any = await new Promise((resolve, reject) => {
      db.get('SELECT chat_id FROM telegram_grupos WHERE nombre = ?', [nombreGrupo], (err, row) =>
        err ? reject(err) : resolve(row)
      );
    });
    if (!grupo?.chat_id) {
      console.log(`[Telegram] Grupo "${nombreGrupo}" todavía sin chat_id configurado — no se mandó: ${texto}`);
      return;
    }
    await this.enviarMensaje(grupo.chat_id, texto);
  }

  static async listarGrupos(): Promise<Array<{ id: string; nombre: string; chat_id: string | null }>> {
    return new Promise((resolve, reject) => {
      db.all('SELECT id, nombre, chat_id FROM telegram_grupos ORDER BY nombre', [], (err, rows: any[]) =>
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
}
