// electron-builder afterPack hook: runs after the app is laid out and before
// it is signed, so anything removed here never breaks a signature.
const { rmSync } = require('node:fs')
const path = require('node:path')

exports.default = async function afterPack(context) {
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  // The npm-installed Electron still carries its "drop an app here" shell.
  rmSync(path.join(app, 'Contents/Resources/default_app.asar'), { force: true })
}
