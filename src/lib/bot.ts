import { Context, Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import logger from '@lib/logger'
import { audioTranscription, chatCompletion } from './chatgpt'
import { ChatCompletionRequestMessage } from 'openai'
import { oggToMp3 } from './audio'

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
      logger.debug({ message: ctx.message }, 'Middleware call')

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
      const fromUsername = ctx.message.from.username
      if (!fromUsername) {
        return
      }
      this.promptHistory[fromUsername] = []
      await ctx.reply(`Starting a new chat`)
    })

    bot.command('exit', async (ctx) => {
      await ctx.reply(`Ended current operation`)
    })

    bot.on(message('text'), async (ctx) => {
      const text = ctx.message.text.trim()
      const fromUsername = ctx.message.from.username

      logger.debug({ message: ctx.message })

      const isMention = ctx.message.entities?.find(
        (v) =>
          v.type === 'mention' && text.substring(0, v.length) === BOT_USERNAME
      )

      if (!text || !fromUsername || (ctx.chat.type === 'group' && !isMention)) {
        return
      }

      const prompt = isMention
        ? text.substring(BOT_USERNAME.length).trim()
        : text

      ctx.sendChatAction('typing')

      try {
        const response = await this.handleChatCompletion(fromUsername, prompt)

        const params =
          ctx.chat.type === 'private'
            ? {}
            : { reply_to_message_id: ctx.message.message_id }
        ctx.reply(response, params)
      } catch (err) {
        const error = err as Error
        ctx.reply(`An error occurred: ${error.message}`)
      }
    })

    bot.on(message('voice'), async (ctx) => {
      const fromUsername = ctx.message.from.username

      if (!fromUsername) {
        return
      }

      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id)
      const outputFile = await oggToMp3(fileLink.toString())
      const transcription = await audioTranscription(outputFile)

      logger.debug({ transcription, fileLink })

      ctx.sendChatAction('typing')

      try {
        const response = await this.handleChatCompletion(
          fromUsername,
          transcription
        )

        const params =
          ctx.chat.type === 'private'
            ? {}
            : { reply_to_message_id: ctx.message.message_id }
        ctx.reply(response, params)
      } catch (err) {
        const error = err as Error
        ctx.reply(`An error occurred: ${error.message}`)
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

  private async handleChatCompletion(fromUsername: string, prompt: string) {
    this.appendToPromptHistory(fromUsername, {
      role: 'user',
      content: prompt,
    })

    const response = await chatCompletion({
      model: this.gptModel,
      messages: this.getPromptHistory(fromUsername),
    })

    this.appendToPromptHistory(fromUsername, {
      role: 'assistant',
      content: response,
    })

    return response
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
