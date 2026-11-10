import { registerModule } from '#nexitas/server/utils/nexitas'
import { erratas } from '#self/server/core/module'

export default defineNitroPlugin(() => registerModule(erratas))
