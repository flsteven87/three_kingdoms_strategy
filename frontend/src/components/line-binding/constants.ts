import type { LineCustomCommandCreate } from '@/types/line-binding'

export const LINE_BOT_ID = import.meta.env.VITE_LINE_BOT_ID || '@977nncax'
export const ADD_FRIEND_URL = `https://line.me/R/ti/p/${LINE_BOT_ID}`
export const EMPTY_COMMAND_FORM: LineCustomCommandCreate = {
  command_name: '',
  trigger_keyword: '/',
  response_message: '',
  is_enabled: true
}
