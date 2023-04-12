import 'dotenv/config'

import RamboGPT from '@lib/bot'

const bot = new RamboGPT(process.env.TELEGRAM_BOT_TOKEN!)

bot.init()
