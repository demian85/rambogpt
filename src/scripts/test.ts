import { oggToMp3 } from '../lib/audio'
import { readFileSync } from 'fs'
;(async function () {
  const result = await oggToMp3(readFileSync('test.oga').buffer)
  console.log(result)
})()
