import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import logger from '@lib/logger'
import { Configuration, CreateChatCompletionRequest, OpenAIApi } from 'openai'

import type { OpenAIResponseError } from '@lib/types'

const openAIConfiguration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
  // basePath: 'https://api.openai.com/v1/chat',
})
const openai = new OpenAIApi(openAIConfiguration)

class RamboGPT {
  private telegramApiToken: string
  private bot: Telegraf
  private gptModel: string

  constructor(telegramApiToken: string) {
    this.telegramApiToken = telegramApiToken
    this.bot = new Telegraf(telegramApiToken)
    this.gptModel = 'gpt-3.5-turbo'
  }

  init() {
    const { bot } = this

    bot.start((ctx) => ctx.reply(`Welcome! I'm your AI assistant`))

    bot.help((ctx) => ctx.reply('Talk to me'))

    bot.use((ctx, _next) => {
      if (ctx.chat?.type !== 'private') {
        throw new Error('Bot not allowed in groups')
      }
      if (
        !ctx.chat.username ||
        !['demian85', 'SilvanaFontana'].includes(ctx.chat.username)
      ) {
        throw new Error('Forbidden')
      }
      console.debug('Middleware call')
      _next()
    })

    bot.command('start', async (ctx) => {
      await ctx.reply(`Start cmd`)
    })

    bot.on(message('text'), async (ctx) => {
      const prompt = ctx.message.text

      const params: CreateChatCompletionRequest = {
        model: this.gptModel,
        messages: [{ role: 'user', content: prompt }],
      }

      logger.debug({ params }, 'Sending OpenAI request...')

      try {
        const completion = await openai.createChatCompletion(params)
        const response = completion.data.choices[0].message?.content

        if (response) {
          ctx.reply(response)
        }

        logger.debug({ response }, 'OpenAI response')
      } catch (err) {
        const error = err as OpenAIResponseError
        if (error.response) {
          console.log(error.response.status)
          console.log(error.response.data)
        } else {
          console.log(error.message)
        }
      }
    })

    bot.on('callback_query', async (ctx) => {
      await ctx.answerCbQuery()
    })

    bot.on('inline_query', async (ctx) => {
      await ctx.answerInlineQuery([])
    })

    bot.launch()

    logger.debug('Telegram Bot initialized')
  }
}

export default RamboGPT
