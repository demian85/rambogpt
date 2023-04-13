import { Context, Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import logger from '@lib/logger'
import { chatCompletion } from './chatgpt'
import { ChatCompletionRequestMessage } from 'openai'

const BOT_USERNAME = '@rambogpt_bot'

class RamboGPT {
  private telegramApiToken: string
  private bot: Telegraf
  private gptModel: string
  private promptHistory: Record<string, ChatCompletionRequestMessage[]>

  constructor(telegramApiToken: string) {
    this.telegramApiToken = telegramApiToken
    this.bot = new Telegraf(telegramApiToken)
    this.gptModel = 'gpt-3.5-turbo'
    this.promptHistory = {}
  }

  init() {
    const { bot } = this

    bot.start((ctx) => ctx.reply(`Welcome! I'm your AI assistant`))

    bot.help((ctx) => ctx.reply('Talk to me'))

    bot.use((ctx, _next) => {
      logger.debug({ chat: ctx.chat }, 'Middleware call')

      if (ctx.chat?.type !== 'private') {
        throw new Error('Bot not allowed in groups')
      }
      if (
        !ctx.chat.username ||
        !['demian85', 'SilvanaFontana'].includes(ctx.chat.username)
      ) {
        throw new Error('Forbidden')
      }
      _next()
    })

    bot.command('new', async (ctx) => {
      await ctx.reply(`Starting a new chat`)
    })

    bot.command('exit', async (ctx) => {
      await ctx.reply(`Ended current operation`)
    })

    bot.on(message('text'), async (ctx) => {
      const text = ctx.message.text.trim()
      const fromUsername = ctx.message.from.username

      logger.debug({ message: ctx.message })

      if (!text || !fromUsername) {
        return
      }

      const isMention = ctx.message.entities?.find(
        (v) =>
          v.type === 'mention' && text.substring(0, v.length) === BOT_USERNAME
      )
      const prompt = isMention
        ? text.substring(BOT_USERNAME.length).trim()
        : text

      this.appendToPromptHistory(fromUsername, {
        role: 'user',
        content: prompt,
      })

      ctx.sendChatAction('typing')

      const response = await chatCompletion({
        model: this.gptModel,
        messages: this.getPromptHistory(fromUsername),
      })

      if (response) {
        this.appendToPromptHistory(fromUsername, {
          role: 'assistant',
          content: response,
        })
        const params =
          ctx.chat.type === 'private'
            ? {}
            : { reply_to_message_id: ctx.message.message_id }
        ctx.reply(response, params)
      }
    })

    // bot.on('callback_query', async (ctx) => {
    //   await ctx.answerCbQuery()
    // })

    // bot.on('inline_query', async (ctx) => {
    //   await ctx.answerInlineQuery([])
    // })

    bot.launch()

    logger.debug('Telegram Bot initialized')
  }

  private appendToPromptHistory(
    fromUsername: string,
    entry: ChatCompletionRequestMessage
  ) {
    if (!this.promptHistory[fromUsername]) {
      this.promptHistory[fromUsername] = [entry]
    } else {
      this.promptHistory[fromUsername].push(entry)
    }
  }

  private getPromptHistory(fromUsername: string) {
    return this.promptHistory[fromUsername] ?? []
  }
}

export default RamboGPT
