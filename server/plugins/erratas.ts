import { registerModule } from '#nexitas/server/utils/nexitas'
import { erratas } from '../core/module'

export default defineNitroPlugin(() => registerModule(erratas))
