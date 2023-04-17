import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import logger from '@lib/logger'
import { audioTranscription, chatCompletion, imageEdit } from './chatgpt'
import { ChatCompletionRequestMessage } from 'openai'
import { oggToMp3 } from './audio'
import { join } from 'path'
import sharp from 'sharp'

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

    bot.help((ctx) =>
      ctx.reply(`
Talk to me. I accept the following message types: text, voice, photo.
I only accept one photo and it must contain a caption as the prompt. I will then respond with the edited image.
    `)
    )

    bot.use(async (ctx, _next) => {
      logger.debug({ message: ctx.message }, 'Middleware call')

      await _next()
    })

    bot.command('new', async (ctx) => {
      const fromUsername = ctx.message.from.username
      if (!fromUsername) {
        return
      }
      this.promptHistory[fromUsername] = []
      await ctx.reply(`Starting a new chat`)
    })

    bot.command('mode', async (ctx) => {
      await ctx.reply(`Not available yet`)
    })

    bot.command('exit', async (ctx) => {
      await ctx.reply(`Not available yet`)
    })

    bot.on(message('text'), async (ctx) => {
      const text = ctx.message.text.trim()
      const fromUsername = ctx.message.from.username

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

      if (!fromUsername || ctx.chat.type === 'group') {
        return
      }

      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id)
      const outputFile = await oggToMp3(fileLink.toString())
      const transcription = await audioTranscription(
        outputFile,
        ctx.message.from.language_code ?? 'en'
      )

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

    bot.on(message('photo'), async (ctx) => {
      const fromUsername = ctx.message.from.username

      if (!fromUsername || ctx.chat.type === 'group') {
        return
      }

      const prompt = ctx.message.caption

      if (!prompt) {
        ctx.reply(`I'm unable to edit an image without instructions.`)
        return
      }

      const perfectSizeImage =
        ctx.message.photo.find((photo) => photo.width >= 512) ??
        ctx.message.photo.pop()

      if (!perfectSizeImage) {
        return
      }

      const fileLink = await ctx.telegram.getFileLink(perfectSizeImage.file_id)

      ctx.sendChatAction('upload_photo')

      try {
        const imageRes = await fetch(fileLink)
        const imageBlob = await imageRes.blob()
        const tempImagePath = join(__dirname, '../images', '__temp.png')
        const tempMaskPath = join(__dirname, '../images', 'mask.png')
        await sharp(Buffer.from(await imageBlob.arrayBuffer()))
          .resize(512, 512)
          .png()
          .ensureAlpha()
          .toFile(tempImagePath)
        const openAIresponse = await imageEdit(
          tempImagePath,
          tempMaskPath,
          prompt
        )
        ctx.replyWithPhoto({
          source: Buffer.from(openAIresponse[0], 'base64'),
          filename: 'edited_image.png',
        })
      } catch (err) {
        const error = err as Error
        ctx.reply(`An error occurred: ${error.message}`)
      }
    })

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
