import logger from '@lib/logger'
import { OpenAIResponseError } from '@lib/types'
import { Configuration, CreateChatCompletionRequest, OpenAIApi } from 'openai'

const DEFAULT_MODEL = 'gpt-3.5-turbo'

const openAIConfiguration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(openAIConfiguration)

export async function chatCompletion(
  params: CreateChatCompletionRequest
): Promise<string> {
  logger.debug({ params }, 'Sending OpenAI request...')

  try {
    const completion = await openai.createChatCompletion(params)
    const response = completion.data.choices[0].message?.content ?? ''

    logger.debug({ response }, 'OpenAI response')

    return response
  } catch (err) {
    handleError(err as OpenAIResponseError)
    return ''
  }
}

function handleError(error: OpenAIResponseError) {
  if (error.response) {
    const { status, data } = error.response
    logger.error({ status, data })
  } else {
    logger.error({ error })
  }
}
