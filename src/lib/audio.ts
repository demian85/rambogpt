import pathToFfmpeg from 'ffmpeg-static'
import { join } from 'path'
import { execSync } from 'child_process'

export async function oggToMp3(fileLink: string): Promise<string> {
  const outFile = join(__dirname, '__out.mp3')
  const path = `curl ${fileLink} --output - | ${pathToFfmpeg} -y -i pipe: -f mp3 ${outFile}`
  console.log(path)
  execSync(path)
  return outFile
}
